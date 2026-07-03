# Builder Engine Design (Execution Agent, Phase 5 — v1)

**Date:** 2026-07-03
**Status:** Approved (design)
**Scope:** Milestone M6 of the platform roadmap — the first slice of the Execution Agent. Consumes the Coverage Planner's ranked proposals (`reports/planner/proposals.json`, M5) plus the functional map, and generates runnable Playwright navigation specs + minimal page objects that imitate the framework's POM/COM contracts exactly. **Interaction specs (search, add-to-cart, checkout journeys) are explicitly out of scope** — the map does not yet capture interactions (backlog B9), and generating them would mean inventing knowledge the platform doesn't have.

---

## Context

The platform can now say *what* to test (M5b: ranked, evidence-backed proposals of uncovered journeys) but a human still has to write every spec. This sub-project closes the first half of that loop: for navigation journeys — the only journey kind the map knows end-to-end today — the Builder generates the spec and its page object deterministically, in exactly the shape a human following this repo's conventions would write.

### Decisions locked during brainstorming

- **v1 generates navigation specs**: walk a proposal's chain, verify each page loads. 100% derivable from real data that exists today; interaction generation waits for interaction-aware map knowledge.
- **Deterministic templates behind a pluggable seam** (approach A with C's door): a minimal `Generator` interface with one template-based implementation. Same decision pattern as the planner (deterministic, no LLM) and the Explorer (`Classifier` interface, `rules` default, LLM optional). Same input → byte-identical output, always.
- **Specs + minimal generated page objects**, not bare specs: the Builder's mission per the roadmap is to generate code imitating `BasePage`/`BaseComponent`/`Strategy`, so each generated spec gets a leaf page object that genuinely exercises those contracts.

## 1. Location & reuse

- New sub-project: `builder/` (mirrors `explorer/`/`planner/`), CLI via `pnpm build-tests` (`tsx builder/cli.ts`).
- **Consumes:** `reports/planner/proposals.json` (`PlanReport` from `planner/propose/propose.ts` — proposals carry `flowId`, `name`, `priority`, `session`, `steps` as page ids, `rationale`) **and** `coverage/functional-map.json` (resolves step page ids → concrete paths; provides the leaf page's elements + `selectorHints` for the loaded-signal).
- **Reuses without duplication:** `Strategy`/`locate()` from `src/support/locators.ts` (generated code calls them directly), `BasePage` (generated page objects extend it), `FunctionalMap` types from `explorer/map/schema.ts`, `TestProposal`/`PlanReport` types from `planner/propose/propose.ts`.
- Touches existing framework files in exactly two places: `playwright.config.ts` (a `testIgnore` for `tests/generated/**`) and `package.json`/`.gitignore` (scripts + ignore entry). No crawler, planner, or POM/COM changes.

## 2. Units

### 2.1 `builder/generate/Generator.ts` — the seam
```ts
export interface JourneyInput {
  flowId: string;
  journeyName: string;            // the human-readable chain, from the proposal
  session: Session;
  chain: ChainStep[];             // resolved root→leaf: { path, routePattern, title }
  loadedSignal: Strategy | null;  // best real element of the leaf page; null = main-landmark fallback
}
export interface GeneratedFile { relPath: string; content: string }
export interface Generator { generate(input: JourneyInput): GeneratedFile[] }
```
One implementation today: `TemplateGenerator` (deterministic string templates). An LLM-backed generator plugs in here later without touching the CLI or pipeline — the Explorer's `Classifier` pattern is the reference.

### 2.2 `builder/select.ts` — proposal selection & input resolution
- Takes the `PlanReport` + `FunctionalMap`, returns the top-N `JourneyInput`s honouring the planner's ranking (never re-ranks).
- Resolves `steps` (page ids) against the map's pages. A proposal referencing a page id that no longer exists in the map (stale proposals/map pair) is **skipped with a console warning** — deterministic, non-fatal.
- **Checkout guard, route-based:** proposals whose step *paths* look like checkout/payment (`/checkout|pago|payment|purchase/i` on the path) are skipped with a warning. Route-based on purpose: the map's `pageType: 'Checkout'` labels are currently unreliable (backlog B13 — 16 real PDPs mislabeled Checkout), and `checkoutAllowed` semantics must never depend on them.
- **Loaded-signal selection** for the leaf page, following the framework's selector priority exactly: first element with a `testId` hint → else first with a `role` hint (non-empty name) → else `label` → else `placeholder`; elements with `destructive: true` are never eligible. When the leaf has no usable element, `loadedSignal` is `null` and the generated `isLoaded()` falls back to `this.page.getByRole('main').isVisible()` directly (a template branch — `Strategy` stays clean of pseudo-selectors). Selection is deterministic: map element order (the map is itself deterministic).
  - **Superseded 2026-07-03 (M6b Task 6, live validation):** `testId` was dropped from this priority entirely — `explorer/extract/enrichTestIds.ts` records a hint from `data-testid`, `data-qa-anchor`, or `data-qa` without recording which one matched, but `locate()`'s testId branch only resolves `data-testid`, so hints from the other two attributes silently never match. Live-confirmed: 3/3 generated specs timed out on exactly this before the fix. See findings doc §11 and backlog B15 (the underlying gap, tracked for a dedicated fix) and B14 (the resulting weaker role/label-only signal quality).

### 2.3 `builder/naming.ts` — deterministic names
- Class name: PascalCase from the leaf `routePattern` (strip locale prefix, extension, `{id}` tokens; sanitize non-alphanumerics) + `Page` suffix (e.g. `/es/mujer/ropa/camisetas-n4365.html` → `MujerRopaCamisetasN4365Page`).
- File names: kebab-case leaf slug + first 8 chars of `flowId` (`camisetas-n4365-a1b2c3d4.spec.ts`) — flowIds are stable across regenerations (deterministic map ids), so re-running overwrites the same files; distinct flows sharing a leaf name can't collide.

### 2.4 `builder/cli.ts`
- `pnpm build-tests [--top <n>=3] [--proposals <path>] [--map <path>] [--out <dir>=tests/generated]`.
- Pipeline: read inputs → select → generate → write files (spec + page object per journey, `pages/` subfolder) → print summary (files written, proposals skipped and why).
- Every generated file starts with a header comment: `// GENERATED from flow <flowId> (map generated <map.generatedAt>) — review before promoting; regeneration overwrites.` **No wall-clock timestamps anywhere in output** — regeneration from the same inputs is byte-identical.

## 3. Generated code shape (imitates the reference specs)

Per journey, two files under `tests/generated/`:

```ts
// tests/generated/pages/MujerRopaCamisetasN4365Page.ts
import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';

export class MujerRopaCamisetasN4365Page extends BasePage {
  /** Walks the discovered chain step by step: DES intermittently re-triggers the
   *  gender gate on direct deep-links (findings §8), so the journey navigates the
   *  same way it was discovered. */
  async open(): Promise<void> {
    await this.goto('/');
    await this.goto('/es/h-woman.html');
    await this.goto('/es/mujer/ropa/camisetas-n4365.html');
  }

  async isLoaded(): Promise<boolean> {
    return locate(this.page, { role: { type: 'button', name: 'Filtrar' } }).isVisible();
  }
}
```

```ts
// tests/generated/camisetas-n4365-a1b2c3d4.spec.ts
import { test, expect } from '../../src/fixtures/test';
import { MujerRopaCamisetasN4365Page } from './pages/MujerRopaCamisetasN4365Page';

const HYDRATION_TIMEOUT_MS = 20_000;

test('journey: / -> /es/h-woman.html -> /es/mujer/ropa/camisetas-n4365.html', async ({ page }) => {
  const target = new MujerRopaCamisetasN4365Page(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
```

Conventions imitated: import from `src/fixtures/test.ts` (gets the `routeEvidence` auto-fixture for free — generated runs feed coverage evidence too), `expect.poll` on an async page-object query, `HYDRATION_TIMEOUT_MS` sized like the reference specs, `BasePage.goto()` (tour suppression for free). **One accepted deviation, documented in the spec header:** generated page objects are instantiated with `new X(page)` in the spec instead of injected via fixtures — registering them in `src/fixtures/test.ts` would mutate a shared framework file on every generation (rejected).

## 4. Isolation, promotion & guards

- `tests/generated/` is **gitignored** and excluded from the default suite via `testIgnore: ['**/tests/generated/**']` in `playwright.config.ts`. Generated drafts are regenerable artifacts, like `proposals.json` — nothing enters the suite without a human.
- `pnpm test:generated` runs them explicitly: `playwright.generated.config.ts` extends the base config, overrides `testIgnore`, keeps the `setup` project dependency (auth state).
- **Promotion** = human review → move the spec (and page object, adjusting the import) into `tests/<domain>/` → commit. Reviewing includes checking the page doesn't already have a manual page object (v1 does not auto-detect this — known limitation).
- Missing proposals file → fail fast: "run `pnpm plan` first". Missing map → "run `pnpm explore --update` first". Zero journeys generated (all skipped/none selected) → exit 1 with the reasons already printed.

## 5. Testing

- **Offline (vitest):** `naming` (PascalCase/kebab sanitization, `{id}` stripping, collision suffixing); `select` (ranking preserved, stale-id skip, checkout-route skip, loaded-signal priority incl. destructive exclusion and main-landmark fallback); `TemplateGenerator` (output contains chain/class/strategy as expected; **full determinism: same input → identical bytes**; header present; no timestamps).
- **DEFERRED-live (VPN):** `pnpm build-tests --top 3` against the real committed map + fresh proposals → `pnpm typecheck` (tsconfig already includes `tests/`, so generated files type-check automatically once written) + `pnpm lint` + `pnpm test:generated` against DES. **Milestone success criterion: at least one generated spec passes live exactly as generated**, with findings recorded in the findings doc.

## 6. Non-goals (v1)

- Interaction specs (search/filter/add-to-cart/checkout) — needs interaction-aware map knowledge (B9).
- LLM-backed generation (the `Generator` seam exists; no second implementation until templates hit a real ceiling).
- Registering generated page objects in `src/fixtures/test.ts`.
- Automatic promotion, dedup against manual page objects, or CI wiring for `build-tests`.
- Selector healing (Phase 7 — `Strategy` in generated code is already its seam).

## 7. Risks

- **Generated journeys inherit map quality:** chains reflect crawl-discovery order, which varies between crawls (observed in M5b: coverage dropped 3→0/152 after a re-crawl reshaped chains). A regenerated spec after a map refresh may walk a different chain to the same leaf. Acceptable: specs are regenerable drafts, and the leaf assertion is the real payload.
- **Gender-gate flakiness on chain steps:** mitigated by walking the discovered chain (warm session) + `retries: 1`; if live validation still trips, the fallback is an act→verify→retry loop in the generated `open()` — decide from evidence, not preemptively.
- **`main`-landmark fallback weakness:** a leaf with no usable elements gets a weak loaded-signal. Printed in the CLI summary so the human knows which generated specs assert little.
