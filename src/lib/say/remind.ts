/** Starts the reminder agent. The route returns at once and the browser follows the job. */
import { reminderAgent } from "@/agents/reminder";
import { getApprovals } from "@/lib/agent/approvals";
import { getRun, startAgentRun } from "@/lib/agent/runs";
import { HttpError } from "@/lib/http";
import { requireJob, saveJob } from "./jobs";
import { syncInvoice } from "./paid";
import { dayOf, ownerLineProblem, plainAsk, runStalled, whyNoReminder } from "./reminder-rules";
import { isPaid, type Job, type OwnerLine } from "./types";

/** `ask` goes in the note word for word, without markup. `ownerLine` is a late fee or deposit only the person can add. */
export async function requestReminder(id: string, channel: string, ask?: string, ownerLine?: OwnerLine): Promise<Job> {
  const job = requireJob(id);
  if (!job.invoice) throw new HttpError(409, "This job has no invoice yet.", "conflict");
  const before = job.reminderRunId ? getRun(job.reminderRunId) : undefined;
  // One that stalled was shown as not finished, so asking again starts afresh.
  const waiting = !!before && getApprovals().list({ runId: before.id, state: "pending" }).length > 0;
  if (before?.status === "running" && !runStalled(before, waiting)) throw new HttpError(409, "A reminder is already being drafted.", "conflict");
  // PayPal may know about a payment that no webhook has told us of yet.
  const fresh = (await syncInvoice(job.invoice.id)) ?? job;
  if (isPaid(fresh.invoice)) return fresh;
  const refused = whyNoReminder(fresh.invoice, fresh.reminders, dayOf(new Date()));
  if (refused) throw new HttpError(409, refused, "conflict");
  const lineRefused = ownerLine ? ownerLineProblem(ownerLine, fresh.invoice!) : null;
  if (lineRefused) throw new HttpError(422, lineRefused, "invalid_request");
  const asked = plainAsk(ask ?? "") || undefined;
  saveJob({ ...requireJob(id), reminderAsk: asked, ownerLine });
  const run = startAgentRun(reminderAgent, { goal: `Propose a payment reminder for job ${id}.`, context: { job_id: id, ask: asked, owner_line: ownerLine } }, { channel });
  return saveJob({ ...requireJob(id), reminderRunId: run.id });
}
