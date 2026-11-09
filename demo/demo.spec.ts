/**
 * DEMO VIDEO (npm run demo:record). Landscape 16:9, under 1:45. It opens on the problem in one card
 * (fifteen said, fifty usual: misheard or misspoken, the trade decides), then the phone: the person saying the job, subtitled as
 * it's said; who it was for; the catch held in red at about 0:15; the list of PayPal invoices the usual price came from, on
 * screen while it's said; the Guard's approval card, held; PayPal's own QR code; what the customer sees on PayPal, read back
 * from PayPal; the reminder agent's note refused by code, in one readable beat; the customer paying on PayPal's page; Paid;
 * Activity; day one, with no PayPal history; and who it's for, with the URL. Every narrated beat stays at least 4 s on screen.
 * Small chips name the PayPal calls behind each scene.
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
import { apiChips, bringIntoView, caption, closePhoneStage, DemoClock, highlight, phoneStage, subtitles, titleCard } from "./captions";
import { assertLive, assertNoMockText, requireLive } from "./live-guard";
import { amountIn, fit, spoken, toEdited } from "./voiceover";
import { appConfig } from "../src/app.config";
import { untilCheckoutCloses } from "../tests/e2e/pay-as-guest";
import { cutBefore } from "../scripts/demo-finish";

/** 16:9. The finisher scales it to 1920x1080. */
export const VIEW = { width: 1280, height: 720 };
const VOICE_SECONDS = Number(process.env.DEMO_VOICE_SECONDS ?? 7);
/** The words in the clip, for the subtitles. demo-record.sh sets it with the clip. */
const VOICE_TEXT = process.env.DEMO_VOICE_TEXT ?? "Dryer would not heat. I was there three quarters of an hour at eighty an hour. New heating element, fifteen dollars.";
const PLACEHOLDER_VOICE = process.env.DEMO_VOICE_PLACEHOLDER === "1";
const OUT = path.resolve("test-results/demo");
/** What a viewer must be given time to read: the approval card (at least 3 s). */
const HOLD_MS = 4_000;
/** The catch, held in red, and the list of PayPal invoices its usual price came from (at least 4 s). */
const CATCH_MS = 5_000;
const RECEIPTS_MS = 4_600;
/** The refusal: one readable beat, no longer than 5 s. */
const REFUSAL_MS = 4_800;
/** Every narrated beat stays on screen at least this long. */
const BEAT_MS = 4_000;
/** What the customer sees on PayPal, read back from PayPal. */
const PAYER_VIEW_MS = 4_200;
/** Day one: no PayPal history, and the sound-alike check still asks. */
const DAY_ONE_MS = 5_000;
/** The opening card: the problem, said before anything else. */
const OPENING_MS = 4_300;
/** Where a viewer can try it. */
const SITE = "say-voice.onrender.com";
/** The line the trade's PayPal invoices usually have with this item, held this long before the tap. */
const NUDGE_MS = 4_500;
/** The spoken job plays first: no narration before this, in seconds of the edited video. */
const QUIET_SEC = 9;
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
  /** V.md's voiceover, one line per shot, at raw time; written as videos/voiceover.json in edited seconds at the end. */
  const narration: { shot: number; rawMs: number; text: string }[] = [];
  const narrate = (shot: number, text: string) => narration.push({ shot, rawMs: at(), text });
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

  // Open on the problem, in the first 4 s: one card, said aloud. The page loading under it is cut.
  await cut(page.goto("/"), { lead: 0, tail: 0 });
  narrate(1, "Said fifteen. Usually fifty. Misheard or misspoken, you decide.");
  await titleCard(page, "Said fifteen. Usually fifty.", "Misheard or misspoken, one wrong number on an invoice costs you the customer.<br>So every price you say is checked against your own PayPal invoices, and you decide.", OPENING_MS);
  const openingSec = at() / 1000;

  // Then the phone: the person presses record and says the job.
  const phone = await cut(async () => {
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
  narrate(2, "The customer comes from contacts, never from speech.");
  await point(page, liveSpeech ? "ElevenLabs Scribe v2 heard it. Then who it was for, from your contacts. Names never come from speech." : "Then who it was for, from your contacts. Names never come from speech.", contact, BEAT_MS);
  await contact.click();
  await checkpoint("said");
  await caption(page, liveAi ? "Claude Sonnet 5.5 turns the words into line items. Code does every sum." : `Line items from the words. Code does every sum. (Not live in this take: ${notLive}.)`, { wait: false });
  await cut(phone.waitForURL(/\/jobs\/job_/, { timeout: 90_000 }).then(() => expect(phone.getByTestId("invoice-line").first()).toBeVisible()));
  await checkpoint("heard");

  // The catch: held in red, with both answers, long enough to read, before the tap.
  const catchCard = phone.getByTestId("catch-card");
  await expect(catchCard).toHaveCount(1);
  // The amounts as the screen has them: the usual price from PayPal, and what was heard.
  const usual = spoken(amountIn(await phone.getByTestId("catch-use-usual").innerText()) ?? "");
  const heard = spoken(amountIn(await phone.getByTestId("catch-keep").innerText()) ?? "");
  narrate(3, `The catch: you said ${heard}, your PayPal invoices say ${usual}. The send is held.`);
  await held("catch", () => point(page, `Said: ${heard}. ${sandbox ? "Your PayPal invoices" : "The price book"} say ${usual}. Misheard or misspoken, the send is held until you choose.`, catchCard, CATCH_MS + 800));

  // Where the usual price comes from: "from 9 PayPal invoices" is a tap that lists them, each one PayPal's.
  const receiptsOpen = catchCard.getByTestId("receipts-open");
  if (await receiptsOpen.count()) {
    await receiptsOpen.click();
    const receipts = catchCard.getByTestId("receipts");
    await cut(expect(receipts.getByTestId("receipt").first()).toBeVisible({ timeout: 30_000 }), { lead: 0, tail: 200 });
    const rows = await receipts.getByTestId("receipt").count();
    const ids = await receipts.getByTestId("receipt").evaluateAll((els) => els.map((el) => el.getAttribute("data-invoice-id")));
    console.log(`[demo] receipts: ${rows} PayPal invoices behind ${usual}: ${ids.join(", ")}`);
    // The list itself in the phone's view, every row, while it's said: not the buttons under it.
    await bringIntoView(receipts);
    await expect(receipts.getByTestId("receipt").last()).toBeInViewport();
    if (sandbox) await apiChips(page, ["GET /v2/invoicing/invoices"]);
    narrate(4, `Where ${usual} comes from: ${rows} of the trade's own PayPal invoices.`);
    await held("receipts", () => point(page, sandbox ? `Where ${usual} comes from: ${rows} of the trade's own PayPal invoices, read with GET /v2/invoicing/invoices. Each one opens on PayPal.` : `Where ${usual} comes from: ${rows} past invoices. (PayPal isn't live in this take.)`, receipts, RECEIPTS_MS));
    await apiChips(page, []);
    await receiptsOpen.click();
    await checkpoint("receipts");
  } else console.log("[demo] no receipts tap on the catch, so that beat is skipped");
  const sendBar = phone.getByTestId("send-invoice");
  const before = await phone.getByTestId("invoice-total").innerText();
  await phone.getByTestId("catch-use-usual").click();
  await expect(phone.getByTestId("invoice-total")).not.toHaveText(before);
  // Live AI can add notes of its own. A person clears them, and so does this.
  for (const id of ["settle-flag", "keep-description", "keep-line"]) {
    const buttons = phone.getByTestId(id);
    while (await buttons.count()) await buttons.first().click();
  }
  narrate(5, "One tap. Code redoes the total in cents.");
  await point(page, `One tap. Code works the total out again, in cents: ${before} became ${await phone.getByTestId("invoice-total").innerText()}.`, sendBar, BEAT_MS);
  await checkpoint("caught");

  // The line the trade's own PayPal invoices usually have with this item, that nobody said. One tap adds it.
  const nudge = phone.getByTestId("usually-with");
  if (await nudge.count()) {
    const said = await nudge.first().getByTestId("usually-with-text").innerText();
    const usually = /^Usually with an? (.+?): (.+?) (?:[\d.]+ × )?(\$[\d,]+\.\d\d), on (\d+) of your (\d+) PayPal invoices/.exec(said);
    console.log(`[demo] usually with: ${said}`);
    await bringIntoView(nudge.first());
    const item = usually ? `${/^[aeiou]/i.test(usually[2]) ? "an" : "a"} ${usually[2].toLowerCase()}` : "";
    if (usually) narrate(6, `Your PayPal invoices usually add ${item} here, ${usually[4]} times in ${usually[5]}. One tap adds it.`);
    await held("usually-with", () =>
      point(page, usually ? `Your own PayPal invoices: ${item} on ${usually[4]} of ${usually[5]} with ${/^[aeiou]/i.test(usually[1]) ? "an" : "a"} ${usually[1]}. Nobody said one.` : said, nudge.first(), NUDGE_MS),
    );
    const total = await phone.getByTestId("invoice-total").innerText();
    await nudge.first().getByTestId("add-usual").click();
    await expect(phone.getByTestId("invoice-total")).not.toHaveText(total);
    await point(page, `Added at the usual ${usually?.[3] ?? "price"}. Code adds it up: ${total} became ${await phone.getByTestId("invoice-total").innerText()}.`, phone.getByTestId("invoice-total"), 2600);
    await checkpoint("usually with");
  } else console.log("[demo] no usually-with line on this job, so that beat is skipped");

  // The approval: the Guard's card, held long enough to read.
  await sendBar.click();
  const prompt = phone.getByTestId("approval-prompt");
  await cut(expect(prompt).toBeVisible({ timeout: 30_000 }));
  narrate(7, "The Guard holds it until you approve this exact amount.");
  await held("approval", () => point(page, "The Guard holds it. Nothing reaches the customer until you approve this exact amount.", prompt, HOLD_MS));
  await prompt.getByTestId("approve-button").click();
  await cut(expect(phone.getByTestId("result")).toBeVisible({ timeout: 60_000 }).then(() => expect(phone.getByText("Approved", { exact: true })).toBeHidden({ timeout: 15_000 })));
  const sentJob = (await (await page.request.get(`/api/jobs/${new URL(phone.url()).pathname.split("/").pop()}`)).json()) as { invoice: { id: string; number: string; status: string; totalCents: number }; lines: unknown[] };
  // For the main session to re-read from PayPal.
  console.log(`[demo] sent invoice ${sentJob.invoice.id} number ${sentJob.invoice.number} ${sentJob.invoice.status} $${(sentJob.invoice.totalCents / 100).toFixed(2)}, ${sentJob.lines.length} lines (PayPal ${status.paypal.mode})`);
  narrate(8, sandbox ? "PayPal's Agent Toolkit created and sent it." : "Created and sent.");
  if (sandbox) await apiChips(page, ["Agent Toolkit", "create_invoice", "send_invoice"]);
  await point(page, sandbox ? "PayPal's Agent Toolkit created and sent it. Number and status are read back from PayPal." : "Created and sent. (PayPal isn't live in this take.)", phone.getByTestId("invoice-number"), BEAT_MS);
  await apiChips(page, []);

  // PayPal's own QR code for the invoice, from generate-qr-code. If PayPal didn't give one, the screen says so and so does this.
  const qr = phone.getByTestId("pay-qr");
  if (await qr.count()) {
    const fromPayPal = (await qr.getAttribute("data-source")) === "paypal";
    console.log(`[demo] QR for ${sentJob.invoice.id}: ${fromPayPal ? "PayPal's own, from generate-qr-code" : `drawn here: ${await phone.getByTestId("pay-qr-source").innerText()}`}`);
    narrate(9, fromPayPal ? "PayPal made the QR code. The customer scans and pays." : "The customer scans the QR code and pays.");
    if (sandbox && fromPayPal) await apiChips(page, ["POST /v2/invoicing/invoices/{id}/generate-qr-code"]);
    await held("qr", () => point(page, fromPayPal ? "Pay now: PayPal's own QR code for this invoice, from generate-qr-code. The customer scans it before the van leaves." : "Pay now: a QR code drawn here from PayPal's link. PayPal's own QR code didn't come back this time.", qr, BEAT_MS));
    await apiChips(page, []);
  }
  // What the customer sees on PayPal: the trade name, the note, each line described, tax and total, read back from PayPal.
  const payerView = phone.getByTestId("payer-view");
  if (await payerView.count()) {
    await bringIntoView(payerView);
    narrate(10, "What the customer sees on PayPal: name, note, every line.");
    if (sandbox) await apiChips(page, ["GET /v2/invoicing/invoices/{id}"]);
    await held("payer-view", () => point(page, sandbox ? "What the customer sees on PayPal, read back from PayPal: the trade's name, the note, every line with its description, the tax and the total." : "What the customer sees, as the app reads it back. (PayPal isn't live in this take.)", payerView, PAYER_VIEW_MS));
    await apiChips(page, []);
  } else console.log("[demo] no payer view on the result, so that beat is skipped");
  const jobUrl = phone.url();
  await checkpoint("sent");

  // The guard refusing, in two slow beats on the phone: the ask and the agent's draft happen off camera.
  const refused = phone.getByTestId("reminder-refused");
  await cut(async () => {
    // Live, the model leaves late fees out as told; asked for a discount it writes the $25 in, and code refuses it.
    await phone.getByTestId("reminder-ask").fill("Add a $25 discount for paying early");
    await phone.getByTestId("ask-reminder").click();
    await expect(refused.first()).toBeVisible({ timeout: 60_000 });
    // The corrected reminder's card lands above it; wait for it, so the beats are of the refusal.
    await expect(phone.getByTestId("approval-prompt")).toBeVisible({ timeout: 60_000 });
  });
  const reason = (await refused.first().getByTestId("reminder-refused-reason").innerText()).trim();
  console.log(`[demo] refused: ${reason}`);
  narrate(11, "The reminder agent wrote in a $25 discount. Code refused it.");
  await bringIntoView(refused.first());
  await held("refusal", () => point(page, `Refused: ${reason}`, refused.first().getByTestId("reminder-refused-reason"), REFUSAL_MS));
  // The corrected reminder is approved off camera, so the job is tidy when the customer pays.
  await cut(async () => {
    await phone.getByTestId("approval-prompt").getByTestId("approve-button").click();
    await expect(phone.getByTestId("reminder-sent")).toBeVisible({ timeout: 30_000 });
  }, { lead: 0, tail: 0 });
  await checkpoint("refused");
  await closePhoneStage(page);

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
  narrate(12, "The customer pays on PayPal's own page, as a guest with the test card.");
  await caption(page, `The customer's PayPal invoice, from ${appConfig.tradeName}. They pay as a guest with PayPal's test card.`, { ms: BEAT_MS });
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
    narrate(13, !sandbox ? "Paid." : viaWebhook ? "Paid. PayPal's webhook marked it, with PayPal's transaction id." : "Paid, read back from PayPal, with its transaction id.");
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
    narrate(14, "Activity shows every request and approval, job by job.");
    await point(page, "Activity, job by job: amount, PayPal status, and every request, approval and result in plain words.", page.getByTestId("activity-job").first(), BEAT_MS);

    // Day one: a trade with no PayPal history yet. The sound-alike check still asks.
    const dayOne = await cut(async () => {
      const frame = await phoneStage(page, "/jobs?try=day-one");
      await frame.waitForURL(/\/jobs\/job_/, { timeout: 60_000 });
      await expect(frame.getByTestId("day-one")).toBeVisible({ timeout: 30_000 });
      return frame;
    }, { lead: 0, tail: 300 });
    const dayOneCatch = dayOne.getByTestId("catch-card").first();
    await bringIntoView(dayOneCatch);
    const dayOneAsks = (await dayOneCatch.locator("p").first().innerText()).replace(/^Line \d+, /, "");
    console.log(`[demo] day one: ${dayOneAsks}`);
    narrate(15, "Day one, no PayPal history: a sound-alike price still gets asked.");
    await held("day-one", () => point(page, `Day one, no PayPal history yet: ${dayOneAsks}`, dayOneCatch, DAY_ONE_MS));
    await checkpoint("day one");
    await closePhoneStage(page);

    // Who it's for, and where to try it.
    const who = appConfig.landing.who;
    narrate(16, `Say-Voice, for one-person trades. Try it at ${SITE.replace(/\./g, " dot ")}.`);
    await titleCard(
      page,
      "Say-Voice",
      `For one-person trades who bill from the van: ${who.figure} ${who.body}<br><b style='font-size:30px'>${SITE}</b><br><span style='font-size:15px;opacity:.7'>${who.source.label} · PayPal Invoicing and Agent Toolkit${liveSpeech ? " · ElevenLabs Scribe v2" : ""}${liveAi ? " · Claude Sonnet 5.5 and Haiku 5.5" : ""}</span>`,
      6000,
      { keep: true },
    );
    await checkpoint("end");

    timeline.endMs = at();
    timeline.main = await page.video()!.path();
    await context.close();
    fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
    // The narration, in seconds of the edited video, next to the take. Nothing while the job is spoken.
    const voiceEnd = (timeline.recordStopMs - cutBefore(timeline.recordStopMs, timeline.cuts)) / 1000;
    const opening = (openingSec * 1000 - cutBefore(openingSec * 1000, timeline.cuts)) / 1000;
    const voiceover = toEdited(narration, timeline.cuts, Math.max(QUIET_SEC, voiceEnd + 0.5), opening);
    fs.mkdirSync("videos", { recursive: true });
    fs.writeFileSync("videos/voiceover.json", JSON.stringify(voiceover, null, 2));
    const endSec = (timeline.endMs - cutBefore(timeline.endMs, timeline.cuts)) / 1000;
    for (const [i, f] of fit(voiceover, endSec).entries()) console.log(`[demo] voiceover ${String(f.shot).padStart(2)} @${voiceover[i].at.toFixed(1)}s needs ${f.need}s of ${f.room}s${f.fits ? "" : "  TOO LONG, trim the line"}  ${voiceover[i].text}`);
    console.log(`[demo] timeline ${JSON.stringify(timeline)}`);
    console.log(`[demo] edited length ${endSec.toFixed(1)}s (PayPal's checkout window adds nothing: it plays in place of the page behind it)`);
    if (endSec >= 105) throw new Error(`The edited demo is ${endSec.toFixed(1)}s, over 1:45.`);
  }
});
