import type { Page } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate relative to the configured baseURL. `path` defaults to the locale root. */
  async goto(path = ''): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }
}
