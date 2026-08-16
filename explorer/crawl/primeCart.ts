import type { Page } from '@playwright/test';
import { HomePage } from '../../src/pages/HomePage';
import { SearchResultsPage } from '../../src/pages/SearchResultsPage';
import { ProductPage } from '../../src/pages/ProductPage';
import { actUntil } from '../../src/support/retry';

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
  } catch (err) {
    // Was a bare `catch { return 'failed'; }` — the actual error was thrown away, so a real
    // seeded-crawl failure (2026-08-16) left no trace of WHY, only "skipping the checkout
    // seed this crawl". `console.warn` matches the crawler's own diagnostic convention
    // (crawler.ts's "interaction skipped on ..." lines) — still never throws.
    console.warn(`primeCart: addOneItem failed — ${String(err)}`);
    return 'failed';
  }
}

/** Real driver over the src/ page objects (explorer→src import direction, precedented by consent.ts).
 *  The recipe is the plan-mandated known-good path from tests/checkout/checkout-reach.spec.ts —
 *  exercised live only in Task 6 (this module's unit tests use a fake driver, no browser). */
export function playwrightPrimeCartDriver(page: Page): PrimeCartDriver {
  return {
    // Root-caused live (2026-08-16): a bare single-shot itemCount() read races the cart
    // tab's own hydration after goToCart() — measured directly, the tab read 0 at t+4055ms
    // then the correct count 500ms later. Every OTHER call site in the suite wraps
    // itemCount() in expect.poll(); this was the one place that didn't, so a genuinely
    // successful add-to-cart was reported as primeCart 'failed' with no error thrown at all
    // (the count-still-0 branch, not the catch). actUntil is the same fix shape as every
    // other cart-reading hydration race in this codebase (§29 family: "not found ≠
    // seen-and-false" applies here as "0 ≠ genuinely empty").
    cartCount: async () => {
      const home = new HomePage(page);
      await home.open();
      await home.header.goToCart();
      const tab = home.header.cartTab();
      let count = 0;
      await actUntil({
        verify: async () => { count = await tab.itemCount(); return count > 0; },
        deadlineMs: 6_000,
        sleepMs: 500,
        sleep: (ms) => page.waitForTimeout(ms),
      });
      return count;
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
