/**
 * What a judge, or anyone with curl, can reach. The kit's demo pages are gone, and so are its
 * order, capture and refund routes: they moved money with no Guard and no approval, and this app
 * promises nothing goes out until a person approves it.
 */
import { expect, test } from "@playwright/test";
import { expectNoMockWords, kitStatus, startSample } from "./flow";

test("nothing from the starter kit is left for a judge to find", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-preview")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("$80 of $120");
  await expect(page.locator("body")).not.toContainText("Agent Kit");
  await page.screenshot({ path: "screenshots/landing.png", fullPage: true });
  for (const path of ["/dashboard", "/example"]) expect((await request.get(path)).status()).toBe(404);
});

test("no money route gets around the approval gate", async ({ request }) => {
  const routes = ["/api/paypal/orders", "/api/paypal/orders/X/capture", "/api/paypal/orders/X/authorize", "/api/paypal/captures/X/refund", "/api/paypal/authorizations/X/capture", "/api/paypal/authorizations/X/void"];
  for (const path of routes) expect((await request.post(path, { data: {} })).status(), path).toBe(404);
});

test("the landing page leads with who it's for, the pain points and their sources, and how 6 of 20 was counted", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-lead")).toContainText("2.9 million");
  await expect(page.getByTestId("hero-lead-source")).toHaveAttribute("href", /census\.gov/);
  await expect(page.getByTestId("pain-point")).toHaveCount(3);
  const sources = page.getByTestId("pain-source");
  await expect(sources).toHaveCount(3);
  for (const href of await sources.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))) expect(href).toMatch(/^https:\/\//);
  await expect(page.locator("body")).not.toContainText("evening");
  await page.getByTestId("proof-method-link").click();
  await expect(page).toHaveURL(/#method$/);
  await expect(page.getByTestId("method")).toBeInViewport();
  await expect(page.getByTestId("method")).toContainText("0 of 20");
});

test("the landing page leads with the price book from your PayPal invoices, and every claim about the others is sourced or says we couldn't find it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fifty heard as fifteen? Your PayPal invoices catch it.");
  await expect(page.locator("main")).toContainText("A price book learned from your own past PayPal invoices stops a sound-alike number");
  const compare = page.getByTestId("compare");
  await expect(compare.getByRole("heading", { name: "What the others don't do" })).toBeVisible();
  const rows = compare.getByTestId("compare-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Sums done by code");
  await expect(rows.nth(1)).toContainText("A price book from your own PayPal invoices");
  await expect(rows.nth(2)).toContainText("Nothing sent until you approve the exact amount");
  // Two products a row, and each says only what its page says, or that we couldn't find it.
  const theirs = await compare.getByTestId("compare-theirs").allInnerTexts();
  expect(theirs).toHaveLength(6);
  for (const text of theirs) expect(text).toMatch(/We couldn't find/);
  const sources = await compare.getByTestId("compare-source").evaluateAll((links) => links.map((a) => [a.textContent ?? "", a.getAttribute("href") ?? ""]));
  expect(sources.map(([label]) => label)).toEqual([expect.stringContaining("Housecall Pro"), expect.stringContaining("Jobber")]);
  for (const [, href] of sources) expect(href).toMatch(/^https:\/\/(contractingbusiness\.com|help\.getjobber\.com)\//);
  await expect(compare).toContainText("not that the product can't do it");
  await compare.screenshot({ path: "screenshots/compare.png" });
});

test("real jobs: only what the proof shows, with no quotes and no real names", async ({ page }) => {
  await page.goto("/");
  const block = page.getByTestId("real-jobs");
  await expect(block.getByRole("heading", { name: "Real jobs" })).toBeVisible();
  const jobs = block.getByTestId("real-job");
  await expect(jobs).toHaveCount(2);
  await expect(jobs.nth(0).getByTestId("real-job-total")).toHaveText("$600.00");
  await expect(jobs.nth(1).getByTestId("real-job-total")).toHaveText("$472.03");
  for (const job of await jobs.all()) {
    await expect(job.getByTestId("real-job-lines")).toContainText("2 of 2 lines right first time");
    await expect(job.getByTestId("real-job-caught").locator("li").first()).toBeVisible();
  }
  // No quotes from anyone, and no customer names or addresses: the invoices' customers are made up and stay off this block.
  await expect(block.locator("blockquote, q")).toHaveCount(0);
  const text = await block.innerText();
  expect(text).not.toMatch(/Pat Rivera|Sam Ortiz|\d+ ?\d* ?th Street|@/);
  expect(text).toContain("Customer names on the invoices are made up.");
  await block.screenshot({ path: "screenshots/real-jobs.png" });
});

test("with AI and speech live, no page says mock", async ({ page, request }) => {
  const { live, speechLive } = await kitStatus(request);
  test.skip(!live || !speechLive, "Only a run with live AI and live speech can show this");
  for (const path of ["/", "/jobs", "/prices", "/activity"]) {
    await page.goto(path);
    await expectNoMockWords(page);
  }
  // The finished sample, read by the live model, every visitor's first job.
  await expect.poll(async () => ((await (await request.get("/api/jobs")).json()) as { example: unknown }).example !== null, { timeout: 90_000, intervals: [1_000] }).toBe(true);
  await page.goto("/jobs/job_sample");
  await expect(page.getByTestId("invoice-amount")).toBeVisible();
  await expectNoMockWords(page);
});

/** The badges a judge reads (which PayPal, which models, the AI spend) and PayPal's debug ids. */
const MACHINERY = /PayPal mock|mock PayPal|AI mock|Speech mock|AI today|debug[ _]id/i;

async function expectCleanChrome(page: import("@playwright/test").Page, where: string) {
  await expect(page.getByTestId("mode-badges"), where).toHaveCount(0);
  await expect(page.getByTestId("ai-spend"), where).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text.match(new RegExp(`.{0,30}(${MACHINERY.source}).{0,30}`, "i"))?.[0] ?? null, where).toBeNull();
}

test("the trade's screens carry no mode badges, AI spend or debug ids until For judges is opened", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 400 ? 1000 : 844 });
    await page.goto("/");
    await expect(page.getByTestId("hero-preview")).toBeVisible();
    await expectCleanChrome(page, `/ at ${width}`);
    await page.goto("/jobs");
    await expect(page.getByTestId(/^contact-(?!other)/).first()).toBeVisible();
    await expectCleanChrome(page, `/jobs at ${width}`);
  }
  // The phone confirm screen, with a job waiting to be checked and sent.
  await startSample(page);
  await expect(page.getByTestId("invoice-total")).toBeVisible();
  await expectCleanChrome(page, "phone confirm");

  // One tap on For judges (in the menu, on a phone) shows them.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByTestId("for-judges-toggle").locator("visible=true").click();
  await expect(page.getByTestId("mode-badges")).toBeVisible();
  await expect(page.getByTestId("mode-badges")).toContainText(/PayPal (sandbox|mock)/);
  await expect(page.getByTestId("for-judges").locator("visible=true")).toContainText(/debug ids/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/jobs");
  await page.getByTestId("for-judges-toggle").locator("visible=true").click();
  await expect(page.getByTestId("mode-badges")).toBeVisible();
});
