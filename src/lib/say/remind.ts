/** Starts the reminder agent. The route returns at once and the browser follows the job. */
import { reminderAgent } from "@/agents/reminder";
import { getRun, startAgentRun } from "@/lib/agent/runs";
import { HttpError } from "@/lib/http";
import { requireJob, saveJob } from "./jobs";
import { syncInvoice } from "./paid";
import { dayOf, whyNoReminder } from "./reminder-rules";
import { isPaid, type Job } from "./types";

export async function requestReminder(id: string, channel: string): Promise<Job> {
  const job = requireJob(id);
  if (!job.invoice) throw new HttpError(409, "This job has no invoice yet.", "conflict");
  if (job.reminderRunId && getRun(job.reminderRunId)?.status === "running") throw new HttpError(409, "A reminder is already being drafted.", "conflict");
  // PayPal may know about a payment that no webhook has told us of yet.
  const fresh = (await syncInvoice(job.invoice.id)) ?? job;
  if (isPaid(fresh.invoice)) return fresh;
  const refused = whyNoReminder(fresh.invoice, fresh.reminders, dayOf(new Date()));
  if (refused) throw new HttpError(409, refused, "conflict");
  const run = startAgentRun(reminderAgent, { goal: `Propose a payment reminder for job ${id}.`, context: { job_id: id } }, { channel });
  return saveJob({ ...fresh, reminderRunId: run.id });
}
