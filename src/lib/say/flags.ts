/**
 * Ties the AI's doubts to the line they're about, so the confirm screen can show each one on the
 * row it concerns. Every flag ends up naming its item or amount: a row flag names the item, and
 * anything that can't be tied to a row keeps the AI's own words and sits above the items.
 */
import type { InvoiceLine } from "./money";

export interface FlagLink {
  text: string;
  /** Index into the lines, or null when the flag isn't about one line. */
  line: number | null;
}

const GENERIC = new Set(["labor", "labour", "part", "parts", "item", "service", "charge", "fee", "new", "flat"]);

const wordsOf = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];

function namesLine(flag: string, line: Pick<InvoiceLine, "name">): number {
  const words = new Set(wordsOf(flag));
  const nameWords = wordsOf(line.name);
  const specific = nameWords.filter((w) => w.length > 3 && !GENERIC.has(w));
  const hits = specific.filter((w) => words.has(w) || words.has(`${w}s`) || words.has(w.replace(/s$/, ""))).length;
  if (hits) return 10 + hits;
  return nameWords.some((w) => GENERIC.has(w) && words.has(w)) ? 5 : 0;
}

function namesPrice(flag: string, line: Pick<InvoiceLine, "unitCents">): boolean {
  const dollars = (line.unitCents / 100).toString();
  return new RegExp(`(^|[^\\d.])\\$?${dollars.replace(".", "\\.")}(\\.00)?(?![\\d])`).test(flag);
}

/** Names come from the picker, so a doubt about a heard name isn't a thing to check. */
function isOnlyAboutName(link: FlagLink): boolean {
  return link.line === null && !/\d/.test(link.text) && /\b(customer|name|surname|spell\w*)\b/i.test(link.text);
}

/** The flags worth showing on the confirm screen. */
export function flagsToShow(flags: string[], lines: Pick<InvoiceLine, "name" | "unitCents">[]): FlagLink[] {
  return linkFlags(flags, lines).filter((link) => !isOnlyAboutName(link));
}

export function linkFlags(flags: string[], lines: Pick<InvoiceLine, "name" | "unitCents">[]): FlagLink[] {
  return flags.map((text) => {
    const scored = lines.map((line, index) => ({ index, score: namesLine(text, line) + (namesPrice(text, line) ? 2 : 0) }));
    const best = scored.sort((a, b) => b.score - a.score)[0];
    return { text, line: best && best.score > 0 ? best.index : null };
  });
}
