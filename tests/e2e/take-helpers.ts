/**
 * A stand-in microphone that works in every engine: a tone through the page's own MediaRecorder.
 * The real capture path is proved by mic-flow.spec.ts on Chromium's fake mic. This is for what the
 * page does with a take afterwards. Uploads are counted, so a test can compare them.
 */
import { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    uploads: { size: number; sum: number; type: string }[];
  }
}

export async function useToneMic(page: Page) {
  await page.addInitScript(() => {
    window.uploads = [];
    const send = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).endsWith("/api/speech") && init?.body instanceof Blob) {
        const bytes = new Uint8Array(await init.body.arrayBuffer());
        window.uploads.push({ size: bytes.length, sum: bytes.reduce((a, b) => (a * 31 + b) >>> 0, 7), type: init.body.type });
      }
      return send(input, init);
    };
    const tone = async () => {
      const audio = new AudioContext();
      const osc = audio.createOscillator();
      const out = audio.createMediaStreamDestination();
      osc.connect(out);
      osc.start();
      return out.stream;
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: tone } });
  });
}

/** Picks the customer and records a second or so. Stops before anything comes back. */
export async function recordTake(page: Page) {
  await page.getByTestId("record-start").click();
  await expect(page.getByTestId("record-time")).toHaveText("0:01", { timeout: 15_000 });
  await page.getByTestId("record-stop").click();
}

export const uploads = (page: Page) => page.evaluate(() => window.uploads);
