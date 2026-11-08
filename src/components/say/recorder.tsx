"use client";

import { useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui";

const MAX_SECONDS = 120;

// The sealed speech tests measured raw audio, so the browser's own clean-up stays off.
const CAPTURE: MediaTrackConstraints = { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false };

function pickMimeType(): string {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

interface Session {
  recorder: MediaRecorder;
  stream: MediaStream;
  audio: AudioContext;
  frame: number;
  ticker: ReturnType<typeof setInterval>;
}

/** Records one take with MediaRecorder and hands back the audio. The bar shows the mic is live. */
export function Recorder({ disabled, onRecorded, onError }: { disabled?: boolean; onRecorded: (audio: Blob) => void; onError: (message: string) => void }) {
  const [state, setState] = useState<"idle" | "starting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const session = useRef<Session | null>(null);
  const level = useRef<HTMLDivElement>(null);

  function meter(audio: AudioContext, stream: MediaStream) {
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    const draw = () => {
      analyser.getFloatTimeDomainData(samples);
      const now = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
      peak = Math.max(peak, now);
      if (level.current) {
        level.current.style.width = `${Math.min(100, now * 140)}%`;
        level.current.dataset.peak = peak.toFixed(3);
      }
      if (session.current) session.current.frame = requestAnimationFrame(draw);
    };
    return requestAnimationFrame(draw);
  }

  function finish(s: Session) {
    clearInterval(s.ticker);
    cancelAnimationFrame(s.frame);
    s.stream.getTracks().forEach((track) => track.stop());
    void s.audio.close();
    session.current = null;
    setState("idle");
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("This browser can't record here. Try the sample job, or open the app over HTTPS.");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: CAPTURE });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const current = session.current;
        if (current) finish(current);
        onRecorded(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      const audio = new AudioContext();
      setSeconds(0);
      const startedAt = Date.now();
      const ticker = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
      }, 250);
      session.current = { recorder, stream, audio, ticker, frame: 0 };
      session.current.frame = meter(audio, stream);
      recorder.start(1000);
      setState("recording");
    } catch (e) {
      setState("idle");
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      onError(denied ? "The microphone is blocked. Allow it in the browser, or try the sample job." : `The microphone didn't start: ${(e as Error).message}`);
    }
  }

  if (state === "recording") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-red-500" />
          </span>
          <span className="font-mono text-sm tabular-nums text-zinc-700" data-testid="record-time">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div ref={level} data-testid="mic-level" className="h-full w-0 rounded-full bg-brand" />
          </div>
        </div>
        <Button size="lg" variant="dark" className="w-full" icon={<Square className="size-4" />} onClick={() => session.current?.recorder.stop()} data-testid="record-stop">
          Stop and read it back
        </Button>
      </div>
    );
  }
  return (
    <Button size="lg" className="w-full" icon={<Mic className="size-5" />} loading={state === "starting"} disabled={disabled} onClick={start} data-testid="record-start">
      Press to record
    </Button>
  );
}
