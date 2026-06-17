import { BaseComponent } from './BaseComponent';

export class FiltersPanel extends BaseComponent {
  /** Apply the first available filter option to exercise filtering deterministically. */
  async applyFirstAvailable(): Promise<void> {
    const trigger = this.root.getByRole('button').first();
    await trigger.click();
    const option = this.root.getByRole('checkbox').first();
    await option.check();
  }
}
