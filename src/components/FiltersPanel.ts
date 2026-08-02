import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';

export class FiltersPanel extends BaseComponent {
  /**
   * Check "Con descuento" (always present, never empty) and apply — dual-layout, confirmed
   * live (2026-08-02, task 6 round 2 of the desktop-layout-interceptor plan):
   * - Mobile: a "Filtrar" button INSIDE main opens a `role=dialog` drawer holding the
   *   checkbox and the "Ver resultados" apply button (findings §5).
   * - Desktop: the "Filtrar" button lives OUTSIDE main (above the grid), and clicking it
   *   slides in a `role=complementary` sidebar that is present-but-off-canvas in the DOM
   *   until then (clicks on its controls while closed are intercepted by grid images —
   *   the same off-canvas container the crawler hit on desktop PLPs, findings §24).
   * The trigger is therefore page-scoped, and the panel scope is composed dialog-or-sidebar.
   * The raw `bds-checkbox` input can reject `check()` (visually replaced by its label);
   * clicking the "Con descuento" label text is the confirmed-working fallback
   * (data-value flipped to "checked", apply landed on ?discount=1).
   */
  async applyFirstAvailable(): Promise<void> {
    const page = this.root.page();
    await dismissOnboardingTour(page); // the tour can (re)appear asynchronously and block this click
    await page.getByRole('button', { name: 'Filtrar' }).first().click();

    const inDialog = page.getByRole('dialog');
    const inSidebar = page.getByRole('complementary');
    const checkbox = inDialog.getByRole('checkbox', { name: /descuento/i })
      .or(inSidebar.getByRole('checkbox', { name: /descuento/i })).first();
    try {
      await checkbox.check({ timeout: 5_000 });
    } catch {
      await inDialog.getByText('Con descuento', { exact: true })
        .or(inSidebar.getByText('Con descuento', { exact: true })).first().click();
    }
    await inDialog.getByRole('button', { name: /ver resultados/i })
      .or(inSidebar.getByRole('button', { name: /ver resultados/i })).first().click();
  }
}
