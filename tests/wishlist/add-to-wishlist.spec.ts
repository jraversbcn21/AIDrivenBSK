import { test, expect } from '../../src/fixtures/test';

test('adding a product to the wishlist toggles the button state', async ({ homePage, searchResultsPage, productPage }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();

  await productPage.addToWishlist();

  await expect.poll(() => productPage.isInWishlist()).toBe(true);
});
