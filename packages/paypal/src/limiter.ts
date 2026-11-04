// Shared PayPal rate limiter.
// PayPal sandbox blocks an IP for 5 minutes above ~50 requests/minute.
// A token bucket allows `burst + perMinute` calls in its worst-case minute,
// so burst 5 + 35/min = at most 40 calls in any 60-second window.

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface LimiterOptions {
  burst?: number;
  perMinute?: number;
  clock?: Clock;
}

export class TokenBucket {
  private readonly burst: number;
  private readonly refillPerMs: number;
  private readonly clock: Clock;
  private tokens: number;
  private last: number;
  private queue: Promise<void> = Promise.resolve();

  constructor({ burst = 5, perMinute = 35, clock = realClock }: LimiterOptions = {}) {
    this.burst = burst;
    this.refillPerMs = perMinute / 60_000;
    this.clock = clock;
    this.tokens = burst;
    this.last = clock.now();
  }

  private refill(): void {
    const now = this.clock.now();
    this.tokens = Math.min(this.burst, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
  }

  /** Resolves when the caller may make one PayPal request. Callers are served in order. */
  acquire(): Promise<void> {
    const turn = this.queue.then(async () => {
      this.refill();
      if (this.tokens < 1) {
        await this.clock.sleep(Math.ceil((1 - this.tokens) / this.refillPerMs));
        this.refill();
      }
      this.tokens -= 1;
    });
    this.queue = turn.catch(() => {});
    return turn;
  }

  /** Waits for a slot, then runs the request. */
  async run<T>(request: () => Promise<T>): Promise<T> {
    await this.acquire();
    return request();
  }
}

/** One limiter for the whole process. Every PayPal call goes through it. */
export const paypalLimiter = new TokenBucket();