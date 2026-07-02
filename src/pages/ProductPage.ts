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

  /**
   * Opens the size-selection dialog. On this site, picking a size (addToCart) both selects and adds.
   * Act -> verify -> retry: a fire-once click can be silently lost to Vue hydration lag (an element
   * is visible/clickable before its handler is attached — confirmed live for search Enter and for
   * the size click, findings doc §7), so keep clicking until the dialog is actually open.
   */
  async selectFirstSize(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: /tallas/i });
    const trigger = this.page.getByRole('button', { name: 'Añadir a cesta' });

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await dismissOnboardingTour(this.page);
      await trigger.click().catch(() => undefined);
      await this.page.waitForTimeout(500);
      if (await dialog.isVisible().catch(() => false)) return;
    }
    throw new Error('ProductPage: the size-selection dialog did not open within the deadline');
  }

  /**
   * Clicks the first in-stock size in the open dialog, which performs the actual add-to-cart.
   * The add is only confirmed when the dialog closes — a force-click on a not-yet-hydrated size
   * button is silently lost (confirmed live: cart ended "Cesta vacía" after a "successful" click),
   * so retry until the dialog actually closes.
   */
  async addToCart(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: /tallas/i });
    const sizes = dialog.getByRole('button', { name: /^Talla /i });

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await dismissOnboardingTour(this.page);
      await sizes.filter({ hasNot: this.page.locator(':disabled') }).first().click({ force: true }).catch(() => undefined);
      await this.page.waitForTimeout(500);
      if (!(await dialog.isVisible().catch(() => false))) return; // dialog closed => add completed
    }
    throw new Error('ProductPage: the size dialog did not close after selecting a size (add not confirmed)');
  }
}
