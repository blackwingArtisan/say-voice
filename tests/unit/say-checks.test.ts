import { describe, expect, it } from "vitest";
import { findChecks, openChecks, placesToCheck, type CheckInput } from "@/lib/say/checks";
import { toJobFields } from "@/lib/say/extract";
import { itemKey, type PriceEntry } from "@/lib/say/price-book";
import { SAMPLE_AMOUNTS, SAMPLE_EXTRACTION, SAMPLE_TRANSCRIPT, SEED_PRICES } from "@/lib/say/sample";

const book: PriceEntry[] = SEED_PRICES.map(({ name, samples }) => ({ id: itemKey(name), name, samples, source: "seed", updatedAt: "now" }));
// Described, so the vague-line check stays out of these price tests. It has its own tests.
const fields = toJobFields(SAMPLE_EXTRACTION);
const sample = { ...fields, lines: fields.lines.map((line) => ({ ...line, description: "As said" })) };
const base: CheckInput = { transcript: SAMPLE_TRANSCRIPT, heardLines: sample.lines, flags: sample.flags, lines: sample.lines, taxRateMilli: 0, book };
const element = sample.lines[1];
const withPrice = (unitCents: number) => sample.lines.map((line) => (line.key === element.key ? { ...line, unitCents } : line));

describe("flat-rate labor", () => {
  const labor = (unitCents: number, quantityMilli = 1000) => [{ key: "l", name: "Labor", quantityMilli, unitCents, description: "As said" }];

  it("isn't compared with the hourly rate", () => {
    const lines = labor(25000);
    expect(findChecks({ ...base, transcript: "Flat rate two fifty for labor.", heardLines: lines, lines, flags: [] }).filter((check) => check.kind === "far")).toEqual([]);
  });

  it("isn't compared with the hourly rate when the hours are how long it took", () => {
    const lines = labor(40000);
    const transcript = "Reset the sagging gate and rehung it, approximately three and a half hours, four hundred dollars labor.";
    expect(findChecks({ ...base, transcript, heardLines: lines, lines, flags: [] }).filter((check) => check.kind === "far")).toEqual([]);
  });

  it("still catches an hourly rate far from the book, said with an estimate", () => {
    const lines = labor(1500);
    const transcript = "Cleared the clogged drain, about an hour of labor at fifteen an hour.";
    expect(findChecks({ ...base, transcript, heardLines: lines, lines, flags: [] })[0]).toMatchObject({ kind: "far", usualCents: 8000 });
  });

  it("still catches one hour at a misheard rate", () => {
    const lines = labor(1600);
    expect(findChecks({ ...base, transcript: "One hour at sixteen an hour.", heardLines: lines, lines, flags: [] })[0]).toMatchObject({ kind: "far", usualCents: 8000 });
  });
});

