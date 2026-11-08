import { describe, expect, it } from "vitest";
import { checkedJob, type Draft } from "@/components/say/confirm";
import { inputProblems, priceProblem, quantityProblem, sendBlockedBy, taxProblem } from "@/lib/say/line-input";
import { computeTotals } from "@/lib/say/money";

const draft = (lines: { quantity: string; price: string; name?: string }[], extra: Partial<Draft> = {}): Draft => ({
  customer: { name: "Derek Evans", email: "derek.evans@example.com" },
  lines: lines.map((l, i) => ({ key: `k${i}`, name: l.name ?? `Item ${i + 1}`, quantity: l.quantity, price: l.price, description: "x", taxed: true })),
  taxPercent: "0",
  details: { summary: "", site: "", serviceDate: "" },
  dueDate: "2026-11-22",
  acknowledged: [],
  ...extra,
});

describe("a price the person typed", () => {
  it.each([
    ["", "Enter a price."],
    ["-80", "can't be below $0"],
    ["0", "above $0"],
    ["0.00", "above $0"],
    ["99999999999", "more than $100,000.00"],
    ["100000.01", "more than $100,000.00"],
    ["abc", '"abc" isn\'t a price'],
    ["12.345", "to the cent"],
    ["1e9", "isn't a price"],
  ])("%j is refused in plain words", (raw, words) => {
    expect(priceProblem(raw)).toContain(words);
  });

  it.each(["80", "80.00", "$80", "1,250.50", " 15 "])("%j is a price", (raw) => {
    expect(priceProblem(raw)).toBeNull();
  });
});

describe("a quantity the person typed", () => {
  it.each([
    ["", "Enter a quantity"],
    ["0", "above 0"],
    ["-3", "can't be below 0"],
    ["1e9", "isn't a quantity"],
    ["99999999999", "more than 10,000"],
    ["10001", "more than 10,000"],
    ["two", "isn't a quantity"],
  ])("%j is refused in plain words", (raw, words) => {
    expect(quantityProblem(raw)).toContain(words);
  });

  it.each(["1", "0.75", "2.5", "10000"])("%j is a quantity", (raw) => {
    expect(quantityProblem(raw)).toBeNull();
  });
});

describe("tax rate", () => {
  it("blank is no tax, a percent sign is fine, nonsense is named", () => {
    expect(taxProblem("")).toBeNull();
    expect(taxProblem("7%")).toBeNull();
    expect(taxProblem("-5")).toContain("below 0%");
    expect(taxProblem("150")).toContain("isn't a sales tax rate");
    expect(taxProblem("seven")).toContain("isn't a tax rate");
  });
});

describe("no line is ever dropped from a total", () => {
  it("names the line and the field on the Send bar, and holds the send", () => {
    const d = draft([{ quantity: "0.75", price: "80" }, { quantity: "1", price: "-15" }]);
    const problems = inputProblems(d);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ field: "price", line: 2, lineKey: "k1" });
    expect(sendBlockedBy(problems)).toBe("Fix the price on line 2");
    expect(checkedJob(d)).toBeNull();
  });

  it("counts every problem, first one first", () => {
    const problems = inputProblems(draft([{ quantity: "0", price: "abc" }, { quantity: "1", price: "" }]));
    expect(problems.map((p) => `${p.line}:${p.field}`)).toEqual(["1:quantity", "1:price", "2:price"]);
    expect(sendBlockedBy(problems)).toBe("Fix the quantity on line 1 (and 2 more)");
  });

  it.each([["-80"], ["0"], ["99999999999"], ["abc"], [""]])("a price of %j never reaches the server as a smaller total", (price) => {
    expect(checkedJob(draft([{ quantity: "1", price: "60" }, { quantity: "1", price }]))).toBeNull();
  });

  it("a bad email or a missing due date is named too, not a silent grey button", () => {
    expect(sendBlockedBy(inputProblems(draft([{ quantity: "1", price: "60" }], { customer: { name: "Jo", email: "notanemail" } })))).toBe("Fix the customer email");
    expect(sendBlockedBy(inputProblems(draft([{ quantity: "1", price: "60" }], { dueDate: "" })))).toBe("Pick a due date");
    expect(sendBlockedBy(inputProblems(draft([{ quantity: "1", price: "60", name: " " }])))).toBe("Fix the name on line 1");
  });

  it("when every line is valid, the job sent is exactly the lines shown and adds up to their sum", () => {
    const d = draft([{ quantity: "0.75", price: "80" }, { quantity: "1", price: "50" }, { quantity: "3", price: "10.10" }], { taxPercent: "7.25" });
    const job = checkedJob(d)!;
    expect(job.lines).toHaveLength(3);
    const totals = computeTotals(job.lines, job.taxRateMilli);
    expect(totals.subtotalCents).toBe(totals.lines.reduce((sum, l) => sum + l.lineCents, 0));
    expect(totals.subtotalCents).toBe(6000 + 5000 + 3030);
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.taxCents);
  });
});
