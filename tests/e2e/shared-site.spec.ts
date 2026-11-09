/** A judge opens the shared site after a hundred test runs. It has to look like theirs. */
import { expect, test } from "@playwright/test";
import { kitStatus, sentSample, startSample, tradeHistoryReady } from "./flow";
import { PAST_JOBS } from "../../src/lib/demo/past-invoices";

/** Every past job with a heating element: the price varies around $50, and the newest was $50. */
const ELEMENTS = PAST_JOBS.filter((j) => j.lines.some(([name]) => name === "Heating element")).length;

test("one visitor's jobs and prices stay out of the next visitor's way", async ({ page, browser, request }) => {
  const status = await kitStatus(request);
  test.skip(status.live, "Mock only: the live check spends on the one mic clip");
  // Mock PayPal holds exactly the seeded history. The shared sandbox holds more of the trade's invoices, newest 25 kept.
  const elements = status.paypal === "mock" ? String(ELEMENTS) : "\\d+";
  const count = (rest: string) => new RegExp(`^from ${elements} PayPal invoices, last \\$50\\.00${rest}$`);
  // Every visitor's book starts from the trade's past PayPal invoices, read once in the background.
  expect(await tradeHistoryReady(request)).toBe(true);

  // The first visitor sends the sample, and keeps a price the book doesn't like.
  await startSample(page);
  await page.getByTestId("invoice-line").nth(1).getByTestId("keep-line").click();
  await page.getByTestId("line-name").nth(0).fill("Sump pump labor");
  // An item with no history yet: "eighty" can be eighteen, so the day-one check asks, and claims no usual price.
  const renamed = page.getByTestId("invoice-line").nth(0);
  await expect(renamed.getByTestId("line-alike")).toContainText('Check this amount: "eighty" or "eighteen"?');
  await expect(renamed.getByTestId("line-alike")).not.toContainText(/usually/i);
  await expect(renamed.getByTestId("use-alike")).toHaveText("Use $18.00");
  await renamed.getByTestId("keep-line").click();
  await page.getByTestId("send-invoice").click();
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 });

  await page.goto("/prices");
  await expect(page.getByTestId("price-row").filter({ hasText: "Sump pump labor" })).toBeVisible();
  await expect(page.getByTestId("price-row").filter({ hasText: "Heating element" }).getByTestId("price-count")).toHaveText(count(", and 1 sent here"));
  await page.goto("/jobs");
  await expect(page.getByTestId("job-row")).toHaveCount(1);

  // A reload is the same visitor.
  await page.reload();
  await expect(page.getByTestId("job-row")).toHaveCount(1);

  // The next visitor gets the demo prices and an empty list.
  const next = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const judge = await next.newPage();
  await judge.goto("/prices");
  await expect(judge.getByTestId("price-row").first()).toBeVisible();
  await expect(judge.getByTestId("price-row").filter({ hasText: "Sump pump labor" })).toHaveCount(0);
  await expect(judge.getByTestId("price-row").filter({ hasText: "Heating element" }).getByTestId("price-count")).toHaveText(count(""));
  await expect(judge.getByTestId("learned-from-paypal")).toContainText("Learned from the trade's last");
  await judge.goto("/jobs");
  await expect(judge.getByTestId("try-sample")).toBeVisible();
  await expect(judge.getByTestId("job-row")).toHaveCount(0);
  await judge.screenshot({ path: "screenshots/fresh-visitor-jobs.png", fullPage: true });

  await startSample(judge);
  await expect(judge.getByTestId("line-usual")).toContainText(new RegExp(`Usually \\$50\\.00, from ${elements} PayPal invoices, last \\$50\\.00\\.`));
  await next.close();
});

test("a second sent invoice shows up on the same visitor's list", async ({ page, request }) => {
  test.skip((await kitStatus(request)).live, "Mock only: the live check spends on the one mic clip");
  await sentSample(page, request);
  await sentSample(page, request);
  await page.getByTestId("next-job").click(); // no reload, so the list has to catch up by itself
  await expect(page.getByTestId("job-row")).toHaveCount(2);
  await expect(page.getByTestId("try-sample")).toBeEnabled();
  await page.screenshot({ path: "screenshots/visitor-jobs.png", fullPage: true });
});
