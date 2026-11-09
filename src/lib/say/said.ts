import type { JobView } from "./types";

/** "38 words in 0:24": how much was said, from the transcript and the recording's length. */
export function saidSize(job: Pick<JobView, "transcript" | "speech">): string {
  const words = job.transcript.trim().split(/\s+/).filter(Boolean).length;
  const sec = Math.round(job.speech?.durationSec ?? 0);
  const length = sec > 0 ? ` in ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "";
  return `${words} ${words === 1 ? "word" : "words"}${length}`;
}
