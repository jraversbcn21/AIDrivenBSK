import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';
import { dismissOnboardingTour } from '../support/consent';

export class ProductPage extends BasePage {
  readonly header: Header;
  constructor(page: Page) {
    super(page);
    this.header = new Header(page);
  }

  /** Opens the size-selection dialog. On this site, picking a size (addToCart) both selects and adds. */
  async selectFirstSize(): Promise<void> {
    await dismissOnboardingTour(this.page);
    await this.page.getByRole('button', { name: 'Añadir a cesta' }).click();
    await dismissOnboardingTour(this.page); // the tour can re-show once the dialog opens
  }

  /** Clicks the first in-stock size in the open dialog, which performs the actual add-to-cart. */
  async addToCart(): Promise<void> {
    await dismissOnboardingTour(this.page); // the tour can (re)appear asynchronously and block this click
    const dialog = this.page.getByRole('dialog', { name: /tallas/i });
    const sizes = dialog.getByRole('button', { name: /^Talla /i });
    await sizes.filter({ hasNot: this.page.locator(':disabled') }).first().click({ force: true });
  }
}
