/**
 * The reminder agent's tools. The agent reads the invoice and writes the note. Code decides whether
 * a reminder may go, and the Guard stops send_payment_reminder at the approval gate
 * (requireApprovalFor in app.config.ts), so the customer hears nothing until the person says yes.
 */
import { z } from "zod";
import { getApprovals } from "@/lib/agent/approvals";
import { defineTool, type ToolContext } from "@/lib/agent/tool";
import { moneyFromMinor } from "@/lib/money";
import type { PayPalApi } from "@/lib/paypal/api";
import { requireJob, saveJob } from "@/lib/say/jobs";
import { formatCents } from "@/lib/say/money";
import { dayOf, MAX_NOTE_CHARS, noteProblem, remindersOn, whyNoReminder } from "@/lib/say/reminder-rules";
import { readInvoice } from "@/lib/say/send";

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
    return {
      customer_first_name: job.customer.name.split(/\s+/)[0],
      invoice_number: invoice.number,
      status: invoice.status,
      amount_due: formatCents(invoice.dueCents),
      due_date: invoice.dueDate,
      days_past_due: invoice.dueDate ? Math.max(0, daysBetween(invoice.dueDate, today)) : 0,
      reminders_sent: job.reminders?.length ?? 0,
      reminders_sent_today: remindersOn(today, job.reminders),
      can_remind: whyNot === null,
      why_not: whyNot ?? undefined,
    };
  },
});

/** Runs before the approval card and again after it, as the customer may pay in between. */
async function clearedToRemind(input: { job_id: string; note: string }, paypal: PayPalApi) {
  const { job, invoice } = await currentInvoice(input.job_id, paypal);
  const refused = whyNoReminder(invoice, job.reminders, dayOf(new Date())) ?? noteProblem(input.note, invoice);
  if (refused) throw new Error(refused);
  return { job, invoice };
}

export const sendPaymentReminder = defineTool({
  name: SEND_PAYMENT_REMINDER,
  description: "Propose a payment reminder for a job's unpaid invoice. The person reads the note and approves it before PayPal sends it. Refused if the invoice is paid, if the note states any other amount, or if it has a link.",
  risk: "money",
  schema: z.object({ job_id: z.string().min(1), note: z.string().trim().min(1).max(MAX_NOTE_CHARS).describe("What the customer reads. One to three short, plain sentences.") }),
  title: () => "Propose a payment reminder",
  impact: async (input, ctx) => {
    // One proposal a run: a no from the person ends it, however the note gets reworded.
    if (getApprovals().list({ runId: ctx.runId }).some((a) => a.tool === SEND_PAYMENT_REMINDER)) throw new Error("This was already put to the person. Stop here.");
    const { job, invoice } = await clearedToRemind(input, ctx.paypal);
    return {
      amount: moneyFromMinor(invoice.dueCents),
      counterparties: [job.customer.email],
      summary: `Remind ${job.customer.name} about invoice ${invoice.number}: ${formatCents(invoice.dueCents)} due`,
    };
  },
  execute: async (input, ctx: ToolContext) => {
    const { job, invoice } = await clearedToRemind(input, ctx.paypal);
    await ctx.paypal.invoicing.remind(invoice.id, { subject: `Reminder: invoice ${invoice.number}`, note: input.note, send_to_recipient: true });
    const latest = requireJob(job.id);
    saveJob({ ...latest, invoice: { ...invoice, paidEventId: latest.invoice?.paidEventId }, reminders: [...(latest.reminders ?? []), { sentAt: new Date().toISOString(), note: input.note, runId: ctx.runId }] });
    return { reminded: true, invoice_number: invoice.number, amount_due: formatCents(invoice.dueCents) };
  },
});
