/**
 * The reminder agent's tools. The agent reads the invoice and writes the note. Code decides whether
 * a reminder may go, and the Guard stops send_payment_reminder at the approval gate
 * (requireApprovalFor in app.config.ts), so the customer hears nothing until the person says yes.
 */
import { z } from "zod";
import { toolkitInvoicing } from "@/lib/say/toolkit-invoicing";
import { getApprovals } from "@/lib/agent/approvals";
import { defineTool, type ToolContext } from "@/lib/agent/tool";
import { moneyFromMinor } from "@/lib/money";
import type { PayPalApi } from "@/lib/paypal/api";
import { invoiceReplaceBody } from "@/lib/paypal/invoice-body";
import { requireJob, saveJob } from "@/lib/say/jobs";
import { formatCents } from "@/lib/say/money";
import { dayOf, figuresWith, MAX_NOTE_CHARS, noteProblem, OWNER_LINE_NAME, ownerLineProblem, remindersOn, whyNoReminder } from "@/lib/say/reminder-rules";
import { readInvoice } from "@/lib/say/send";
import type { Job, OwnerLine, SentInvoice } from "@/lib/say/types";

export const READ_JOB_INVOICE = "read_job_invoice";
export const SEND_PAYMENT_REMINDER = "send_payment_reminder";

