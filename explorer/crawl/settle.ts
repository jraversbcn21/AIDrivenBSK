export interface SettleOptions {
  minWaitMs: number;
  pollIntervalMs: number;
  maxWaitMs: number;
}

// Live-confirmed 2026-07-03 (reproduced twice, identical timing both times) against a
// mid-session page (several prior navigations on the same tab, matching the real crawler):
// the aria snapshot holds an unchanged "shell rendered, grid not yet fetched" plateau for
// ~2-3s, then transitions and settles with real grid content by ~4-6s. A plain "stop at the
// first two identical reads" check locks onto that shell plateau and never sees the grid —
// minWaitMs is a floor that skips past it before the stability check starts.
export const DEFAULT_SETTLE: SettleOptions = { minWaitMs: 3500, pollIntervalMs: 500, maxWaitMs: 10000 };

/**
 * Waits out `minWaitMs` (skipping a known early false-plateau, see DEFAULT_SETTLE), then
 * polls `snapshot()` until two consecutive reads are identical or `maxWaitMs` (from
 * navigation, not from the first read) elapses. Best-effort: gives up silently on timeout so
 * a page whose content never quite stabilizes (e.g. an animated banner) doesn't stall the
 * whole crawl; the caller extracts whatever the last snapshot was.
 */
export async function waitForSettle(
  snapshot: () => Promise<string>,
  wait: (ms: number) => Promise<void>,
  opts: SettleOptions = DEFAULT_SETTLE,
  now: () => number = Date.now,
): Promise<void> {
  const start = now();
  if (opts.minWaitMs > 0) await wait(opts.minWaitMs);
  let previous = await snapshot();
  while (now() - start < opts.maxWaitMs) {
    await wait(opts.pollIntervalMs);
    const current = await snapshot();
    if (current === previous) return;
    previous = current;
  }
}
