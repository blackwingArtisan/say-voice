/**
 * The sample job in a real browser: a judge with no mic. `npm run test:e2e` runs it on mock PayPal;
 * `npm run test:e2e:sandbox` sends a real sandbox invoice and re-reads it straight from PayPal.
 * The job is the known trap: "fifty" heard as "fifteen". The confirm screen has to catch it.
 */
import { expect, test, type Page } from "@playwright/test";
import { checkCount, fixElementPrice, keepToOneCall, kitStatus, money, paceAiCalls, readJob, jobId, sendAndVerify, settleAiNotes, startSample, visitorHeaders } from "./flow";
import { SAMPLE_AMOUNTS } from "../../src/lib/say/sample";
import type { PriceEntry } from "../../src/lib/say/price-book";

const priceCount = async (page: Page) => {
  const { prices } = (await (await page.request.get("/api/prices", { headers: await visitorHeaders(page) })).json()) as { prices: PriceEntry[] };
  return prices.find((entry) => entry.name === "Heating element")!.samples.length;
};

test("sample job: catch the misheard price, fix it, approve, invoice sent", async ({ page, request }) => {
  const { live, paypal } = await kitStatus(request);
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");

  await startSample(page);
  const before = await priceCount(page);

  // Transcript beside every number, with the flag on the row it's about.
  await expect(page.getByTestId("transcript")).toContainText("make that fifteen dollars");
  await expect(page.getByTestId("invoice-line")).toHaveCount(2);
  const element = page.getByTestId("invoice-line").nth(1);
  await expect(element.getByTestId("line-name")).toHaveValue("Heating element");
  await expect(element.getByTestId("line-heard")).toContainText("fifteen");
  await expect(page.getByTestId("quantity-note")).toContainText("Read the quantities yourself");
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.heardTotalCents));
  await expect(page.getByTestId("missing-amount")).toHaveCount(0);
  await expect(page.getByTestId("flags-panel")).toContainText(checkCount);

  // The code's check names the usual price, and nothing can be sent until the person deals with it.
  await expect(element.getByTestId("line-usual")).toContainText("Usually $50.00");
  await expect(element.getByTestId("line-usual")).toContainText('"fifteen" sounds like "fifty"');
  // One voice on the row: the AI's own doubt about this price would differ from run to run.
  await expect(element.getByTestId("line-flag")).toHaveCount(0);
  await expect(page.getByTestId("send-invoice")).toHaveCount(0);
  await expect(page.getByTestId("next-check")).toContainText(checkCount);

  // Nothing about a date was said, so it's 14 days from the person's own day, not the server's.
  const expectedDue = await page.evaluate(() => {
    const due = new Date();
    due.setDate(due.getDate() + 14);
    return due.toLocaleDateString("en-CA");
  });
  await expect(page.getByTestId("due-date")).toHaveValue(expectedDue);

  // Totals follow the edit, and the code works them out.
  await fixElementPrice(page);
  await expect(element.getByTestId("line-total")).toHaveText(money(SAMPLE_AMOUNTS.spokenElementCents));
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.spokenTotalCents));
  await expect(element.getByTestId("line-changed")).toContainText(money(SAMPLE_AMOUNTS.heardElementCents));
  // Corrected, so the $15 no longer counts as an amount with no line item.
  await expect(page.getByTestId("missing-amount")).toHaveCount(0);
  await expect(page.getByTestId("flags-panel")).toHaveCount(0);
  await expect(element.getByTestId("line-usual")).toHaveCount(0);
  await page.screenshot({ path: `screenshots/confirm-${paypal}.png`, fullPage: true });

  const done = await sendAndVerify(page, request, SAMPLE_AMOUNTS.spokenTotalCents, "sample");
  expect(done.source).toBe("sample");
  expect(done.lines.map((l) => l.unitCents)).toEqual([8000, SAMPLE_AMOUNTS.spokenElementCents]);
  expect(done.heardLines.map((l) => l.unitCents)).toEqual([8000, SAMPLE_AMOUNTS.heardElementCents]);

  // The invoice went out, so its prices count as confirmed.
  expect(await priceCount(page)).toBe(before + 1);
  await page.goto("/prices");
  const row = page.getByTestId("price-row").filter({ hasText: "Heating element" });
  await expect(row.getByTestId("price-usual")).toHaveText(money(SAMPLE_AMOUNTS.spokenElementCents));
  await expect(row.getByTestId("price-count")).toContainText(`${before + 1} invoices`);
});

