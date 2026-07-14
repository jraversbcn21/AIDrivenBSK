import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';
import { actUntil } from '../support/retry';

export class ProductCard extends BaseComponent {
  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  /**
   * Act -> verify -> retry (src/support/retry.ts): fire-once clicks can be silently lost to Vue
   * hydration lag on this site (findings doc §7), so keep clicking until the PDP URL
   * (`-c0p<id>.html`, confirmed live) is actually reached. The verify carries its own 2s wait
   * (waitForURL), so no fixed sleep between attempts.
   */
  async open(): Promise<void> {
    const page = this.root.page();
    const link = this.root.getByRole('link').first();

    await actUntil({
      act: async () => {
        await dismissOnboardingTour(page); // the tour can (re)appear asynchronously and block this click
        await link.click();
      },
      verify: () => page.waitForURL(/-c0p\d+\.html/, { timeout: 2_000 }).then(() => true).catch(() => false),
      deadlineMs: 20_000,
      sleep: (ms) => page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('ProductCard: click did not navigate to a product detail page within the deadline'); },
    });
  }
}
