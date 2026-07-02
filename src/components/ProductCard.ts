import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';

export class ProductCard extends BaseComponent {
  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  /**
   * Act -> verify -> retry: fire-once clicks can be silently lost to Vue hydration lag on this
   * site (findings doc §7), so keep clicking until the PDP URL (`-c0p<id>.html`, confirmed live)
   * is actually reached.
   */
  async open(): Promise<void> {
    const page = this.root.page();
    const link = this.root.getByRole('link').first();

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await dismissOnboardingTour(page); // the tour can (re)appear asynchronously and block this click
      await link.click().catch(() => undefined);
      const navigated = await page
        .waitForURL(/-c0p\d+\.html/, { timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (navigated) return;
    }
    throw new Error('ProductCard: click did not navigate to a product detail page within the deadline');
  }
}
