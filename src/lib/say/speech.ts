/**
 * Speech to text: ElevenLabs Scribe v2 alone, with the settings from the spikes (English, no
 * keyterms, no audio tags). Mock mode returns the sample transcript, so the app runs with no keys.
 * The audio goes to ElevenLabs and is not stored here.
 */
import { isAiLive } from "@/lib/ai";
import { getEnv } from "@/lib/env";
import { startStep } from "@/lib/events/bus";
import { HttpError } from "@/lib/http";
import { SAMPLE_TRANSCRIPT } from "./sample";

const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const USD_PER_HOUR = 0.22; // elevenlabs.io/pricing/api, checked 2026-11-01

export const SPEECH_MODEL_LABEL = "ElevenLabs Scribe v2";
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export interface Transcription {
  transcript: string;
  mocked: boolean;
  durationSec?: number;
}

function apiKey(): string | undefined {
  getEnv();
  return process.env.ELEVENLABS_API_KEY?.trim() || undefined;
}

/** AI_MODE=mock turns speech off too, so a mock run can never spend. */
export const isSpeechLive = () => isAiLive() && Boolean(apiKey());

const EXTENSIONS: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mpeg": "mp3" };

/** ElevenLabs says "no credit" with a 401 or 402 and a status word in the body. */
const OUT_OF_CREDIT = /quota_exceeded|payment_required|payment_issue|paid_plan_required|insufficient/i;

export const isSpeechOutOfCredit = (status: number, body: string) => status === 402 || ((status === 401 || status === 403 || status === 429) && OUT_OF_CREDIT.test(body));

interface ScribeResponse {
  text?: string;
  words?: { end?: number }[];
}

export async function transcribe(audio: ArrayBuffer, contentType: string): Promise<Transcription> {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const step = startStep({ kind: "ai", title: `Speech to text · ${isSpeechLive() ? SPEECH_MODEL_LABEL : "mock"}`, subtitle: `${Math.round(audio.byteLength / 1024)} KB of ${type || "audio"}` });
  if (!isSpeechLive()) {
    step.succeed({ detail: "Speech mock mode: returned the sample transcript" });
    return { transcript: SAMPLE_TRANSCRIPT, mocked: true };
  }

  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("language_code", "eng");
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([audio], { type }), `dictation.${EXTENSIONS[type] ?? "webm"}`);

  try {
    const res = await fetch(SCRIBE_URL, { method: "POST", headers: { "xi-api-key": apiKey()! }, body: form, signal: AbortSignal.timeout(90_000) });
    if (!res.ok) {
      if (isSpeechOutOfCredit(res.status, await res.text().catch(() => ""))) throw new HttpError(402, "Speech to text has run out of credit.", "speech_credit");
      throw new HttpError(502, `Speech to text failed (${res.status}). Try again, or use the sample job.`, "speech_failed");
    }
    const body = (await res.json()) as ScribeResponse;
    const durationSec = body.words?.reduce((end, word) => Math.max(end, word.end ?? 0), 0);
    const cost = durationSec ? ((durationSec / 3600) * USD_PER_HOUR).toFixed(4) : null;
    step.succeed({ detail: durationSec ? `${durationSec.toFixed(1)} s heard, about $${cost}` : undefined });
    return { transcript: (body.text ?? "").trim(), mocked: false, durationSec };
  } catch (error) {
    step.fail(error);
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Speech to text could not be reached. Try again, or use the sample job.", "speech_failed");
  }
}
