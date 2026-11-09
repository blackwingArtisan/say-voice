import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { reminderAgent } from "@/agents/reminder";
import { GET_INVOICE, invoiceSummary, SEARCH_INVOICING, toolkitReads } from "@/agents/tools/toolkit-reads";
import { getApprovals } from "@/lib/agent/approvals";
import { AuditLog } from "@/lib/agent/audit";
import { Guard } from "@/lib/agent/guard";
import { IdempotencyStore } from "@/lib/agent/idempotency";
import { DailyMoneyCounter } from "@/lib/agent/policy";
import type { TimelineStep } from "@/lib/events/types";
import { MockPayPal } from "@/lib/paypal/mock";
import { saveJob } from "@/lib/say/jobs";
import { plainAudit, plainSteps } from "@/lib/say/plain-steps";

async function sentInvoice(paypal: MockPayPal, email = "derek.evans@example.com") {
  const draft = await paypal.invoicing.create({
    detail: { currency_code: "USD" },
    primary_recipients: [{ billing_info: { name: { given_name: "Derek" }, email_address: email } }],
    items: [
      { name: "Labor", quantity: "0.75", unit_amount: { currency_code: "USD", value: "80.00" } },
      { name: "Heating element", quantity: "1", unit_amount: { currency_code: "USD", value: "50.00" } },
    ],
  });
  await paypal.invoicing.send(draft.id);
  return paypal.invoicing.get(draft.id);
}

function jobFor(id: string, number: string) {
  return saveJob({
    id: `job_${id.slice(-8)}`,
    createdAt: new Date().toISOString(),
    status: "sent",
    source: "sample",
    transcript: "",
    ai: { mocked: true, costUsd: 0 },
    customer: { name: "Derek Evans", email: "derek.evans@example.com" },
    lines: [],
    heardLines: [],
    taxRateMilli: 0,
    dueDate: "2026-11-15",
    dueSaid: false,
    flags: [],
    invoice: { id, number, status: "SENT", totalCents: 11_000, dueCents: 11_000, readAt: new Date().toISOString() },
  });
}

describe("the reminder agent's reads through PayPal's Agent Toolkit", () => {
  let paypal: MockPayPal;
  let guard: Guard;
  let audit: AuditLog;
  const ctx = () => ({ runId: "run_reads", actor: "agent:payment-reminder", channel: "test" });
  const [search, get] = toolkitReads("mock");

  beforeEach(() => {
    paypal = new MockPayPal();
    audit = new AuditLog(null);
    guard = new Guard({ paypal, policy: appConfig.agentPolicy, approvals: getApprovals(), audit, idempotency: new IdempotencyStore(null), daily: new DailyMoneyCounter(null) });
  });

  it("are the toolkit's own tools, read-only, and on the reminder agent", () => {
    expect([search.name, get.name]).toEqual([SEARCH_INVOICING, GET_INVOICE]);
    expect([search.source, get.source]).toEqual(["paypal-agent-toolkit", "paypal-agent-toolkit"]);
    expect([search.risk, get.risk]).toEqual(["read", "read"]);
    expect(reminderAgent.tools().map((t) => t.name)).toEqual(["read_job_invoice", SEARCH_INVOICING, GET_INVOICE, "send_payment_reminder"]);
  });

  it("find the job's invoice by its number, then read it, through the Guard, with the work but not the unit prices", async () => {
    const invoice = await sentInvoice(paypal);
    await sentInvoice(paypal); // another invoice on the account: not a job here
    jobFor(invoice.id, invoice.detail.invoice_number);
    const found = await guard.run(search, { resource_type: "invoice", invoice_filters: { invoice_number: invoice.detail.invoice_number } }, ctx());
    expect(found.status).toBe("executed");
    const { invoices } = (found as { result: { invoices: { invoice_id: string }[] } }).result;
    expect(invoices.map((i) => i.invoice_id)).toEqual([invoice.id]);
    const read = await guard.run(get, { invoice_id: invoice.id }, ctx());
    expect((read as { result: unknown }).result).toEqual({ invoice_id: invoice.id, invoice_number: invoice.detail.invoice_number, status: "SENT", total: "$110.00", amount_due: "$110.00", due_date: undefined, work: ["Labor × 0.75", "Heating element"] });
    expect(JSON.stringify((read as { result: unknown }).result)).not.toContain("80.00");
    // Both are on the record, as reads that ran.
    expect(audit.list().filter((e) => e.action === "tool.executed").map((e) => e.tool)).toEqual([SEARCH_INVOICING, GET_INVOICE]);
  });

  it("refuse an invoice that isn't on a job here, before PayPal is asked", async () => {
    const other = await sentInvoice(paypal, "someone.else@example.com");
    const spy = vi.spyOn(paypal.invoicing, "get");
    expect((await guard.run(get, { invoice_id: other.id }, ctx())).status).toBe("failed");
    // By number: refused, or (if a job here happens to share the number) nothing that isn't a job's invoice comes back.
    const byNumber = await guard.run(search, { resource_type: "invoice", invoice_filters: { invoice_number: other.detail.invoice_number } }, ctx());
    expect(JSON.stringify(byNumber)).not.toContain(other.id);
    expect((await guard.run(search, { resource_type: "invoice", invoice_filters: { recipient_email: "someone.else@example.com" } }, ctx())).status).toBe("failed");
    expect(spy).not.toHaveBeenCalled();
    expect(audit.list().filter((e) => e.action === "tool.failed").length).toBeGreaterThanOrEqual(2);
  });

  it("cut a raw PayPal invoice to what a note needs", () => {
    expect(invoiceSummary({ id: "INV2-X", status: "UNPAID", detail: { invoice_number: "0042", payment_term: { due_date: "2026-11-23" } }, amount: { value: "128.00" }, due_amount: { value: "128.00" }, items: [{ name: "Thermal fuse", quantity: "1" }] })).toEqual({
      invoice_id: "INV2-X",
      invoice_number: "0042",
      status: "UNPAID",
      total: "$128.00",
      amount_due: "$128.00",
      due_date: "2026-11-23",
      work: ["Thermal fuse"],
    });
  });
});

