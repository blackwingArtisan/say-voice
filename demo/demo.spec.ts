/**
 * DEMO VIDEO (npm run demo:record). Landscape 16:9, about two minutes: who it's for, the price book
 * learning from the trade's own PayPal invoices, a person saying a job, the price book's catch, the
 * approval, the Pay now QR, the guard refusing a figure, the customer paying on PayPal's page, Paid.
 *
 * Playwright's video has no sound, so this writes test-results/demo/timeline.json (video files, when
 * the record button was pressed, and the waits to cut) for scripts/demo-finish.ts, which stitches
 * PayPal's checkout window in, cuts the waits and lays the voice under the record press.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { bringIntoView, caption, DemoClock, highlight, imageCard, removeImageCard, titleCard } from "./captions";
import { appConfig } from "../src/app.config";
import { untilCheckoutCloses } from "../tests/e2e/pay-as-guest";

/** 16:9. The finisher scales it to 1920x1080. */
export const VIEW = { width: 1280, height: 720 };
const VOICE_SECONDS = Number(process.env.DEMO_VOICE_SECONDS ?? 7);
const OUT = path.resolve("test-results/demo");
/** What a viewer must be given time to read: the approval card and the learned book. */
const HOLD_MS = 4_000;

const point = (page: Page, text: string, target: Locator, ms?: number) => Promise.all([caption(page, text, { ms }), highlight(page, target, Math.max(ms ?? 0, 3200))]);

