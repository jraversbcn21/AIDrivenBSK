// Correctness oracle #6 (findings §42): the sizes the PLP quick-add overlay offers for a
// product are the SAME sizes its PDP offers — cross-surface data consistency. Probed live
// 2026-08-20: the overlay is a real `dialog` holding size BUTTONS whose accessible names
// are "Talla XS" … but whose textContent is just "Talla " (the letter lives only in the
// accessible name — read via the dialog's ariaSnapshot); the PDP renders
// `group "Selecciona talla"` with plain-text buttons (XS, S, M, L). A mismatch means a
// customer is offered sizes on one surface that the other denies — a real product bug.
// Known ceiling: availability (disabled state) is NOT compared — only the size LIST;
// the probed product had no disabled sizes, so that shape is unprobed.
// Retargeted 2026-08-21 (findings §43, pending item 1): moved off the shared vestidos PLP —
// this one now runs against Pantalones Combo Wins (mujer), a route none of the other PLP
// oracles touch. The quick-add trigger (`data-qa-anchor="addToCartSizeBtn"`) and the
// overlay/PDP size shapes are site-wide, not vestidos-specific.
import { test, expect } from '../../src/fixtures/test';
import { PantalonesComboWinsPlpPage } from './pages/PantalonesComboWinsPlpPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > pantalones combo wins: the quick-add overlay offers the same sizes as the PDP', async ({ page }) => {
  test.setTimeout(180_000);
  const target = new PantalonesComboWinsPlpPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);

  // The FIRST card, pinned by its own -c0p id — overlay and PDP must be the SAME product
  // (§28/§31: identify what you are looking at; a page-wide `.first()` trigger would not
  // guarantee which product's overlay we read).
  const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
  await expect.poll(() => cards.count(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
  const first = cards.first();
  await target.ensureOnPlp(); // §43: re-anchor after a possible §26 bounce
  const href = await first.locator('a[href*="-c0p"]').first().getAttribute('href', { timeout: 5_000 }).catch(() => null);
  const c0pId = href?.match(/-c0p(\d+)\.html/)?.[1];
  if (!href || !c0pId) throw new Error(`first card has no -c0p href (got: ${href})`);

  // Open THIS card's overlay (act→verify→retry, §7; card-scoped trigger, 1 match probed).
  const overlayDialog = page.getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: /^talla /i }) }).first();
  await expect
    .poll(async () => {
      if (await overlayDialog.isVisible().catch(() => false)) return true;
      await target.ensureOnPlp().catch(() => undefined); // §43: survive the §26 bounce mid-loop
      await first.locator('[data-qa-anchor="addToCartSizeBtn"]').first()
        .click({ timeout: 5_000 }).catch(() => undefined);
      return overlayDialog.isVisible().catch(() => false);
    }, { timeout: 30_000 })
    .toBe(true);

  // Overlay sizes: parse the dialog's aria snapshot — the size letter exists ONLY in the
  // buttons' accessible names ("Talla XS"), never in textContent (probed).
  const snapshot = await overlayDialog.ariaSnapshot({ timeout: 5_000 });
  const overlaySizes = [...snapshot.matchAll(/button "Talla ([^"]+)"/gi)].map((m) => m[1].trim());
  expect(overlaySizes.length, `no size buttons parsed from the overlay snapshot:\n${snapshot.slice(0, 400)}`)
    .toBeGreaterThan(0);

  // Close (Escape — the site's overlay-close idiom, §17) and open the SAME product's PDP
  // by clicking its own link (act→verify→retry anchored to its -c0p id, the O2 pattern).
  await page.keyboard.press('Escape');
  const link = page.locator(`a[href*="-c0p${c0pId}.html"]`).first();
  const pdpUrl = new RegExp(`-c0p${c0pId}\\.html`);
  for (let attempt = 0; attempt < 3 && !pdpUrl.test(page.url()); attempt++) {
    await target.ensureOnPlp().catch(() => undefined); // §43: bounce lands on home, link gone
    await link.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForURL(pdpUrl, { timeout: 8_000 }).catch(() => undefined);
  }
  await expect(page).toHaveURL(pdpUrl, { timeout: HYDRATION_TIMEOUT_MS });

  // ORACLE: the PDP's size group lists exactly the same sizes, in the same order.
  // Polled — the size group hydrates late (§34's race); string form so the failure
  // message carries both lists.
  const expected = overlaySizes.join('|');
  await expect
    .poll(async () => {
      const group = page.getByRole('group', { name: /selecciona talla/i }).first();
      if (!(await group.isVisible().catch(() => false))) return 'PDP size group not visible yet';
      const texts = await group.getByRole('button').allTextContents();
      const pdpSizes = texts.map((t) => t.trim()).filter((t) => t !== '');
      return pdpSizes.join('|') === expected
        ? 'match'
        : `MISMATCH: overlay=[${overlaySizes.join(', ')}] pdp=[${pdpSizes.join(', ')}]`;
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('match');
});
