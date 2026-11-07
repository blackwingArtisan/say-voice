/**
 * Tax said with no rate. The AI never picks a rate: code notices that tax was said, offers the
 * state's rates as buttons, and only a tap or a typed number sets one. Code also decides which
 * line "plus tax" was said about, as a suggestion the person can change on the confirm screen.
 */
import { lineCents, type InvoiceLine } from "./money";
import { findNumbers } from "./spoken";

export interface StateRate {
  name: string;
  /** Statewide rate in thousandths of a percent, so 6% is 6000. */
  stateMilli: number;
  /** The highest local option on top, for states where one fixed option is common. */
  localMilli?: number;
  localLabel?: string;
}

/**
 * State sales tax rates as of July 1, 2026, from the Tax Foundation's "State and Local Sales Tax
 * Rates, Midyear 2026" table (taxfoundation.org/data/all/state/2026-sales-tax-rates-midyear/).
 * The table rounds to two places; MO, MN, NJ and NM are their exact statutory rates. Iowa's local
 * option is a flat 1% where a county or city has voted it in (Iowa Department of Revenue, "Local
 * Option Sales Tax"), which is the table's maximum local rate for Iowa. Average local rates aren't
 * a real rate anywhere, so they aren't offered: the person types the local rate instead.
 */
export const STATE_RATES: StateRate[] = [
  { name: "Alabama", stateMilli: 4000 },
  { name: "Alaska", stateMilli: 0 },
  { name: "Arizona", stateMilli: 5600 },
  { name: "Arkansas", stateMilli: 6500 },
  { name: "California", stateMilli: 7250 },
  { name: "Colorado", stateMilli: 2900 },
  { name: "Connecticut", stateMilli: 6350 },
  { name: "Delaware", stateMilli: 0 },
  { name: "District of Columbia", stateMilli: 6000 },
  { name: "Florida", stateMilli: 6000 },
  { name: "Georgia", stateMilli: 4000 },
  { name: "Hawaii", stateMilli: 4000 },
  { name: "Idaho", stateMilli: 6000 },
  { name: "Illinois", stateMilli: 6250 },
  { name: "Indiana", stateMilli: 7000 },
  { name: "Iowa", stateMilli: 6000, localMilli: 1000, localLabel: "state + local option" },
  { name: "Kansas", stateMilli: 6500 },
  { name: "Kentucky", stateMilli: 6000 },
  { name: "Louisiana", stateMilli: 5000 },
  { name: "Maine", stateMilli: 5500 },
  { name: "Maryland", stateMilli: 6000 },
  { name: "Massachusetts", stateMilli: 6250 },
  { name: "Michigan", stateMilli: 6000 },
  { name: "Minnesota", stateMilli: 6875 },
  { name: "Mississippi", stateMilli: 7000 },
  { name: "Missouri", stateMilli: 4225 },
  { name: "Montana", stateMilli: 0 },
  { name: "Nebraska", stateMilli: 5500 },
  { name: "Nevada", stateMilli: 6850 },
  { name: "New Hampshire", stateMilli: 0 },
  { name: "New Jersey", stateMilli: 6625 },
  { name: "New Mexico", stateMilli: 4875 },
  { name: "New York", stateMilli: 4000 },
  { name: "North Carolina", stateMilli: 4750 },
  { name: "North Dakota", stateMilli: 5000 },
  { name: "Ohio", stateMilli: 5750 },
  { name: "Oklahoma", stateMilli: 4500 },
  { name: "Oregon", stateMilli: 0 },
  { name: "Pennsylvania", stateMilli: 6000 },
  { name: "Rhode Island", stateMilli: 7000 },
  { name: "South Carolina", stateMilli: 6000 },
  { name: "South Dakota", stateMilli: 4200 },
  { name: "Tennessee", stateMilli: 7000 },
  { name: "Texas", stateMilli: 6250 },
  { name: "Utah", stateMilli: 6100 },
  { name: "Vermont", stateMilli: 6000 },
  { name: "Virginia", stateMilli: 5300 },
  { name: "Washington", stateMilli: 6500 },
  { name: "West Virginia", stateMilli: 6000 },
  { name: "Wisconsin", stateMilli: 5000 },
  { name: "Wyoming", stateMilli: 4000 },
];

export interface RateChoice {
  rateMilli: number;
  label: string;
}

const TAX_WORD = /\b(sales )?tax(es|ed|able)?\b/i;
const NO_TAX = /\bno (sales )?tax(es)?\b|\btax[- ]?(free|exempt)\b|\bwithout (sales )?tax\b|\b(don'?t|do not|not) (charge|add|charging|adding) (any )?(sales )?tax\b|\bnot taxable\b|\bnon[- ]?taxable\b/i;

/** Tax was asked for. "No tax on this one" doesn't count. */
export const taxSaid = (transcript: string) => TAX_WORD.test(transcript) && !NO_TAX.test(transcript);

/**
 * Speech to text writes a capital I that it isn't sure of as a lowercase l ("lowa"), so a word
 * starting with l is also tried as one starting with i. Names are matched whole, never by spelling
 * distance: "main" must not read as Maine.
 */
const words = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];

