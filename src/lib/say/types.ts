/** Job records. Shared by server and browser, so no Node imports. */
import type { InvoiceLine } from "./money";
import type { PriceEntry } from "./price-book";

export type JobStatus = "review" | "awaiting_approval" | "sent";
export type JobSource = "mic" | "sample";

export interface JobLine extends InvoiceLine {
  key: string;
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
  dueDate?: string;
  payerUrl?: string;
  readAt: string;
}

export interface SpeechMeta {
  mocked: boolean;
  model: string;
  durationSec?: number;
}

export interface Job {
  id: string;
  createdAt: string;
  status: JobStatus;
  source: JobSource;
  transcript: string;
  speech?: SpeechMeta;
  ai: { mocked: boolean; model?: string; costUsd: number };
  customer: JobCustomer;
  /** What the speech said the name was. Shown only: the invoice never uses it. */
  heardName?: string;
  lines: JobLine[];
  /** The lines as first read from speech. Later edits never touch these. */
  heardLines: JobLine[];
  taxRateMilli: number;
  dueDate: string;
  dueSaid: boolean;
  flags: JobFlag[];
  /** Checks the person looked at and let stand. */
  acknowledged?: string[];
  runId?: string;
  error?: string;
  invoice?: SentInvoice;
}

export interface PendingApproval {
  id: string;
  summary: string;
  reason?: string;
  amountValue?: string;
}

export interface JobView extends Job {
  approval: PendingApproval | null;
  priceBook: PriceEntry[];
}
