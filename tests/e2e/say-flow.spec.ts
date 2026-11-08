/**
 * The sample job in a real browser: a judge with no mic. `npm run test:e2e` runs it on mock PayPal;
 * `npm run test:e2e:sandbox` sends a real sandbox invoice and re-reads it straight from PayPal.
 * The job is the known trap: "fifty" heard as "fifteen". The confirm screen has to catch it.
 */
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { checkCount, fixElementPrice, keepToOneCall, kitStatus, money, paceAiCalls, readJob, jobId, sendAndVerify, sentSample, settleAiNotes, startSample, visitorHeaders } from "./flow";
import { PLUS_TAX_AMOUNTS, PLUS_TAX_TRANSCRIPT, SAMPLE_AMOUNTS } from "../../src/lib/say/sample";
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
  // A clear invoice: what the job was, and what each line covers. Nothing generic goes out bare.
  await expect(page.getByTestId("job-summary")).not.toHaveValue("");
  for (const line of await page.getByTestId("invoice-line").all()) await expect(line.getByTestId("line-description")).not.toHaveValue("");
  await expect(page.getByTestId("line-vague")).toHaveCount(0);
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
  const job = await (await request.post("/api/jobs", { data: { source: "mic", today: "2026-11-01", customer: { name: "Tom Baker", email: "tom.baker@example.com" }, transcript: "Derek Evans, the dryer would not heat. Three quarters of an hour at eighty an hour. New heating element, fifty dollars. Plus a forty dollar disposal charge.", speech: { mocked: true, model: "Speech mock" } } })).json();
  await page.goto(`/jobs/${job.id}`);
  const warning = page.getByTestId("missing-amount").filter({ hasText: "$40.00" });
  await expect(warning).toContainText("forty dollar disposal");
  await expect(page.getByTestId("send-invoice")).toHaveCount(0);

  // The name in the words is shown and never used.
  await expect(page.getByTestId("customer-name")).toHaveValue("Tom Baker");
  await expect(page.getByTestId("heard-name")).toContainText("Derek Evans");

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
  // The speaker said "No tax on this one", so the heard lines start untaxed. Only the added fee is taxed: 10% of $12.50.
  await expect(page.getByTestId("invoice-line").nth(0).getByTestId("line-taxed")).not.toBeChecked();
  await expect(page.getByTestId("invoice-line").nth(1).getByTestId("line-taxed")).not.toBeChecked();
  await page.getByTestId("tax-rate").fill("10");
  await expect(page.getByTestId("tax-total")).toHaveText("$1.25");
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

