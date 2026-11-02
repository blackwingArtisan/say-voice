/** Job records, kept in the kit's JSON store. Server only. */
import { randomUUID } from "node:crypto";
import { getApprovals } from "@/lib/agent/approvals";
import { getRun } from "@/lib/agent/runs";
import { HttpError } from "@/lib/http";
import { singleton } from "@/lib/singleton";
import { collection } from "@/lib/store/collection";
import { dueFromTranscript } from "./due";
import { extractJob } from "./extract";
import { priceBook } from "./price-store";
import { dayOf, whyNoReminder } from "./reminder-rules";
import type { Job, JobCustomer, JobSource, JobView, PendingApproval, ReminderRun, SpeechMeta } from "./types";

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
    heardLines: extracted.lines,
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

export const listStoredJobs = (): Job[] => jobs().list();

function pendingApproval(job: Job): PendingApproval | null {
  const pending = [job.runId, job.reminderRunId].flatMap((runId) => (runId ? getApprovals().list({ runId, state: "pending" }) : []))[0];
  if (!pending) return null;
  const note = (pending.input as { note?: string }).note;
  return { id: pending.id, summary: pending.summary, reason: pending.reason, amountValue: pending.amount?.value, note };
}

function reminderRun({ reminderRunId: id, reminders }: Job): ReminderRun | null {
  if (!id) return null;
  if (reminders?.some((r) => r.runId === id)) return { state: "sent" };
  const run = getRun(id);
  if (!run) return { state: "nothing_sent", reason: "The server restarted first." };
  if (run.status === "running") return { state: "working" };
  const decided = getApprovals().list({ runId: id })[0]?.state;
  if (decided === "denied") return { state: "nothing_sent", reason: "You declined it." };
  if (decided === "expired") return { state: "nothing_sent", reason: "Nobody approved it in time." };
  return { state: "nothing_sent", reason: run.error ?? (run.summary || "The agent stopped before proposing one.") };
}

export function viewJob(input: Job): JobView {
  let job = input;
  // The server restarted while the person was deciding: nothing was sent, so go back a step.
  if (job.status === "awaiting_approval" && !activeSends().has(job.id)) {
    job = saveJob({ ...job, status: "review", error: "The approval was lost when the server restarted. Press send again." });
  }
  return { ...job, approval: pendingApproval(job), priceBook: priceBook(), reminderRun: reminderRun(job), noReminderBecause: whyNoReminder(job.invoice, job.reminders, dayOf(new Date())) };
}

export function listJobs(): JobView[] {
  return jobs()
    .list()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(viewJob);
}
