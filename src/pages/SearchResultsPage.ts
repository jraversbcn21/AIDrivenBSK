import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { FiltersPanel } from '../components/FiltersPanel';
import { ProductCard } from '../components/ProductCard';

export class SearchResultsPage extends BasePage {
  readonly filters: FiltersPanel;
  constructor(page: Page) {
    super(page);
    this.filters = new FiltersPanel(page.getByRole('complementary')); // CONFIRM filters container
  }

  firstProduct(): ProductCard {
    // CONFIRM: product grid items. Prefer a testid on the card if present.
    return new ProductCard(this.page.getByRole('listitem').first());
  }
}
