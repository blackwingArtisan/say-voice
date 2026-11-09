/**
 * The first visit: a short "Your business" step, then the trade's first invoice goes out under its own name.
 * A second trade, in its own browser, does the same and never sees the first one's name.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { appConfig } from "../../src/app.config";
import { keepToOneCall, kitStatus, openNewJob, sentSample } from "./flow";
import { readInvoiceFromPayPal } from "./paypal-reread";

async function setUp(page: Page, tradeName: string, email: string) {
  await openNewJob(page);
  const step = page.getByTestId("first-run");
  await expect(step).toBeVisible();
  // Honest about the PayPal account: the sandbox on the sandbox, none on a local mock.
  await expect(step.getByTestId("first-run-paypal")).toContainText(/sandbox business account|none on this copy/);
  await expect(step.getByTestId("first-run-save")).toBeDisabled();
  await step.getByTestId("first-run-name").fill(tradeName);
  await step.getByTestId("first-run-email").fill(email);
  await step.getByTestId("first-run-save").click();
  await expect(step).toHaveCount(0);
  await expect(page.getByTestId("business-card")).toContainText(`Invoices go out as ${tradeName}`);
}

const trade = async (browser: Browser) => (await browser.newContext()).newPage();

test("a first visit asks for the business, and two trades each send their first invoice under their own name", async ({ browser, request }) => {
  const { live, sandbox } = await kitStatus(request);
  test.skip(keepToOneCall(live), "Keeps a local live run to the one mic clip");
  test.setTimeout(240_000);
  const firsts = [
    { name: "Birch Lane Plumbing", email: "office@birchlane.example.com" },
    { name: "Oak Street Electric", email: "jobs@oakstreet.example.com" },
  ];
  const pages: Page[] = [];
  for (const [i, first] of firsts.entries()) {
    const page = await trade(browser);
    pages.push(page);
    await setUp(page, first.name, first.email);
    const sent = await sentSample(page, request);
    await expect(page.getByTestId("invoice-from")).toHaveText(first.name);
    await expect(page.getByTestId("payer-view-business")).toHaveText(first.name);
    await expect(page.getByTestId("payer-view")).toContainText(first.email);
    expect(sent.invoice!.businessName).toBe(first.name);
    if (i) await expect(page.locator("body")).not.toContainText(firsts[0].name);
    if (sandbox) {
      // PayPal's own record of it: the trade's name as invoicer, and its email in the note the customer reads.
      const invoice = await readInvoiceFromPayPal(sent.invoice!.id);
      expect(invoice.invoicer?.business_name).toBe(first.name);
      expect(invoice.detail.note ?? "").toContain(first.email);
      console.log(`PayPal re-read: ${invoice.detail.invoice_number} ${invoice.id} ${invoice.status} USD ${invoice.amount.value} from ${invoice.invoicer?.business_name}, note ends "${(invoice.detail.note ?? "").split("\n").at(-1)}"`);
    }
  }
  // Set once: the step doesn't come back.
  await openNewJob(pages[0]);
  await expect(pages[0].getByTestId("business-card")).toContainText(`Invoices go out as ${firsts[0].name}`);
  await expect(pages[0].getByTestId("first-run")).toHaveCount(0);
  for (const page of pages) await page.context().close();
});

test("Skip keeps the demo name and the step stays away", async ({ page }) => {
  await openNewJob(page);
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.getByTestId("first-run-skip").click();
  await expect(page.getByTestId("first-run")).toHaveCount(0);
  await openNewJob(page);
  await expect(page.getByTestId("first-run")).toHaveCount(0);
  await expect(page.getByTestId("business-card")).toContainText(`Invoices go out as ${appConfig.tradeName}`);
});

test("a name with no email is fine; an email that isn't one says so", async ({ page }) => {
  await openNewJob(page);
  const step = page.getByTestId("first-run");
  await step.getByTestId("first-run-name").fill("Maple Court Roofing");
  await step.getByTestId("first-run-email").fill("not-an-email");
  // The browser's own check holds a malformed address; the server's check is the one that counts.
  await step.getByTestId("first-run-email").evaluate((el: HTMLInputElement) => (el.type = "text"));
  await step.getByTestId("first-run-save").click();
  await expect(step.getByTestId("first-run-problem")).toContainText("doesn't look complete");
  await step.getByTestId("first-run-email").fill("");
  await step.getByTestId("first-run-save").click();
  await expect(step).toHaveCount(0);
  await expect(page.getByTestId("business-card")).toContainText("Invoices go out as Maple Court Roofing");
});
