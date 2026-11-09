import { describe, expect, it } from "vitest";
import { appConfig } from "@/app.config";
import { invoiceRequest } from "@/agents/tools/send-job-invoice";
import { PAST_JOBS, pastInvoiceRequest, seedPastInvoices } from "@/lib/demo/past-invoices";
import { MockPayPal } from "@/lib/paypal/mock";
import { APP_MEMO, sentByApp } from "@/lib/say/app-memo";
import { findChecks } from "@/lib/say/checks";
import { learnedDifference, provenance, type PriceEntry } from "@/lib/say/price-book";
import { SAMPLE_TRANSCRIPT } from "@/lib/say/sample";
import type { JobLine } from "@/lib/say/types";

const usd = (value: string) => ({ currency_code: "USD", value });

describe("the demo trade's past PayPal invoices", () => {
  it("are 15 to 20 jobs from the past, to example.com customers, all from this trade", () => {
    expect(PAST_JOBS.length).toBeGreaterThanOrEqual(15);
    expect(PAST_JOBS.length).toBeLessThanOrEqual(20);
    const now = new Date("2026-11-08T12:00:00Z");
    for (const job of PAST_JOBS) {
      const request = pastInvoiceRequest(job, now);
      expect(request.invoicer?.business_name).toBe(appConfig.tradeName);
      expect(request.primary_recipients?.[0].billing_info?.email_address).toMatch(/@example\.com$/);
      expect(request.detail.invoice_date! < "2026-11-08").toBe(true);
      expect(request.detail.memo).toBeUndefined();
    }
  });

  it("are seeded once: a second run reuses every one, sent, and the paid ones paid by check", async () => {
    const pp = new MockPayPal();
    const manifest: Record<string, string> = {};
    expect(await seedPastInvoices(pp, manifest)).toEqual({ created: PAST_JOBS.length, reused: 0 });
    expect(await seedPastInvoices(pp, manifest)).toEqual({ created: 0, reused: PAST_JOBS.length });
    const statuses = await Promise.all(PAST_JOBS.map(async (job) => [job.paid, (await pp.invoicing.get(manifest[job.key])).status] as const));
    for (const [paid, status] of statuses) expect(status).toBe(paid ? "MARKED_AS_PAID" : "SENT");
  });
});

describe("every invoice this app sends is tagged with a private memo", () => {
  it("puts the memo on the request, and the learn step reads it as sent here", () => {
    const request = invoiceRequest({ customer_name: "Pat Rivera", customer_email: "pat.rivera@example.com", due_date: "2026-11-22", tax_rate_milli: 0, total_cents: 5_000, lines: [{ key: "a", name: "Heating element", quantityMilli: 1_000, unitCents: 5_000 }] } as never);
    expect(request.detail.memo).toBe(APP_MEMO);
    expect(sentByApp({ detail: request.detail })).toBe(true);
    expect(sentByApp({ detail: { memo: "Paid in cash, call first" } })).toBe(false);
    expect(sentByApp({ detail: {} })).toBe(false);
  });
});

