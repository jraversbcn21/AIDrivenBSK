import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';

export class FiltersPanel extends BaseComponent {
  /** Open the "Filtrar" drawer, check "Con descuento" (always present, never empty), and apply. */
  async applyFirstAvailable(): Promise<void> {
    const page = this.root.page();
    await dismissOnboardingTour(page); // the tour can (re)appear asynchronously and block this click
    await this.root.getByRole('button', { name: 'Filtrar' }).click();

    const drawer = page.getByRole('dialog');
    await drawer.getByRole('checkbox', { name: /descuento/i }).check();
    await drawer.getByRole('button', { name: /ver resultados/i }).click();
  }
}
