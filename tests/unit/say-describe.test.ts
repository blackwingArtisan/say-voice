import { describe, expect, it } from "vitest";
import { invoiceNote, invoiceRequest, ITEM_DESCRIPTION_MAX, NOTE_MAX } from "@/agents/tools/send-job-invoice";
import { MockPayPal } from "@/lib/paypal/mock";
import { findChecks, openChecks, type CheckInput } from "@/lib/say/checks";
import { applyDescription, describeJob, DESCRIBE_SYSTEM, mockDescription, type Description } from "@/lib/say/describe";
import { toJobFields } from "@/lib/say/extract";
import { computeTotals } from "@/lib/say/money";
import { PLUS_TAX_AMOUNTS, PLUS_TAX_EXTRACTION, PLUS_TAX_TRANSCRIPT, SAMPLE_EXTRACTION, SAMPLE_TRANSCRIPT } from "@/lib/say/sample";
import { rateChoices, rateWasSaid, stateFor, taxedLineKeys, taxSaid } from "@/lib/say/tax";
import type { JobLine } from "@/lib/say/types";
import { cleanText, isGenericName, truncate, unsaidWords } from "@/lib/say/wording";

const TODAY = "2026-11-06";
const TRANSCRIPT = "Replaced the kitchen faucet cartridge at 41 Elm Court yesterday. The cartridge was thirty-five dollars and labor was ninety for the hour.";
const lines: JobLine[] = [
  { key: "a1", name: "Faucet cartridge", quantityMilli: 1000, unitCents: 3500 },
  { key: "b2", name: "Labor", quantityMilli: 1000, unitCents: 9000 },
];
const good: Description = {
  job_summary: "Um, kitchen faucet cartridge replaced",
  job_site: "41 Elm Court",
  service_date: "2026-11-05",
  service_date_words: "yesterday",
  lines: [
    { id: "a1", description: "New kitchen faucet cartridge" },
    { id: "b2", description: "Replaced the faucet cartridge, uh, one hour" },
  ],
};
const apply = (out: Partial<Description>, transcript = TRANSCRIPT) => applyDescription({ ...good, ...out }, lines, transcript, TODAY);

