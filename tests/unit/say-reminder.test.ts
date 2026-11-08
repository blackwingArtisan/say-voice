import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { readJobInvoice, sendPaymentReminder } from "@/agents/tools/job-reminder";
import { ApprovalService, getApprovals } from "@/lib/agent/approvals";
import { AuditLog } from "@/lib/agent/audit";
import { Guard } from "@/lib/agent/guard";
import { IdempotencyStore } from "@/lib/agent/idempotency";
import { DailyMoneyCounter } from "@/lib/agent/policy";
import { getMockPayPal } from "@/lib/paypal";
import { MockPayPal } from "@/lib/paypal/mock";
import { requireJob, saveJob, viewJob } from "@/lib/say/jobs";
import { syncInvoice } from "@/lib/say/paid";
import { figuresWith, MAX_REMINDERS_A_DAY, markupProblem, noteProblem, ownerLineProblem, plainAsk, whyNoReminder } from "@/lib/say/reminder-rules";
import type { Job, SentInvoice } from "@/lib/say/types";

const invoiceAt = (status: string): SentInvoice => ({ id: "INV2", number: "0001", status, totalCents: 11_000, dueCents: 11_000, readAt: "2026-11-01T00:00:00.000Z" });

async function sentInvoice(paypal: MockPayPal) {
  const draft = await paypal.invoicing.create({
    detail: { currency_code: "USD" },
    primary_recipients: [{ billing_info: { name: { given_name: "Derek" }, email_address: "derek.evans@example.com" } }],
    items: [{ name: "Labor", quantity: "1", unit_amount: { currency_code: "USD", value: "110.00" } }],
  });
  await paypal.invoicing.send(draft.id);
  return draft.id;
}

function jobFor(invoiceId: string): Job {
  const id = `job_${invoiceId.slice(-8)}`;
  return saveJob({
    id,
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
    invoice: { ...invoiceAt("SENT"), id: invoiceId },
  });
}

describe("what a reminder may say", () => {
  const invoice = { dueCents: 11_000, totalCents: 15_000 };

  it("lets the amount due and the invoice total through", () => {
    expect(noteProblem("Hi Derek, $110.00 is still open on your $150 invoice.", invoice)).toBeNull();
    expect(noteProblem("Hi Derek, 110 dollars is still open.", invoice)).toBeNull();
    expect(noteProblem("Hi Derek, invoice 0042 is still open. Thanks!", invoice)).toBeNull();
  });

  it("refuses any other figure, however it's written", () => {
    expect(noteProblem("Hi Derek, $11.00 is due.", invoice)).toContain("$11.00");
    expect(noteProblem("Pay 90 bucks today and we're square.", invoice)).toContain("$90.00");
    expect(noteProblem("Hi Derek, one hundred ten dollars is due.", invoice)).toContain("figures");
  });

  it("refuses links", () => {
    expect(noteProblem("Pay here: https://pay-me-now.example", invoice)).toContain("link");
    expect(noteProblem("Pay at pay-me-now.com please", invoice)).toContain("link");
  });
});

