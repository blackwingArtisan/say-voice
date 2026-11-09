/**
 * Helpers for silent, captioned demo videos. Everything is injected into the page with
 * page.evaluate, so it works on any page without app support.
 *
 *   await titleCard(page, "Settle partial shipments with PayPal", "An AI agent with a human in the loop");
 *   await caption(page, "The buyer approves a $120 hold with PayPal");
 *   await highlight(page, page.getByTestId("run-agent"));
 */
import type { Frame, Locator, Page } from "@playwright/test";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Height of the caption band. The page gets that much room at the bottom, so a caption never covers what it names. */
export const BAND_PX = 132;

/** "from 9 PayPal invoices, last $50.00" out of a price row's text, without the comma or full stop that follow it on the row. */
export const fromInvoices = (rowText: string) => /from \d+ PayPal invoices?, last \$\d[\d,]*\.\d\d/.exec(rowText)?.[0] ?? "from your PayPal invoices";

/** Caption in a band along the bottom. Waits `ms` (reading time) unless wait=false. */
export async function caption(page: Page, text: string, opts: { ms?: number; wait?: boolean } = {}) {
  const ms = opts.ms ?? Math.min(6000, 1400 + text.length * 45);
  await page.evaluate(
    ({ text, band }) => {
      // With the phone on stage, the caption sits beside it in big type instead of in the band.
      const side = document.getElementById("__demo_side");
      if (side) {
        side.textContent = text;
        return;
      }
      let el = document.getElementById("__demo_caption");
      if (!el) {
        const style = document.createElement("style");
        style.textContent = `html{scroll-padding-bottom:${band}px} body{padding-bottom:${band}px !important}`;
        document.head.appendChild(style);
        el = document.createElement("div");
        el.id = "__demo_caption";
        Object.assign(el.style, {
          position: "fixed", left: "0", right: "0", bottom: "0", height: `${band}px`, zIndex: "2147483647", boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 22px",
          background: "#0b0b0f", color: "#fff", font: "600 19px/1.35 ui-sans-serif, system-ui, -apple-system, sans-serif",
          textAlign: "center", borderTop: "3px solid var(--brand, #c2410c)", pointerEvents: "none",
        });
        document.body.appendChild(el);
      }
      el.textContent = text;
    },
    { text, band: BAND_PX },
  );
  if (opts.wait !== false) await sleep(ms);
}

/** Scrolls so the target sits in the middle of what the band leaves visible. */
export async function bringIntoView(target: Locator) {
  await target.evaluate((el, band) => {
    const r = el.getBoundingClientRect();
    const room = window.innerHeight - (window.top === window ? band : 0);
    window.scrollBy({ top: r.top + Math.min(r.height, room) / 2 - room / 2 - 20, behavior: "instant" });
  }, BAND_PX);
  await sleep(250);
}

/** A full-screen image with an optional label, for the open. */
export async function imageCard(page: Page, src: string, label: string, ms: number) {
  await page.evaluate(
    ({ src, label, band }) => {
      const el = document.createElement("div");
      el.id = "__demo_image";
      el.innerHTML = `<div style="font:700 15px/1.3 ui-sans-serif,system-ui;letter-spacing:.06em;text-transform:uppercase;color:#fdba74;margin-bottom:12px">${label}</div><img src="${src}" style="max-width:100%;min-height:0;flex:0 1 auto;object-fit:contain;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5)">`;
      // Fits a portrait phone or a 16:9 frame: the image keeps its shape inside what the caption band leaves.
      Object.assign(el.style, { position: "fixed", inset: `0 0 ${band}px 0`, zIndex: "2147483646", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px", background: "#0b1020" });
      document.body.appendChild(el);
    },
    { src, label, band: BAND_PX },
  );
  await sleep(ms);
}

export async function removeImageCard(page: Page) {
  await page.evaluate(() => document.getElementById("__demo_image")?.remove());
}

/** Full-screen title card (intro/outro). */
export async function titleCard(page: Page, title: string, subtitle = "", ms = 3200, opts: { keep?: boolean } = {}) {
  await page.evaluate(
    ({ title, subtitle }) => {
      const el = document.createElement("div");
      el.id = "__demo_title";
      el.innerHTML = `<div style="font:700 44px/1.1 ui-sans-serif,system-ui;letter-spacing:-0.02em">${title}</div>${subtitle ? `<div style="margin-top:18px;font:500 21px/1.4 ui-sans-serif,system-ui;opacity:.85">${subtitle}</div>` : ""}`;
      Object.assign(el.style, {
        position: "fixed", inset: "0", zIndex: "2147483647", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "48px", color: "#fff", background: "radial-gradient(ellipse at top, var(--brand, #0070e0), #0b1020 70%)",
        opacity: "0", transition: "opacity .4s",
      });
      document.body.appendChild(el);
      requestAnimationFrame(() => (el.style.opacity = "1"));
    },
    { title, subtitle },
  );
  await sleep(ms);
  if (opts.keep) return;
  await page.evaluate(() => {
    const el = document.getElementById("__demo_title");
    if (el) {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    }
  });
  await sleep(450);
}

/** Pulsing outline around an element so viewers know where to look. Drawn in the element's own document, so it lines up inside the phone frame too. */
export async function highlight(_page: Page, target: Locator, ms = 1600) {
  await bringIntoView(target);
  const drawn = await target
    .evaluate((node, ms) => {
      const box = node.getBoundingClientRect();
      if (!box.width && !box.height) return false;
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute", left: `${box.x - 6 + window.scrollX}px`, top: `${box.y - 6 + window.scrollY}px`, width: `${box.width + 12}px`, height: `${box.height + 12}px`,
        border: "3px solid #f59e0b", borderRadius: "14px", zIndex: "2147483646", pointerEvents: "none",
        boxShadow: "0 0 0 6px rgba(245,158,11,.25)", transition: "opacity .3s",
      });
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);
      }, ms);
      return true;
    }, ms)
    .catch(() => false);
  if (drawn) await sleep(Math.min(ms, 900));
}

