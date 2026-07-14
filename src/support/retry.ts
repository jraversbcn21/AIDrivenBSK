/**
 * The framework's standing interaction-reliability rule, as a single named primitive
 * (audit F8 — previously hand-rolled at seven sites with accidental variations):
 * on DES, every state-changing interaction must act → verify → retry against a
 * wall-clock deadline, because an element can be visible before Vue attaches its
 * handler and a fire-once click/keypress is silently lost (findings §7, confirmed
 * live for the search Enter, the size click, and card opens).
 *
 * This CENTRALIZES the pattern; it does not change it — A3's reclassification of the
 * waitForTimeout-based loop as deliberate doctrine stands untouched. Each call site
 * keeps its own deadline, cadence and diagnostic error.
 */
export interface ActUntilOptions {
  /** The state-changing attempt. Errors are swallowed — the verify is the truth.
   *  Omit for pure state polling (e.g. waiting for a grid to hydrate). */
  act?: () => Promise<unknown>;
  /** State observation: URL reached, dialog open/closed, element visible. A throw
   *  (detached node, mid-navigation) counts as false and the loop continues. */
  verify: () => Promise<boolean>;
  deadlineMs: number;
  /** Fixed pause between act and verify. Omit when verify carries its own wait
   *  (e.g. waitForURL with a per-attempt timeout). */
  sleepMs?: number;
  /** Sleeper — page.waitForTimeout at call sites, injectable fake clock in tests. */
  sleep: (ms: number) => Promise<void>;
  /** Run one verify before the first act/sleep — the pure-polling shape checks state
   *  at t0 instead of paying a first sleep for something already true. */
  immediateFirstCheck?: boolean;
  /** Called when the deadline expires; typically throws the site's diagnostic error
   *  (and the throw propagates). If absent or it returns, actUntil resolves false —
   *  the caller decides what a timeout means (SearchBar's phase 1 falls through). */
  onTimeout?: () => void | Promise<void>;
  /** Clock — Date.now at call sites, injectable in tests. */
  now?: () => number;
}

export async function actUntil(opts: ActUntilOptions): Promise<boolean> {
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.deadlineMs;

  const check = (): Promise<boolean> => opts.verify().catch(() => false);

  if (opts.immediateFirstCheck === true && await check()) return true;

  while (now() < deadline) {
    if (opts.act !== undefined) await opts.act().catch(() => undefined);
    if (opts.sleepMs !== undefined) await opts.sleep(opts.sleepMs);
    if (await check()) return true;
  }

  if (opts.onTimeout !== undefined) await opts.onTimeout();
  return false;
}
