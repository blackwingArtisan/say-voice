/** The part both flows share: from the confirm screen through the gate to PayPal's own record. */
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { readInvoiceFromPayPal } from "./paypal-reread";
import { computeTotals } from "../../src/lib/say/money";
import type { JobView } from "../../src/lib/say/types";

/** How the invoice note writes the date of service. */
export const longServiceDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

export async function kitStatus(request: APIRequestContext) {
  const status = await (await request.get("/api/kit/status")).json();
  return { sandbox: status.paypal.mode === "sandbox", live: status.ai.mode === "live", paypal: status.paypal.mode as string, speechLive: status.speech.mode === "live" };
}

/** A local live run spends on the one mic clip only. A deployed copy always runs the sample flow. */
export const keepToOneCall = (live: boolean) => live && !process.env.E2E_BASE_URL;

/** The hosted app allows 6 AI requests a minute per address. A job, a reminder and a speech upload count as one each. */
const AI_CALL_GAP_MS = 11_000;
let lastAiCall = 0;

export async function paceAiCalls(calls = 1) {
  if (!process.env.E2E_BASE_URL) return;
  const wait = lastAiCall + AI_CALL_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastAiCall = Date.now() + (calls - 1) * AI_CALL_GAP_MS;
}

/** The app scopes jobs and prices to the browser, so a call from outside it has to say whose. */
export async function visitorHeaders(page: Page) {
  return { "x-say-visitor": await page.evaluate(() => localStorage.getItem("say-visitor") ?? "") };
}

/** Contacts load from an effect, so seeing one means the page is live. A tap before that does nothing, on any React page. */
export async function openNewJob(page: Page) {
  await page.goto("/jobs");
  await expect(page.getByTestId(/^contact-(?!other)/).first()).toBeVisible();
}

/** Starts the sample job and lands on its confirm screen. */
export async function startSample(page: Page) {
  await paceAiCalls();
  await openNewJob(page);
  await page.getByTestId("try-sample").click();
  await page.waitForURL(/\/jobs\/job_/);
  await expect(page.getByTestId("invoice-line").first()).toBeVisible();
}

/** Fifty heard as fifteen: takes the price book's one-tap fix, so the job is clear to send. */
export async function fixElementPrice(page: Page) {
  const element = page.getByTestId("invoice-line").nth(1);
  await element.getByTestId("use-usual").click();
  await expect(element.getByTestId("line-price")).toHaveValue("50.00");
  await settleAiNotes(page);
}

async function pressAll(buttons: Locator) {
  while (await buttons.count()) {
    const before = await buttons.count();
    await buttons.first().click();
    await expect(buttons).toHaveCount(before - 1);
  }
}

/** Takes the price book's fix where it has one, and lets everything else stand. */
export async function settleChecks(page: Page) {
  for (const testId of ["use-usual", "keep-description", "keep-line", "settle-flag", "not-a-charge"]) await pressAll(page.getByTestId(testId));
}

/**
 * Real AI adds notes of its own, different each run, and a person clears them. Mock has none, so a stray one there still fails.
 * A note about no row has Looks right. One on the Labor row has Keep. The element row's Keep stays the test's own business.
 * A word the AI wrote that wasn't said has its own button, which settles only that.
 */
export async function settleAiNotes(page: Page) {
  if (!process.env.E2E_BASE_URL) return;
  await pressAll(page.getByTestId("settle-flag"));
  await pressAll(page.getByTestId("keep-description"));
  await pressAll(page.getByTestId("invoice-line").first().getByTestId("keep-line"));
}

/** The sample's one price check, plus whatever notes the AI added this run. */
export const checkCount = process.env.E2E_BASE_URL ? /\d+ things? to check/ : /1 thing to check/;

export const totalOnScreen = async (page: Page) => Math.round(Number((await page.getByTestId("invoice-total").innerText()).replace(/[$,]/g, "")) * 100);

/** Sets a job on its way and returns once PayPal has it, for tests about what comes after. */
export async function sentSample(page: Page, request: APIRequestContext) {
  await startSample(page);
  await fixElementPrice(page);
  await page.getByTestId("send-invoice").click();
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 });
  return readJob(request, jobId(page));
}

