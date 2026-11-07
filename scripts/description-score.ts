/**
 * Scoring rules for the description dev set (tests/dev). Plain code, kept apart from the app's own
 * word guard so the score doesn't grade the guard with itself.
 *
 * A phrase counts as mentioned when its key nouns are in the line's description: case, plural and
 * hyphen don't matter. Key nouns are the phrase's words minus grammar, numbers and verb forms. A
 * key noun the speaker never said is the author's paraphrase, so it isn't asked for verbatim. A
 * phrase with no key nouns left ("taped", "mounted it") is checked by its said words instead.
 */

const GRAMMAR = new Set(
  (
    "a an the and or of to in on at for with from by up down out off over under into onto it its it's this that these those " +
    "all some any each both every everything one ones new old so then also just there here was were is are been be had has have " +
    "i i'm we he she they them my our your their us me together about around approximately roughly"
  ).split(" "),
);
const NUMBERS = new Set(
  (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen " +
    "twenty thirty forty fifty sixty seventy eighty ninety hundred thousand half"
  ).split(" "),
);
/** Past forms that are only ever verbs here. -ed and -ing words are caught by their ending. */
const IRREGULAR = new Set(
  "put set cut hung laid did tore took got found made rebuilt built ran".split(
    " ",
  ),
);
/** Words on every invoice that claim nothing about the job. */
const PLAIN = new Set(
  (
    "labor labour material materials part parts job work hour hours minute minutes day days total flat rate charge charged " +
    "approx estimated including includes included used plus per existing"
  ).split(" "),
);

/** Lowercase words, hyphens split, "painter's" read as "painter". */
export function wordsOf(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[’']s\b/g, "")
      .match(/[a-z]+/g) ?? []
  );
}

/** Every form a word could take for plural and tense, so "boxes" meets "box" and "mudded" meets "mud". */
export function formsOf(word: string): Set<string> {
  const w = word.toLowerCase();
  const out = new Set([w]);
  const add = (s: string) => s.length >= 2 && out.add(s);
  if (w.endsWith("ies")) add(`${w.slice(0, -3)}y`);
  if (w.endsWith("ied")) add(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  for (const suffix of ["ed", "ing"]) {
    if (!w.endsWith(suffix)) continue;
    const base = w.slice(0, -suffix.length);
    add(base);
    add(`${base}e`);
    if (base.length >= 3 && base.at(-1) === base.at(-2)) add(base.slice(0, -1));
  }
  if (w.endsWith("d") && w.endsWith("ed") === false) add(w.slice(0, -1));
  return out;
}

const sameWord = (a: string, b: string) => {
  const fb = formsOf(b);
  return [...formsOf(a)].some((f) => fb.has(f));
};

export const saidIn = (word: string, text: string) =>
  wordsOf(text).some((w) => sameWord(word, w));

/** The words a phrase is checked by, and the ones dropped because they were never said. */
export function keyWords(
  phrase: string,
  transcript: string,
): { keys: string[]; unsaid: string[] } {
  const words = wordsOf(phrase).filter(
    (w) => !GRAMMAR.has(w) && !NUMBERS.has(w),
  );
  const nouns = words.filter((w) => !IRREGULAR.has(w) && !/(ed|ing)$/.test(w));
  const said = (list: string[]) => list.filter((w) => saidIn(w, transcript));
  const keys = said(nouns).length ? said(nouns) : said(words);
  return { keys, unsaid: words.filter((w) => !saidIn(w, transcript)) };
}

/** Key words of the phrase that aren't in the description. Empty means it's mentioned. */
export function missingFrom(
  description: string,
  phrase: string,
  transcript: string,
): string[] {
  return keyWords(phrase, transcript).keys.filter(
    (w) => !saidIn(w, description),
  );
}

/** Words in the text the speaker didn't say: the score's own reading, not the app's guard. */
export function unsaid(text: string, transcript: string): string[] {
  return [
    ...new Set(
      wordsOf(text).filter(
        (w) =>
          w.length >= 3 &&
          !GRAMMAR.has(w) &&
          !NUMBERS.has(w) &&
          !PLAIN.has(w) &&
          !saidIn(w, transcript),
      ),
    ),
  ];
}
