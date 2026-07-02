import { test, expect } from '../../src/fixtures/test';

// The /es/q/{term} results grid takes ~5s+ to hydrate after the URL loads (0 listitems at
// +3s -> 66 at +5s, measured live — findings doc §7), which races Playwright's default 5s
// expect timeout under load. Size the specific waits to the measured hydration instead of
// inflating global timeouts.
const HYDRATION_TIMEOUT_MS = 20_000;

test('search, filter, and open a product detail page', async ({ homePage, searchResultsPage, productPage, page }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');

  await expect.poll(() => searchResultsPage.firstProduct().isVisible(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await searchResultsPage.filters.applyFirstAvailable();

  await searchResultsPage.firstProduct().open();
  await expect(productPage.page).toHaveURL(/-c0p\d+\.html/, { timeout: HYDRATION_TIMEOUT_MS });
  await expect(page.getByRole('button', { name: 'Añadir a cesta' })).toBeVisible({ timeout: HYDRATION_TIMEOUT_MS });
});
