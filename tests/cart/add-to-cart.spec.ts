import { test, expect } from '../../src/fixtures/test';

test('adding a product updates the mini cart', async ({ homePage, searchResultsPage, productPage }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.firstProduct().open();

  await productPage.selectFirstSize();
  await productPage.addToCart();

  await productPage.header.openMiniCart();
  const miniCart = productPage.header.miniCart();
  await expect.poll(() => miniCart.isVisible()).toBe(true);
  expect(await miniCart.itemCount()).toBeGreaterThan(0);
});
