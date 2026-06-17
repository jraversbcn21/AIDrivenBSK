import type { Page } from '@playwright/test';

// Track pages that already have the auto-dismiss handler registered (register once per page).
const handlerInstalled = new WeakSet<Page>();

/**
 * Register a Playwright locator handler that auto-dismisses the OneTrust cookie banner
 * whenever it appears and would intercept an action. OneTrust injects asynchronously and
 * can re-appear across navigations, so a one-shot click is unreliable; this handler fires
 * on demand for the lifetime of the page. Idempotent per page.
 */
export async function installCookieAutoDismiss(page: Page): Promise<void> {
  if (handlerInstalled.has(page)) return;
  handlerInstalled.add(page);
  await page.addLocatorHandler(
    page.locator('#onetrust-accept-btn-handler'),
    async (btn) => {
      await btn.click({ timeout: 5_000 }).catch(() => undefined);
    },
  );
}

/**
 * Pass the DES entry gates so the store (and routes like /es/logon.html) become reachable:
 * install the cookie auto-dismiss handler, then pass the gender/section selection (entering
 * "Mujer" lands on the real store header). Tolerant/idempotent — a session that already
 * passed the gates (e.g. via reused storageState) is a no-op.
 */
export async function acceptConsent(page: Page): Promise<void> {
  await installCookieAutoDismiss(page);

  const gender = page.getByRole('link', { name: /ir a moda mujer|moda mujer/i });
  if (await gender.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await gender.first().click().catch(() => undefined);
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  }
}

/**
 * Dismiss the driver.js onboarding coach-mark (e.g. "TU ESPACIO MMBRS, TU CUENTA") if it is
 * covering the page. It re-appears on fresh sessions across different pages (home, PDP) and its
 * only button navigates away ("ACCEDE Y DESCÚBRELO"), so Escape is the safe dismissal — confirmed
 * live to close the `.driver-overlay` mask without affecting other open dialogs (e.g. size picker).
 */
export async function dismissOnboardingTour(page: Page): Promise<void> {
  if (await page.locator('.driver-overlay').count() > 0) {
    await page.keyboard.press('Escape').catch(() => undefined);
  }
}
