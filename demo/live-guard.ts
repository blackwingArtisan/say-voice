/**
 * The demo's live check. A take for judges must show the real thing: live AI, live speech and
 * PayPal's sandbox, with no screen that says mock or simulated. With DEMO_REQUIRE_LIVE=1 the run
 * fails on the first sign of either, instead of recording a take that would have to be thrown away.
 */
import type { Page } from "@playwright/test";

export const MOCK_WORDS = /\bmock\b|simulated/gi;

export const requireLive = (env: Record<string, string | undefined> = process.env) => env.DEMO_REQUIRE_LIVE === "1";

/** Each place a screen's text says mock or simulated, with a few words either side. */
export function mockWordsIn(text: string): string[] {
  return [...text.matchAll(MOCK_WORDS)].map((m) => text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, " ").trim());
}

interface KitStatus {
  ai: { mode: string };
  speech: { mode: string };
  paypal: { mode: string };
}

/** What isn't live, from /api/kit/status, plus a computer voice standing in for the person. */
export function notLive(status: KitStatus, placeholderVoice: boolean): string[] {
  return [
    status.ai.mode === "live" ? null : `AI is ${status.ai.mode}`,
    status.speech.mode === "live" ? null : `speech is ${status.speech.mode}`,
    status.paypal.mode === "sandbox" ? null : `PayPal is ${status.paypal.mode}`,
    placeholderVoice ? "the voice is the computer placeholder (set DEMO_VOICE)" : null,
  ].filter((x): x is string => x !== null);
}

export function assertLive(status: KitStatus, placeholderVoice: boolean) {
  if (!requireLive()) return;
  const problems = notLive(status, placeholderVoice);
  if (problems.length) throw new Error(`DEMO_REQUIRE_LIVE=1, but ${problems.join(", ")}. Not recording a take that isn't live.`);
}

/**
 * With DEMO_REQUIRE_LIVE=1, fails the run if any visible text, on the page or in the phone, says
 * mock or simulated. Without it, logs what it finds, so a practice take shows what a live one would trip on.
 */
export async function assertNoMockText(page: Page, where: string) {
  for (const frame of page.frames()) {
    const text = await frame.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    const hits = mockWordsIn(text);
    if (!hits.length) continue;
    const found = `the screen says mock at "${where}": ${hits.map((h) => `"${h}"`).join("; ")}`;
    if (requireLive()) throw new Error(`DEMO_REQUIRE_LIVE=1: ${found}`);
    console.log(`[demo] not live: ${found}`);
  }
}