/** Always a fresh read: the customer may have paid a minute ago. */
async function currentInvoice(jobId: string, paypal: PayPalApi) {
  const job = requireJob(jobId);
  if (!job.invoice) throw new Error("This job has no invoice yet.");
  return { job, invoice: await readInvoice(job.invoice.id, job.invoice.totalCents, paypal) };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export const readJobInvoice = defineTool({
  name: READ_JOB_INVOICE,
  description: "Read a job's invoice from PayPal: amount due, due date, status, and whether a reminder can go.",
  risk: "read",
  schema: z.object({ job_id: z.string().min(1) }),
  title: () => "Read the invoice from PayPal",
  execute: async ({ job_id }, ctx) => {
    const { job, invoice } = await currentInvoice(job_id, ctx.paypal);
    const today = dayOf(new Date());
    const whyNot = whyNoReminder(invoice, job.reminders, today);
    const figures = figuresWith(invoice, job.ownerLine);
    return {
      customer_first_name: job.customer.name.split(/\s+/)[0],
      invoice_number: invoice.number,
      status: invoice.status,
      amount_due: formatCents(figures.dueCents),
      ...(job.ownerLine?.kind === "late_fee" ? { late_fee: formatCents(job.ownerLine.cents), owner_line: "The person added this late fee. It goes on PayPal's invoice before the reminder, and amount_due includes it." } : {}),
      ...(job.ownerLine?.kind === "deposit" ? { deposit_paid: formatCents(job.ownerLine.cents), owner_line: "The person says this deposit was paid. PayPal records it before the reminder, and amount_due is what's left." } : {}),
      due_date: invoice.dueDate,
      days_past_due: invoice.dueDate ? Math.max(0, daysBetween(invoice.dueDate, today)) : 0,
      reminders_sent: job.reminders?.length ?? 0,
      reminders_sent_today: remindersOn(today, job.reminders),
      person_asked: job.reminderAsk || undefined,
      can_remind: whyNot === null,
      why_not: whyNot ?? undefined,
    };
  },
});

/**
 * Runs before the approval card and again after it, as the customer may pay in between. A note that
 * states the wrong figure is kept on the job, so the person sees what code stopped.
 */
async function clearedToRemind(input: { job_id: string; note: string }, paypal: PayPalApi, runId: string) {
  const { job, invoice } = await currentInvoice(input.job_id, paypal);
  const refused = whyNoReminder(invoice, job.reminders, dayOf(new Date())) ?? (job.ownerLine ? ownerLineProblem(job.ownerLine, invoice) : null) ?? noteProblem(input.note, figuresWith(invoice, job.ownerLine));
  if (refused) {
    const latest = requireJob(job.id);
    saveJob({ ...latest, refusedNotes: [...(latest.refusedNotes ?? []), { at: new Date().toISOString(), note: input.note, reason: refused, runId }] });
    throw new Error(refused);
  }
  return { job, invoice };
}

/**
 * Puts the person's late fee or deposit on PayPal's invoice, then reads it back. Code checks
 * PayPal's new figure against the one it worked out; a mismatch stops the reminder.
 */
async function applyOwnerLine(job: Job, invoice: SentInvoice, line: OwnerLine, paypal: PayPalApi): Promise<{ job: Job; invoice: SentInvoice }> {
  const expected = figuresWith(invoice, line);
  let paymentId: string | undefined;
  if (line.kind === "late_fee") {
    const current = await paypal.invoicing.get(invoice.id);
    const fee = { name: OWNER_LINE_NAME.late_fee, quantity: "1", unit_amount: { currency_code: "USD", value: moneyFromMinor(line.cents).value }, description: `Added ${dayOf(new Date())}` };
    await paypal.invoicing.update(invoice.id, invoiceReplaceBody(current, { items: [...current.items, fee] }));
  } else {
    ({ payment_id: paymentId } = await paypal.invoicing.recordPayment(invoice.id, { method: "OTHER", type: "EXTERNAL", payment_date: dayOf(new Date()), amount: moneyFromMinor(line.cents), note: OWNER_LINE_NAME.deposit }));
  }
  const fresh = await readInvoice(invoice.id, expected.totalCents, paypal);
  if (fresh.dueCents !== expected.dueCents) throw new Error(`PayPal shows ${formatCents(fresh.dueCents)} due, not the ${formatCents(expected.dueCents)} worked out. The reminder didn't go.`);
  const latest = requireJob(job.id);
  const feeLine = { key: `late-fee-${Date.now().toString(36)}`, name: OWNER_LINE_NAME.late_fee, quantityMilli: 1000, unitCents: line.cents, taxed: false, description: `Added ${dayOf(new Date())}` };
  const saved = saveJob({
    ...latest,
    invoice: { ...fresh, paidEventId: latest.invoice?.paidEventId },
    lines: line.kind === "late_fee" ? [...latest.lines, feeLine] : latest.lines,
    ownerLine: undefined,
    ownerLinesApplied: [...(latest.ownerLinesApplied ?? []), { ...line, at: new Date().toISOString(), paymentId }],
  });
  return { job: saved, invoice: fresh };
}

export const sendPaymentReminder = defineTool({
  name: SEND_PAYMENT_REMINDER,
  description: "Propose a payment reminder for a job's unpaid invoice. The person reads the note and approves it before PayPal sends it. Refused if the invoice is paid, if the note states any other amount, has a link, HTML, markdown or emoji, or mentions a fee or deposit the person didn't add.",
  risk: "money",
  schema: z.object({ job_id: z.string().min(1), note: z.string().trim().min(1).max(MAX_NOTE_CHARS).describe("What the customer reads. One to three short, plain sentences.") }),
  title: () => "Propose a payment reminder",
  impact: async (input, ctx) => {
    // One proposal a run: a no from the person ends it, however the note gets reworded.
    if (getApprovals().list({ runId: ctx.runId }).some((a) => a.tool === SEND_PAYMENT_REMINDER)) throw new Error("This was already put to the person. Stop here.");
    const { job, invoice } = await clearedToRemind(input, ctx.paypal, ctx.runId);
    const figures = figuresWith(invoice, job.ownerLine);
    const owner = job.ownerLine;
    const due = formatCents(figures.dueCents);
    const summary = !owner
      ? `Remind ${job.customer.name} about invoice ${invoice.number}: ${due} due`
      : owner.kind === "late_fee"
        ? `Add a ${formatCents(owner.cents)} late fee to invoice ${invoice.number}, then remind ${job.customer.name}: ${due} due`
        : `Record a ${formatCents(owner.cents)} deposit on invoice ${invoice.number}, then remind ${job.customer.name}: ${due} left to pay`;
    return { amount: moneyFromMinor(figures.dueCents), counterparties: [job.customer.email], summary };
  },
  execute: async (input, ctx: ToolContext) => {
    const cleared = await clearedToRemind(input, ctx.paypal, ctx.runId);
    const { job, invoice } = cleared.job.ownerLine ? await applyOwnerLine(cleared.job, cleared.invoice, cleared.job.ownerLine, ctx.paypal) : cleared;
    await toolkitInvoicing(ctx).remind(invoice.id, `Reminder: invoice ${invoice.number}`, input.note);
    const latest = requireJob(job.id);
    saveJob({ ...latest, invoice: { ...invoice, paidEventId: latest.invoice?.paidEventId }, reminders: [...(latest.reminders ?? []), { sentAt: new Date().toISOString(), note: input.note, runId: ctx.runId }] });
    return { reminded: true, invoice_number: invoice.number, amount_due: formatCents(invoice.dueCents) };
  },
});
