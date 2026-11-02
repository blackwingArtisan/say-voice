/**
 * Keeps a sent job in step with PayPal. An event only says something changed: its copy of the
 * invoice can be stale, so the status always comes from a fresh read.
 */
import { listStoredJobs, requireJob, saveJob } from "./jobs";
import { readInvoice } from "./send";
import { isPaid, type Job } from "./types";

export async function syncInvoice(invoiceId: string, eventId?: string): Promise<Job | null> {
  const job = listStoredJobs().find((j) => j.invoice?.id === invoiceId);
  if (!job?.invoice) return null;
  const invoice = await readInvoice(invoiceId, job.invoice.totalCents);
  const paidEventId = isPaid(invoice) ? (job.invoice.paidEventId ?? eventId) : undefined;
  return saveJob({ ...requireJob(job.id), invoice: { ...invoice, paidEventId } }); // the read took a moment, so the job may have moved on
}
