/**
 * What the trade is owed: the amount PayPal said is still due on each sent, unpaid invoice of this
 * browser's jobs. Plain code, never a figure the app worked out on its own.
 */
import { formatCents } from "./money";
import type { JobView } from "./types";

/** Sent and not yet paid in full. Paid, cancelled and refunded invoices aren't owed. */
const OWED = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"]);

export interface Owed {
  cents: number;
  invoices: number;
  /** Sent through this app at all, so a first visit shows nothing rather than "$0.00". */
  sent: number;
}

type Owing = Pick<JobView, "invoice"> & { example?: boolean };

export const isOwed = (job: Owing) => !job.example && !!job.invoice && OWED.has(job.invoice.status) && job.invoice.dueCents > 0;

export function owedSummary(jobs: Owing[]): Owed {
  const sent = jobs.filter((job) => job.invoice && !job.example);
  const owed = sent.filter(isOwed);
  return { cents: owed.reduce((sum, job) => sum + job.invoice!.dueCents, 0), invoices: owed.length, sent: sent.length };
}

/** "Owed $238.00 on 2 invoices" */
export const owedText = (owed: Owed) => (owed.invoices ? `Owed ${formatCents(owed.cents)} on ${owed.invoices} ${owed.invoices === 1 ? "invoice" : "invoices"}` : "Nothing owed");

/** Unpaid first, oldest debt at the top; then the rest in the order they came. */
export function owedFirst<T extends Owing & Pick<JobView, "createdAt">>(jobs: T[]): T[] {
  const owed = jobs.filter(isOwed).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...owed, ...jobs.filter((job) => !isOwed(job))];
}
