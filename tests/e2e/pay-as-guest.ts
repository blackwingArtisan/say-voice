/** Pays a sandbox invoice the way a customer does: on PayPal's page, with PayPal's test card and no account. */
import { expect, type Browser, type Frame } from "@playwright/test";

export async function payAsGuest(browser: Browser, payerUrl: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  await page.goto(payerUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const cardButtons = (): Frame | undefined => page.frames().find((f) => f.url().includes("smart/buttons") && f.url().includes("style.color=black"));
  await expect.poll(cardButtons, { timeout: 45_000 }).toBeTruthy();
  const button = cardButtons()!.locator('[data-funding-source="card"]').first();
  const [checkout] = await Promise.all([context.waitForEvent("page"), button.click()]);

  await checkout.locator("#cardNumber").waitFor({ timeout: 30_000 });
  await checkout.locator("#cardNumber").pressSequentially("4111111111111111", { delay: 15 });
  await checkout.locator("#cardExpiry").pressSequentially("1230", { delay: 15 });
  await checkout.locator("#cardCvv").pressSequentially("123", { delay: 15 });
  await checkout.locator("#billingLine1").fill("1 Main St");
  await checkout.locator("#billingCity").fill("San Jose");
  await checkout.locator("#billingState").selectOption("CA");
  await checkout.locator("#billingPostalCode").fill("95131");
  await checkout.locator("#phone").pressSequentially("4085551234", { delay: 15 });
  await checkout.getByRole("button", { name: "Pay now as guest" }).click();

  await expect(page.getByText("Payment successful")).toBeVisible({ timeout: 60_000 });
  await context.close();
}
