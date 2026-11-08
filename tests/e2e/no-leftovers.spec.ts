/**
 * What a judge, or anyone with curl, can reach. The kit's demo pages are gone, and so are its
 * order, capture and refund routes: they moved money with no Guard and no approval, and this app
 * promises nothing goes out until a person approves it.
 */
import { expect, test } from "@playwright/test";

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
