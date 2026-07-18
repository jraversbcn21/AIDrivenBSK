# D15 Phase 2 — Checkout Inner Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture checkout's inner structure (strict read-only), assert it with a permanent spec, and feed a Checkout flow into the canonical map so `pnpm ask "checkout"` resolves.

**Architecture:** Evidence ladder (design doc `docs/superpowers/specs/2026-07-18-d15-phase2-checkout-inner-design.md`): a temporary probe measures checkout's settle timing, dumps its inner structure, and tests server-routability; the routability answer picks branch C (checkout as an auth-session crawl seed behind a `primeCart` step) or branch B (dedicated post-crawl scripted visit). Both branches share the `seedCheckout` config flag, `primeCart`, and the existing settle+extract pipeline. `intent/` needs zero changes — `checkoutBlindSpot` (`intent/resolve.ts:140`) is computed from the map, so it dissolves when a Checkout flow exists.

**Tech Stack:** Playwright + TypeScript, Vitest for unit tests, tsx CLIs. Package manager pnpm.

## Global Constraints

- `@typescript-eslint/no-explicit-any` is an error — no `any`, ever. `import/no-cycle` is an error (explorer→src imports are fine and precedented; never src→explorer).
- Selector priority: `getByTestId` → `getByRole` → `getByLabel` → `getByPlaceholder`. No XPath, no CSS position selectors.
- **Strict read-only inside checkout:** the only permitted click anywhere past the cart is "Tramitar pedido" (phase-1-validated). Never focus, fill, or click anything on `/es/checkout.html`. Never touch payment methods beyond reading their listed names from the aria tree.
- Never `waitForLoadState('networkidle')` on DES. Every state-changing interaction goes through `actUntil` (`src/support/retry.ts`).
- `EXPLORER_SEED_CHECKOUT` defaults **off**; a crawl without it must behave byte-identically to today.
- Specs guard with `test.skip(!env.checkoutAllowed, ...)`. Live work requires VPN (GlobalProtect) — if DES is unreachable, stop and say so; never fabricate results.
- Conventional Commits (`type(scope): ...`). All validation claims need the command run and its real output (RIGOR Regla 5/7).

---

### Task 1: Live probe — settle timing, inner structure, routability; findings §23; branch decision

**Files:**
- Create (temporary): `tests/_probe/d15-checkout-inner-probe.spec.ts` (deleted at the end of this task)
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (append §23)

**Interfaces:**
- Produces: findings §23 with (a) measured settle profile for `/es/checkout.html`, (b) the inner-structure aria dump (steps, shipping form, listed payment methods), (c) the routability verdict and the **chosen branch: C or B** — Tasks 4C/4B and 5 consume this.

- [ ] **Step 1: Write the probe spec**

