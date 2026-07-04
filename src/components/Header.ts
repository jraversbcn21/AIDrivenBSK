import type { Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';
import { SearchBar } from './SearchBar';
import { CartTab } from './CartTab';
import { dismissOnboardingTour } from '../support/consent';

export class Header extends BaseComponent {
  readonly searchBar: SearchBar;
  private readonly page: Page;

  constructor(page: Page) {
    // Scoped by name: the driver.js onboarding tour renders its own <header> (also role=banner),
    // so an unscoped getByRole('banner') resolves to multiple elements while the tour is active.
    super(page.getByRole('banner', { name: 'Cabecera de página' }));
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

  /** There is no mini-cart drawer on this site: "Ir a la cesta" navigates to the full cart page. */
  async goToCart(): Promise<void> {
    await dismissOnboardingTour(this.page); // the tour can (re)appear asynchronously and block this click
    await this.root.getByRole('link', { name: 'Ir a la cesta', exact: true }).click();
  }

  cartTab(): CartTab {
    return new CartTab(this.page.getByRole('tab', { name: /^cesta/i }));
  }
}
