// Promoted from a Builder-generated draft (flow flow_599701798fbb, map generated
// 2026-07-30). No longer auto-generated — maintained by hand from here on.
import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';
import { actUntil } from '../../../src/support/retry';

export class PantalonesComboWinsPlpPage extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so navigate the way it was discovered.
   */
  async open(): Promise<void> {
    await this.goto('/es/h-woman.html');
    await this.goto('/es/mujer/ropa/pantalones-n3888.html');
    await this.goto('/es/mujer/ropa/pantalones/combo-wins-%25-c1010897164.html');
  }

  /**
   * Two-part signal (B14 doctrine — a page-TYPE signal alone would pass on any PLP).
   * Honest limitation carried over from findings §26: "COMBO WINS %" is the title of
   * several distinct Mujer combo-wins pages in the committed map (checked: 6 hits),
   * so the title proves the right CAMPAIGN, not uniquely this pantalones sub-PLP —
   * the structural signal below is what actually anchors this page.
   * 1. the page's title prefix (campaign-level check, still catches the degraded-shell
   *    signature, §7/§13);
   * 2. the PLP's "Filtrar" control (`data-qa-anchor="filterButton"`) — present-but-
   *    off-canvas on desktop until opened, but still visible to Playwright (§24).
   */
  async isLoaded(): Promise<boolean> {
    if (!/^COMBO WINS %/.test(await this.page.title())) return false;
    return locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'filterButton' } }).isVisible();
  }

  /** §26/§43 recovery: re-navigate if the §26 SPA bounce left the page off this PLP. */
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
}
