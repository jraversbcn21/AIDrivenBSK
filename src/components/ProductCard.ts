import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';

export class ProductCard extends BaseComponent {
  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async open(): Promise<void> {
    await dismissOnboardingTour(this.root.page()); // the tour can (re)appear asynchronously and block this click
    await this.root.getByRole('link').first().click();
  }
}
