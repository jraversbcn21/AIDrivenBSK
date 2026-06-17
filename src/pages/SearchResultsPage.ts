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
    return new ProductCard(
      this.page.getByRole('main').getByRole('listitem').filter({ has: this.page.getByRole('link') }).first(),
    );
  }
}