/** Size of the phone on stage, in CSS pixels: an iPhone-sized viewport. */
export const PHONE = { width: 390, height: 844 };

/**
 * How much bigger than a whole phone fitted to the frame. At 1.5 the screen is half as big again,
 * so the phone shows the top part of an iPhone's height and the app scrolls inside it.
 */
export const PHONE_ZOOM = 1.5;

/**
 * Puts the app on a phone in the middle of the frame, with the captions beside it in big type.
 * Returns the phone's frame: drive the app through it. Same origin, so the microphone stand-in
 * and the visitor carry over.
 */
export async function phoneStage(page: Page, src: string): Promise<Frame> {
  await page.evaluate(
    ({ src, phone }) => {
      document.getElementById("__demo_caption")?.style.setProperty("display", "none");
      const stage = document.createElement("div");
      stage.id = "__demo_stage";
      const pad = 12;
      // A whole phone fitted to the frame, then zoomed: the screen keeps its width and gives up height.
      const scale = Math.min(1, (window.innerHeight - 28) / (phone.height + pad * 2)) * phone.zoom;
      phone.height = Math.floor((window.innerHeight - 28) / scale - pad * 2);
      Object.assign(stage.style, {
        position: "fixed", inset: "0", zIndex: "2147483640", display: "grid", gridTemplateColumns: `${Math.round((phone.width + pad * 2) * scale) + 120}px 1fr`,
        alignItems: "center", background: "radial-gradient(ellipse at 30% 20%, #1f2937, #0b1020 70%)", paddingLeft: "70px",
      });
      stage.innerHTML = `<div style="width:${(phone.width + pad * 2) * scale}px;height:${(phone.height + pad * 2) * scale}px"><div id="__demo_phone" style="width:${phone.width + pad * 2}px;height:${phone.height + pad * 2}px;transform:scale(${scale});transform-origin:top left;background:#0a0a0a;border-radius:54px;padding:${pad}px;box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 0 0 2px #2a2a2a"><iframe name="phone" src="${src}" style="width:${phone.width}px;height:${phone.height}px;border:0;border-radius:42px;background:#fff;display:block"></iframe></div></div><div id="__demo_side" style="color:#fff;font:600 30px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif;padding-right:70px;max-width:620px"></div>`;
      document.body.appendChild(stage);
    },
    { src, phone: { ...PHONE, zoom: PHONE_ZOOM } },
  );
  let frame: Frame | null = null;
  for (let i = 0; i < 100 && !frame; i++) {
    frame = page.frame({ name: "phone" });
    if (!frame) await sleep(100);
  }
  if (!frame) throw new Error("The phone frame didn't attach.");
  await frame.waitForLoadState("domcontentloaded");
  return frame;
}

/**
 * Small chips naming the PayPal calls behind a scene (create_invoice, send_invoice, webhook PAID),
 * in the top right corner. An empty list takes them away.
 */
