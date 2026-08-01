# Desktop-Layout Interceptor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee every same-origin document load in the test suite carries `device=desktop`, and fail loudly whenever a page renders the mobile layout anyway.

**Architecture:** A `context.route()` interceptor (installed via an auto fixture in `src/fixtures/test.ts` and an explicit call in `tests/auth.setup.ts`) rewrites same-origin document requests lacking a `device` param. `BasePage.goto()` drops its manual append — the interceptor becomes the single chokepoint. A teardown guard asserts the mobile fingerprint (`#category-menu-modal`) is absent after every passing test. Design: `docs/superpowers/specs/2026-08-01-desktop-layout-interceptor-design.md`.

**Tech Stack:** Playwright 1.61 (route interception), Vitest (unit tests for the pure URL predicates), TypeScript strict.

## Global Constraints

- `@typescript-eslint/no-explicit-any` is an error — no `any`, ever.
- `import/no-cycle` is an error at any depth. `layout.ts` may import from `src/config/env` only (mirrors `consent.ts`).
- Never `waitForLoadState('networkidle')` against DES.
- No hardcoded URLs — the origin comes from `loadEnv().baseURL`.
- Package manager is pnpm. Unit tests: `pnpm test:unit`. Gates: `pnpm typecheck`, `pnpm lint`.
- Live runs are executed by Jorge (working agreement) — the plan marks those steps `[JORGE]`.
- The explorer (`explorer/`) is out of scope — it already handles the param per navigation (`withDevice`, `crawler.ts:100-107`).

---

### Task 1: Pure URL predicates with unit tests

**Files:**
- Create: `src/support/layout.ts` (predicates only in this task)
- Test: `src/support/layout.unit.test.ts`

**Interfaces:**
- Produces: `needsDeviceParam(url: string, baseURL: string): boolean`, `withDesktopDevice(url: string): string` — consumed by Task 2's route handler.

- [ ] **Step 1: Write the failing tests**

```ts
// src/support/layout.unit.test.ts
import { describe, expect, it } from 'vitest';
import { needsDeviceParam, withDesktopDevice } from './layout';

const BASE = 'https://des.example.test';

describe('needsDeviceParam', () => {
  it('true for a same-origin URL without a device param', () => {
    expect(needsDeviceParam(`${BASE}/es/h-woman.html`, BASE)).toBe(true);
  });
  it('false for a foreign origin (third-party beacons must never be rewritten)', () => {
    expect(needsDeviceParam('https://www.googletagmanager.com/gtm.js', BASE)).toBe(false);
  });
  it('false when the URL already carries device= (no duplicate params)', () => {
    expect(needsDeviceParam(`${BASE}/es/?device=desktop`, BASE)).toBe(false);
    expect(needsDeviceParam(`${BASE}/es/?device=`, BASE)).toBe(false);
  });
  it('false for an unparseable URL (never throw inside a route handler)', () => {
    expect(needsDeviceParam('not-a-url', BASE)).toBe(false);
  });
  it('true when a query already exists but device is absent', () => {
    expect(needsDeviceParam(`${BASE}/es/camisetas-n4365.html?celement=1`, BASE)).toBe(true);
  });
});

describe('withDesktopDevice', () => {
  it('adds ?device=desktop when the URL has no query', () => {
    expect(withDesktopDevice(`${BASE}/es/h-woman.html`))
      .toBe(`${BASE}/es/h-woman.html?device=desktop`);
  });
  it('appends with & when a query already exists, preserving it', () => {
    expect(withDesktopDevice(`${BASE}/es/camisetas-n4365.html?celement=1`))
      .toBe(`${BASE}/es/camisetas-n4365.html?celement=1&device=desktop`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- src/support/layout.unit.test.ts`
Expected: FAIL — `layout.ts` does not exist / exports missing.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/support/layout.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- src/support/layout.unit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/support/layout.ts src/support/layout.unit.test.ts
git commit -m "feat(foundation): pure URL predicates for the desktop-layout interceptor"
```

---

### Task 2: Interceptor + layout guard

**Files:**
- Modify: `src/support/layout.ts` (append the two async functions)

**Interfaces:**
- Consumes: `needsDeviceParam`, `withDesktopDevice` (Task 1); `loadEnv` from `src/config/env`.
- Produces: `forceDesktopLayout(context: BrowserContext): Promise<void>`, `assertDesktopLayout(page: Page): Promise<void>` — consumed by Task 3's install points.

- [ ] **Step 1: Append the implementation**

Add to `src/support/layout.ts` (imports go at the top of the file):

```ts
import type { BrowserContext, Page } from '@playwright/test';
import { loadEnv } from '../config/env';

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
```

Note `needsDeviceParam(request.url(), origin)`: passing the origin as the base is correct — `new URL(origin)` parses, and same-origin comparison is all the predicate uses it for.

- [ ] **Step 2: Gates**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit -- src/support/layout.unit.test.ts`
Expected: all clean; unit tests still 7/7 (the appended code is exercised live in Task 4, not unit-mocked — thin Playwright glue over the tested predicates).

- [ ] **Step 3: Commit**

```bash
git add src/support/layout.ts
git commit -m "feat(foundation): desktop-layout interceptor + mobile-fingerprint guard"
```

---

### Task 3: Install points — fixtures, auth.setup, BasePage

**Files:**
- Modify: `src/fixtures/test.ts` (add auto fixture)
- Modify: `tests/auth.setup.ts` (explicit install + guard)
- Modify: `src/pages/BasePage.ts:10-18` (drop the manual append)

