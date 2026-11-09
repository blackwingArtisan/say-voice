/**
 * The send. The person's checked job goes through the approval gate, then to PayPal. The route
 * returns while this waits, and the browser polls the job. The result is read back from PayPal,
 * so the screen shows what PayPal says and not what we asked for.
 */
import { randomUUID } from "node:crypto";
import { appConfig } from "@/app.config";
import { sendJobInvoice } from "@/agents/tools/send-job-invoice";
import { runTool, type ToolCallResult } from "@/lib/agent/execute";
import { Guard } from "@/lib/agent/guard";
import { withContext } from "@/lib/events/bus";
import { HttpError } from "@/lib/http";
import { toMinor } from "@/lib/money";
import { getPayPal } from "@/lib/paypal";
import type { PayPalApi } from "@/lib/paypal/api";
import { tradeNameFor } from "./business";
import { findChecks, openChecks, placesToCheck } from "./checks";
import { TEST_ADDRESS_REFUSED } from "./contacts";
import { activeSends, requireJob, saveJob } from "./jobs";
import { computeTotals, formatCents } from "./money";
import { bookForJob } from "./price-store";
import type { Job, JobCustomer, JobDetails, JobLine, SentInvoice } from "./types";

export interface CheckedJob {
  customer: JobCustomer;
  lines: JobLine[];
  taxRateMilli: number;
  details: JobDetails;
  dueDate: string;
  /** The checks the person looked at and let stand. */
  acknowledged: string[];
}

function failureReason(result: ToolCallResult): string {
  const outcome = result.outcome;
  if (outcome?.status === "denied" && outcome.code === "APPROVAL_DENIED") return "You declined, so nothing was sent.";
  if (outcome?.status === "denied" && outcome.code === "COUNTERPARTY_NOT_ALLOWED") return TEST_ADDRESS_REFUSED;
  if (outcome?.status === "denied") return outcome.reason;
  if (outcome?.status === "failed") return (outcome.error as Error)?.message ?? "PayPal call failed.";
  return result.content;
}

/** The record of a sent invoice comes from PayPal, and it has to match what was approved. */
export async function readInvoice(invoiceId: string, approvedCents: number, paypal: PayPalApi = getPayPal()): Promise<SentInvoice> {
  const invoice = await paypal.invoicing.get(invoiceId);
  const totalCents = toMinor(invoice.amount.value, "USD");
  if (totalCents !== approvedCents) throw new Error(`PayPal shows ${formatCents(totalCents)}, not the approved ${formatCents(approvedCents)}.`);
  const paid = invoice.payments?.paid_amount;
  const payment = invoice.payments?.transactions?.at(-1);
  return {
    id: invoice.id,
    number: invoice.detail.invoice_number,
    status: invoice.status,
    totalCents,
    dueCents: invoice.due_amount ? toMinor(invoice.due_amount.value, "USD") : totalCents,
    dueDate: invoice.detail.payment_term?.due_date,
    payerUrl: invoice.detail.metadata?.recipient_view_url,
    businessName: invoice.invoicer?.business_name,
    note: invoice.detail.note,
    taxCents: invoice.amount.breakdown?.tax_total ? toMinor(invoice.amount.breakdown.tax_total.value, "USD") : 0,
    readAt: new Date().toISOString(),
    paidCents: paid ? toMinor(paid.value, "USD") : undefined,
    paymentId: payment?.payment_id,
    paymentType: payment?.type,
    paidAt: payment?.payment_date,
  };
}

function backToReview(id: string, error: string) {
  saveJob({ ...requireJob(id), status: "review", error });
}

async function send(id: string, channel: string) {
  const job = requireJob(id);
  const ctx = { runId: job.runId!, actor: "tradesperson", channel, guard: new Guard({ paypal: getPayPal(), policy: appConfig.agentPolicy }) };
  const totalCents = computeTotals(job.lines, job.taxRateMilli).totalCents;
  const result = await runTool(
    sendJobInvoice,
    {
      customer_name: job.customer.name,
      customer_email: job.customer.email,
      lines: job.lines.map(({ name, quantityMilli, unitCents, description, taxed }) => ({ name, quantityMilli, unitCents, description: description || undefined, taxed })),
      tax_rate_milli: job.taxRateMilli,
      job_summary: job.details?.summary || undefined,
      job_site: job.details?.site || undefined,
      service_date: job.details?.serviceDate || undefined,
      due_date: job.dueDate,
      total_cents: totalCents,
      kept_checks: job.acknowledged ?? [],
      business_name: tradeNameFor(job.visitor),
      idempotency_key: job.id,
    },
    ctx,
  );
  if (result.isError) return backToReview(id, failureReason(result));
  const { invoice_id } = result.output as { invoice_id: string };
  const invoice = await readInvoice(invoice_id, totalCents);
  saveJob({ ...requireJob(id), status: "sent", error: undefined, invoice });
}

function start(id: string, channel: string, runId: string) {
  activeSends().add(id);
  return withContext({ channel, runId, actor: "tradesperson" }, () => send(id, channel))
    .catch((e) => backToReview(id, e instanceof Error ? e.message : String(e)))
    .finally(() => activeSends().delete(id));
}

/** Saves the person's checked job and sends it to the approval gate. Nothing goes out until they approve. */
export function requestSend(id: string, checked: CheckedJob, channel: string): { job: Job; finished: Promise<void> } {
  const job = requireJob(id);
  if (activeSends().has(id)) throw new HttpError(409, "This job is already being sent.", "conflict");
  if (job.status !== "review") throw new HttpError(409, `A job in status ${job.status} can't be sent.`, "conflict");
  const open = openChecks(findChecks({ ...job, ...checked, book: bookForJob(job) }), checked.acknowledged);
  if (open.length) throw new HttpError(409, `${placesToCheck(open)} still to check before this can go: ${open[0].text}`, "checks_open");
  const runId = `send_${randomUUID().slice(0, 12)}`;
  const saved = saveJob({ ...job, ...checked, status: "awaiting_approval", runId, error: undefined });
  return { job: saved, finished: start(id, channel, runId) };
}
