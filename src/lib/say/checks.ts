/**
 * What a person has to look at before an invoice can go. Shared, so the confirm screen shows the
 * same list the server enforces: the send is refused while one is open. A check closes when the
 * number changes or the person says it's right. Nothing here reads a confidence score: recognizer
 * confidence told us nothing in testing.
 */
import { lineCents, formatCents } from "./money";
import { isPriceDoubt } from "./flags";
import { farFromUsual, findEntry, itemKey, MIN_SAMPLES, provenance, soundAlike, usualCents, type PriceEntry } from "./price-book";
import { findMissingAmounts, heardFor } from "./spoken";
import { rateChoices, rateSpoken, stateFor, taxSaid, type RateChoice } from "./tax";
import type { AiWording, JobDetails, JobFlag, JobLine } from "./types";
import { inventedWords, isGenericName, wordsKey } from "./wording";

export type CheckKind = "far" | "flag" | "unheard" | "missing" | "vague" | "words" | "tax";

/** Checks only an edit can close: a generic line needs words, not a tap. */
const MUST_FIX: CheckKind[] = ["vague"];

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
  /** Unsaid words: which text they're in. */
  field?: "summary" | "site" | "description";
  /** Tax said with no rate: the state heard, and its one-tap rates. */
  state?: string;
  choices?: RateChoice[];
}

export interface CheckInput {
  transcript: string;
  /** The lines as first read from speech, before any edit. */
  heardLines: JobLine[];
  flags: JobFlag[];
  lines: JobLine[];
  taxRateMilli: number;
  book: PriceEntry[];
  details?: JobDetails;
  aiWording?: AiWording;
}

const FLAT_WORDS = /\bflat\b|\blump\b|\ball in\b|\bfor the (whole )?job\b/i;
const HOUR_WORDS = /\bhours?\b|\bhourly\b|\bhrs?\b/i;
/** How long it took, not what an hour costs: "about three hours", "took me five hours", "approximately an hour". */
const TIME_ESTIMATE = /\b(?:about|approximately|approx|around|roughly|nearly|almost|maybe|probably|took|spent)\b(?:\s+[\w-]+){0,5}?\s+(?:hours?|hrs?)\b/i;
const AMOUNT_WORD = "\\d|\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|bucks|dollars)";
/** A price for each hour: "sixteen an hour", "per hour", "hourly", "three hours at ninety". */
const RATE_WORDS = new RegExp(`(?:${AMOUNT_WORD})\\s+(?:an?|per|each|every)\\s+(?:hour|hr)\\b|\\bper\\s+(?:hour|hr)\\b|\\bhourly\\b|/\\s*hr\\b|\\b(?:hours?|hrs?)\\s+at\\b`, "i");

/**
 * Flat-rate labor: one "Labor" line for the whole amount. The book's Labor price is an hourly rate,
 * so comparing the two would be a false alarm, and the flat amount mustn't teach it either. One
 * hour at a rate is not flat, so "an hour at sixteen" still gets checked. Hours said as an estimate
 * next to the amount ("about three hours, four hundred labor") are how long it took, so that's flat.
 */
export function isFlatLabor(line: Pick<JobLine, "name" | "quantityMilli" | "unitCents">, transcript: string): boolean {
  if (line.quantityMilli !== 1000 || itemKey(line.name) !== "labor") return false;
  const said = heardFor(transcript, line) ?? transcript;
  return FLAT_WORDS.test(said) || !HOUR_WORDS.test(said) || (TIME_ESTIMATE.test(said) && !RATE_WORDS.test(said));
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
  // Where the usual price came from, said the same way as the price book: "from 6 PayPal invoices, last $50.00".
  const entry = findEntry(line.name, book);
  const source = entry?.paypal ? provenance(entry) : `from ${far.samples} invoices`;
  const usual = `Usually ${formatCents(far.usualCents)}, ${source}. This says ${formatCents(line.unitCents)}.`;
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

/** Tax was said but no rate: hold the send until a rate is tapped or typed, or "No tax". */
function taxCheck(transcript: string, lines: JobLine[], taxRateMilli: number): Check | null {
  if (!taxSaid(transcript) || taxRateMilli > 0 || !lines.some((line) => line.taxed !== false)) return null;
  const state = stateFor(transcript);
  const where = state ? `${state.name} rates below, from the state tables. Check your local rate.` : "Check your local rate.";
  return { id: "tax:rate", kind: "tax", text: `You said tax but no rate. ${where}`, state: state?.name, choices: rateChoices(state) };
}

/** Words the AI wrote that weren't said: a made-up part or piece of work gets a look before it goes. */
function wordChecks(lines: JobLine[], details: JobDetails | undefined, wording: AiWording | undefined, transcript: string): Check[] {
  if (!wording) return [];
  const checks: Check[] = [];
  const add = (words: string[], field: Check["field"], where: string, lineKey?: string) => {
    if (!words.length) return;
    const list = words.map((w) => `"${w}"`).join(", ");
    checks.push({ id: `words:${lineKey ?? field}:${wordsKey(words)}`, kind: "words", field, lineKey, text: `${list} in the ${where} ${words.length === 1 ? "wasn't" : "weren't"} in what you said.` });
  };
  if (details) {
    add(inventedWords(details.summary, wording.summary, transcript), "summary", "job summary");
    add(inventedWords(details.site, wording.site, transcript), "site", "job site");
  }
  for (const line of lines) add(inventedWords(line.description ?? "", wording.lines[line.key], transcript), "description", "description", line.key);
  return checks;
}

export function findChecks({ transcript, heardLines, flags, lines, taxRateMilli, book, details, aiWording }: CheckInput): Check[] {
  const checks: Check[] = [];
  const tax = taxCheck(transcript, lines, taxRateMilli);
  if (tax) checks.push(tax);
  // Tax said with no rate is the code's to ask about, the same way every time, so the AI's own note on it would only repeat it.
  const taxByCode = taxSaid(transcript) && !rateSpoken(transcript);
  for (const line of lines) {
    if (isGenericName(line.name) && !line.description?.trim()) {
      checks.push({ id: `vague:${line.key}`, kind: "vague", lineKey: line.key, text: `"${line.name}" on its own doesn't tell the customer what it was for. Add a description.` });
    }
  }
  checks.push(...wordChecks(lines, details, aiWording, transcript));
  for (const line of lines) {
    const far = farCheck(line, book, transcript);
    if (far) checks.push(far);
  }
  flags.forEach((flag, i) => {
    const row = lines.find((line) => line.key === flag.lineKey);
    const before = heardLines.find((line) => line.key === flag.lineKey);
    if (row && before && !unchanged(row, before)) return; // the person changed the row it's about
    if (taxByCode && /\btax/i.test(flag.text)) return;
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

export const canSettle = (check: Check) => !MUST_FIX.includes(check.kind);

export const openChecks = (checks: Check[], acknowledged: readonly string[]) => checks.filter((check) => !canSettle(check) || !acknowledged.includes(check.id));

/** A row counts once, however many checks sit on it: one tap settles them all. */
export const placesToCheck = (open: Check[]) => new Set(open.map((check) => check.lineKey ?? check.id)).size;
