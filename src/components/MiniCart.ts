import { BaseComponent } from './BaseComponent';

export class MiniCart extends BaseComponent {
  /** Rooted at the cart page's "Cesta (N)" tab — there is no separate drawer/dialog on this site. */
  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async itemCount(): Promise<number> {
    const name = await this.root.textContent();
    const match = name?.match(/\((\d+)\)/);
    return match ? Number(match[1]) : 0;
  }
}
