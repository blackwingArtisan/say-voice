export class AiUnavailableError extends Error {
  readonly status = 503;
  constructor(message = "AI is in mock mode (no ANTHROPIC_API_KEY) and this call has no mock fixture.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export class AiBudgetExceededError extends Error {
  readonly status = 402;
  constructor(
    readonly capUsd: number,
    readonly spentUsd: number,
    readonly estimateUsd: number,
  ) {
    super(
      `AI daily spend cap reached: $${spentUsd.toFixed(4)} spent of $${capUsd.toFixed(2)}; this call could cost up to $${estimateUsd.toFixed(4)}. Resets at 00:00 UTC.`,
    );
    this.name = "AiBudgetExceededError";
  }
}

/** The Anthropic account itself has no credit left, as opposed to the app's own daily cap. */
export class AiCreditError extends Error {
  readonly status = 402;
  constructor() {
    super("The AI has run out of credit.");
    this.name = "AiCreditError";
  }
}

const OUT_OF_CREDIT = /credit balance|billing|insufficient.*(credit|funds)/i;

export const isOutOfCredit = (error: unknown) => {
  const { status, message } = (error ?? {}) as { status?: number; message?: string };
  return status === 402 || ((status === 400 || status === 403) && OUT_OF_CREDIT.test(message ?? ""));
};

/** A model call, or an agent's work, that didn't come back in time: it stops here with a plain message instead of hanging. */
export class AiTimeoutError extends Error {
  readonly status = 504;
  constructor(
    readonly feature: string,
    readonly afterMs: number,
  ) {
    super(`Claude didn't answer in time (${feature}, ${Math.round(afterMs / 1000)} s), so this stopped. Try again.`);
    this.name = "AiTimeoutError";
  }
}

export class AiRefusalError extends Error {
  readonly status = 422;
  constructor(
    readonly category: string | null,
    explanation?: string | null,
  ) {
    super(`Claude declined this request${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}`);
    this.name = "AiRefusalError";
  }
}

export class AiOutputError extends Error {
  readonly status = 502;
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

export class RateLimitedError extends Error {
  readonly status = 429;
  constructor(
    readonly retryAfterSeconds: number,
    /** The limit that was hit, and over what window, so the screen can say the real number. */
    readonly limit?: { count: number; per: "minute" | "day" },
  ) {
    super(`Too many requests. Try again in ${retryAfterSeconds}s.`);
    this.name = "RateLimitedError";
  }
}