export async function apiChips(page: Page, names: string[]) {
  await page.evaluate((names) => {
    let el = document.getElementById("__demo_chips");
    if (!el) {
      el = document.createElement("div");
      el.id = "__demo_chips";
      Object.assign(el.style, { position: "fixed", top: "16px", right: "18px", zIndex: "2147483647", display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "640px", pointerEvents: "none" });
      document.body.appendChild(el);
    }
    el.innerHTML = names
      .map((name) => `<span style="font:600 14px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:#003087;border:1px solid #0070e0;border-radius:999px;padding:7px 12px;box-shadow:0 4px 14px rgba(0,0,0,.25)">${name}</span>`)
      .join("");
  }, names);
}

export async function closePhoneStage(page: Page) {
  await page.evaluate(() => {
    document.getElementById("__demo_stage")?.remove();
    document.getElementById("__demo_caption")?.style.removeProperty("display");
  });
}

/** Keeps the video under Devpost's 3-minute limit. */
export class DemoClock {
  private readonly start = Date.now();
  constructor(private readonly limitSeconds = 170) {}
  get seconds() {
    return Math.round((Date.now() - this.start) / 1000);
  }
  check(label: string) {
    const s = this.seconds;
    console.log(`[demo] ${label} at ${s}s`);
    if (s > this.limitSeconds) throw new Error(`Demo is ${s}s at "${label}" (limit ${this.limitSeconds}s). Cut scenes or shorten captions.`);
  }
}

/**
 * Subtitles beside the phone for the voice, as it's said: the words show one by one over the clip,
 * paced by their length, starting when the microphone starts. Runs in the page, so it keeps time
 * with the audio and not with the test.
 */
export async function subtitles(page: Page, text: string, opts: { startedAt: number; seconds: number; leadMs?: number; label?: string }) {
  await page.evaluate(
    ({ text, startedAt, seconds, leadMs, label }) => {
      const side = document.getElementById("__demo_side");
      if (!side) return;
      const words = text.split(/\s+/).filter(Boolean);
      const weights = words.map((w) => w.length + 2);
      const total = weights.reduce((a, b) => a + b, 0);
      // The clip has a short lead-in and a little silence at the end.
      const speakMs = Math.max(1000, seconds * 1000 - leadMs - 400);
      const ends = weights.map((_, i) => leadMs + (speakMs * weights.slice(0, i + 1).reduce((a, b) => a + b, 0)) / total);
      side.innerHTML = `<div style="font:700 15px/1.3 ui-sans-serif,system-ui;letter-spacing:.06em;text-transform:uppercase;color:#fdba74;margin-bottom:14px">${label}</div><div id="__demo_sub" style="font:600 34px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif"></div>`;
      const sub = document.getElementById("__demo_sub")!;
      const tick = () => {
        const ms = Date.now() - startedAt;
        const n = ends.filter((e) => e - 250 <= ms).length;
        sub.innerHTML = `${words.slice(0, n).join(" ")}<span style="opacity:.28"> ${words.slice(n).join(" ")}</span>`;
        if (n < words.length && document.getElementById("__demo_sub") === sub) requestAnimationFrame(tick);
      };
      tick();
    },
    { text, startedAt: opts.startedAt, seconds: opts.seconds, leadMs: opts.leadMs ?? 300, label: opts.label ?? "Said in the van" },
  );
}

/**
 * A closer look: a copy of the element, at `scale` times its size, in the middle of the frame over
 * a dimmed page, so small print reads in the video. `null` takes it away.
 */
export async function magnify(page: Page, target: Locator | null, scale = 1.6) {
  if (!target) {
    await page.evaluate(() => document.getElementById("__demo_magnify")?.remove());
    return;
  }
  await bringIntoView(target);
  await target.evaluate(
    (node, { scale, band }) => {
      const box = node.getBoundingClientRect();
      const wrap = document.createElement("div");
      wrap.id = "__demo_magnify";
      Object.assign(wrap.style, { position: "fixed", inset: `0 0 ${band}px 0`, zIndex: "2147483645", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(11,16,32,.72)", pointerEvents: "none" });
      const card = document.createElement("div");
      Object.assign(card.style, { width: `${box.width}px`, zoom: String(Math.min(scale, (window.innerWidth - 80) / box.width, (window.innerHeight - band - 60) / box.height)), background: "#fff", borderRadius: "14px", boxShadow: "0 0 0 4px #f59e0b, 0 24px 70px rgba(0,0,0,.5)", overflow: "hidden" });
      card.appendChild(node.cloneNode(true));
      wrap.appendChild(card);
      document.body.appendChild(wrap);
    },
    { scale, band: BAND_PX },
  );
}
