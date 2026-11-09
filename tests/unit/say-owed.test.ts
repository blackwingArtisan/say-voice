import { describe, expect, it } from "vitest";
import { owedFirst, owedSummary, owedText } from "@/lib/say/owed";
import type { SentInvoice } from "@/lib/say/types";

let n = 0;
const invoice = (status: string, totalCents: number, dueCents: number): SentInvoice => ({ id: `INV-${++n}`, number: String(n).padStart(4, "0"), status, totalCents, dueCents, readAt: "2026-11-09T12:00:00Z" });
const job = (createdAt: string, inv?: SentInvoice, example = false) => ({ createdAt, invoice: inv, example });

describe("what the trade is owed", () => {
  it("adds up what PayPal says is still due on each unpaid invoice", () => {
    const jobs = [job("2026-11-01", invoice("SENT", 11_000, 11_000)), job("2026-11-02", invoice("PARTIALLY_PAID", 60_000, 40_000)), job("2026-11-03", invoice("UNPAID", 12_800, 12_800))];
    const owed = owedSummary(jobs);
    expect(owed).toEqual({ cents: 63_800, invoices: 3, sent: 3 });
    expect(owedText(owed)).toBe("Owed $638.00 on 3 invoices");
    expect(owedText(owedSummary(jobs.slice(0, 1)))).toBe("Owed $110.00 on 1 invoice");
  });

  it("leaves out paid, marked-paid, cancelled and refunded invoices, drafts, and the shared sample", () => {
    const jobs = [
      job("2026-11-01", invoice("PAID", 11_000, 0)),
      job("2026-11-01", invoice("MARKED_AS_PAID", 9_000, 0)),
      job("2026-11-01", invoice("CANCELLED", 5_000, 5_000)),
      job("2026-11-01", invoice("REFUNDED", 5_000, 0)),
      job("2026-11-01"),
      job("2026-11-01", invoice("SENT", 11_000, 11_000), true),
    ];
    expect(owedSummary(jobs)).toEqual({ cents: 0, invoices: 0, sent: 4 });
    expect(owedText(owedSummary(jobs))).toBe("Nothing owed");
    expect(owedSummary([job("2026-11-01")])).toEqual({ cents: 0, invoices: 0, sent: 0 });
  });

  it("puts the unpaid jobs first, oldest debt at the top, and keeps the rest in order", () => {
    const a = job("2026-11-05T00:00:00Z", invoice("PAID", 1, 0));
    const b = job("2026-11-04T00:00:00Z", invoice("SENT", 1, 1));
    const c = job("2026-11-03T00:00:00Z");
    const d = job("2026-11-02T00:00:00Z", invoice("UNPAID", 1, 1));
    expect(owedFirst([a, b, c, d])).toEqual([d, b, a, c]);
  });
});
