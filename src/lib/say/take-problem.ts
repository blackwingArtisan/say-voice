/**
 * What went wrong with a recording, in words a person can act on. The recording is kept in every
 * case but one: when nothing was heard, trying the same audio again won't help. Server text is
 * only shown where this app wrote it: anything else can be a raw API or proxy error.
 */
export interface Refusal {
  status?: number;
  type?: string;
  message?: string;
  retryAfter?: number;
  /** The limit hit, when the server said: "8 a minute". */
  limit?: number;
  per?: "minute" | "day";
}

/** "This demo allows 8 AI requests a minute per person." The real number, when the server sent it. */
export const limitSentence = ({ limit, per }: Pick<Refusal, "limit" | "per">) => `This demo allows ${limit ? `${limit} AI requests a ${per ?? "minute"}` : "a few AI requests a minute"} per person.`;

export interface TakeProblem {
  title: string;
  detail: string;
  /** False when the same audio would fail the same way. */
  retry: boolean;
  /** Seconds before a retry can work. */
  waitSeconds?: number;
}

const SAFE = "Your recording is safe in this browser.";

export function explainTake({ status, type, message, retryAfter, limit, per }: Refusal): TakeProblem {
  switch (type) {
    case "rate_limited":
      return { title: per === "day" ? "Too many tries today" : "Too many tries in a minute", detail: `${SAFE} ${limitSentence({ limit, per })} Wait for the timer, then press Try again.`, retry: true, waitSeconds: retryAfter ?? 60 };
    case "ai_credit":
      return { title: "The AI is out of credit for now", detail: `${message ?? ""} ${SAFE} Come back and press Try again, even after closing this page. The sample job still works.`.trim(), retry: true };
    case "speech_credit":
      return { title: "Speech to text is out of credit for now", detail: `${SAFE} Come back and press Try again, even after closing this page. The sample job still works.`, retry: true };
    case "network":
      return { title: "Couldn't reach the server", detail: `${SAFE} Check your signal, then press Try again.`, retry: true };
    case "empty_audio":
    case "empty_transcript":
      return { title: "Nothing was heard", detail: "That recording had no words in it. Check the mic, then record it again.", retry: false };
    case "audio_too_large":
      return { title: "That recording is too long", detail: "Keep it under two minutes, then record it again.", retry: false };
    case "unsupported_media":
      return { title: "This browser recorded in a format the app can't read", detail: "Try the sample job, or another browser.", retry: false };
    case "speech_failed":
      return { title: "Speech to text didn't answer", detail: `${SAFE} Press Try again in a moment.`, retry: true };
    default:
      return { title: status === undefined ? "That recording didn't go through" : "The app couldn't read that recording", detail: `${SAFE} Press Try again in a moment.`, retry: true };
  }
}

export const RESTORED: TakeProblem = { title: "You have a recording that wasn't read yet", detail: "It's still in this browser. Press Try again, or delete it and record a new one.", retry: true };

/** The same explanation for a job that isn't tied to a recording: the sample. */
export function explainSample(refusal: Refusal): string {
  if (refusal.type === "rate_limited") return `${limitSentence(refusal)} Try again in ${refusal.retryAfter ?? 60} seconds.`;
  if (refusal.type === "network") return "Couldn't reach the server. Check your signal, then try again.";
  return "Try again in a moment.";
}

/**
 * Why a reminder didn't start, said on the reminder card (not a toast that's gone in seconds), so the
 * person always sees either the note to approve or this. Server text only where this app wrote it.
 */
export function explainReminderAsk({ status, type, message, retryAfter, limit, per }: Refusal): string {
  switch (type) {
    case "rate_limited":
      return `${limitSentence({ limit, per })} Try again in ${retryAfter ?? 60} seconds.`;
    case "ai_credit":
    case "ai_budget":
      return "The AI is out of credit for now, so try again later.";
    case "network":
      return "Couldn't reach the server. Check your signal, then try again.";
    default:
      return (status === 409 || status === 422) && message ? message : "The reminder didn't start. Try again.";
  }
}
