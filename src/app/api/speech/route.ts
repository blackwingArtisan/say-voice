import { HttpError, route } from "@/lib/http";
import { MAX_AUDIO_BYTES, transcribe } from "@/lib/say/speech";

/** Raw audio in, transcript out. Nothing is stored. */
export const POST = route(
  async (req) => {
    // When the words reached the app, by the server's clock: the start of said to sent.
    const heardAt = new Date().toISOString();
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.startsWith("audio/")) throw new HttpError(415, "Send the recording as audio.", "unsupported_media");
    const audio = await req.arrayBuffer();
    if (audio.byteLength === 0) throw new HttpError(422, "The recording was empty. Try again.", "empty_audio");
    if (audio.byteLength > MAX_AUDIO_BYTES) throw new HttpError(413, "That recording is too long. Keep it under a few minutes.", "audio_too_large");
    const result = await transcribe(audio, contentType);
    if (!result.transcript) throw new HttpError(422, "Nothing was heard in that recording. Try again.", "empty_transcript");
    return { ...result, audioBytes: audio.byteLength, heardAt };
  },
  { rateLimit: "ai" },
);
