/** A judge opens the shared site after a hundred test runs. It has to look like theirs. */
import { expect, test } from "@playwright/test";
import { kitStatus, sentSample, startSample } from "./flow";

test("one visitor's jobs and prices stay out of the next visitor's way", async ({ page, browser, request }) => {
  test.skip((await kitStatus(request)).live, "Mock only: the live check spends on the one mic clip");

  // The first visitor sends the sample, and keeps a price the book doesn't like.
  await startSample(page);
  await page.getByTestId("invoice-line").nth(1).getByTestId("keep-line").click();
  await page.getByTestId("line-name").nth(0).fill("Sump pump labor");
  await page.getByTestId("send-invoice").click();
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 });

  await page.goto("/prices");
  await expect(page.getByTestId("price-row").filter({ hasText: "Sump pump labor" })).toBeVisible();
  await expect(page.getByTestId("price-row").filter({ hasText: "Heating element" }).getByTestId("price-count")).toContainText("6 invoices");
  await page.goto("/jobs");
  await expect(page.getByTestId("job-row")).toHaveCount(1);

  // A reload is the same visitor.
  await page.reload();
  await expect(page.getByTestId("job-row")).toHaveCount(1);

  // The next visitor gets the demo prices and an empty list.
  const next = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const judge = await next.newPage();
  await judge.goto("/prices");
  await expect(judge.getByTestId("price-row")).toHaveCount(7);
  await expect(judge.getByTestId("price-row").filter({ hasText: "Heating element" }).getByTestId("price-count")).toContainText("5 invoices");
  await judge.goto("/jobs");
  await expect(judge.getByTestId("try-sample")).toBeVisible();
  await expect(judge.getByTestId("job-row")).toHaveCount(0);
  await judge.screenshot({ path: "screenshots/fresh-visitor-jobs.png", fullPage: true });

  await startSample(judge);
  await expect(judge.getByTestId("line-usual")).toContainText("Usually $50.00, from 5 invoices");
  await next.close();
});

test("a second sent invoice shows up on the same visitor's list", async ({ page, request }) => {
  test.skip((await kitStatus(request)).live, "Mock only: the live check spends on the one mic clip");
  await sentSample(page, request);
  await sentSample(page, request);
  await page.goto("/jobs");
  await expect(page.getByTestId("job-row")).toHaveCount(2);
  await page.screenshot({ path: "screenshots/visitor-jobs.png", fullPage: true });
});