describe("the description step", () => {
  it("has its own prompt and a mock fixture that reads the sample clearly", async () => {
    expect(DESCRIBE_SYSTEM).toContain("Never add work, parts");
    const sample = toJobFields(SAMPLE_EXTRACTION);
    const done = await describeJob(SAMPLE_TRANSCRIPT, sample.lines, TODAY);
    expect(done.ai).toMatchObject({ mocked: true, costUsd: 0 });
    expect(done.details.summary).toMatch(/dryer/i);
    expect(done.lines.every((line) => line.description)).toBe(true);
    expect(done.flags).toEqual([]);
    const checks = findChecks({ transcript: SAMPLE_TRANSCRIPT, heardLines: done.lines, flags: [], lines: done.lines, taxRateMilli: 0, book: [], details: done.details, aiWording: done.aiWording });
    expect(checks).toEqual([]);
  });

  it("merges only text onto the lines it was given: it can't add, remove or change an item", () => {
    const out = apply({ lines: [...good.lines, { id: "zz", description: "Extra item" }, { id: "a1", description: "Second try" }] });
    expect(out.lines).toHaveLength(2);
    out.lines.forEach((line, i) => expect({ ...line, description: undefined }).toEqual({ ...lines[i], description: undefined }));
    expect(out.lines[0].description).toBe("New kitchen faucet cartridge");
  });

  it("leaves a line it skipped without a description", () => {
    expect(apply({ lines: [good.lines[0]] }).lines[1].description).toBe("");
  });

  it("strips fillers", () => {
    const out = apply({});
    expect(out.details.summary).toBe("Kitchen faucet cartridge replaced");
    expect(out.lines[1].description).toBe("Replaced the faucet cartridge, one hour");
    expect(cleanText("Um, remove shingles, um, rebase. Mm-hmm.")).toBe("Remove shingles, rebase.");
    expect(cleanText("uh, uhh hmm put in the liner")).toBe("Put in the liner");
  });

  it("blanks a description with a link, and says so", () => {
    const out = apply({ lines: [{ id: "a1", description: "Cartridge, see www.example.com" }, good.lines[1]] });
    expect(out.lines[0].description).toBe("");
    expect(out.flags[0]).toMatchObject({ lineKey: "a1" });
    expect(out.flags[0].text).toContain("a link");
    expect(apply({ job_summary: "Faucet https://x.io" }).details.summary).toBe("");
  });

  it("blanks a money amount or number that wasn't said and isn't the line's own", () => {
    const out = apply({ lines: [{ id: "a1", description: "Cartridge, $45 part" }, { id: "b2", description: "Two hours on the faucet" }] });
    expect(out.lines.map((l) => l.description)).toEqual(["", ""]);
    expect(out.flags.map((f) => f.lineKey)).toEqual(["a1", "b2"]);
    // The line's own price and a number said in the transcript are fine.
    const ok = apply({ lines: [{ id: "a1", description: "Cartridge, $35" }, { id: "b2", description: "1 hour at 41 Elm Court" }] });
    expect(ok.lines.map((l) => l.description)).toEqual(["Cartridge, $35", "1 hour at 41 Elm Court"]);
    expect(apply({ job_site: "99 Elm Court" }).details.site).toBe("");
  });

  it("reads 'three and a half' and '66 th' the way a person wrote them", () => {
    const transcript = "Worked at 12 66 th Street about three and a half hours, two hundred flat.";
    const one: JobLine[] = [{ key: "x", name: "Labor", quantityMilli: 1000, unitCents: 20000 }];
    const out = applyDescription({ ...good, job_site: "12 66th Street", lines: [{ id: "x", description: "About 3.5 hours" }] }, one, transcript, TODAY);
    expect(out.details.site).toBe("12 66th Street");
    expect(out.lines[0].description).toBe("About 3.5 hours");
  });

  it("keeps a service date only when it was said", () => {
    expect(apply({}).details.serviceDate).toBe("2026-11-05");
    expect(apply({ service_date_words: "" }).details.serviceDate).toBe("");
    expect(apply({}, TRANSCRIPT.replace(" yesterday", "")).details.serviceDate).toBe("");
    expect(apply({ service_date_words: "the faucet" }).details.serviceDate).toBe("");
    expect(apply({ service_date: "2027-02-30" }).details.serviceDate).toBe("");
  });

  it("falls back to the words heard by each price on mock AI", () => {
    const out = mockDescription("Fixed the sink. New trap, twelve dollars.", [{ key: "t", name: "Trap", quantityMilli: 1000, unitCents: 1200 }], TODAY);
    expect(out.lines[0]).toEqual({ id: "t", description: "New trap, twelve dollars." });
    expect(out.job_summary).toBe("Fixed the sink.");
  });

  it("cuts long text at a word, never mid-word", () => {
    const cut = truncate("word ".repeat(100).trim(), 50);
    expect(cut.length).toBeLessThanOrEqual(50);
    expect(cut).toMatch(/word…$/);
  });
});

describe("words the speaker didn't say", () => {
  const described = apply({ lines: [{ id: "a1", description: "New kitchen faucet cartridge and supply hoses" }, { id: "b2", description: "Replaced the cartridge, flushed the aerator" }] });
  const input: CheckInput = { transcript: TRANSCRIPT, heardLines: described.lines, flags: [], lines: described.lines, taxRateMilli: 0, book: [], details: described.details, aiWording: described.aiWording };

  it("flags an invented part and invented work on their rows", () => {
    const words = findChecks(input).filter((check) => check.kind === "words");
    expect(words.map((c) => [c.lineKey, c.text])).toEqual([
      ["a1", '"supply", "hoses" in the description weren\'t in what you said.'],
      ["b2", '"flushed", "aerator" in the description weren\'t in what you said.'],
    ]);
  });

  it("allows plurals, tenses and a one-letter sound-alike", () => {
    expect(unsaidWords("Replacing cartridges in the kitchn", TRANSCRIPT)).toEqual([]);
  });

  it("closes when the person takes the word out, and never flags words they typed", () => {
    const edited = described.lines.map((line) => (line.key === "a1" ? { ...line, description: "New kitchen faucet cartridge, brass" } : line));
    const checks = findChecks({ ...input, lines: edited }).filter((check) => check.kind === "words");
    expect(checks.map((c) => c.lineKey)).toEqual(["b2"]);
  });

  it("can be let stand", () => {
    const checks = findChecks(input);
    expect(openChecks(checks, checks.map((c) => c.id))).toEqual([]);
  });

  it("checks the summary and site too", () => {
    const out = apply({ job_summary: "Kitchen faucet and dishwasher", job_site: "41 Elm Court, Springfield" });
    const checks = findChecks({ ...input, details: out.details, aiWording: out.aiWording }).filter((c) => c.kind === "words" && !c.lineKey);
    expect(checks.map((c) => c.field)).toEqual(["summary", "site"]);
  });
});

