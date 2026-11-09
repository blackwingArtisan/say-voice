import { describe, expect, it } from "vitest";
import { inventedWords } from "@/lib/say/wording";
import { SAMPLE_TRANSCRIPT } from "@/lib/say/sample";
import { WORDY_DESCRIPTION, WORDY_TRANSCRIPT } from "@/lib/say/sample-wordy";

const check = (text: string, transcript = SAMPLE_TRANSCRIPT) => inventedWords(text, text, transcript);

describe("a fair way to say what was said isn't an invented word", () => {
  it("lets the sample's 'new heating element' read as a replaced one", () => {
    expect(check("Replaced the heating element on the dryer")).toEqual([]);
    expect(check("Swapped in a new heating element; tested, it runs hot again")).toEqual([]);
  });

  it("allows 'tested' when the speaker said it works, runs or heats", () => {
    expect(check("Replaced the drain pump and tested it", "New drain pump, eighty five. It drains fine now.")).toEqual([]);
  });
});

describe("words that weren't said are still caught", () => {
  it("catches a part or a job the speaker never named, beside a fair verb", () => {
    expect(check("Replaced the heating element and the thermal fuse, cleaned the lint trap")).toEqual(expect.arrayContaining(["thermal", "fuse", "lint", "trap"]));
    expect(check("Replaced the heating element and the thermal fuse, cleaned the lint trap")).not.toContain("replaced");
  });

  it("catches 'replaced' when nothing new was said, and 'tested' when nothing was said to work", () => {
    expect(check("Replaced the belt", "Dryer squealing, adjusted the belt tension, an hour.")).toContain("replaced");
    expect(check("Tested the igniter", "Igniter, forty two dollars, an hour of labor.")).toContain("tested");
  });

  it("still gives each line of the wordy fixture a note, so the e2e test has two to clear", () => {
    expect(check(WORDY_DESCRIPTION.lines.Labor, WORDY_TRANSCRIPT)).toEqual(expect.arrayContaining(["diagnosed", "thermal", "fuse"]));
    expect(check(WORDY_DESCRIPTION.lines["Heating element"], WORDY_TRANSCRIPT)).toEqual(expect.arrayContaining(["terminal", "block"]));
    expect(check(WORDY_DESCRIPTION.lines["Heating element"], WORDY_TRANSCRIPT)).not.toContain("installed");
  });
});