describe("learn from my PayPal invoices", () => {
  it("fills the book from the trade's past invoices, says where each price came from, and skips app sends", async () => {
    const { getPayPal } = await import("@/lib/paypal");
    const { learnFromPayPal } = await import("@/lib/say/paypal-history");
    const { priceBook } = await import("@/lib/say/price-store");
    const paypal = getPayPal();
    // Sent with this app from some other browser: never the trade's history.
    const draft = await paypal.invoicing.create({ detail: { currency_code: "USD", memo: APP_MEMO }, invoicer: { business_name: appConfig.tradeName }, primary_recipients: [{ billing_info: { email_address: "x@example.com" } }], items: [{ name: "Drain pump", quantity: "1", unit_amount: usd("5.00") }] });
    await paypal.invoicing.send(draft.id);

    const visitor = `v_${Math.random()}`;
    const history = await learnFromPayPal(visitor);
    expect(history.invoiceIds.length).toBeGreaterThanOrEqual(15);
    expect(history.invoiceIds).not.toContain(draft.id);

    const book = priceBook(visitor);
    const pump = book.find((e) => e.name === "Drain pump")!;
    const pastPumps = PAST_JOBS.filter((j) => j.lines.some(([name]) => name === "Drain pump")).length;
    expect(pump.paypal).toMatchObject({ invoices: pastPumps, lastCents: 8_500 });
    expect(pump.samples).not.toContain(500);
    expect(provenance(pump)).toBe(`from ${pastPumps} PayPal invoices, last $85.00`);

    // PayPal's prices replace the demo ones for the same item.
    const element = book.find((e) => e.name === "Heating element")!;
    const pastElements = PAST_JOBS.flatMap((j) => j.lines.filter(([name]) => name === "Heating element")).map(([, , price]) => Math.round(Number(price) * 100));
    expect(element.samples).toEqual(pastElements);
    expect(element.paypal?.lastCents).toBe(5_000);
    // Demo-only items say so.
    expect(provenance(book.find((e) => e.name === "Wax ring")!)).toBe("3 invoices, $12.00 to $14.00");
    expect(priceBook("someone-else").find((e) => e.name === "Drain pump")).toBeUndefined();
  });
});

describe("the confirm screen points out a price unlike the learned one", () => {
  const entry: PriceEntry = { id: "drain pump", name: "Drain pump", samples: [8_500, 8_500, 8_500, 8_500], source: "learned", updatedAt: "2026-11-03", paypal: { invoices: 4, lastCents: 8_500, lastAt: "2026-11-03" } };

  it("says what PayPal had last time when it differs, and nothing when it's the same", () => {
    expect(learnedDifference({ name: "Drain pump", unitCents: 9_500 }, [entry])).toBe("Your PayPal invoices had this at $85.00 last time (4 invoices). This says $95.00.");
    expect(learnedDifference({ name: "Drain pump", unitCents: 8_500 }, [entry])).toBeNull();
    expect(learnedDifference({ name: "Drain pump", unitCents: 9_500 }, [{ ...entry, paypal: undefined }])).toBeNull();
  });

  it("stops the send when it's far off, saying the usual price came from PayPal", () => {
    const lines = [{ key: "a", name: "Drain pump", quantityMilli: 1_000, unitCents: 1_500 }] as JobLine[];
    const far = findChecks({ transcript: SAMPLE_TRANSCRIPT, heardLines: lines, flags: [], lines, taxRateMilli: 0, book: [entry] }).find((c) => c.kind === "far");
    expect(far?.text).toMatch(/^Usually \$85\.00, from 4 PayPal invoices, last \$85\.00\. This says \$15\.00\./);
  });
});

describe("the trade's history behind a pile of the app's own sends", () => {
  it("is still found when hundreds of newer invoices were sent with this app", async () => {
    const { getPayPal } = await import("@/lib/paypal");
    const { learnFromPayPal } = await import("@/lib/say/paypal-history");
    const paypal = getPayPal();
    await learnFromPayPal(`v_${Math.random()}`); // puts the trade's past invoices on mock PayPal first
    // A busy shared sandbox: 350 invoices sent with this app since, newest first in PayPal's list.
    for (let i = 0; i < 350; i++) {
      const draft = await paypal.invoicing.create({ detail: { currency_code: "USD", memo: APP_MEMO }, invoicer: { business_name: appConfig.tradeName }, primary_recipients: [{ billing_info: { email_address: "x@example.com" } }], items: [{ name: "Drain pump", quantity: "1", unit_amount: usd("85.00") }] });
      await paypal.invoicing.send(draft.id);
    }
    const history = await learnFromPayPal(`v_${Math.random()}`);
    expect(history.invoiceIds.length).toBeGreaterThanOrEqual(15);
  }, 60_000);
});
