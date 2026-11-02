/**
 * Chromium's fake microphone, playing one computer-voice clip through the app's real capture path.
 * The clip is not in this repo: macOS speech voices can't be redistributed, so it comes from the
 * spike folder or E2E_MIC_CLIP, and the mic test skips with a reason when it's absent.
 */
import fs from "node:fs";
import path from "node:path";
import { devices, type Project } from "@playwright/test";

export const MIC_CLIP = path.resolve(process.env.E2E_MIC_CLIP ?? "../../spikes/invoice/stt/fresh-2/audio16k/job09.noisy.wav");
export const hasMicClip = fs.existsSync(MIC_CLIP);

export const fakeMicProject: Project = {
  name: "fake-mic",
  testMatch: "mic-flow.spec.ts",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC_CLIP}%noloop`] },
  },
};
