// D15 phase 2: assert checkout's INNER structure (read-only) — findings §23 holds the
// captured evidence this spec's signals come from. Strict read-only: nothing inside
// checkout is ever focused, filled, or clicked; the walk in is the phase-1 recipe.
//
// Signal notes (findings §23, Q2 dump):
// - Shipping side: button "Envío estándar a domicilio" — unique, page-specific (checkout
//   renders no store header/footer chrome at all).
// - Payment side: NOT obtainable read-only — the payment step only exists after clicking
//   a shipping method, which the strict read-only rule forbids. The second signal below,
//   the cost-summary disclosure button (unique), is asserted IN LIEU OF a payment
//   element; it is NOT evidence any payment element exists in the entry state. Its
//   accessible name is STATE-DEPENDENT: "Ver detalle de costes" collapsed (§23's probe)
//   vs "Ocultar detalle de costes" expanded (observed live 2026-07-21, both attempts) —
//   the locator accepts both; either proves the cost-summary block rendered.
// - Strict-mode hazard: "Método de envío" appears as TWO headings (level 1 + level 2) —
//   never use it unscoped as a signal.
// - Settle caveat: §23's settle profile (~12s to stable) was measured on a direct-goto
//   entry; this spec enters via the "Tramitar pedido" SPA navigation, which may settle
//   on a different profile. CHECKOUT_SETTLE_MS below is the plan-mandated poll ceiling.
import { test, expect } from '../../src/fixtures/test';
import { actUntil } from '../../src/support/retry';

const CHECKOUT_SETTLE_MS = 20_000; // ceiling; expect.poll below returns as soon as signals hydrate (§23 profile)

test('checkout: inner structure renders (shipping + payment signals)', async ({ page, homePage, searchResultsPage, productPage, env }) => {
  test.skip(!env.checkoutAllowed, 'checkout is never exercised where checkoutAllowed is false (prod)');

  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();
  await productPage.selectFirstSize();
  await productPage.addToCart();
  await productPage.header.goToCart();

  const trigger = page.getByRole('button', { name: /tramitar pedido/i })
    .or(page.getByRole('link', { name: /tramitar pedido/i }))
    .first();
  await actUntil({
    act: () => trigger.click({ force: true }),
    verify: () => page.waitForURL(/\/checkout\.html/, { timeout: 2_000 }).then(() => true).catch(() => false),
    deadlineMs: 30_000,
    sleep: (ms) => page.waitForTimeout(ms),
    onTimeout: () => { throw new Error('checkout-structure: "Tramitar pedido" did not reach checkout'); },
  });

  // Signals from findings §23 (exact recorded accessible names; both are buttons):
  const shippingSignal = page.getByRole('button', { name: /envío estándar a domicilio/i });
  // In-lieu-of substitute for the read-only-unreachable payment step (see header comment;
  // name toggles with the disclosure's state — both variants accepted):
  const paymentSignal = page.getByRole('button', { name: /(ver|ocultar) detalle de costes/i });

  await expect.poll(() => shippingSignal.first().isVisible().catch(() => false), { timeout: CHECKOUT_SETTLE_MS }).toBe(true);
  await expect.poll(() => paymentSignal.first().isVisible().catch(() => false), { timeout: CHECKOUT_SETTLE_MS }).toBe(true);
});
