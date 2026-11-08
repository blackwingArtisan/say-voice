/**
 * The price book's rules. Plain code, no AI, shared by the browser and the server. It learns what
 * a person really charges from invoices that went out, then says when a price is far from that.
 * A misheard "fifty" sent as $15 is the case it exists for: the extraction can't know the usual
 * price, and recognizer confidence told us nothing in testing.
 */
import { formatCents } from "./money";

export interface PriceEntry {
  /** The normalized item name. */
  id: string;
  name: string;
  /** Every price this item went out at, oldest first, in cents. */
  samples: number[];
  source: "seed" | "learned";
  updatedAt: string;
  /** Read from the trade's past PayPal invoices: how many had it, and the newest price. */
  paypal?: { invoices: number; lastCents: number; lastAt: string };
  /** How many of this browser's sent invoices had it. */
  sentHere?: number;
}

/** One confirmation could be the mistake itself, so a single price can't raise a flag yet. */
export const MIN_SAMPLES = 2;
/**
 * A price this many times above or below the usual one is far off. The tightest sound-alike pair
 * is thirty and thirteen, a ratio of 2.3, so 1.5 catches them all and leaves ordinary job-to-job
 * changes alone. Chosen by reasoning, not tuned on data.
 */
export const FAR_RATIO = 1.5;
export const MAX_SAMPLES = 25;

const LEAD_WORDS = new Set(["a", "an", "the", "new", "replacement", "replace", "replaced", "install", "installed", "of", "for", "and", "one"]);

function wordOf(raw: string): string {
  if (raw === "labour") return "labor";
  return raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
}

const wordsOf = (name: string) => (name.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !LEAD_WORDS.has(w)).map(wordOf);

/** "New heating elements" and "Heating element" are one item. */
export const itemKey = (name: string) => wordsOf(name).join(" ");

/**
 * Exact name first, then a longer name that contains a known one, so "Dryer heating element" finds
 * "Heating element". Single-word items match exactly only: "Labor" must not swallow "Flat rate labor".
 */
export function findEntry(name: string, book: PriceEntry[]): PriceEntry | undefined {
  const key = itemKey(name);
  if (!key) return undefined;
  const exact = book.find((entry) => entry.id === key);
  if (exact) return exact;
  const words = new Set(key.split(" "));
  return book
    .filter((entry) => {
      const known = entry.id.split(" ");
      return known.length >= 2 && known.every((w) => words.has(w));
    })
    .sort((a, b) => b.id.length - a.id.length)[0];
}

/** The middle price, so one odd job can't move what "usual" means. */
export function usualCents(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export interface FarPrice {
  usualCents: number;
  /** How many invoices the usual price comes from. */
  samples: number;
}

export function farFromUsual(line: { name: string; unitCents: number }, book: PriceEntry[]): FarPrice | null {
  const entry = findEntry(line.name, book);
  if (!entry || entry.samples.length < MIN_SAMPLES || line.unitCents <= 0) return null;
  const usual = usualCents(entry.samples);
  const ratio = Math.max(line.unitCents / usual, usual / line.unitCents);
  return ratio >= FAR_RATIO ? { usualCents: usual, samples: entry.samples.length } : null;
}

const TEEN_WORDS: Record<number, string> = { 13: "thirteen", 14: "fourteen", 15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen" };
const TENS_WORDS: Record<number, string> = { 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty", 70: "seventy", 80: "eighty", 90: "ninety" };

export interface SoundAlike {
  cents: number;
  heard: string;
  said: string;
}

/** The price that sounds like this one: fifteen and fifty, sixteen and sixty. Null for any other price. */
export function soundAlike(cents: number): SoundAlike | null {
  if (cents % 100 !== 0) return null;
  const dollars = cents / 100;
  if (dollars in TEEN_WORDS) return { cents: (dollars - 10) * 1000, heard: TEEN_WORDS[dollars], said: TENS_WORDS[(dollars - 10) * 10] };
  if (dollars in TENS_WORDS) return { cents: (dollars / 10 + 10) * 100, heard: TENS_WORDS[dollars], said: TEEN_WORDS[dollars / 10 + 10] };
  return null;
}

/** The book after one invoice went out at these prices. */
export function learned(book: PriceEntry[], lines: { name: string; unitCents: number }[], now: string): PriceEntry[] {
  const changed = new Map<string, PriceEntry>();
  for (const line of lines) {
    const key = itemKey(line.name);
    if (!key) continue;
    const entry = changed.get(key) ?? findEntry(line.name, book);
    const next: PriceEntry = entry
      ? { ...entry, samples: [...entry.samples, line.unitCents].slice(-MAX_SAMPLES), updatedAt: now }
      : { id: key, name: line.name, samples: [line.unitCents], source: "learned", updatedAt: now };
    changed.set(next.id, next);
  }
  return [...changed.values()];
}

const invoiceCount = (n: number) => (n === 1 ? "1 invoice" : `${n} invoices`);

/** Where a price came from, in a few words: "from 12 PayPal invoices, last $85.00". */
export function provenance(entry: PriceEntry): string {
  if (entry.paypal) {
    const here = entry.sentHere ? `, and ${entry.sentHere} sent here` : "";
    return `from ${entry.paypal.invoices === 1 ? "1 PayPal invoice" : `${entry.paypal.invoices} PayPal invoices`}, last ${formatCents(entry.paypal.lastCents)}${here}`;
  }
  const low = Math.min(...entry.samples);
  const high = Math.max(...entry.samples);
  return `${invoiceCount(entry.samples.length)}${low === high ? "" : `, ${formatCents(low)} to ${formatCents(high)}`}`;
}

/**
 * A price unlike the one the trade's PayPal invoices had last time. Not far enough off to stop the
 * send (that's farFromUsual's job), so the confirm screen only points it out.
 */
export function learnedDifference(line: { name: string; unitCents: number }, book: PriceEntry[]): string | null {
  const entry = findEntry(line.name, book);
  if (!entry?.paypal || line.unitCents <= 0 || line.unitCents === entry.paypal.lastCents) return null;
  return `Your PayPal invoices had this at ${formatCents(entry.paypal.lastCents)} last time (${invoiceCount(entry.paypal.invoices)}). This says ${formatCents(line.unitCents)}.`;
}
