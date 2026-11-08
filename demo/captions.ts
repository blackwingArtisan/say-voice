/**
 * Helpers for silent, captioned demo videos. Everything is injected into the page with
 * page.evaluate, so it works on any page without app support.
 *
 *   await titleCard(page, "Settle partial shipments with PayPal", "An AI agent with a human in the loop");
 *   await caption(page, "The buyer approves a $120 hold with PayPal");
 *   await highlight(page, page.getByTestId("run-agent"));
 */
import type { Locator, Page } from "@playwright/test";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Height of the caption band. The page gets that much room at the bottom, so a caption never covers what it names. */
export const BAND_PX = 132;

/** Caption in a band along the bottom. Waits `ms` (reading time) unless wait=false. */
export async function caption(page: Page, text: string, opts: { ms?: number; wait?: boolean } = {}) {
  const ms = opts.ms ?? Math.min(6000, 1400 + text.length * 45);
  await page.evaluate(
    ({ text, band }) => {
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
    const room = window.innerHeight - band;
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

/** Pulsing outline around an element so viewers know where to look. */
export async function highlight(page: Page, target: Locator, ms = 1600) {
  await bringIntoView(target);
  const box = await target.boundingBox();
  if (!box) return;
  await page.evaluate(
    ({ box, ms }) => {
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
    },
    { box, ms },
  );
  await sleep(Math.min(ms, 900));
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
