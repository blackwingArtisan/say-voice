/**
 * The sample job in a real browser: a judge with no mic. `npm run test:e2e` runs it on mock PayPal;
 * `npm run test:e2e:sandbox` sends a real sandbox invoice and re-reads it straight from PayPal.
 * The job is the known trap: "fifty" heard as "fifteen". The confirm screen has to catch it.
 */
import { expect, test } from "@playwright/test";
import { kitStatus, money, readJob, jobId, sendAndVerify } from "./flow";
import { SAMPLE_AMOUNTS } from "../../src/lib/say/sample";

test("sample job: catch the misheard price, fix it, approve, invoice sent", async ({ page, request }) => {
  const { live, paypal } = await kitStatus(request);
  test.skip(live, "Keeps a live run to the one mic clip");

  await page.goto("/jobs");
  await page.getByTestId("try-sample").click();
  await page.waitForURL(/\/jobs\/job_/);

  // Transcript beside every number, with the flag on the row it's about.
  await expect(page.getByTestId("transcript")).toContainText("make that fifteen dollars");
  await expect(page.getByTestId("invoice-line")).toHaveCount(2);
  const element = page.getByTestId("invoice-line").nth(1);
  await expect(element.getByTestId("line-name")).toHaveValue("Heating element");
  await expect(element.getByTestId("line-flag")).toContainText("Heating element");
  await expect(element.getByTestId("line-heard")).toContainText("fifteen");
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.heardTotalCents));
  await expect(page.getByTestId("missing-amount")).toHaveCount(0);

  // Nothing about a date was said, so it's 14 days from the person's own day, not the server's.
  const expectedDue = await page.evaluate(() => {
    const due = new Date();
    due.setDate(due.getDate() + 14);
    return due.toLocaleDateString("en-CA");
  });
  await expect(page.getByTestId("due-date")).toHaveValue(expectedDue);

  // Totals follow the edit, and the code works them out.
  await element.getByTestId("line-price").fill((SAMPLE_AMOUNTS.spokenElementCents / 100).toFixed(2));
  await expect(element.getByTestId("line-total")).toHaveText(money(SAMPLE_AMOUNTS.spokenElementCents));
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.spokenTotalCents));
  await expect(element.getByTestId("line-changed")).toContainText(money(SAMPLE_AMOUNTS.heardElementCents));
  // Corrected, so the $15 no longer counts as an amount with no line item.
  await expect(page.getByTestId("missing-amount")).toHaveCount(0);
  await expect(page.getByTestId("flags-panel")).toContainText("1 thing to check");
  await page.screenshot({ path: `screenshots/confirm-${paypal}.png`, fullPage: true });

  const done = await sendAndVerify(page, request, SAMPLE_AMOUNTS.spokenTotalCents, "sample");
  expect(done.source).toBe("sample");
  expect(done.lines.map((l) => l.unitCents)).toEqual([8000, SAMPLE_AMOUNTS.spokenElementCents]);
});

test("declining sends nothing, and the job stays editable", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(live, "Keeps a live run to the one mic clip");

  await page.goto("/jobs");
  await page.getByTestId("try-sample").click();
  await page.waitForURL(/\/jobs\/job_/);
  await page.getByTestId("send-invoice").click();
  await expect(page.getByTestId("approval-prompt")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("approval-prompt").getByRole("button", { name: "Decline" }).click();
  await expect(page.getByTestId("job-error")).toContainText("nothing was sent", { timeout: 30_000 });
  await expect(page.getByTestId("line-price").first()).toBeEnabled();
  const job = await readJob(request, jobId(page));
  expect(job.status).toBe("review");
  expect(job.invoice).toBeUndefined();
});

test("deleting a spoken item warns about the amount left over", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(live, "Keeps a live run to the one mic clip");

  await page.goto("/jobs");
  await page.getByTestId("try-sample").click();
  await page.waitForURL(/\/jobs\/job_/);
  await page.getByRole("button", { name: "Remove Heating element" }).click();
  await expect(page.getByTestId("missing-amount")).toContainText(money(SAMPLE_AMOUNTS.heardElementCents));
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.laborCents));
});

test("adding an item the speaker didn't mention updates the total", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(live, "Keeps a live run to the one mic clip");

  await page.goto("/jobs");
  await page.getByTestId("try-sample").click();
  await page.waitForURL(/\/jobs\/job_/);
  await page.getByTestId("add-line").click();
  const added = page.getByTestId("invoice-line").nth(2);
  await added.getByTestId("line-name").fill("Disposal fee");
  await added.getByTestId("line-price").fill("12.50");
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.heardTotalCents + 1250));
  await page.getByTestId("tax-rate").fill("10");
  await expect(page.getByTestId("tax-total")).toHaveText("$8.75");
});
