/**
 * Turns the demo's raw recordings into one 16:9 video with sound (run by scripts/demo-record.sh).
 * PayPal's checkout opens in its own window, which Playwright records as its own file, so that
 * window is cut in for as long as it was open. Waits nobody needs to watch (a model thinking, a
 * page loading) are cut out. The voice starts at the record press.
 *
 *   npx tsx scripts/demo-finish.ts test-results/demo/voice.wav
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Span = { fromMs: number; toMs: number };
type Timeline = { main: string; popups: { openMs: number; closeMs: number; video: string; size: { width: number; height: number } }[]; cuts: Span[]; recordPressMs: number; recordStopMs: number; endMs: number };

/** Recorded at 1280x720 CSS pixels (demo/demo.spec.ts), finished at 1920x1080. */
const VIEW = { width: 1280, height: 720 };
const SIZE = "1920:1080";

/** What's left of [fromMs, toMs] once the cuts are taken out. */
export function keep(span: Span, cuts: Span[]): Span[] {
  let pieces = [span];
  for (const cut of [...cuts].sort((a, b) => a.fromMs - b.fromMs)) {
    pieces = pieces.flatMap((p) => {
      if (cut.toMs <= p.fromMs || cut.fromMs >= p.toMs) return [p];
      return [
        { fromMs: p.fromMs, toMs: Math.max(p.fromMs, cut.fromMs) },
        { fromMs: Math.min(p.toMs, cut.toMs), toMs: p.toMs },
      ].filter((q) => q.toMs - q.fromMs > 40);
    });
  }
  return pieces;
}

/** How much of the video before `ms` was cut. */
export function cutBefore(ms: number, cuts: Span[]) {
  return cuts.reduce((sum, c) => sum + Math.max(0, Math.min(ms, c.toMs) - c.fromMs), 0);
}

function main() {
  const OUT = "test-results/demo";
  const voice = process.argv[2];
  const t = JSON.parse(fs.readFileSync(path.join(OUT, "timeline.json"), "utf8")) as Timeline;
  const cuts = t.cuts ?? [];
  if (cuts.some((c) => c.toMs > t.recordPressMs && c.fromMs < t.recordStopMs)) throw new Error("A cut falls while the voice is playing.");
  const sec = (ms: number) => (ms / 1000).toFixed(3);
  /** Playwright scales a bigger window down to fit the video and pads the rest from the top left. */
  const fitted = ({ width, height }: { width: number; height: number }) => {
    const f = Math.min(1, VIEW.width / width, VIEW.height / height);
    return `crop=${Math.floor(width * f)}:${Math.floor(height * f)}:0:0`;
  };
  const UP = `scale=${SIZE}:flags=lanczos,setsar=1`;
  const POPUP = (size: Timeline["popups"][number]["size"]) => `${fitted(size)},scale=${SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${SIZE}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1`;

  // The video in main-recording time: the main page, with each checkout window in place while it was open.
  const sources: { input: number; offsetMs: number; span: Span; filter: string }[] = [];
  let from = 0;
  t.popups.forEach((popup, i) => {
    sources.push({ input: 0, offsetMs: 0, span: { fromMs: from, toMs: popup.openMs }, filter: UP });
    sources.push({ input: i + 1, offsetMs: popup.openMs, span: { fromMs: popup.openMs, toMs: popup.closeMs }, filter: POPUP(popup.size) });
    from = popup.closeMs;
  });
  sources.push({ input: 0, offsetMs: 0, span: { fromMs: from, toMs: t.endMs }, filter: UP });

  const inputs = ["-i", t.main, ...t.popups.flatMap((p) => ["-i", p.video])];
  const parts: string[] = [];
  const labels: string[] = [];
  for (const s of sources)
    for (const piece of keep(s.span, cuts)) {
      const label = `[s${labels.length}]`;
      parts.push(`[${s.input}:v]trim=${sec(piece.fromMs - s.offsetMs)}:${sec(piece.toMs - s.offsetMs)},setpts=PTS-STARTPTS,${s.filter}${label}`);
      labels.push(label);
    }
  parts.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0,fps=30,format=yuv420p[v]`);
  const voiceAtMs = Math.round(t.recordPressMs - cutBefore(t.recordPressMs, cuts));
  inputs.push("-i", voice);
  parts.push(`[${t.popups.length + 1}:a]adelay=${voiceAtMs}:all=1,apad[a]`);

  const target = "videos/demo-say-voice.mp4";
  const args = ["-y", "-loglevel", "error", ...inputs, "-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[a]", "-shortest", "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", target];
  const run = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status ?? 1);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,duration:format=duration", "-of", "compact", target], { encoding: "utf8" }).stdout;
  const total = Number(/format\|duration=([\d.]+)/.exec(probe)?.[1] ?? 0);
  console.log(`[demo] wrote ${target}\n${probe.trim()}\n[demo] ${cuts.length} waits cut (${sec(cutBefore(t.endMs, cuts))}s); voice starts at ${sec(voiceAtMs)}s (the record press)`);
  if (total >= 105) {
    console.error(`[demo] ${total}s is over the 1:45 target (Devpost allows 3:00).`);
    process.exit(1);
  }
  if (total < 60) console.warn(`[demo] ${total.toFixed(1)}s: shorter than expected; check every scene is there.`);
}

if (process.argv[1]?.endsWith("demo-finish.ts")) main();
