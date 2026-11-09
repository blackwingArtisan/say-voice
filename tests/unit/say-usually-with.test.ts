import { describe, expect, it } from "vitest";
import { PAST_JOBS } from "@/lib/demo/past-invoices";
import { itemKey, TOGETHER_MIN, TOGETHER_SHARE, usuallyWith, usuallyWithText, type PriceEntry } from "@/lib/say/price-book";

/** A book entry read from PayPal: the invoices that had it, and its price on each. */
const fromPayPal = (name: string, ids: string[], cents: number, quantity = 1_000): PriceEntry => ({
  id: itemKey(name),
  name,
  samples: ids.map(() => cents),
  source: "learned",
  updatedAt: "2026-11-09",
  paypal: { invoices: ids.length, lastCents: cents, lastAt: "2026-11-09", quantities: ids.map(() => quantity), invoiceIds: ids },
});
const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `INV-${from + i}`);

describe("what the trade usually bills together", () => {
  it("nudges an item on 6 of the 7 invoices that had this job's item", () => {
    const book = [fromPayPal("Heating element", ids(7), 5_000), fromPayPal("Service call", ids(6), 9_500)];
    const [nudge] = usuallyWith(["Heating element"], book);
    expect(nudge).toMatchObject({ id: "with:service call", withName: "Heating element", name: "Service call", cents: 9_500, quantityMilli: 1_000, together: 6, of: 7 });
    expect(usuallyWithText(nudge)).toBe("Usually with a heating element: Service call $95.00, on 6 of your 7 PayPal invoices with a heating element. You didn't say one.");
  });

  it("says nothing for 2 of 7, or for a share under 75%", () => {
    expect(usuallyWith(["Heating element"], [fromPayPal("Heating element", ids(7), 5_000), fromPayPal("Service call", ids(2), 9_500)])).toEqual([]);
    // 5 of 7 is 71%: under the share, so no nudge.
    expect(usuallyWith(["Heating element"], [fromPayPal("Heating element", ids(7), 5_000), fromPayPal("Service call", ids(5), 9_500)])).toEqual([]);
    expect(TOGETHER_SHARE).toBe(0.75);
  });

  it("needs at least 3 shared invoices, however high the share", () => {
    expect(TOGETHER_MIN).toBe(3);
    expect(usuallyWith(["Igniter"], [fromPayPal("Igniter", ids(2), 4_200), fromPayPal("Service call", ids(2), 9_500)])).toEqual([]);
    expect(usuallyWith(["Igniter"], [fromPayPal("Igniter", ids(3), 4_200), fromPayPal("Service call", ids(3), 9_500)])).toHaveLength(1);
  });

  it("never nudges an item already on the job, under any of its spoken names", () => {
    const book = [fromPayPal("Heating element", ids(7), 5_000), fromPayPal("Thermal fuse", ids(7), 1_800)];
    expect(usuallyWith(["Heating element", "Thermal fuse"], book)).toEqual([]);
    expect(usuallyWith(["New heating element", "thermal fuses"], book)).toEqual([]);
    expect(usuallyWith(["Dryer heating element"], book).map((n) => n.name)).toEqual(["Thermal fuse"]);
  });

  it("never counts labor, which never reaches the book from PayPal, and ignores items with no PayPal invoices", () => {
    const labor: PriceEntry = { id: "labor", name: "Labor", samples: [8_000, 8_000, 8_000], source: "seed", updatedAt: "2026-11-01" };
    const book = [fromPayPal("Heating element", ids(4), 5_000), labor];
    expect(usuallyWith(["Heating element"], book)).toEqual([]);
    expect(usuallyWith(["Labor"], book)).toEqual([]);
  });

  it("uses the usual price and count from PayPal, not the last one", () => {
    const fuse = { ...fromPayPal("Thermal fuse", ids(4), 1_800, 2_000), samples: [1_800, 1_800, 2_500, 1_800] };
    const [nudge] = usuallyWith(["Heating element"], [fromPayPal("Heating element", ids(4), 5_000), fuse]);
    expect(nudge).toMatchObject({ cents: 1_800, quantityMilli: 2_000 });
    expect(usuallyWithText(nudge)).toContain("Thermal fuse 2 × $18.00");
  });

  it("is left alone on a history read before invoice ids were kept", () => {
    const old = (e: PriceEntry): PriceEntry => ({ ...e, paypal: { ...e.paypal!, invoiceIds: undefined } });
    expect(usuallyWith(["Heating element"], [old(fromPayPal("Heating element", ids(7), 5_000)), old(fromPayPal("Service call", ids(7), 9_500))])).toEqual([]);
  });
});

describe("the demo trade's illustrative history", () => {
  it("has a thermal fuse on 8 of its 10 heating-element jobs, and nothing else that often", () => {
    const element = PAST_JOBS.filter((job) => job.lines.some(([name]) => name === "Heating element"));
    const withFuse = element.filter((job) => job.lines.some(([name]) => name === "Thermal fuse"));
    expect([withFuse.length, element.length]).toEqual([8, 10]);
    const serviceCall = element.filter((job) => job.lines.some(([name]) => name === "Service call"));
    expect(serviceCall.length / element.length).toBeLessThan(TOGETHER_SHARE);
  });

  it("nudges the sample dryer job for the fuse once learned from mock PayPal", async () => {
    const { learnFromPayPal } = await import("@/lib/say/paypal-history");
    const { priceBook } = await import("@/lib/say/price-store");
    const visitor = `v_${Math.random()}`;
    await learnFromPayPal(visitor);
    const nudges = usuallyWith(["Labor", "Heating element"], priceBook(visitor));
    expect(nudges.map((n) => [n.name, n.cents, n.together, n.of])).toEqual([["Thermal fuse", 1_800, 8, 10]]);
  });
});