describe("what the customer reads is plain words", () => {
  const invoice = { dueCents: 11_000, totalCents: 15_000 };

  it("refuses HTML, markdown and emoji the AI writes", () => {
    expect(noteProblem("Hi Derek, <b>$110.00</b> is due.", invoice)).toContain("HTML");
    expect(noteProblem("Hi Derek, &nbsp;$110.00 is due.", invoice)).toContain("HTML");
    expect(noteProblem("Hi Derek, **$110.00** is due.", invoice)).toContain("formatting");
    expect(noteProblem("# Reminder\nHi Derek, $110.00 is due.", invoice)).toContain("formatting");
    expect(noteProblem("Hi Derek:\n- $110.00 due", invoice)).toContain("formatting");
    expect(noteProblem("Hi Derek, see [PayPal](paypal) for $110.00.", invoice)).toContain("formatting");
    expect(noteProblem("Hi Derek, $110.00 is due 😀", invoice)).toContain("emoji");
    expect(noteProblem("Thanks! 👍🏽", invoice)).toContain("emoji");
    expect(markupProblem("Hi Derek, invoice 0042 for $110.00 is still open. Thanks!")).toBeNull();
  });

  it("refuses a late fee or a deposit the person didn't add, even with no figure", () => {
    expect(noteProblem("Hi Derek, $110.00 is due. There is also a late fee.", invoice)).toContain("late fee you didn't set");
    expect(noteProblem("Hi Derek, a $25 late fee applies.", invoice)).toContain("late fee you didn't set");
    expect(noteProblem("Hi Derek, interest will be charged.", invoice)).toContain("late fee");
    expect(noteProblem("Hi Derek, a penalty applies after Friday.", invoice)).toContain("late fee");
    expect(noteProblem("Hi Derek, thanks for the deposit.", invoice)).toContain("deposit");
  });

  it("lets the person's own late fee through, with the new amount due", () => {
    const fee = figuresWith(invoice, { kind: "late_fee", cents: 2_500 });
    expect(fee).toMatchObject({ dueCents: 13_500, totalCents: 17_500 });
    expect(noteProblem("Hi Derek, invoice 0042 for $135.00 is still open. That includes the $25.00 late fee.", fee)).toBeNull();
    expect(noteProblem("Hi Derek, $110.00 is still open, plus a late fee.", fee)).toContain("$110.00"); // the old amount is wrong once the fee is on
    expect(noteProblem("Hi Derek, $135.00 is open. That includes the $30.00 late fee.", fee)).toContain("$30.00");
    expect(noteProblem("Hi Derek, thanks for the deposit.", fee)).toContain("deposit");
  });

  it("lets the person's own deposit through, with what's left", () => {
    const deposit = figuresWith(invoice, { kind: "deposit", cents: 4_000 });
    expect(deposit).toMatchObject({ dueCents: 7_000, totalCents: 15_000 });
    expect(noteProblem("Hi Derek, thanks for the $40.00 deposit; $70.00 is left on invoice 0042.", deposit)).toBeNull();
    expect(noteProblem("Hi Derek, a late fee applies.", deposit)).toContain("late fee");
  });

  it("checks the person's own line too", () => {
    expect(ownerLineProblem({ kind: "late_fee", cents: 0 }, invoice)).toContain("above $0");
    expect(ownerLineProblem({ kind: "late_fee", cents: 20_000 }, invoice)).toContain("typo");
    expect(ownerLineProblem({ kind: "deposit", cents: 11_000 }, invoice)).toContain("less than");
    expect(ownerLineProblem({ kind: "deposit", cents: 4_000 }, invoice)).toBeNull();
    expect(ownerLineProblem({ kind: "late_fee", cents: 2_500 }, invoice)).toBeNull();
  });

  it("takes the markup out of what the person typed, so it can go in word for word", () => {
    expect(plainAsk("Add a $25 late fee. <b>bold</b> **x** 😀")).toBe("Add a $25 late fee. bold x");
    expect(plainAsk("## Thanks [for](http://x) the work")).toBe("Thanks for the work");
    expect(plainAsk("   ")).toBe("");
  });
});

describe("when a reminder may go", () => {
  const today = "2026-11-01";
  const sentToday = (n: number) => Array.from({ length: n }, (_, i) => ({ sentAt: `${today}T0${i}:00:00.000Z`, note: "n", runId: `r${i}` }));

  it("goes for an open invoice", () => {
    for (const status of ["SENT", "UNPAID", "PARTIALLY_PAID"]) expect(whyNoReminder(invoiceAt(status), [], today)).toBeNull();
  });

  it("never goes for a paid or cancelled invoice", () => {
    expect(whyNoReminder(invoiceAt("PAID"), [], today)).toContain("paid");
    expect(whyNoReminder(invoiceAt("MARKED_AS_PAID"), [], today)).toContain("paid");
    expect(whyNoReminder(invoiceAt("CANCELLED"), [], today)).toContain("CANCELLED");
    expect(whyNoReminder(undefined, [], today)).not.toBeNull();
  });

  it("stops at PayPal's daily limit and starts again the next day", () => {
    expect(whyNoReminder(invoiceAt("SENT"), sentToday(MAX_REMINDERS_A_DAY), today)).toContain("today");
    expect(whyNoReminder(invoiceAt("SENT"), sentToday(MAX_REMINDERS_A_DAY), "2026-11-02")).toBeNull();
  });
});

