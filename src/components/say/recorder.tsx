"use client";

import { useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui";

const MAX_SECONDS = 120;
/** Bars in the level trace while recording. */
const LEVEL_BARS = 36;

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
    let lastBar = 0;
    let loudest = 0;
    const draw = (time: number) => {
      analyser.getFloatTimeDomainData(samples);
      const now = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
      peak = Math.max(peak, now);
      loudest = Math.max(loudest, now);
      const box = level.current;
      if (box) {
        box.dataset.peak = peak.toFixed(3);
        // A new bar every 80 ms, scrolling left: the last few seconds of your voice, so it's plain the mic hears you.
        if (time - lastBar > 80) {
          lastBar = time;
          const bars = Array.from(box.children) as HTMLElement[];
          for (let i = 0; i < bars.length - 1; i++) bars[i].style.height = bars[i + 1].style.height;
          if (bars.length) bars[bars.length - 1].style.height = `${Math.max(8, Math.min(100, loudest * 160))}%`;
          loudest = 0;
        }
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
      onError("This browser can't record here. Try Chrome or Safari, or the sample job below.");
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
      const name = e instanceof DOMException ? e.name : "";
      onError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "The microphone is blocked. Allow it in the browser's address bar, or try the sample job below."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone was found. Plug one in or use a phone, or try the sample job below."
            : name === "NotReadableError"
              ? "Another app is using the microphone. Close it and press record again, or try the sample job below."
              : "The microphone didn't start in this browser. Try Chrome or Safari, or the sample job below.",
      );
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
          <div ref={level} data-testid="mic-level" aria-hidden className="flex h-10 flex-1 items-center gap-[3px] overflow-hidden rounded-lg bg-zinc-50 px-2">
            {Array.from({ length: LEVEL_BARS }, (_, i) => (
              <span key={i} className="w-full min-w-[2px] rounded-full bg-brand" style={{ height: "8%" }} />
            ))}
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
