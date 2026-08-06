// Promoted from a Builder-generated draft (flow flow_2ad0f792ba8d, map generated
// 2026-07-30). No longer auto-generated — maintained by hand from here on.
import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';

export class PantalonesCapriPlpPage extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so navigate the way it was discovered.
   */
  async open(): Promise<void> {
    await this.goto('/es/h-woman.html');
    await this.goto('/es/mujer/ropa/pantalones-n3888.html');
    await this.goto('/es/mujer/ropa/pantalones/capri-c1010873129.html');
  }

  /**
   * Two-part signal (B14 doctrine — a page-TYPE signal alone would pass on any PLP):
   * 1. the page's own title ("Capri | Bershka", unique in the committed map — checked,
   *    unlike the "COMBO WINS %" title on the sibling PLP), which also catches the
   *    degraded-app-shell signature (title collapses to "Bershka | Bershka", §7/§13);
   * 2. the PLP's "Filtrar" control (`data-qa-anchor="filterButton"`) — present-but-
   *    off-canvas on desktop until opened, but still visible to Playwright (§24).
   */
  async isLoaded(): Promise<boolean> {
    if (!/^Capri/.test(await this.page.title())) return false;
    return locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'filterButton' } }).isVisible();
  }
}