describe("the reminder tools behind the gate", () => {
  const note = "Hi Derek, $110.00 is still open. Thanks!";
  let paypal: MockPayPal;
  let approvals: ApprovalService;
  let guard: Guard;
  let job: Job;
  let remind: ReturnType<typeof vi.spyOn>;
  let runId: string;
  const ctx = () => ({ runId, actor: "agent:payment-reminder", channel: "test" });

  const decideNext = (decision: "approved" | "denied", before?: () => Promise<unknown>) => {
    // Only this test's run: a listener left over from the test before must not decide this one.
    const mine = runId;
    const off = approvals.onChange((a) => {
      if (a.state !== "pending" || a.runId !== mine) return;
      off();
      setTimeout(async () => {
        await before?.();
        approvals.decide(a.id, decision, "tester");
      }, 5);
    });
  };

  beforeEach(async () => {
    paypal = new MockPayPal();
    approvals = getApprovals();
    guard = new Guard({ paypal, policy: appConfig.agentPolicy, approvals, audit: new AuditLog(null), idempotency: new IdempotencyStore(null), daily: new DailyMoneyCounter(null) });
    job = jobFor(await sentInvoice(paypal));
    remind = vi.spyOn(paypal.invoicing, "remind");
    runId = `run_${Math.random()}`;
  });

  it("stops at the gate, then sends the note once approved", async () => {
    const asked = new Promise<unknown>((resolve) => {
      const off = approvals.onChange((a) => {
        if (a.state === "pending") {
          off();
          resolve(a.input);
        }
      });
    });
    const running = guard.run(sendPaymentReminder, { job_id: job.id, note }, ctx());
    expect(await asked).toMatchObject({ note });
    expect(remind).not.toHaveBeenCalled();
    approvals.decide(approvals.list({ runId, state: "pending" })[0].id, "approved", "tester");
    expect((await running).status).toBe("executed");
    expect(remind).toHaveBeenCalledTimes(1);
    expect(remind.mock.calls[0][1]).toMatchObject({ note, send_to_recipient: true });
    expect(requireJob(job.id).reminders).toMatchObject([{ note, runId }]);
    expect(viewJob(requireJob(job.id)).reminderRun).toBeNull();
  });

  it("sends nothing when the person declines", async () => {
    decideNext("denied");
    const outcome = await guard.run(sendPaymentReminder, { job_id: job.id, note }, ctx());
    expect(outcome).toMatchObject({ status: "denied", code: "APPROVAL_DENIED" });
    expect(remind).not.toHaveBeenCalled();
    expect(requireJob(job.id).reminders).toBeUndefined();
  });

  it("won't ask again in the same run after a no, however it's reworded", async () => {
    decideNext("denied");
    await guard.run(sendPaymentReminder, { job_id: job.id, note }, ctx());
    const pending = approvals.list({ state: "pending" }).length;
    const again = await guard.run(sendPaymentReminder, { job_id: job.id, note: "Hi Derek, please pay. $110.00." }, ctx());
    expect(again.status).toBe("failed");
    expect(approvals.list({ state: "pending" })).toHaveLength(pending);
    expect(remind).not.toHaveBeenCalled();
  });

  it("never shows the person a note with the wrong amount", async () => {
    const outcome = await guard.run(sendPaymentReminder, { job_id: job.id, note: "Hi Derek, $11.00 is still open." }, ctx());
    expect(outcome.status).toBe("failed");
    expect(approvals.list({ runId })).toEqual([]);
    expect(remind).not.toHaveBeenCalled();
  });

  it("refuses a paid invoice before the person is asked", async () => {
    await paypal.simulateInvoicePayment(job.invoice!.id);
    const outcome = await guard.run(sendPaymentReminder, { job_id: job.id, note }, ctx());
    expect(outcome.status).toBe("failed");
    expect(approvals.list({ runId })).toEqual([]);
    expect(remind).not.toHaveBeenCalled();
  });

  it("holds the reminder if the customer pays while the person is deciding", async () => {
    decideNext("approved", () => paypal.simulateInvoicePayment(job.invoice!.id));
    const outcome = await guard.run(sendPaymentReminder, { job_id: job.id, note }, ctx());
    expect(outcome.status).toBe("failed");
    expect(remind).not.toHaveBeenCalled();
  });

  it("stops at two a day", async () => {
    saveJob({ ...job, reminders: ["r1", "r2"].map((r) => ({ sentAt: new Date().toISOString(), note, runId: r })) });
    const outcome = await guard.run(sendPaymentReminder, { job_id: job.id, note }, ctx());
    expect(outcome.status).toBe("failed");
    expect(remind).not.toHaveBeenCalled();
  });

  it("puts the person's late fee on PayPal's invoice before the reminder, and checks PayPal's new total", async () => {
    saveJob({ ...requireJob(job.id), lines: [{ key: "l", name: "Labor", quantityMilli: 1000, unitCents: 11_000, taxed: false }], ownerLine: { kind: "late_fee", cents: 2_500 } });
    const read = await readJobInvoice.execute({ job_id: job.id }, { runId, actor: "a", paypal, idempotencyKey: "", requestId: "" });
    expect(read).toMatchObject({ amount_due: "$135.00", late_fee: "$25.00" });
    const asked = new Promise<{ summary: string }>((resolve) => {
      const off = approvals.onChange((a) => {
        if (a.state === "pending" && a.runId === runId) {
          off();
          resolve(a as unknown as { summary: string });
        }
      });
    });
    const feeNote = "Hi Derek, invoice 0001 for $135.00 is still open. That includes the $25.00 late fee.";
    const running = guard.run(sendPaymentReminder, { job_id: job.id, note: feeNote }, ctx());
    const card = await asked;
    expect(JSON.stringify(card)).toContain("Add a $25.00 late fee");
    expect((await paypal.invoicing.get(job.invoice!.id)).amount.value).toBe("110.00"); // nothing changes until the person says yes
    approvals.decide(approvals.list({ runId, state: "pending" })[0].id, "approved", "tester");
    expect((await running).status).toBe("executed");
    const onPayPal = await paypal.invoicing.get(job.invoice!.id);
    expect(onPayPal.amount.value).toBe("135.00");
    expect(onPayPal.items.map((i) => i.name)).toEqual(["Labor", "Late fee"]);
    expect(remind).toHaveBeenCalledTimes(1);
    const after = requireJob(job.id);
    expect(after.invoice).toMatchObject({ totalCents: 13_500, dueCents: 13_500 });
    expect(after.lines.map((l) => l.name)).toEqual(["Labor", "Late fee"]);
    expect(after.ownerLine).toBeUndefined();
    expect(after.ownerLinesApplied).toMatchObject([{ kind: "late_fee", cents: 2_500 }]);
  });

  it("records the person's deposit on PayPal's invoice before the reminder", async () => {
    saveJob({ ...requireJob(job.id), ownerLine: { kind: "deposit", cents: 4_000 } });
    decideNext("approved");
    const outcome = await guard.run(sendPaymentReminder, { job_id: job.id, note: "Hi Derek, thanks for the $40.00 deposit. $70.00 is left on invoice 0001." }, ctx());
    expect(outcome.status).toBe("executed");
    const onPayPal = await paypal.invoicing.get(job.invoice!.id);
    expect(onPayPal).toMatchObject({ status: "PARTIALLY_PAID", due_amount: { value: "70.00" } });
    expect(requireJob(job.id).invoice).toMatchObject({ totalCents: 11_000, dueCents: 7_000 });
  });

  it("stops the reminder if PayPal's new total isn't the one code worked out", async () => {
    saveJob({ ...requireJob(job.id), ownerLine: { kind: "late_fee", cents: 2_500 } });
    const real = paypal.invoicing.update;
    vi.spyOn(paypal.invoicing, "update").mockImplementation((id, body, q) => real(id, { ...body, items: [...body.items, { name: "Extra", quantity: "1", unit_amount: { currency_code: "USD", value: "1.00" } }] }, q));
    decideNext("approved");
    const outcome = await guard.run(sendPaymentReminder, { job_id: job.id, note: "Hi Derek, $135.00 is open, with the $25.00 late fee." }, ctx());
    expect(outcome.status).toBe("failed");
    expect(remind).not.toHaveBeenCalled();
  });

  it("never shows the person a note with a fee they didn't add", async () => {
    const outcome = await guard.run(sendPaymentReminder, { job_id: job.id, note: "Hi Derek, $110.00 is open. A late fee applies after Friday." }, ctx());
    expect(outcome.status).toBe("failed");
    expect(approvals.list({ runId })).toEqual([]);
    expect(requireJob(job.id).refusedNotes?.at(-1)?.reason).toContain("late fee you didn't set");
  });

  it("reads what PayPal says is owed", async () => {
    const read = await readJobInvoice.execute({ job_id: job.id }, { runId, actor: "a", paypal, idempotencyKey: "", requestId: "" });
    expect(read).toMatchObject({ customer_first_name: "Derek", amount_due: "$110.00", can_remind: true, reminders_sent: 0 });
  });
});

describe("paid status", () => {
  it("comes from a fresh read of PayPal, and remembers the event that told us", async () => {
    const paypal = getMockPayPal()!;
    const job = jobFor(await sentInvoice(paypal));
    expect((await syncInvoice(job.invoice!.id, "WH-too-early"))?.invoice).toMatchObject({ status: "SENT", paidEventId: undefined });

    await paypal.simulateInvoicePayment(job.invoice!.id);
    expect((await syncInvoice(job.invoice!.id, "WH-1"))?.invoice).toMatchObject({ status: "PAID", paidEventId: "WH-1", paidCents: 11_000, dueCents: 0, paymentType: "PAYPAL" });
    expect((await syncInvoice(job.invoice!.id, "WH-2"))?.invoice?.paidEventId).toBe("WH-1");
    expect(viewJob(requireJob(job.id)).noReminderBecause).toContain("paid");
  });

  it("ignores another app's invoice", async () => {
    expect(await syncInvoice("INV2-NOT-OURS", "WH-1")).toBeNull();
  });
});
