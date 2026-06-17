import { test, expect } from '../../src/fixtures/test';

test('search, filter, and open a product detail page', async ({ homePage, searchResultsPage, productPage, page }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');

  await expect.poll(() => searchResultsPage.firstProduct().isVisible()).toBe(true);
  await searchResultsPage.filters.applyFirstAvailable();

  await searchResultsPage.firstProduct().open();
  await expect(productPage.page).toHaveURL(/product|\/p\//i); // CONFIRM PDP URL pattern on DES
  await expect(page.getByRole('button', { name: /añadir|add to/i })).toBeVisible();
});
