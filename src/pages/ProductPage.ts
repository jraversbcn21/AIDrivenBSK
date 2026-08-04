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
          await sizes.first().click({ force: true, timeout: 5_000 });
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
   * The desktop add-cart-success drawer, identified by its own CONTENT.
   *
   * Replaces the original baseline-dialog-count diff (`count() > baseline`), which produced
   * 7 false "no confirmation dialog appeared" failures between 2026-08-02 and 2026-08-04
   * before being root-caused from a failure snapshot that showed the drawer plainly on screen,
   * `alert "Producto añadido"` and all, while the test claimed it never appeared (findings §28).
   * A count diff cannot tell WHICH dialog appeared: this site keeps dialogs mounted while
   * visually closed (§17) and desktop renders the search overlay as a dialog too (§24), so any
   * concurrent dialog churn — one closing as the drawer opens — leaves the count flat and the
   * real drawer undetected. Matching on content removes the whole failure class.
   *
   * Two accepted texts, either of which proves the drawer: the "Producto añadido" alert and
   * the "Ver cesta (N)" action. "Ver cesta" is also the desktop header cart link (§24), but
   * this locator is scoped to dialogs and the header is not one.
   */
  private addConfirmationDrawer() {
    return this.page.getByRole('dialog').filter({ hasText: /producto añadido|ver cesta/i }).first();
  }

  private async isAddConfirmed(): Promise<boolean> {
    return this.addConfirmationDrawer().isVisible().catch(() => false);
  }

  /**
   * Clicks the first in-stock size in the open dialog, which performs the actual add-to-cart.
   * The add is only confirmed when the dialog closes — a force-click on a not-yet-hydrated size
   * button is silently lost (confirmed live: cart ended "Cesta vacía" after a "successful" click),
   * so retry until the dialog actually closes.
   */
  async addToCart(): Promise<void> {
    // Desktop (inline size group present): the add is the "Añadir a la cesta" click, confirmed
    // by the add-cart-success drawer appearing. The drawer is identified BY ITS CONTENT
    // (addConfirmationDrawer) — the original baseline dialog-count diff was replaced 2026-08-04
    // after it produced 7 false failures: see that helper's comment for the root cause.
    // The act re-selects a size first if none is pressed (a lost click deselects nothing,
    // but a re-rendered group can drop the selection). Layout re-discriminated via the
    // POLLED detectAddFlow(), not a single-shot isVisible() — a transient re-render must
    // not send a desktop PDP down the mobile branch with a misleading diagnostic.
    if ((await this.detectAddFlow()) === 'desktop') {
      const group = this.sizeGroup();
      const addBtn = this.page.getByRole('button', { name: /^añadir a la cesta$/i }).first();
      const confirmed = (): Promise<boolean> => this.isAddConfirmed();
      // All act-internal actions carry a 5s bound: with no actionTimeout configured, an
      // unbounded click on a locator the SPA re-rendered away waits to the 150s test
      // timeout, starving actUntil's own deadline (the exact hang mode root-caused in the
      // checkout login gate, task 6 round 2 review).
      await actUntil({
        act: async () => {
          // A slow confirmation (>1 cadence) must not trigger a second add — double-adds
          // feed the shared-cart accumulation (§7) and can stray-click the drawer. This
          // guard was ALSO defeated by the old count diff, so a false negative kept
          // re-clicking "Añadir a la cesta" for the full 20s deadline (findings §28).
          if (await confirmed()) return;
          await dismissOnboardingTour(this.page);
          if ((await group.getByRole('button', { pressed: true }).count()) === 0) {
            await group.getByRole('button', { disabled: false }).first().click({ force: true, timeout: 5_000 }).catch(() => undefined);
          }
          await addBtn.click({ force: true, timeout: 5_000 });
        },
        verify: confirmed,
        deadlineMs: 20_000,
        sleepMs: 500,
        sleep: (ms) => this.page.waitForTimeout(ms),
        onTimeout: () => { throw new Error('ProductPage: the add-to-cart confirmation drawer never appeared (add not confirmed)'); },
      });
      // The drawer stays open and intercepts any subsequent header click — close it before
      // returning. Its close button is USUALLY named "Cerrar", but a live capture
      // (2026-08-04) showed it nameless (icon-only, image not yet resolved), so fall back to
      // Escape rather than clicking a positionally-guessed button — the drawer's other
      // buttons are "Tramitar pedido" and "Ver cesta", both of which NAVIGATE. Escape as a
      // close idiom is established for this site's overlays (M9 §17) but is not separately
      // confirmed for this drawer; if it ever proves not to close it, the timeout below says so.
      await actUntil({
        act: async () => {
          const named = this.addConfirmationDrawer().getByRole('button', { name: 'Cerrar' }).first();
          if (await named.isVisible().catch(() => false)) {
            await named.click({ timeout: 5_000 });
            return;
          }
          await this.page.keyboard.press('Escape');
        },
        verify: async () => !(await confirmed()),
        immediateFirstCheck: true, // an auto-closed drawer never enters the act
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

  /** The wishlist button toggles its own accessible name — "Eliminar de la lista de deseos"
   *  IS the confirmation signal that the item is currently in the wishlist (confirmed live,
   *  desktop, 2026-08-04; same name on both layouts, no divergence found here).
   *  .first(): the "También te puede gustar" recommendations carousel repeats this exact
   *  button (same accessible name) per card — same repeated-element hazard as B16/M8b.
   *  A bare role locator strict-mode-violates once the carousel hydrates, and isVisible()'s
   *  .catch(() => false) silently swallows that error, masking an already-successful toggle
   *  (root-caused live 2026-08-04: the main product's button always renders before the
   *  carousel, so .first() is always the main product, never a recommendation card). */
  private wishlistRemoveButton() {
    return this.page.getByRole('button', { name: 'Eliminar de la lista de deseos' }).first();
  }

  async isInWishlist(): Promise<boolean> {
    return this.wishlistRemoveButton().isVisible().catch(() => false);
  }

  async addToWishlist(): Promise<void> {
    if (await this.isInWishlist()) return;
    const addBtn = this.page.getByRole('button', { name: 'Añadir a la lista de deseos' }).first();
    await actUntil({
      act: async () => {
        await dismissOnboardingTour(this.page);
        await addBtn.click({ force: true, timeout: 5_000 });
      },
      verify: () => this.isInWishlist(),
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('ProductPage: wishlist button did not confirm the add within the deadline'); },
    });
  }
}
