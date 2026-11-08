/**
 * The real capture path: getUserMedia and MediaRecorder hearing Chromium's fake microphone, which
 * plays one computer-voice clip. Mock mode proves the capture and the upload; E2E_AI_MODE=live on
 * the sandbox config is the one paid run: that clip through ElevenLabs, then Sonnet, then PayPal.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { hasMicClip, MIC_CLIP } from "./fake-mic";
import { auditedActions, expectNoMockWords, jobId, kitStatus, paceAiCalls, proposeReminder, readJob, sendAndVerify, settleChecks, totalOnScreen } from "./flow";

/** Decodes the take with ffmpeg, so a silent or empty recording can't pass. A live recording has no duration header. */
function measure(file: string): { seconds: number; peakDb: number } {
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const time = [...log.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
  return { seconds: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0, peakDb: Number(/max_volume: (-?[\d.]+) dB/.exec(log)?.[1] ?? "-999") };
}

/** Playwright doesn't expose a Blob request body, so keep a copy of the upload as the page sends it. */
async function keepUpload(page: Page) {
  await page.addInitScript(() => {
    const send = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).endsWith("/api/speech") && init?.body instanceof Blob) {
        const bytes = Array.from(new Uint8Array(await init.body.arrayBuffer()));
        Object.assign(window, { sentAudio: { bytes, type: init.body.type } });
      }
      return send(input, init);
    };
  });
}

test("records with the real microphone path, then reaches a sent invoice", async ({ page, request }, info) => {
  test.skip(!hasMicClip, `No computer-voice clip at ${MIC_CLIP}. It can't be committed; set E2E_MIC_CLIP.`);
  const { live, speechLive } = await kitStatus(request);

  await paceAiCalls(2); // the upload and the job
  await keepUpload(page);
  await page.goto("/jobs");
  await expect(page.getByTestId("record-start")).toBeDisabled();
  await page.getByTestId("contact-derek-evans").click();
  await page.getByTestId("record-start").click();

  const level = page.getByTestId("mic-level");
  await expect(level).toBeVisible();
  await expect.poll(async () => Number((await level.getAttribute("data-peak")) ?? 0), { timeout: 30_000 }).toBeGreaterThan(0.01);
  const peak = await level.getAttribute("data-peak");

  // The clip is 17.2 s, so stop just after it ends.
  await expect(page.getByTestId("record-time")).toHaveText("0:19", { timeout: 30_000 });
  await page.getByTestId("record-stop").click();

  await page.waitForFunction(() => "sentAudio" in window);
  const sent = await page.evaluate(() => (window as unknown as { sentAudio: { bytes: number[]; type: string } }).sentAudio);
  expect(sent.type).toMatch(/^audio\//);
  const take = path.join(info.outputDir, "take.webm");
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(take, Buffer.from(sent.bytes));
  const { seconds, peakDb } = measure(take);
  console.log(`Captured ${sent.bytes.length} bytes of ${sent.type}, ${seconds.toFixed(1)} s, peak ${peakDb} dB, level meter peak ${peak}`);
  expect(seconds).toBeGreaterThan(15);
  expect(peakDb).toBeGreaterThan(-40);

  await page.waitForURL(/\/jobs\/job_/, { timeout: 120_000 });
  await expect(page.getByTestId("invoice-line").first()).toBeVisible();
  await expect(page.getByTestId("customer-name")).toHaveValue("Derek Evans");
  const job = await readJob(request, jobId(page));
  expect(job.source).toBe("mic");
  expect(job.speech?.mocked).toBe(!speechLive);
  expect(job.ai.mocked).toBe(!live);
  // What the judges saw in round 5: "Heard by Speech mock. Read by AI mock." On a live run nothing says mock.
  if (live && speechLive) {
    await expect(page.getByText(/^Heard by .+\. Read by .+\.$/)).toBeVisible();
    await expectNoMockWords(page);
  }
  console.log(`Heard: ${job.transcript}`);
  console.log(`Extracted: ${JSON.stringify({ lines: job.lines, taxRateMilli: job.taxRateMilli, dueDate: job.dueDate, flags: job.flags })}`);
  await page.screenshot({ path: `screenshots/mic-confirm-${live ? "live-ai" : "mock-ai"}.png`, fullPage: true });

  // Whatever came through, it has to be dealt with before it can go.
  const usual = await page.getByTestId("line-usual").allInnerTexts();
  console.log(`Price book said: ${JSON.stringify(usual)}`);
  if (!speechLive) expect(usual.join()).toContain("Usually $50.00");
  await expect(page.getByTestId("send-invoice")).toHaveCount(job.flags.length || usual.length ? 0 : 1);
  await settleChecks(page);
  const done = await sendAndVerify(page, request, await totalOnScreen(page), "mic");

  // The invoice is unpaid, so the agent can chase it. On a live run this is Claude writing to PayPal.
  const prompt = await proposeReminder(page);
  await expect(prompt).toContainText(done.invoice!.number);
  const proposed = await readJob(request, done.id);
  console.log(`Reminder agent proposed: ${proposed.approval?.note}`);
  expect(proposed.reminders ?? []).toEqual([]);
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("reminder-sent")).toContainText(done.invoice!.number, { timeout: 30_000 });
  expect(await auditedActions(request, "send_payment_reminder", proposed.reminderRunId)).toEqual(expect.arrayContaining(["approval.requested", "approval.approved", "tool.executed"]));
  await page.screenshot({ path: `screenshots/mic-reminder-${live ? "live-ai" : "mock-ai"}.png`, fullPage: true });
});
