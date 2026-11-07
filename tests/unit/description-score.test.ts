import { describe, expect, it } from "vitest";
import { keyWords, missingFrom, unsaid } from "../../scripts/description-score";

const SAID = "Rebuilt the deck stairs, cut out the rotted stringer, set new treads. Parts were two pressure-treated stringers and a box of deck screws, ninety.";

describe("the description dev score", () => {
  it("checks a phrase by its key nouns, ignoring case, plurals and hyphens", () => {
    expect(keyWords("two pressure-treated stringers", SAID).keys).toEqual(["pressure", "stringers"]);
    expect(missingFrom("Pressure treated stringer x2, box of deck screw", "two pressure-treated stringers", SAID)).toEqual([]);
    expect(missingFrom("Box of deck screws", "two pressure-treated stringers", SAID)).toEqual(["pressure", "stringers"]);
  });

  it("doesn't ask for a word the speaker never said, and falls back to the verb when there's no noun", () => {
    expect(keyWords("cut out the rotted section", SAID)).toEqual({ keys: ["cut", "rotted"], unsaid: ["section"] });
    expect(missingFrom("Cut out the rotted stringer", "cut out the rotted section", SAID)).toEqual([]);
  });

  it("finds words that weren't said, on its own reading", () => {
    expect(unsaid("Replaced the deck stairs and stained them", SAID)).toEqual(["replaced", "stained"]);
    expect(unsaid("Set new treads, labor about 3 hours", SAID)).toEqual([]);
  });
});
