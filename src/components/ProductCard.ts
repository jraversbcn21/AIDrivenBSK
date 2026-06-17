import { BaseComponent } from './BaseComponent';

export class ProductCard extends BaseComponent {
  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async open(): Promise<void> {
    await this.root.getByRole('link').first().click();
  }
}
