/**
 * The narration for the demo, written by demo.spec.ts as videos/voiceover.json next to the take:
 * [{ shot, at, text }], `at` in seconds of the EDITED video (after the waits are cut). The main
 * session lays ElevenLabs narration from it (round4/scripts/narrate.mjs). Lines are V.md's SV
 * voiceover, trimmed to fit, with every amount and count read from the screen in the take.
 */
import { cutBefore } from "../scripts/demo-finish";

export interface VoiceoverLine {
  shot: number;
  at: number;
  text: string;
}

/** The narrator's pace, as narrate.mjs estimates it. */
export const WORDS_PER_SECOND = 2.6;

type Span = { fromMs: number; toMs: number };

/**
 * Raw recording times to edited seconds, always in order. A line said before `openingSec` (the opening
 * card, before the record press) keeps its time; every other line waits for `notBeforeSec`, after the
 * spoken job.
 */
export function toEdited(lines: { shot: number; rawMs: number; text: string }[], cuts: Span[], notBeforeSec: number, openingSec = 0): VoiceoverLine[] {
  let last = 0;
  return lines.map((line) => {
    const edited = (line.rawMs - cutBefore(line.rawMs, cuts)) / 1000;
    last = Math.max(last, edited, edited < openingSec ? 0 : notBeforeSec);
    return { shot: line.shot, at: Math.round(last * 10) / 10, text: line.text };
  });
}

export const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Whether each line is said before the next one starts (or the video ends). */
export function fit(lines: VoiceoverLine[], endSec: number) {
  return lines.map((line, i) => {
    const room = (lines[i + 1]?.at ?? endSec) - line.at;
    const need = words(line.text) / WORDS_PER_SECOND;
    return { shot: line.shot, need: Math.round(need * 10) / 10, room: Math.round(room * 10) / 10, fits: need <= room + 0.05 };
  });
}

/** "$50.00" is said "$50"; "$472.03" stays as it is. */
export const spoken = (amount: string) => amount.replace(/\.00\b/, "");

/** The first dollar amount in a piece of screen text. */
export const amountIn = (text: string) => /\$\d[\d,]*(?:\.\d\d)?/.exec(text)?.[0];