/** Asks the agent for a reminder and waits for its proposal. Returns the words the customer would read. */
export async function proposeReminder(page: Page) {
  await paceAiCalls();
  await page.getByTestId("ask-reminder").click();
  const prompt = page.getByTestId("approval-prompt");
  await expect(prompt).toBeVisible({ timeout: 60_000 });
  return prompt;
}

/** What the audit log recorded for one tool, read from the app. */
export async function auditedActions(request: APIRequestContext, tool: string, runId?: string) {
  const audit = await (await request.get("/api/audit")).json();
  expect(audit.integrity.ok).toBe(true);
  return audit.entries.filter((e: { tool?: string; runId?: string }) => e.tool === tool && (!runId || e.runId === runId)).map((e: { action: string }) => e.action) as string[];
}

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
  // The app's own re-read carries the note PayPal holds.
  if (done.details?.summary) {
    expect(done.invoice!.note).toContain(done.details.summary);
    await expect(page.getByTestId("result-note")).toContainText(done.details.summary);
  }

  expect(await auditedActions(request, "send_job_invoice")).toEqual(expect.arrayContaining(["approval.requested", "approval.approved", "tool.executed"]));

  if (sandbox) {
    // Straight from PayPal, not through the app.
    const invoice = await readInvoiceFromPayPal(done.invoice!.id);
    expect(invoice.status).toBe("SENT");
    expect(invoice.amount).toMatchObject({ currency_code: "USD", value: (totalCents / 100).toFixed(2) });
    expect(invoice.items.map((item) => [item.name, item.quantity, item.unit_amount.value])).toEqual(done.lines.map((line) => [line.name, (line.quantityMilli / 1000).toFixed(3).replace(/\.?0+$/, ""), (line.unitCents / 100).toFixed(2)]));
    expect(invoice.detail.invoice_number).toBe(done.invoice!.number);
    expect(invoice.primary_recipients[0].billing_info.email_address).toBe(done.customer.email);
    expect(invoice.detail.payment_term?.due_date).toBe(done.dueDate);
    // What, where and when, and what each line covers, as the customer reads them on PayPal.
    const details = done.details!;
    for (const part of [details.summary, details.site].filter(Boolean)) expect(invoice.detail.note).toContain(part);
    if (details.serviceDate) expect(invoice.detail.note).toContain(longServiceDate(details.serviceDate));
    expect(invoice.items.map((item) => item.description ?? "")).toEqual(done.lines.map((line) => line.description ?? ""));
    expect(invoice.items.map((item) => item.item_date ?? "")).toEqual(done.lines.map(() => details.serviceDate));
    // Tax per item: on the lines marked taxed, and nowhere else.
    const taxed = (line: (typeof done.lines)[number]) => done.taxRateMilli > 0 && line.taxed !== false;
    expect(invoice.items.map((item) => item.tax?.percent ?? null)).toEqual(done.lines.map((line) => (taxed(line) ? (done.taxRateMilli / 1000).toString() : null)));
    const taxCents = computeTotals(done.lines, done.taxRateMilli).taxCents;
    expect(invoice.amount.breakdown?.tax_total?.value ?? "0.00").toBe((taxCents / 100).toFixed(2));
    console.log(`PayPal re-read note: ${JSON.stringify(invoice.detail.note)} descriptions ${JSON.stringify(invoice.items.map((i) => i.description))} item_date ${invoice.items[0]?.item_date ?? "none"} tax ${JSON.stringify(invoice.items.map((i) => i.tax?.percent ?? null))} tax_total ${invoice.amount.breakdown?.tax_total?.value ?? "0"}`);
    console.log(`PayPal re-read: invoice ${invoice.id} number ${invoice.detail.invoice_number} ${invoice.status} ${invoice.amount.currency_code} ${invoice.amount.value} due ${invoice.detail.payment_term?.due_date} items ${JSON.stringify(invoice.items.map((i) => [i.name, i.quantity, i.unit_amount.value]))}`);
  }
  console.log(`Job ${id}: speech=${done.speech?.model ?? "sample"} heard=${done.speech?.durationSec ?? 0}s ai mocked=${done.ai.mocked} model=${done.ai.model ?? "none"} cost=$${done.ai.costUsd.toFixed(4)}`);
  return done;
}
