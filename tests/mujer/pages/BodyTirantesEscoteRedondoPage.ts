// Promoted from a Builder-generated draft (flow flow_cb437b7c626b, map generated
// 2026-07-30). No longer auto-generated — maintained by hand from here on.
import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';

export class BodyTirantesEscoteRedondoPage extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so navigate the way it was discovered.
   */
  async open(): Promise<void> {
    await this.goto('/es/h-woman.html');
    await this.goto('/es/mujer/ropa/combo-wins-n5214.html');
    await this.goto('/es/body-tirantes-escote-redondo-c0p233573610.html');
  }

  /**
   * Two-part signal (B14 doctrine — a page-TYPE signal alone would pass on any PDP):
   * 1. the product's own title, which also catches the degraded-app-shell signature
   *    (title collapses to the generic "Bershka | Bershka", findings doc §7/§13);
   * 2. the PDP image carousel's "Anterior" control (the Builder's original choice,
   *    live-validated unique on desktop 2026-08-04) — this spec is the representative
   *    of the carousel-signal shape among its sibling drafts.
   * Title taken from the committed map's own capture of this page (crawl 2026-07-30);
   * prefix-matched, not exact, because DES varies the tail across sessions.
   */
  async isLoaded(): Promise<boolean> {
    if (!/^Body tirantes escote redondo/.test(await this.page.title())) return false;
    return locate(this.page, { role: { type: 'button', name: 'Anterior' } }).isVisible();
  }
}
