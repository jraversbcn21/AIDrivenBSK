// The suite's first CORRECTNESS oracle (findings §40): it asserts DES's own behavior —
// that "Precio ascendente" really sorts the grid by price — not our selectors' presence.
// A failure here means the PRODUCT is wrong, or the failure message's own price list
// shows a readout artifact (see the known ceiling below). Read that list before blaming
// the framework.
import { test, expect } from '../../src/fixtures/test';
import { VestidosTallasOverlayPage } from './pages/VestidosTallasOverlayPage';
import { FiltersPanel } from '../../src/components/FiltersPanel';
import { parseEuroAmount } from '../../src/support/price';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > vestidos: "Precio ascendente" actually sorts the grid by price', async ({ page }) => {
  const target = new VestidosTallasOverlayPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  // Guaranteed starting state (§29): the sort verify below is a TRANSITION to ?sort=1,
  // which only means something if we provably start without it.
  expect(page.url()).not.toMatch(/[?&]sort=/);

  const filters = new FiltersPanel(page.getByRole('main'));
  await filters.sortByPriceAscending({ recover: () => target.ensureOnPlp() }); // §43: survive the §26 SPA bounce

  // Read the first (unscrolled) cards' prices. Known ceiling: parseEuroAmount takes the
  // FIRST € amount in the card's text — confirmed live (§40 probe) to be the CURRENT
  // price on this PLP, discounted cards included; if a future card layout renders the
  // crossed-out "Antes" price first, the poll's failure message lists every price read
  // so the artifact names itself.
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

  // Polled, not single-shot: the grid re-renders asynchronously after the sort applies,
  // and one bare read of live UI state is §34's race.
  await expect
    .poll(async () => {
      const prices = await readPrices();
      if (prices.length < 6) return `only ${prices.length} readable prices`;
      const sorted = prices.every((x, i) => i === 0 || x >= prices[i - 1]);
      return sorted ? 'sorted' : `NOT sorted: ${prices.join(', ')}`;
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('sorted');
});
