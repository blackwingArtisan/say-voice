import { describe, expect, it } from "vitest";
import { mockWordsIn, notLive, requireLive } from "../../demo/live-guard";

describe("the demo's live check (DEMO_REQUIRE_LIVE=1)", () => {
  it("finds mock and simulated on a screen, whole words only", () => {
    expect(mockWordsIn("Heard by Speech mock. Read by AI mock.")).toHaveLength(2);
    expect(mockWordsIn("A simulated payment")).toEqual(["A simulated payment"]);
    expect(mockWordsIn("PayPal Mock mode")).toHaveLength(1);
    expect(mockWordsIn("Hammock, mockingbird, Heating element $50.00, Claude Sonnet 5.5")).toEqual([]);
  });

  it("names everything that isn't live, including a computer voice", () => {
    const live = { ai: { mode: "live" }, speech: { mode: "live" }, paypal: { mode: "sandbox" } };
    expect(notLive(live, false)).toEqual([]);
    expect(notLive({ ai: { mode: "mock" }, speech: { mode: "mock" }, paypal: { mode: "mock" } }, true)).toEqual(["AI is mock", "speech is mock", "PayPal is mock", "the voice is the computer placeholder (set DEMO_VOICE)"]);
  });

  it("is on only with DEMO_REQUIRE_LIVE=1", () => {
    expect(requireLive({ DEMO_REQUIRE_LIVE: "1" })).toBe(true);
    expect(requireLive({})).toBe(false);
    expect(requireLive({ DEMO_REQUIRE_LIVE: "0" })).toBe(false);
  });
});