test("a price the person keeps goes out, and the server won't skip the check", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");

  await startSample(page);
  const job = await readJob(request, jobId(page));
  const body = { customer: job.customer, lines: job.lines, taxRateMilli: job.taxRateMilli, dueDate: job.dueDate, acknowledged: [] };

  // Straight at the API, past the screen: refused, and the job hasn't moved.
  const refused = await request.post(`/api/jobs/${job.id}/send`, { data: body });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error.message).toContain("Usually $50.00");
  expect((await readJob(request, job.id)).status).toBe("review");

  // Keeping it is allowed. The choice is the person's, and the screen says so.
  await page.getByTestId("invoice-line").nth(1).getByTestId("keep-line").click();
  await settleAiNotes(page);
  await expect(page.getByTestId("next-check")).toHaveCount(0);
  await page.getByTestId("send-invoice").click();
  await expect(page.getByTestId("approval-prompt")).toContainText(money(SAMPLE_AMOUNTS.heardTotalCents));
  await page.getByTestId("decline-button").click();
  await expect(page.getByTestId("job-error")).toContainText("nothing was sent", { timeout: 30_000 });

  // Declining changes nothing about what was settled.
  await expect(page.getByTestId("send-invoice")).toBeEnabled();
  expect((await readJob(request, job.id)).acknowledged?.some((id) => id.startsWith("far:"))).toBe(true);
});

test("declining sends nothing, and the job stays editable", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");

  await startSample(page);
  await fixElementPrice(page);
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
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");

  await startSample(page);
  await page.getByRole("button", { name: "Remove Heating element" }).click();
  const warning = page.getByTestId("missing-amount").filter({ hasText: money(SAMPLE_AMOUNTS.heardElementCents) });
  await expect(warning).toContainText("no line item has that amount");
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.laborCents));
  await expect(page.getByTestId("send-invoice")).toHaveCount(0);
});

test("a spoken amount with no line item stops the send until the person decides", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(live, "Mock extraction ignores the extra amount on purpose. Real extraction would add the line.");
  await paceAiCalls();

  // The fixture leaves out what was said at the end, the way a real extraction sometimes has.
  const job = await (await request.post("/api/jobs", { data: { source: "mic", today: "2026-11-01", customer: { name: "Tom Baker", email: "tom.baker@example.com" }, transcript: "Daniel Evans, the dryer would not heat. Three quarters of an hour at eighty an hour. New heating element, fifty dollars. Plus a forty dollar disposal charge.", speech: { mocked: true, model: "Speech mock" } } })).json();
  await page.goto(`/jobs/${job.id}`);
  const warning = page.getByTestId("missing-amount").filter({ hasText: "$40.00" });
  await expect(warning).toContainText("forty dollar disposal");
  await expect(page.getByTestId("send-invoice")).toHaveCount(0);

  // The name in the words is shown and never used.
  await expect(page.getByTestId("customer-name")).toHaveValue("Tom Baker");
  await expect(page.getByTestId("heard-name")).toContainText("Daniel Evans");

  await warning.getByTestId("add-missing").click();
  const added = page.getByTestId("invoice-line").last();
  await expect(added.getByTestId("line-price")).toHaveValue("40.00");
  await added.getByTestId("line-name").fill("Disposal");
  await expect(warning).toHaveCount(0);
});

