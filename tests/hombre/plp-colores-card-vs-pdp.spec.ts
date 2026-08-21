// Correctness oracle #7 (findings §45): the color count a PLP card promises
// ("N COLORES") must match the colors its PDP actually offers. A mismatch with the
// rest of the suite green is a real DES catalog inconsistency — or the known ceiling
// (PDP may hide out-of-stock colors while the card counts them all, unprobed §45);
// the failure message carries both sides so each names itself. PDP locator per §45's
// live probe: a scoped `listbox "Colores disponibles"`, NOT the unscoped
// `a[href*="colorId"]` candidate — that overcounts 4x on cross-selling cards further
// down the page (17 vs 4 on the probed product).
import { test, expect } from '../../src/fixtures/test';
import { HombreComboWinsPage } from './pages/HombreComboWinsPage';

const HYDRATION_TIMEOUT_MS = 20_000;
// §45: the PDP's active/selected color is a plain `option` inside the listbox
// ([selected], not excluded or rendered separately) — it counts as one of the N.
const ACTIVE_COLOR_COUNTS = true;

test('hombre > combo wins: the first multicolor card\'s "N COLORES" matches its PDP color count', async ({ page }) => {
  const target = new HombreComboWinsPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.ensureOnPlp(); // §43: re-anchor after a possible §26 bounce

  // First card declaring "N COLORES" (N>=2). Single-color cards carry no declaration
  // and are out of scope by design (spec 2026-08-21).
  const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
  await expect.poll(() => cards.count(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
  let declared: number | null = null;
  let cardText = '';
  let href: string | null = null;
  const n = Math.min(await cards.count(), 12);
  for (let i = 0; i < n && declared === null; i++) {
    cardText = (await cards.nth(i).innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
    const m = cardText.match(/(\d+)\s+COLORES/i);
    if (m) {
      declared = Number(m[1]);
      href = await cards.nth(i).locator('a[href*="-c0p"]').first().getAttribute('href', { timeout: 5_000 }).catch(() => null);
    }
  }
  if (declared === null || !href) throw new Error(`no card declaring "N COLORES" in the first ${n} cards`);
  const c0pId = href.match(/-c0p(\d+)\.html/)?.[1];
  if (!c0pId) throw new Error(`card href has no -c0p id: ${href}`);

  // Open the PDP anchored to THAT card's id (§28/§31; §41's exact pattern).
  const link = page.locator(`a[href*="-c0p${c0pId}.html"]`).first();
  const pdpUrl = new RegExp(`-c0p${c0pId}\\.html`);
  for (let attempt = 0; attempt < 3 && !pdpUrl.test(page.url()); attempt++) {
    await target.ensureOnPlp().catch(() => undefined); // §43 re-anchor; guard keeps this off a reached PDP
    await link.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForURL(pdpUrl, { timeout: 8_000 }).catch(() => undefined);
  }
  await expect(page).toHaveURL(pdpUrl, { timeout: HYDRATION_TIMEOUT_MS });

  // ORACLE: PDP color count == the card's declared N. Polled (§34); the returned
  // string carries both sides on failure. Locator per §45's probe, scoped to the
  // product's own color listbox — never the page-wide colorId-link count (§45 hazard,
  // same class as §31's wishlist repeated-element trap).
  await expect
    .poll(async () => {
      const options = page
        .locator('div.product-detail-info')
        .getByRole('listbox', { name: 'Colores disponibles' })
        .getByRole('option');
      const rendered = (await options.count()) + (ACTIVE_COLOR_COUNTS ? 0 : 1);
      if (rendered <= (ACTIVE_COLOR_COUNTS ? 0 : 1)) return `PDP color selector not hydrated yet (0 options visible)`;
      return rendered === declared
        ? 'match'
        : `MISMATCH: card declares ${declared} (card text: "${cardText.slice(0, 100)}") but PDP renders ${rendered} colors`;
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('match');
});
