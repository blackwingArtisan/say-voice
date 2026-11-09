/**
 * Whose record /api/audit and /api/paypal/ledger show. Like Activity: this browser's own jobs and the shared sample, nobody
 * else's. Opening "For judges" sets a cookie that shows the whole record, real addresses still hidden. It's a tidiness scope
 * on a demo site, not a login, the same as the visitor id.
 */
import { listStoredJobs } from "./jobs";
import { JUDGES_COOKIE, visitorOf } from "./visitor";
import type { Job } from "./types";

export const seesWholeRecord = (req: Request) => new RegExp(`(?:^|;\\s*)${JUDGES_COOKIE}=1(?:;|$)`).test(req.headers.get("cookie") ?? "");

/** Every agent run a job has had: the send, each reminder, and any note the code refused. */
export const runsOfJob = (job: Job) => [job.runId, job.reminderRunId, ...(job.reminders ?? []).map((r) => r.runId), ...(job.refusedNotes ?? []).map((r) => r.runId)].filter((id): id is string => !!id);

/** The agent runs and PayPal invoices that belong to the asking browser's jobs and the sample. */
export function ownRecord(req: Request) {
  const visitor = visitorOf(req);
  const own = listStoredJobs().filter((job) => job.example || (!!visitor && job.visitor === visitor));
  return { runIds: new Set(own.flatMap(runsOfJob)), paypalIds: new Set(own.flatMap((job) => (job.invoice ? [job.invoice.id] : []))) };
}

/** Anyone can read these pages, so a real address someone typed stays out of them. The stored record is untouched. */
const REAL_ADDRESS = /[\w.+-]+@(?!(?:personal\.|business\.)?example\.com\b)[\w-]+(?:\.[\w-]+)+/gi;
export const hideAddresses = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(REAL_ADDRESS, "[address hidden]"));
