import { test, expect } from '../../src/fixtures/test';

// Stuck /q/ loads are handled by waitForResults() (poll + reload-retry, findings doc §7).
// The cart page renders from a slow skeleton: the "Cesta (N)" tab count settles ~6-10s after
// navigation (measured live), racing the default 5s expect timeout under load.
const HYDRATION_TIMEOUT_MS = 20_000;

test('adding a product updates the mini cart', async ({ homePage, searchResultsPage, productPage }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();

  await productPage.selectFirstSize();
  await productPage.addToCart();

  await productPage.header.openMiniCart();
  const miniCart = productPage.header.miniCart();
  await expect.poll(() => miniCart.isVisible(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await expect.poll(() => miniCart.itemCount(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
});
