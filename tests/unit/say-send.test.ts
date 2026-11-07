import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { sendJobInvoice, type SendInvoiceInput } from "@/agents/tools/send-job-invoice";
import { ApprovalService } from "@/lib/agent/approvals";
import { AuditLog } from "@/lib/agent/audit";
import { Guard } from "@/lib/agent/guard";
import { IdempotencyStore } from "@/lib/agent/idempotency";
import { DailyMoneyCounter } from "@/lib/agent/policy";
import { MockPayPal } from "@/lib/paypal/mock";

const job: SendInvoiceInput = {
  customer_name: "Derek Evans",
  customer_email: "derek.evans@example.com",
  lines: [
    { name: "Labor", quantityMilli: 750, unitCents: 8000 },
    { name: "Heating element", quantityMilli: 1000, unitCents: 5000 },
  ],
  tax_rate_milli: 0,
  due_date: "2026-11-15",
  total_cents: 11_000,
  idempotency_key: "job-1",
};

let paypal: MockPayPal;
let approvals: ApprovalService;
let guard: Guard;
const ctx = { runId: "run", actor: "tradesperson", channel: "test" };

const decideNext = (decision: "approved" | "denied") => {
  const off = approvals.onChange((a) => {
    if (a.state === "pending") {
      off();
      setTimeout(() => approvals.decide(a.id, decision, "tester"), 5);
    }
  });
};

beforeEach(() => {
  paypal = new MockPayPal();
  approvals = new ApprovalService();
  guard = new Guard({ paypal, policy: appConfig.agentPolicy, approvals, audit: new AuditLog(null), idempotency: new IdempotencyStore(null), daily: new DailyMoneyCounter(null) });
});

describe("sending through the approval gate", () => {
  it("stops at the gate even for a small amount, and sends once approved", async () => {
    const create = vi.spyOn(paypal.invoicing, "create");
    const pending = new Promise<string | undefined>((resolve) => {
      const off = approvals.onChange((a) => {
        if (a.state !== "pending") return;
        off();
        const untouched = create.mock.calls.length === 0;
        setTimeout(() => {
          approvals.decide(a.id, "approved", "tester");
          resolve(untouched ? a.summary : undefined);
        }, 5);
      });
    });
    const out = await guard.run(sendJobInvoice, job, ctx);
    expect(await pending).toContain("$110.00");
    expect(out.status).toBe("executed");
    const { invoice_id } = (out as { result: { invoice_id: string } }).result;
    const invoice = await paypal.invoicing.get(invoice_id);
    expect(invoice.status).toBe("SENT");
    expect(invoice.amount.value).toBe("110.00");
    expect(invoice.detail.payment_term?.due_date).toBe("2026-11-15");
  });

  it("creates nothing at PayPal when declined, and lets the person send again", async () => {
    const create = vi.spyOn(paypal.invoicing, "create");
    decideNext("denied");
    expect(await guard.run(sendJobInvoice, job, ctx)).toMatchObject({ status: "denied", code: "APPROVAL_DENIED" });
    expect(create).not.toHaveBeenCalled();
    decideNext("approved");
    expect((await guard.run(sendJobInvoice, job, ctx)).status).toBe("executed");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never invoices the same job twice", async () => {
    const create = vi.spyOn(paypal.invoicing, "create");
    decideNext("approved");
    await guard.run(sendJobInvoice, job, ctx);
    expect(await guard.run(sendJobInvoice, job, ctx)).toMatchObject({ status: "executed", replayed: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("refuses a total the code didn't work out", async () => {
    const create = vi.spyOn(paypal.invoicing, "create");
    decideNext("approved");
    const out = await guard.run(sendJobInvoice, { ...job, total_cents: 7500 }, ctx);
    expect(out.status).toBe("failed");
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to send when PayPal's total differs from the approved one", async () => {
    const send = vi.spyOn(paypal.invoicing, "send");
    const create = paypal.invoicing.create.bind(paypal.invoicing);
    vi.spyOn(paypal.invoicing, "create").mockImplementation(async (body) => ({ ...(await create(body)), amount: { currency_code: "USD", value: "110.01" } }));
    decideNext("approved");
    const out = await guard.run(sendJobInvoice, job, ctx);
    expect(out.status).toBe("failed");
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks a customer outside the allowed test addresses", async () => {
    expect(await guard.run(sendJobInvoice, { ...job, customer_email: "someone@realdomain.test" }, ctx)).toMatchObject({ status: "denied" });
  });
});