/** The state named nearest the word "tax", or null when none is. */
export function stateFor(transcript: string): StateRate | null {
  const said = words(transcript);
  const variants = said.map((w) => (w.startsWith("l") ? [w, `i${w.slice(1)}`] : [w]));
  const taxAt = said.findIndex((w) => /^tax/.test(w));
  let best: { state: StateRate; distance: number } | null = null;
  for (const state of STATE_RATES) {
    const name = words(state.name);
    for (let i = 0; i + name.length <= said.length; i++) {
      if (!name.every((part, j) => variants[i + j].includes(part))) continue;
      const distance = taxAt === -1 ? 0 : Math.abs(i - taxAt);
      if (!best || distance < best.distance) best = { state, distance };
    }
  }
  return best?.state ?? null;
}

/** The one-tap rates for a state. Zero-rate states get none: "No tax" covers them. */
export function rateChoices(state: StateRate | null): RateChoice[] {
  if (!state || !state.stateMilli) return [];
  const pct = (milli: number) => `${(milli / 1000).toString()}%`;
  const choices = [{ rateMilli: state.stateMilli, label: `${pct(state.stateMilli)} state` }];
  if (state.localMilli) choices.push({ rateMilli: state.stateMilli + state.localMilli, label: `${pct(state.stateMilli + state.localMilli)} ${state.localLabel ?? "state + local"}` });
  return choices;
}

/**
 * A rate counts only if it was said: a number next to "percent" or "%" that matches. The extraction
 * is frozen and could fill in a state's rate it knows, which would be the AI picking a rate.
 */
export function rateWasSaid(transcript: string, rateMilli: number): boolean {
  if (!rateMilli) return true;
  return findNumbers(transcript).some((m) => {
    const after = transcript.slice(m.end, m.end + 12).toLowerCase();
    const near = m.text.endsWith("%") || /^\s*(percent|per cent|%)/.test(after);
    const values = [m.value, m.alternative].filter((v): v is number => v !== undefined);
    // "eight point two five percent" arrives as 8 then 25: allow the decimal written out.
    const pointed = /^\s*point\s+/.test(after);
    return near ? values.some((v) => Math.round(v * 1000) === rateMilli) : pointed && Math.floor(rateMilli / 1000) === m.value;
  });
}

/** A rate was said out loud: a number with "percent" or "%". */
export const rateSpoken = (transcript: string) => findNumbers(transcript).some((m) => m.text.endsWith("%") || /^\s*(percent|per cent)\b/i.test(transcript.slice(m.end, m.end + 12)));

const PLUS_TAX = /\b(plus|and|with|add|charge) (the )?(sales )?tax\b|\bplus tax\b|\btaxable\b/gi;

/**
 * Which lines "plus tax" was said about: the amount said just before it in the same sentence.
 * Null means it wasn't tied to one amount, so every line is taxed, as before.
 */
export function taxedLineKeys(transcript: string, lines: (Pick<InvoiceLine, "quantityMilli" | "unitCents"> & { key: string })[]): Set<string> | null {
  const amounts = findNumbers(transcript).filter((m) => m.isAmount);
  const keys = new Set<string>();
  for (const said of transcript.matchAll(PLUS_TAX)) {
    const before = amounts.filter((m) => m.end <= said.index && !/[.?!]/.test(transcript.slice(m.end, said.index))).pop();
    if (!before) continue;
    const cents = [before.value, before.alternative].filter((v): v is number => v !== undefined).map((v) => Math.round(v * 100));
    const line = lines.find((l) => cents.includes(l.unitCents) || cents.includes(lineCents(l)));
    if (line) keys.add(line.key);
  }
  return keys.size ? keys : null;
}

/**
 * "No tax on this one" after an amount leaves that line untaxed. Said with no amount before it, or
 * on a job where no tax was asked for at all, it leaves every line untaxed.
 */
export function untaxedLineKeys(transcript: string, lines: (Pick<InvoiceLine, "quantityMilli" | "unitCents"> & { key: string })[]): Set<string> | "all" | null {
  const said = [...transcript.matchAll(new RegExp(NO_TAX.source, "gi"))];
  if (!said.length) return null;
  if (!transcript.match(PLUS_TAX)) return "all";
  const amounts = findNumbers(transcript).filter((m) => m.isAmount);
  const keys = new Set<string>();
  for (const no of said) {
    const before = amounts.filter((m) => m.end <= no.index!).pop();
    const cents = before ? [before.value, before.alternative].filter((v): v is number => v !== undefined).map((v) => Math.round(v * 100)) : [];
    const line = lines.find((l) => cents.includes(l.unitCents) || cents.includes(lineCents(l)));
    if (!line) return "all";
    keys.add(line.key);
  }
  return keys;
}
