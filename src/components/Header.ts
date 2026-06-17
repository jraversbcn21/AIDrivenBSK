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
    // Positive signal: a successful login lands on the MMBRS member hub / account area.
    if (/member-hub|\/account/i.test(this.page.url())) return true;
    // Otherwise: no *visible* "Iniciar sesión" affordance in the header. Use visibility,
    // not count() — the SPA keeps a hidden store header in the DOM after navigation.
    const login = this.root.getByRole('button', { name: /iniciar sesión/i });
    return !(await login.first().isVisible().catch(() => false));
  }

  async openMiniCart(): Promise<void> {
    await this.root.getByRole('link', { name: /cesta|cart|bag/i }).click();
  }

  miniCart(): MiniCart {
    return new MiniCart(this.page.getByRole('dialog', { name: /cesta|cart|bag/i }));
  }
}
