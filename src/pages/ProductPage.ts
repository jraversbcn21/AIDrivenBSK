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

  /** The main product's own action-buttons panel — add-to-cart and wishlist live in sibling
   *  BEM sections under the same `product-detail-info` root: `mainWishlistPanel()` anchors
   *  to `__header`'s `__labels-wishlist`; this anchors to the sibling `__actions`. CONFIRMED
   *  live via a throwaway ancestor-chain probe (§31's method, 2026-08-13,
   *  `tests/_probe/add-button-anchor-probe.spec.ts`, deleted after landing here):
   *  `button "Añadir a la cesta"` resolves as `button.add-to-cart-button__cta` inside
   *  `div.add-to-cart-button` < `div.product-detail-info__actions` <
   *  `div.product-detail-info` — the exact same root `mainWishlistPanel()` hangs off. A CSS
   *  class anchor is the same deliberate, documented selector-priority deviation as
   *  `mainWishlistPanel()` (no test-id on this button either).
   *
   *  Scoping guards the defect observed live 2026-08-13 (`cart-lifecycle.spec.ts`, task 5):
   *  one intended add produced TWO distinct cart lines across two separate attempts, with
   *  the second product's identity changing between them (a same-base-product color variant
   *  once, an unrelated "SPIDER-MAN"-campaign product the next) — while the cart was
   *  confirmed freshly empty going into each attempt, pinning the extra line on the add
   *  step itself. The probe found only ONE page-wide exact-name match at probe time, so the
   *  live ambiguity did not reproduce in the probe itself — but per §31, a name-matched
   *  locator's match set is a function of STATE and TIME, not a fixed page property, so the
   *  old page-wide `.first()` was unanchored by construction regardless of what any single
   *  snapshot shows. Scoping to this panel removes the exposure at its root instead of
   *  requiring the exact reproduction. */
  private mainProductActionsPanel() {
    return this.page.locator('div.product-detail-info__actions');
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
      // Scoped to the main product's own actions panel, not page-wide (see
      // mainProductActionsPanel() above) — unique within that scope, so no `.first()`:
      // strict mode is re-armed as the ambiguity detector (§31).
      const addBtn = this.mainProductActionsPanel().getByRole('button', { name: /^añadir a la cesta$/i });
      const confirmed = (): Promise<boolean> => this.isAddConfirmed();
      // Every non-throwing click on addBtn is a REAL server-side add whose only visible
      // confirmation (the drawer) can lag several act cycles behind it — each pre-drawer
      // cycle then re-adds a unit that merges into the same line (§32's merge; a line was
      // observed reach qty 13 that way on 2026-08-13, and qty 8 broke cart-lifecycle's
      // exact-count assertion on 2026-08-18, findings §37). The confirmed() guard below
      // cannot see those adds — it reads the same lagging drawer — so the destructive
      // click is additionally capped at MAX_ADD_CLICKS (the crawler's MAX_CLICK_ATTEMPTS
      // precedent, §34): past the cap the act degrades to pure polling for the rest of
      // the deadline, bounding worst-case residue on the shared account to 3 units
      // instead of one add per cycle (~15-25 on the never-appearing-drawer path). A
      // THROWING click is deliberately not counted: it never resolved a target, so
      // nothing landed (§34's retry-on-throw distinction).
      const MAX_ADD_CLICKS = 3;
      let addClicks = 0;
      // §39: the header cart badge is a SECOND, FASTER observable for this guard — probed
      // live 2026-08-19: it updates reactively without navigation ~0.9s before the drawer.
      // "Badge text changed from its pre-click baseline" proves an add landed even while
      // the drawer still lags, so the guard stops re-clicking one cycle sooner than the
      // drawer alone allows. Limits, stated in §39: the badge saturates at "9+" (a ≥9
      // baseline cannot see an increment — the cap above stays as the backstop), and a
      // null read (header mid-hydration) means "unknown", never "changed". The VERIFY
      // stays on the drawer: the drawer is what must be seen and closed before returning.
      const badgeBaseline = await this.header.cartBadgeText();
      let lastBadge: string | null = badgeBaseline;
      const badgeChanged = async (): Promise<boolean> => {
        if (badgeBaseline === null) return false; // unknown baseline — guard inert, drawer + cap rule
        const now = await this.header.cartBadgeText();
        if (now !== null) lastBadge = now;
        return now !== null && now !== badgeBaseline;
      };
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
          if (await badgeChanged()) return; // §39: an add already landed — stop clicking, keep polling for the drawer
          if (addClicks >= MAX_ADD_CLICKS) return; // poll only — see the cap comment above
          await dismissOnboardingTour(this.page);
          if ((await group.getByRole('button', { pressed: true }).count()) === 0) {
            await group.getByRole('button', { disabled: false }).first().click({ force: true, timeout: 5_000 }).catch(() => undefined);
          }
          await addBtn.click({ force: true, timeout: 5_000 });
          addClicks++;
        },
        verify: confirmed,
        deadlineMs: 20_000,
        sleepMs: 500,
        sleep: (ms) => this.page.waitForTimeout(ms),
        // The badge state names which branch this timeout is (§39): baseline→changed means
        // "an add LANDED, the drawer just never rendered" (environment noise, §37's
        // drawer-never class); baseline unchanged means "no add landed at all".
        onTimeout: () => { throw new Error(`ProductPage: the add-to-cart confirmation drawer never appeared (add not confirmed; ${addClicks} add click(s) fired; cart badge "${badgeBaseline ?? '?'}" -> "${lastBadge ?? '?'}")`); },
      });
      // The REASON must survive a late success (§35's d5f9595 lesson): a run that needed
      // >1 click may have landed >1 unit, and without this line a later exact-quantity
      // failure (cart-lifecycle's toBe(2)) cannot be told apart from §32's Sumar-unidad
      // overshoot — the two need opposite fixes.
      if (addClicks > 1) {
        console.warn(`[ProductPage] addToCart needed ${addClicks} clicks before the drawer confirmed — up to ${addClicks} units may have landed (findings §37)`);
      }
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

  /** The main product's own wishlist control panel. The scoping is load-bearing, not
   *  cosmetic: a desktop PDP renders 43 buttons named "Añadir/Eliminar de la lista de
   *  deseos" — 1 here and 42 in the cross-selling grid (measured live 2026-08-10,
   *  findings §31). The earlier page-wide `.first()` (§25) was NOT anchored to the main
   *  product: the button renames itself by state, so once the main product left the
   *  wishlist its button stopped matching the remove-name and `.first()` slid silently
   *  to the first cross-selling card — isInWishlist() answered "is ANY product on this
   *  page in the wishlist" (proven live via a row-D probe, §31).
   *  A CSS class as anchor is a deliberate, documented deviation from the selector
   *  priority: the main button carries NO test-id attribute (ironically the 42
   *  cross-selling ones each carry data-qa-anchor="productItemWishlist"), and this is a
   *  semantic BEM component class, not a positional/structural selector. */
  private mainWishlistPanel() {
    return this.page.locator('div.product-detail-info__labels-wishlist');
  }

  /** The wishlist button toggles its own accessible name — "Eliminar de la lista de deseos"
   *  IS the confirmation signal that the item is currently in the wishlist (confirmed live,
   *  desktop, 2026-08-04; same name on both layouts, no divergence found here).
   *  No .first(): within the main panel this name is unique, and strict mode is the
   *  ambiguity detector — if DES ever renders two, the error IS the information (§31). */
  private wishlistRemoveButton() {
    return this.mainWishlistPanel().getByRole('button', { name: 'Eliminar de la lista de deseos' });
  }

  private wishlistAddButton() {
    return this.mainWishlistPanel().getByRole('button', { name: 'Añadir a la lista de deseos' });
  }

  /** ⚠ Only meaningful once the wishlist control has rendered — see waitForWishlistControl().
   *  Before that its `false` means "not painted yet", NOT "not in the wishlist".
   *  No .catch(() => false): isVisible() on zero matches returns false WITHOUT throwing
   *  (verified offline, §31), so the only error a catch here could ever swallow is a
   *  strict-mode violation — i.e. it could only hide ambiguity, never absence. Callers
   *  inside actUntil still get throw-as-false from retry.ts's own verify catch (deliberate
   *  doctrine there); direct callers (expect.poll) now see the real error. */
  async isInWishlist(): Promise<boolean> {
    return this.wishlistRemoveButton().isVisible();
  }

  /** The wishlist control renders in exactly one of two states, so waiting for EITHER is
   *  what makes isInWishlist()'s answer information rather than a guess (same shape as
   *  detectAddFlow() above). Root-caused live 2026-08-06: a PDP whose body had not painted
   *  yet answered `false` to isInWishlist(), which is indistinguishable from a genuine
   *  "not in the wishlist" — that ambiguity is what let a broken add-locator pass green
   *  (the verify could not tell "my click worked" from "it was already true", the same
   *  class of defect as findings §28). */
  async waitForWishlistControl(): Promise<void> {
    await actUntil({
      // No per-call .catch here: actUntil's own verify catch (retry.ts, deliberate doctrine)
      // already treats a throw as false-and-keep-polling, and a local catch would only
      // re-hide the ambiguity signal isInWishlist() just stopped swallowing (§31).
      verify: async () =>
        (await this.wishlistRemoveButton().isVisible()) ||
        (await this.wishlistAddButton().isVisible()),
      immediateFirstCheck: true,
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('ProductPage: neither wishlist button rendered within the deadline'); },
    });
  }

  async addToWishlist(): Promise<void> {
    await this.waitForWishlistControl();
    if (await this.isInWishlist()) return;
    await actUntil({
      act: async () => {
        await dismissOnboardingTour(this.page);
        await this.wishlistAddButton().click({ force: true, timeout: 5_000 });
      },
      verify: () => this.isInWishlist(),
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('ProductPage: wishlist button did not confirm the add within the deadline'); },
    });
  }

  /** Establishes the "not in the wishlist" starting state so a subsequent add proves a real
   *  transition. Without it the add-test asserts a state that may already have been true —
   *  the shared DES account carries wishlist items across runs (findings §7's no-cleanup lead). */
  async removeFromWishlist(): Promise<void> {
    await this.waitForWishlistControl();
    if (!(await this.isInWishlist())) return;
    await actUntil({
      act: async () => {
        await dismissOnboardingTour(this.page);
        await this.wishlistRemoveButton().click({ force: true, timeout: 5_000 });
      },
      verify: async () => !(await this.isInWishlist()),
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('ProductPage: wishlist button did not confirm the removal within the deadline'); },
    });
  }
}
