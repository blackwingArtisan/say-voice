import { describe, expect, it } from "vitest";
import { saidAtFrom, saidToSentText, secondsBetween } from "@/lib/say/said-to-sent";

describe("said to sent", () => {
  const received = new Date("2026-11-09T15:00:30.000Z");

  it("counts whole seconds from the words reaching the app to the send", () => {
    expect(secondsBetween("2026-11-09T15:00:00.000Z", "2026-11-09T15:00:48.400Z")).toBe(48);
    expect(secondsBetween("2026-11-09T15:00:00.000Z", "2026-11-09T14:59:59.000Z")).toBe(0);
  });

  it("says it in seconds, then minutes", () => {
    expect(saidToSentText(48)).toBe("Said to sent: 48 s");
    expect(saidToSentText(60)).toBe("Said to sent: 1 min");
    expect(saidToSentText(125)).toBe("Said to sent: 2 min 5 s");
  });

  it("starts when the recording arrived, if that was in the last half hour", () => {
    expect(saidAtFrom("2026-11-09T15:00:20.000Z", received)).toBe("2026-11-09T15:00:20.000Z");
  });

  it("starts from this request for a take kept on the phone and read later, a time in the future, or none", () => {
    expect(saidAtFrom("2026-11-09T14:20:00.000Z", received)).toBe(received.toISOString());
    expect(saidAtFrom("2026-11-09T15:05:00.000Z", received)).toBe(received.toISOString());
    expect(saidAtFrom(undefined, received)).toBe(received.toISOString());
    expect(saidAtFrom("not a time", received)).toBe(received.toISOString());
  });
});
