/** What may go in a reminder and when. Code, so no prompt can argue with it. Shared with the browser. */
import { formatCents } from "./money";
import { isPaid, type OwnerLine, type OwnerLineKind, type SentInvoice, type SentReminder } from "./types";

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

export const OWNER_LINE_NAME: Record<OwnerLineKind, string> = { late_fee: "Late fee", deposit: "Deposit paid" };

/** The figures a note may state: what PayPal's invoice will say once the person's own line is on it. */
export interface NoteFigures {
  dueCents: number;
  totalCents: number;
  ownerLine?: OwnerLine;
}

export function figuresWith(invoice: Pick<SentInvoice, "dueCents" | "totalCents">, ownerLine?: OwnerLine): NoteFigures {
  if (!ownerLine) return { dueCents: invoice.dueCents, totalCents: invoice.totalCents };
  if (ownerLine.kind === "late_fee") return { dueCents: invoice.dueCents + ownerLine.cents, totalCents: invoice.totalCents + ownerLine.cents, ownerLine };
  return { dueCents: invoice.dueCents - ownerLine.cents, totalCents: invoice.totalCents, ownerLine };
}

/** Why a late fee or deposit line can't be added, or null when it can. */
export function ownerLineProblem(line: OwnerLine, invoice: Pick<SentInvoice, "dueCents">): string | null {
  if (!Number.isInteger(line.cents) || line.cents <= 0) return "Enter an amount above $0.";
  if (line.kind === "late_fee" && line.cents > invoice.dueCents) return `A late fee above the amount due (${formatCents(invoice.dueCents)}) looks like a typo.`;
  if (line.kind === "deposit" && line.cents >= invoice.dueCents) return `A deposit has to be less than the ${formatCents(invoice.dueCents)} due. If it's all paid, there's nothing to remind.`;
  return null;
}

const HTML = /<\/?[a-z!][^>]*>|&(?:[a-z]+|#\d+);/i;
const MARKDOWN = /\*\*|__|~~|`|^\s{0,3}#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|\[[^\]]*\]\([^)]*\)/m;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;
const FEE_WORDS = /\b(?:late[\s-]*fees?|fees?|penalt(?:y|ies)|interest|surcharges?|finance charges?|charged extra)\b/i;
const DEPOSIT_WORDS = /\bdeposits?\b/i;

/** PayPal's email shows the note as plain text, so the customer would see the symbols. */
export function markupProblem(note: string): string | null {
  if (HTML.test(note)) return "The note has HTML in it. PayPal's email shows plain text, so the customer would see the tags.";
  if (MARKDOWN.test(note)) return "The note has formatting symbols (like ** or # or a list). PayPal's email shows them as they are, so write plain sentences.";
  if (EMOJI.test(note)) return "The note has an emoji. Keep it to plain words, the way you'd text a customer.";
  return null;
}

/** What the person typed, with any markup taken out, so it can go in word for word. */
export function plainAsk(ask: string): string {
  return ask
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The customer must never read a sum the invoice doesn't say, a link that isn't PayPal's button,
 * markup, or a fee or deposit the person didn't add. A fee only the note mentions isn't on PayPal's
 * invoice, so the customer would be asked for one amount and told another.
 */
export function noteProblem(note: string, invoice: Pick<SentInvoice, "dueCents" | "totalCents"> | NoteFigures): string | null {
  const figures: NoteFigures = "ownerLine" in invoice ? invoice : { dueCents: invoice.dueCents, totalCents: invoice.totalCents };
  if (/https?:\/\/|www\.|\b[\w-]+\.(?:com|net|org|io|co|me|link)\b/i.test(note)) return "The note can't contain a link. PayPal's email already has the pay button.";
  const markup = markupProblem(note);
  if (markup) return markup;
  const kind = figures.ownerLine?.kind;
  if (FEE_WORDS.test(note) && kind !== "late_fee")
    return "The AI wrote in a late fee you didn't set. PayPal's invoice has no fee on it, so the customer would be asked for one amount and told another. To charge one, add it under \"Your own line\".";
  if (DEPOSIT_WORDS.test(note) && kind !== "deposit")
    return "The AI mentioned a deposit PayPal's invoice doesn't show. If one was paid, add it under \"Your own line\" so PayPal records it.";
  const allowed = [figures.dueCents, figures.totalCents, ...(figures.ownerLine ? [figures.ownerLine.cents] : [])];
  const said = FIGURES.flatMap((pattern) => [...note.matchAll(pattern)].map((m) => toCents(m[1])));
  const wrong = said.find((cents) => !allowed.includes(cents));
  if (wrong !== undefined) return `The note says ${formatCents(wrong)}, but the amount due is ${formatCents(figures.dueCents)}.`;
  const words = FIGURES.reduce((text, pattern) => text.replace(pattern, ""), note);
  if (/\b(?:dollars?|bucks)\b/i.test(words)) return "Write the amount in figures, so it can be checked.";
  return null;
}

/**
 * Longer than the reminder agent's own 100 s work deadline plus a slow approval request. A run still
 * working after this, with nothing waiting on the person, is shown as not finished, never as a spinner,
 * and the person can ask again. It covers a hang the run's own deadline can't see.
 */
export const REMINDER_STALL_MS = 150_000;

export function runStalled(run: { status: string; startedAt: string }, waitingOnPerson: boolean, now = Date.now()): boolean {
  return run.status === "running" && !waitingOnPerson && now - Date.parse(run.startedAt) > REMINDER_STALL_MS;
}
