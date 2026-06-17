import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';

export class ProductPage extends BasePage {
  readonly header: Header;
  constructor(page: Page) {
    super(page);
    this.header = new Header(page);
  }

  async selectFirstSize(): Promise<void> {
    // CONFIRM: size selector. Often a button group.
    await this.page.getByRole('button', { name: /talla|size/i }).first().click();
    await this.page.getByRole('option').first().click();
  }

  async addToCart(): Promise<void> {
    await this.page.getByRole('button', { name: /añadir|add to/i }).click();
  }
}
