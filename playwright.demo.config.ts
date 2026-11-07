import { defineConfig } from "@playwright/test";

/**
 * Demo recording (npm run demo:record, which runs scripts/demo-record.sh). Builds the app, starts it
 * and records demo/demo.spec.ts at phone width. The spec makes its own browser context, so the video
 * settings live there. The spec plays DEMO_VOICE_WAV as the microphone, so the speech model
 * really hears it. Mock PayPal and AI unless DEMO_PAYPAL_MODE=sandbox and DEMO_AI_MODE=live.
 */
const PORT = Number(process.env.DEMO_PORT ?? 3930);
const PAYPAL_MODE = process.env.DEMO_PAYPAL_MODE ?? process.env.PAYPAL_MODE ?? "mock";

export default defineConfig({
  testDir: "demo",
  timeout: 420_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/demo/out",
  use: {
    launchOptions: {
      slowMo: 60,
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    // Production build: no dev reloads or overlays in the recording.
    command: `rm -rf .data-demo && npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/kit/status`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      PAYPAL_MODE,
      AI_MODE: process.env.DEMO_AI_MODE ?? "mock",
      AI_DAILY_CAP_USD: process.env.DEMO_AI_CAP_USD ?? "0.40",
      KIT_DATA_DIR: ".data-demo",
      MOCK_PAYPAL_LATENCY_MS: "250-600",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
