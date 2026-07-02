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
   *
   * Submission has the same hydration problem as the trigger: the input can be *visible*
   * before its Enter handler is attached, so a single fire-once press can be silently lost
   * (confirmed live: first Enter ignored, second navigated). Re-fill + re-press until the
   * SPA actually navigates to the /q/{term} results URL, within the same wall-clock deadline.
   */
  async search(term: string): Promise<void> {
    const page = this.root.page();
    const trigger = page.getByRole('button', { name: 'Buscar', exact: true }).first();
    const input = page.getByPlaceholder('Escribe aquí').first();

    const start = Date.now();
    const deadline = start + 40_000;
    let reloaded = false;
    while (Date.now() < deadline) {
      await dismissOnboardingTour(page);
      await trigger.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(1_000);
      if (await input.isVisible().catch(() => false)) break;
      // DES pre-prod occasionally serves a degraded app shell (empty <main>, raw /ItxHomePage
      // URLs, untranslated strings — confirmed live) where the header search pill never exists,
      // so no amount of clicking opens the overlay. Reload once mid-deadline for a fresh shell.
      if (!reloaded && Date.now() - start > 15_000) {
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
        reloaded = true;
      }
    }

    while (Date.now() < deadline) {
      await input.fill(term).catch(() => undefined);
      await input.press('Enter').catch(() => undefined);
      const navigated = await page
        .waitForURL(/\/q\//, { timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (navigated) return;
    }
    throw new Error(`SearchBar: search for "${term}" did not reach the /q/ results URL within the deadline`);
  }
}
