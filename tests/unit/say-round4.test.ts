import { beforeEach, describe, expect, it } from "vitest";
import { appConfig } from "@/app.config";
import { sendPaymentReminder } from "@/agents/tools/job-reminder";
import { invoiceRequest } from "@/agents/tools/send-job-invoice";
import { ApprovalService, getApprovals } from "@/lib/agent/approvals";
import { AuditLog } from "@/lib/agent/audit";
import { Guard } from "@/lib/agent/guard";
import { IdempotencyStore } from "@/lib/agent/idempotency";
import { DailyMoneyCounter } from "@/lib/agent/policy";
import { MockPayPal } from "@/lib/paypal/mock";
import { applyDescription } from "@/lib/say/describe";
import { requireJob, saveJob } from "@/lib/say/jobs";
import { SAMPLE_TRANSCRIPT } from "@/lib/say/sample";
import { untaxedLineKeys } from "@/lib/say/tax";
import type { JobLine } from "@/lib/say/types";
import { withoutRepeatedSentences, withoutRepeatedTail } from "@/lib/say/wording";

const line = (key: string, name: string, quantityMilli: number, unitCents: number) => ({ key, name, quantityMilli, unitCents }) as JobLine;

describe("no tax on this one", () => {
  const lines = [line("a", "Labor", 750, 8_000), line("b", "Heating element", 1_000, 1_500)];

  it("leaves every line untaxed when no tax was asked for anywhere", () => {
    expect(untaxedLineKeys(SAMPLE_TRANSCRIPT, lines)).toBe("all");
  });

  it("leaves only the line it was said after untaxed when tax was asked for elsewhere", () => {
    const said = "Labor three quarters of an hour at eighty an hour, plus tax. Heating element fifteen dollars, no tax on this one.";
    expect(untaxedLineKeys(said, lines)).toEqual(new Set(["b"]));
  });

  it("says nothing when no-tax wasn't said", () => {
    expect(untaxedLineKeys("Labor at eighty an hour plus tax.", lines)).toBeNull();
  });
});

describe("no description repeats itself", () => {
  const materials = "Laminated shingles approximately 10 years old, ice and water guard underlayment AKA Bituthene, valley liner.";

  it("takes a phrase off the end of the summary when a line already says it", () => {
    expect(withoutRepeatedTail("Roof leak repair: valley replacement on laminated shingles approximately 10 years old.", [materials])).toBe("Roof leak repair: valley replacement");
  });

  it("keeps a summary that shares only a word or two", () => {
    expect(withoutRepeatedTail("Roof leak repair on the valley", [materials])).toBe("Roof leak repair on the valley");
  });

  it("keeps a sentence said twice in one description once", () => {
    expect(withoutRepeatedSentences("New heating element. It runs hot again. New heating element.")).toBe("New heating element. It runs hot again.");
  });

  it("applies both when the AI's words are merged onto the lines", () => {
    const transcript = "Roof leak repair, valley replacement on laminated shingles approximately 10 years old. Materials two hundred, laminated shingles approximately 10 years old, valley liner.";
    const out = applyDescription(
      { job_summary: "Roof leak repair: valley replacement on laminated shingles approximately 10 years old", job_site: "", service_date: "", service_date_words: "", parts_heard: [], lines: [{ id: "m", description: "Laminated shingles approximately 10 years old, valley liner. Valley liner." }] },
      [line("m", "Materials", 1_000, 20_000)],
      transcript,
      "2026-11-07",
    );
    expect(out.details.summary).toBe("Roof leak repair: valley replacement");
    expect(out.lines[0].description).toBe("Laminated shingles approximately 10 years old, valley liner.");
  });
});

describe("the customer's invoice comes from the trade", () => {
  it("names the business, not PayPal's sandbox default", () => {
    const req = invoiceRequest({ customer_name: "Derek Evans", customer_email: "derek.evans@example.com", lines: [{ name: "Labor", quantityMilli: 1_000, unitCents: 11_000 }], tax_rate_milli: 0, due_date: "2026-11-21", total_cents: 11_000, idempotency_key: "k" });
    expect(req.invoicer?.business_name).toBe(appConfig.tradeName);
  });
});

describe("the guard is seen refusing", () => {
  let paypal: MockPayPal;
  let approvals: ApprovalService;
  let guard: Guard;
  const runId = `run_${Math.random()}`;
  const ctx = () => ({ runId, actor: "agent:payment-reminder", channel: "test", guard });

  beforeEach(async () => {
    paypal = new MockPayPal();
    approvals = getApprovals();
    guard = new Guard({ paypal, policy: appConfig.agentPolicy, approvals, audit: new AuditLog(null), idempotency: new IdempotencyStore(null), daily: new DailyMoneyCounter(null) });
  });

  it("refuses a late fee the invoice doesn't have before any card, keeps it on the job, then sends the corrected note once approved", async () => {
    const draft = await paypal.invoicing.create({ detail: { currency_code: "USD" }, primary_recipients: [{ billing_info: { email_address: "derek.evans@example.com" } }], items: [{ name: "Labor", quantity: "1", unit_amount: { currency_code: "USD", value: "110.00" } }] });
    await paypal.invoicing.send(draft.id);
    const job = saveJob({ id: `job_r4${draft.id.slice(-6)}`, createdAt: new Date().toISOString(), status: "sent", source: "sample", transcript: "", ai: { mocked: true, costUsd: 0 }, customer: { name: "Derek Evans", email: "derek.evans@example.com" }, lines: [], heardLines: [], taxRateMilli: 0, dueDate: "2026-11-21", dueSaid: false, flags: [], reminderRunId: runId, invoice: { id: draft.id, number: draft.detail.invoice_number, status: "SENT", totalCents: 11_000, dueCents: 11_000, readAt: new Date().toISOString() } });

    const pendingBefore = approvals.list({ state: "pending" }).length;
    const wrong = await guard.run(sendPaymentReminder, { job_id: job.id, note: "Hi Derek, invoice 0001 for $110.00 is open. There is also a $25 late fee." }, ctx());
    expect(wrong.status).toBe("failed");
    expect(approvals.list({ state: "pending" })).toHaveLength(pendingBefore);
    expect(requireJob(job.id).refusedNotes).toMatchObject([{ runId, reason: "The note says $25.00, but the amount due is $110.00." }]);

    const off = approvals.onChange((a) => {
      if (a.state === "pending" && a.runId === runId) {
        off();
        setTimeout(() => approvals.decide(a.id, "approved", "tester"), 5);
      }
    });
    const corrected = await guard.run(sendPaymentReminder, { job_id: job.id, note: "Hi Derek, invoice 0001 for $110.00 is still open. Thanks!" }, ctx());
    expect(corrected.status).toBe("executed");
    expect(requireJob(job.id).reminders).toHaveLength(1);
  });
});
