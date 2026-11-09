/**
 * The trade's own screens carry the job and nothing else: no PayPal endpoints, no integrity badge, no pitch copy,
 * no industry figures. All of that is one tap away, under For judges, or on /built.
 */
import { expect, test, type Page } from "@playwright/test";
import { fixElementPrice, keepToOneCall, kitStatus, startSample } from "./flow";

/** Developer chrome and pitch: endpoints, toolkit chips, the record badge, "by code, not by the AI", the late-payment figures. */
const CHROME = /GET \/v2|POST \/v2|\/v2\/invoicing|generate-qr-code|Agent Toolkit ·|Record checked|Chain verified|not by the AI|worked out by code|plain code, not AI|QuickBooks|Levelset|\b56%|\b49%|\bn=\d|debug[ _]id/i;

async function expectNoChrome(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  expect(text.match(new RegExp(`.{0,30}(${CHROME.source}).{0,30}`, "i"))?.[0] ?? null, where).toBeNull();
  await expect(page.getByTestId("price-source-chip"), where).toHaveCount(0);
  await expect(page.getByTestId("payer-view-source"), where).toHaveCount(0);
  await expect(page.getByTestId("toolkit-chip"), where).toHaveCount(0);
  await expect(page.getByTestId("reminder-why"), where).toHaveCount(0);
}

test("new job, confirm, sent and reminder carry no endpoints, record badge, pitch or figures until For judges is opened, at 1440 and 390", async ({ page, request }) => {
  test.skip(keepToOneCall((await kitStatus(request)).live), "Keeps a local live run to the one mic clip");
  test.setTimeout(240_000);
  let sentAt = "";
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 400 ? 1000 : 844 });
    await page.goto("/jobs");
    await expect(page.getByTestId(/^contact-(?!other)/).first()).toBeVisible();
    await expectNoChrome(page, `new job at ${width}`);

    await startSample(page);
    // A price checked against past invoices opens them under it: still no endpoint.
    const receipts = page.getByTestId("receipts-open").filter({ visible: true }).first();
    if (await receipts.count()) {
      await receipts.click();
      await expect(page.getByTestId("receipts").filter({ visible: true }).first()).toBeVisible();
    }
    await expectNoChrome(page, `confirm at ${width}`);
    // One check card at a time, at every width.
    const cards = page.locator("[data-testid=catch-card], [data-testid=tax-check], [data-testid=missing-amount], [data-testid=job-flag], [data-testid=usually-with]").filter({ visible: true });
    expect(await cards.count(), `check cards at ${width}`).toBeLessThanOrEqual(1);

    await fixElementPrice(page);
    await page.getByTestId("send-invoice").click();
    await page.getByTestId("approve-button").click();
    await expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("reminder-card")).toBeVisible();
    await expect(page.getByTestId("payer-view")).toBeVisible();
    await expectNoChrome(page, `sent and reminder at ${width}`);
    sentAt = page.url();

    await page.goto("/prices");
    await expect(page.getByTestId("price-row").first()).toBeVisible();
    await expectNoChrome(page, `price book at ${width}`);
    await page.goto("/activity");
    await expect(page.getByTestId("activity-jobs")).toBeVisible();
    await expectNoChrome(page, `activity at ${width}`);
  }

  // One tap on For judges brings it back, and it stays open from page to page until closed.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sentAt);
  await expect(page.getByTestId("result")).toBeVisible();
  await page.getByTestId("for-judges-toggle").locator("visible=true").click();
  await expect(page.getByTestId("payer-view-source")).toHaveText("GET /v2/invoicing/invoices/{id}");
  await page.goto("/activity");
  await expect(page.getByTestId("activity-jobs")).toBeVisible();
  await expect(page.getByText("Record checked")).toBeVisible();
  await page.getByTestId("for-judges-toggle").locator("visible=true").click();
  await expect(page.getByText("Record checked")).toHaveCount(0);
  await page.goto(sentAt);
  await expect(page.getByTestId("result")).toBeVisible();
  await expectNoChrome(page, "after For judges is closed");
});
