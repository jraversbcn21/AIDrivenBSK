// Correctness oracle #2 (findings §41): the price a customer sees on a PLP card must be
// the price its PDP charges. A failure here with both texts in the message is either a
// real DES pricing bug (report it) or a readout artifact that names itself — read the
// logged texts before blaming the framework. Probed live 2026-08-20: the PDP's price
// container is `div.product-detail-info` (1 match), and on both surfaces the CURRENT
// price is the first € amount in the text (discounted-PDP ordering unprobed — the
// known ceiling; the failure message is the diagnostic).
// Retargeted 2026-08-21 (findings §43, pending item 1): moved off the shared vestidos PLP —
// this one now runs against Pantalones Capri (mujer), a route none of the other PLP
// oracles touch. `div.product-detail-info` is the site-wide PDP price container (not
// vestidos-specific), so the PDP-side read is unchanged.
import { test, expect } from '../../src/fixtures/test';
import { PantalonesCapriPlpPage } from './pages/PantalonesCapriPlpPage';
import { parseEuroAmount } from '../../src/support/price';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > pantalones capri: the first card\'s PLP price matches its PDP price', async ({ page }) => {
  const target = new PantalonesCapriPlpPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);

  // §43: the §26 SPA bounce can leave the page on home between isLoaded() and the
  // reads below — re-anchor first (returns immediately when already on the PLP).
  await target.ensureOnPlp();

  // First card WITH a readable price (a promo/banner tile parses to null, §7's
  // firstProduct lesson — skip those rather than fail on them).
  const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
  await expect.poll(() => cards.count(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
  let cardPrice: number | null = null;
  let cardText = '';
  let href: string | null = null;
  const n = Math.min(await cards.count(), 8);
  for (let i = 0; i < n && cardPrice === null; i++) {
    cardText = (await cards.nth(i).innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
    cardPrice = parseEuroAmount(cardText);
    if (cardPrice !== null) href = await cards.nth(i).locator('a[href*="-c0p"]').first().getAttribute('href', { timeout: 5_000 }).catch(() => null);
  }
  if (cardPrice === null || !href) throw new Error(`no card with a readable price in the first ${n} cards`);
  const c0pId = href.match(/-c0p(\d+)\.html/)?.[1];
  if (!c0pId) throw new Error(`card href has no -c0p id: ${href}`);

  // Open the PDP: act→verify→retry on ITS c0p id in the URL (§7 fire-once clicks are
  // lost; the id anchors the verify to the card we read, not just "some PDP", §28/§31).
  const link = page.locator(`a[href*="-c0p${c0pId}.html"]`).first();
  const pdpUrl = new RegExp(`-c0p${c0pId}\\.html`);
  for (let attempt = 0; attempt < 3 && !pdpUrl.test(page.url()); attempt++) {
    // §43: a bounce mid-loop lands on home where the card link no longer exists —
    // re-anchor before re-clicking (loop guard keeps this off the PDP once reached).
    await target.ensureOnPlp().catch(() => undefined);
    await link.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForURL(pdpUrl, { timeout: 8_000 }).catch(() => undefined);
  }
  await expect(page).toHaveURL(pdpUrl, { timeout: HYDRATION_TIMEOUT_MS });

  // ORACLE: the PDP's own price equals the card's. Polled — the info panel hydrates
  // late and a single-shot read is §34's race. The poll returns a string so the failure
  // message carries both sides.
  await expect
    .poll(async () => {
      const text = (await page.locator('div.product-detail-info').first().innerText({ timeout: 5_000 }).catch(() => ''))
        .replace(/\s+/g, ' ').trim();
      const pdpPrice = parseEuroAmount(text);
      if (pdpPrice === null) return `PDP price unreadable (panel text: "${text.slice(0, 120)}")`;
      return pdpPrice === cardPrice
        ? 'match'
        : `MISMATCH: card=${cardPrice} pdp=${pdpPrice} (card text: "${cardText.slice(0, 100)}" | pdp text: "${text.slice(0, 100)}")`;
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('match');
});
