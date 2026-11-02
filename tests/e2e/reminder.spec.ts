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
