/**
 * DEMO VIDEO (npm run demo:record). Landscape 16:9, under 2:30. It opens on the phone with the
 * person saying the job, subtitled as it's said; then who it was for, why one wrong number matters,
 * the catch held in red, the approval, the Pay now QR, the Prices page with the PayPal call each
 * price came from, the guard refusing a figure (shown up close), the customer paying on PayPal's
 * page, Paid, Activity and the real jobs. Small chips name the PayPal calls behind each scene.
 *
 * It reads the modes from /api/kit/status and says on screen when a part isn't live, so a mock
 * screen is never captioned as the real thing. With DEMO_REQUIRE_LIVE=1 (the take for judges) it
 * fails instead: on a mode that isn't live, a computer voice, or any screen that says mock or
 * simulated (demo/live-guard.ts). DEMO_BASE_URL records against a running site, such as the hosted one.
 *
 * Playwright's video has no sound, so this writes test-results/demo/timeline.json (video files, when
 * the record button was pressed, and the waits to cut) for scripts/demo-finish.ts, which stitches
 * PayPal's checkout window in, cuts the waits and lays the voice under the record press.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiChips, bringIntoView, caption, fromInvoices, closePhoneStage, DemoClock, highlight, magnify, phoneStage, subtitles, titleCard } from "./captions";
import { assertLive, assertNoMockText, requireLive } from "./live-guard";
import { appConfig } from "../src/app.config";
import { untilCheckoutCloses } from "../tests/e2e/pay-as-guest";

/** 16:9. The finisher scales it to 1920x1080. */
export const VIEW = { width: 1280, height: 720 };
const VOICE_SECONDS = Number(process.env.DEMO_VOICE_SECONDS ?? 7);
/** The words in the clip, for the subtitles. demo-record.sh sets it with the clip. */
const VOICE_TEXT = process.env.DEMO_VOICE_TEXT ?? "Dryer would not heat. I was there three quarters of an hour at eighty an hour. New heating element, fifteen dollars.";
const PLACEHOLDER_VOICE = process.env.DEMO_VOICE_PLACEHOLDER === "1";
const OUT = path.resolve("test-results/demo");
/** What a viewer must be given time to read: the approval card. */
const HOLD_MS = 4_000;
/** The catch, held in red, and the Prices page with its PayPal call, each at least this long. */
const CATCH_MS = 5_000;
const PRICES_MS = 4_000;
/** The most of PayPal's contact and account form a viewer sits through. */
const CONTACT_FORM_MS = 3_000;
/** Recording against a running site (the hosted one), which PayPal's webhooks reach. */
const hosted = !!process.env.DEMO_BASE_URL;

const point = (page: Page, text: string, target: Locator, ms?: number) => Promise.all([caption(page, text, { ms }), highlight(page, target, Math.max(ms ?? 0, 3200))]);

