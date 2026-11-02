/**
 * Reads numbers back out of the transcript with plain code, so a mistake can be caught without
 * another AI call. Used for the "spoken amount with no line item" warning and to show the words
 * that were heard beside each price. Tuned against old spike transcripts only, so it's a safety
 * net with a known aim (no false alarms on clean jobs), not a tested guarantee.
 */
import { computeTotals, lineCents, type InvoiceLine } from "./money";

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
}

export interface NumberMention {
  /** Dollars if this is money, or just the number. */
  value: number;
  /** The other way to read trade shorthand: "six seventy five" is $675 or $6.75. */
  alternative?: number;
  start: number;
  end: number;
  text: string;
  isAmount: boolean;
}

export interface MissingAmount {
  cents: number;
  heard: string;
  excerpt: string;
}

function tokenize(transcript: string): Token[] {
  return [...transcript.matchAll(/\$?\d{1,2}:\d{2}|\$?\d[\d,]*(?:\.\d+)?%?|[A-Za-z]+(?:'[A-Za-z]+)?/g)].map((m) => ({
    text: m[0],
    lower: m[0].toLowerCase(),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/** Words of one number sit side by side. Punctuation between them means two separate things. */
const adjacent = (tokens: Token[], at: number) => tokens[at + 1] !== undefined && tokens[at + 1].start - tokens[at].end <= 1;

/** Tens with an optional unit, such as "seventy" or "seventy five". Returns value and words used. */
function readTens(tokens: Token[], at: number): [number, number] | null {
  const word = tokens[at]?.lower;
  if (word === undefined) return null;
  if (word in TEENS) return [TEENS[word], 1];
  if (word in TENS) {
    const next = tokens[at + 1]?.lower;
    return adjacent(tokens, at) && next in UNITS ? [TENS[word] + UNITS[next], 2] : [TENS[word], 1];
  }
  return null;
}

/** One spoken number starting at a token, as [value, words used, other reading]. */
function readWords(tokens: Token[], at: number): [number, number, number?] | null {
  const word = tokens[at].lower;
  const lead = word === "a" ? [1, 1] : word in UNITS ? [UNITS[word], 1] : readTens(tokens, at);
  if (lead) {
    const scaleWord = adjacent(tokens, at + lead[1] - 1) ? tokens[at + lead[1]].lower : undefined;
    if (scaleWord === "hundred" || scaleWord === "thousand") {
      const scale = scaleWord === "hundred" ? 100 : 1000;
      const after = at + lead[1] + 1 + (tokens[at + lead[1] + 1]?.lower === "and" ? 1 : 0);
      const rest = readTens(tokens, after);
      return rest ? [lead[0] * scale + rest[0], after - at + rest[1]] : [lead[0] * scale, lead[1] + 1];
    }
  }
  if (word === "a") return null;
  if (word in UNITS) {
    const rest = adjacent(tokens, at) ? readTens(tokens, at + 1) : null;
    // Trade shorthand: "one forty" is $140. With a teen or tens word it can't be a plain count.
    if (rest) return [UNITS[word] * 100 + rest[0], 1 + rest[1], UNITS[word] + rest[0] / 100];
    return [UNITS[word], 1];
  }
  const tens = readTens(tokens, at);
  if (!tens) return null;
  // "twelve fifty" and "thirty four ninety five" are prices: $12.50, or $1,250 for a big job.
  const cents = adjacent(tokens, at + tens[1] - 1) ? readTens(tokens, at + tens[1]) : null;
  if (cents && cents[0] >= 10) return [tens[0] + cents[0] / 100, tens[1] + cents[1], tens[0] * 100 + cents[0]];
  return [tens[0], tens[1]];
}

const MONEY_AFTER = /^(dollars?|bucks?|each|apiece|hour|hr)$/;
const COUNT_AFTER = /^(hours?|minutes?|days?|weeks?|months?|years?|feet|foot|inch(es)?|amps?|gallons?|percent|rooms?|times?|bags?|boxes|bundles?|panes?|boards?|sets?|cans?)$/;
const MONEY_BEFORE = /^(at|labor|fee|charge|cost|costs|price|plus)$/;

function classify(tokens: Token[], before: number, after: number, dollarSign: boolean, percentSign: boolean): boolean {
  if (percentSign) return false;
  if (dollarSign) return true;
  const next = tokens[after]?.lower ?? "";
  if (next === "and" && tokens[after + 1]?.lower === "a") return false; // "six and a half" is hours
  const nextNext = tokens[after + 1]?.lower ?? "";
  if (MONEY_AFTER.test(next)) return true;
  if ((next === "an" || next === "a" || next === "per") && nextNext === "hour") return true;
  if (next === "per") return true;
  if (COUNT_AFTER.test(next)) return false;
  // "at 12 Oak Lane" is an address, "at 45 a bag" and "at sixty" are prices.
  if (tokens[after] && /^[A-Z]/.test(tokens[after].text) && tokens[after].start === tokens[after - 1].end + 1) return false;
  return MONEY_BEFORE.test(tokens[before]?.lower ?? "");
}

export function findNumbers(transcript: string): NumberMention[] {
  const tokens = tokenize(transcript);
  const mentions: NumberMention[] = [];
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i];
    const clock = /^(\$?)(\d{1,2}):(\d{2})$/.exec(token.text);
    if (clock) {
      // Speech tools write a spoken "one twenty" as 1:20.
      const hundreds = Number(clock[2]) * 100 + Number(clock[3]);
      mentions.push({ value: hundreds, alternative: hundreds / 100, start: token.start, end: token.end, text: token.text, isAmount: classify(tokens, i - 1, i + 1, clock[1] === "$", false) });
      i += 1;
      continue;
    }
    const digits = /^(\$?)(\d[\d,]*(?:\.\d+)?)(%?)$/.exec(token.text);
    if (digits) {
      const value = Number(digits[2].replace(/,/g, ""));
      // ...and a spoken "two fifty" as $2.50.
      const alternative = value < 10 && digits[2].includes(".") ? Math.round(value * 100) : undefined;
      mentions.push({ value, alternative, start: token.start, end: token.end, text: token.text, isAmount: classify(tokens, i - 1, i + 1, digits[1] === "$", digits[3] === "%") });
      i += 1;
      continue;
    }
    const words = readWords(tokens, i);
    if (!words) {
      i += 1;
      continue;
    }
    const [value, used, alternative] = words;
    const last = tokens[i + used - 1];
    mentions.push({ value, alternative, start: token.start, end: last.end, text: transcript.slice(token.start, last.end), isAmount: classify(tokens, i - 1, i + used, false, false) });
    i += used;
  }
  return mentions;
}

const CORRECTION = /\b(no wait|scratch that|sorry|i mean|make that|actually|correction)\b/i;

/** An amount the speaker took back straight away isn't an amount: "80 an hour, no wait, 90". */
function isCorrected(transcript: string, mention: NumberMention, next: NumberMention | undefined): boolean {
  return next !== undefined && CORRECTION.test(transcript.slice(mention.end, next.start));
}

function excerptAround(transcript: string, start: number, end: number, wordsEachSide = 5): string {
  const before = transcript.slice(0, start).split(/\s+/).filter(Boolean);
  const after = transcript.slice(end).split(/\s+/).filter(Boolean);
  const left = before.slice(-wordsEachSide).join(" ");
  const right = after.slice(0, wordsEachSide).join(" ");
  const glue = /\s/.test(transcript[end] ?? " ") ? " " : "";
  return `${before.length > wordsEachSide ? "…" : ""}${left ? `${left} ` : ""}${transcript.slice(start, end)}${glue}${right}${after.length > wordsEachSide ? "…" : ""}`.trim();
}

/** The words the app heard around a line's price, or null when that price wasn't said. */
export function heardFor(transcript: string, line: Pick<InvoiceLine, "unitCents" | "quantityMilli">): string | null {
  const mentions = findNumbers(transcript);
  const matches = (m: NumberMention, cents: number) => Math.round(m.value * 100) === cents || (m.alternative !== undefined && Math.round(m.alternative * 100) === cents);
  const wanted = [line.unitCents, lineCents(line)];
  // Prefer the last match: a price that was corrected is said again further on.
  const hit = wanted.map((cents) => mentions.filter((m) => m.isAmount && matches(m, cents)).pop() ?? mentions.filter((m) => matches(m, cents)).pop()).find(Boolean);
  return hit ? excerptAround(transcript, hit.start, hit.end) : null;
}

/** Spoken dollar amounts that no line item, tax amount or total accounts for. */
export function findMissingAmounts(transcript: string, lines: Pick<InvoiceLine, "unitCents" | "quantityMilli">[], taxRateMilli: number): MissingAmount[] {
  const totals = computeTotals(lines, taxRateMilli);
  const accounted = new Set<number>([...lines.map((l) => l.unitCents), ...totals.lines.map((l) => l.lineCents), totals.subtotalCents, totals.taxCents, totals.totalCents]);
  const mentions = findNumbers(transcript);
  const amounts = mentions.filter((m) => m.isAmount);
  const missing: MissingAmount[] = [];
  amounts.forEach((mention, i) => {
    if (isCorrected(transcript, mention, amounts[i + 1])) return;
    const cents = Math.round(mention.value * 100);
    const other = mention.alternative === undefined ? undefined : Math.round(mention.alternative * 100);
    if (accounted.has(cents) || (other !== undefined && accounted.has(other))) return;
    if (missing.some((m) => m.cents === cents)) return;
    missing.push({ cents, heard: mention.text, excerpt: excerptAround(transcript, mention.start, mention.end) });
  });
  return missing;
}
