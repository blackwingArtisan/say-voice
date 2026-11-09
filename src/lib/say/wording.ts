/**
 * Code guardrails on the words the AI writes for the customer: the job summary, the job site and a
 * description on each line. The prompt asks for the speaker's own words, and these check it did.
 * Shared, so the confirm screen and the server flag the same things.
 *
 * - Fillers ("um", "uh", "mm-hmm") are stripped.
 * - A link, or a number that wasn't said and isn't the line's own quantity or price, blanks the text.
 * - A content word that wasn't said is flagged for the person, so invented parts or work get a look.
 */
import { lineCents, type InvoiceLine } from "./money";
import { findNumbers } from "./spoken";

export const MAX_SUMMARY = 120;
export const MAX_SITE = 200;
/** Ours. PayPal allows 1000 on an item description, and the customer reads it on a phone. */
export const MAX_DESCRIPTION = 300;

const FILLER = /(^|[\s,.;:!?(])(?:u+m+|u+h+m*|e+r+m+|h+m+|m+-?h+m+|mm+|uh-huh|ah+)(?=$|[\s,.;:!?)])/gi;

/** Fillers out, spaces and stray punctuation tidied, first letter up. */
export function cleanText(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) out = out.replace(FILLER, "$1");
  out = out
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/[,;:]?\s*([.!?])(?:\s*[.!?,;:])+/g, "$1")
    .replace(/^[\s,.;:!?-]+/, "")
    .replace(/[\s,;:-]+$/, "")
    .trim();
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

/** Cut at a word, never mid-word, and say it was cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).replace(/[\s,.;:-]+$/, "")}…`;
}

export const hasLink = (text: string) => /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|co|us|biz|info|app|dev|ly|me)\b|\S+@\S+\.\S+/i.test(text);

/**
 * Every number the speaker said, with "three and a half" and "three quarters" read both ways. A
 * comma is a pause, so "six hundred, ten hours" said six hundred and ten as well as 610.
 */
export function saidNumbers(transcript: string): Set<number> {
  const out = new Set<number>();
  const add = (n: number) => out.add(Math.round(n * 1000) / 1000);
  const pieces = transcript.includes(",") ? [transcript, ...transcript.split(",")] : [transcript];
  for (const m of pieces.flatMap((piece) => findNumbers(piece).map((mention) => ({ ...mention, piece })))) {
    add(m.value);
    if (m.alternative !== undefined) add(m.alternative);
    const after = m.piece.slice(m.end, m.end + 14).toLowerCase();
    if (/^\s*and a half\b/.test(after)) add(m.value + 0.5);
    if (/^\s*and a quarter\b/.test(after)) add(m.value + 0.25);
    if (/^\s*quarters?\b/.test(after)) add(m.value / 4);
  }
  if (/\bhalf\b/i.test(transcript)) add(0.5);
  return out;
}

/** The line's own numbers: quantity, unit price and line total, in plain units. */
export function lineNumbers(line: Pick<InvoiceLine, "quantityMilli" | "unitCents">): number[] {
  return [line.quantityMilli / 1000, line.unitCents / 100, lineCents(line) / 100];
}

/** Numbers in the text that are neither said nor allowed. "66th" reads as 66, "3.5" as 3.5. */
export function strayNumbers(text: string, said: Set<number>, allowed: number[] = []): string[] {
  const ok = new Set([...said, ...allowed.map((n) => Math.round(n * 1000) / 1000)]);
  return findNumbers(text)
    .filter((m) => ![m.value, m.alternative].some((v) => v !== undefined && ok.has(Math.round(v * 1000) / 1000)))
    .map((m) => m.text);
}

/** Words that carry no claim about the job: grammar, and the plain words every invoice uses. */
const PLAIN = new Set(
  (
    "the and for with from into onto over under about around approx approximately roughly est estimated per plus " +
    "this that these those its was were are been all any some each both also then than out off back again now " +
    "new old existing job work labor labour material materials part parts service services repair repairs repaired " +
    "fix fixed hour hours minute minutes min mins day days total flat rate charge charged time site onsite " +
    "include includes including included supplied used customer home house street avenue road lane drive"
  ).split(" "),
);

/** Close enough to count as the same word: plurals and tenses, nothing more. "Setting" is "set". */
export function stem(word: string): string {
  const w = word.toLowerCase();
  for (const suffix of ["ing", "ies", "ed", "es", "er", "s", "e", "y"]) {
    if (!w.endsWith(suffix) || w.length - suffix.length < 3) continue;
    const base = w.slice(0, -suffix.length);
    const doubled = (suffix === "ing" || suffix === "ed" || suffix === "er") && /([b-df-hj-np-tv-z])\1$/.test(base) && !/(ll|ss|ff|zz)$/.test(base);
    return doubled ? base.slice(0, -1) : base;
  }
  return w;
}

function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return a.length - i - j <= 1 && b.length - i - j <= 1;
}

