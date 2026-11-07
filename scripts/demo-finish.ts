/**
 * Turns the demo's raw recordings into one video with sound (run by scripts/demo-record.sh).
 * PayPal's checkout opens in its own window, which Playwright records as its own file, so that
 * window is cut in for as long as it was open. The voice starts at the record press.
 *
 *   npx tsx scripts/demo-finish.ts test-results/demo/voice.wav
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = "test-results/demo";
const voice = process.argv[2];
const t = JSON.parse(fs.readFileSync(path.join(OUT, "timeline.json"), "utf8")) as { main: string; popups: { openMs: number; closeMs: number; video: string; size: { width: number; height: number } }[]; recordPressMs: number; endMs: number };
const sec = (ms: number) => (ms / 1000).toFixed(3);
/** Recorded at the phone's CSS size, then doubled for video sites. */
const PHONE = { width: 430, height: 932 };
const SIZE = `${PHONE.width * 2}:${PHONE.height * 2}`;
const UP = `scale=${SIZE}:flags=lanczos,setsar=1`;
/** Playwright scales a bigger window down to fit the video and pads the rest from the top left. */
const fitted = ({ width, height }: { width: number; height: number }) => {
  const f = Math.min(1, PHONE.width / width, PHONE.height / height);
  return `crop=${Math.floor(width * f)}:${Math.floor(height * f)}:0:0`;
};

const inputs = ["-i", t.main];
const parts: string[] = [];
const labels: string[] = [];
let from = 0;
t.popups.forEach((popup, i) => {
  inputs.push("-i", popup.video);
  parts.push(`[0:v]trim=${sec(from)}:${sec(popup.openMs)},setpts=PTS-STARTPTS,${UP}[m${i}]`);
  parts.push(`[${i + 1}:v]trim=0:${sec(popup.closeMs - popup.openMs)},setpts=PTS-STARTPTS,${fitted(popup.size)},scale=${SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${SIZE}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[p${i}]`);
  labels.push(`[m${i}]`, `[p${i}]`);
  from = popup.closeMs;
});
parts.push(`[0:v]trim=start=${sec(from)},setpts=PTS-STARTPTS,${UP}[tail]`);
labels.push("[tail]");
parts.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0,fps=30,format=yuv420p[v]`);
const voiceIndex = t.popups.length + 1;
inputs.push("-i", voice);
parts.push(`[${voiceIndex}:a]adelay=${t.recordPressMs}:all=1,apad[a]`);

const target = "videos/demo-say-voice.mp4";
const args = ["-y", "-loglevel", "error", ...inputs, "-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[a]", "-shortest", "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", target];
const run = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,duration:format=duration", "-of", "compact", target], { encoding: "utf8" }).stdout;
console.log(`[demo] wrote ${target}\n${probe.trim()}\n[demo] voice starts at ${sec(t.recordPressMs)}s (the record press)`);
const total = Number(/format\|duration=([\d.]+)/.exec(probe)?.[1] ?? 0);
if (total >= 180) {
  console.error(`[demo] ${total}s is over Devpost's 3-minute limit.`);
  process.exit(1);
}
