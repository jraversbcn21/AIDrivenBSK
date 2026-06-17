import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';

export class SearchBar extends BaseComponent {
  /**
   * The trigger is a CSS hover-revealed pill ("Buscar"). Two independent issues block it:
   * (1) Vue's click listener isn't wired up the instant the trigger becomes actionable
   *     (hydration lag), so `force: true` alone isn't enough — it needs retrying.
   * (2) The driver.js onboarding tour can (re)appear asynchronously at any point and persists;
   *     `force: true` skips Playwright's actionability checks but still dispatches the click at
   *     fixed screen coordinates, so if the tour's full-viewport overlay is on top, the click
   *     lands on the overlay, not the button — confirmed live via failure screenshots showing
   *     the tour still covering the page after many retries. Each attempt must re-dismiss it.
   */
  async search(term: string): Promise<void> {
    const page = this.root.page();
    const trigger = page.getByRole('button', { name: 'Buscar', exact: true }).first();
    const input = page.getByPlaceholder('Escribe aquí').first();

    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      await dismissOnboardingTour(page);
      await trigger.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(1_000);
      if (await input.isVisible().catch(() => false)) break;
    }

    await input.fill(term);
    await input.press('Enter');
  }
}