/** The words worth checking: three letters or more, not plain. */
export function contentWords(text: string): string[] {
  const seen = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (word.length >= 3 && !PLAIN.has(word)) seen.add(word);
  }
  return [...seen];
}

/** Content words that weren't said, allowing for plurals, tenses and a one-letter sound-alike slip. */
export function unsaidWords(text: string, transcript: string): string[] {
  const heard = (transcript.toLowerCase().match(/[a-z]+/g) ?? []).map(stem);
  const heardSet = new Set(heard);
  return contentWords(text).filter((word) => {
    const s = stem(word);
    if (heardSet.has(s)) return false;
    return !(s.length >= 5 && heard.some((h) => h.length >= 4 && oneEditApart(s, h)));
  });
}

/**
 * Fair ways to say what was said: a work verb the AI may write when the speaker said the plain
 * version. "New heating element" is a replaced one; "it heats up fine now" is a tested one. Each
 * holds only when its cue was said, and covers the verb alone: a part or a job that wasn't said is
 * still caught.
 */
const FAIR_PARAPHRASES: { words: RegExp; said: RegExp }[] = [
  { words: /^(replac|swap|install|fitt?|chang)/, said: /\b(new|replac\w*|swap\w*|install\w*|put in|fitted|chang\w*)\b/i },
  { words: /^(test|check|verif|confirm)/, said: /\b(tests?|tested|checks?|checked|runs?|running|works?|working|heats?|heating up|fine|drains?|draining|lights?|good now)\b/i },
];

export const fairParaphrase = (word: string, transcript: string) => FAIR_PARAPHRASES.some((p) => p.words.test(word.toLowerCase()) && p.said.test(transcript));

/**
 * Words the AI wrote that weren't said and are still there. Words the person typed are theirs, so
 * only words that were in the AI's own text count, and a fair way to say what was said doesn't.
 */
export function inventedWords(current: string, aiWrote: string | undefined, transcript: string): string[] {
  if (!aiWrote) return [];
  const fromAi = new Set(contentWords(aiWrote));
  return unsaidWords(current, transcript).filter((word) => fromAi.has(word) && !fairParaphrase(word, transcript));
}

/** A short stable id for a list of words, so a check closes when the words change. */
export function wordsKey(words: string[]): string {
  let hash = 5381;
  for (const ch of words.join(",")) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_WORDS = new RegExp(`\\b(today|yesterday|this morning|this afternoon|tonight|last night|monday|tuesday|wednesday|thursday|friday|saturday|sunday|${MONTHS})\\b|\\b\\d{1,2}/\\d{1,2}\\b`, "i");

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A service date counts only when the words for it were said and it's a real day near today.
 * Returns the date, or "" when it doesn't hold up.
 */
export function checkedServiceDate(date: string, words: string, transcript: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !words.trim() || !DATE_WORDS.test(words)) return "";
  if (!squash(transcript).includes(squash(words))) return "";
  const day = Date.parse(`${date}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(day) || new Date(day).toISOString().slice(0, 10) !== date) return "";
  const days = (day - now) / 86_400_000;
  return days <= 31 && days >= -366 ? date : "";
}

/** Names so vague the customer can't tell what they paid for without a description. */
const GENERIC_NAMES = new Set(["labor", "labour", "materials", "material", "misc", "miscellaneous", "parts", "part", "service call", "service", "fee", "other"]);

export const isGenericName = (name: string) => GENERIC_NAMES.has(name.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.:]$/, ""));

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const DANGLING = /[\s,;:-]+(?:on|of|with|for|and|in|to|at|the|a|an)?[\s,;:-]*$/i;

/**
 * The customer reads the summary and then every line, so a phrase of four words or more that ends
 * the summary and turns up again on a line comes off the summary ("valley replacement on laminated
 * shingles approximately 10 years old" next to a materials line that says the shingles' age).
 */
export function withoutRepeatedTail(summary: string, descriptions: string[]): string {
  const tokens = [...summary.matchAll(/[A-Za-z0-9]+/g)];
  const lines = descriptions.map((d) => ` ${words(d).join(" ")} `);
  for (let start = 0; start <= tokens.length - 4; start++) {
    const tail = ` ${tokens.slice(start).map((t) => t[0].toLowerCase()).join(" ")} `;
    if (!lines.some((line) => line.includes(tail))) continue;
    const kept = summary.slice(0, tokens[start].index).replace(DANGLING, "").replace(/[\s,;:-]+$/, "");
    return words(kept).length >= 2 ? kept : summary;
  }
  return summary;
}

/** A sentence whose words were already said earlier in the same description is dropped. */
export function withoutRepeatedSentences(text: string): string {
  let before = " ";
  const kept = (text.match(/[^.!?]+[.!?]*/g) ?? []).filter((sentence) => {
    const key = words(sentence).join(" ");
    if (!key || before.includes(` ${key} `)) return false;
    before += `${key} `;
    return true;
  });
  return kept.join("").trim();
}
