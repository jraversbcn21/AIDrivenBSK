import { BaseComponent } from './BaseComponent';
import { dismissOnboardingTour } from '../support/consent';
import { actUntil } from '../support/retry';

export class SearchBar extends BaseComponent {
  /**
   * The trigger is a CSS hover-revealed pill, named differently per layout — confirmed live:
   * **"Buscar"** on mobile (findings §5) and **"Buscar aquí"** on desktop (2026-08-01 probe,
   * design spec 2026-08-01-desktop-layout-interceptor, task 6). Matched with
   * `/^buscar( aquí)?$/i` — anchored so it does NOT also match the distinct "Buscar en tienda"
   * icon button. Before the fix this locator was the mobile exact-name string only: on desktop
   * it matched nothing, and with no `actionTimeout` configured the `click()` waited forever —
   * phase 1's own deadline never fired because `act`'s click, not `verify`, was the thing stuck
   * (findings §24). Two more independent issues block the click even when the name matches:
   * (1) Vue's click listener isn't wired up the instant the trigger becomes actionable
   *     (hydration lag), so `force: true` alone isn't enough — it needs retrying.
   * (2) The driver.js onboarding tour can (re)appear asynchronously at any point and persists;
   *     `force: true` skips Playwright's actionability checks but still dispatches the click at
   *     fixed screen coordinates, so if the tour's full-viewport overlay is on top, the click
   *     lands on the overlay, not the button — confirmed live via failure screenshots showing
   *     the tour still covering the page after many retries. Each attempt must re-dismiss it.
   *
   * The input is `getByPlaceholder('Escribe aquí')` on mobile (§5, a `bds-input` shadow-DOM
   * component with no role) and a `role=searchbox` named "Buscar" on desktop (2026-08-01 probe:
   * `search: - searchbox "Buscar"` inside the opened overlay's `dialog`). Composed with `.or()`
   * so both layouts resolve to a single element regardless of which one rendered.
   *
   * Submission has the same hydration problem as the trigger: the input can be *visible*
   * before its Enter handler is attached, so a single fire-once press can be silently lost
   * (confirmed live: first Enter ignored, second navigated). Re-fill + re-press until the
   * SPA actually navigates to the /q/{term} results URL, within the same wall-clock deadline.
   *
   * Both phases share ONE 40s deadline (src/support/retry.ts): phase 1 times out silently
   * (no onTimeout) and phase 2 spends whatever budget remains — the original composed shape.
   */
  async search(term: string): Promise<void> {
    const page = this.root.page();
    const trigger = page.getByRole('button', { name: /^buscar( aquí)?$/i }).first();
    const input = page.getByPlaceholder('Escribe aquí').or(page.getByRole('searchbox', { name: 'Buscar' })).first();

    const start = Date.now();
    const deadline = start + 40_000;
    let reloaded = false;

    // Phase 1: open the search overlay. No onTimeout — an unopened overlay falls through to
    // phase 2, whose own timeout throws the meaningful diagnostic.
    await actUntil({
      act: async () => {
        await dismissOnboardingTour(page);
        await trigger.click({ force: true });
      },
      verify: async () => {
        if (await input.isVisible().catch(() => false)) return true;
        // DES pre-prod occasionally serves a degraded app shell (empty <main>, raw /ItxHomePage
        // URLs, untranslated strings — confirmed live) where the header search pill never exists,
        // so no amount of clicking opens the overlay. Reload once mid-deadline for a fresh shell.
        if (!reloaded && Date.now() - start > 15_000) {
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
          reloaded = true;
        }
        return false;
      },
      deadlineMs: 40_000,
      sleepMs: 1_000,
      sleep: (ms) => page.waitForTimeout(ms),
    });

    // Phase 2: submit until the SPA navigates. The verify carries its own 2s wait (waitForURL).
    await actUntil({
      act: async () => {
        await input.fill(term).catch(() => undefined); // press still attempted if fill throws
        await input.press('Enter');
      },
      verify: () => page.waitForURL(/\/q\//, { timeout: 2_000 }).then(() => true).catch(() => false),
      deadlineMs: Math.max(0, deadline - Date.now()),
      sleep: (ms) => page.waitForTimeout(ms),
      onTimeout: () => { throw new Error(`SearchBar: search for "${term}" did not reach the /q/ results URL within the deadline`); },
    });
  }
}
