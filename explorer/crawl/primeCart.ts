import type { Page } from '@playwright/test';
import { HomePage } from '../../src/pages/HomePage';
import { SearchResultsPage } from '../../src/pages/SearchResultsPage';
import { ProductPage } from '../../src/pages/ProductPage';

export interface PrimeCartDriver {
  /** Navigates to the cart page and reads the "Cesta (N)" tab count (findings §5's fast signal). */
  cartCount(): Promise<number>;
  /** Runs the full known-good add-to-cart UI recipe once. */
  addOneItem(): Promise<void>;
}

export type PrimeCartResult = 'already-primed' | 'primed' | 'failed';

/** Ensures the auth session's cart is non-empty before checkout is approached (D15-f2).
 *  Never throws: a bad DES day degrades checkout knowledge, it never kills the crawl. */
export async function primeCart(driver: PrimeCartDriver): Promise<PrimeCartResult> {
  try {
    if ((await driver.cartCount()) > 0) return 'already-primed';
    await driver.addOneItem();
    return (await driver.cartCount()) > 0 ? 'primed' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Real driver over the src/ page objects (explorer→src import direction, precedented by consent.ts).
 *  The recipe is the plan-mandated known-good path from tests/checkout/checkout-reach.spec.ts —
 *  exercised live only in Task 6 (this module's unit tests use a fake driver, no browser). */
export function playwrightPrimeCartDriver(page: Page): PrimeCartDriver {
  return {
    cartCount: async () => {
      const home = new HomePage(page);
      await home.open();
      await home.header.goToCart();
      return home.header.cartTab().itemCount();
    },
    addOneItem: async () => {
      const home = new HomePage(page);
      await home.open();
      await home.header.searchBar.search('camiseta');
      const results = new SearchResultsPage(page);
      await results.waitForResults();
      await results.firstProduct().open();
      const product = new ProductPage(page);
      await product.selectFirstSize();
      await product.addToCart();
    },
  };
}
