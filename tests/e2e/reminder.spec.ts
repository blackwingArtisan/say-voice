import { expect, test } from "@playwright/test";
import { auditedActions, jobId, keepToOneCall, kitStatus, proposeReminder, readJob, sentSample } from "./flow";

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
    await page.getByTestId("reminder-ask").fill("Add a $25 late fee");
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
