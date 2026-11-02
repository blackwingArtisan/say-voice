import { describe, expect, it, vi } from "vitest";
import { AiBudgetExceededError, AiCreditError } from "@/lib/ai/errors";
import { createJob } from "@/lib/say/jobs";
import { SAMPLE_AMOUNTS, SAMPLE_TRANSCRIPT } from "@/lib/say/sample";

const refusal = vi.hoisted(() => ({ next: undefined as Error | undefined }));

vi.mock("@/lib/ai", async (original) => ({
  ...(await original<typeof import("@/lib/ai")>()),
  generateObject: vi.fn(async () => {
    throw refusal.next;
  }),
}));

const customer = { name: "Tom Baker", email: "tom.baker@example.com" };

describe("when the AI budget is used up", () => {
  for (const [name, error] of [["the daily cap", new AiBudgetExceededError(2, 1.99, 0.03)], ["an empty Anthropic account", new AiCreditError()]] as const) {
    it(`the sample still runs on its saved reading after ${name}`, async () => {
      refusal.next = error;
      const job = await createJob({ source: "sample", transcript: SAMPLE_TRANSCRIPT, customer, today: "2026-11-01" });
      expect(job.ai).toMatchObject({ saved: true, costUsd: 0 });
      expect(job.lines[1].unitCents).toBe(SAMPLE_AMOUNTS.heardElementCents);
    });

    it(`a real recording is refused after ${name}, so the page can keep it`, async () => {
      refusal.next = error;
      await expect(createJob({ source: "mic", transcript: SAMPLE_TRANSCRIPT, customer, today: "2026-11-01" })).rejects.toBe(error);
    });
  }

  it("any other AI failure is reported, even on the sample", async () => {
    refusal.next = new Error("Overloaded");
    await expect(createJob({ source: "sample", transcript: SAMPLE_TRANSCRIPT, customer, today: "2026-11-01" })).rejects.toThrow("Overloaded");
  });
});
