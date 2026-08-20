// Promoted from a Builder-generated draft (interaction inter_e04838ecc799 /
// flow flow_960ceaa6b799, map generated 2026-07-30). No longer auto-generated —
// maintained by hand from here on.
import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';
import { dismissOnboardingTour } from '../../../src/support/consent';
import { actUntil } from '../../../src/support/retry';

export class VestidosTallasOverlayPage extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so navigate the way it was discovered.
   */
  async open(): Promise<void> {
    await this.goto('/es/h-woman.html');
    await this.goto('/es/mujer/ropa/vestidos-n3802.html');
  }

  /**
   * Two-part signal (B14 doctrine — a page-TYPE signal alone would pass on any PLP):
   * the page's own title (which also catches the degraded-app-shell signature, findings
   * doc §7/§13) plus the PLP's "Filtrar" control. Title taken from the committed map's
   * own capture of this page (crawl 2026-07-30), prefix-matched rather than exact.
   */
  async isLoaded(): Promise<boolean> {
    if (!/^Vestidos de Mujer/.test(await this.page.title())) return false;
    return locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'filterButton' } }).isVisible();
  }

  /**
   * Recovery for the failure observed live 2026-08-04 (full suite, degraded DES window):
   * the PLP rendered and isLoaded() passed, then the SPA bounced the page back to home —
   * so the grid trigger no longer existed and retrying the click was pointless. Unlike
   * `/es/q/{term}` (never reload it — findings doc §7), a category PLP IS server-routable,
   * so re-navigating is a legitimate recovery here rather than a blind reload.
   * The post-navigation wait is what stops it thrashing: without it the next act cycle
   * would see a not-yet-hydrated PLP and re-navigate again. No onTimeout on purpose —
   * if the page never comes back, the caller's bounded click fails and the caller's own
   * deadline reports the single, real diagnostic.
   */
  async ensureOnPlp(): Promise<void> {
    if (await this.isLoaded()) return;
    await this.open();
    await actUntil({
      verify: () => this.isLoaded(),
      immediateFirstCheck: true,
      deadlineMs: 15_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
    });
  }

  /**
   * Act -> verify -> retry (src/support/retry.ts, the CLAUDE.md standing rule): a fire-once
   * click can be silently lost to Vue hydration lag. .first() on the trigger is deliberate —
   * the testId repeats across the product grid and any exemplar opens the overlay (M9 §17).
   *
   * The 5s click bound is load-bearing, not cosmetic (the Builder's interaction template
   * omits it — fixed here on promotion): with no actionTimeout configured, an unbounded
   * click on a locator the SPA re-rendered away waits out the 150s TEST timeout, starving
   * actUntil's own deadline so its diagnostic never fires. Same hang mode root-caused in
   * the checkout login gate and guarded in ProductPage.addToCart (findings doc §24).
   *
   * The 60s deadline is not a blind timeout increase (the standing rule against those):
   * it exists to cover the ensureOnPlp() recovery added above — a recovery cycle costs a
   * re-navigation plus its hydration wait, so the old 20s could never complete one. The
   * happy path pays nothing extra: ensureOnPlp() returns immediately when already loaded.
   */
  async openOverlay(): Promise<void> {
    await actUntil({
      act: async () => {
        await this.ensureOnPlp();
        await dismissOnboardingTour(this.page);
        await locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } })
          .first()
          .click({ timeout: 5_000 });
      },
      verify: () => this.isOverlayOpen(),
      deadlineMs: 60_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('VestidosTallasOverlayPage: the Tallas overlay did not open within the deadline'); },
    });
  }

  /** The revealed size buttons are the overlay's own signal — .first() because the same
   *  size name can repeat once the overlay renders alongside the grid behind it. */
  async isOverlayOpen(): Promise<boolean> {
    return locate(this.page, { role: { type: 'button', name: 'Talla XS' } }).first().isVisible();
  }

  async closeOverlay(): Promise<void> {
    await actUntil({
      act: () => this.page.keyboard.press('Escape'),
      verify: async () => !(await this.isOverlayOpen().catch(() => false)),
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('VestidosTallasOverlayPage: the Tallas overlay did not close on Escape within the deadline'); },
    });
  }
}
