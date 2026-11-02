/**
 * The due date. The frozen extraction schema has no due-date field, and changing it would void
 * the sealed test results, so code reads the common spoken forms and the person can edit the rest.
 */
import { findNumbers } from "./spoken";

export const DEFAULT_DUE_DAYS = 14;

export interface DueDate {
  /** YYYY-MM-DD */
  date: string;
  /** False when nothing was said and this is the default. */
  said: boolean;
}

/** The person's calendar day. The server's clock runs on UTC, which is already tomorrow on a US evening. */
export const localDay = (now = new Date()) => now.toLocaleDateString("en-CA");

function addDays(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function saidDays(transcript: string): number | null {
  if (/\b(due|pay(able)?)\b[^.]*\b(on receipt|upon receipt|today|right away|immediately)\b/i.test(transcript)) return 0;
  for (const mention of findNumbers(transcript)) {
    const before = transcript.slice(Math.max(0, mention.start - 16), mention.start).toLowerCase();
    const after = transcript.slice(mention.end, mention.end + 8).toLowerCase();
    if (/\bnet\s+$/.test(before)) return mention.value;
    if (/\b(due in|due within|pay in|within|payable in)\s+$/.test(before)) {
      if (/^\s*days?\b/.test(after)) return mention.value;
      if (/^\s*weeks?\b/.test(after)) return mention.value * 7;
    }
  }
  return null;
}

export function dueFromTranscript(transcript: string, today: string): DueDate {
  const days = saidDays(transcript);
  return days === null ? { date: addDays(today, DEFAULT_DUE_DAYS), said: false } : { date: addDays(today, days), said: true };
}
