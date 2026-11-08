import { expect, test } from "@playwright/test";
import { auditedActions, expectPlainWords, jobId, keepToOneCall, kitStatus, proposeReminder, readJob, sentSample } from "./flow";
import { readInvoiceFromPayPal } from "./paypal-reread";

/** What PayPal's email would show as raw symbols. */
const MARKUP = /<[^>]+>|\*\*|__|`|^\s*#|\p{Extended_Pictographic}/mu;

test.describe("the reminder agent", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    test.skip(keepToOneCall((await kitStatus(request)).live), "the live run proves this in the mic flow");
  });

  test("proposes a reminder for an unpaid invoice and sends it only after approval", async ({ page, request }) => {
    test.setTimeout(150_000);
    const sent = await sentSample(page, request);
    const prompt = await proposeReminder(page);
    await expect(prompt).toBeInViewport();
    await expect(prompt).toContainText(sent.invoice!.number);
    await expect(prompt).toContainText("$110.00");

    const waiting = await readJob(request, sent.id);
    expect(waiting.reminders ?? []).toEqual([]);
    expect(waiting.approval?.note).toContain(sent.invoice!.number);
    const runId = waiting.reminderRunId!;
    expect(await auditedActions(request, "send_payment_reminder", runId)).not.toContain("tool.executed");

    await page.getByTestId("approve-button").click();
    await expect(page.getByTestId("reminder-sent")).toContainText(sent.invoice!.number, { timeout: 30_000 });
    expect(await auditedActions(request, "send_payment_reminder", runId)).toEqual(expect.arrayContaining(["approval.requested", "approval.approved", "tool.executed"]));

    // The page stays on the reminder after the job settles, and doesn't jump back to the top.
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("reminder-sent")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("result-headline")).not.toBeInViewport();
    await page.screenshot({ path: "screenshots/reminder-sent-phone.png", fullPage: true });
  });

  test("code refuses a figure the invoice doesn't have before any card, and the corrected note goes out", async ({ page, request }) => {
    test.setTimeout(150_000);
    const sent = await sentSample(page, request);
    await page.getByTestId("reminder-ask").fill("Add a $25 discount for paying early");
    const prompt = await proposeReminder(page);
    const refused = page.getByTestId("reminder-refused");
    await expect(refused).toHaveCount(1);
    await expect(refused).toContainText("$25");
    await expect(page.getByTestId("reminder-refused-reason")).toHaveText("The note says $25.00, but the amount due is $110.00.");
    await expect(prompt).not.toContainText("$25");

    const job = await readJob(request, sent.id);
    expect(job.refusedNotes).toHaveLength(1);
    const actions = await auditedActions(request, "send_payment_reminder", job.reminderRunId!);
    expect(actions.filter((a) => a === "tool.failed")).toHaveLength(1);
    expect(actions.filter((a) => a === "approval.requested")).toHaveLength(1); // one card: the refused note never got one

    await page.getByTestId("approve-button").click();
    await expect(page.getByTestId("reminder-sent")).not.toContainText("$25", { timeout: 30_000 });
    await expect(page.getByTestId("reminder-sent")).toContainText("$110.00");
  });

  test("a late fee the AI writes in by itself is stopped, and the screen says why", async ({ page, request }) => {
    test.skip((await kitStatus(request)).live, "Mock only: the model is told to leave fees out, so this needs the scripted note");
    test.setTimeout(150_000);
    const sent = await sentSample(page, request);
    await page.getByTestId("reminder-ask").fill("Add a late fee");
    const prompt = await proposeReminder(page);
    await expect(page.getByTestId("reminder-refused")).toHaveCount(1);
    await expect(page.getByTestId("reminder-refused")).toContainText("The AI's note was stopped before you saw it");
    await expect(page.getByTestId("reminder-refused-reason")).toContainText("late fee you didn't set");
    await expect(page.getByTestId("reminder-refused-reason")).toContainText("Your own line");
    await expect(prompt).not.toContainText(/late fee/i);
    await expect(page.getByTestId("owner-line-why")).toContainText("Only you can add a fee or a deposit");
    await page.getByTestId("approve-button").click();
    await expect(page.getByTestId("reminder-sent")).toContainText(sent.invoice!.number, { timeout: 30_000 });
    expect((await readJob(request, sent.id)).invoice!.totalCents).toBe(sent.invoice!.totalCents); // no fee went on the invoice
  });

  test("the person's own late fee goes on PayPal's invoice first, so the note and PayPal agree", async ({ page, request }) => {
    test.setTimeout(180_000);
    const { sandbox } = await kitStatus(request);
    const sent = await sentSample(page, request);
    const before = sent.invoice!.totalCents;
    await page.getByTestId("owner-line-kind").selectOption("late_fee");
    await page.getByTestId("owner-line-amount").fill("0");
    await expect(page.getByTestId("owner-line-error")).toContainText("above $0");
    await expect(page.getByTestId("ask-reminder")).toBeDisabled();
    await page.getByTestId("owner-line-amount").fill("25");
    await expect(page.getByTestId("owner-line-after")).toContainText("$135.00 is due");
    await expect(page.getByTestId("owner-line-why")).toContainText("Yours goes on PayPal's invoice first");
    // Markup typed in the ask is taken out before the AI sees it.
    await page.getByTestId("reminder-ask").fill("Thanks for having me out <b>again</b> **today** 😀");
    const prompt = await proposeReminder(page);
    await expect(prompt).toContainText("Add a $25.00 late fee");
    await expect(prompt).toContainText("$135.00");
    const waiting = await readJob(request, sent.id);
    expect(waiting.approval!.note).not.toMatch(MARKUP);
    expect(waiting.approval!.note).toMatch(/late fee/i); // the person's own fee, so the note may say it
    expect(waiting.approval!.note).toContain("$135.00");
    expect(waiting.invoice!.totalCents).toBe(before); // nothing on PayPal changes until the person approves
    if (sandbox) expect((await readInvoiceFromPayPal(sent.invoice!.id)).amount.value).toBe("110.00");

    await page.getByTestId("approve-button").click();
    await expect(page.getByTestId("reminder-sent")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId("owner-line-applied")).toContainText("$25.00 late fee is on PayPal's invoice");
    const done = await readJob(request, sent.id);
    expect(done.invoice).toMatchObject({ totalCents: before + 2_500, dueCents: before + 2_500 });
    expect(done.reminders!.at(-1)!.note).not.toMatch(MARKUP);
    expect(done.lines.at(-1)).toMatchObject({ name: "Late fee", unitCents: 2_500 });
    if (sandbox) {
      const invoice = await readInvoiceFromPayPal(sent.invoice!.id);
      expect(invoice.status).toBe("SENT");
      expect(invoice.amount.value).toBe("135.00");
      expect(invoice.items.map((i) => [i.name, i.unit_amount.value])).toContainEqual(["Late fee", "25.00"]);
      console.log(`PayPal re-read: invoice ${invoice.id} number ${invoice.detail.invoice_number} ${invoice.status} USD ${invoice.amount.value} items ${JSON.stringify(invoice.items.map((i) => [i.name, i.unit_amount.value]))}`);
    }
    console.log(`Reminder with late fee: ${done.reminders!.at(-1)!.note}`);
    await expectPlainWords(page);
  });

  test("a declined reminder sends nothing", async ({ page, request }) => {
    test.setTimeout(150_000);
    await sentSample(page, request);
    await proposeReminder(page);
    await page.getByTestId("decline-button").click();
    await expect(page.getByTestId("reminder-nothing")).toContainText("Nothing was sent. You declined it.", { timeout: 30_000 });
    await expect(page.getByTestId("ask-reminder")).toBeEnabled();

    const done = await readJob(request, jobId(page));
    expect(done.reminders ?? []).toEqual([]);
    const actions = await auditedActions(request, "send_payment_reminder", done.reminderRunId);
    expect(actions).toContain("approval.denied");
    expect(actions).not.toContain("tool.executed");
  });
});
