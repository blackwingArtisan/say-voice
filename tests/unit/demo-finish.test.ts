import { describe, expect, it } from "vitest";
import { cutBefore, keep } from "../../scripts/demo-finish";

describe("demo finisher cuts", () => {
  it("takes each wait out of the span it falls in", () => {
    const cuts = [{ fromMs: 2000, toMs: 5000 }, { fromMs: 8000, toMs: 9000 }];
    expect(keep({ fromMs: 0, toMs: 10_000 }, cuts)).toEqual([
      { fromMs: 0, toMs: 2000 },
      { fromMs: 5000, toMs: 8000 },
      { fromMs: 9000, toMs: 10_000 },
    ]);
    expect(keep({ fromMs: 3000, toMs: 6000 }, cuts)).toEqual([{ fromMs: 5000, toMs: 6000 }]);
    expect(keep({ fromMs: 5000, toMs: 8000 }, cuts)).toEqual([{ fromMs: 5000, toMs: 8000 }]);
  });

  it("moves a moment earlier by what was cut before it", () => {
    const cuts = [{ fromMs: 2000, toMs: 5000 }, { fromMs: 8000, toMs: 9000 }];
    expect(cutBefore(1000, cuts)).toBe(0);
    expect(cutBefore(3000, cuts)).toBe(1000);
    expect(cutBefore(7000, cuts)).toBe(3000);
    expect(cutBefore(20_000, cuts)).toBe(4000);
  });
});
