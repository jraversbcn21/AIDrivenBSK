import type { Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';
import { actUntil } from '../support/retry';

/**
 * DES's site-wide footer — shared chrome, so a Component Object (like Header), not a Page
 * Object. The crawler already tags ~760 map elements with `component: 'Footer'` (B14), which
 * is also why `pnpm ask "navega por el footer"` correctly answers no-match: the footer is not
 * a flow, it is a piece repeated inside every page.
 *
 * Scoped by name, mirroring Header's reasoning: an unscoped getByRole('contentinfo') is one
 * strict-mode violation away from any future second landmark.
 */
export class Footer extends BaseComponent {
  private readonly page: Page;

  constructor(page: Page) {
    super(page.getByRole('contentinfo', { name: 'Pie de página' }));
    this.page = page;
  }

  /**
   * The landmark itself is the render signal — deliberately NOT an inventory of the footer's
   * sections ("Ayuda", "Te puede interesar", "Síguenos en redes sociales"…). Those are
   * marketing content that Bershka reorganizes; asserting them would produce noise on every
   * reshuffle instead of catching a defect. Confirmed live on desktop 2026-08-04.
   */
  async isVisible(): Promise<boolean> {
    return this.root.isVisible().catch(() => false);
  }

  /**
   * Navigates via the footer's "Nuestras tiendas" link (confirmed live on desktop 2026-08-04:
   * `link "Nuestras tiendas"` → `/es/store-locator.html`). Chosen over the other footer links
   * because it stays on the store's own origin and touches neither session nor cart.
   *
   * Act -> verify -> retry (the CLAUDE.md standing rule): a fire-once click can be silently
   * lost to Vue hydration lag. Two guards learned from earlier live failures: the click is
   * BOUNDED (an unbounded click on a re-rendered locator burns the whole test timeout and
   * starves this deadline — findings §24/§26), and the act returns early once the URL has
   * changed, so a navigation slower than one cadence does not fire a second stray click
   * (same precedent as ProductPage.addToCart).
   */
  async goToStoreLocator(): Promise<void> {
    const arrived = (): boolean => /store-locator/.test(this.page.url());
    const link = this.root.getByRole('link', { name: 'Nuestras tiendas' }).first();

    await actUntil({
      act: async () => {
        if (arrived()) return;
        await dismissOnboardingTour(this.page);
        await link.click({ timeout: 5_000 });
      },
      verify: () => Promise.resolve(arrived()),
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('Footer: "Nuestras tiendas" did not reach the store locator within the deadline'); },
    });
  }
}
