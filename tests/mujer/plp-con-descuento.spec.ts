// Correctness oracle #5 (findings §42): the "Con descuento" filter really filters — every
// card the filtered grid shows carries a real discount signal. Signal confirmed live
// (2026-08-20, read from the filtered grid's own snapshot): a discounted card's text reads
// "Precio con descuento X € Descuento del -N% Antes Y €" — /descuento del/i is the
// explicit, unambiguous tell. A failure here means DES showed a full-price product under
// the discount filter (a real product bug) — the failure message names the offending card.
import { test, expect } from '../../src/fixtures/test';
import { VestidosTallasOverlayPage } from './pages/VestidosTallasOverlayPage';
import { FiltersPanel } from '../../src/components/FiltersPanel';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > vestidos: every card under "Con descuento" is actually discounted', async ({ page }) => {
  const target = new VestidosTallasOverlayPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  expect(page.url()).not.toMatch(/[?&]discount=/); // guaranteed starting state (§29)

  const filters = new FiltersPanel(page.getByRole('main'));
  await filters.applyFirstAvailable({ recover: () => target.ensureOnPlp() }); // §43: survive the §26 SPA bounce

  // ORACLE: all readable cards in the first (unscrolled) view carry the discount tell.
  // Polled — the grid re-renders asynchronously after the filter applies (§34's race).
  await expect
    .poll(async () => {
      const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
      const n = Math.min(await cards.count(), 8);
      if (n === 0) return 'no cards rendered under the filter';
      for (let i = 0; i < n; i++) {
        const text = (await cards.nth(i).innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
        if (text === '') continue; // still hydrating — the poll retries
        if (!/descuento del/i.test(text)) {
          return `card[${i}] has NO discount signal: "${text.slice(0, 120)}"`;
        }
      }
      return 'all discounted';
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('all discounted');
});
