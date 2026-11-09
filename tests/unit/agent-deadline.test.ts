import { afterEach, describe, expect, it, vi } from "vitest";
import { reminderAgent } from "@/agents/reminder";
import { logLine, type AgentRun } from "@/lib/agent/runs";
import { WorkClock } from "@/lib/agent/work-clock";
import { AI_CALL_DEADLINE_MS, AI_MAX_RETRIES, AI_REQUEST_TIMEOUT_MS, withDeadline } from "@/lib/ai/client";
import { AiTimeoutError } from "@/lib/ai/errors";
import { REMINDER_STALL_MS, runStalled } from "@/lib/say/reminder-rules";

const never = () => new Promise<never>(() => undefined);

afterEach(() => vi.useRealTimers());

describe("an AI call can't hang", () => {
  it("waits 45 s a try, tries once more, and ends by 100 s whatever the SDK does", async () => {
    expect([AI_REQUEST_TIMEOUT_MS, AI_MAX_RETRIES, AI_CALL_DEADLINE_MS]).toEqual([45_000, 1, 100_000]);
    vi.useFakeTimers();
    const call = withDeadline(never(), AI_CALL_DEADLINE_MS, "agent turn 1");
    const failed = expect(call).rejects.toBeInstanceOf(AiTimeoutError);
    await vi.advanceTimersByTimeAsync(AI_CALL_DEADLINE_MS);
    await failed;
  });

  it("lets a call that answers through untouched", async () => {
    await expect(withDeadline(Promise.resolve("note"), 1_000, "agent turn 1")).resolves.toBe("note");
  });
});

describe("the reminder agent's work deadline", () => {
  it("is 100 s of model calls and reads", () => {
    expect(reminderAgent.workDeadlineMs).toBe(100_000);
  });

  it("stops a call that hangs once the run's time is used up, with a plain message", async () => {
    vi.useFakeTimers();
    const clock = new WorkClock(100_000, "Reminder agent, before it reached you");
    const hung = clock.time(never);
    const failed = expect(hung).rejects.toThrow(/didn't answer in time \(Reminder agent, before it reached you, 100 s\)/);
    await vi.advanceTimersByTimeAsync(100_000);
    await failed;
  });

  it("counts time across turns, so many slow turns stop too", async () => {
    let now = 0;
    const clock = new WorkClock(100_000, "Reminder agent", () => now);
    const turn = (ms: number) => clock.time(async () => {
      now += ms;
      return "ok";
    });
    await turn(40_000);
    await turn(40_000);
    expect(clock.remaining()).toBe(20_000);
    await turn(30_000); // ran past what was left; the next one doesn't start
    await expect(turn(1_000)).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it("has no limit when an agent sets none", async () => {
    const clock = new WorkClock(undefined, "Invoice agent");
    expect(clock.remaining()).toBe(Infinity);
    await expect(clock.time(async () => 1)).resolves.toBe(1);
  });
});

describe("a stalled reminder shows as not finished, never a spinner", () => {
  const startedAt = "2026-11-09T19:00:00.000Z";
  const at = (ms: number) => Date.parse(startedAt) + ms;

  it("only once it has run past the limit with nothing waiting on the person", () => {
    expect(runStalled({ status: "running", startedAt }, false, at(REMINDER_STALL_MS - 1))).toBe(false);
    expect(runStalled({ status: "running", startedAt }, false, at(REMINDER_STALL_MS + 1))).toBe(true);
  });

  it("never while the note waits on the person's approval, or once the run has ended", () => {
    expect(runStalled({ status: "running", startedAt }, true, at(REMINDER_STALL_MS * 4))).toBe(false);
    expect(runStalled({ status: "failed", startedAt }, false, at(REMINDER_STALL_MS * 4))).toBe(false);
  });
});

it("logs each finished run in one line, with how long it took and why it stopped", () => {
  const run: AgentRun = { id: "run_1", agentId: "payment-reminder", agentName: "Reminder agent", channel: "c", goal: "g", mode: "claude", status: "failed", startedAt: "2026-11-09T19:00:00.000Z", finishedAt: "2026-11-09T19:01:40.000Z", error: "Claude didn't answer in time", costUsd: 0 };
  expect(logLine(run)).toBe("run run_1 Reminder agent (claude) failed after 100.0s: Claude didn't answer in time");
});
