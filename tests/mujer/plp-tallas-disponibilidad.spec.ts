// Correctness oracle #8 (findings §46): the (size, disabled) tuples the PLP quick-add
// overlay shows for a product must match its PDP's — availability consistency, the scope
// §42 deliberately left out. OPPORTUNISTIC by design: it needs a partially out-of-stock
// product in the first 6 cards; when today's stock is healthy it SKIPS (visible in the
// report — never a false green, §29). Known ceilings: stock can genuinely change in the
// seconds between the two reads (the failure message carries both sides; the retry
// re-measures), and this route now carries a second oracle (accepted §44 trade-off,
// design doc 2026-08-21). Route per §46's live probe (4th of 6 tried, first with a
// disabled size): Pantalones Capri (mujer). Marker forms confirmed live: overlay
// `button "Talla 38" [disabled]` (name-only marker); PDP `button "38" [disabled]`
// (bare size name, `isDisabled()`/`aria-disabled="true"` agree) — §46(c).
import { test, expect } from '../../src/fixtures/test';
import { PantalonesCapriPlpPage } from './pages/PantalonesCapriPlpPage';

const HYDRATION_TIMEOUT_MS = 20_000;
const MAX_CARDS_SCANNED = 6;

interface SizeTuple { size: string; disabled: boolean; }
const fmt = (t: SizeTuple[]) => t.map((x) => `${x.size}${x.disabled ? '(agotada)' : ''}`).join('|');

test('mujer > pantalones capri: overlay and PDP agree on which sizes are out of stock', async ({ page }) => {
  test.setTimeout(360_000); // worst case: scan (6x~40s) + PDP + oracle exceeds 300s in a degraded window
  const target = new PantalonesCapriPlpPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.ensureOnPlp(); // §43: re-anchor after a possible §26 bounce

  const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
  await expect.poll(() => cards.count(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
  const overlayDialog = page.getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: /^talla /i }) }).first();

  // Scan up to 6 cards for the discriminating state: >=1 disabled size in the overlay.
  let overlayTuples: SizeTuple[] | null = null;
  let c0pId: string | null = null;
  let overlaysRead = 0; // overlays that actually opened AND parsed >=1 tuple — distinguishes healthy stock from a degraded scan
  const n = Math.min(await cards.count(), MAX_CARDS_SCANNED);
  for (let i = 0; i < n && overlayTuples === null; i++) {
    const card = cards.nth(i);
    const href = await card.locator('a[href*="-c0p"]').first().getAttribute('href', { timeout: 5_000 }).catch(() => null);
    const id = href?.match(/-c0p(\d+)\.html/)?.[1];
    if (!id) continue; // transient getAttribute failure — skip the card
    // Open THIS card's overlay (act→verify→retry, §42's exact shape).
    const opened = await expect.poll(async () => {
      if (await overlayDialog.isVisible().catch(() => false)) return true;
      await target.ensureOnPlp().catch(() => undefined); // §43: survive a §26 bounce mid-loop
      await card.locator('[data-qa-anchor="addToCartSizeBtn"]').first().click({ timeout: 5_000 }).catch(() => undefined);
      return overlayDialog.isVisible().catch(() => false);
    }, { timeout: 25_000 }).toBe(true).then(() => true).catch(() => false);
    if (!opened) {
      // best-effort close: a late-rendering dialog (past the 25s poll) would otherwise stay open into
      // the next iteration, which wouldn't click and would read the PREVIOUS product's sizes against
      // the current card's id — a false bug. No verify — the card is discarded either way.
      await page.keyboard.press('Escape').catch(() => undefined);
      continue; // degraded card — the scan, not the oracle, absorbs it
    }

    // §46(b): disabled marker is a `[disabled]` attribute on the ariaSnapshot line, tolerant of other
    // attributes appearing before it (§46 measured `[disabled]` as the only one live, but the snapshot
    // format doesn't guarantee it stays immediately adjacent to the name).
    const snap = await overlayDialog.ariaSnapshot({ timeout: 5_000 }).catch(() => '');
    const tuples = [...snap.matchAll(/button "Talla ([^"]+)"([^\n]*)/gi)]
      .map((m) => ({ size: m[1].trim(), disabled: /\[disabled\]/.test(m[2]) }));
    await page.keyboard.press('Escape');
    await expect.poll(() => overlayDialog.isVisible().catch(() => false), { timeout: 10_000 }).toBe(false);
    if (tuples.length > 0) overlaysRead++;
    if (tuples.some((t) => t.disabled)) { overlayTuples = tuples; c0pId = id; }
  }

  test.skip(overlayTuples === null,
    `no partially out-of-stock product among the ${overlaysRead}/${n} cards whose overlay opened and parsed — nothing to compare (opportunistic oracle, design 2026-08-21)`);
  if (overlayTuples === null || c0pId === null) return; // narrowing for TS; skip already fired

  // Open the SAME product's PDP, anchored to its -c0p id (§41/§45 pattern).
  const link = page.locator(`a[href*="-c0p${c0pId}.html"]`).first();
  const pdpUrl = new RegExp(`-c0p${c0pId}\\.html`);
  for (let attempt = 0; attempt < 3 && !pdpUrl.test(page.url()); attempt++) {
    await target.ensureOnPlp().catch(() => undefined);
    await link.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForURL(pdpUrl, { timeout: 8_000 }).catch(() => undefined);
  }
  await expect(page).toHaveURL(pdpUrl, { timeout: HYDRATION_TIMEOUT_MS });

  // ORACLE: the PDP's (size, disabled) tuples equal the overlay's. Polled (§34); string
  // form so the failure message carries both complete sets.
  const expected = fmt(overlayTuples);
  await expect
    .poll(async () => {
      const group = page.getByRole('group', { name: /selecciona talla/i }).first();
      if (!(await group.isVisible().catch(() => false))) return 'PDP size group not visible yet';
      const btns = group.getByRole('button');
      const pdpTuples: SizeTuple[] = [];
      for (let b = 0; b < (await btns.count()); b++) {
        const el = btns.nth(b);
        const size = (await el.textContent({ timeout: 5_000 }).catch(() => ''))?.trim() ?? '';
        if (size === '') continue;
        // §46(c): PDP disabled marker — same ariaSnapshot suffix; isDisabled()/aria-disabled agree.
        const disabled = (await el.isDisabled().catch(() => false)) ||
          (await el.getAttribute('aria-disabled', { timeout: 5_000 }).catch(() => null)) === 'true';
        pdpTuples.push({ size, disabled });
      }
      return fmt(pdpTuples) === expected
        ? 'match'
        : `MISMATCH: overlay=[${expected}] pdp=[${fmt(pdpTuples)}]`;
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('match');
});
