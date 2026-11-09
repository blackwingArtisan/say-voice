import { describe, expect, it } from "vitest";
import { saidSize } from "@/lib/say/said";

describe("how much was said", () => {
  it("counts the words and the length of the recording", () => {
    expect(saidSize({ transcript: "Replaced the heating element, fifty bucks.", speech: { mocked: false, model: "speech", durationSec: 23.6 } })).toBe("6 words in 0:24");
    expect(saidSize({ transcript: "  one  ", speech: { mocked: false, model: "speech", durationSec: 59.6 } })).toBe("1 word in 1:00");
  });
  it("leaves the length out when there's no recording length", () => {
    expect(saidSize({ transcript: "a b c" })).toBe("3 words");
  });
});