**Interfaces:**
- Consumes: `forceDesktopLayout`, `assertDesktopLayout` (Task 2).
- Produces: nothing new — behavior wiring only.

- [ ] **Step 1: Auto fixture in `src/fixtures/test.ts`**

Add to the imports:

```ts
import { forceDesktopLayout, assertDesktopLayout } from '../support/layout';
```

Add `desktopLayout: void;` to the `Fixtures` interface, and this fixture to the `base.extend` object (alongside `routeEvidence`):

```ts
  // Rewrites every same-origin document load to carry device=desktop (the SPA keeps the
  // server-decided layout across client-side routing, so one uncovered document load flips
  // the whole test to mobile — findings §24 + design spec 2026-08-01). The teardown guard
  // only runs on passing tests: a real failure's diagnosis must never be polluted by a
  // secondary layout error.
  desktopLayout: [async ({ page }, use, testInfo) => {
    await forceDesktopLayout(page.context());
    await use();
    if (testInfo.status === 'passed') await assertDesktopLayout(page);
  }, { auto: true }],
```

- [ ] **Step 2: Explicit install in `tests/auth.setup.ts`**

`auth.setup.ts` uses the raw base test by design (no auto fixtures). Add the import and two calls:

```ts
import { forceDesktopLayout, assertDesktopLayout } from '../src/support/layout';
```

At the start of the `setup('authenticate', ...)` body, before `login.open()`:

```ts
  await forceDesktopLayout(page.context());
```

After the `isUserLoggedIn` poll, before `storageState`:

```ts
  await assertDesktopLayout(page);
```

- [ ] **Step 3: Simplify `BasePage.goto()`**

Replace the method and its doc comment in `src/pages/BasePage.ts`:

```ts
  /** Navigate relative to the configured baseURL. `path` defaults to the locale root.
   *  DES's desktop layout (`device=desktop` on every same-origin document load) is enforced
   *  by the context-level interceptor in src/support/layout.ts — NOT here. goto() alone was
   *  never a real chokepoint: click-driven document loads (the gender gate) bypassed it and
   *  flipped the suite back to mobile (findings §24, design 2026-08-01). */
  async goto(path = ''): Promise<void> {
    await suppressOnboardingTour(this.page);
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }
```

(`page.goto('')` resolves to the configured `baseURL` — the pre-migration behavior, restored.)

- [ ] **Step 4: Gates**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: all clean, full unit suite green (no unit test asserts on the goto URL shape; if one fails here, read it — do not blind-fix).

- [ ] **Step 5: Commit**

```bash
git add src/fixtures/test.ts tests/auth.setup.ts src/pages/BasePage.ts
git commit -m "fix(foundation): install desktop-layout interceptor suite-wide; goto() drops the manual param"
```

---

### Task 4: Live validation [JORGE]

**Files:** none (execution + evidence reading only).

- [ ] **Step 1 [JORGE]: `pnpm test` (VPN on)**

Expected: 7/7 PASS **with the layout guard active on every spec** — the assertion the
2026-07-29 validation lacked. Documented environment-noise retries (Tallas dialog close,
cart skeleton) remain acceptable per findings §7/§14. If `checkout-reach` fails again on the
cart-degradation signature (cart `<main>` never renders), that is the KNOWN separate issue —
record it, do not chase it inside this task.

- [ ] **Step 2: Read the evidence, not just the exit code**

- Any `layout guard: MOBILE layout detected` failure = the interceptor missed a document
  load → STOP, capture the trace, investigate (service-worker suspect first, design §2.3).
- Spot-check one trace or `reports/route-evidence.json`: the gender-gate hop must now read
  `/es/h-woman.html?device=desktop`.

- [ ] **Step 3 [JORGE]: `pnpm test:generated`**

Expected: 5/5 PASS (generated specs import the same fixtures; their loaded-signals were
built from the desktop map, so a genuinely-desktop suite should agree with them).

- [ ] **Step 4: Commit nothing** — this task produces evidence, not diffs. If any fix was
needed, it belongs to a revisit of Tasks 1-3 with its own commit.

---

### Task 5: Documentation

**Files:**
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (§24 + header line)
- Modify: `CLAUDE.md` (the `BasePage.goto()` desktop mention in "DES live selectors" area)

- [ ] **Step 1: findings §24 correction**

Append a dated subsection to §24 (after the seeded re-crawl note), stating plainly (RIGOR
Regla 7): the migration's "single navigation chokepoint" assumption was wrong; only 2 server
document loads happen per test and the gender-gate click reloaded mobile; every
acceptConsent()-based spec kept testing MOBILE from its second navigation until 2026-08-01,
including the 7/7 "migration complete" run (most specs were green *because* they had not
really changed layout — the one true-desktop spec, bombacho-barrel, was the one that broke);
evidence (trace document-load list, `Acceder` vs `Iniciar sesión`, drawer present vs 0 in the
desktop map); the fix (interceptor + guard, this design/plan); the still-open separate
observation (cart-page degradation behind today's checkout-reach failure). Update the
header's "last updated" line and the Status paragraph's suite claim.

- [ ] **Step 2: CLAUDE.md update**

Wherever CLAUDE.md/the memory of §24 says `BasePage.goto()` forces `device=desktop`, correct
it: the enforcement lives in `src/support/layout.ts` (context-level interceptor installed by
the fixtures + auth.setup), with the mobile-fingerprint guard on passing tests.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/2026-06-17-des-live-validation-findings.md CLAUDE.md
git commit -m "docs: findings §24 correction - suite was still mobile after the migration; interceptor is the real chokepoint"
```
