// Promoted from a Builder-generated draft (flow flow_aa872dbca2f4, map generated
// 2026-07-30). No longer auto-generated — maintained by hand from here on.
import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';

export class CamisetaTirantesRibPage extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so navigate the way it was discovered.
   *
   * This product is the known PERSONALIZABLE variant (findings doc §16/§18): its PDP
   * renders "Personalizar"/"Añadir" instead of the plain add-to-cart button, which is
   * exactly why add-to-cart.spec filters it out of the search grid. This spec only
   * asserts the PDP is reachable and rendered — it never adds to cart — so it guards
   * that variant's reachability without re-hitting the A5 incompatibility.
   */
  async open(): Promise<void> {
    await this.goto('/es/h-woman.html');
    await this.goto('/es/mujer/ropa/combo-wins-n5214.html');
    await this.goto('/es/camiseta-tirantes-rib-c0p233573573.html');
  }

  /**
   * Two-part signal (B14 doctrine — a page-TYPE signal alone would pass on any PDP):
   * 1. the product's own title, which also catches the degraded-app-shell signature
   *    (title collapses to the generic "Bershka | Bershka", findings doc §7/§13);
   * 2. the PDP's add-to-cart control (the Builder's original choice, live-validated
   *    unique on desktop 2026-08-04).
   * Prefix-matched, not exact, for a reason confirmed in the committed map: this same
   * PDP was captured as "Camiseta tirantes rib - Camisetas - Mujer | Bershka" in the
   * anon session and "Camiseta tirantes rib - Mujer | Bershka" in the auth one.
   */
  async isLoaded(): Promise<boolean> {
    if (!/^Camiseta tirantes rib/.test(await this.page.title())) return false;
    return locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'addToCartBtn' } }).isVisible();
  }
}
