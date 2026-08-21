// Promoted from a Builder-generated draft (flow flow_23fed0ba795d, map generated
// 2026-07-30). No longer auto-generated — maintained by hand from here on.
import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';
import { actUntil } from '../../../src/support/retry';

export class HombreCamisasPage extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so navigate the way it was discovered.
   */
  async open(): Promise<void> {
    await this.goto('/es/h-woman.html');
    await this.goto('/es/h-man.html');
    await this.goto('/es/hombre/ropa/camisas-n3700.html');
  }

  /**
   * Two-part signal (B14 doctrine — a page-TYPE signal alone would pass on any PLP):
   * 1. the page's own title, which also catches the degraded-app-shell signature
   *    (title collapses to the generic "Bershka | Bershka", findings doc §7/§13);
   * 2. the PLP's "Filtrar" control, which proves the grid chrome rendered rather than
   *    the SPA 404 the `-n{digits}` scheme has served before (findings doc §23).
   * Title taken from the committed map's own capture of this page (crawl 2026-07-30);
   * prefix-matched, not exact, because DES varies the tail across sessions.
   */
  async isLoaded(): Promise<boolean> {
    if (!/^Camisas de hombre/.test(await this.page.title())) return false;
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