test("demo", async ({ browser }) => {
  test.setTimeout(420_000);
  fs.mkdirSync(OUT, { recursive: true });
  // PayPal shows its card form in a checkout window only for a browser that names itself truthfully, so the whole recording uses the real user agent.
  const { userAgent } = await (await browser.newBrowserCDPSession()).send("Browser.getVersion");
  const context = await browser.newContext({
    baseURL: `http://localhost:${process.env.DEMO_PORT ?? 3930}`,
    userAgent,
    viewport: VIEW,
    deviceScaleFactor: 1.5,
    permissions: ["microphone"],
    recordVideo: { dir: path.join(OUT, "raw"), size: VIEW },
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
      Object.assign(window, { voiceStartedAt: Date.now(), voiceState: audio.state });
      return out.stream;
    };
  }, voice);
  const page = await context.newPage();
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const timeline = { main: "", popups: [] as { openMs: number; closeMs?: number; video: string; size?: { width: number; height: number } }[], cuts: [] as { fromMs: number; toMs: number }[], recordPressMs: 0, recordStopMs: 0, endMs: 0 };
  /** A wait nobody needs to watch (a spinner, a page loading): cut from the video, keeping a beat of what it arrives at. */
  const cut = async <T,>(waiting: Promise<T> | (() => Promise<T>), beats = { lead: 0, tail: 300 }): Promise<T> => {
    const fromMs = at() + beats.lead;
    const result = await (typeof waiting === "function" ? waiting() : waiting);
    const toMs = at() - beats.tail;
    if (toMs - fromMs > 500) timeline.cuts.push({ fromMs, toMs });
    return result;
  };
  const clock = new DemoClock(200); // raw time, before the cuts

  // Open: who it's for, from the Census, then the roofer's real invoice.
  await cut(page.goto("/").then(() => expect(page.getByTestId("hero-lead")).toBeVisible()));
  await point(page, "2.9 million US construction businesses have no employees. The person who does the job also writes the bill.", page.getByTestId("hero-lead"), 5000);
  await imageCard(page, "/proof/roofer-invoice.png", "A real roofer's job, as the customer's PayPal page shows it", 300);
  await caption(page, "A roofer said this $600 job out loud. PayPal's invoice says what was fixed, on every line.", { ms: 4600 });
  await caption(page, "In testing, an AI model stated a wrong total on 6 of 20 clips. So here, code does every sum.", { ms: 4200 });
  await removeImageCard(page);
  await point(page, "56% of US small businesses are owed money on unpaid invoices, and 58% of contractors barely trust their AI tools.", page.getByTestId("pain-points"), 5200);
  clock.check("open");

  // The price book starts from the trade's own PayPal invoices.
  await cut(page.goto("/prices").then(() => expect(page.getByTestId("price-row").first()).toBeVisible()));
  await caption(page, "Learn from my PayPal invoices: GET /v2/invoicing/invoices reads the trade's past invoices.", { wait: false });
  await page.waitForTimeout(1_200);
  await page.getByTestId("learn-from-paypal").click();
  await cut(expect(page.getByTestId("learned-from-paypal")).toBeVisible({ timeout: 60_000 }));
  const pump = page.getByTestId("price-row").filter({ hasText: "Drain pump" });
  const from = /from \d+ PayPal invoices?(, last \$[\d,.]+)?/.exec(await pump.innerText())?.[0] ?? "from your PayPal invoices";
  await point(page, `Each price now says where it came from: "${from}".`, pump, HOLD_MS + 1600);
  clock.check("price book");

  // A person speaks.
  await cut(page.goto("/jobs").then(() => expect(page.getByTestId("contact-derek-evans")).toBeVisible()));
  const contact = page.getByTestId("contact-derek-evans");
  await contact.click();
  await point(page, "The customer comes from your contacts. Names never come from speech.", contact, 3000);
  await bringIntoView(page.getByTestId("record-start"));
  await caption(page, "Press record and say the job.", { wait: false });
  await page.getByTestId("record-start").click();
  await page.waitForFunction(() => "voiceStartedAt" in window);
  timeline.recordPressMs = (await page.evaluate(() => (window as unknown as { voiceStartedAt: number }).voiceStartedAt)) - t0;
  console.log(`[demo] voice audio context: ${await page.evaluate(() => (window as unknown as { voiceState: string }).voiceState)}`);
  await expect.poll(async () => Number(await page.getByTestId("mic-level").getAttribute("data-peak")), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await page.waitForTimeout(VOICE_SECONDS * 1000 + 600);
  await page.getByTestId("record-stop").click();
  timeline.recordStopMs = at();
  const meter = page.getByTestId("mode-badges").filter({ visible: true });
  await caption(page, "ElevenLabs Scribe v2 writes it down. Claude Sonnet 5.5 turns it into line items. The meter is today's AI spend.", { wait: false });
  if (await meter.count()) await highlight(page, meter.first(), 3600);
  await page.waitForTimeout(2_800);
  await cut(page.waitForURL(/\/jobs\/job_/, { timeout: 90_000 }).then(() => expect(page.getByTestId("invoice-line").first()).toBeVisible()));
  clock.check("heard");

  // The catch.
  await point(page, "Word for word, what was said, beside every number.", page.getByTestId("transcript"), 3000);
  const element = page.getByTestId("invoice-line").filter({ has: page.getByTestId("use-usual") });
  await expect(element).toHaveCount(1);
  const before = await page.getByTestId("invoice-total").innerText();
  await point(page, "Said: $15. Your PayPal invoices say $50, so the send is held. The price book stops a wrong price, whoever made it.", element, 5600);
  await element.getByTestId("use-usual").click();
  await expect(page.getByTestId("invoice-total")).not.toHaveText(before);
  await point(page, `One tap. Code works the total out again, in cents: ${before} became ${await page.getByTestId("invoice-total").innerText()}.`, page.getByTestId("invoice-total"), 3800);
  // Live AI can add notes of its own. A person clears them, and so does this.
  for (const id of ["settle-flag", "keep-description", "keep-line"]) {
    const buttons = page.getByTestId(id);
    while (await buttons.count()) await buttons.first().click();
  }
  clock.check("caught");

  // The approval: the Guard's card, held long enough to read.
  await page.getByTestId("send-invoice").click();
  const prompt = page.getByTestId("approval-prompt");
  await cut(expect(prompt).toBeVisible({ timeout: 30_000 }));
  await point(page, "The Guard holds it. Nothing reaches the customer until you approve this exact amount.", prompt, HOLD_MS);
  await prompt.getByTestId("approve-button").click();
  await cut(expect(page.getByTestId("result")).toBeVisible({ timeout: 60_000 }).then(() => expect(page.getByText("Approved", { exact: true })).toBeHidden({ timeout: 15_000 })));
  await point(page, "PayPal's Agent Toolkit created and sent it. Number and status are read back from PayPal.", page.getByTestId("invoice-number"), 3400);
  const qr = page.getByTestId("pay-qr");
  if (await qr.count()) await point(page, "Pay now: the customer scans PayPal's own pay page before the van leaves.", qr, 4200);
  clock.check("sent");

  // The guard refusing.
  const jobUrl = page.url();
  await bringIntoView(page.getByTestId("reminder-ask"));
  await caption(page, "Ask the reminder agent for a $25 late fee that isn't on the PayPal invoice.", { wait: false });
  await page.getByTestId("reminder-ask").pressSequentially("Add a $25 late fee", { delay: 30 });
  await page.getByTestId("ask-reminder").click();
  const refused = page.getByTestId("reminder-refused");
  await cut(expect(refused.first()).toBeVisible({ timeout: 60_000 }));
  await point(page, "The agent wrote it. Code refused it before any approval card: the customer only reads what PayPal says is owed.", refused.first(), 5000);
  const reminder = page.getByTestId("approval-prompt");
  await cut(expect(reminder).toBeVisible({ timeout: 60_000 }));
  await point(page, "The corrected reminder waits for your approval too.", reminder.getByTestId("approve-button"), 3000);
  await reminder.getByTestId("approve-button").click();
  await cut(expect(page.getByTestId("reminder-sent")).toBeVisible({ timeout: 30_000 }));
  clock.check("refused");

  // The customer pays on PayPal's own page.
  const job = await (await page.request.get(`/api/jobs/${new URL(jobUrl).pathname.split("/").pop()}`)).json();
  const payerUrl = job.invoice.payerUrl as string;
  const status = await (await page.request.get("/api/kit/status")).json();
  if (status.paypal.mode !== "sandbox") {
    // Mock PayPal has no customer page, so it plays the customer. Only the sandbox recording is the real demo.
    await page.request.post(`/api/dev/pay-invoice/${job.invoice.id}`);
    return finish(page, jobUrl);
  }
  await cut(
    (async () => {
      await page.goto(payerUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.getByText(appConfig.tradeName).first()).toBeVisible({ timeout: 45_000 });
      const cookies = page.getByRole("button", { name: /accept/i });
      if (await cookies.first().isVisible().catch(() => false)) await cookies.first().click();
      // PayPal's page is laid out for a bigger window: shrink it (not the caption) so the invoice, its lines and the pay buttons all fit the frame.
      await page.evaluate(() => {
        for (const el of Array.from(document.body.children) as HTMLElement[]) if (el.id !== "__demo_caption") el.style.zoom = "0.68";
      });
    })(),
  );
  await caption(page, `The customer's PayPal invoice, from ${appConfig.tradeName}. They pay as a guest with PayPal's test card.`, { ms: 3600 });
  const cardButtons = () => page.frames().find((f) => f.url().includes("smart/buttons") && f.url().includes("style.color=black"));
  // Back to full size for the click (PayPal's buttons don't take a click through the zoom), out of sight.
  await cut(
    async () => {
      await page.evaluate(() => {
        for (const el of Array.from(document.body.children) as HTMLElement[]) el.style.zoom = "";
      });
      await expect.poll(cardButtons, { timeout: 45_000 }).toBeTruthy();
      await page.waitForTimeout(4_000); // the buttons draw before their click handlers are ready
    },
    { lead: 0, tail: 0 },
  );
  const [checkout] = await Promise.all([context.waitForEvent("page", { timeout: 30_000 }), cardButtons()!.locator('[data-funding-source="card"]').first().click()]);
  timeline.popups.push({ openMs: at(), video: await checkout.video()!.path() });
  await cut(checkout.locator("#cardNumber").waitFor({ timeout: 30_000 })); // PayPal's window loading
  // Playwright fits a bigger window into the video size, so the finisher needs its size to cut the padding off.
  timeline.popups.at(-1)!.size = await checkout.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  await caption(checkout, "Test card 4111 1111 1111 1111, on PayPal's own checkout.", { wait: false });
  await checkout.locator("#cardNumber").pressSequentially("4111111111111111", { delay: 25 });
  await checkout.locator("#cardExpiry").pressSequentially("1230", { delay: 25 });
  await checkout.locator("#cardCvv").pressSequentially("123", { delay: 25 });
  await checkout.locator("#billingLine1").fill("1 Main St");
  await checkout.locator("#billingCity").fill("San Jose");
  await checkout.locator("#billingState").selectOption("CA");
  await checkout.locator("#billingPostalCode").fill("95131");
  // A different test phone number each take, in case the sandbox refuses a repeat guest.
  await checkout.locator("#phone").pressSequentially(`408555${String(Date.now() % 10_000).padStart(4, "0")}`, { delay: 15 });
  const createAccount = checkout.getByTestId("onboard-options-switch");
  if ((await createAccount.count()) && (await createAccount.isChecked())) await createAccount.evaluate((el: HTMLInputElement) => el.click());
  // PayPal has labelled this button both "Pay now as guest" and, with the switch off, "Pay Now".
  const pay = checkout.getByRole("button", { name: /^pay now( as guest)?$/i });
  await pay.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await pay.click();
  // PayPal closes its window once the card is taken; straight from there to the job, read back from PayPal.
  await cut(
    (async () => {
      await untilCheckoutCloses(checkout);
      timeline.popups.at(-1)!.closeMs = at();
      if (!checkout.isClosed()) throw new Error(`PayPal's checkout didn't finish: ${(await checkout.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
      await page.goto(jobUrl);
      await expect(page.getByTestId("result")).toBeVisible();
      const check = page.getByTestId("check-payment");
      if (!(await page.getByTestId("paid-banner").isVisible()) && (await check.count())) await check.click();
      await expect(page.getByTestId("paid-banner")).toBeVisible({ timeout: 60_000 });
    })(),
  );
  clock.check("paid on PayPal");
  await finish(page, jobUrl);

  async function finish(page: Page, jobUrl: string) {
    if (!page.url().endsWith(new URL(jobUrl).pathname)) await cut(page.goto(jobUrl).then(() => expect(page.getByTestId("result")).toBeVisible()));
    const banner = page.getByTestId("paid-banner");
    const check = page.getByTestId("check-payment");
    if (!(await banner.isVisible()) && (await check.count())) await check.click();
    await cut(expect(banner).toBeVisible({ timeout: 60_000 }));
    await point(page, "PAID, read back from PayPal, with PayPal's transaction id. On the hosted site the INVOICING.INVOICE.PAID webhook does this by itself.", banner, 5600);
    clock.check("paid");

    await cut(page.goto("/activity").then(() => expect(page.getByTestId("activity-row").first()).toBeVisible()));
    await point(page, "Activity: every request, approval and result, in plain words, on a hash-chained record.", page.getByTestId("activity-plain"), 5200);

    await titleCard(page, "Say-Voice", "Said in the van. Checked by code. Paid through PayPal.<br><span style='font-size:16px;opacity:.75'>PayPal Invoicing and Agent Toolkit · ElevenLabs Scribe v2 · Claude Sonnet 5.5 and Haiku 5.5</span>", 5500, { keep: true });
    clock.check("end");

    timeline.endMs = at();
    timeline.main = await page.video()!.path();
    await context.close();
    fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
    console.log(`[demo] timeline ${JSON.stringify(timeline)}`);
  }
});
