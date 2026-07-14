// Promoted from a Builder-generated draft (flow flow_0e406081fa85, map generated
// 2026-07-13). No longer auto-generated — maintained by hand from here on.
import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';

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

  async isLoaded(): Promise<boolean> {
    return locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'searchBtn' } }).isVisible();
  }
}
