/** Job records. Shared by server and browser, so no Node imports. */
import type { InvoiceLine } from "./money";
import type { PriceEntry } from "./price-book";

export type JobStatus = "review" | "awaiting_approval" | "sent";
export type JobSource = "mic" | "sample";

export interface JobLine extends InvoiceLine {
  key: string;
  /** What this charge covers, in words the customer reads on the invoice. */
  description?: string;
}

/** What the job was, where and when: the note at the top of the customer's invoice. */
export interface JobDetails {
  summary: string;
  site: string;
  /** YYYY-MM-DD, only when the speaker said when. */
  serviceDate: string;
}

/** The words the AI wrote, kept so a word it made up can be told from one the person typed. */
export interface AiWording {
  summary: string;
  site: string;
  lines: Record<string, string>;
}

export interface JobFlag {
  text: string;
  /** The row this flag is about. Missing when it's about the whole job. */
  lineKey?: string;
}

export interface JobCustomer {
  name: string;
  email: string;
}

export interface SentInvoice {
  id: string;
  number: string;
  /** All re-read from PayPal after sending, never taken from what we asked for. */
  status: string;
  totalCents: number;
  /** What's still owed. Zero once it's paid. */
  dueCents: number;
  dueDate?: string;
  payerUrl?: string;
  /** The trade name on it, as PayPal shows the customer. */
  businessName?: string;
  readAt: string;
  /** The note to the customer and the tax, as PayPal has them. */
  note?: string;
  taxCents?: number;
  /** PayPal's record of the payment, once there is one. */
  paidCents?: number;
  paymentId?: string;
  paymentType?: string;
  paidAt?: string;
  /** The verified webhook event that told us. */
  paidEventId?: string;
}

/** MARKED_AS_PAID means someone recorded it by hand, so the screen says so. */
export const isPaidStatus = (status: string) => status === "PAID" || status === "MARKED_AS_PAID";
export const isPaid = (invoice?: SentInvoice) => !!invoice && isPaidStatus(invoice.status);

/** A line only the person can add to a reminder. Code puts it on PayPal's invoice before the reminder goes. */
export type OwnerLineKind = "late_fee" | "deposit";
export interface OwnerLine {
  kind: OwnerLineKind;
  cents: number;
}

export interface SentReminder {
  sentAt: string;
  note: string;
  runId: string;
}

export interface SpeechMeta {
  mocked: boolean;
  model: string;
  durationSec?: number;
}

export interface Job {
  id: string;
  createdAt: string;
  /** When the words reached the app (the recording's arrival, or the sample's start). Missing on older jobs. */
  saidAt?: string;
  status: JobStatus;
  source: JobSource;
  transcript: string;
  speech?: SpeechMeta;
  /** saved: the AI budget ran out, so the sample used its stored reading. */
  ai: { mocked: boolean; model?: string; costUsd: number; saved?: boolean };
  /** The browser that made this job. Its jobs and prices are its own, not shared with every visitor. */
  visitor?: string;
  /** The finished sample every visitor sees on a first visit (src/lib/say/example-job.ts). */
  example?: boolean;
  /** Checked as on a trade's first day: no demo prices and no PayPal history, so only the sound-alike check can speak. */
  dayOne?: boolean;
  customer: JobCustomer;
  /** What the speech said the name was. Shown only: the invoice never uses it. */
  heardName?: string;
  lines: JobLine[];
  /** The lines as first read from speech. Later edits never touch these. */
  heardLines: JobLine[];
  taxRateMilli: number;
  /** Missing on jobs made before invoices carried these. */
  details?: JobDetails;
  aiWording?: AiWording;
  /** The second AI call, which wrote the words. */
  describer?: { mocked: boolean; model?: string; costUsd: number };
  dueDate: string;
  dueSaid: boolean;
  flags: JobFlag[];
  /** Checks the person looked at and let stand. */
  acknowledged?: string[];
  runId?: string;
  error?: string;
  invoice?: SentInvoice;
  reminders?: SentReminder[];
  reminderRunId?: string;
  /** What the person asked the reminder agent to add, if anything. */
  reminderAsk?: string;
  /** The late fee or deposit the person asked for with this reminder. Cleared once it's on PayPal's invoice. */
  ownerLine?: OwnerLine;
  /** Late fees and deposits already on PayPal's invoice. */
  ownerLinesApplied?: (OwnerLine & { at: string; paymentId?: string })[];
  /** Notes the agent proposed that code refused before any approval card. */
  refusedNotes?: { at: string; note: string; reason: string; runId: string }[];
}

export interface PendingApproval {
  id: string;
  summary: string;
  reason?: string;
  amountValue?: string;
  /** The words a reminder would say, so the person reads them before approving. */
  note?: string;
}

/** Where the last reminder got to. */
export interface ReminderRun {
  state: "working" | "sent" | "nothing_sent";
  /** Why nothing went out. */
  reason?: string;
}

export interface JobView extends Job {
  approval: PendingApproval | null;
  priceBook: PriceEntry[];
  reminderRun: ReminderRun | null;
  /** Why no reminder can go right now. Null when one can. */
  noReminderBecause: string | null;
  /** Seconds from the words reaching the app to PayPal sending the invoice, from the audit log. */
  saidToSentSec?: number;
}
