import { defineConfig, devices } from "@playwright/test";
import { fakeMicProject } from "./tests/e2e/fake-mic";

/**
 * The whole flow on the real PayPal sandbox (npm run test:e2e:sandbox): a real sandbox invoice is
 * created and sent to a fictional example.com customer. AI and speech are mocked unless
 * E2E_AI_MODE=live, which spends real money. Uses a production build: `next dev` can reload endlessly.
 * Set E2E_BASE_URL to run the same flow against a deployed copy instead of a local build.
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
const HOSTED = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["say-flow.spec.ts", "no-leftovers.spec.ts", "mic-flow.spec.ts"],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/sandbox",
  use: {
    baseURL: HOSTED ?? `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", testIgnore: "mic-flow.spec.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }, fakeMicProject],
  webServer: HOSTED ? undefined : {
    command: `rm -rf .data-sandbox && npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/kit/status`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      PAYPAL_MODE: "sandbox",
      AI_MODE: process.env.E2E_AI_MODE ?? "mock",
      KIT_DATA_DIR: ".data-sandbox",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
