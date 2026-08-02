// D15 phase 1 (2026-07-14): reach the REAL checkout and verify it loads — never fill
// payment, never place an order. The real entry was captured live: cart's "Tramitar
// pedido" → /es/checkout.html (title "Checkout | Bershka"), findings doc §22.
// Walks the full UI path on purpose: /q/ search results are not server-routable
// (findings §7) and checkout's own routability is unverified — the UI path is the
// only confirmed-live route.
import { test, expect } from '../../src/fixtures/test';
import { actUntil } from '../../src/support/retry';
import { completeLoginGateIfPresent } from '../../src/support/loginGate';

const HYDRATION_TIMEOUT_MS = 20_000;

test('checkout: cart\'s "Tramitar pedido" reaches /es/checkout.html', async ({ page, homePage, searchResultsPage, productPage, env }) => {
  test.skip(!env.checkoutAllowed, 'checkout is never exercised where checkoutAllowed is false (prod)');

  // Standard add-to-cart recipe (the reference spec's own path).
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();
  await productPage.selectFirstSize();
  await productPage.addToCart();
  await productPage.header.goToCart();

  // The cart page renders as a slow skeleton (findings §5); the trigger hydrates late.
  // Desktop checkout additionally gates on a LIVE session (confirmed live 2026-08-02, task 6
  // round 2): DES single-sessions the shared account, so login.spec's mid-suite re-auth
  // invalidates the setup-minted storageState session and "Tramitar pedido" opens a
  // `dialog "Inicia sesión o crea tu cuenta"` instead of navigating (isolated runs with a
  // fresh state pass; full-suite runs failed exactly at this gate; the mobile layout never
  // gated here). The act completes the login in-dialog via src/support/loginGate.ts (shared, single fix point — the login flow is DES's most drift-prone surface).
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
    onTimeout: () => { throw new Error('checkout-reach: "Tramitar pedido" did not navigate to /es/checkout.html within the deadline'); },
  });

  await expect.poll(async () => (await page.title().catch(() => '')).toLowerCase(), { timeout: HYDRATION_TIMEOUT_MS })
    .toContain('checkout');
});
