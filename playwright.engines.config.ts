/**
 * The mock suite on other browsers (npm run test:e2e:engines). Run once per engine, one at a time:
 * ENGINE=webkit, firefox, iphone or android. The real-mic test stays Chromium-only.
 */
import { devices } from "@playwright/test";
import base from "./playwright.config";

const engines = {
  webkit: devices["Desktop Safari"],
  firefox: devices["Desktop Firefox"],
  iphone: devices["iPhone 15"],
  android: devices["Pixel 7"],
};

const name = (process.env.ENGINE ?? "webkit") as keyof typeof engines;

const config = {
  ...base,
  outputDir: `test-results-${name}`,
  reporter: "line",
  projects: [{ name, testIgnore: "mic-flow.spec.ts", use: engines[name] }],
};

export default config;