```ts
// TEMPORARY probe (D15 phase 2, Task 1) — DELETE after findings §23 is written.
// Answers, in one live session: Q1 settle timing of /es/checkout.html, Q2 inner
// structure (read-only aria dump), Q3 server-routability with a non-empty cart.
// Q3 runs LAST so a redirect cannot contaminate the Q1/Q2 capture.
import { test, expect } from '../../src/fixtures/test';
import { actUntil } from '../../src/support/retry';

test('D15-f2 probe: checkout settle, structure, routability', async ({ page, homePage, searchResultsPage, productPage, env }) => {
  test.skip(!env.checkoutAllowed, 'checkout probing only where checkoutAllowed');
  test.setTimeout(240_000);

  // Prime the cart via the known-good UI recipe (checkout-reach.spec.ts's own path).
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();
  await productPage.selectFirstSize();
  await productPage.addToCart();
  await productPage.header.goToCart();

  const trigger = page.getByRole('button', { name: /tramitar pedido/i })
    .or(page.getByRole('link', { name: /tramitar pedido/i }))
    .first();
  await actUntil({
    act: () => trigger.click({ force: true }),
    verify: () => page.waitForURL(/\/checkout\.html/, { timeout: 2_000 }).then(() => true).catch(() => false),
    deadlineMs: 30_000,
    sleep: (ms) => page.waitForTimeout(ms),
    onTimeout: () => { throw new Error('probe: Tramitar pedido never reached checkout'); },
  });
  const navigatedAt = Date.now();

  // Q1 — settle profile: timed snapshots. Log length + a stable hash-ish prefix so the
  // console output shows WHEN the tree stops changing.
  const marks = [2_000, 5_000, 8_000, 12_000, 20_000];
  let last = '';
  for (const mark of marks) {
    const elapsed = Date.now() - navigatedAt;
    if (mark > elapsed) await page.waitForTimeout(mark - elapsed);
    const snap = await page.locator('body').ariaSnapshot();
    console.log(`[Q1] +${mark}ms len=${snap.length} changed=${snap !== last}`);
    last = snap;
  }

  // Q2 — full structural dump once stable (read-only: this probe never focuses/fills/clicks).
  console.log('[Q2] FULL ARIA DUMP START');
  console.log(last);
  console.log('[Q2] FULL ARIA DUMP END');
  expect(last.length).toBeGreaterThan(0);

  // Q3 — routability, LAST: direct goto with the same non-empty cart. Twice, per §7's
  // noise-discrimination doctrine, if the first result is a redirect.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto('/es/checkout.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5_000);
    const landed = page.url();
    console.log(`[Q3] attempt ${attempt}: goto /es/checkout.html landed on ${landed}`);
    if (/\/checkout\.html/.test(landed)) break; // routable — no second attempt needed
  }
});
```

- [ ] **Step 2: Run the probe live**

Run: `pnpm exec playwright test tests/_probe/d15-checkout-inner-probe.spec.ts --project=chromium`
Expected: PASS (1 test), console carrying `[Q1]`/`[Q2]`/`[Q3]` blocks. If the first attempt hits the documented Tallas-dialog noise (§14/§16/§18), `retries: 1` re-runs it — same as phase 1. If DES/VPN is down: STOP, report, do not continue the task.

- [ ] **Step 3: Write findings §23 from the real output**

Append `## 23. D15 phase 2 — checkout inner structure, settle profile, routability (2026-07-18)` to the findings doc with: the Q1 table (per-mark `len`/`changed` values and the first stable mark), the Q2 dump's structural summary (checkout steps seen, shipping-form fields by accessible name/role, the payment methods **listed**), the raw Q3 verdict (landed URLs, both attempts if run), and an explicit line: **"Branch decision: C (routable)"** or **"Branch decision: B (not routable)"**. Also derive and record `CHECKOUT_SETTLE` numbers: `minWaitMs` = first stable Q1 mark + 1s margin; `maxWaitMs` = 2× that; `pollIntervalMs: 500`. If the tree NEVER stabilizes by +20s, STOP: record the blocker honestly in §23, do not proceed to Tasks 2-6, and surface it to Jorge (design §6).

- [ ] **Step 4: Delete the probe, commit**

```bash
git rm tests/_probe/d15-checkout-inner-probe.spec.ts
git add docs/superpowers/notes/2026-06-17-des-live-validation-findings.md
git commit -m "docs(checkout): D15-f2 Task 1 - checkout settle/structure/routability probed live, findings section 23"
```

---

### Task 2: `seedCheckout` config flag

