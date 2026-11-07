/** Job records, kept in the kit's JSON store. Server only. */
import { randomUUID } from "node:crypto";
import { getApprovals } from "@/lib/agent/approvals";
import { getRun } from "@/lib/agent/runs";
import { AiBudgetExceededError, AiCreditError } from "@/lib/ai/errors";
import { HttpError } from "@/lib/http";
import { singleton } from "@/lib/singleton";
import { collection } from "@/lib/store/collection";
import { describeJob, savedSampleWording, undescribed } from "./describe";
import { dueFromTranscript } from "./due";
import { extractJob, savedSampleReading, type ExtractedJob } from "./extract";
import { priceBook } from "./price-store";
import { dayOf, whyNoReminder } from "./reminder-rules";
import { rateWasSaid, taxedLineKeys } from "./tax";
import type { Job, JobCustomer, JobSource, JobView, PendingApproval, ReminderRun, SpeechMeta } from "./types";

const jobs = () => collection<Job>("jobs");

/** Sends running in this process. A pending approval dies with the process. */
export const activeSends = () => singleton("say:active-sends", () => new Set<string>());

interface NewJob {
  customer: JobCustomer;
  transcript: string;
  source: JobSource;
  speech?: SpeechMeta;
  today: string;
  visitor?: string;
}

async function readJob({ source, transcript }: NewJob) {
  try {
    return await extractJob(transcript);
  } catch (error) {
    if (source === "sample" && (error instanceof AiBudgetExceededError || error instanceof AiCreditError)) return savedSampleReading();
    throw error;
  }
}

/** The second call writes the words. If it can't, the job still opens and the person writes them. */
async function describe({ source, transcript, today }: NewJob, extracted: ExtractedJob) {
  try {
    return await describeJob(transcript, extracted.lines, today);
  } catch (error) {
    const outOfBudget = error instanceof AiBudgetExceededError || error instanceof AiCreditError;
    if (outOfBudget && source === "sample") return savedSampleWording(transcript, extracted.lines, today);
    return undescribed(extracted.lines, outOfBudget ? "The AI is out of budget for now, so nothing was written for the customer." : "The AI couldn't write the descriptions this time.");
  }
}

/**
 * Tax: a rate counts only if it was said, so the AI never picks one. "Plus tax" after one amount
 * taxes that line only, as a suggestion the person can change.
 */
function withTax(transcript: string, extracted: ExtractedJob): ExtractedJob {
  const taxed = taxedLineKeys(transcript, extracted.lines);
  return {
    ...extracted,
    taxRateMilli: rateWasSaid(transcript, extracted.taxRateMilli) ? extracted.taxRateMilli : 0,
    lines: extracted.lines.map((line) => ({ ...line, taxed: taxed ? taxed.has(line.key) : true })),
  };
}

export async function createJob({ today, ...input }: NewJob): Promise<Job> {
  const extracted = withTax(input.transcript, await readJob({ today, ...input }));
  const described = await describe({ today, ...input }, extracted);
  const due = dueFromTranscript(input.transcript, today);
  return jobs().upsert({
    id: `job_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    status: "review",
    ...input,
    ...extracted,
    lines: described.lines,
    heardLines: described.lines,
    flags: [...extracted.flags, ...described.flags],
    details: described.details,
    aiWording: described.aiWording,
    describer: described.ai,
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
  return { state: "nothing_sent", reason: run.error ? agentFailure(run.error) : run.summary || "The agent stopped before proposing one." };
}

/** Run errors are raw API text, and that's no use to a person. */
const agentFailure = (error: string) => (/spend cap|run out of credit/i.test(error) ? "The AI is out of credit for now, so try again later." : "The AI didn't finish, so try again.");

export function viewJob(input: Job): JobView {
  let job = input;
  // The server restarted while the person was deciding: nothing was sent, so go back a step.
  if (job.status === "awaiting_approval" && !activeSends().has(job.id)) {
    job = saveJob({ ...job, status: "review", error: "The approval was lost when the server restarted. Press send again." });
  }
  return { ...job, approval: pendingApproval(job), priceBook: priceBook(job.visitor), reminderRun: reminderRun(job), noReminderBecause: whyNoReminder(job.invoice, job.reminders, dayOf(new Date())) };
}

export function listJobs(visitor?: string): JobView[] {
  return jobs()
    .list()
    .filter((job) => job.visitor === visitor)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(viewJob);
}
