// Promoted from a Builder-generated draft (flow flow_0e406081fa85, map generated
// 2026-07-13). No longer auto-generated — maintained by hand from here on.
import { BasePage } from '../../../src/pages/BasePage';

export class BombachoBarrelPage extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so navigate the way it was discovered.
   */
  async open(): Promise<void> {
    await this.goto('/es/h-woman.html');
    await this.goto('/es/mujer/ropa/pantalones-n3888.html');
    await this.goto('/es/mujer/ropa/pantalones/bombacho-%7c-barrel-c1010868620.html');
  }

  /**
   * Page-specific signal (B14 doctrine): the page's own "Bombacho | Barrel" heading.
   * The original generated signal (testId `searchBtn`) is unique on MOBILE but resolves
   * to 4 elements on DESKTOP (strict-mode violation, findings doc §24) — testId uniqueness
   * is layout-dependent. Desktop renders TWO headings with this name (confirmed live
   * 2026-07-29) and either one proves the right page rendered, so `.first()` is safe here.
   */
  async isLoaded(): Promise<boolean> {
    return this.page.getByRole('heading', { name: 'Bombacho | Barrel' }).first().isVisible();
  }
}
