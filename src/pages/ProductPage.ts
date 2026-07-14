import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';
import { dismissOnboardingTour } from '../support/consent';
import { actUntil } from '../support/retry';

export class ProductPage extends BasePage {
  readonly header: Header;
  constructor(page: Page) {
    super(page);
    this.header = new Header(page);
  }

  /**
   * Opens the size-selection dialog. On this site, picking a size (addToCart) both selects and adds.
   * Act -> verify -> retry (src/support/retry.ts): a fire-once click can be silently lost to Vue
   * hydration lag (an element is visible/clickable before its handler is attached — confirmed live
   * for search Enter and for the size click, findings doc §7), so keep clicking until the dialog
   * is actually open.
   */
  async selectFirstSize(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: /tallas/i });
    const trigger = this.page.getByRole('button', { name: 'Añadir a cesta' });

    await actUntil({
      act: async () => {
        await dismissOnboardingTour(this.page);
        await trigger.click();
      },
      verify: () => dialog.isVisible(),
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('ProductPage: the size-selection dialog did not open within the deadline'); },
    });
  }

  /**
   * Clicks the first in-stock size in the open dialog, which performs the actual add-to-cart.
   * The add is only confirmed when the dialog closes — a force-click on a not-yet-hydrated size
   * button is silently lost (confirmed live: cart ended "Cesta vacía" after a "successful" click),
   * so retry until the dialog actually closes.
   */
  async addToCart(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: /tallas/i });
    // disabled: false on getByRole, NOT filter({ hasNot: ':disabled' }): has/hasNot match
    // DESCENDANTS, so the old filter never excluded a disabled size button itself. Latent
    // since M1, first exposed live 2026-07-14 when the top "camiseta" product's FIRST size
    // went "Coming Soon" [disabled] — .first() landed on it and force-clicks were no-ops.
    const sizes = dialog.getByRole('button', { name: /^Talla /i, disabled: false });

    await actUntil({
      act: async () => {
        await dismissOnboardingTour(this.page);
        await sizes.first().click({ force: true });
      },
      // A throwing isVisible (dialog detached mid-close) counts as closed — keep the catch
      // INSIDE so the negation applies to the caught value, same as the original loop.
      verify: async () => !(await dialog.isVisible().catch(() => false)),
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('ProductPage: the size dialog did not close after selecting a size (add not confirmed)'); },
    });
  }
}
