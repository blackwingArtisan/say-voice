import { describe, expect, it } from "vitest";
import { isFlatLabor } from "@/lib/say/checks";
import { farFromUsual, findEntry, itemKey, learned, MIN_SAMPLES, soundAlike, usualCents, type PriceEntry } from "@/lib/say/price-book";
import { SEED_PRICES } from "@/lib/say/sample";

const entry = (name: string, samples: number[]): PriceEntry => ({ id: itemKey(name), name, samples, source: "seed", updatedAt: "2026-11-01" });
const book = SEED_PRICES.map(({ name, samples }) => entry(name, samples));

describe("matching an item", () => {
  it("treats the small differences in a spoken name as one item", () => {
    for (const name of ["Heating element", "heating elements", "New heating element", "A replacement heating element"]) expect(findEntry(name, book)?.name).toBe("Heating element");
    expect(findEntry("Labour", book)?.name).toBe("Labor");
  });

  it("finds a known item inside a longer name", () => {
    expect(findEntry("Dryer heating element", book)?.name).toBe("Heating element");
  });

  it("leaves unknown items and flat labor alone", () => {
    expect(findEntry("Sump pump", book)).toBeUndefined();
    expect(findEntry("Flat rate labor", book)).toBeUndefined();
    expect(findEntry("", book)).toBeUndefined();
  });
});

describe("the usual price", () => {
  it("is the middle price, so one odd job can't move it", () => {
    expect(usualCents([5000, 5000, 1500])).toBe(5000);
    expect(usualCents([5000, 5200, 4800, 90000])).toBe(5100);
  });
});

describe("a far-off price", () => {
  const far = (name: string, unitCents: number) => farFromUsual({ name, unitCents }, book);

  it("catches fifteen said for a usual fifty, with no AI involved", () => {
    expect(far("Heating element", 1500)).toEqual({ usualCents: 5000, samples: 5 });
  });

  it("catches an hourly rate said as a teen", () => {
    expect(far("Labor", 1600)?.usualCents).toBe(8000);
  });

  it("catches every tens word said as its teen, and the reverse", () => {
    for (const dollars of [30, 40, 50, 60, 70, 80, 90]) {
      const teen = soundAlike(dollars * 100)!;
      expect(farFromUsual({ name: "Part", unitCents: teen.cents }, [entry("Part", [dollars * 100, dollars * 100])]), `${dollars}`).not.toBeNull();
      expect(farFromUsual({ name: "Part", unitCents: dollars * 100 }, [entry("Part", [teen.cents, teen.cents])]), `${dollars}`).not.toBeNull();
    }
  });

  it("catches a shorthand price read a hundred times out", () => {
    expect(far("Wax ring", 120_000)?.usualCents).toBe(1200);
  });

  it("leaves ordinary changes alone", () => {
    expect(far("Heating element", 5000)).toBeNull();
    expect(far("Heating element", 4000)).toBeNull();
    expect(far("Heating element", 6500)).toBeNull();
    expect(far("Labor", 9500)).toBeNull();
  });

  it("waits for enough invoices before it says anything", () => {
    expect(farFromUsual({ name: "Part", unitCents: 100 }, [entry("Part", [5000])])).toBeNull();
    expect(MIN_SAMPLES).toBe(2);
  });

  it("says nothing about items it doesn't know", () => {
    expect(far("Sump pump", 100)).toBeNull();
  });
});

describe("flat-rate labor", () => {
  const flat = (unitCents: number, transcript: string, quantityMilli = 1000, name = "Labor") => isFlatLabor({ name, quantityMilli, unitCents }, transcript);

  it("is a labor line for one, with no hours said around it", () => {
    expect(flat(20000, "Fixed the leak. Labor was two hundred.")).toBe(true);
    expect(flat(20000, "Flat rate two hundred for labor.")).toBe(true);
    expect(flat(20000, "Took two hours, two hundred flat.")).toBe(true);
  });

  it("is a flat sum said next to how long it took", () => {
    expect(flat(40000, "Pulled the rotten fascia and put up the new board, approximately three and a half hours, four hundred dollars labor.")).toBe(true);
    expect(flat(30000, "Took me about five hours, three hundred labor.")).toBe(true);
    expect(flat(9000, "Ninety bucks labor, about an hour.")).toBe(true);
  });

  it("isn't a rate said with the estimate", () => {
    expect(flat(1500, "About an hour of labor at fifteen an hour.")).toBe(false);
    expect(flat(1500, "Roughly an hour, fifteen an hour labor.")).toBe(false);
    expect(flat(1600, "Labor took about an hour, sixteen per hour.")).toBe(false);
  });

  it("isn't one hour at a rate, which is exactly where a wrong rate shows up", () => {
    expect(flat(1600, "I was there an hour at sixteen an hour.")).toBe(false);
    expect(flat(1600, "One hour of labor, sixteen.")).toBe(false);
  });

  it("isn't more than one, or anything but labor", () => {
    expect(flat(20000, "Labor was two hundred.", 2000)).toBe(false);
    expect(flat(20000, "Service call two hundred.", 1000, "Service call")).toBe(false);
  });
});

describe("sound-alike prices", () => {
  it("pairs teens with tens, both ways", () => {
    expect(soundAlike(1500)).toEqual({ cents: 5000, heard: "fifteen", said: "fifty" });
    expect(soundAlike(6000)).toEqual({ cents: 1600, heard: "sixty", said: "sixteen" });
  });

  it("ignores everything else", () => {
    for (const cents of [1200, 2000, 1550, 10000]) expect(soundAlike(cents)).toBeNull();
  });
});

describe("learning from a sent invoice", () => {
  it("adds to a known item and starts a new one", () => {
    const next = learned(book, [{ name: "New heating element", unitCents: 5100 }, { name: "Sump pump", unitCents: 21000 }], "now");
    expect(next.find((e) => e.name === "Heating element")?.samples).toEqual([4500, 5000, 5000, 5200, 5500, 5100]);
    expect(next.find((e) => e.name === "Sump pump")).toMatchObject({ samples: [21000], source: "learned" });
  });

  it("counts an item twice when it's on the invoice twice", () => {
    const next = learned([], [{ name: "Fitting", unitCents: 300 }, { name: "Fittings", unitCents: 400 }], "now");
    expect(next).toHaveLength(1);
    expect(next[0].samples).toEqual([300, 400]);
  });
});
