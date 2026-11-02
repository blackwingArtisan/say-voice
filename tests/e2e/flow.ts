/** The part both flows share: from the confirm screen through the gate to PayPal's own record. */
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { readInvoiceFromPayPal } from "./paypal-reread";
import type { JobView } from "../../src/lib/say/types";

export const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

export async function kitStatus(request: APIRequestContext) {
  const status = await (await request.get("/api/kit/status")).json();
  return { sandbox: status.paypal.mode === "sandbox", live: status.ai.mode === "live", paypal: status.paypal.mode as string, speechLive: status.speech.mode === "live" };
}

/** A local live run spends on the one mic clip only. A deployed copy is always live, and the sample flow has to run there. */
export const keepToOneCall = (live: boolean) => live && !process.env.E2E_BASE_URL;

export const jobId = (page: Page) => new URL(page.url()).pathname.split("/").pop()!;

export async function readJob(request: APIRequestContext, id: string): Promise<JobView> {
  return (await (await request.get(`/api/jobs/${id}`)).json()) as JobView;
}

/** Presses send, checks nothing reaches the customer before approval, approves, and checks the result. */
export async function sendAndVerify(page: Page, request: APIRequestContext, totalCents: number, screenshot: string) {
  const { sandbox, paypal, live } = await kitStatus(request);
  const id = jobId(page);
  await page.getByTestId("send-invoice").click();

  const prompt = page.getByTestId("approval-prompt");
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await expect(prompt).toContainText(money(totalCents));
  const waiting = await readJob(request, id);
  expect(waiting.status).toBe("awaiting_approval");
  expect(waiting.invoice).toBeUndefined();
  await page.getByTestId("approve-button").click();

  const result = page.getByTestId("result");
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("invoice-amount")).toHaveText(money(totalCents));
  await expect(page.getByTestId("invoice-status")).toContainText(/sent/i);
  await expect(page.getByTestId("readback")).toContainText("Read back from PayPal");
  await expect(page.getByText("Approved", { exact: true })).toBeHidden({ timeout: 15_000 }); // the toast covers the result
  await page.screenshot({ path: `screenshots/${screenshot}-result-${paypal}-${live ? "live-ai" : "mock-ai"}.png`, fullPage: true });

  const done = await readJob(request, id);
  expect(done.status).toBe("sent");
  await expect(page.getByTestId("invoice-number")).toHaveText(done.invoice!.number);

  const audit = await (await request.get("/api/audit")).json();
  expect(audit.integrity.ok).toBe(true);
  const actions = audit.entries.filter((e: { tool?: string }) => e.tool === "send_job_invoice").map((e: { action: string }) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["approval.requested", "approval.approved", "tool.executed"]));

  if (sandbox) {
    // Straight from PayPal, not through the app.
    const invoice = await readInvoiceFromPayPal(done.invoice!.id);
    expect(invoice.status).toBe("SENT");
    expect(invoice.amount).toMatchObject({ currency_code: "USD", value: (totalCents / 100).toFixed(2) });
    expect(invoice.items.map((item) => [item.name, item.quantity, item.unit_amount.value])).toEqual(done.lines.map((line) => [line.name, (line.quantityMilli / 1000).toFixed(3).replace(/\.?0+$/, ""), (line.unitCents / 100).toFixed(2)]));
    expect(invoice.detail.invoice_number).toBe(done.invoice!.number);
    expect(invoice.primary_recipients[0].billing_info.email_address).toBe(done.customer.email);
    expect(invoice.detail.payment_term?.due_date).toBe(done.dueDate);
    console.log(`PayPal re-read: invoice ${invoice.id} number ${invoice.detail.invoice_number} ${invoice.status} ${invoice.amount.currency_code} ${invoice.amount.value} due ${invoice.detail.payment_term?.due_date} items ${JSON.stringify(invoice.items.map((i) => [i.name, i.quantity, i.unit_amount.value]))}`);
  }
  console.log(`Job ${id}: speech=${done.speech?.model ?? "sample"} heard=${done.speech?.durationSec ?? 0}s ai mocked=${done.ai.mocked} model=${done.ai.model ?? "none"} cost=$${done.ai.costUsd.toFixed(4)}`);
  return done;
}
