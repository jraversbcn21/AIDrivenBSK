import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { FiltersPanel } from '../components/FiltersPanel';
import { ProductCard } from '../components/ProductCard';

export class SearchResultsPage extends BasePage {
  readonly filters: FiltersPanel;
  constructor(page: Page) {
    super(page);
    this.filters = new FiltersPanel(page.getByRole('main'));
  }

  firstProduct(): ProductCard {
    // Scoped to <main>: the header's hidden mobile-nav dialog also has listitem/link entries
    // (e.g. "Ir a la cesta"), so an unscoped getByRole('listitem') can resolve to the wrong node.
    // The grid's first listitem is consistently a promo/sale banner tile with no PDP link
    // (confirmed live on /es/q/{term} results) — filter on the PDP URL pattern, not "any link",
    // so .first() lands on a real product instead of the banner.
    return new ProductCard(
      this.page.getByRole('main').getByRole('listitem').filter({ has: this.page.locator('a[href*="-c0p"]') }).first(),
    );
  }

  /**
   * Wait for the results grid to actually render products. The grid typically hydrates in ~5s,
   * but DES pre-prod occasionally serves a /es/q/{term} load that never leaves its pre-results
   * state (editorial content, no product listitems — waiting longer does not resolve it,
   * confirmed live with a 45s budget). Do NOT reload here: /q/{term} is not server-routable —
   * a reload/deep-link lands on the home page (confirmed live), destroying the SPA state. The
   * correct recovery for a dead load is re-running the whole search through the UI, which the
   * test-level retry already does; this method's job is to fail fast and diagnostically.
   */
  async waitForResults(opts: { timeoutMs?: number } = {}): Promise<void> {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.firstProduct().isVisible().catch(() => false)) return;
      await this.page.waitForTimeout(500);
    }
    throw new Error(
      `SearchResultsPage: results grid did not render within ${timeoutMs}ms — dead /q/ load (DES pre-prod noise); the test-level retry re-runs the search`,
    );
  }
}
