import type { Page } from '@playwright/test';
import { suppressOnboardingTour } from '../support/consent';

export abstract class BasePage {
  readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate relative to the configured baseURL. `path` defaults to the locale root.
   *  DES decides mobile/desktop layout SERVER-SIDE via the `device` query param (confirmed
   *  live 2026-07-29: no cookie, no persistence — every server navigation needs it). The
   *  team tests against desktop, so force it here, at the single navigation chokepoint. */
  async goto(path = ''): Promise<void> {
    await suppressOnboardingTour(this.page);
    const sep = path.includes('?') ? '&' : '?';
    await this.page.goto(`${path}${sep}device=desktop`, { waitUntil: 'domcontentloaded' });
  }
}
