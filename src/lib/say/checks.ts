/**
 * What a person has to look at before an invoice can go. Shared, so the confirm screen shows the
 * same list the server enforces: the send is refused while one is open. A check closes when the
 * number changes or the person says it's right. Nothing here reads a confidence score: recognizer
 * confidence told us nothing in testing.
 */
import { lineCents, formatCents } from "./money";
import { isPriceDoubt } from "./flags";
import { farFromUsual, findEntry, itemKey, MIN_SAMPLES, soundAlike, usualCents, type PriceEntry } from "./price-book";
import { findMissingAmounts, heardFor } from "./spoken";
import type { JobFlag, JobLine } from "./types";

export type CheckKind = "far" | "flag" | "unheard" | "missing";

export interface Check {
  id: string;
  kind: CheckKind;
  /** The row it's about. Missing when it's about the whole job. */
  lineKey?: string;
  text: string;
  cents?: number;
  /** Far-off prices: what this item usually costs. */
  usualCents?: number;
  /** Far-off prices: a different price that sounds like the one heard, when there is one. */
  alikeCents?: number;
  excerpt?: string;
}

export interface CheckInput {
  transcript: string;
  /** The lines as first read from speech, before any edit. */
  heardLines: JobLine[];
  flags: JobFlag[];
  lines: JobLine[];
  taxRateMilli: number;
  book: PriceEntry[];
}

const FLAT_WORDS = /\bflat\b|\blump\b|\ball in\b|\bfor the (whole )?job\b/i;
const HOUR_WORDS = /\bhours?\b|\bhourly\b|\bhrs?\b/i;

/**
 * Flat-rate labor: one "Labor" line for the whole amount. The book's Labor price is an hourly rate,
 * so comparing the two would be a false alarm, and the flat amount mustn't teach it either. One
 * hour at a rate is not flat, so "an hour at sixteen" still gets checked.
 */
export function isFlatLabor(line: Pick<JobLine, "name" | "quantityMilli" | "unitCents">, transcript: string): boolean {
  if (line.quantityMilli !== 1000 || itemKey(line.name) !== "labor") return false;
  const said = heardFor(transcript, line) ?? transcript;
  return FLAT_WORDS.test(said) || !HOUR_WORDS.test(said);
}

/** What this item usually costs, once the book has enough invoices to say. */
function knownUsual(line: JobLine, book: PriceEntry[]): number | null {
  const entry = findEntry(line.name, book);
  return entry && entry.samples.length >= MIN_SAMPLES ? usualCents(entry.samples) : null;
}

function farCheck(line: JobLine, book: PriceEntry[], transcript: string): Check | null {
  if (isFlatLabor(line, transcript)) return null;
  const far = farFromUsual(line, book);
  if (!far) return null;
  const alike = soundAlike(line.unitCents);
  const usual = `Usually ${formatCents(far.usualCents)}, from ${far.samples} invoices. This says ${formatCents(line.unitCents)}.`;
  return {
    id: `far:${line.key}:${line.unitCents}`,
    kind: "far",
    lineKey: line.key,
    text: alike ? `${usual} "${alike.heard}" sounds like "${alike.said}".` : usual,
    cents: line.unitCents,
    usualCents: far.usualCents,
    alikeCents: alike && alike.cents !== far.usualCents ? alike.cents : undefined,
  };
}

const unchanged = (row: JobLine, before: JobLine) => row.unitCents === before.unitCents && row.quantityMilli === before.quantityMilli;

export function findChecks({ transcript, heardLines, flags, lines, taxRateMilli, book }: CheckInput): Check[] {
  const checks: Check[] = [];
  for (const line of lines) {
    const far = farCheck(line, book, transcript);
    if (far) checks.push(far);
  }
  flags.forEach((flag, i) => {
    const row = lines.find((line) => line.key === flag.lineKey);
    const before = heardLines.find((line) => line.key === flag.lineKey);
    if (row && before && !unchanged(row, before)) return; // the person changed the row it's about
    const aboutPrice = row !== undefined && isPriceDoubt(flag.text, row);
    // The AI's words differ from run to run. The book's check says it the same way every time.
    if (aboutPrice && checks.some((check) => check.kind === "far" && check.lineKey === row.key)) return;
    const usual = aboutPrice && !isFlatLabor(row, transcript) ? knownUsual(row, book) : null;
    checks.push({ id: `flag:${i}`, kind: "flag", lineKey: row?.key, text: usual ? `${flag.text} Usually ${formatCents(usual)}.` : flag.text });
  });
  for (const before of heardLines) {
    const row = lines.find((line) => line.key === before.key);
    if (!row || row.unitCents !== before.unitCents || heardFor(transcript, before)) continue;
    checks.push({ id: `unheard:${before.key}:${before.unitCents}`, kind: "unheard", lineKey: before.key, text: `${formatCents(before.unitCents)} on ${before.name} wasn't in what you said.`, cents: before.unitCents });
  }
  // A row the person corrected still accounts for what was heard. A row they deleted doesn't.
  const kept = heardLines.filter((line) => lines.some((row) => row.key === line.key));
  const corrected = new Set(kept.flatMap((line) => [line.unitCents, lineCents(line)]));
  for (const amount of findMissingAmounts(transcript, lines, taxRateMilli)) {
    if (corrected.has(amount.cents)) continue;
    checks.push({ id: `missing:${amount.cents}`, kind: "missing", text: `You said ${formatCents(amount.cents)} but no line item has that amount.`, cents: amount.cents, excerpt: amount.excerpt });
  }
  return checks;
}

export const openChecks = (checks: Check[], acknowledged: readonly string[]) => checks.filter((check) => !acknowledged.includes(check.id));

/** A row counts once, however many checks sit on it: one tap settles them all. */
export const placesToCheck = (open: Check[]) => new Set(open.map((check) => check.lineKey ?? check.id)).size;