test("demo", async ({ browser }) => {
  test.setTimeout(420_000);
  fs.mkdirSync(OUT, { recursive: true });
  // PayPal shows its card form in a checkout window only for a browser that names itself truthfully, so the whole recording uses the real user agent.
  const { userAgent } = await (await browser.newBrowserCDPSession()).send("Browser.getVersion");
  const context = await browser.newContext({
    baseURL: process.env.DEMO_BASE_URL ?? `http://localhost:${process.env.DEMO_PORT ?? 3930}`,
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
  const timeline = { main: "", popups: [] as { openMs: number; closeMs?: number; video: string; size?: { width: number; height: number } }[], cuts: [] as { fromMs: number; toMs: number }[], recordPressMs: 0, recordStopMs: 0, endMs: 0, holds: {} as Record<string, number> };
  /** A wait nobody needs to watch (a spinner, a page loading): cut from the video, keeping a beat of what it arrives at. */
  const cut = async <T,>(waiting: Promise<T> | (() => Promise<T>), beats = { lead: 0, tail: 300 }): Promise<T> => {
    const fromMs = at() + beats.lead;
    const result = await (typeof waiting === "function" ? waiting() : waiting);
    const toMs = at() - beats.tail;
    if (toMs - fromMs > 500) timeline.cuts.push({ fromMs, toMs });
    return result;
  };
  /** How long a scene stayed on screen, for the log and the timeline. */
  const held = async (label: string, scene: () => Promise<unknown>) => {
    const from = at();
    await scene();
    timeline.holds[label] = at() - from;
    console.log(`[demo] ${label} held ${((at() - from) / 1000).toFixed(1)}s`);
  };
  const clock = new DemoClock(200); // raw time, before the cuts
  /** The clock, and with DEMO_REQUIRE_LIVE=1 a look at every screen for mock or simulated. */
  const checkpoint = async (label: string) => {
    clock.check(label);
    await assertNoMockText(page, label);
  };
  const status = await (await page.request.get("/api/kit/status")).json();
  assertLive(status, PLACEHOLDER_VOICE);
  const liveAi = status.ai.mode === "live";
  const liveSpeech = status.speech.mode === "live";
  const sandbox = status.paypal.mode === "sandbox";
  console.log(`[demo] modes: AI ${status.ai.mode}, speech ${status.speech.mode}, PayPal ${status.paypal.mode}, voice ${PLACEHOLDER_VOICE ? "computer placeholder" : "recorded clip"}`);
  /** What isn't live in this take, said on screen instead of passed off as real. */
  const notLive = [!liveSpeech && "speech", !liveAi && "AI", !sandbox && "PayPal"].filter(Boolean).join(", ");

  // Open on the phone: the person presses record and says the job. The page loading is cut.
  const phone = await cut(async () => {
    await page.goto("/");
    const frame = await phoneStage(page, "/jobs");
    await expect(frame.getByTestId("contact-derek-evans")).toBeAttached({ timeout: 30_000 });
    await bringIntoView(frame.getByTestId("record-start"));
    return frame;
  }, { lead: 0, tail: 0 });
  const contact = phone.getByTestId("contact-derek-evans");
  await caption(page, "", { wait: false });
  await page.waitForTimeout(400);
  await phone.getByTestId("record-start").click();
  await phone.waitForFunction(() => "voiceStartedAt" in window);
  const startedAt = await phone.evaluate(() => (window as unknown as { voiceStartedAt: number }).voiceStartedAt);
  timeline.recordPressMs = startedAt - t0;
  await subtitles(page, VOICE_TEXT, { startedAt, seconds: VOICE_SECONDS, label: PLACEHOLDER_VOICE ? "Said in the van (computer voice standing in)" : "Said in the van" });
  console.log(`[demo] voice audio context: ${await phone.evaluate(() => (window as unknown as { voiceState: string }).voiceState)}; record pressed at ${(timeline.recordPressMs / 1000).toFixed(1)}s raw`);
  const level = phone.getByTestId("mic-level");
  await expect.poll(async () => Number(await level.getAttribute("data-peak")), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await page.waitForTimeout(Math.max(0, startedAt + VOICE_SECONDS * 1000 + 300 - Date.now()));
  await phone.getByTestId("record-stop").click();
  timeline.recordStopMs = at();
  await expect(phone.getByTestId("take-waiting")).toBeVisible();
  await point(page, liveSpeech ? "ElevenLabs Scribe v2 heard it. Then who it was for, from your contacts. Names never come from speech." : "Then who it was for, from your contacts. Names never come from speech.", contact, 2800);
  await contact.click();
  await checkpoint("said");

  // While the words are read: why one number matters.
  await titleCard(
    page,
    "One wrong number on an invoice can cost you the customer.",
    "<b>58%</b> of US residential contractors have little or no trust in the AI tools they use.<br><br>So here your own PayPal invoices check every price you say.<br><span style='font-size:15px;opacity:.7'>ServiceTitan 2026 State of AI in the Trades, via PHCP Pros (n&gt;1,000)</span>",
    5000,
  );
  await caption(page, liveAi ? "Claude Sonnet 5.5 turns the words into line items. Code does every sum." : `Line items from the words. Code does every sum. (Not live in this take: ${notLive}.)`, { wait: false });
  await cut(phone.waitForURL(/\/jobs\/job_/, { timeout: 90_000 }).then(() => expect(phone.getByTestId("invoice-line").first()).toBeVisible()));
  await checkpoint("heard");

  // The catch: held in red, with both answers, long enough to read, before the tap.
  const catchCard = phone.getByTestId("catch-card");
  await expect(catchCard).toHaveCount(1);
  await held("catch", () => point(page, `Said: $15. ${sandbox ? "Your PayPal invoices" : "The price book"} say $50, and "fifteen" sounds like "fifty". The send is held until you choose.`, catchCard, CATCH_MS + 800));
  const sendBar = phone.getByTestId("send-invoice");
  const before = await phone.getByTestId("invoice-total").innerText();
  await phone.getByTestId("catch-use-usual").click();
  await expect(phone.getByTestId("invoice-total")).not.toHaveText(before);
  // Live AI can add notes of its own. A person clears them, and so does this.
  for (const id of ["settle-flag", "keep-description", "keep-line"]) {
    const buttons = phone.getByTestId(id);
    while (await buttons.count()) await buttons.first().click();
  }
  await point(page, `One tap. Code works the total out again, in cents: ${before} became ${await phone.getByTestId("invoice-total").innerText()}.`, sendBar, 3400);
  await checkpoint("caught");

  // The approval: the Guard's card, held long enough to read.
  await sendBar.click();
  const prompt = phone.getByTestId("approval-prompt");
  await cut(expect(prompt).toBeVisible({ timeout: 30_000 }));
  await point(page, "The Guard holds it. Nothing reaches the customer until you approve this exact amount.", prompt, HOLD_MS);
  await prompt.getByTestId("approve-button").click();
  await cut(expect(phone.getByTestId("result")).toBeVisible({ timeout: 60_000 }).then(() => expect(phone.getByText("Approved", { exact: true })).toBeHidden({ timeout: 15_000 })));
  if (sandbox) await apiChips(page, ["Agent Toolkit", "create_invoice", "send_invoice"]);
  await point(page, sandbox ? "PayPal's Agent Toolkit created and sent it. Number and status are read back from PayPal." : "Created and sent. (PayPal isn't live in this take.)", phone.getByTestId("invoice-number"), 3400);
  await apiChips(page, []);
  const qr = phone.getByTestId("pay-qr");
  if (await qr.count()) await point(page, "Pay now: the customer scans PayPal's own pay page before the van leaves.", qr, 3600);
  const jobUrl = phone.url();
  await checkpoint("sent");
  await closePhoneStage(page);

  // Where the $50 came from: the Prices page, each price with the PayPal invoices and the call it was read with.
  await cut(async () => {
    await expect.poll(async () => ((await (await page.request.get("/api/prices")).json()) as { history: unknown }).history !== null, { timeout: 90_000, intervals: [1_000] }).toBe(true);
    await page.goto("/prices");
    await expect(page.getByTestId("learned-from-paypal")).toBeVisible();
  });
  const element = page.getByTestId("price-row").filter({ hasText: "Heating element" });
  await expect(element.getByTestId("price-source-chip")).toBeVisible();
  const from = fromInvoices(await element.innerText());
  if (sandbox) await apiChips(page, ["GET /v2/invoicing/invoices"]);
  await held("prices", () => point(page, sandbox ? `Where $50 came from: the trade's own PayPal invoices, read with GET /v2/invoicing/invoices. Heating element: ${from}.` : `Where $50 came from. Heating element: ${from}. (PayPal isn't live in this take.)`, element, PRICES_MS + 800));
  await apiChips(page, []);
  await checkpoint("prices");

  // The guard refusing, in one beat and up close: the ask and the agent's draft happen off camera.
  const refused = page.getByTestId("reminder-refused");
  await cut(async () => {
    await page.goto(jobUrl);
    await expect(page.getByTestId("result")).toBeVisible();
    // Live, the model leaves late fees out as told; asked for a discount it writes the $25 in, and code refuses it.
    await page.getByTestId("reminder-ask").fill("Add a $25 discount for paying early");
    await page.getByTestId("ask-reminder").click();
    await expect(refused.first()).toBeVisible({ timeout: 60_000 });
    // The corrected reminder's card lands above it; wait for it, so the close-up is of the refusal.
    await expect(page.getByTestId("approval-prompt")).toBeVisible({ timeout: 60_000 });
  });
  await held("refusal", async () => {
    await magnify(page, refused.first(), 1.7);
    await caption(page, "Asked for a $25 early-payment discount that isn't on the invoice, the reminder agent wrote it in. Code refused it before any approval card.", { ms: 5000 });
    await magnify(page, null);
  });
  // The corrected reminder is approved off camera, so the job is tidy when the customer pays.
  await cut(async () => {
    await page.getByTestId("approval-prompt").getByTestId("approve-button").click();
    await expect(page.getByTestId("reminder-sent")).toBeVisible({ timeout: 30_000 });
  }, { lead: 0, tail: 0 });
  await checkpoint("refused");

  // The customer pays on PayPal's own page.
  const job = await (await page.request.get(`/api/jobs/${new URL(jobUrl).pathname.split("/").pop()}`)).json();
  const payerUrl = job.invoice.payerUrl as string;
  if (!sandbox) {
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
  // PayPal's contact and account form is filled off camera: at most CONTACT_FORM_MS of it stays in the cut.
  const formFrom = at();
  const cutsBefore = timeline.cuts.length;
  // PayPal has labelled this button both "Pay now as guest" and, with the switch off, "Pay Now".
  const pay = checkout.getByRole("button", { name: /^pay now( as guest)?$/i });
  await cut(
    async () => {
      await checkout.locator("#billingLine1").fill("1 Main St");
      await checkout.locator("#billingCity").fill("San Jose");
      await checkout.locator("#billingState").selectOption("CA");
      await checkout.locator("#billingPostalCode").fill("95131");
      // A different test phone number each take, in case the sandbox refuses a repeat guest.
      await checkout.locator("#phone").fill(`408555${String(Date.now() % 10_000).padStart(4, "0")}`);
      const createAccount = checkout.getByTestId("onboard-options-switch");
      if ((await createAccount.count()) && (await createAccount.isChecked())) await createAccount.evaluate((el: HTMLInputElement) => el.click());
      await pay.scrollIntoViewIfNeeded();
    },
    { lead: 0, tail: 0 },
  );
  await page.waitForTimeout(400);
  await pay.click();
  const formShownMs = at() - formFrom - timeline.cuts.slice(cutsBefore).reduce((sum, c) => sum + (c.toMs - c.fromMs), 0);
  console.log(`[demo] PayPal's contact form on screen ${(formShownMs / 1000).toFixed(1)}s`);
  if (formShownMs > CONTACT_FORM_MS) throw new Error(`PayPal's contact form stayed on screen ${formShownMs} ms, over ${CONTACT_FORM_MS} ms.`);
  // PayPal closes its window once the card is taken; straight from there to the job, still Sent until PayPal says it's paid.
  await cut(
    (async () => {
      await untilCheckoutCloses(checkout);
      timeline.popups.at(-1)!.closeMs = at();
      if (!checkout.isClosed()) throw new Error(`PayPal's checkout didn't finish: ${(await checkout.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
      await page.goto(jobUrl);
      await expect(page.getByTestId("result")).toBeVisible();
    })(),
    { lead: 0, tail: 0 }, // no beat of PayPal's page behind the closing window
  );
  await checkpoint("paid on PayPal");
  await finish(page, jobUrl);

  async function finish(page: Page, jobUrl: string) {
    if (!page.url().endsWith(new URL(jobUrl).pathname)) await cut(page.goto(jobUrl).then(() => expect(page.getByTestId("result")).toBeVisible()));
    const banner = page.getByTestId("paid-banner");
    const status = page.getByTestId("invoice-status");
    const check = page.getByTestId("check-payment");
    // The payoff: the job turning Paid on camera, not behind a cut.
    if (await banner.isVisible()) console.log("[demo] the job was already Paid when its page loaded, so the turn to Paid is not on camera");
    else {
      await point(page, sandbox ? "Back in the app, the job still says Sent: it turns Paid only when PayPal says so." : "Back in the app, the job still says Sent.", status, 2400);
      if (hosted) {
        // The hosted site hears PayPal's webhook; the job page re-reads every few seconds.
        await cut(expect(banner).toBeVisible({ timeout: 60_000 }).catch(async (e: Error) => {
          if (requireLive()) throw new Error(`DEMO_REQUIRE_LIVE=1, but PayPal's INVOICING.INVOICE.PAID webhook didn't reach the hosted job in 60 s: ${e.message}`);
          await check.evaluate((el: HTMLElement) => el.click());
          await expect(banner).toBeVisible({ timeout: 30_000 });
        }), { lead: 0, tail: 600 });
      } else {
        // A local copy can't hear PayPal's webhook, so it asks PayPal on camera (mock PayPal may have flipped it already).
        // Clicked in place: a scroll down to the button would take the status out of frame as it turns Paid.
        await check.evaluate((el: HTMLElement) => el.click(), undefined, { timeout: 5_000 }).catch(() => undefined);
        await cut(expect(banner).toBeVisible({ timeout: 60_000 }), { lead: 300, tail: 600 });
      }
    }
    await expect(status).toContainText(/paid/i);
    const viaWebhook = !!(await page.getByTestId("paid-source").getAttribute("title"))?.startsWith("PayPal event");
    if (sandbox && hosted && requireLive() && !viaWebhook) throw new Error("DEMO_REQUIRE_LIVE=1, but the hosted job turned Paid without PayPal's INVOICING.INVOICE.PAID webhook.");
    console.log(`[demo] paid ${viaWebhook ? "via the INVOICING.INVOICE.PAID webhook" : "read back with GET /v2/invoicing/invoices"}`);
    if (sandbox) await apiChips(page, [viaWebhook ? "webhook INVOICING.INVOICE.PAID" : `GET /v2/invoicing/invoices/${job?.invoice?.id ?? "{id}"}`]);
    await point(
      page,
      !sandbox ? "Paid. (PayPal isn't live in this take.)" : viaWebhook ? "PAID: PayPal's INVOICING.INVOICE.PAID webhook told the app, a fresh read agrees, with PayPal's transaction id." : "PAID, read back from PayPal, with PayPal's transaction id. On the hosted site PayPal's INVOICING.INVOICE.PAID webhook does this by itself.",
      banner,
      4600,
    );
    await apiChips(page, []);
    await checkpoint("paid");

    await cut(page.goto("/activity").then(() => expect(page.getByTestId("activity-job").first()).toBeVisible()));
    await point(page, "Activity, job by job: amount, PayPal status, and every request, approval and result in plain words.", page.getByTestId("activity-job").first(), 4000);

    await cut(page.goto("/#real-jobs").then(() => expect(page.getByTestId("real-jobs")).toBeVisible()));
    await point(page, "Real jobs: a roofer's $600 and an appliance tech's $472.03, every line right first time.", page.getByTestId("real-jobs"), 4400);

    await titleCard(page, "Say-Voice", `Said in the van. Checked against your PayPal invoices. Paid through PayPal.<br><span style='font-size:16px;opacity:.75'>PayPal Invoicing and Agent Toolkit${liveSpeech ? " · ElevenLabs Scribe v2" : ""}${liveAi ? " · Claude Sonnet 5.5 and Haiku 5.5" : ""}</span>`, 4500, { keep: true });
    await checkpoint("end");

    timeline.endMs = at();
    timeline.main = await page.video()!.path();
    await context.close();
    fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
    console.log(`[demo] timeline ${JSON.stringify(timeline)}`);
  }
});
