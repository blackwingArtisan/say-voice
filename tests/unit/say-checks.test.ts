import { describe, expect, it } from "vitest";
import { findChecks, openChecks, placesToCheck, type CheckInput } from "@/lib/say/checks";
import { toJobFields } from "@/lib/say/extract";
import { itemKey, type PriceEntry } from "@/lib/say/price-book";
import { SAMPLE_AMOUNTS, SAMPLE_EXTRACTION, SAMPLE_TRANSCRIPT, SEED_PRICES } from "@/lib/say/sample";

const book: PriceEntry[] = SEED_PRICES.map(({ name, samples }) => ({ id: itemKey(name), name, samples, source: "seed", updatedAt: "now" }));
const sample = toJobFields(SAMPLE_EXTRACTION);
const base: CheckInput = { transcript: SAMPLE_TRANSCRIPT, heardLines: sample.lines, flags: sample.flags, lines: sample.lines, taxRateMilli: 0, book };
const element = sample.lines[1];
const withPrice = (unitCents: number) => sample.lines.map((line) => (line.key === element.key ? { ...line, unitCents } : line));

describe("the sample job, where fifty was heard as fifteen", () => {
  it("is stopped by code even when the AI flagged nothing", () => {
    const checks = findChecks({ ...base, flags: [] });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ kind: "far", lineKey: element.key, cents: SAMPLE_AMOUNTS.heardElementCents, usualCents: SAMPLE_AMOUNTS.spokenElementCents });
    expect(checks[0].text).toContain("Usually $50.00");
    expect(checks[0].text).toContain('"fifteen" sounds like "fifty"');
  });

  it("puts the code's check and the AI's on the same row, which counts once", () => {
    const open = openChecks(findChecks(base), []);
    expect(open.map((check) => check.kind).sort()).toEqual(["far", "flag"]);
    expect(placesToCheck(open)).toBe(1);
  });

  it("is clear once the price is corrected", () => {
    expect(findChecks({ ...base, lines: withPrice(SAMPLE_AMOUNTS.spokenElementCents) })).toEqual([]);
  });

  it("opens again when a correction is also far off", () => {
    const kept = findChecks(base).map((check) => check.id);
    const open = openChecks(findChecks({ ...base, lines: withPrice(900) }), kept);
    expect(open.map((check) => check.kind)).toEqual(["far"]);
  });

  it("stays clear when the person keeps the price", () => {
    const checks = findChecks(base);
    expect(openChecks(checks, checks.map((check) => check.id))).toEqual([]);
  });
});

describe("sixty heard as sixteen", () => {
  const lines = [{ key: "a", name: "Labor", quantityMilli: 2000, unitCents: 1600 }];
  it("offers the sound-alike as well as the usual price", () => {
    const [check] = findChecks({ ...base, transcript: "Two hours at 16 hour.", heardLines: lines, lines, flags: [] });
    expect(check).toMatchObject({ kind: "far", usualCents: 8000, alikeCents: 6000 });
  });
});

describe("a spoken amount with no line item", () => {
  const transcript = `${SAMPLE_TRANSCRIPT} Plus a forty dollar disposal charge.`;
  it("needs a decision", () => {
    const checks = findChecks({ ...base, flags: [], transcript, lines: withPrice(5000), heardLines: withPrice(5000) });
    expect(checks.map((check) => check.id)).toContain("missing:4000");
  });

  it("goes away when a line covers it", () => {
    const lines = [...withPrice(5000), { key: "new", name: "Disposal", quantityMilli: 1000, unitCents: 4000 }];
    expect(findChecks({ ...base, flags: [], transcript, heardLines: withPrice(5000), lines }).map((check) => check.id)).not.toContain("missing:4000");
  });

  it("comes up for a spoken item the person deleted", () => {
    const checks = findChecks({ ...base, flags: [], lines: sample.lines.slice(0, 1) });
    expect(checks).toEqual([expect.objectContaining({ kind: "missing", cents: SAMPLE_AMOUNTS.heardElementCents })]);
  });
});

describe("a price that was never said", () => {
  const lines = [{ key: "a", name: "Valve", quantityMilli: 1000, unitCents: 3300 }];
  it("needs a look", () => {
    expect(findChecks({ ...base, transcript: "New valve.", heardLines: lines, lines, flags: [] }).map((check) => check.kind)).toEqual(["unheard"]);
  });

  it("is fine once the person types their own price", () => {
    expect(findChecks({ ...base, transcript: "New valve.", heardLines: lines, lines: [{ ...lines[0], unitCents: 3500 }], flags: [] })).toEqual([]);
  });
});

describe("a doubt about the whole job", () => {
  it("has no row and still has to be settled", () => {
    const [check] = findChecks({ ...base, flags: [{ text: "Unsure if this is one visit or two" }], lines: withPrice(5000), heardLines: withPrice(5000) });
    expect(check).toMatchObject({ kind: "flag" });
    expect(check.lineKey).toBeUndefined();
  });
});
