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
    // Task-review fix, 2026-08-13: removeFirstItem()'s own verify accepts the INSTANT
    // lineItemCount() hits 0 — one render tick before the "Cesta vacía" copy mounts (a
    // separate step, §28/§32 doctrine: isEmpty() is content-identified, not a bare count).
    // Without this settle, the next loop iteration's `isEmpty()` above can read `false`
    // (copy not there yet) against a cart that already IS empty, and if MAX_REMOVALS was
    // also exhausted by then, the following `removeFirstItem()` would throw "no line items
    // to remove" — a misleading error from a cleanup that had actually already succeeded.
    // waitForLoaded()'s own either/or wait (line items > 0 OR isEmpty()) is exactly the
    // settle needed here; count is already 0, so it can only resolve via isEmpty() mounting.
    if ((await cart.lineItemCount()) === 0) await cart.waitForLoaded();
  }
  if (await cart.isEmpty()) return;
  throw new Error(`ensureEmptyCart: cart still not empty after bounds (${MAX_REMOVALS} removals / ${DEADLINE_MS}ms) — ${await cart.lineItemCount()} lines left. DES degraded, or the remove selector drifted (findings §32).`);
}
