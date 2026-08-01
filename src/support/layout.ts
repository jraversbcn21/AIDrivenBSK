/**
 * Desktop-layout enforcement for the SUITE (the explorer handles its own param via
 * explorer/url.ts withDevice). DES decides mobile/desktop layout SERVER-SIDE per document
 * load via the `device` query param, with no cookie and no persistence (findings §24).
 * BasePage.goto() alone was never enough: click-driven document loads (the gender gate in
 * acceptConsent) reloaded the app shell in MOBILE and the SPA carried that layout for the
 * rest of the test — root-caused live 2026-08-01 (design spec
 * 2026-08-01-desktop-layout-interceptor-design.md).
 */

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
