import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';
import { actUntil } from '../support/retry';

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
    const inDialog = page.getByRole('dialog');
    const inSidebar = page.getByRole('complementary');
    const checkbox = inDialog.getByRole('checkbox', { name: /descuento/i })
      .or(inSidebar.getByRole('checkbox', { name: /descuento/i })).first();
    const labelText = inDialog.getByText('Con descuento', { exact: true })
      .or(inSidebar.getByText('Con descuento', { exact: true })).first();

    // Open the panel under the standing act->verify->retry doctrine (a fire-once Filtrar
    // click can be silently lost to hydration lag, findings §7). The verify is a TRIAL
    // click on the label text, not isVisible(): the off-canvas desktop sidebar's controls
    // count as "visible" to Playwright while closed (their clicks fail intercepted/outside
    // viewport — the exact captured failure mode), so clickability is the only reliable
    // open/closed discriminator. This also separates "panel never opened" (diagnostic
    // here) from "bds-checkbox rejects check()" (the label fallback below). All clicks
    // carry bounds: with no actionTimeout configured, an unbounded click on a missing
    // locator starves the deadline (task 6 round 2 review).
    await actUntil({
      act: async () => {
        await dismissOnboardingTour(page);
        await page.getByRole('button', { name: 'Filtrar' }).first().click({ timeout: 5_000 });
      },
      verify: () => labelText.click({ trial: true, timeout: 1_000 }).then(() => true).catch(() => false),
      immediateFirstCheck: true,
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('FiltersPanel: the filter panel did not open within the deadline'); },
    });

    try {
      await checkbox.check({ timeout: 5_000 });
    } catch {
      await labelText.click({ timeout: 5_000 });
    }
    await inDialog.getByRole('button', { name: /ver resultados/i })
      .or(inSidebar.getByRole('button', { name: /ver resultados/i })).first().click({ timeout: 10_000 });
  }
}
