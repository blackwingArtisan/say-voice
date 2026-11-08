/**
 * A finished sample job, so a first visit doesn't open on empty screens. It's the sample job, with
 * the misheard $15 put right, sent through the same approval gate as any job and then paid: on
 * mock PayPal by its simulated payer, on the sandbox recorded as paid by check (only a buyer can
 * pay through PayPal itself). Every visitor sees it, labelled Sample. Made once, when the server
 * starts (the host's health check is the first request). Server only.
 */
import { getApprovals } from "@/lib/agent/approvals";
import { getMockPayPal, getPayPal } from "@/lib/paypal";
import { findChecks, openChecks } from "./checks";
import { contactById } from "./contacts";
import { savedSampleWording } from "./describe";
import { dueFromTranscript } from "./due";
import { savedSampleReading } from "./extract";
import { listStoredJobs, requireJob, saveJob } from "./jobs";
import { syncInvoice } from "./paid";
import { priceBook } from "./price-store";
import { dayOf } from "./reminder-rules";
import { SAMPLE_AMOUNTS, SAMPLE_CONTACT_ID, SAMPLE_TRANSCRIPT } from "./sample";
import { requestSend } from "./send";
import { isPaid, type Job } from "./types";

export const EXAMPLE_JOB_ID = "job_sample";
/** Who approved it, on the approval record and in Activity. */
export const EXAMPLE_APPROVER = "Sample job, approved when the demo started";

let making: Promise<Job | null> | null = null;

export const exampleJob = (): Job | null => listStoredJobs().find((j) => j.id === EXAMPLE_JOB_ID) ?? null;

async function pay(job: Job): Promise<Job | null> {
  const invoice = job.invoice!;
  const mock = getMockPayPal();
  if (mock) await mock.simulateInvoicePayment(invoice.id);
  else await getPayPal().invoicing.recordPayment(invoice.id, { method: "CHECK", payment_date: dayOf(new Date()), amount: { currency_code: "USD", value: (invoice.totalCents / 100).toFixed(2) }, note: "Paid by check" });
  return syncInvoice(invoice.id);
}

async function make(): Promise<Job | null> {
  const existing = exampleJob();
  if (existing?.invoice && existing.status === "sent") return isPaid(existing.invoice) ? existing : pay(existing);
  const contact = contactById(SAMPLE_CONTACT_ID)!;
  const today = dayOf(new Date());
  const read = savedSampleReading();
  const described = savedSampleWording(SAMPLE_TRANSCRIPT, read.lines, today);
  // The person's one fix: "fifteen" was fifty.
  const fixed = described.lines.map((line) => (line.unitCents === SAMPLE_AMOUNTS.heardElementCents ? { ...line, unitCents: SAMPLE_AMOUNTS.spokenElementCents } : line));
  const due = dueFromTranscript(SAMPLE_TRANSCRIPT, today);
  const job = saveJob({
    id: EXAMPLE_JOB_ID,
    createdAt: new Date().toISOString(),
    status: "review",
    source: "sample",
    example: true,
    transcript: SAMPLE_TRANSCRIPT,
    ai: read.ai,
    customer: { name: contact.name, email: contact.email },
    lines: fixed,
    heardLines: described.lines,
    taxRateMilli: 0,
    details: described.details,
    aiWording: described.aiWording,
    describer: described.ai,
    dueDate: due.date,
    dueSaid: due.said,
    flags: [...read.flags, ...described.flags],
  });
  const approvals = getApprovals();
  const off = approvals.onChange((a) => {
    if (a.state === "pending" && a.runId === requireJob(EXAMPLE_JOB_ID).runId) {
      off();
      setTimeout(() => approvals.decide(a.id, "approved", EXAMPLE_APPROVER), 0);
    }
  });
  try {
    // The person looked at whatever else was raised and let it stand, as they would on the confirm screen.
    const checked = { customer: job.customer, lines: job.lines, taxRateMilli: 0, details: job.details!, dueDate: job.dueDate, acknowledged: [] as string[] };
    checked.acknowledged = openChecks(findChecks({ ...job, ...checked, book: priceBook(undefined) }), []).map((check) => check.id);
    const { finished } = requestSend(job.id, checked, "sample");
    await finished;
  } finally {
    off();
  }
  const sent = requireJob(EXAMPLE_JOB_ID);
  return sent.status === "sent" && sent.invoice ? pay(sent) : null;
}

/** Makes the sample job once per store. A second call while one is being made waits for it. */
export function ensureExampleJob(): Promise<Job | null> {
  making ??= make().finally(() => {
    making = null;
  });
  return making;
}

let lastFailure = 0;
/** A failed try waits this long before the next, so a PayPal outage isn't hit on every status check. */
const RETRY_MS = 5 * 60_000;

/** Starts making the sample job if it isn't there yet, without waiting for it. */
export function kickExampleJob() {
  if (making || isPaid(exampleJob()?.invoice) || Date.now() - lastFailure < RETRY_MS) return;
  void ensureExampleJob()
    .then((job) => {
      if (!job) lastFailure = Date.now();
    })
    .catch((e: unknown) => {
      lastFailure = Date.now();
      console.error(`The sample job wasn't made: ${e instanceof Error ? e.message : String(e)}`);
    });
}
