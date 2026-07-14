import { describe, it, expect, vi } from 'vitest';
import { actUntil } from './retry';

/** Fake clock: sleep() advances time; now() reads it. Mirrors Frontier's injectable-clock pattern. */
function fakeClock(): { now: () => number; sleep: (ms: number) => Promise<void>; elapsed: () => number } {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => { t += ms; return Promise.resolve(); },
    elapsed: () => t,
  };
}

describe('actUntil', () => {
  it('returns true as soon as verify passes, after acting', async () => {
    const clock = fakeClock();
    const act = vi.fn().mockResolvedValue(undefined);
    let open = false;
    const ok = await actUntil({
      act: async () => { await act(); open = true; },
      verify: async () => open,
      deadlineMs: 20_000, sleepMs: 500, sleep: clock.sleep, now: clock.now,
    });
    expect(ok).toBe(true);
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('swallows act errors — the verify is the truth (fire-once clicks are lost, not fatal)', async () => {
    const clock = fakeClock();
    let attempts = 0;
    const ok = await actUntil({
      act: async () => { attempts++; if (attempts < 3) throw new Error('hydration lag'); },
      verify: async () => attempts >= 3,
      deadlineMs: 20_000, sleepMs: 500, sleep: clock.sleep, now: clock.now,
    });
    expect(ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('treats a throwing verify as false and keeps retrying', async () => {
    const clock = fakeClock();
    let calls = 0;
    const ok = await actUntil({
      verify: async () => { calls++; if (calls < 2) throw new Error('detached'); return true; },
      deadlineMs: 20_000, sleepMs: 500, sleep: clock.sleep, now: clock.now,
    });
    expect(ok).toBe(true);
  });

  it('calls onTimeout at the deadline (the site-specific diagnostic throw) and propagates it', async () => {
    const clock = fakeClock();
    await expect(actUntil({
      act: async () => undefined,
      verify: async () => false,
      deadlineMs: 2_000, sleepMs: 500, sleep: clock.sleep, now: clock.now,
      onTimeout: () => { throw new Error('ProductPage: the dialog did not open within the deadline'); },
    })).rejects.toThrow(/did not open within the deadline/);
    expect(clock.elapsed()).toBeGreaterThanOrEqual(2_000);
  });

  it('returns false on timeout when no onTimeout is given (SearchBar phase-1 shape: fall through, no throw)', async () => {
    const clock = fakeClock();
    const ok = await actUntil({
      act: async () => undefined,
      verify: async () => false,
      deadlineMs: 2_000, sleepMs: 500, sleep: clock.sleep, now: clock.now,
    });
    expect(ok).toBe(false);
  });

  it('supports pure polling (no act) with an immediate first check before any sleep (waitForResults shape)', async () => {
    const clock = fakeClock();
    const ok = await actUntil({
      verify: async () => true,
      deadlineMs: 30_000, sleepMs: 500, sleep: clock.sleep, now: clock.now,
      immediateFirstCheck: true,
    });
    expect(ok).toBe(true);
    expect(clock.elapsed()).toBe(0); // verified at t0, zero sleeps
  });

  it('omitting sleepMs runs act→verify back to back (verify carries its own wait, e.g. waitForURL)', async () => {
    const clock = fakeClock();
    let iterations = 0;
    const ok = await actUntil({
      act: async () => { iterations++; },
      verify: async () => iterations >= 2, // second iteration verifies
      deadlineMs: 20_000, sleep: clock.sleep, now: clock.now,
    });
    expect(ok).toBe(true);
    expect(clock.elapsed()).toBe(0); // no fixed sleeps happened
  });

  it('respects the deadline with the fake clock (no real time passes in tests)', async () => {
    const clock = fakeClock();
    let attempts = 0;
    await actUntil({
      act: async () => { attempts++; },
      verify: async () => false,
      deadlineMs: 5_000, sleepMs: 1_000, sleep: clock.sleep, now: clock.now,
    });
    expect(attempts).toBe(5); // 5 iterations of 1s within a 5s budget
  });
});