test("flat-rate labor isn't held against the hourly rate", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(live, "Mock extraction gives the same two lines every time, so this test edits them. Real extraction is proved in the live check.");
  await paceAiCalls();

  const job = await (await request.post("/api/jobs", { data: { source: "mic", today: "2026-11-01", customer: { name: "Tom Baker", email: "tom.baker@example.com" }, transcript: "Replaced the heating element, fifty dollars. Flat rate two hundred for labor.", speech: { mocked: true, model: "Speech mock" } } })).json();
  await page.goto(`/jobs/${job.id}`);
  const labor = page.getByTestId("invoice-line").first();
  await labor.getByTestId("line-quantity").fill("1");
  await labor.getByTestId("line-price").fill("200");
  await expect(labor.getByTestId("line-total")).toHaveText("$200.00");
  await expect(labor.getByTestId("line-usual")).toHaveCount(0);

  // Hours on the row, so it's a rate after all, and $200 an hour is worth a look.
  await labor.getByTestId("line-quantity").fill("2");
  await expect(labor.getByTestId("line-usual")).toContainText("Usually $80.00");
});

test("adding an item the speaker didn't mention updates the total", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");

  await startSample(page);
  await page.getByTestId("add-line").click();
  const added = page.getByTestId("invoice-line").nth(2);
  await added.getByTestId("line-name").fill("Disposal fee");
  await added.getByTestId("line-price").fill("12.50");
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.heardTotalCents + 1250));
  await page.getByTestId("tax-rate").fill("10");
  await expect(page.getByTestId("tax-total")).toHaveText("$8.75");
});

test("works at phone width", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");

  await page.setViewportSize({ width: 390, height: 844 });
  // No sideways page scroll. Clipped text inside a card is fine, so the page decides, and the list only names the cause.
  // Polled so a settled page is what's measured.
  const tooWide = () =>
    page.evaluate(() => {
      if (document.documentElement.scrollWidth <= window.innerWidth) return [];
      return [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5).map((el) => `${el.tagName} ${(el.textContent ?? "").slice(0, 40)}`);
    });
  const fits = () => expect.poll(tooWide).toEqual([]);
  await page.goto("/jobs");
  await expect(page.getByTestId("try-sample")).toBeVisible();
  await fits();
  await page.goto("/prices");
  await expect(page.getByTestId("price-row").first()).toBeVisible();
  await fits();
  await startSample(page);
  await expect(page.getByTestId("invoice-total")).toBeVisible();
  await fits();
  await page.screenshot({ path: "screenshots/confirm-phone.png", fullPage: true });
  await settleAiNotes(page);

  // One hand: the next step is always under the thumb, and it leads to whatever needs a look.
  await expect(page.getByTestId("next-check")).toBeInViewport();
  await page.getByTestId("next-check").click();
  const element = page.getByTestId("invoice-line").nth(1);
  await expect(element.getByTestId("use-usual")).toBeInViewport();
  const fixes = await page.evaluate(() => [...document.querySelectorAll("[data-testid=use-usual],[data-testid=keep-line]")].map((el) => el.getBoundingClientRect().height));
  expect(Math.min(...fixes)).toBeGreaterThanOrEqual(44);
  await element.getByTestId("use-usual").click();
  await expect(page.getByTestId("send-invoice")).toBeInViewport();
  // Earlier tests sent invoices. Their webhooks belong to those jobs, not this one.
  await expect(page.getByTestId("timeline-step").filter({ hasText: "INVOICING." })).toHaveCount(0);

  // The result carries this job's own webhook, with its long unbroken id, in mock mode.
  // Send is at the bottom of a long page, so the prompt and the result must come to the person.
  await page.getByTestId("send-invoice").click();
  await expect(page.getByTestId("approve-button")).toBeInViewport({ timeout: 30_000 });
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("result-headline")).toBeInViewport({ timeout: 60_000 });
  await fits();
  await page.screenshot({ path: "screenshots/result-phone.png", fullPage: true });
});
