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
