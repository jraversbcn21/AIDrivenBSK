/**
 * Desktop-layout enforcement for the SUITE (the explorer handles its own param via
 * explorer/url.ts withDevice). DES decides mobile/desktop layout SERVER-SIDE per document
 * load via the `device` query param, with no cookie and no persistence (findings §24).
 * BasePage.goto() alone was never enough: click-driven document loads (the gender gate in
 * acceptConsent) reloaded the app shell in MOBILE and the SPA carried that layout for the
 * rest of the test — root-caused live 2026-08-01 (design spec
 * 2026-08-01-desktop-layout-interceptor-design.md).
 */

import type { BrowserContext, Page } from '@playwright/test';
import { loadEnv } from '../config/env';

const DEVICE_PARAM = 'device';
const DEVICE_VALUE = 'desktop';

/** True when `url` is same-origin with `baseURL` and does not already carry `device=`.
 *  Never throws — an unparseable URL is simply not ours to rewrite. */
export function needsDeviceParam(url: string, baseURL: string): boolean {
  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(baseURL);
  } catch {
    return false;
  }
  return target.origin === base.origin && !target.searchParams.has(DEVICE_PARAM);
}

/** Returns `url` with `device=desktop` appended (caller guarantees it parses — see
 *  needsDeviceParam, which gates every call site). */
export function withDesktopDevice(url: string): string {
  const target = new URL(url);
  target.searchParams.set(DEVICE_PARAM, DEVICE_VALUE);
  return target.href;
}

// Track contexts that already have the interceptor registered (register once per context —
// the consent.ts WeakSet pattern).
const interceptorInstalled = new WeakSet<BrowserContext>();

/** Mobile fingerprint confirmed live (findings §24): the mobile nav drawer exists on every
 *  mobile store page (count 1) and does not exist at all on desktop (count 0). */
const MOBILE_FINGERPRINT = '#category-menu-modal';

/**
 * Register a context-wide route that rewrites SAME-ORIGIN DOCUMENT requests lacking a
 * `device` param to carry `device=desktop`. Fetch/XHR, beacons, and third-party requests
 * continue untouched (layout is only decided on document loads). Covers goto(), click-driven
 * document loads, and server-redirect follow-ups (each redirect hop re-enters the route).
 * Idempotent per context.
 *
 * Known blind spot, deliberate (design §2.3): requests served by DES's service worker bypass
 * Playwright routes. Live evidence says document loads reach the server today; if that ever
 * changes, assertDesktopLayout fails loudly and `serviceWorkers: 'block'` in the context
 * options is the documented fix — not added speculatively.
 */
export async function forceDesktopLayout(context: BrowserContext): Promise<void> {
  if (interceptorInstalled.has(context)) return;
  interceptorInstalled.add(context);
  const origin = new URL(loadEnv().baseURL).origin;
  await context.route(
    (url) => url.origin === origin,
    async (route) => {
      const request = route.request();
      if (request.resourceType() === 'document' && needsDeviceParam(request.url(), origin)) {
        await route.continue({ url: withDesktopDevice(request.url()) });
      } else {
        await route.continue();
      }
    },
  );
}

/**
 * Layout regression guard: throw if the page is rendering the MOBILE layout. Vacuous on
 * pages without store chrome (checkout renders none in either layout, findings §23) —
 * discriminating on every store page. Skips silently if the page is already closed (a test
 * that legitimately closed its page must not fail its teardown here).
 */
export async function assertDesktopLayout(page: Page): Promise<void> {
  if (page.isClosed()) return;
  const drawers = await page.locator(MOBILE_FINGERPRINT).count();
  if (drawers > 0) {
    throw new Error(
      `layout guard: MOBILE layout detected at ${page.url()} — the mobile nav drawer ` +
      `(${MOBILE_FINGERPRINT}) is present; desktop renders none (findings §24). ` +
      'A document load bypassed the desktop-layout interceptor (service worker? see design §2.3).',
    );
  }
}