describe("a vague line", () => {
  const vague: JobLine[] = [{ key: "m", name: "Materials", quantityMilli: 1000, unitCents: 20000 }];
  const input: CheckInput = { transcript: "Two hundred materials.", heardLines: vague, flags: [], lines: vague, taxRateMilli: 0, book: [] };

  it("knows the generic names, any case", () => {
    for (const name of ["Labor", "materials", "MATERIAL", "Misc", "Parts", "Service call", "service", "Fee", "Other"]) expect(isGenericName(name)).toBe(true);
    for (const name of ["Heating element", "Valley liner", "Labor and materials"]) expect(isGenericName(name)).toBe(false);
  });

  it("holds the send until it has a description, and a tap can't settle it", () => {
    const [check] = findChecks(input);
    expect(check).toMatchObject({ kind: "vague", lineKey: "m" });
    expect(openChecks([check], [check.id])).toHaveLength(1);
    expect(findChecks({ ...input, lines: [{ ...vague[0], description: "Ice and water underlayment" }] })).toEqual([]);
    expect(findChecks({ ...input, lines: [{ ...vague[0], description: "   " }] })).toHaveLength(1);
  });
});

describe("tax said with no rate", () => {
  it("notices tax, but not 'no tax'", () => {
    expect(taxSaid("Part was fifty plus tax.")).toBe(true);
    expect(taxSaid(SAMPLE_TRANSCRIPT)).toBe(false);
    expect(taxSaid("Tax exempt, it's a church.")).toBe(false);
    expect(taxSaid("Labor was eighty.")).toBe(false);
  });

  it("matches the state, with Iowa heard as lowa, and never by a near spelling", () => {
    expect(stateFor("plus tax for lowa")?.name).toBe("Iowa");
    expect(stateFor("plus Iowa tax")?.name).toBe("Iowa");
    expect(stateFor("on the main line, plus tax")).toBeNull();
    expect(stateFor("plus tax, we're in New York")?.name).toBe("New York");
    expect(stateFor("plus tax")).toBeNull();
  });

  it("offers Iowa's state and local option rates, and nothing for a zero-rate state", () => {
    expect(rateChoices(stateFor("tax for lowa"))).toEqual([
      { rateMilli: 6000, label: "6% state" },
      { rateMilli: 7000, label: "7% state + local option" },
    ]);
    expect(rateChoices(stateFor("tax in Oregon"))).toEqual([]);
  });

  it("holds the send with one-tap rates until a rate is set or No tax is chosen", () => {
    const job = toJobFields(PLUS_TAX_EXTRACTION);
    const lines = job.lines.map((line) => ({ ...line, description: "As said" }));
    const input: CheckInput = { transcript: PLUS_TAX_TRANSCRIPT, heardLines: lines, flags: [{ text: "Tax rate for Iowa not stated" }], lines, taxRateMilli: 0, book: [] };
    const checks = findChecks(input);
    expect(checks).toHaveLength(1); // the AI's own note on tax is the same thing, so it doesn't count twice
    expect(checks[0]).toMatchObject({ kind: "tax", state: "Iowa" });
    expect(checks[0].text).toContain("Check your local rate");
    expect(findChecks({ ...input, taxRateMilli: 7000 })).toEqual([]); // and the AI's note stays quiet once a rate is chosen
    expect(openChecks(checks, ["tax:rate"])).toEqual([]);
  });

  it("drops a rate nobody said, so the AI never picks one", () => {
    expect(rateWasSaid("plus tax for Iowa", 6000)).toBe(false);
    expect(rateWasSaid("plus seven percent tax", 7000)).toBe(true);
    expect(rateWasSaid("tax at 8.25%", 8250)).toBe(true);
    expect(rateWasSaid("no tax", 0)).toBe(true);
  });

  it("taxes only the item 'plus tax' was said after", () => {
    const job = toJobFields(PLUS_TAX_EXTRACTION);
    const keys = taxedLineKeys(PLUS_TAX_TRANSCRIPT, job.lines);
    expect([...keys!]).toEqual([job.lines[0].key]);
    expect(taxedLineKeys("Pump eighty-five, labor seventy. Tax is seven percent.", job.lines)).toBeNull();
  });

  it("works the totals out by code, per line", () => {
    const part = { quantityMilli: 1000, unitCents: 32_900, taxed: true };
    const labor = { quantityMilli: 2000, unitCents: 6_000, taxed: false };
    expect(computeTotals([part, labor], 7000)).toMatchObject({ taxCents: 2303, totalCents: 47_203 });
    expect(computeTotals([part, labor], 6000)).toMatchObject({ taxCents: 1974, totalCents: 46_874 });
    // An old job has no taxed flag, and every line is taxed as before.
    expect(computeTotals([{ quantityMilli: 1000, unitCents: 32_900 }, { quantityMilli: 2000, unitCents: 6_000 }], 7000).taxCents).toBe(3143);
  });
});

