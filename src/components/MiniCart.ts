import { BaseComponent } from './BaseComponent';

export class MiniCart extends BaseComponent {
  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async itemCount(): Promise<number> {
    return this.root.getByRole('listitem').count();
  }
}
