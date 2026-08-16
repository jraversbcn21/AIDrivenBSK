// src/support/cartCleanup.ts
/**
 * Guarantees an EMPTY cart as a test's starting state — the transition anchor the §29
 * doctrine requires (the shared DES account carries cart items across runs, a proven
 * false-green source; closes the §7 cleanup-fixture backlog item).
 *
 * Hard-bounded twice (iterations AND wall clock): on a degraded DES this fails with an
 * explicit diagnostic, it never hangs toward the test timeout (§26).
 */
import type { CartPage } from '../pages/CartPage';

const MAX_REMOVALS = 15;
const DEADLINE_MS = 120_000;

export async function ensureEmptyCart(cart: CartPage): Promise<void> {
  await cart.open();
  await cart.waitForLoaded();
  const deadline = Date.now() + DEADLINE_MS;
  for (let i = 0; i < MAX_REMOVALS; i++) {
    if (await cart.isEmpty()) return;
    if (Date.now() > deadline) break;
    await cart.removeFirstItem();
    // Unconditional (code-review fix, 2026-08-16 — was gated on lineItemCount() === 0):
    // that gate skipped the session-aware settle whenever a line remained, so a session
    // death mid-drain fell through to this loop's own bare `isEmpty()` check next tick,
    // which reads false on a wrong-page render instead of throwing waitForLoaded()'s
    // crafted diagnostic — surfacing as removeFirstItem()'s misleading "no line items to
    // remove" instead. immediateFirstCheck (retry.ts) makes this free on the happy path:
    // it returns instantly once lineItemCount() > 0 or isEmpty() is already true.
    await cart.waitForLoaded();
  }
  if (await cart.isEmpty()) return;
  throw new Error(`ensureEmptyCart: cart still not empty after bounds (${MAX_REMOVALS} removals / ${DEADLINE_MS}ms) — ${await cart.lineItemCount()} lines left. DES degraded, or the remove selector drifted (findings §32).`);
}
