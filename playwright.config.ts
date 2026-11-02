import { defineConfig, devices } from "@playwright/test";
import { fakeMicProject } from "./tests/e2e/fake-mic";

/**
 * End-to-end tests (npm run test:e2e). Starts the dev server in PayPal MOCK mode with its own
 * data dir. AI is mocked unless E2E_AI_MODE=live (then real Claude and ElevenLabs, tiny spend).
 * A second project drives the real recorder with Chromium's fake microphone.
 */
const PORT = Number(process.env.E2E_PORT ?? 3110);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", testIgnore: "mic-flow.spec.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }, fakeMicProject],
  webServer: {
    // A stale dev cache makes `next dev` reload forever after a source edit, so each run starts clean.
    command: `rm -rf .next-e2e/dev .data-e2e && npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/kit/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PAYPAL_MODE: process.env.E2E_PAYPAL_MODE ?? "mock",
      AI_MODE: process.env.E2E_AI_MODE ?? "mock",
      KIT_DATA_DIR: ".data-e2e",
      MOCK_PAYPAL_LATENCY_MS: "60-160",
      NEXT_DIST_DIR: ".next-e2e",
      AI_RATE_LIMIT_PER_MINUTE: "60", // the suite makes more jobs in a minute than a person does
    },
  },
});
