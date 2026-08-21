// Correctness oracle #4 (findings §42): "Precio descendente" really sorts the grid by
// descending price. Twin of plp-precio-ascendente.spec.ts (§40) — see that file for the
// pattern's rationale; only the direction and the URL param (?sort=2) differ.
// Retargeted 2026-08-21 (findings §43, pending item 1): moved off the shared vestidos PLP —
// this one now runs against Hombre Lo Más Vendido, a route none of the other PLP oracles touch.
import { test, expect } from '../../src/fixtures/test';
import { HombreLoMasVendidoPage } from '../hombre/pages/HombreLoMasVendidoPage';
import { FiltersPanel } from '../../src/components/FiltersPanel';
import { parseEuroAmount } from '../../src/support/price';

const HYDRATION_TIMEOUT_MS = 20_000;

test('hombre > lo más vendido: "Precio descendente" actually sorts the grid by descending price', async ({ page }) => {
  const target = new HombreLoMasVendidoPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  expect(page.url()).not.toMatch(/[?&]sort=/); // guaranteed starting state (§29)

  const filters = new FiltersPanel(page.getByRole('main'));
  await filters.sortByPriceDescending({ recover: () => target.ensureOnPlp() }); // §43: survive the §26 SPA bounce

  const readPrices = async (): Promise<number[]> => {
    const items = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
    const n = Math.min(await items.count(), 12);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const eur = parseEuroAmount(await items.nth(i).innerText({ timeout: 5_000 }).catch(() => ''));
      if (eur !== null) out.push(eur);
    }
    return out;
  };

  await expect
    .poll(async () => {
      const prices = await readPrices();
      if (prices.length < 6) return `only ${prices.length} readable prices`;
      const sorted = prices.every((x, i) => i === 0 || x <= prices[i - 1]);
      return sorted ? 'sorted' : `NOT descending: ${prices.join(', ')}`;
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('sorted');
});
