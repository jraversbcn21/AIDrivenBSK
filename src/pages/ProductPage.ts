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

  /** Desktop PDPs render an INLINE size group; mobile PDPs render none (sizes live in the
   * Tallas dialog) — the group's presence is the layout discriminator (confirmed live
   * 2026-08-02, task 6 round 2 of the desktop-layout-interceptor plan). */
  private sizeGroup() {
    return this.page.getByRole('group', { name: /selecciona talla/i });
  }

  /** Poll until either the desktop size group or the mobile add trigger renders. */
  private async detectAddFlow(): Promise<'desktop' | 'mobile'> {
    const group = this.sizeGroup();
    const mobileTrigger = this.page.getByRole('button', { name: 'Añadir a cesta' });
    const deadline = Date.now() + 20_000;
    for (;;) {
      if (await group.isVisible().catch(() => false)) return 'desktop';
      if (await mobileTrigger.isVisible().catch(() => false)) return 'mobile';
      if (Date.now() > deadline) throw new Error('ProductPage: neither the desktop size group nor the mobile add-to-cart trigger rendered within the deadline');
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Selects a size — dual-layout (2026-08-02 live probes):
   * - Desktop: the PDP renders an inline `group "Selecciona talla"` with plain size-name
   *   buttons (XXS…XL) exposing `aria-pressed`; clicking one selects it (verified via
   *   [pressed]). The add itself is a separate "Añadir a la cesta" click (see addToCart).
   * - Mobile: opens the size-selection dialog; picking a size there (addToCart) both selects
   *   and adds (findings §5).
   * Act -> verify -> retry (src/support/retry.ts): a fire-once click can be silently lost to Vue
   * hydration lag (an element is visible/clickable before its handler is attached — confirmed live
   * for search Enter and for the size click, findings doc §7), so keep clicking until the state
   * change is actually observed.
   */
  async selectFirstSize(): Promise<void> {
    if ((await this.detectAddFlow()) === 'desktop') {
      const group = this.sizeGroup();
      const sizes = group.getByRole('button', { disabled: false });
      await actUntil({
        act: async () => {
          await dismissOnboardingTour(this.page);
          await sizes.first().click({ force: true });
        },
        verify: async () => (await group.getByRole('button', { pressed: true }).count()) > 0,
        deadlineMs: 20_000,
        sleepMs: 500,
        sleep: (ms) => this.page.waitForTimeout(ms),
        onTimeout: () => { throw new Error('ProductPage: no size button became selected (aria-pressed) within the deadline'); },
      });
      return;
    }

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
    // Desktop (inline size group present): the add is the "Añadir a la cesta" click, and the
    // only observed confirmation is a NEW dialog appearing (count 0 -> 1 on a page with no
    // permanent dialog — desktop has no mobile nav drawer; baseline-diff mirrors M9 §17).
    // The act re-selects a size first if none is pressed (a lost click deselects nothing,
    // but a re-rendered group can drop the selection).
    if (await this.sizeGroup().isVisible().catch(() => false)) {
      const group = this.sizeGroup();
      const addBtn = this.page.getByRole('button', { name: /^añadir a la cesta$/i }).first();
      const baseline = await this.page.getByRole('dialog').count();
      await actUntil({
        act: async () => {
          await dismissOnboardingTour(this.page);
          if ((await group.getByRole('button', { pressed: true }).count()) === 0) {
            await group.getByRole('button', { disabled: false }).first().click({ force: true }).catch(() => undefined);
          }
          await addBtn.click({ force: true });
        },
        verify: async () => (await this.page.getByRole('dialog').count()) > baseline,
        deadlineMs: 20_000,
        sleepMs: 500,
        sleep: (ms) => this.page.waitForTimeout(ms),
        onTimeout: () => { throw new Error('ProductPage: no confirmation dialog appeared after "Añadir a la cesta" (add not confirmed)'); },
      });
      // The confirmation drawer (add-cart-success modal, holds "Ver cesta (N)"/"Cerrar")
      // stays open and intercepts any subsequent header click — close it before returning.
      const closeBtn = this.page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).first();
      await actUntil({
        act: () => closeBtn.click().catch(() => undefined),
        verify: async () => (await this.page.getByRole('dialog').count()) <= baseline,
        deadlineMs: 10_000,
        sleepMs: 500,
        sleep: (ms) => this.page.waitForTimeout(ms),
        onTimeout: () => { throw new Error('ProductPage: the add-to-cart confirmation drawer did not close'); },
      });
      return;
    }

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