describe("the sample job, where fifty was heard as fifteen", () => {
  it("is stopped by code even when the AI flagged nothing", () => {
    const checks = findChecks({ ...base, flags: [] });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ kind: "far", lineKey: element.key, cents: SAMPLE_AMOUNTS.heardElementCents, usualCents: SAMPLE_AMOUNTS.spokenElementCents });
    expect(checks[0].text).toContain("Usually $50.00");
    expect(checks[0].text).toContain('"fifteen" sounds like "fifty"');
  });

  it("says it the same way whatever words the AI used", () => {
    const canned = findChecks(base);
    const real = findChecks({ ...base, flags: [{ text: "$15 seems low for a heating element", lineKey: element.key }] });
    const noWords = findChecks({ ...base, flags: [{ text: "The heating element price seems low", lineKey: element.key }] });
    expect(canned.map((check) => check.kind)).toEqual(["far"]);
    expect(real).toEqual(canned);
    expect(noWords).toEqual(canned);
  });

  it("keeps a doubt about something other than the price, which counts once with it", () => {
    const open = openChecks(findChecks({ ...base, flags: [{ text: "Not sure how many heating elements were fitted", lineKey: element.key }] }), []);
    expect(open.map((check) => check.kind).sort()).toEqual(["far", "flag"]);
    expect(placesToCheck(open)).toBe(1);
  });

  it("names the usual price on a doubt the book wouldn't stop on its own", () => {
    const lines = withPrice(4000);
    const [check] = findChecks({ ...base, transcript: "Heating element, forty dollars.", heardLines: lines, lines, flags: [{ text: "$40 seems low for a heating element", lineKey: element.key }] });
    expect(check).toMatchObject({ kind: "flag" });
    expect(check.text).toBe("$40 seems low for a heating element Usually $50.00.");
  });

  it("leaves a doubt alone when the book doesn't know the item", () => {
    const lines = [{ ...element, name: "Sump pump", unitCents: 1200 }];
    const [check] = findChecks({ ...base, heardLines: lines, lines, transcript: "Sump pump, twelve dollars.", flags: [{ text: "$12 seems low for a sump pump", lineKey: element.key }] });
    expect(check.text).toBe("$12 seems low for a sump pump");
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
  const lines = [{ key: "a", name: "Labor", quantityMilli: 2000, unitCents: 1600, description: "As said" }];
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

describe("day one: no price history, and a price that sounds like another", () => {
  const item = (name: string, unitCents: number, quantityMilli = 1000) => [{ key: "a", name, quantityMilli, unitCents, description: "As said" }];
  const day1 = (transcript: string, lines: ReturnType<typeof item>, onBook: PriceEntry[] = []) => findChecks({ ...base, transcript, heardLines: lines, lines, flags: [], book: onBook });

  it("flags fifteen, with both readings and no usual price", () => {
    const [check, ...rest] = day1("Sump pump, fifteen dollars.", item("Sump pump", 1500));
    expect(rest).toEqual([]);
    expect(check).toMatchObject({ kind: "alike", lineKey: "a", cents: 1500, alikeCents: 5000 });
    expect(check.usualCents).toBeUndefined();
    expect(check.text).toBe('Check this amount: "fifteen" or "fifty"? This says $15.00; it could be $50.00. No past invoices for this item yet.');
    expect(check.text).not.toMatch(/usually/i);
  });

  it("flags thirty the other way, and digits the same as words", () => {
    expect(day1("Hose bib, thirty.", item("Hose bib", 3000))[0]).toMatchObject({ kind: "alike", alikeCents: 1300 });
    expect(day1("Hose bib $30.", item("Hose bib", 3000))[0]).toMatchObject({ kind: "alike", alikeCents: 1300 });
    expect(day1("Two hours at seventeen an hour.", item("Helper", 1700, 2000))[0]).toMatchObject({ kind: "alike", alikeCents: 7000 });
  });

  it("flags the sample job's element on a book with nothing in it, and its labor rate, which sounds like eighteen", () => {
    const checks = findChecks({ ...base, flags: [], book: [] });
    expect(checks.map((check) => [check.kind, check.cents, check.alikeCents])).toEqual([
      ["alike", 8000, 1800],
      ["alike", 1500, 5000],
    ]);
  });

  it("doesn't flag an amount with no sound-alike", () => {
    const cases: [string, number][] = [
      ["Wax ring, twelve dollars.", 1200],
      ["Wax ring, twenty dollars.", 2000],
      ["Wax ring, fifty five dollars.", 5500],
      ["Wax ring, fifteen fifty.", 1550],
      ["Wax ring, a hundred and fifty dollars.", 15000],
      ["Wax ring, fifteen hundred dollars.", 150000],
      ["Wax ring $15.50.", 1550],
      ["Wax ring, one forty.", 14000],
    ];
    for (const [transcript, cents] of cases) expect(day1(transcript, item("Mystery part", cents)), transcript).toEqual([]);
  });

  it("doesn't flag a price that wasn't said that way: the unheard check covers it", () => {
    expect(day1("Sump pump, put it in.", item("Sump pump", 1500)).map((check) => check.kind)).toEqual(["unheard"]);
  });

  it("with history, keeps the book's catch, sourced, instead", () => {
    const checks = findChecks({ ...base, flags: [] });
    expect(checks.map((check) => check.kind)).toEqual(["far"]);
    expect(checks[0].text).toContain("Usually $50.00");
  });

  it("with history that agrees, says nothing", () => {
    expect(day1("Labor, an hour at eighty an hour.", item("Labor", 8000), book)).toEqual([]);
  });

  it("closes when the person keeps it or picks the other reading", () => {
    const lines = item("Sump pump", 1500);
    const checks = day1("Sump pump, fifteen dollars.", lines);
    expect(openChecks(checks, checks.map((check) => check.id))).toEqual([]);
    expect(day1("Sump pump, fifteen dollars.", item("Sump pump", 5000)).filter((check) => check.kind === "alike")).toEqual([]);
  });
});

describe("a misheard quantity, held against the trade's PayPal invoices", () => {
  // Six past PayPal invoices, each with one heating element at about $50: the seeded history's shape.
  const paypalBook = (quantities: number[] | undefined, invoices = 6): PriceEntry[] => [
    ...book.filter((entry) => entry.id !== "heating element"),
    { id: "heating element", name: "Heating element", samples: [5000, 5000, 5000, 5200, 5000, 5000].slice(0, invoices), source: "learned", updatedAt: "now", paypal: { invoices, lastCents: 5000, lastAt: "2026-11-03", ...(quantities ? { quantities } : {}) } },
  ];
  const ones = [1000, 1000, 1000, 1000, 1000, 1000];
  const withCount = (quantityMilli: number) => sample.lines.map((line) => (line.key === element.key ? { ...line, unitCents: 5000, quantityMilli } : line));
  const transcript = "Derek Evans. Three quarters of an hour at eighty an hour, ten heating element at fifty dollars. No tax.";
  const run = (quantityMilli: number, quantities: number[] | null = ones, invoices = 6) => findChecks({ ...base, transcript, flags: [], heardLines: withCount(quantityMilli), lines: withCount(quantityMilli), book: paypalBook(quantities ?? undefined, invoices) });

  it("flags ten when every PayPal invoice had one, with where that comes from", () => {
    const checks = run(10_000);
    expect(checks.map((check) => check.kind)).toEqual(["qty"]);
    expect(checks[0].text).toBe("Quantity: usually 1, on all 6 PayPal invoices (last $50.00 each). This says 10.");
    expect(checks[0].usualQuantityMilli).toBe(1000);
    expect(checks[0].lineKey).toBe(element.key);
  });

  it("is clear once the count is put back, or when the person keeps it", () => {
    expect(run(1000)).toEqual([]);
    const checks = run(10_000);
    expect(openChecks(checks, checks.map((check) => check.id))).toEqual([]);
  });

  it("leaves a plausible count alone: two of an item usually bought one at a time", () => {
    expect(run(2000)).toEqual([]);
  });

  it("says nothing when the PayPal invoices didn't all have the same count", () => {
    expect(run(10_000, [1000, 1000, 2000, 1000, 1000, 1000])).toEqual([]);
  });

  it("says nothing with too few invoices, or a history read before quantities were kept", () => {
    expect(run(10_000, [1000], 1).filter((check) => check.kind === "qty")).toEqual([]); // one invoice: the price's own day-one check may still speak
    expect(run(10_000, null)).toEqual([]);
    expect(findChecks({ ...base, transcript, flags: [], heardLines: withCount(10_000), lines: withCount(10_000) })).toEqual([]); // demo prices only
  });

  it("never checks labor hours: they have no PayPal history here", () => {
    const labor = sample.lines[0];
    const lines = sample.lines.map((line) => (line.key === labor.key ? { ...line, quantityMilli: 10_000 } : line));
    expect(findChecks({ ...base, transcript, flags: [], heardLines: lines, lines, book: paypalBook(ones) }).filter((check) => check.kind === "qty")).toEqual([]);
  });
});
