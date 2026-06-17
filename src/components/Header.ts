import type { Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';
import { SearchBar } from './SearchBar';
import { MiniCart } from './MiniCart';

export class Header extends BaseComponent {
  readonly searchBar: SearchBar;
  private readonly page: Page;

  constructor(page: Page) {
    super(page.getByRole('banner'));
    this.page = page;
    this.searchBar = new SearchBar(this.root);
  }

  async isUserLoggedIn(): Promise<boolean> {
    // CONFIRM: a logged-in header typically exposes an account/logout affordance.
    return this.root.getByRole('link', { name: /mi cuenta|account|logout|cerrar sesión/i }).isVisible();
  }

  async openMiniCart(): Promise<void> {
    await this.root.getByRole('link', { name: /cesta|cart|bag/i }).click();
  }

  miniCart(): MiniCart {
    return new MiniCart(this.page.getByRole('dialog', { name: /cesta|cart|bag/i }));
  }
}
