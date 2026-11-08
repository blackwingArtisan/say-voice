/**
 * Pays a sandbox invoice the way a customer does: on PayPal's page, with PayPal's test card and no
 * account. Takes PayPal's checkout window, which it opens for Playwright's own browser. For a browser
 * calling itself desktop Chrome, as the test config's does, it shows an inline form instead, so this
 * context uses the browser's own user agent.
 */
import { expect, type Browser, type Frame } from "@playwright/test";

export async function payAsGuest(browser: Browser, payerUrl: string) {
  const { userAgent } = await (await browser.newBrowserCDPSession()).send("Browser.getVersion");
  const context = await browser.newContext({ userAgent, viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  await page.goto(payerUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const cardButtons = (): Frame | undefined => page.frames().find((f) => f.url().includes("smart/buttons") && f.url().includes("style.color=black"));
  await expect.poll(cardButtons, { timeout: 45_000 }).toBeTruthy();

  await page.waitForTimeout(4_000); // the buttons draw before their click handlers are ready
  const button = cardButtons()!.locator('[data-funding-source="card"]').first();
  const [checkout] = await Promise.all([context.waitForEvent("page", { timeout: 30_000 }), button.click()]);

  await checkout.locator("#cardNumber").waitFor({ timeout: 30_000 });
  await checkout.locator("#cardNumber").pressSequentially("4111111111111111", { delay: 15 });
  await checkout.locator("#cardExpiry").pressSequentially("1230", { delay: 15 });
  await checkout.locator("#cardCvv").pressSequentially("123", { delay: 15 });
  await checkout.locator("#billingLine1").fill("1 Main St");
  await checkout.locator("#billingCity").fill("San Jose");
  await checkout.locator("#billingState").selectOption("CA");
  await checkout.locator("#billingPostalCode").fill("95131");
  await checkout.locator("#phone").pressSequentially("4085551234", { delay: 15 });
  // PayPal sometimes opens this form with account creation switched on, which asks for a password.
  const createAccount = checkout.getByTestId("onboard-options-switch");
  // The switch can sit outside the checkout window's viewport, where even a forced click is refused, so it's clicked in the page.
  if ((await createAccount.count()) && (await createAccount.isChecked())) await createAccount.evaluate((el: HTMLInputElement) => el.click());
  if (await createAccount.count()) await expect(createAccount).not.toBeChecked();
  // PayPal has labelled this button both "Pay now as guest" and, with the switch off, "Pay Now".
  await checkout.getByRole("button", { name: /^pay now( as guest)?$/i }).click();

  // PayPal closes its window once the card is taken. The invoice page may say "Payment successful",
  // redraw as the paid invoice, or not change at all, so the caller re-reads the invoice from PayPal.
  await checkout.waitForEvent("close", { timeout: 90_000 }).catch(() => undefined);
  if (!checkout.isClosed()) throw new Error(`PayPal's checkout didn't finish: ${(await checkout.locator("body").innerText()).slice(0, 400)}`);
  await context.close();
}
