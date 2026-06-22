import type { Page } from '@playwright/test';
import { loadEnv } from '../config/env';

// Track pages that already have the auto-dismiss handler registered (register once per page).
const handlerInstalled = new WeakSet<Page>();

// Track pages that already have the onboarding-suppression cookie set (register once per page).
const onboardingCookieInstalled = new WeakSet<Page>();

// driver.js onboarding tour ids confirmed live: "mmbrs" covers home/logon/search/PLP/PDP/cart,
// "mmbrs_hub_mobile" covers /es/member-hub.html specifically (see findings doc §7).
const SEEN_TOUR_IDS = '["mmbrs","mmbrs_hub_mobile"]';

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
 * Pre-seed the cookie the driver.js onboarding tour reads to know which tours a session has
 * already seen, so the tour never triggers in the first place — confirmed live to suppress it
 * across home, logon, member-hub, search, PLP/PDP, and cart (findings doc §7). Must run before
 * the first navigation; call site is `BasePage.goto()`. This is the primary defense against the
 * tour now; `dismissOnboardingTour` remains as a fallback in case a new, not-yet-seen tour id
 * ships later.
 */
export async function suppressOnboardingTour(page: Page): Promise<void> {
  if (onboardingCookieInstalled.has(page)) return;
  onboardingCookieInstalled.add(page);
  const { baseURL } = loadEnv();
  await page.context().addCookies([{ name: 'bsk_onboarding', value: SEEN_TOUR_IDS, url: baseURL }]);
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
