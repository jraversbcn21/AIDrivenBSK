import type { Page } from '@playwright/test';
import { suppressOnboardingTour } from '../support/consent';

export abstract class BasePage {
  readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate relative to the configured baseURL. `path` defaults to the locale root.
   *  DES's desktop layout (`device=desktop` on every same-origin document load) is enforced
   *  by the context-level interceptor in src/support/layout.ts — NOT here. goto() alone was
   *  never a real chokepoint: click-driven document loads (the gender gate) bypassed it and
   *  flipped the suite back to mobile (findings §24, design 2026-08-01). */
  async goto(path = ''): Promise<void> {
    await suppressOnboardingTour(this.page);
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }
}