describe("what PayPal gets", () => {
  const input = {
    customer_name: "Sam Lee",
    customer_email: "sam@example.com",
    lines: [
      { name: "Drain pump", quantityMilli: 1000, unitCents: 8500, description: "Drain pump for the washer", taxed: true },
      { name: "Labor", quantityMilli: 1500, unitCents: 7000, description: "Swapped the pump", taxed: false },
    ],
    tax_rate_milli: 7000,
    job_summary: "Washer drain pump swapped",
    job_site: "12 Oak Lane",
    service_date: "2026-10-30",
    due_date: "2026-11-20",
    total_cents: PLUS_TAX_AMOUNTS.total7Cents,
    idempotency_key: "job",
  };

  it("puts what, where and when in the note, and a description, date and tax on each item", () => {
    const request = invoiceRequest(input);
    expect(request.detail.note).toBe("Washer drain pump swapped\nJob site: 12 Oak Lane\nDate of service: October 30, 2026");
    expect(request.items[0]).toEqual({ name: "Drain pump", description: "Drain pump for the washer", quantity: "1", unit_amount: { currency_code: "USD", value: "85.00" }, item_date: "2026-10-30", tax: { name: "Sales tax", percent: "7" } });
    expect(request.items[1].tax).toBeUndefined();
  });

  it("leaves out what's empty, and keeps old jobs taxing every line", () => {
    const bare = invoiceRequest({ ...input, job_summary: undefined, job_site: undefined, service_date: undefined, lines: input.lines.map(({ name, quantityMilli, unitCents }) => ({ name, quantityMilli, unitCents })) });
    expect(bare.detail.note).toBeUndefined();
    expect(bare.items.every((item) => item.tax && !item.description && !item.item_date)).toBe(true);
  });

  it("stays inside PayPal's limits", () => {
    const long = invoiceRequest({ ...input, lines: [{ ...input.lines[0], description: "x ".repeat(800) }] });
    expect(long.items[0].description!.length).toBeLessThanOrEqual(ITEM_DESCRIPTION_MAX);
    expect(invoiceNote({ job_summary: "y ".repeat(3000) })!.length).toBeLessThanOrEqual(NOTE_MAX);
  });

  it("comes to the same total on the mock PayPal, tax on the pump only", async () => {
    const paypal = new MockPayPal();
    const draft = await paypal.invoicing.create(invoiceRequest(input));
    expect(draft.amount.value).toBe("195.95");
    expect(draft.amount.breakdown?.tax_total?.value).toBe("5.95");
    expect(draft.detail.note).toContain("12 Oak Lane");
    expect(draft.items[0].description).toBe("Drain pump for the washer");
  });
});
