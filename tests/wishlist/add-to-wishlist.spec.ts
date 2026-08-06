import { test, expect } from '../../src/fixtures/test';

test('adding a product to the wishlist toggles the button state', async ({ homePage, searchResultsPage, productPage }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();

  // Guarantee the starting state: the shared DES account carries wishlist items across runs
  // (findings §7), so asserting `true` after an add proves nothing unless we know it was
  // `false` first. Without this the test cannot fail — confirmed live 2026-08-06.
  await productPage.removeFromWishlist();
  await expect.poll(() => productPage.isInWishlist()).toBe(false);

  await productPage.addToWishlist();

  await expect.poll(() => productPage.isInWishlist()).toBe(true);
});