test("a clear invoice: what, where and when, a description per line, and tax on the one item it was said for", async ({ page, request }) => {
  const { live, sandbox } = await kitStatus(request);
  test.skip(live, "The tax job's words and lines are mock fixtures. Real AI runs on the held-out jobs instead.");
  await paceAiCalls();

  await page.goto("/jobs");
  const today = await page.evaluate(() => new Date().toLocaleDateString("en-CA"));
  const job = await (await request.post("/api/jobs", { data: { source: "mic", today, customer: { name: "Tom Baker", email: "tom.baker@example.com" }, transcript: PLUS_TAX_TRANSCRIPT, speech: { mocked: true, model: "Speech mock" } } })).json();
  await page.goto(`/jobs/${job.id}`);

  // The description step's words, every one of them editable.
  await expect(page.getByTestId("job-summary")).toHaveValue("Washer drain pump swapped");
  await expect(page.getByTestId("job-site")).toHaveValue("12 Oak Lane");
  await expect(page.getByTestId("service-date")).toHaveValue(`${today.slice(0, 4)}-10-30`);
  const [pump, labor] = await page.getByTestId("invoice-line").all();
  await expect(pump.getByTestId("line-description")).toHaveValue("Drain pump for the washer");
  await expect(labor.getByTestId("line-description")).toHaveValue("Swapped the drain pump on the washer, an hour and a half");

  // "Plus tax" came after the pump, so only the pump is taxed. No rate was said, so the send waits for one.
  await expect(pump.getByTestId("line-taxed")).toBeChecked();
  await expect(labor.getByTestId("line-taxed")).not.toBeChecked();
  const taxCheck = page.getByTestId("tax-check");
  await expect(taxCheck).toContainText("Iowa");
  await expect(taxCheck).toContainText("Check your local rate");
  await expect(taxCheck.getByTestId("tax-choice")).toHaveText(["6% state", "7% state + local option"]);
  await expect(page.getByTestId("send-invoice")).toHaveCount(0);
  await expect(page.getByTestId("tax-total")).toHaveText("$0.00");
  // On a phone too: no sideways scroll, and the rate buttons are big enough for a thumb.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const box of await taxCheck.getByRole("button").all()) expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `screenshots/confirm-tax-${page.viewportSize()!.width}.png`, fullPage: true });

  // Other rate goes to the box. A tap sets a rate, and code works out the totals.
  await taxCheck.getByTestId("tax-other").click();
  await expect(page.getByTestId("tax-rate")).toBeFocused();
  await taxCheck.getByTestId("tax-choice").filter({ hasText: "6% state" }).click();
  await expect(page.getByTestId("tax-total")).toHaveText(money(PLUS_TAX_AMOUNTS.tax6Cents));
  await expect(page.getByTestId("invoice-total")).toHaveText(money(PLUS_TAX_AMOUNTS.total6Cents));
  await expect(page.getByTestId("tax-check")).toHaveCount(0);
  await page.getByTestId("tax-rate").fill("7");
  await expect(pump.getByTestId("line-tax")).toHaveText(`+${money(PLUS_TAX_AMOUNTS.tax7Cents)} tax`);
  await expect(page.getByTestId("invoice-total")).toHaveText(money(PLUS_TAX_AMOUNTS.total7Cents));

  // A bare "Labor" tells the customer nothing: it holds the send, a tap can't wave it through, and words clear it.
  await labor.getByTestId("line-description").fill("");
  await expect(labor.getByTestId("line-vague")).toBeVisible();
  await expect(labor.getByTestId("keep-line")).toHaveCount(0);
  await expect(page.getByTestId("send-invoice")).toHaveCount(0);
  const refused = await request.post(`/api/jobs/${job.id}/send`, { data: { customer: job.customer, lines: job.lines.map((l: object) => ({ ...l, description: "" })), taxRateMilli: 7000, details: job.details, dueDate: job.dueDate, acknowledged: ["vague:" + job.lines[1].key, "tax:rate"] } });
  expect(refused.status()).toBe(409);
  await labor.getByTestId("line-description").fill("Swapped the drain pump, an hour and a half, tested it");
  await expect(labor.getByTestId("line-vague")).toHaveCount(0);
  // Words the person types are theirs, so "tested" isn't held against them.
  await expect(page.getByTestId("line-words")).toHaveCount(0);
  await page.getByTestId("job-summary").fill("Washer drain pump swapped and tested");

  const done = await sendAndVerify(page, request, PLUS_TAX_AMOUNTS.total7Cents, "plus-tax");
  expect(done.details).toEqual({ summary: "Washer drain pump swapped and tested", site: "12 Oak Lane", serviceDate: `${today.slice(0, 4)}-10-30` });
  expect(done.lines.map((l) => [l.description, l.taxed])).toEqual([["Drain pump for the washer", true], ["Swapped the drain pump, an hour and a half, tested it", false]]);
  expect(done.invoice!.taxCents).toBe(PLUS_TAX_AMOUNTS.tax7Cents);
  await expect(page.getByTestId("result-description")).toHaveText(done.lines.map((l) => l.description!));

  if (sandbox) {
    // Once, on PayPal's own page: what the customer sees.
    const payer = await page.context().newPage();
    await payer.goto(done.invoice!.payerUrl!, { waitUntil: "domcontentloaded", timeout: 60_000 });
    for (const text of ["Washer drain pump swapped and tested", "12 Oak Lane", "Drain pump for the washer", "tested it"]) await expect(payer.getByText(text, { exact: false }).first()).toBeVisible({ timeout: 45_000 });
    await payer.screenshot({ path: "screenshots/payer-view-clear-invoice.png", fullPage: true });
    console.log(`Payer view text: ${JSON.stringify((await payer.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1500))}`);
    await payer.close();
  }
});

/** The sum of the line totals on screen, in cents. Null while one shows "--". */
const sumOfLinesShown = async (page: Page) => {
  const shown = await page.getByTestId("line-total").allInnerTexts();
  if (shown.some((t) => !t.startsWith("$"))) return null;
  return shown.reduce((sum, t) => sum + Math.round(Number(t.replace(/[$,]/g, "")) * 100), 0);
};

