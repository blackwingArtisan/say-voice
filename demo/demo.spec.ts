/**
 * DEMO VIDEO (npm run demo:record). At phone width, on the PayPal sandbox with live speech and AI:
 * the roofer's real invoice, a person saying a job, the price book's catch, the approval, the guard
 * refusing a figure, the customer paying on PayPal's page, Paid. Under 3 minutes.
 *
 * Playwright's video has no sound, so this writes test-results/demo/timeline.json (video files and
 * when the record button was pressed) for scripts/demo-finish.ts, which stitches PayPal's checkout
 * window in and lays the voice under the record press.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bringIntoView,
  caption,
  DemoClock,
  highlight,
  imageCard,
  removeImageCard,
  titleCard,
} from "./captions";
import { appConfig } from "../src/app.config";

export const PHONE = { width: 430, height: 932 };
const VOICE_SECONDS = Number(process.env.DEMO_VOICE_SECONDS ?? 7);
const OUT = path.resolve("test-results/demo");

const point = (page: Page, text: string, target: Locator, ms?: number) =>
  Promise.all([caption(page, text, { ms }), highlight(page, target, 3200)]);

test("demo", async ({ browser }) => {
  test.setTimeout(420_000);
  fs.mkdirSync(OUT, { recursive: true });
  // PayPal shows its card form in a checkout window only for a browser that names itself truthfully, so the whole recording uses the real user agent.
  const { userAgent } = await (
    await browser.newBrowserCDPSession()
  ).send("Browser.getVersion");
  const context = await browser.newContext({
    baseURL: `http://localhost:${process.env.DEMO_PORT ?? 3930}`,
    userAgent,
    viewport: PHONE,
    deviceScaleFactor: 2,
    permissions: ["microphone"],
    recordVideo: {
      dir: path.join(OUT, "raw"),
      size: { width: PHONE.width * 2, height: PHONE.height * 2 },
    },
  });
  // The voice clip is the microphone: the recorder, its level meter and the upload to the speech model all get it, starting at the press.
  const voice = fs.readFileSync(process.env.DEMO_VOICE_WAV ?? path.join(OUT, "voice.wav")).toString("base64");
  await context.addInitScript((b64: string) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      await audio.resume();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const source = audio.createBufferSource();
      source.buffer = await audio.decodeAudioData(bytes.buffer);
      const out = audio.createMediaStreamDestination();
      source.connect(out);
      source.start();
      Object.assign(window, { voiceStartedAt: Date.now() });
      return out.stream;
    };
  }, voice);
  const page = await context.newPage();
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const timeline: Record<string, unknown> = {
    main: "",
    popups: [] as unknown[],
  };
  const clock = new DemoClock(175);

  // Open: the roofer's real invoice, as the customer saw it.
  await page.goto("/");
  await imageCard(
    page,
    "/proof/roofer-invoice.png",
    "A real roofer's job, as the customer saw it",
    600,
  );
  await caption(
    page,
    "A roofer said this $600 job out loud. The customer's PayPal invoice says what was fixed, on every line.",
    { ms: 5200 },
  );
  await caption(
    page,
    "In testing, an AI model stated a wrong total on 6 of 20 clips. So here, code does every sum.",
    { ms: 4600 },
  );
  await removeImageCard(page);
  await point(
    page,
    "Say-Voice is for one-person trades who bill from the van.",
    page.getByTestId("hero-proof"),
    3600,
  );
  await point(
    page,
    "Why not Housecall Pro? No suite. Your words beside every number, and nothing sent without your approval.",
    page.getByTestId("hero-why-not"),
    5200,
  );
  clock.check("open");

  // A person speaks.
  await page.goto("/jobs");
  const contact = page.getByTestId("contact-derek-evans");
  await expect(contact).toBeVisible();
  await contact.click();
  await point(
    page,
    "The customer comes from your contacts. Names never come from speech.",
    contact,
    3200,
  );
  await bringIntoView(page.getByTestId("record-start"));
  await caption(page, "Press record and say the job.", { wait: false });
  await page.getByTestId("record-start").click();
  await page.waitForFunction(() => "voiceStartedAt" in window);
  timeline.recordPressMs = (await page.evaluate(() => (window as unknown as { voiceStartedAt: number }).voiceStartedAt)) - t0;
  await expect.poll(async () => Number(await page.getByTestId("mic-level").getAttribute("data-peak")), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await page.waitForTimeout(VOICE_SECONDS * 1000 + 600);
  await page.getByTestId("record-stop").click();
  timeline.recordStopMs = at();
  await bringIntoView(page.getByTestId("mode-badges").filter({ visible: true }));
  await caption(
    page,
    "ElevenLabs Scribe v2 writes it down. Claude Sonnet 5.5 turns it into line items. The meter is today's AI spend.",
    { wait: false },
  );
  await highlight(page, page.getByTestId("mode-badges").filter({ visible: true }), 5000);
  await page.waitForURL(/\/jobs\/job_/, { timeout: 90_000 });
  await expect(page.getByTestId("invoice-line").first()).toBeVisible();
  clock.check("heard");

  // The catch.
  await point(
    page,
    "Word for word, what was said.",
    page.getByTestId("transcript"),
    3400,
  );
  const element = page
    .getByTestId("invoice-line")
    .filter({ has: page.getByTestId("use-usual") });
  await expect(element).toHaveCount(1);
  const before = await page.getByTestId("invoice-total").innerText();
  await point(
    page,
    "Said: $15. This part usually costs $50, so the send is held. The price book stops a wrong price, whoever made it.",
    element,
    6200,
  );
  await element.getByTestId("use-usual").click();
  await expect(page.getByTestId("invoice-total")).not.toHaveText(before);
  await point(
    page,
    `One tap. Code works the total out again, in cents: ${before} became ${await page.getByTestId("invoice-total").innerText()}.`,
    page.getByTestId("invoice-total"),
    4600,
  );
  // Live AI can add notes of its own. A person clears them, and so does this.
  for (const id of ["settle-flag", "keep-description", "keep-line"]) {
    const buttons = page.getByTestId(id);
    while (await buttons.count()) await buttons.first().click();
  }
  await expect(page.getByTestId("job-summary")).not.toHaveValue("");
  await point(
    page,
    "A second AI call, Claude Haiku, writes what the customer reads, in your words.",
    page.getByTestId("line-description").first(),
    3800,
  );
  clock.check("caught");

  // The approval.
  await page.getByTestId("send-invoice").click();
  const prompt = page.getByTestId("approval-prompt");
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await point(
    page,
    "Nothing reaches the customer until you approve this exact amount.",
    prompt.getByTestId("approve-button"),
    3400,
  );
  await prompt.getByTestId("approve-button").click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Approved", { exact: true })).toBeHidden({
    timeout: 15_000,
  });
  await point(
    page,
    "PayPal created and sent it. The number and status are read back from PayPal.",
    page.getByTestId("invoice-number"),
    3600,
  );
  clock.check("sent");

  // The guard refusing.
  const jobUrl = page.url();
  await bringIntoView(page.getByTestId("reminder-ask"));
  await page
    .getByTestId("reminder-ask")
    .pressSequentially("Add a $25 late fee", { delay: 40 });
  await caption(
    page,
    "Ask the reminder agent for a $25 late fee that isn't on the PayPal invoice.",
    { wait: false },
  );
  await page.getByTestId("ask-reminder").click();
  await page.waitForTimeout(3_500);
  await caption(page, "Claude Haiku reads the invoice from PayPal and drafts the note, with the fee as asked.", { wait: false });
  const refused = page.getByTestId("reminder-refused");
  await expect(refused.first()).toBeVisible({ timeout: 60_000 });
  await point(
    page,
    "The agent wrote it. Code refused it before any approval card: the customer only reads what PayPal says is owed.",
    refused.first(),
    5600,
  );
  const reminder = page.getByTestId("approval-prompt");
  await expect(reminder).toBeVisible({ timeout: 60_000 });
  await point(
    page,
    "The agent fixed it. The corrected reminder waits for you too.",
    reminder.getByTestId("approve-button"),
    3400,
  );
  await reminder.getByTestId("approve-button").click();
  await expect(page.getByTestId("reminder-sent")).toBeVisible({
    timeout: 30_000,
  });
  await point(
    page,
    "Sent through PayPal, only after that approval.",
    page.getByTestId("reminder-sent"),
    2600,
  );
  clock.check("refused");

  // The customer pays on PayPal's own page.
  const job = await (
    await page.request.get(
      `/api/jobs/${new URL(jobUrl).pathname.split("/").pop()}`,
    )
  ).json();
  const payerUrl = job.invoice.payerUrl as string;
  const status = await (await page.request.get("/api/kit/status")).json();
  if (status.paypal.mode !== "sandbox") {
    // Mock PayPal has no customer page, so it plays the customer. Only the sandbox recording is the real demo.
    await page.request.post(`/api/dev/pay-invoice/${job.invoice.id}`);
    return finish(page, jobUrl);
  }
  await page.goto(payerUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByText(appConfig.tradeName).first()).toBeVisible({
    timeout: 45_000,
  });
  const cookies = page.getByRole("button", { name: "Yes, I accept" });
  if (await cookies.isVisible().catch(() => false)) await cookies.click();
  await caption(
    page,
    `The customer's PayPal invoice, from ${appConfig.tradeName}. They pay as a guest with PayPal's test card.`,
    { wait: false },
  );
  const cardButtons = () =>
    page
      .frames()
      .find(
        (f) =>
          f.url().includes("smart/buttons") &&
          f.url().includes("style.color=black"),
      );
  await expect.poll(cardButtons, { timeout: 45_000 }).toBeTruthy();
  await page.waitForTimeout(4_000); // the buttons draw before their click handlers are ready
  const [checkout] = await Promise.all([
    context.waitForEvent("page", { timeout: 30_000 }),
    cardButtons()!.locator('[data-funding-source="card"]').first().click(),
  ]);
  (timeline.popups as unknown[]).push({
    openMs: at(),
    video: await checkout.video()!.path(),
  });
  await checkout.locator("#cardNumber").waitFor({ timeout: 30_000 });
  await caption(
    checkout,
    "Test card 4111 1111 1111 1111, on PayPal's own checkout.",
    { wait: false },
  );
  await checkout
    .locator("#cardNumber")
    .pressSequentially("4111111111111111", { delay: 30 });
  await checkout
    .locator("#cardExpiry")
    .pressSequentially("1230", { delay: 30 });
  await checkout.locator("#cardCvv").pressSequentially("123", { delay: 30 });
  await checkout.locator("#billingLine1").fill("1 Main St");
  await checkout.locator("#billingCity").fill("San Jose");
  await checkout.locator("#billingState").selectOption("CA");
  await checkout.locator("#billingPostalCode").fill("95131");
  await checkout
    .locator("#phone")
    .pressSequentially("4085551234", { delay: 20 });
  const createAccount = checkout.getByTestId("onboard-options-switch");
  if ((await createAccount.count()) && (await createAccount.isChecked()))
    await createAccount.evaluate((el: HTMLInputElement) => el.click());
  const pay = checkout.getByRole("button", { name: "Pay now as guest" });
  await pay.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const closed = checkout.waitForEvent("close", { timeout: 60_000 });
  await pay.click();
  await Promise.race([
    closed,
    page.getByText("Payment successful").waitFor({ timeout: 60_000 }),
  ]);
  (timeline.popups as { closeMs?: number }[]).at(-1)!.closeMs = at();
  await expect(page.getByText("Payment successful")).toBeVisible({
    timeout: 60_000,
  });
  await caption(page, "Paid, on PayPal's page.", { ms: 2400 });
  clock.check("paid on PayPal");
  await finish(page, jobUrl);

  async function finish(page: Page, jobUrl: string) {
    // Paid.
    await page.goto(jobUrl);
    await expect(page.getByTestId("result")).toBeVisible();
    const check = page.getByTestId("check-payment");
    if (await check.count()) {
      await bringIntoView(check);
      await caption(
        page,
        "On the hosted site PayPal's INVOICING.INVOICE.PAID webhook flips the job. On this laptop we ask PayPal.",
        { wait: false },
      );
      await check.click();
    }
    const banner = page.getByTestId("paid-banner");
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await point(
      page,
      "PAID, read from PayPal, with PayPal's transaction id.",
      banner,
      4600,
    );
    clock.check("paid");

    // End card.
    await titleCard(
      page,
      "Say-Voice",
      "Said in the van. Checked by code. Paid through PayPal.<br><span style='font-size:16px;opacity:.75'>PayPal Invoicing · ElevenLabs Scribe v2 · Claude Sonnet 5.5 and Haiku 5.5</span>",
      4200,
      { keep: true },
    );
    clock.check("end");

    timeline.endMs = at();
    timeline.main = await page.video()!.path();
    await context.close();
    fs.writeFileSync(
      path.join(OUT, "timeline.json"),
      JSON.stringify(timeline, null, 2),
    );
    console.log(`[demo] timeline ${JSON.stringify(timeline)}`);
  }
});
