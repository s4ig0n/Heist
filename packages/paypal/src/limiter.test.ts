import { describe, expect, it } from 'vitest';
import { TokenBucket, type Clock } from './limiter';

// Fake clock: sleeping advances time instantly, so tests don't wait.
function fakeClock(): Clock {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

async function callTimes(n: number, clock: Clock, concurrent = false): Promise<number[]> {
  const bucket = new TokenBucket({ clock });
  const times: number[] = [];
  const one = async () => { await bucket.acquire(); times.push(clock.now()); };
  if (concurrent) await Promise.all(Array.from({ length: n }, one));
  else for (let i = 0; i < n; i++) await one();
  return times;
}

function maxInAnyMinute(times: number[]): number {
  return Math.max(...times.map((start) => times.filter((x) => x >= start && x < start + 60_000).length));
}

describe('TokenBucket (PayPal limiter)', () => {
  it('lets a burst of 5 through immediately, then paces', async () => {
    const times = await callTimes(6, fakeClock());
    expect(times.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(times[5]).toBeGreaterThan(0);
  });

  it('never exceeds 40 calls in any 60-second window (sequential)', async () => {
    expect(maxInAnyMinute(await callTimes(200, fakeClock()))).toBeLessThanOrEqual(40);
  });

  it('never exceeds 40 calls in any 60-second window (100 concurrent callers)', async () => {
    expect(maxInAnyMinute(await callTimes(100, fakeClock(), true))).toBeLessThanOrEqual(40);
  });

  it('run() returns the request result', async () => {
    const bucket = new TokenBucket({ clock: fakeClock() });
    await expect(bucket.run(async () => 'ok')).resolves.toBe('ok');
  });
});