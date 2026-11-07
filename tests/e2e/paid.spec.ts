import { expect, test } from "@playwright/test";
import { jobId, keepToOneCall, kitStatus, readJob, sentSample } from "./flow";
import { payAsGuest } from "./pay-as-guest";
import { readInvoiceFromPayPal } from "./paypal-reread";

test.describe("getting paid", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(keepToOneCall((await kitStatus(request)).live), "spends on the one mic clip only");
  });

  test("the job turns paid when the payment event arrives", async ({ page, request }) => {
    const { sandbox } = await kitStatus(request);
    test.skip(sandbox && !process.env.E2E_BASE_URL, "PayPal can't reach localhost, so the hosted run proves this one");
    test.setTimeout(420_000);

    const sent = await sentSample(page, request);
    await expect(page.getByTestId("reminder-card")).toBeVisible();
    await expect(page.getByTestId("paid-banner")).toHaveCount(0);

    if (sandbox) await payAsGuest(page.context().browser()!, sent.invoice!.payerUrl!);
    else await request.post(`/api/dev/pay-invoice/${sent.invoice!.id}`);

    // PayPal's delivery takes a while. The page isn't touched here: it has to notice on its own.
    await expect(page.getByTestId("paid-banner")).toContainText("Paid: $110.00 from Derek Evans", { timeout: 300_000 });
    await expect(page.getByTestId("invoice-status")).toContainText(/paid/i);
    await expect(page.getByRole("heading", { name: "Invoice paid" })).toBeVisible();
    await expect(page.getByTestId("reminder-card")).toHaveCount(0);
    await page.screenshot({ path: `screenshots/paid-${sandbox ? "sandbox" : "mock"}.png`, fullPage: true });

    const job = await readJob(request, jobId(page));
    expect(job.invoice!.status).toBe("PAID");
    expect(job.invoice!.paidEventId).toBeTruthy();
    expect(job.noReminderBecause).toContain("paid");
    if (sandbox) {
      expect(job.invoice!.paidEventId).toMatch(/^WH-/);
      const invoice = await readInvoiceFromPayPal(sent.invoice!.id);
      expect(invoice.status).toBe("PAID");
      expect(invoice.payments?.paid_amount.value).toBe("110.00");
      expect(invoice.payments?.transactions[0].payment_id).toBe(job.invoice!.paymentId);
      console.log(`PayPal re-read: invoice ${invoice.id} number ${invoice.detail.invoice_number} ${invoice.status}, payment ${invoice.payments?.transactions[0].payment_id} ${invoice.payments?.transactions[0].type}, webhook ${job.invoice!.paidEventId}`);
    }
  });

  test("a customer who just paid gets no reminder, even before the event arrives", async ({ page, request }) => {
    const { sandbox } = await kitStatus(request);
    test.skip(!sandbox || !!process.env.E2E_BASE_URL, "needs a payment with no event, which only a local sandbox run has");
    test.setTimeout(240_000);

    const sent = await sentSample(page, request);
    await payAsGuest(page.context().browser()!, sent.invoice!.payerUrl!);
    await expect.poll(async () => (await readInvoiceFromPayPal(sent.invoice!.id)).status, { timeout: 60_000, intervals: [2_000] }).toBe("PAID");

    await page.getByTestId("ask-reminder").click();
    await expect(page.getByTestId("paid-banner")).toContainText("Paid: $110.00");
    await expect(page.getByTestId("approval-prompt")).toHaveCount(0);
    const job = await readJob(request, jobId(page));
    expect(job.reminderRunId).toBeUndefined();
    expect(job.invoice!.paidEventId).toBeUndefined();
    console.log(`PayPal re-read: invoice ${sent.invoice!.id} PAID, payment ${job.invoice!.paymentId}, no reminder started`);
  });
});