test("a price or quantity that can't be read is named on its line, holds the total, and Send says what to fix", async ({ page, request }) => {
  const { live } = await kitStatus(request);
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");

  await startSample(page);
  const labor = page.getByTestId("invoice-line").first();
  const send = page.getByTestId("send-invoice");
  await expect(page.getByTestId("subtotal")).toHaveText(money((await sumOfLinesShown(page))!));

  const cases: [string, string, RegExp][] = [
    ["line-price", "-80", /can't be below \$0/],
    ["line-price", "0", /above \$0/],
    ["line-price", "99999999999", /more than \$100,000\.00/],
    ["line-price", "abc", /isn't a price/],
    ["line-price", "", /Enter a price/],
    ["line-quantity", "0", /above 0/],
    ["line-quantity", "-3", /can't be below 0/],
    ["line-quantity", "1e9", /isn't a quantity/],
  ];
  for (const [field, value, words] of cases) {
    await labor.getByTestId(field).fill(value);
    const which = field === "line-price" ? "price" : "quantity";
    await expect(labor.getByTestId(`${field}-error`), `${field}=${value}`).toContainText(words);
    await expect(labor.getByTestId("line-total")).toHaveText("--");
    // Never a smaller total that quietly leaves the line out.
    await expect(page.getByTestId("invoice-total")).toHaveText("--");
    await expect(page.getByTestId("total-held")).toContainText("line 1");
    await expect(page.getByTestId("input-problem").first()).toContainText("Line 1:");
    await expect(send).toBeDisabled();
    await expect(send).toHaveText(`Fix the ${which} on line 1`);
    await labor.getByTestId(field).fill(field === "line-price" ? "80.00" : "0.75");
  }
  await page.screenshot({ path: "screenshots/sums-restored.png", fullPage: true });

  // Back to valid: the total is the sum of the lines shown again, and the errors are gone.
  await expect(page.getByTestId("input-problem")).toHaveCount(0);
  await expect(page.getByTestId("invoice-total")).toHaveText(money(SAMPLE_AMOUNTS.heardTotalCents));
  expect(await sumOfLinesShown(page)).toBe(SAMPLE_AMOUNTS.heardTotalCents);

  // Show me goes to the field. A bad email is named on the field too, not a toast over the button.
  await labor.getByTestId("line-price").fill("-80");
  await page.getByTestId("go-to-problem").click();
  await expect(labor.getByTestId("line-price")).toBeFocused();
  await labor.getByTestId("line-price").fill("80.00");
  await page.getByTestId("customer-email").fill("notanemail");
  await expect(page.getByTestId("customer-email-error")).toContainText("isn't an email address");
  await expect(send).toHaveText("Fix the customer email");
  await expect(send).toBeDisabled();
  await page.getByTestId("customer-email").fill("derek.evans@example.com");
  await expect(page.getByTestId("input-problem")).toHaveCount(0);
  await expect(page.getByTestId("next-check")).toBeVisible(); // the misheard element is still there to check
  expect((await readJob(request, jobId(page))).status).toBe("review");
});

/** Reads a QR code the way a phone camera would: from a screenshot of it as drawn on screen. */
async function readQr(page: Page, qr: Locator): Promise<string | null> {
  const shot = (await qr.screenshot()).toString("base64");
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/jsqr/dist/jsQR.js") });
  return page.evaluate(async (png) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const read = (window as unknown as { jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR(pixels.data, canvas.width, canvas.height);
    return read?.data ?? null;
  }, shot);
}

test("pay now: a QR of PayPal's own page for the invoice and a link to copy, readable at phone width", async ({ page, request, context }) => {
  const { live, sandbox } = await kitStatus(request);
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");
  await page.setViewportSize({ width: 390, height: 844 });
  const sent = await sentSample(page, request);
  const payNow = page.getByTestId("pay-now");
  if (!sandbox) {
    // Mock PayPal has no real page to pay on, so no code to scan.
    await expect(payNow).toHaveCount(0);
    return;
  }
  const payerUrl = sent.invoice!.payerUrl!;
  expect(payerUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\//);
  await expect(payNow).toContainText(`Pay now: ${money(sent.invoice!.dueCents)}`);
  const qr = page.getByTestId("pay-qr");
  await qr.scrollIntoViewIfNeeded();
  await expect(qr.locator("svg")).toBeVisible();
  const box = (await qr.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(200); // big enough for a phone camera across a counter
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await readQr(page, qr)).toBe(payerUrl);
  await expect(page.getByTestId("pay-link")).toHaveText(payerUrl);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("copy-pay-link").click();
  await expect(page.getByTestId("copy-pay-link")).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(payerUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "screenshots/pay-now-phone.png", fullPage: true });
  // The amount sits on the line's own row at phone width, beside its name.
  const line = page.getByTestId("result-line").nth(1);
  const name = (await line.getByText("Heating element", { exact: true }).boundingBox())!;
  const amount = (await line.getByTestId("result-line-amount").boundingBox())!;
  expect(Math.abs(name.y - amount.y)).toBeLessThan(8);
  console.log(`Pay now QR read back: ${payerUrl}`);
});
