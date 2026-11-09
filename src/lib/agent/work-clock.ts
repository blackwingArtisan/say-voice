/**
 * An agent run's working time: model calls and reads, but not a money tool waiting on the person's
 * approval. Each piece of work gets only what's left of the limit, so a call that hangs, or a run
 * that drags over many turns, stops with an AiTimeoutError instead of spinning on the person's screen.
 */
import { AiTimeoutError } from "../ai/errors";

export class WorkClock {
  private spentMs = 0;

  constructor(
    /** No limit when undefined. */
    readonly limitMs: number | undefined,
    readonly label: string,
    private readonly now: () => number = Date.now,
  ) {}

  get spent() {
    return this.spentMs;
  }

  remaining() {
    return this.limitMs === undefined ? Infinity : this.limitMs - this.spentMs;
  }

  /** Runs `work` against what's left of the limit, and counts the time it took. */
  async time<T>(work: () => Promise<T>): Promise<T> {
    if (this.limitMs === undefined) return work();
    const limit = this.limitMs;
    const left = this.remaining();
    if (left <= 0) throw new AiTimeoutError(this.label, limit);
    const start = this.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AiTimeoutError(this.label, limit)), left);
    });
    try {
      return await Promise.race([work(), late]);
    } finally {
      clearTimeout(timer);
      this.spentMs += this.now() - start;
    }
  }
}
