import { describe, expect, it } from "vitest";
import { amountIn, fit, spoken, toEdited, words } from "../../demo/voiceover";

describe("the demo's voiceover.json", () => {
  const cuts = [
    { fromMs: 0, toMs: 2_000 },
    { fromMs: 20_000, toMs: 30_000 },
  ];

  it("puts each line at its time in the edited video, after the cuts", () => {
    const lines = toEdited([{ shot: 2, rawMs: 13_000, text: "a" }, { shot: 4, rawMs: 35_000, text: "b" }], cuts, 9);
    expect(lines).toEqual([
      { shot: 2, at: 11, text: "a" },
      { shot: 4, at: 23, text: "b" },
    ]);
  });

  it("never starts while the job is being spoken, and keeps the lines in order", () => {
    expect(toEdited([{ shot: 2, rawMs: 8_000, text: "a" }, { shot: 3, rawMs: 21_000, text: "b" }], cuts, 9).map((l) => l.at)).toEqual([9, 18]);
  });

  it("lets the opening line, said before the record press, keep its time; the rest still wait for the spoken job", () => {
    const lines = toEdited([{ shot: 1, rawMs: 2_500, text: "a" }, { shot: 2, rawMs: 8_000, text: "b" }], cuts, 9, 4);
    expect(lines.map((l) => l.at)).toEqual([0.5, 9]);
  });

  it("says when a line runs past the next one at 15 characters a second", () => {
    const lines = [
      { shot: 1, at: 10, text: "x".repeat(75) },
      { shot: 2, at: 14, text: "Short. Fits." },
    ];
    expect(words("One two three")).toBe(3);
    expect(fit(lines, 20)).toEqual([
      { shot: 1, need: 5, room: 4, fits: false },
      { shot: 2, need: 0.8, room: 6, fits: true },
    ]);
  });

  it("reads amounts off the screen and says whole dollars short", () => {
    expect(amountIn("Use $50.00")).toBe("$50.00");
    expect(spoken("$50.00")).toBe("$50");
    expect(spoken("$472.03")).toBe("$472.03");
    expect(amountIn("no money here")).toBeUndefined();
  });
});
