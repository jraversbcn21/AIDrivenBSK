import type { Page } from '@playwright/test';
import { suppressOnboardingTour } from '../support/consent';

export abstract class BasePage {
  readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate relative to the configured baseURL. `path` defaults to the locale root. */
  async goto(path = ''): Promise<void> {
    await suppressOnboardingTour(this.page);
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }
}