**Files:**
- Modify: `explorer/config.ts`
- Test: `explorer/config.unit.test.ts` (existing file — add cases; if the repo's config tests live elsewhere, find them with `pnpm test:unit -- config` first and extend there)

**Interfaces:**
- Produces: `ExplorerConfig.seedCheckout: boolean` (default `false`), env `EXPLORER_SEED_CHECKOUT` accepting `on | off` (same convention as `EXPLORER_INTERACTIONS`). Tasks 4C/4B consume `cfg.seedCheckout`.

- [ ] **Step 1: Write failing tests**

```ts
it('seedCheckout defaults to false', () => {
  delete process.env.EXPLORER_SEED_CHECKOUT;
  expect(loadExplorerConfig().seedCheckout).toBe(false);
});

it('EXPLORER_SEED_CHECKOUT=on enables seedCheckout', () => {
  process.env.EXPLORER_SEED_CHECKOUT = 'on';
  expect(loadExplorerConfig().seedCheckout).toBe(true);
});

it('rejects invalid EXPLORER_SEED_CHECKOUT values', () => {
  process.env.EXPLORER_SEED_CHECKOUT = 'yes';
  expect(() => loadExplorerConfig()).toThrow(/EXPLORER_SEED_CHECKOUT/);
});
```

(Match the existing test file's env save/restore hooks exactly — the file already manages `process.env` around each case.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit -- config`
Expected: 3 new tests FAIL (`seedCheckout` undefined / no throw).

- [ ] **Step 3: Implement**

In `explorer/config.ts`: add `seedCheckout: boolean;` to `ExplorerConfig`; `seedCheckout: false` to `DEFAULTS`; a reader mirroring `envInteractions`:

```ts
function envSeedCheckout(): boolean | undefined {
  const v = process.env.EXPLORER_SEED_CHECKOUT;
  if (v === undefined) return undefined;
  if (v !== 'on' && v !== 'off') throw new Error('EXPLORER_SEED_CHECKOUT must be on | off');
  return v === 'on';
}
```

and in `loadExplorerConfig`'s `base`: `seedCheckout: envSeedCheckout() ?? DEFAULTS.seedCheckout,` (the existing `...base, ...overrides` spread handles overrides for free — it is a scalar).

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm test:unit -- config` → PASS. `pnpm typecheck` → clean. `pnpm lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add explorer/config.ts explorer/config.unit.test.ts
git commit -m "feat(explorer): seedCheckout config flag (EXPLORER_SEED_CHECKOUT, default off) - D15-f2"
```

---

### Task 3: `primeCart` — ensure the auth session's cart is non-empty

**Files:**
- Create: `explorer/crawl/primeCart.ts`
- Test: `explorer/crawl/primeCart.unit.test.ts`

**Interfaces:**
- Produces:
  - `interface PrimeCartDriver { cartCount(): Promise<number>; addOneItem(): Promise<void>; }`
  - `type PrimeCartResult = 'already-primed' | 'primed' | 'failed';`
  - `primeCart(driver: PrimeCartDriver): Promise<PrimeCartResult>`
  - `playwrightPrimeCartDriver(page: Page): PrimeCartDriver` — the real driver, reusing `src/` POMs.
- Consumed by: Task 4C / 4B (`explorer/cli.ts`).

- [ ] **Step 1: Write failing unit tests (fake driver, no browser)**

```ts
import { describe, it, expect } from 'vitest';
import { primeCart, type PrimeCartDriver } from './primeCart';

function driver(counts: number[], addImpl: () => Promise<void> = async () => {}): PrimeCartDriver {
  let i = 0;
  return { cartCount: async () => counts[Math.min(i++, counts.length - 1)], addOneItem: addImpl };
}

describe('primeCart', () => {
  it('returns already-primed without adding when the cart has items', async () => {
    let added = false;
    const r = await primeCart(driver([3], async () => { added = true; }));
    expect(r).toBe('already-primed');
    expect(added).toBe(false);
  });

  it('adds one item and verifies when the cart is empty', async () => {
    const r = await primeCart(driver([0, 1]));
    expect(r).toBe('primed');
  });

  it('returns failed when the add did not stick (count still 0)', async () => {
    expect(await primeCart(driver([0, 0]))).toBe('failed');
  });

  it('returns failed when the driver throws (never lets the error escape)', async () => {
    expect(await primeCart(driver([0], async () => { throw new Error('DES noise'); }))).toBe('failed');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit -- primeCart`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { Page } from '@playwright/test';
import { HomePage } from '../../src/pages/HomePage';
import { SearchResultsPage } from '../../src/pages/SearchResultsPage';
import { ProductPage } from '../../src/pages/ProductPage';

export interface PrimeCartDriver {
  /** Navigates to the cart page and reads the "Cesta (N)" tab count (findings §5's fast signal). */
  cartCount(): Promise<number>;
  /** Runs the full known-good add-to-cart UI recipe once. */
  addOneItem(): Promise<void>;
}

export type PrimeCartResult = 'already-primed' | 'primed' | 'failed';

/** Ensures the auth session's cart is non-empty before checkout is approached (D15-f2).
 *  Never throws: a bad DES day degrades checkout knowledge, it never kills the crawl. */
export async function primeCart(driver: PrimeCartDriver): Promise<PrimeCartResult> {
  try {
    if ((await driver.cartCount()) > 0) return 'already-primed';
    await driver.addOneItem();
    return (await driver.cartCount()) > 0 ? 'primed' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Real driver over the src/ page objects (explorer→src import direction, precedented by consent.ts). */
export function playwrightPrimeCartDriver(page: Page): PrimeCartDriver {
  return {
    cartCount: async () => {
      const home = new HomePage(page);
      await home.open();
      await home.header.goToCart();
      return home.header.cartTab().itemCount();
    },
    addOneItem: async () => {
      const home = new HomePage(page);
      await home.open();
      await home.header.searchBar.search('camiseta');
      const results = new SearchResultsPage(page);
      await results.waitForResults();
      await results.firstProduct().open();
      const product = new ProductPage(page);
      await product.selectFirstSize();
      await product.addToCart();
    },
  };
}
```

Before finalizing, open `src/pages/HomePage.ts` and confirm the exact member names used above (`open()`, `header`); they match `tests/checkout/checkout-reach.spec.ts`'s usage, which is the source of truth for this recipe.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm test:unit -- primeCart` → 4 PASS. `pnpm typecheck` / `pnpm lint` → clean (watch for an import/no-cycle error — there must be none; src/ never imports explorer/).

- [ ] **Step 5: Commit**

```bash
git add explorer/crawl/primeCart.ts explorer/crawl/primeCart.unit.test.ts
git commit -m "feat(explorer): primeCart - ensure non-empty cart before checkout capture (D15-f2)"
```

---

### Task 4C: Branch C — checkout as an auth-session crawl seed *(implement ONLY if findings §23 says "Branch decision: C")*

**Files:**
- Modify: `explorer/crawl/settle.ts` (add `settleFor` + override type)
- Modify: `explorer/crawl/crawler.ts` (use per-path settle override)
- Modify: `explorer/cli.ts` (primeCart + conditional seed + checkout settle override)
- Test: `explorer/crawl/settle.unit.test.ts` (existing — add `settleFor` cases)

**Interfaces:**
- Consumes: `cfg.seedCheckout` (Task 2), `primeCart`/`playwrightPrimeCartDriver` (Task 3), `CHECKOUT_SETTLE` numbers from findings §23.
- Produces: `interface SettleOverride { pattern: RegExp; opts: SettleOptions }`, `settleFor(path: string, overrides: SettleOverride[] | undefined): SettleOptions`, and `CrawlDeps.settleOverrides?: SettleOverride[]`.

- [ ] **Step 1: Write failing `settleFor` tests**

```ts
import { settleFor, DEFAULT_SETTLE, type SettleOverride } from './settle';

const CHECKOUT: SettleOverride = { pattern: /\/checkout\.html$/i, opts: { minWaitMs: 9000, pollIntervalMs: 500, maxWaitMs: 16000 } };

it('settleFor returns the matching override', () => {
  expect(settleFor('/es/checkout.html', [CHECKOUT])).toEqual(CHECKOUT.opts);
});
it('settleFor falls back to DEFAULT_SETTLE when nothing matches', () => {
  expect(settleFor('/es/h-woman.html', [CHECKOUT])).toBe(DEFAULT_SETTLE);
});
it('settleFor tolerates undefined overrides', () => {
  expect(settleFor('/es/checkout.html', undefined)).toBe(DEFAULT_SETTLE);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test:unit -- settle` → FAIL (`settleFor` not exported).

- [ ] **Step 3: Implement `settleFor`; wire into `crawlSession`**

In `settle.ts`:

```ts
export interface SettleOverride { pattern: RegExp; opts: SettleOptions; }

export function settleFor(path: string, overrides: SettleOverride[] | undefined): SettleOptions {
  return overrides?.find((o) => o.pattern.test(path))?.opts ?? DEFAULT_SETTLE;
}
```

In `crawler.ts`: add `settleOverrides?: SettleOverride[];` to `CrawlDeps`; at the settle call (currently `waitForSettle(..., DEFAULT_SETTLE)` after the F3 dedup check), pass `settleFor(resolvedPath, deps.settleOverrides)` instead of `DEFAULT_SETTLE`.

In `cli.ts`, inside the session loop, replacing the current fixed `SEEDS` usage:

```ts
const CHECKOUT_SEED = '/es/checkout.html';
// D15-f2 branch C: checkout is server-routable with a non-empty cart (findings §23) —
// prime the cart, then crawl checkout as an ordinary auth-session seed.
let seeds = SEEDS;
if (session === 'auth' && cfg.seedCheckout) {
  const primePage = await context.newPage();
  const primed = await primeCart(playwrightPrimeCartDriver(primePage));
  await primePage.close();
  if (primed === 'failed') {
    console.warn('primeCart failed — skipping the checkout seed this crawl (non-fatal, M8b precedent).');
  } else {
    seeds = [...SEEDS, CHECKOUT_SEED];
  }
}
const result = await crawlSession(
  { context, baseURL: env.baseURL, rules: DEFAULT_ROUTE_RULES, bounds: cfg.bounds, extraction: cfg.extraction, interactions: cfg.interactions, ledger,
    settleOverrides: [{ pattern: /\/checkout\.html$/i, opts: CHECKOUT_SETTLE }] },
  session,
  seeds,
);
```

with `const CHECKOUT_SETTLE: SettleOptions = { minWaitMs: <§23>, pollIntervalMs: 500, maxWaitMs: <§23> };` — the two `<§23>` numbers are the ones recorded in findings §23 (Task 1 Step 3 derived them); if §23 concluded `DEFAULT_SETTLE` suffices, omit `settleOverrides` entirely and note that in the commit message. The override is passed unconditionally (not only when `seedCheckout` is on): it only fires on checkout paths, which only exist in the frontier when the seed was added.

- [ ] **Step 4: Run tests, typecheck, lint** — `pnpm test:unit` full → all PASS (settle + no crawler regressions). `pnpm typecheck` / `pnpm lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add explorer/crawl/settle.ts explorer/crawl/settle.unit.test.ts explorer/crawl/crawler.ts explorer/cli.ts
git commit -m "feat(explorer): D15-f2 branch C - checkout crawl seed behind primeCart, per-path settle override"
```

---

### Task 4B: Branch B — dedicated post-crawl checkout capture *(implement ONLY if findings §23 says "Branch decision: B")*

**Files:**
- Create: `explorer/crawl/checkoutCapture.ts`
- Modify: `explorer/cli.ts`
- Test: `explorer/crawl/checkoutCapture.unit.test.ts`

**Interfaces:**
- Consumes: `cfg.seedCheckout` (Task 2), `primeCart`/`playwrightPrimeCartDriver` (Task 3), `CHECKOUT_SETTLE` from findings §23, `extractorFor` (`explorer/extract/fromPage`), `actUntil` (`src/support/retry`).
- Produces: `interface CheckoutCaptureDriver { reachCheckout(): Promise<boolean>; settleAndExtract(): Promise<PageExtraction>; }`, `captureCheckout(driver: CheckoutCaptureDriver): Promise<PageExtraction | null>`, `playwrightCheckoutCaptureDriver(page: Page, baseURL: string): CheckoutCaptureDriver`.

- [ ] **Step 1: Write failing unit tests (fake driver)**

```ts
import { captureCheckout, type CheckoutCaptureDriver } from './checkoutCapture';

const extraction = { meta: { path: '/es/checkout.html' } } as unknown as PageExtraction; // minimal shape for the test

it('returns the extraction when checkout is reached', async () => {
  const d: CheckoutCaptureDriver = { reachCheckout: async () => true, settleAndExtract: async () => extraction };
  expect(await captureCheckout(d)).toBe(extraction);
});
it('returns null when checkout is never reached', async () => {
  const d: CheckoutCaptureDriver = { reachCheckout: async () => false, settleAndExtract: async () => extraction };
  expect(await captureCheckout(d)).toBeNull();
});
it('returns null instead of throwing on driver errors', async () => {
  const d: CheckoutCaptureDriver = { reachCheckout: async () => { throw new Error('noise'); }, settleAndExtract: async () => extraction };
  expect(await captureCheckout(d)).toBeNull();
});
```

(Import `PageExtraction` from `../types`; build the minimal literal the same way neighboring crawl unit tests build fixture extractions — copy their factory if one exists.)

- [ ] **Step 2: Run to verify failure** — `pnpm test:unit -- checkoutCapture` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { Page } from '@playwright/test';
import type { PageExtraction } from '../types';
import { actUntil } from '../../src/support/retry';
import { acceptConsent } from '../../src/support/consent';
import { waitForSettle, type SettleOptions } from './settle';
import { extractorFor } from '../extract/fromPage';

export interface CheckoutCaptureDriver {
  /** Cart page → "Tramitar pedido" → true iff /es/checkout.html was reached. */
  reachCheckout(): Promise<boolean>;
  /** Settle (checkout budget, findings §23) then aria-extract the checkout page. */
  settleAndExtract(): Promise<PageExtraction>;
}

/** D15-f2 branch B: checkout is NOT server-routable (findings §23) — visit it once
 *  post-crawl via the UI path and hand its extraction to the normal map builder.
 *  Never throws (non-fatal skip, M8b precedent). */
export async function captureCheckout(driver: CheckoutCaptureDriver): Promise<PageExtraction | null> {
  try {
    if (!(await driver.reachCheckout())) return null;
    return await driver.settleAndExtract();
  } catch {
    return null;
  }
}

export function playwrightCheckoutCaptureDriver(page: Page, baseURL: string, settle: SettleOptions): CheckoutCaptureDriver {
  return {
    reachCheckout: async () => {
      await page.goto('/es/shop-cart.html', { waitUntil: 'domcontentloaded' });
      await acceptConsent(page);
      const trigger = page.getByRole('button', { name: /tramitar pedido/i })
        .or(page.getByRole('link', { name: /tramitar pedido/i }))
        .first();
      return actUntil({
        act: () => trigger.click({ force: true }),
        verify: () => page.waitForURL(/\/checkout\.html/, { timeout: 2_000 }).then(() => true).catch(() => false),
        deadlineMs: 30_000,
        sleep: (ms) => page.waitForTimeout(ms),
      });
    },
    settleAndExtract: async () => {
      await waitForSettle(() => page.locator('body').ariaSnapshot(), (ms) => page.waitForTimeout(ms), settle);
      // discoveredVia = the cart page: buildMap then chains the flow …→shop-cart→checkout.
      return extractorFor('aria')(page, 'auth', '/es/shop-cart.html', baseURL);
    },
  };
}
```

In `cli.ts`, after the auth session's `crawlSession` call (inside the same session loop iteration, before `context.close()`):

```ts
if (session === 'auth' && cfg.seedCheckout) {
  // D15-f2 branch B (findings §23: not server-routable) — dedicated scripted visit.
  const cPage = await context.newPage();
  const primed = await primeCart(playwrightPrimeCartDriver(cPage));
  if (primed === 'failed') {
    console.warn('primeCart failed — skipping the checkout capture this crawl (non-fatal, M8b precedent).');
  } else {
    const ex = await captureCheckout(playwrightCheckoutCaptureDriver(cPage, env.baseURL, CHECKOUT_SETTLE));
    if (ex) classified.push({ extraction: ex, classification: await classifier.classifyPage(buildPageContext(ex)) });
    else console.warn('checkout capture failed — the map will lack the Checkout page this crawl (non-fatal).');
  }
  await cPage.close();
}
```

with `CHECKOUT_SETTLE` defined from findings §23's numbers as in Task 4C Step 3.

- [ ] **Step 4: Run tests, typecheck, lint** — `pnpm test:unit` full → PASS. `pnpm typecheck` / `pnpm lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add explorer/crawl/checkoutCapture.ts explorer/crawl/checkoutCapture.unit.test.ts explorer/cli.ts
git commit -m "feat(explorer): D15-f2 branch B - post-crawl scripted checkout capture into the map"
```

---

### Task 5: Permanent spec — `tests/checkout/checkout-structure.spec.ts`

**Files:**
- Create: `tests/checkout/checkout-structure.spec.ts`

**Interfaces:**
- Consumes: findings §23 (the Q2 structural signals and the settle numbers). `tests/checkout/checkout-reach.spec.ts` stays untouched.

- [ ] **Step 1: Write the spec**

Template — **the two `SIGNAL` locators must be replaced with the exact accessible names recorded in findings §23** (e.g. a shipping-section heading and the payment-methods region; pick the two most page-specific, stable-looking signals from the Q2 dump — never a header/chrome element):

```ts
// D15 phase 2: assert checkout's INNER structure (read-only) — findings §23 holds the
// captured evidence this spec's signals come from. Strict read-only: nothing inside
// checkout is ever focused, filled, or clicked; the walk in is the phase-1 recipe.
import { test, expect } from '../../src/fixtures/test';
import { actUntil } from '../../src/support/retry';

const CHECKOUT_SETTLE_MS = 20_000; // ceiling; expect.poll below returns as soon as signals hydrate (§23 profile)

test('checkout: inner structure renders (shipping + payment signals)', async ({ page, homePage, searchResultsPage, productPage, env }) => {
  test.skip(!env.checkoutAllowed, 'checkout is never exercised where checkoutAllowed is false (prod)');

  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();
  await productPage.selectFirstSize();
  await productPage.addToCart();
  await productPage.header.goToCart();

  const trigger = page.getByRole('button', { name: /tramitar pedido/i })
    .or(page.getByRole('link', { name: /tramitar pedido/i }))
    .first();
  await actUntil({
    act: () => trigger.click({ force: true }),
    verify: () => page.waitForURL(/\/checkout\.html/, { timeout: 2_000 }).then(() => true).catch(() => false),
    deadlineMs: 30_000,
    sleep: (ms) => page.waitForTimeout(ms),
    onTimeout: () => { throw new Error('checkout-structure: "Tramitar pedido" did not reach checkout'); },
  });

  // Signals from findings §23 (REPLACE with the exact recorded names before committing):
  const shippingSignal = page.getByRole('heading', { name: /<§23 shipping signal>/i });
  const paymentSignal = page.getByRole('region', { name: /<§23 payment signal>/i });

  await expect.poll(() => shippingSignal.first().isVisible().catch(() => false), { timeout: CHECKOUT_SETTLE_MS }).toBe(true);
  await expect.poll(() => paymentSignal.first().isVisible().catch(() => false), { timeout: CHECKOUT_SETTLE_MS }).toBe(true);
});
```

If §23's dump shows different roles for the best signals (e.g. the payment methods render as a `radiogroup` or plain `text`), use the real role — the template's `heading`/`region` are placeholders for role too, not just name. Keep exactly two assertions (YAGNI — one shipping-side, one payment-side).

- [ ] **Step 2: Run live**

Run: `pnpm exec playwright test tests/checkout/checkout-structure.spec.ts --project=chromium`
Expected: PASS. If it fails on signal visibility, re-check the names against §23's dump before touching timeouts (§10 doctrine).

- [ ] **Step 3: Full suite no-regression**

Run: `pnpm test`
Expected: all specs PASS (5 + setup now). Record the real timing/retry facts for the close-out.

- [ ] **Step 4: Commit**

```bash
git add tests/checkout/checkout-structure.spec.ts
git commit -m "test(checkout): D15-f2 - permanent read-only inner-structure spec"
```

---

### Task 6: Live validation gates, map update, `pnpm ask`, docs close-out

**Files:**
- Modify: `coverage/functional-map.json` (via `pnpm explore --update` — never by hand)
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (§23 completion), `docs/roadmap/2026-07-02-backlog.md` (§D D15), `CLAUDE.md` (pending list + `pnpm explore` flag doc)

**Interfaces:**
- Consumes: everything above. This task is the design's §7 gate list, in order.

- [ ] **Step 1: Opted-in crawl**

Run: `EXPLORER_SEED_CHECKOUT=on EXPLORER_MAX_PAGES=150 EXPLORER_TIME_BUDGET_MS=1200000 pnpm explore --update`
(PowerShell: `$env:EXPLORER_SEED_CHECKOUT='on'; $env:EXPLORER_MAX_PAGES='150'; $env:EXPLORER_TIME_BUDGET_MS='1200000'; pnpm explore --update`)
Expected: crawl completes, map written. VPN required.

- [ ] **Step 2: Verify the map directly (JSON, not logs — B17 precedent)**

Run a `node -e` / small tsx query against `coverage/functional-map.json` asserting: (a) a page with `path === '/es/checkout.html'` and `pageType === 'Checkout'` exists with `elements.length > 0`; (b) a flow with `type === 'Checkout'` exists; (c) element ids remain globally unique (B17 guard). Print the real numbers for the close-out.

- [ ] **Step 3: `pnpm ask` resolves**

Run: `pnpm ask "checkout"` → resolves to the Checkout flow (no blind-spot message) and writes a draft. Then `pnpm ask "prueba el checkout"` → same resolution (its tokens map to Checkout in `intent/resolve.ts:36-40`). Run the generated draft: `pnpm test:generated` → the checkout draft PASSES live. `intent/resolve.unit.test.ts`'s blind-spot test still passes (it uses its own fixture map without Checkout flows — verify with `pnpm test:unit -- resolve`).

- [ ] **Step 4: Default-crawl boundary check**

Run: a bounded default crawl WITHOUT the flag (`EXPLORER_MAX_PAGES=10 pnpm explore`, no `--update`): confirm console output mentions no primeCart/checkout activity and no checkout page appears in the run report. This demonstrates the opt-in boundary (design gate 5) without paying a full crawl.

- [ ] **Step 5: Full offline gates**

Run: `pnpm test:unit` (expect prior count + new tests, all green), `pnpm typecheck`, `pnpm lint` — all clean.

- [ ] **Step 6: Docs close-out + final commit**

Findings §23: append the validation results (map numbers, ask output, suite results — real values). Backlog §D D15: phase 2 → done, with the branch actually taken. CLAUDE.md: update the "Pending tasks" pointer (replace wholesale, per its own instruction) and add `EXPLORER_SEED_CHECKOUT` to the `pnpm explore` command line doc. Note the +1-item-per-crawl effect on §7's cart-accumulation lead in the findings doc.

```bash
git add coverage/functional-map.json docs/ CLAUDE.md
git commit -m "feat(explorer): D15 phase 2 closed - checkout in the map, pnpm ask resolves, all gates green"
git push origin master
```

---

## Self-Review (done at write time)

- **Spec coverage:** design §2 full package → Tasks 5 (spec), 6 (map+ask), 1 (knowledge). §3 ladder → Task 1 decides, 4C/4B implement. §5 shared pieces → Tasks 2-3. §6 blocker path → Task 1 Step 3 STOP clause. §7 gates 1-5 → Task 6 Steps 1-5 + Task 1. `intent/` zero-change claim verified against `resolve.ts:140` at plan time.
- **Placeholders:** the `<§23 …>` markers in Tasks 4C/4B/5 are deliberate evidence-dependent inputs with explicit derivation instructions (Task 1 Step 3), not TBDs.
- **Type consistency:** `PrimeCartDriver`/`PrimeCartResult`/`primeCart`/`playwrightPrimeCartDriver` (T3) match T4C/T4B usage; `SettleOverride`/`settleFor` (T4C) self-contained; `CheckoutCaptureDriver`/`captureCheckout` (T4B) self-contained; `CHECKOUT_SETTLE` defined in whichever branch task runs.
