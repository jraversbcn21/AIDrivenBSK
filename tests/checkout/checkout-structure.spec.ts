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
import { completeLoginGateIfPresent } from '../../src/support/loginGate';

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

  // Desktop checkout gates on a LIVE session — handled by src/support/loginGate.ts
  // (see its doc comment; confirmed live 2026-08-02, task 6 round 2).
  const trigger = page.getByRole('button', { name: /tramitar pedido/i })
    .or(page.getByRole('link', { name: /tramitar pedido/i }))
    .first();
  await actUntil({
    act: async () => {
      if (await completeLoginGateIfPresent(page)) return;
      await trigger.click({ force: true, timeout: 5_000 });
    },
    verify: () => page.waitForURL(/\/checkout\.html/, { timeout: 2_000 }).then(() => true).catch(() => false),
    deadlineMs: 60_000, // the login-gate path composes a full in-dialog login on top of the click
    sleep: (ms) => page.waitForTimeout(ms),
    onTimeout: () => { throw new Error('checkout-structure: "Tramitar pedido" did not reach checkout'); },
  });

  // Signals — dual-layout (mobile: findings §23 Q2, buttons; desktop: 2026-08-02 live run,
  // task 6 round 2 of the desktop-layout-interceptor plan — the entry state is the same
  // shipping-method chooser but shaped differently: options are `radio`s named
  // "{método} {plazo} {precio}", a stepper `navigation "Pasos del checkout"` lists
  // "Método de envío / Método de pago / Resumen", and NO cost-summary disclosure exists):
  // NOTE the desktop radio inputs are visually hidden (bds pattern — the visible element is
  // the option's text), so the desktop signal is the visible option text, not the radio role.
  const shippingSignal = page.getByRole('button', { name: /envío estándar a domicilio/i })
    .or(page.getByText('Envío estándar a domicilio', { exact: true }));
  // In-lieu-of substitute for the read-only-unreachable payment step (see header comment).
  // Mobile: the cost-summary disclosure (name toggles with its state — both accepted).
  // Desktop: the stepper's "Método de pago" entry — direct evidence a payment step exists.
  const paymentSignal = page.getByRole('button', { name: /(ver|ocultar) detalle de costes/i })
    .or(page.getByRole('navigation', { name: /pasos del checkout/i }).getByText('Método de pago'));

  await expect.poll(() => shippingSignal.first().isVisible().catch(() => false), { timeout: CHECKOUT_SETTLE_MS }).toBe(true);
  await expect.poll(() => paymentSignal.first().isVisible().catch(() => false), { timeout: CHECKOUT_SETTLE_MS }).toBe(true);
});
