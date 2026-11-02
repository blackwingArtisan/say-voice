import { describe, expect, it } from "vitest";
import { centsToValue, computeTotals, dollarsToCents, formatCents, formatQuantity, formatRate, lineCents, parseDollars, parsePercent, parseQuantity, percentToRateMilli, unitsToMilli } from "@/lib/say/money";

const line = (quantity: string, price: string) => ({ quantityMilli: parseQuantity(quantity)!, unitCents: parseDollars(price)! });

describe("invoice arithmetic", () => {
  it("multiplies hours by a rate in whole cents", () => {
    expect(lineCents(line("0.75", "80.00"))).toBe(6000);
    expect(lineCents(line("1.5", "85.00"))).toBe(12_750);
    expect(lineCents(line("2.25", "40"))).toBe(9000);
  });

  // Each case was read from a real PayPal sandbox draft on 2026-11-01.
  it.each([
    ["three lines at 7.25% tax per line, not on the sum", [line("1", "10.10"), line("1", "10.10"), line("1", "10.10")], 7250, { subtotalCents: 3030, taxCents: 219, totalCents: 3249 }],
    ["half a cent of tax rounds up on each line", [line("1", "0.10"), line("1", "0.10"), line("1", "0.10")], 5000, { subtotalCents: 30, taxCents: 3, totalCents: 33 }],
    ["half-cent tax on one line", [line("1", "0.30")], 5000, { subtotalCents: 30, taxCents: 2, totalCents: 32 }],
    ["a line with half a cent rounds up", [line("0.75", "85.50")], 0, { subtotalCents: 6413, taxCents: 0, totalCents: 6413 }],
    ["lines round before they add up", [line("0.75", "85.50"), line("1.5", "0.33")], 0, { subtotalCents: 6463, taxCents: 0, totalCents: 6463 }],
    ["tax is taken on the rounded line", [line("1.5", "0.03")], 50_000, { subtotalCents: 5, taxCents: 3, totalCents: 8 }],
    ["tax on a tiny line next to a big one", [line("0.75", "0.06"), line("1", "10.00")], 10_000, { subtotalCents: 1005, taxCents: 101, totalCents: 1106 }],
    ["a three-decimal rate", [line("1.333", "33.33")], 8875, { subtotalCents: 4443, taxCents: 394, totalCents: 4837 }],
  ])("matches PayPal: %s", (_name, lines, rate, expected) => {
    expect(computeTotals(lines, rate)).toMatchObject(expected);
  });

  it("charges no tax at a zero rate", () => {
    expect(computeTotals([line("2", "90"), line("2", "18")], 0)).toMatchObject({ subtotalCents: 21_600, taxCents: 0, totalCents: 21_600 });
  });
});

describe("turning numbers into cents", () => {
  it("rounds AI floats once, here", () => {
    expect(dollarsToCents(1.15)).toBe(115);
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(unitsToMilli(1.5)).toBe(1500);
    expect(percentToRateMilli(8.875)).toBe(8875);
    expect(percentToRateMilli(null)).toBe(0);
  });

  it("reads what a person types without floats", () => {
    expect(parseDollars("15.5")).toBe(1550);
    expect(parseDollars("$1,250.00")).toBe(125_000);
    expect(parseDollars("15.555")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("")).toBeNull();
    expect(parseQuantity("1.25")).toBe(1250);
    expect(parsePercent("7.25")).toBe(7250);
  });

  it("formats for people and for PayPal", () => {
    expect(formatCents(123_456)).toBe("$1,234.56");
    expect(centsToValue(150)).toBe("1.50");
    expect(formatQuantity(1500)).toBe("1.5");
    expect(formatQuantity(2000)).toBe("2");
    expect(formatRate(8875)).toBe("8.875");
    expect(formatRate(0)).toBe("0");
  });
});
