import { expect, test } from "@playwright/test";
import { auditedActions, expectPlainWords, toggleForJudges, jobId, keepToOneCall, kitStatus, openWhatHappened, proposeReminder, readJob, sentSample, showAllSteps } from "./flow";
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
    // The late-payment figures are pitch, not the trade's business: none on the job, all on /built, each with its source.
    await expect(page.getByTestId("reminder-card")).toBeVisible();
    await expect(page.getByTestId("reminder-why")).toHaveCount(0);
    await expect(page.getByTestId("reminder-card")).not.toContainText(/QuickBooks|Levelset|56%|49%/);
    const built = await page.context().newPage();
    await built.goto("/built");
    const why = built.getByTestId("reminder-why");
    await expect(why).toContainText("56%");
    await expect(why).toContainText("49%");
    for (const href of await why.getByTestId("reminder-why-source").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))) expect(href).toMatch(/^https:\/\/(quickbooks\.intuit\.com|levelset\.com)\//);
    await built.close();
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
    // PayPal sends it. On the sandbox, through the Agent Toolkit's send_invoice_reminder, shown behind Details.
    await expect(page.getByTestId("plain-step").filter({ hasText: "PayPal sent the reminder" })).toHaveCount(1);
    if ((await kitStatus(request)).sandbox) await expectPlainWords(page, /Agent Toolkit · send_invoice_reminder/);
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

  test("an ask the site refuses before the agent starts says why on the card, and asking again drafts the note", async ({ page, request }) => {
    test.setTimeout(150_000);
    test.skip(!!process.env.E2E_BASE_URL, "screen behaviour, proven locally; it would spend the hosted site's AI allowance");
    await sentSample(page, request);
    // The hosted site's per-minute AI limit, as it answers: the card says it, not a toast that's gone in seconds.
    let refusals = 1;
    await page.route("**/api/jobs/*/remind", async (route) => {
      if (refusals-- <= 0) return route.fallback();
      await route.fulfill({ status: 429, headers: { "Retry-After": "3" }, json: { error: { type: "rate_limited", message: "Too many requests. Try again in 3s.", retry_after_seconds: 3, limit: 8, per: "minute" } } });
    });
    const prompt = await proposeReminder(page);
    await expect(prompt).toBeVisible();
    // Asking again cleared it.
    await expect(page.getByTestId("reminder-problem")).toHaveCount(0);
  });

  test("the refusal itself reads plainly and stays until the person asks again", async ({ page, request }) => {
    test.setTimeout(150_000);
    test.skip(!!process.env.E2E_BASE_URL, "screen behaviour, proven locally; it would spend the hosted site's AI allowance");
    await sentSample(page, request);
    await page.route("**/api/jobs/*/remind", (route) => route.fulfill({ status: 429, json: { error: { type: "rate_limited", message: "Too many requests. Try again in 40s.", retry_after_seconds: 40, limit: 8, per: "minute" } } }));
    await page.getByTestId("ask-reminder").click();
    const problem = page.getByTestId("reminder-problem");
    await expect(problem).toHaveText("Nothing was sent. This demo allows 8 AI requests a minute per person. Try again in 40 seconds.");
    await page.waitForTimeout(9_000); // longer than a toast stays
    await expect(problem).toBeVisible();
    await expect(page.getByTestId("ask-reminder")).toBeEnabled();
    await expect(page.getByTestId("approval-prompt")).toHaveCount(0);
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

  test("the agent looks the invoice up through PayPal's Agent Toolkit, behind the Guard, and the reads show on What happened and Activity", async ({ page, request }) => {
    test.setTimeout(150_000);
    const { sandbox } = await kitStatus(request);
    const sent = await sentSample(page, request);
    await expect(page.getByTestId("toolkit-chip")).toHaveCount(0);
    // Which toolkit tool each read used is for judges: the step's words say it plainly.
    await toggleForJudges(page);
    await proposeReminder(page);
    const runId = (await readJob(request, sent.id)).reminderRunId!;
    // Each read went through the Guard and is on the record.
    for (const tool of ["search_invoicing", "get_invoice"]) expect(await auditedActions(request, tool, runId)).toEqual(expect.arrayContaining(["tool.requested", "tool.executed"]));

    await openWhatHappened(page);
    const found = page.getByTestId("plain-step").filter({ hasText: "found the invoice on PayPal" });
    await expect(found).toHaveCount(1);
    await expect(found.getByTestId("toolkit-chip")).toHaveText("Agent Toolkit · search_invoicing");
    await expect(page.getByTestId("plain-step").filter({ hasText: "read the invoice and the work on it from PayPal" }).getByTestId("toolkit-chip")).toHaveText("Agent Toolkit · get_invoice");
    await page.screenshot({ path: `screenshots/reminder-toolkit-reads-${sandbox ? "sandbox" : "mock"}.png`, fullPage: true });
    // On the sandbox the toolkit's own PayPalAPI made the calls, shown behind Details.
    // With For judges closed: the endpoints are on the judges' side of the switch.
    if (sandbox) {
      await toggleForJudges(page);
      await expectPlainWords(page, /Agent Toolkit · (search_invoicing|get_invoice)/);
      await toggleForJudges(page);
    }
    await page.getByTestId("decline-button").click();

    await page.goto("/activity");
    const group = page.locator(`[data-testid="activity-job"][data-job="${sent.id}"]`);
    await expect(group).toBeVisible();
    await showAllSteps(page);
    const read = group.getByTestId("activity-row").filter({ hasText: "found the invoice on PayPal, through PayPal's Agent Toolkit." });
    await expect(read).toHaveCount(1);
    await expect(read.getByTestId("toolkit-chip")).toHaveText("Agent Toolkit · search_invoicing");
    await expect(group.getByTestId("activity-row").filter({ hasText: "read the invoice and the work on it from PayPal, through PayPal's Agent Toolkit." })).toHaveCount(1);
    await page.screenshot({ path: `screenshots/activity-toolkit-reads-${sandbox ? "sandbox" : "mock"}.png`, fullPage: true });
    if (sandbox) {
      const invoice = await readInvoiceFromPayPal(sent.invoice!.id);
      console.log(`Toolkit reads: run ${runId} on invoice ${invoice.id} number ${invoice.detail.invoice_number} ${invoice.status}`);
    }
  });
});
