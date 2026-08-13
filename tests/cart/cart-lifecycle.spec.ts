// tests/cart/cart-lifecycle.spec.ts
// The cart lifecycle as ONE journey (design 2026-08-13-cart-regression-design.md,
// option A): a single prime (adding is 30-60s and the suite's #1 flake surface, §28/§30)
// and every assertion a TRANSITION from a guaranteed state (§29) — the chain 0→1→2→1→0
// is anchored by cleanCart's provably-empty start, so residue from previous runs can
// never bless it.
import { test, expect } from '../../src/fixtures/test';

const HYDRATION_TIMEOUT_MS = 20_000;

test('cart lifecycle: add → quantity up/down → remove → empty', async ({ cleanCart, homePage, searchResultsPage, productPage, cartPage }) => {
  void cleanCart; // the fixture already proved the cart is EMPTY — the transition anchor
  // Sized, not blind (§26 doctrine): prime (~60s worst observed) + cart skeleton budget
  // (30s) + 4 cart ops × ~20s deadlines. The default 150s fits a healthy run but not a
  // degraded-window one, and this spec does strictly more than any existing single spec.
  test.setTimeout(240_000);

  // Prime: the proven add recipe (search → PDP → size → add).
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();
  await productPage.selectFirstSize();
  await productPage.addToCart();
  await productPage.header.goToCart();
  await cartPage.waitForLoaded();

  // 0 → 1 (a transition: cleanCart fixed the 0).
  await expect.poll(() => cartPage.lineItemCount(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(1);
  await expect.poll(() => cartPage.totalAmount(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
  const totalAt1 = await cartPage.totalAmount();
  if (totalAt1 === null) throw new Error('cart-lifecycle: total unreadable right after it polled > 0');

  // 1 → 2: line quantity AND total react.
  await cartPage.increaseQuantity();
  await expect.poll(() => cartPage.lineQuantity(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(2);
  // Falsifiable on purpose: a 2×1 promo would break the strict increase — documented
  // risk taken over shipping an unfalsifiable >= from day one (design §Totals).
  await expect.poll(() => cartPage.totalAmount(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(totalAt1);

  // 2 → 1: and the total comes back down.
  const totalAt2 = await cartPage.totalAmount();
  if (totalAt2 === null) throw new Error('cart-lifecycle: total unreadable after the quantity increase');
  await cartPage.decreaseQuantity();
  await expect.poll(() => cartPage.lineQuantity(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(1);
  await expect.poll(() => cartPage.totalAmount(), { timeout: HYDRATION_TIMEOUT_MS }).toBeLessThan(totalAt2);

  // 1 → 0: remove, and verify the REAL empty state (identified by content, §28 —
  // counting zero lines would also match a broken skeleton).
  await cartPage.removeFirstItem();
  await expect.poll(() => cartPage.isEmpty(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
