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

test("the landing is the hero, the live catch, three steps and one real job; the figures and sources are one tap away on How it's built", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-lead")).toHaveText("One wrong number on an invoice can cost you the customer.");
  // The catch, with one tap into the sample job and into day one.
  await expect(page.getByTestId("catch-proof-flag")).toContainText(/.fifteen. sounds like .fifty./);
  await expect(page.getByTestId("catch-proof")).toContainText("GET /v2/invoicing/invoices");
  await expect(page.getByTestId("catch-try")).toHaveAttribute("href", "/jobs?try=sample");
  await expect(page.getByTestId("catch-try-day-one")).toHaveAttribute("href", "/jobs?try=day-one");
  await expect(page.getByTestId("how-step")).toHaveCount(3);
  await expect(page.getByTestId("proof-card-total")).toHaveText("$600.00");
  await expect(page.getByTestId("hero-preview")).toBeVisible();
  // Nothing else: the stats, the comparison, the second job and the method moved to /built.
  for (const moved of ["hero-facts", "hero-who", "hero-why-not", "hero-proof", "real-jobs", "method"]) await expect(page.getByTestId(moved)).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("58%");
  await expect(page.locator("main > *")).toHaveCount(3);
  // Late payment isn't the lead: it sits under the reminders on a sent job.
  await expect(page.locator("main")).not.toContainText("56%");
  await expect(page.locator("body")).not.toContainText("evening");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`Landing at 1440 wide: ${height}px, ${(height / 1000).toFixed(2)} screens of 1000`);
  expect(height).toBeLessThan(1000 * 2.2);
  await page.screenshot({ path: "screenshots/landing-1440.png", fullPage: true });

  await page.getByTestId("built-link").click();
  await expect(page).toHaveURL(/\/built$/);
  await expect(page.getByTestId("built-lead")).toContainText("One wrong number on an invoice can cost you the customer.");
  await expect(page.getByTestId("built-lead")).toContainText("58%");
  await expect(page.getByTestId("hero-lead-source")).toHaveAttribute("href", /^https:\/\/www\.phcppros\.com\//);
  await expect(page.getByTestId("hero-who")).toContainText("2.9 million");
  await expect(page.getByTestId("hero-who-source")).toHaveAttribute("href", /census\.gov/);
  await expect(page.getByTestId("real-job")).toHaveCount(2);
  await page.getByTestId("proof-method-link").click();
  await expect(page).toHaveURL(/#method$/);
  await expect(page.getByTestId("method")).toBeInViewport();
  await expect(page.getByTestId("method")).toContainText("0 of 20");
  await page.screenshot({ path: "screenshots/built-1440.png", fullPage: true });
});

test("on a phone the landing is Start a job, the catch, three steps and the real job, in that order, under 2.5 screens", async ({ page }) => {
  const top = async (testId: string) => (await page.getByTestId(testId).first().boundingBox())!.y;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("hero-start")).toBeInViewport();
  await expect(page.getByTestId("hero-start")).toHaveAttribute("href", "/jobs");
  const phone = { start: await top("hero-start"), catch: await top("catch-proof"), flag: await top("catch-proof-flag"), tryIt: await top("catch-try"), how: await top("how-step"), proof: await top("proof-card") };
  console.log(`Landing at 390 wide, tops: ${JSON.stringify(phone)}`);
  expect(phone.start).toBeLessThan(phone.catch);
  expect(phone.flag).toBeLessThan(phone.tryIt);
  expect(phone.tryIt).toBeLessThan(phone.how);
  expect(phone.how).toBeLessThan(phone.proof);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const id of ["catch-try", "catch-try-day-one"]) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`Landing at 390 wide: ${height}px, ${(height / 844).toFixed(2)} screens of 844`);
  expect(height).toBeLessThan(844 * 2.5);
  await page.screenshot({ path: "screenshots/landing-390.png", fullPage: true });
  // The real job's invoice folds to a row on a phone.
  await page.getByTestId("fold-preview-toggle").click();
  await expect(page.getByTestId("hero-preview")).toBeVisible();

  await page.goto("/built");
  await expect(page.getByTestId("real-job")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "screenshots/built-390.png", fullPage: true });
});

test("the landing page's headline is the price book from your PayPal invoices, and How it's built says why not Housecall Pro or Jobber", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fifty heard as fifteen? Your PayPal invoices catch it.");
  await expect(page.locator("main")).toContainText("A price book learned from your own past PayPal invoices stops a sound-alike number");
  await page.goto("/built");
  const whyNot = page.getByTestId("hero-why-not");
  await expect(whyNot).toContainText("Why not Housecall Pro or Jobber? Both have a price list of their own.");
  await expect(whyNot).toContainText("built from your past PayPal invoices");
  await expect(whyNot).not.toContainText("price book stops a wrong price");
  // Each rival's own page, so the claim about them can be checked.
  await expect(page.getByTestId("hero-why-not-source")).toHaveCount(2);
  await expect(page.getByTestId("hero-why-not-source").first()).toHaveAttribute("href", "https://www.housecallpro.com/features/price-book/");
  await expect(page.getByTestId("hero-why-not-source").last()).toHaveAttribute("href", "https://help.getjobber.com/en/articles/products-services-list/");
});

test("the public status says which modes are on, and carries no buyer address", async ({ request }) => {
  const status = await (await request.get("/api/kit/status")).json();
  expect(status.paypal.mode).toMatch(/^(mock|sandbox)$/);
  expect(status.paypal).not.toHaveProperty("buyerEmail");
  // No address at all: the payee rules ("*@example.com") are patterns, not anyone's address.
  expect(JSON.stringify(status)).not.toMatch(/[\w.+-]+@[\w-]+\./);
});

test("real jobs: only what the proof shows, with no quotes and no real names", async ({ page }) => {
  await page.goto("/built");
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
  for (const path of ["/", "/built", "/jobs", "/prices", "/activity"]) {
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
    await expect(page.getByTestId("hero-lead")).toBeVisible();
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
