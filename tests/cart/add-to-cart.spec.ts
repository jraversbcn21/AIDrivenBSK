import { test, expect } from '../../src/fixtures/test';

// Same measured waits as search-plp-pdp.spec: the search results grid hydrates in ~5s+
// (findings doc §7), and the cart page renders from a slow skeleton — both race the
// default 5s expect timeout under load.
const HYDRATION_TIMEOUT_MS = 20_000;

test('adding a product updates the mini cart', async ({ homePage, searchResultsPage, productPage }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await expect.poll(() => searchResultsPage.firstProduct().isVisible(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await searchResultsPage.firstProduct().open();

  await productPage.selectFirstSize();
  await productPage.addToCart();

  await productPage.header.openMiniCart();
  const miniCart = productPage.header.miniCart();
  await expect.poll(() => miniCart.isVisible(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await expect.poll(() => miniCart.itemCount(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
});