describe("the toolkit reads in plain words", () => {
  const at = (s: number) => `2026-11-09T12:00:0${s}.000Z`;
  const step = (s: Partial<TimelineStep>): TimelineStep => ({ id: "e", stepId: Math.random().toString(36), channel: "c", ts: at(0), startedAt: at(0), updatedAt: at(0), history: [], kind: "info", status: "succeeded", title: "", ...s });

  it("say what the agent found, carry the toolkit tool for its chip, and fold the PayPal call inside into it", () => {
    const steps = [
      step({ kind: "tool", title: "Search PayPal for invoice 0042", startedAt: at(1), updatedAt: at(3), tool: { name: SEARCH_INVOICING, source: "paypal-agent-toolkit" } }),
      step({ kind: "paypal", title: "List invoices", startedAt: at(2), paypal: { operation: "invoicing.list", method: "GET", path: "/v2/invoicing/invoices", mode: "mock" } }),
      step({ kind: "tool", title: "Look up invoice INV2-X", startedAt: at(4), updatedAt: at(6), tool: { name: GET_INVOICE, source: "paypal-agent-toolkit" } }),
      step({ kind: "paypal", title: "Agent Toolkit · get_invoice", startedAt: at(5), paypal: { operation: "toolkit.get_invoice", method: "TOOLKIT", path: "get_invoice", mode: "sandbox" } }),
      step({ kind: "paypal", title: "Get invoice", startedAt: at(7), paypal: { operation: "invoicing.get", method: "GET", path: "/v2/invoicing/invoices/x", mode: "mock" } }),
    ];
    expect(plainSteps(steps).map((p) => [p.text, p.toolkit])).toEqual([
      ["The reminder agent found the invoice on PayPal", SEARCH_INVOICING],
      ["The reminder agent read the invoice and the work on it from PayPal", GET_INVOICE],
      ["Read the invoice back from PayPal", undefined],
    ]);
  });

  it("put the reads on Activity", () => {
    const entry = (action: string, tool: string) => ({ seq: 1, ts: at(0), action, actor: "agent", tool, prevHash: "", hash: "" }) as Parameters<typeof plainAudit>[0];
    expect(plainAudit(entry("tool.executed", GET_INVOICE))).toBe("The reminder agent read the invoice and the work on it from PayPal, through PayPal's Agent Toolkit.");
    expect(plainAudit(entry("tool.executed", SEARCH_INVOICING))).toBe("The reminder agent found the invoice on PayPal, through PayPal's Agent Toolkit.");
    expect(plainAudit(entry("tool.requested", GET_INVOICE))).toBeNull();
  });
});
