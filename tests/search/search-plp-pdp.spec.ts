import { test, expect } from '../../src/fixtures/test';

// The /es/q/{term} results grid typically hydrates in ~5s, but some DES pre-prod loads never
// leave their pre-results state at all — waitForResults() handles both (poll + reload-retry,
// findings doc §7). PDP navigation gets the same measured headroom.
const HYDRATION_TIMEOUT_MS = 20_000;

test('search, filter, and open a product detail page', async ({ homePage, searchResultsPage, productPage, page }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');

  await searchResultsPage.waitForResults();
  await expect.poll(() => searchResultsPage.firstProduct().isVisible()).toBe(true);
  await searchResultsPage.filters.applyFirstAvailable();

  await searchResultsPage.firstProduct().open();
  await expect(productPage.page).toHaveURL(/-c0p\d+\.html/, { timeout: HYDRATION_TIMEOUT_MS });
  // PDP add-to-cart button name is layout-dependent (confirmed live 2026-08-02): mobile
  // "Añadir a cesta" (two-step Tallas dialog, §5), desktop "Añadir a la cesta" (inline
  // size group "Selecciona talla"). Anchored regex excludes per-card grid quick-adds
  // ("Añadir a la cesta {producto}").
  await expect(page.getByRole('button', { name: /^añadir a (la )?cesta$/i }).first()).toBeVisible({ timeout: HYDRATION_TIMEOUT_MS });
});
