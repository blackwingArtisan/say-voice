import { afterEach, describe, expect, it, vi } from "vitest";
import { AiBudgetExceededError, AiCreditError, isOutOfCredit, RateLimitedError } from "@/lib/ai/errors";
import { DEFAULT_POLICY, matchesPattern } from "@/lib/agent/policy";
import { errorResponse } from "@/lib/http";
import { isTestAddress } from "@/lib/say/contacts";
import { isSpeechOutOfCredit, transcribe } from "@/lib/say/speech";
import { explainSample, explainTake } from "@/lib/say/take-problem";

afterEach(() => vi.unstubAllGlobals());

const bodyOf = async (error: unknown) => {
  const response = errorResponse(error);
  return { status: response.status, ...((await response.json()) as { error: { type: string; message: string; retry_after_seconds?: number } }).error };
};

describe("what the server says when it refuses", () => {
  it("gives the wait with a rate limit, so the page can count it down", async () => {
    expect(await bodyOf(new RateLimitedError(34))).toMatchObject({ status: 429, type: "rate_limited", retry_after_seconds: 34 });
    expect(await bodyOf(new RateLimitedError(34, { count: 6, per: "minute" }))).toMatchObject({ retry_after_seconds: 34, limit: 6, per: "minute" });
  });

  it("names the daily cap in plain words, not the sums", async () => {
    const body = await bodyOf(new AiBudgetExceededError(2, 1.99, 0.03));
    expect(body).toMatchObject({ status: 402, type: "ai_credit" });
    expect(body.message).toContain("resets at midnight UTC");
    expect(body.message).not.toContain("$");
  });

  it("names an empty Anthropic account the same way", async () => {
    expect(await bodyOf(new AiCreditError())).toMatchObject({ status: 402, type: "ai_credit" });
  });
});

describe("telling no credit from any other failure", () => {
  it("knows Anthropic's words for it", () => {
    expect(isOutOfCredit({ status: 400, message: "Your credit balance is too low to access the Anthropic API." })).toBe(true);
    expect(isOutOfCredit({ status: 402, message: "" })).toBe(true);
    expect(isOutOfCredit({ status: 400, message: "max_tokens is too large" })).toBe(false);
    expect(isOutOfCredit({ status: 529, message: "Overloaded" })).toBe(false);
  });

  it("knows ElevenLabs' words for it", () => {
    expect(isSpeechOutOfCredit(401, '{"detail":{"status":"quota_exceeded","message":"This request exceeds your quota."}}')).toBe(true);
    expect(isSpeechOutOfCredit(402, "")).toBe(true);
    expect(isSpeechOutOfCredit(401, '{"detail":{"status":"invalid_api_key"}}')).toBe(false);
    expect(isSpeechOutOfCredit(429, '{"detail":{"status":"too_many_concurrent_requests"}}')).toBe(false);
  });

  it("turns ElevenLabs running out into its own refusal", async () => {
    vi.stubEnv("AI_MODE", "live");
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 })));
    await expect(transcribe(new ArrayBuffer(8), "audio/webm")).rejects.toMatchObject({ status: 402, code: "speech_credit" });
    vi.unstubAllEnvs();
  });
});

describe("what the page tells the person", () => {
  it("always says the recording is safe when it can be retried", () => {
    for (const type of ["rate_limited", "ai_credit", "speech_credit", "network", "speech_failed", "anything-else"]) {
      const problem = explainTake({ type, status: 500 });
      expect(problem.retry, type).toBe(true);
      expect(problem.detail, type).toContain("Your recording is safe");
    }
  });

  it("counts down the limit", () => {
    expect(explainTake({ type: "rate_limited", retryAfter: 34 }).waitSeconds).toBe(34);
    // The real number when the server gives it, not "a few".
    expect(explainTake({ type: "rate_limited", retryAfter: 34, limit: 6, per: "minute" }).detail).toContain("This demo allows 6 AI requests a minute per person.");
    expect(explainSample({ type: "rate_limited", retryAfter: 34, limit: 150, per: "day" })).toBe("This demo allows 150 AI requests a day per person. Try again in 34 seconds.");
  });

  it("doesn't offer a retry that can't work", () => {
    for (const type of ["empty_audio", "empty_transcript", "audio_too_large"]) expect(explainTake({ type }).retry, type).toBe(false);
  });

  it("never shows raw server text it didn't write", () => {
    const problem = explainTake({ status: 502, message: "<html>Bad Gateway</html>" });
    expect(JSON.stringify(problem)).not.toContain("Bad Gateway");
    expect(explainSample({ status: 529, message: '529 {"type":"error"}' })).not.toContain("529");
  });
});

describe("the test-address rule", () => {
  it("matches the Guard's allowlist", () => {
    const guardAllows = (email: string) => DEFAULT_POLICY.allowedCounterparties!.some((pattern) => matchesPattern(email, pattern));
    for (const email of ["a@example.com", "A@EXAMPLE.COM", "a@personal.example.com", "a@business.example.com", "a@gmail.com", "a@example.com.evil.test", "a@notexample.com"]) expect(isTestAddress(email), email).toBe(guardAllows(email));
  });
});
