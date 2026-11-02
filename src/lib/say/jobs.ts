/** Job records, kept in the kit's JSON store. Server only. */
import { randomUUID } from "node:crypto";
import { getApprovals } from "@/lib/agent/approvals";
import { HttpError } from "@/lib/http";
import { singleton } from "@/lib/singleton";
import { collection } from "@/lib/store/collection";
import { dueFromTranscript } from "./due";
import { extractJob } from "./extract";
import type { Job, JobCustomer, JobSource, JobView, PendingApproval, SpeechMeta } from "./types";

const jobs = () => collection<Job>("jobs");

/** Sends running in this process. A pending approval dies with the process. */
export const activeSends = () => singleton("say:active-sends", () => new Set<string>());

export async function createJob({ today, ...input }: { customer: JobCustomer; transcript: string; source: JobSource; speech?: SpeechMeta; today: string }): Promise<Job> {
  const extracted = await extractJob(input.transcript);
  const due = dueFromTranscript(input.transcript, today);
  return jobs().upsert({
    id: `job_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    status: "review",
    ...input,
    ...extracted,
    dueDate: due.date,
    dueSaid: due.said,
  });
}

export function requireJob(id: string): Job {
  const job = jobs().get(id);
  if (!job) throw new HttpError(404, `Job ${id} not found`, "not_found");
  return job;
}

export const saveJob = (job: Job): Job => jobs().upsert(job);

function pendingApproval(job: Job): PendingApproval | null {
  const pending = job.runId ? getApprovals().list({ runId: job.runId, state: "pending" })[0] : undefined;
  return pending ? { id: pending.id, summary: pending.summary, reason: pending.reason, amountValue: pending.amount?.value } : null;
}

export function viewJob(input: Job): JobView {
  let job = input;
  // The server restarted while the person was deciding: nothing was sent, so go back a step.
  if (job.status === "awaiting_approval" && !activeSends().has(job.id)) {
    job = saveJob({ ...job, status: "review", error: "The approval was lost when the server restarted. Press send again." });
  }
  return { ...job, approval: pendingApproval(job) };
}

export function listJobs(): JobView[] {
  return jobs()
    .list()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(viewJob);
}
