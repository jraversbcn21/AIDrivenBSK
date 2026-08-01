# Desktop-Layout Interceptor — Design

**Date:** 2026-08-01
**Status:** Approved by Jorge (approach 1 + guard, this session)
**Related:** findings §24 (desktop migration), `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md`

## 1. Problem

The 2026-07-29 desktop migration (§24) forced `device=desktop` at `BasePage.goto()` — the
assumed single navigation chokepoint. It is not one. Root-caused live on 2026-08-01 from the
`checkout-reach` failure trace (qa-cycle run, 2026-08-01T20:08): the whole test produced only
**two server document loads** —

1. `GET /es/?device=desktop` — `BasePage.goto()`, desktop ✓
2. `GET /es/h-woman.html` — the gender-gate **click** in `acceptConsent()`, no param → **mobile** ✗

DES decides layout server-side per document load with no persistence (§24), and the SPA
carries that layout through all subsequent client-side route changes. So every hand-written
spec that passes through `acceptConsent()` (login, search, add-to-cart, both checkout specs)
has been testing the **mobile** layout from its second navigation onward — including the
2026-07-29 "migration complete, 7/7 green" run, where most specs passed precisely because
they had never really changed layout. Evidence (both failure snapshots vs the desktop map):
the mobile nav drawer `dialog "Categorías y productos"` present (0 elements in the desktop
map) and the header login button named `"Acceder"` (mobile) instead of `"Iniciar sesión"`.

Two scoping facts:

- **The explorer is NOT affected.** Every crawl navigation is a fresh `goto` through
  `withDevice()`, and `crawler.ts:100-107` already re-navigates when a server redirect strips
  the param. The desktop map's fingerprint (0 mobile-drawer elements) is genuine. This fix is
  `src/` + `tests/` only.
- **The layout leak surface is document loads only.** SPA client-side routing cannot lose the
  param because it never hits the server. Today the only click-driven document load in the
  suite is the gender gate — but the fix must not depend on that staying true (Jorge's call:
  global guarantee, not a point patch).

Separate issue, explicitly out of scope: the `checkout-reach` failure's *proximate* cause
this run was the documented cart-page degradation (cart `<main>` never rendered; §5/§23).
This design does not claim to fix that.

## 2. Decision

**Approach 1 + layout guard** (chosen over: intercepting all same-origin requests — YAGNI,
API calls don't decide layout; and belt-and-braces keeping the `goto()` append — two
mechanisms for one job confuse the next reader; the guard is the real safety net).

### 2.1 `src/support/layout.ts` (new)

- `forceDesktopLayout(context: BrowserContext): Promise<void>` — registers a
  `context.route()` handler that rewrites **same-origin document requests** lacking a
  `device` param to carry `device=desktop`, via `route.continue({ url })`. All other
  requests (third-party, fetch/XHR, beacons, non-document resources) continue untouched.
  Idempotent per context (`WeakSet`, the `consent.ts` pattern).
- `assertDesktopLayout(page: Page): Promise<void>` — throws with an explicit
  `"mobile layout detected at <URL>"` message if the mobile fingerprint
  (`#category-menu-modal`, confirmed live in §24: count 1 on mobile, 0 on desktop) is
  present.
- Decision logic extracted as pure, unit-testable functions:
  `needsDeviceParam(url: string, baseURL: string): boolean` and
  `withDesktopDevice(url: string): string`.

### 2.2 Install points

- `src/fixtures/test.ts` — an **auto fixture** calls `forceDesktopLayout()` before each
  test and runs `assertDesktopLayout()` on teardown **only when the test passed**
  (`testInfo.status === 'passed'`) so a real failure's diagnosis is never polluted by a
  secondary layout error.
- `tests/auth.setup.ts` — explicit `forceDesktopLayout(page.context())` call at the start
  (it uses the raw base test by design and gets no auto fixture), plus the guard after login.
- `src/pages/BasePage.ts` — `goto()` drops the manual param append; its doc comment points
  to `layout.ts` as the single chokepoint.

### 2.3 Service worker — deliberate non-decision

DES registers a service worker, and Playwright routes do not intercept SW-served requests by
default. We start **without** `serviceWorkers: 'block'`: today's trace proves the
gender-gate document load did reach the server (the interceptor would have fired), and
blocking the SW is a browser-behavior change with unknown side effects — not added
speculatively. If live validation ever shows document loads bypassing the interceptor, the
guard fails loudly and `serviceWorkers: 'block'` in the context options is the known,
documented fix.

## 3. Edge cases

- **Server redirects:** a 302 `Location` carries no param, but the follow-up request passes
  through the interceptor again → covered by mechanics (the same hole `crawler.ts:100-107`
  patches by hand).
- **URLs already carrying `device=`:** untouched — no duplicate params. This also makes the
  interceptor compose safely with any leftover explicit appends during rollout.
- **Guard on checkout:** vacuous (`/es/checkout.html` renders no store chrome in either
  layout, §23) — accepted and documented, not a gap. The guard is discriminating on every
  store page.
- **Generated specs:** must be confirmed during implementation to import `test` from
  `src/fixtures/test.ts` (anything on the raw test would silently skip the auto fixture).

## 4. Testing & validation

- **Unit (Vitest, `src/support/layout.unit.test.ts`):** the pure predicates — same-origin
  vs foreign origin, already-has-param, with/without existing query, non-document types
  excluded (the resourceType filter itself is exercised via the route predicate, not mocked
  Playwright internals).
- **Live:** full `pnpm test`. Success criterion is not merely green — it is green **with the
  guard active on every spec**, the assertion the 2026-07-29 validation lacked. A
  `checkout-reach` re-run doubles as a fresh data point on whether today's cart degradation
  persists (environment noise, tracked separately).
- **Docs:** findings §24 gains the correction (the migration's chokepoint assumption was
  wrong; suite specs kept testing mobile until this fix); CLAUDE.md's `BasePage.goto()`
  mention updated to name the interceptor.

## 5. Non-goals

- No crawler changes (`explorer/` already handles the param per navigation).
- No fix attempt for the cart-page degradation behind today's `checkout-reach` failure.
- No `EXPLORER_DEVICE`-style configurability for the suite: the team tests desktop; the
  suite hardcodes desktop until a real need says otherwise (the mobile layout remains
  reachable via manual probes without the fixture).
