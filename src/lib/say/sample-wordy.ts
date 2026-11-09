import { SAMPLE_TRANSCRIPT } from "./sample";

/**
 * The sample job said with one more sentence, for the mock AI only. Extraction reads it as the
 * sample; the description fixture writes like live AI often does, adding words that weren't said
 * ("diagnosed", "thermal fuse", "terminal block"), so each line gets a "wasn't in what you said" note.
 * ("Installed" alone would pass: it's a fair way to say "new", see fairParaphrase in wording.ts.)
 */
export const WORDY_TRANSCRIPT = `${SAMPLE_TRANSCRIPT} Thanks.`;

export const WORDY_DESCRIPTION = {
  job_summary: "Dryer would not heat: new heating element, runs hot again",
  job_site: "",
  service_date: "",
  service_date_words: "",
  lines: {
    Labor: "Diagnosed the dryer that would not heat and checked the thermal fuse. It runs hot again and the vent is clear.",
    "Heating element": "New heating element and terminal block installed in the dryer",
  } as Record<string, string>,
};
