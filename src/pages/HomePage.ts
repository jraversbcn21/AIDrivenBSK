import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';
import { acceptConsent } from '../support/consent';

export class HomePage extends BasePage {
  readonly header: Header;
  constructor(page: Page) {
    super(page);
    this.header = new Header(page);
  }
  async open(): Promise<void> {
    await this.goto();
    await acceptConsent(this.page);
  }
}
