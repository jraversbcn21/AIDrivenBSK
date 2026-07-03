import { describe, it, expect } from 'vitest';
import { waitForSettle } from './settle';

describe('waitForSettle', () => {
  it('stops as soon as two consecutive snapshots are identical after the floor', async () => {
    let t = 0;
    const wait = async (ms: number): Promise<void> => { t += ms; };
    const now = (): number => t;
    const reads = ['loading', 'loaded', 'loaded', 'loaded'];
    let i = 0;
    const snapshot = async (): Promise<string> => reads[Math.min(i++, reads.length - 1)];

    await waitForSettle(snapshot, wait, { minWaitMs: 0, pollIntervalMs: 100, maxWaitMs: 5000 }, now);

    expect(i).toBe(3); // initial read + 2 polls (2nd poll matches the 1st)
    expect(t).toBe(200); // two poll intervals elapsed
  });

  it('gives up at maxWaitMs when the snapshot never stabilizes', async () => {
    let t = 0;
    const wait = async (ms: number): Promise<void> => { t += ms; };
    const now = (): number => t;
    let i = 0;
    const snapshot = async (): Promise<string> => `state-${i++}`; // always different

    await waitForSettle(snapshot, wait, { minWaitMs: 0, pollIntervalMs: 100, maxWaitMs: 350 }, now);

    expect(t).toBeGreaterThanOrEqual(350);
  });

  it('returns immediately after the floor when the first two reads already match', async () => {
    let t = 0;
    const wait = async (ms: number): Promise<void> => { t += ms; };
    const now = (): number => t;
    const snapshot = async (): Promise<string> => 'stable';

    await waitForSettle(snapshot, wait, { minWaitMs: 0, pollIntervalMs: 100, maxWaitMs: 5000 }, now);

    expect(t).toBe(100); // one poll to confirm stability
  });

  it('waits out minWaitMs before taking the first reading, skipping an early plateau', async () => {
    let t = 0;
    const wait = async (ms: number): Promise<void> => { t += ms; };
    const now = (): number => t;
    // Live-observed shape (findings doc): unchanged "shell" for a while, then a transition,
    // then the real content — a naive 2-reads-equal check without a floor locks onto "shell".
    const snapshot = async (): Promise<string> => {
      if (t < 3000) return 'shell';
      if (t < 4000) return 'transitioning';
      return 'grid';
    };

    await waitForSettle(snapshot, wait, { minWaitMs: 3500, pollIntervalMs: 500, maxWaitMs: 10000 }, now);

    expect(t).toBe(4500); // floor(3500) -> 'transitioning', +500 -> 'grid', +500 -> 'grid' (stable)
  });
});
