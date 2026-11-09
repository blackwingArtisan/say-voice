import { describe, expect, it } from "vitest";
import { PAST_JOBS } from "@/lib/demo/past-invoices";
import { itemKey, type PriceEntry } from "@/lib/say/price-book";
import type { PayPalHistory } from "@/lib/say/paypal-history";
import { RECEIPTS_PHRASE, receiptsFor } from "@/lib/say/receipts";

const entry = (name: string, ids: string[]): PriceEntry => ({
  id: itemKey(name),
  name,
  samples: ids.map(() => 5_000),
  source: "learned",
  updatedAt: "2026-11-09",
  paypal: { invoices: ids.length, lastCents: 5_000, lastAt: "2026-11-09", invoiceIds: ids },
});

const history: PayPalHistory = {
  id: "h_anyone",
  learnedAt: "2026-11-09T12:00:00.000Z",
  invoiceIds: ["INV2-A", "INV2-B", "INV2-C"],
  lines: [
    { name: "Heating element", unitCents: 4_800, invoicedAt: "2026-08-01", invoiceId: "INV2-A" },
    { name: "Thermal fuse", unitCents: 1_800, invoicedAt: "2026-08-01", invoiceId: "INV2-A" },
    { name: "Dryer heating element", unitCents: 5_000, invoicedAt: "2026-10-02", invoiceId: "INV2-B" },
    { name: "Drain pump", unitCents: 8_500, invoicedAt: "2026-10-20", invoiceId: "INV2-C" },
  ],
  invoices: [
    { id: "INV2-A", number: "0101", date: "2026-08-01", viewUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2-A" },
    { id: "INV2-B", number: "0102", date: "2026-10-02" },
  ],
};

describe("the PayPal invoices behind a price", () => {
  it("lists each invoice with PayPal's number, its date and the price it had, newest first", () => {
    expect(receiptsFor(entry("Heating element", ["INV2-A", "INV2-B"]), history)).toEqual([
      { id: "INV2-B", number: "0102", date: "2026-10-02", cents: 5_000 },
      { id: "INV2-A", number: "0101", date: "2026-08-01", cents: 4_800, viewUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2-A" },
    ]);
  });

  it("only the entry's own invoices, and only its own item on them", () => {
    const rows = receiptsFor(entry("Thermal fuse", ["INV2-A"]), history);
    expect(rows).toEqual([{ id: "INV2-A", number: "0101", date: "2026-08-01", cents: 1_800, viewUrl: expect.any(String) }]);
    // An id the history never read, or an invoice without the item, lists nothing.
    expect(receiptsFor(entry("Thermal fuse", ["INV2-Z", "INV2-C"]), history)).toEqual([]);
  });

  it("a history read before numbers were kept still lists the ids, dated by the line", () => {
    const old = { ...history, invoices: undefined };
    expect(receiptsFor(entry("Drain pump", ["INV2-C"]), old)).toEqual([{ id: "INV2-C", date: "2026-10-20", cents: 8_500 }]);
  });

  it("no history or no PayPal ids: nothing to list", () => {
    expect(receiptsFor(entry("Drain pump", ["INV2-C"]), null)).toEqual([]);
    expect(receiptsFor({ id: "wax ring", name: "Wax ring", samples: [1_200], source: "seed", updatedAt: "2026-11-01" }, history)).toEqual([]);
  });

  it("the tap hangs off the provenance phrase in a check", () => {
    expect(RECEIPTS_PHRASE.exec("Usually $50.00, from 9 PayPal invoices, last $50.00. This says $15.00.")?.[0]).toBe("from 9 PayPal invoices");
    expect(RECEIPTS_PHRASE.exec("Quantity: usually 1, on all 1 PayPal invoice (last $50.00 each).")?.[0]).toBe("on all 1 PayPal invoice");
    expect(RECEIPTS_PHRASE.exec("3 invoices, $12.00 to $14.00")).toBeNull();
  });

  it("learning from PayPal keeps each invoice's number and date, and the book's ids all have a row", async () => {
    const { learnFromPayPal } = await import("@/lib/say/paypal-history");
    const { priceBook } = await import("@/lib/say/price-store");
    const visitor = `v_receipts${Date.now().toString(36)}`;
    const learned = await learnFromPayPal(visitor);
    expect(learned.invoices?.map((i) => i.id)).toEqual(learned.invoiceIds);
    expect(learned.invoices?.every((i) => i.number && /^\d{4}-\d{2}-\d{2}$/.test(i.date))).toBe(true);
    // Mock PayPal's pages don't exist, so no link to one.
    expect(learned.invoices?.some((i) => i.viewUrl)).toBe(false);
    const element = priceBook(visitor).find((e) => e.name === "Heating element")!;
    const rows = receiptsFor(element, learned);
    expect(rows.map((r) => r.id).sort()).toEqual([...element.paypal!.invoiceIds!].sort());
    expect(rows.length).toBe(PAST_JOBS.filter((j) => j.lines.some(([name]) => name === "Heating element")).length);
  });
});
