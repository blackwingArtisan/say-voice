import { describe, expect, it } from "vitest";
import { dueFromTranscript, localDay } from "@/lib/say/due";
import { flagsToShow, linkFlags } from "@/lib/say/flags";
import { findMissingAmounts, findNumbers, heardFor } from "@/lib/say/spoken";

const line = (quantity: number, dollars: number) => ({ quantityMilli: quantity * 1000, unitCents: dollars * 100 });
const value = (text: string) => findNumbers(text).map((m) => m.value);

describe("reading numbers", () => {
  it("reads digits, words and trade shorthand", () => {
    expect(value("$1,250 and eighty-five and a hundred and ten")).toEqual([1250, 85, 110]);
    expect(value("flat labor one forty")).toEqual([140]);
    expect(value("fourteen hundred")).toEqual([1400]);
    expect(value("twelve fifty each")).toEqual([12.5]);
    expect(findNumbers("six seventy five")[0]).toMatchObject({ value: 675, alternative: 6.75 });
    expect(findNumbers("call at 1:20.")[0]).toMatchObject({ value: 120 });
  });

  it("doesn't read across punctuation", () => {
    expect(value("Flat labor one fifty. Four steel brackets")).toEqual([150, 4]);
  });

  it("tells prices from counts", () => {
    const amounts = (text: string) => findNumbers(text).filter((m) => m.isAmount).map((m) => m.value);
    expect(amounts("Six hours at 60 an hour.")).toEqual([60]);
    expect(amounts("Four boards at $17 each.")).toEqual([17]);
    expect(amounts("the 15 amp ones at $12 each. Tax is 8%.")).toEqual([12]);
    expect(amounts("roof leak at 12 Oak Lane")).toEqual([]);
    expect(amounts("It was a 1,000-gallon tank")).toEqual([]);
    expect(amounts("at 16 hour")).toEqual([16]);
  });
});

describe("spoken amounts with no line item", () => {
  it("warns and names the amount", () => {
    const missing = findMissingAmounts("Two hours at 90 an hour, and a service call, sixty dollars.", [line(2, 90)], 0);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ cents: 6000, heard: "sixty" });
    expect(missing[0].excerpt).toContain("sixty dollars");
  });

  it("stays quiet when every amount is on the invoice", () => {
    expect(findMissingAmounts("Three hours at 50 an hour. Two gallons of sealer at $80 a gallon. Taxes 5%.", [line(3, 50), line(2, 80)], 5000)).toEqual([]);
  });

  it("accepts a stated total", () => {
    expect(findMissingAmounts("Labor $100. Total is $108 dollars.", [line(1, 100)], 8000)).toEqual([]);
  });

  it("ignores an amount the speaker took back", () => {
    expect(findMissingAmounts("Two hours labor at 80 an hour, no wait, 90 an hour.", [line(2, 90)], 0)).toEqual([]);
  });
});

describe("the words beside each price", () => {
  it("finds the corrected price", () => {
    const heard = heardFor("New heating element, fifteen. No wait, make that fifteen dollars. No tax.", line(1, 15));
    expect(heard).toContain("make that fifteen dollars");
  });

  it("shows the trap: a sixty heard as 16", () => {
    expect(heardFor("Two hours at 16 hour for the leak.", line(2, 16))).toContain("at 16 hour");
    expect(heardFor("Two hours at 16 hour for the leak.", line(2, 60))).toBeNull();
  });
});

describe("flags", () => {
  const lines = [
    { name: "Labor", unitCents: 8000 },
    { name: "Heating element", unitCents: 1500 },
  ];

  it("ties a flag to the item it names", () => {
    expect(linkFlags(["Heating element price said as fifteen, possibly fifty; used $15"], lines)[0].line).toBe(1);
  });

  it("ties a flag to the amount when no item is named", () => {
    expect(linkFlags(["The $15 could be $50"], lines)[0].line).toBe(1);
  });

  it("keeps a money flag that isn't about one row", () => {
    expect(flagsToShow(["Tax of 6 percent may be 16 percent"], lines)).toEqual([{ text: "Tax of 6 percent may be 16 percent", line: null }]);
  });

  it("drops doubts about the heard name, which the picker settles", () => {
    expect(flagsToShow(["Customer name 'Pluck' may be misheard; check spelling"], lines)).toEqual([]);
  });
});

describe("due date", () => {
  it("reads common spoken terms", () => {
    expect(dueFromTranscript("Net 30 on this one.", "2026-11-01")).toEqual({ date: "2026-12-01", said: true });
    expect(dueFromTranscript("Payment due in two weeks.", "2026-11-01")).toEqual({ date: "2026-11-15", said: true });
    expect(dueFromTranscript("Due on receipt.", "2026-11-01")).toEqual({ date: "2026-11-01", said: true });
  });

  it("uses the person's day when UTC has already rolled over", () => {
    const evening = new Date(2026, 10, 1, 23, 30);
    expect(localDay(evening)).toBe("2026-11-01");
  });

  it("defaults to 14 days and says so", () => {
    expect(dueFromTranscript("Two hours at 90 an hour.", "2026-11-01")).toEqual({ date: "2026-11-15", said: false });
  });
});
