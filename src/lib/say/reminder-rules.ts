/** What may go in a reminder and when. Code, so no prompt can argue with it. Shared with the browser. */
import { formatCents } from "./money";
import { isPaid, type SentInvoice, type SentReminder } from "./types";

/** PayPal's own limit. */
export const MAX_REMINDERS_A_DAY = 2;
export const MAX_NOTE_CHARS = 500;

const OWED = ["SENT", "UNPAID", "PARTIALLY_PAID"];

export const dayOf = (date: Date) => date.toISOString().slice(0, 10);

export const remindersOn = (day: string, reminders: SentReminder[] = []) => reminders.filter((r) => r.sentAt.startsWith(day)).length;

export function whyNoReminder(invoice: SentInvoice | undefined, reminders: SentReminder[] | undefined, today: string): string | null {
  if (!invoice) return "This invoice hasn't gone out yet.";
  if (isPaid(invoice)) return "This invoice is paid, so there's nothing to chase.";
  if (!OWED.includes(invoice.status)) return `PayPal has this invoice as ${invoice.status}, so a reminder can't go out.`;
  if (remindersOn(today, reminders) >= MAX_REMINDERS_A_DAY) return `${MAX_REMINDERS_A_DAY} reminders already went out today. Try again tomorrow.`;
  return null;
}

const FIGURES = [/\$\s*(\d[\d,]*(?:\.\d+)?)/g, /\b(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|bucks|usd)\b/gi];

const toCents = (figure: string) => Math.round(Number(figure.replace(/,/g, "")) * 100);

/** The customer must never read a sum the invoice doesn't say, or a link that isn't PayPal's button. */
export function noteProblem(note: string, invoice: Pick<SentInvoice, "dueCents" | "totalCents">): string | null {
  if (/https?:\/\/|www\.|\b[\w-]+\.(?:com|net|org|io|co|me|link)\b/i.test(note)) return "The note can't contain a link. PayPal's email already has the pay button.";
  const said = FIGURES.flatMap((pattern) => [...note.matchAll(pattern)].map((m) => toCents(m[1])));
  const wrong = said.find((cents) => cents !== invoice.dueCents && cents !== invoice.totalCents);
  if (wrong !== undefined) return `The note says ${formatCents(wrong)}, but the amount due is ${formatCents(invoice.dueCents)}.`;
  const words = FIGURES.reduce((text, pattern) => text.replace(pattern, ""), note);
  if (/\b(?:dollars?|bucks)\b/i.test(words)) return "Write the amount in figures, so it can be checked.";
  return null;
}
