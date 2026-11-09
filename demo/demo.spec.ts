/**
 * DEMO VIDEO (npm run demo:record). Landscape 16:9, under 2:30: one card on who it's for, the price
 * book learned from the trade's own PayPal invoices, then on a phone zoomed to half as big again
 * (record to approval) a person saying a job first and picking the customer after, the catch held
 * in red before 0:35, the approval and the Pay now QR; then one beat of the guard refusing a
 * figure, the customer paying on PayPal's page, Paid, Activity by job and the real jobs. Small
 * chips name the PayPal calls behind each scene. Captions name the models only when they're live.
 *
 * Playwright's video has no sound, so this writes test-results/demo/timeline.json (video files, when
 * the record button was pressed, and the waits to cut) for scripts/demo-finish.ts, which stitches
 * PayPal's checkout window in, cuts the waits and lays the voice under the record press.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiChips, bringIntoView, caption, closePhoneStage, DemoClock, highlight, phoneStage, titleCard } from "./captions";
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
  const status = await (await page.request.get("/api/kit/status")).json();
  const liveAi = status.ai.mode === "live";
  const liveSpeech = status.speech.mode === "live";

  // Open: billing accuracy. A wrong number costs the customer, and the trades don't trust AI with numbers.
  await cut(page.goto("/").then(() => expect(page.getByTestId("hero-lead")).toBeVisible()));
  await titleCard(
    page,
    "One wrong number on an invoice can cost you the customer.",
    "<b>58%</b> of US residential contractors have little or no trust in the AI tools they use.<br><br>So here the AI only listens. Code does every sum, and your own PayPal invoices check every price.<br><span style='font-size:15px;opacity:.7'>ServiceTitan 2026 State of AI in the Trades, via PHCP Pros (n&gt;1,000)</span>",
    5000,
  );
  await point(page, "Fifty heard as fifteen? A price book learned from your own PayPal invoices catches it.", page.getByRole("heading", { level: 1 }), 3600);
  clock.check("open");

  // The price book, already filled from the trade's own PayPal invoices.
  await cut(async () => {
    await expect.poll(async () => ((await (await page.request.get("/api/prices")).json()) as { history: unknown }).history !== null, { timeout: 90_000, intervals: [1_000] }).toBe(true);
    await page.goto("/prices");
    await expect(page.getByTestId("learned-from-paypal")).toBeVisible();
  });
  const element0 = page.getByTestId("price-row").filter({ hasText: "Heating element" });
  const from = /from \d+ PayPal invoices?, last \$[\d,.]+/.exec(await element0.innerText())?.[0] ?? "from your PayPal invoices";
  await apiChips(page, ["GET /v2/invoicing/invoices"]);
  await point(page, `The price book reads the trade's past PayPal invoices. Heating element: ${from}.`, element0, HOLD_MS + 600);
  await apiChips(page, []);
  clock.check("price book");

  // On the phone: the record button comes first, so a person says the job, then picks who it was for.
  const phone = await phoneStage(page, "/jobs");
  const contact = phone.getByTestId("contact-derek-evans");
  await cut(expect(contact).toBeAttached({ timeout: 30_000 }));
  await bringIntoView(phone.getByTestId("record-start"));
  await caption(page, liveSpeech ? "On the phone, in the van. Press record and say the job. ElevenLabs Scribe v2 is listening." : "On the phone, in the van. Press record and say the job.", { wait: false });
  await phone.getByTestId("record-start").click();
  await phone.waitForFunction(() => "voiceStartedAt" in window);
  timeline.recordPressMs = (await phone.evaluate(() => (window as unknown as { voiceStartedAt: number }).voiceStartedAt)) - t0;
  console.log(`[demo] voice audio context: ${await phone.evaluate(() => (window as unknown as { voiceState: string }).voiceState)}`);
  const level = phone.getByTestId("mic-level");
  await expect.poll(async () => Number(await level.getAttribute("data-peak")), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await highlight(page, level, VOICE_SECONDS * 1000);
  await page.waitForTimeout(Math.max(0, VOICE_SECONDS * 1000 + 600 - 900));
  await phone.getByTestId("record-stop").click();
  timeline.recordStopMs = at();
  await expect(phone.getByTestId("take-waiting")).toBeVisible();
  await point(page, "Then who it was for, from your contacts. Names never come from speech.", contact, 2600);
  await contact.click();
  await caption(page, liveAi ? "Claude Sonnet 5.5 turns the words into line items. Code does every sum." : "The AI turns the words into line items. Code does every sum.", { wait: false });
  await page.waitForTimeout(2_000);
  await cut(phone.waitForURL(/\/jobs\/job_/, { timeout: 90_000 }).then(() => expect(phone.getByTestId("invoice-line").first()).toBeVisible()));
  clock.check("heard");

  // The catch: held in red, with both answers, long enough to read, before the tap.
  const catchCard = phone.getByTestId("catch-card");
  await expect(catchCard).toHaveCount(1);
  await point(page, "Said: $15. Your PayPal invoices say $50, and \"fifteen\" sounds like \"fifty\". The send is held until you choose.", catchCard, HOLD_MS + 1600);
  const sendBar = phone.getByTestId("send-invoice");
  const before = await phone.getByTestId("invoice-total").innerText();
  await phone.getByTestId("catch-use-usual").click();
  await expect(phone.getByTestId("invoice-total")).not.toHaveText(before);
  // Live AI can add notes of its own. A person clears them, and so does this.
  for (const id of ["settle-flag", "keep-description", "keep-line"]) {
    const buttons = phone.getByTestId(id);
    while (await buttons.count()) await buttons.first().click();
  }
  await point(page, `One tap. Code works the total out again, in cents: ${before} became ${await phone.getByTestId("invoice-total").innerText()}.`, sendBar, 3600);
  clock.check("caught");

  // The approval: the Guard's card, held long enough to read.
  await sendBar.click();
  const prompt = phone.getByTestId("approval-prompt");
  await cut(expect(prompt).toBeVisible({ timeout: 30_000 }));
  await point(page, "The Guard holds it. Nothing reaches the customer until you approve this exact amount.", prompt, HOLD_MS);
  await prompt.getByTestId("approve-button").click();
  await cut(expect(phone.getByTestId("result")).toBeVisible({ timeout: 60_000 }).then(() => expect(phone.getByText("Approved", { exact: true })).toBeHidden({ timeout: 15_000 })));
  await apiChips(page, ["Agent Toolkit", "create_invoice", "send_invoice"]);
  await point(page, "PayPal's Agent Toolkit created and sent it. Number and status are read back from PayPal.", phone.getByTestId("invoice-number"), 3400);
  await apiChips(page, []);
  const qr = phone.getByTestId("pay-qr");
  if (await qr.count()) await point(page, "Pay now: the customer scans PayPal's own pay page before the van leaves.", qr, 4000);
  const jobUrl = phone.url();
  clock.check("sent");
  await closePhoneStage(page);
  await cut(page.goto(jobUrl).then(() => expect(page.getByTestId("result")).toBeVisible()));

  // The guard refusing, in one beat: the ask and the agent's draft happen off camera.
  const refused = page.getByTestId("reminder-refused");
  await cut(async () => {
    await page.getByTestId("reminder-ask").fill("Add a $25 late fee");
    await page.getByTestId("ask-reminder").click();
    await expect(refused.first()).toBeVisible({ timeout: 60_000 });
    // The corrected reminder's card lands above it; wait for it, so the outline stays on the refusal.
    await expect(page.getByTestId("approval-prompt")).toBeVisible({ timeout: 60_000 });
  });
  const detourFrom = at();
  await point(page, "Asked for a $25 late fee that isn't on the invoice, the reminder agent wrote it in. Code refused it before any approval card.", refused.first(), 5000);
  console.log(`[demo] reminder detour ${((at() - detourFrom) / 1000).toFixed(1)}s`);
  // The corrected reminder is approved off camera, so the job is tidy when the customer pays.
  await cut(async () => {
    await page.getByTestId("approval-prompt").getByTestId("approve-button").click();
    await expect(page.getByTestId("reminder-sent")).toBeVisible({ timeout: 30_000 });
  }, { lead: 0, tail: 0 });
  clock.check("refused");

  // The customer pays on PayPal's own page.
  const job = await (await page.request.get(`/api/jobs/${new URL(jobUrl).pathname.split("/").pop()}`)).json();
  const payerUrl = job.invoice.payerUrl as string;
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
  // Typed at a pace a viewer can follow: about 3.5 s of the test card going in.
  await checkout.locator("#cardNumber").pressSequentially("4111111111111111", { delay: 140 });
  await checkout.locator("#cardExpiry").pressSequentially("1230", { delay: 140 });
  await checkout.locator("#cardCvv").pressSequentially("123", { delay: 140 });
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
    await apiChips(page, ["webhook INVOICING.INVOICE.PAID"]);
    await point(page, "PAID, read back from PayPal, with PayPal's transaction id. On the hosted site PayPal's webhook does this by itself.", banner, 5600);
    await apiChips(page, []);
    clock.check("paid");

    await cut(page.goto("/activity").then(() => expect(page.getByTestId("activity-job").first()).toBeVisible()));
    await point(page, "Activity, job by job: amount, PayPal status, and every request, approval and result in plain words.", page.getByTestId("activity-job").first(), 4600);

    await cut(page.goto("/#real-jobs").then(() => expect(page.getByTestId("real-jobs")).toBeVisible()));
    await point(page, "Real jobs: a roofer's $600 and an appliance tech's $472.03, every line right first time.", page.getByTestId("real-jobs"), 4400);

    await titleCard(page, "Say-Voice", `Said in the van. Checked by code. Paid through PayPal.<br><span style='font-size:16px;opacity:.75'>PayPal Invoicing and Agent Toolkit${liveSpeech ? " · ElevenLabs Scribe v2" : ""}${liveAi ? " · Claude Sonnet 5.5 and Haiku 5.5" : ""}</span>`, 5500, { keep: true });
    clock.check("end");

    timeline.endMs = at();
    timeline.main = await page.video()!.path();
    await context.close();
    fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
    console.log(`[demo] timeline ${JSON.stringify(timeline)}`);
  }
});
