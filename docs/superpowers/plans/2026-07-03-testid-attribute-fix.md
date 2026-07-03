# TestId Attribute-Provenance Fix Implementation Plan (M7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make testId selector hints trustworthy end-to-end: record *which* attribute (`data-testid` | `data-qa-anchor` | `data-qa`) a hint came from, resolve it with that attribute in `locate()`, and revert the Builder Engine's M6b workaround that excluded testId from its loaded-signal priority.

**Architecture:** A new `TestIdHint { attr, value }` type lives in `src/support/locators.ts` (the base layer — `explorer`/`builder` already depend on `src`, never the reverse). Both extraction producers (`enrichTestIds.ts` aria/live, `hints.ts` dom/offline) record the matched attribute; `locate()` resolves `data-testid` via `getByTestId()` and the other two via a CSS attribute locator (Playwright CSS pierces open shadow roots, so DES's `bds-` components work identically). Map schema bumps 1.2 → 1.3 with **no migration code** — the map is regenerated live in the final task; the single legacy tolerance is a shape guard in `builder/select.ts`.

**Tech Stack:** TypeScript strict, Vitest (offline). Live validation DEFERRED to the final task (VPN).

**Design spec:** `docs/superpowers/specs/2026-07-03-testid-attribute-fix-design.md`

## Global Constraints

- `pnpm typecheck` (strict, no `any`) and `pnpm lint` (no import cycles — `src/support/locators.ts` must never import from `explorer/` or `builder/`) pass after every task; unit tests offline/deterministic.
- `TESTID_ATTRS` probe order is `['data-testid', 'data-qa-anchor', 'data-qa']` — `data-testid` first, exactly matching `enrichTestIds`'s existing order. One shared exported const; no duplicated lists.
- `pickStrategyKey` and the framework selector priority (testId → role → label → placeholder) are unchanged.
- The Builder's generated output stays fully deterministic: same inputs → byte-identical files.
- Schema `1.2 → 1.3`; **no migration code anywhere**. The only legacy tolerance is the shape guard in `builder/select.ts` (spec §4: "No other consumer reads `selectorHints` from JSON").
- Reuse, never reimplement: producers import `TESTID_ATTRS`/`TestIdHint` from `src/support/locators.ts`.

---

### Task 1: `TestIdHint` type, `locate()` resolution, and the compile-atomic ripple

The `Strategy.testId`/`SelectorHints.testId` type change ripples through both producers, four test fixtures, and the Builder's template in one compile-atomic step — they cannot be split into separately-green tasks. Behavior of `builder/select.ts` does NOT change here (it still excludes testId — that's Task 2); only shapes and the template literal do.

**Files:**
- Modify: `src/support/locators.ts`, `src/support/locators.unit.test.ts`, `explorer/types.ts`, `explorer/extract/enrichTestIds.ts`, `explorer/extract/hints.ts`, `explorer/extract/analyze.unit.test.ts`, `explorer/map/schema.ts`, `explorer/map/builder.unit.test.ts`, `builder/select.unit.test.ts` (fixture shapes only), `builder/generate/TemplateGenerator.ts`, `builder/generate/TemplateGenerator.unit.test.ts`

**Interfaces:**
- Produces (consumed by Task 2 and by all generated code):
  ```ts
  // src/support/locators.ts
  export const TESTID_ATTRS = ['data-testid', 'data-qa-anchor', 'data-qa'] as const;
  export type TestIdAttr = (typeof TESTID_ATTRS)[number];
  export interface TestIdHint { attr: TestIdAttr; value: string }
  export interface Strategy { testId?: TestIdHint; role?: {...unchanged}; label?: string; placeholder?: string }
  ```
  `SelectorHints.testId?: TestIdHint` (explorer/types.ts, imported from locators). `SCHEMA_VERSION = '1.3'`.

- [ ] **Step 1: Write the failing tests** — replace `src/support/locators.unit.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { pickStrategyKey, locate } from './locators';

interface Call { method: string; args: unknown[] }

function makeScope(): { scope: Page; calls: Call[] } {
  const calls: Call[] = [];
  const record = (method: string) => (...args: unknown[]): Locator => {
    calls.push({ method, args });
    return {} as Locator;
  };
  const scope = {
    getByTestId: record('getByTestId'),
    getByRole: record('getByRole'),
    getByLabel: record('getByLabel'),
    getByPlaceholder: record('getByPlaceholder'),
    locator: record('locator'),
  };
  return { scope: scope as unknown as Page, calls };
}

describe('pickStrategyKey', () => {
  it('prefers testId above all', () => {
    expect(pickStrategyKey({ testId: { attr: 'data-testid', value: 'a' }, role: { name: 'x', type: 'button' }, label: 'l' })).toBe('testId');
  });
  it('falls back to role when no testId', () => {
    expect(pickStrategyKey({ role: { name: 'x', type: 'button' }, label: 'l' })).toBe('role');
  });
  it('falls back to label when no testId/role', () => {
    expect(pickStrategyKey({ label: 'l', placeholder: 'p' })).toBe('label');
  });
  it('falls back to placeholder last', () => {
    expect(pickStrategyKey({ placeholder: 'p' })).toBe('placeholder');
  });
  it('throws when nothing is provided', () => {
    expect(() => pickStrategyKey({})).toThrow(/at least one selector/i);
  });
});

describe('locate testId resolution', () => {
  it('resolves data-testid via getByTestId (genuine Playwright semantics)', () => {
    const { scope, calls } = makeScope();
    locate(scope, { testId: { attr: 'data-testid', value: 'add-to-cart' } });
    expect(calls).toEqual([{ method: 'getByTestId', args: ['add-to-cart'] }]);
  });
  it('resolves data-qa-anchor via a raw CSS attribute locator', () => {
    const { scope, calls } = makeScope();
    locate(scope, { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } });
    expect(calls).toEqual([{ method: 'locator', args: ['[data-qa-anchor="addToCartSizeBtn"]'] }]);
  });
  it('resolves data-qa via a raw CSS attribute locator', () => {
    const { scope, calls } = makeScope();
    locate(scope, { testId: { attr: 'data-qa', value: 'filterButton' } });
    expect(calls).toEqual([{ method: 'locator', args: ['[data-qa="filterButton"]'] }]);
  });
  it('escapes double quotes and backslashes in attribute values', () => {
    const { scope, calls } = makeScope();
    locate(scope, { testId: { attr: 'data-qa', value: 'a"b\\c' } });
    expect(calls).toEqual([{ method: 'locator', args: ['[data-qa="a\\"b\\\\c"]'] }]);
  });
});
```

- [ ] **Step 2:** Run `pnpm test:unit src/support/locators.unit.test.ts` → FAIL (`locate` not exported with this shape / type errors on `testId` object).

- [ ] **Step 3: Implement the type + resolution** — `src/support/locators.ts` becomes:

```ts
import type { Page, Locator } from '@playwright/test';

type Role = Parameters<Page['getByRole']>[0];

// The test-id-like attributes confirmed on DES, in probe order (data-testid first).
// Shared with the Explorer's extraction so producer and resolver can never disagree
// about which attributes exist (design spec 2026-07-03-testid-attribute-fix-design.md).
export const TESTID_ATTRS = ['data-testid', 'data-qa-anchor', 'data-qa'] as const;
export type TestIdAttr = (typeof TESTID_ATTRS)[number];

/** A test-id hint that remembers which attribute it came from — getByTestId() only
 *  resolves data-testid, so hints from the other attributes need a raw locator. */
export interface TestIdHint {
  attr: TestIdAttr;
  value: string;
}

export interface Strategy {
  testId?: TestIdHint;
  role?: { type: Role; name: string; exact?: boolean };
  label?: string;
  placeholder?: string;
}

const PRIORITY = ['testId', 'role', 'label', 'placeholder'] as const;
export type StrategyKey = (typeof PRIORITY)[number];

export function pickStrategyKey(s: Strategy): StrategyKey {
  const key = PRIORITY.find((k) => s[k] !== undefined);
  if (!key) throw new Error('Strategy must define at least one selector (testId | role | label | placeholder)');
  return key;
}

const cssAttrEscape = (v: string): string => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Resolve a Strategy to a Locator scoped to `scope`, honouring the priority order. */
export function locate(scope: Page | Locator, s: Strategy): Locator {
  switch (pickStrategyKey(s)) {
    case 'testId': {
      const { attr, value } = s.testId!;
      // Playwright CSS locators pierce open shadow roots, so the raw-attribute path
      // works identically on DES's bds- web components.
      return attr === 'data-testid'
        ? scope.getByTestId(value)
        : scope.locator(`[${attr}="${cssAttrEscape(value)}"]`);
    }
    case 'role': return scope.getByRole(s.role!.type, { name: s.role!.name, exact: s.role!.exact });
    case 'label': return scope.getByLabel(s.label!);
    case 'placeholder': return scope.getByPlaceholder(s.placeholder!);
  }
}
```

- [ ] **Step 4:** Run `pnpm test:unit src/support/locators.unit.test.ts` → PASS (9 tests). `pnpm typecheck` now FAILS in the ripple files — expected; fix them in Steps 5–9.

- [ ] **Step 5: Update `explorer/types.ts`** — replace the inline `SelectorHints` testId with the shared type:

```ts
import type { TestIdHint } from '../src/support/locators';

export type Session = 'anon' | 'auth';

export interface SelectorHints {
  testId?: TestIdHint;
  role?: { type: string; name: string };
  label?: string;
}
```

(rest of the file unchanged).

- [ ] **Step 6: Update the producers.**

`explorer/extract/enrichTestIds.ts` — drop the local attribute list, import the shared one, record `{ attr, value }`:

```ts
import type { Page } from '@playwright/test';
import { TESTID_ATTRS } from '../../src/support/locators';
import type { PageExtraction } from '../types';

// DES carries test-id-like attributes on at least some elements (data-qa-anchor="filterButton"
// confirmed live — findings §7). The a11y tree does not expose attributes, so probe the DOM via
// role locators (they pierce shadow DOM). Best-effort by design: strict-mode ambiguity or a
// timeout simply leaves the hint unset — absence is itself signal (foundation Risk #1).
// The matched attribute is recorded with the value: getByTestId() only resolves data-testid,
// so locate() needs the provenance to pick the right resolution (findings §11, M7).

type RoleType = Parameters<Page['getByRole']>[0];

export async function enrichTestIds(page: Page, extraction: PageExtraction, cap = 40): Promise<void> {
  const targets = extraction.elements.filter((e) => e.selectorHints.role?.name).slice(0, cap);
  for (const el of targets) {
    const role = el.selectorHints.role;
    if (!role) continue;
    try {
      const loc = page.getByRole(role.type as RoleType, { name: role.name, exact: true }).first();
      for (const attr of TESTID_ATTRS) {
        const value = await loc.getAttribute(attr, { timeout: 250 });
        if (value) {
          el.selectorHints.testId = { attr, value };
          break;
        }
      }
    } catch {
      // best-effort: leave hints as-is
    }
  }
}
```

`explorer/extract/hints.ts` — the dom path probes its two attributes explicitly (it has no `data-qa-anchor` today; do not add it speculatively):

```ts
export function hintsFor(el: Element): SelectorHints {
  const hints: SelectorHints = {};
  const dataTestId = el.getAttribute('data-testid');
  const dataQa = el.getAttribute('data-qa');
  if (dataTestId) hints.testId = { attr: 'data-testid', value: dataTestId };
  else if (dataQa) hints.testId = { attr: 'data-qa', value: dataQa };
  const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (name) hints.role = { type: roleOf(el), name };
  const label = el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? undefined;
  if (label) hints.label = label;
  return hints;
}
```

(`roleOf` and the imports stay as they are.)

- [ ] **Step 7: Schema bump + fixture ripple.**

`explorer/map/schema.ts`: `export const SCHEMA_VERSION = '1.3';`

`explorer/map/builder.unit.test.ts`: the version assertion `expect(a.schemaVersion).toBe('1.2')` → `'1.3'`; the fixture `selectorHints: { testId: 'add' }` → `selectorHints: { testId: { attr: 'data-testid', value: 'add' } }`.

`explorer/extract/analyze.unit.test.ts` line 32: `expect(addToCart?.selectorHints.testId).toBe('add-to-cart')` → `expect(addToCart?.selectorHints.testId).toEqual({ attr: 'data-testid', value: 'add-to-cart' });`

`builder/select.unit.test.ts` — fixture shapes only (behavior tests unchanged this task): both occurrences of `selectorHints: { testId: 'quick-add' }` → `selectorHints: { testId: { attr: 'data-qa-anchor', value: 'quick-add' } }`.

- [ ] **Step 8: Template emits the nested literal.**

`builder/generate/TemplateGenerator.ts`, in `strategyLiteral`, replace the testId branch:

```ts
  if (s.testId !== undefined) {
    return `{ testId: { attr: ${sq(s.testId.attr)}, value: ${sq(s.testId.value)} } }`;
  }
```

- [ ] **Step 9: Lock the nested literal with a test** — add to `builder/generate/TemplateGenerator.unit.test.ts` (inside the existing `describe`):

```ts
  it('emits a nested testId literal carrying the attribute provenance', () => {
    const [p] = g.generate({ ...input, loadedSignal: { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } } });
    expect(p.content).toContain("locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } })");
    expect(p.content).toContain("import { locate }");
  });
```

- [ ] **Step 10:** Run `pnpm typecheck && pnpm lint && pnpm test:unit` → all green (the lint pass also proves `src → explorer` was never introduced: `locators.ts` imports only from `@playwright/test`).
- [ ] **Step 11:** Commit:

```bash
git add src/support/locators.ts src/support/locators.unit.test.ts explorer/types.ts explorer/extract/enrichTestIds.ts explorer/extract/hints.ts explorer/extract/analyze.unit.test.ts explorer/map/schema.ts explorer/map/builder.unit.test.ts builder/select.unit.test.ts builder/generate/TemplateGenerator.ts builder/generate/TemplateGenerator.unit.test.ts
git commit -m "feat(foundation): testId hints carry attribute provenance; locate() resolves by attr (schema 1.3)"
```

---

### Task 2: Builder — restore testId priority + legacy-shape guard

**Files:**
- Modify: `builder/select.ts`
- Test: `builder/select.unit.test.ts`

**Interfaces:**
- Consumes: `TestIdHint` (Task 1), `SelectorHints.testId?: TestIdHint`.
- Produces: `loadedSignalFor` priority restored to testId → role → label; string-shaped legacy testIds (schema-1.2 maps) silently ignored.

- [ ] **Step 1: Update the tests first** — in `builder/select.unit.test.ts`:

Replace the two loaded-signal tests (`'picks the loaded signal by role/label priority, skipping destructive elements'` and `'never picks a testId hint (excluded: live-confirmed data-qa-anchor/data-testid mismatch, findings §11)'`) with:

```ts
  it('picks the loaded signal by framework priority (testId first), skipping destructive elements', () => {
    const r = selectJourneys(report([['pRoot', 'pPlp']]), map, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ testId: { attr: 'data-qa-anchor', value: 'quick-add' } });
  });
  it('ignores legacy string-shaped testIds (schema-1.2 maps) and falls through to role/label', () => {
    // A stale 1.2 map carries provenance-less string testIds — exactly the untrustworthy
    // data M7 replaced. They must never surface as a Strategy (M6b's live failure mode).
    const legacyMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Añadir', role: 'button', selectorHints: { testId: 'legacy-string' as unknown as TestIdHint }, destructive: false },
        { id: 'e2', pageId: 'pPlp', type: 'filter', label: 'Filtrar', role: 'button', selectorHints: { role: { type: 'button', name: 'Filtrar' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), legacyMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Filtrar' } });
  });
```

and add the import at the top of the file:

```ts
import type { TestIdHint } from '../src/support/locators';
```

- [ ] **Step 2:** Run `pnpm test:unit builder/select.unit.test.ts` → FAIL (priority still excludes testId; legacy guard doesn't exist).

- [ ] **Step 3: Implement** — in `builder/select.ts`, replace `toStrategy` and `loadedSignalFor` (and their comments) with:

```ts
function toStrategy(hints: SelectorHints): Strategy | null {
  // Legacy tolerance (the only one in the codebase, per the M7 design spec §4): schema-1.2
  // maps carried provenance-less string testIds — the untrustworthy data M7 replaced.
  // A string-shaped hint is ignored so it can never surface as an unresolvable Strategy
  // (M6b's live failure mode, findings §11); the element's role/label still apply.
  if (hints.testId !== undefined && typeof hints.testId === 'object') {
    return { testId: hints.testId };
  }
  if (hints.role !== undefined && hints.role.name !== '') {
    return { role: { type: hints.role.type as NonNullable<Strategy['role']>['type'], name: hints.role.name } };
  }
  if (hints.label !== undefined) return { label: hints.label };
  return null;
}

/** First non-destructive element whose best hint matches the framework's selector
 *  priority (testId -> role -> label); null means the template falls back to the
 *  main landmark. Deterministic: map element order. testId is trustworthy again
 *  since M7 (attribute provenance — design spec 2026-07-03-testid-attribute-fix-design.md). */
function loadedSignalFor(map: FunctionalMap, leaf: MapPage): Strategy | null {
  const candidates = map.elements.filter((e) => e.pageId === leaf.id && !e.destructive);
  for (const key of ['testId', 'role', 'label'] as const) {
    for (const el of candidates) {
      const s = toStrategy(el.selectorHints);
      if (s !== null && key in s) return s;
    }
  }
  return null;
}
```

- [ ] **Step 4:** Run `pnpm test:unit builder/select.unit.test.ts` → PASS (7 tests). Then `pnpm typecheck && pnpm lint && pnpm test:unit` → all green.
- [ ] **Step 5:** Commit:

```bash
git add builder/select.ts builder/select.unit.test.ts
git commit -m "fix(builder): restore testId-first loaded-signal priority (M7 makes hints trustworthy)"
```

---

### Task 3: Live validation + map regeneration (DEFERRED-live, requires VPN)

- [ ] **Step 1: Probe attribute reality first (evidence before assumptions).** Write a throwaway script `reports/probe-testid.ts` (gitignored dir):

```ts
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import { TESTID_ATTRS } from '../src/support/locators';
import { acceptConsent, suppressOnboardingTour } from '../src/support/consent';

dotenv.config();
const BASE_URL = process.env.BASE_URL!;
const PDP = '/es/blusa-r%c3%bastica-lazadas-c0p212938550.html';

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ baseURL: BASE_URL })).newPage();
  await suppressOnboardingTour(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await acceptConsent(page);
  await page.goto(PDP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  for (const name of ['Añadir a cesta', 'Añadir a la lista de deseos']) {
    const loc = page.getByRole('button', { name }).first();
    for (const attr of TESTID_ATTRS) {
      const v = await loc.getAttribute(attr, { timeout: 500 }).catch(() => null);
      console.log(`${name} :: ${attr} = ${v}`);
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx reports/probe-testid.ts`. Record which attribute carries `addToCartSizeBtn` (expected `data-qa-anchor` per findings §7 — verify, don't assume). If values appear under an attribute NOT in `TESTID_ATTRS`, stop and reassess with the human before extending the list. Delete the script afterwards.

- [ ] **Step 2: Regenerate the map (schema 1.3).**

```powershell
$env:ENVIRONMENT = "des"; $env:EXPLORER_MAX_PAGES = "80"; $env:EXPLORER_TIME_BUDGET_MS = "1200000"
pnpm explore --update
```

(~20-25 min.) Then verify: `coverage/functional-map.json` has `schemaVersion: "1.3"` and testId hints shaped `{ attr, value }` (spot-check with PowerShell: `$m = Get-Content coverage/functional-map.json -Raw | ConvertFrom-Json; $m.elements | Where-Object { $_.selectorHints.testId } | Select-Object -First 5 -ExpandProperty selectorHints`).

- [ ] **Step 3: Re-annotate coverage:** `pnpm plan --update` (uses the existing `reports/route-evidence.json`; re-run `pnpm test` first only if it's missing).

- [ ] **Step 4: Regenerate and inspect drafts:** delete `tests/generated/`, run `pnpm build-tests --top 3`. Verify the generated `isLoaded()` signals are now page-specific testIds (e.g. `{ testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } }`), NOT the generic `Buscar en tienda` header button — this is the verifiable partial closure of B14.

- [ ] **Step 5: Run the drafts live:** `pnpm test:generated` → expected 3/3 pass (plus setup).

- [ ] **Step 6: Full-suite no-regression check:** `pnpm test` → 4/4 green (`locate()` is shared framework code; this is the real check that nothing regressed even though no manual POM builds a testId Strategy).

- [ ] **Step 7: Docs.**
  - Findings doc: new §12 (probe result: which attribute each value came from; map regen numbers; drafts' new signals; 3/3 live result; full-suite green).
  - Backlog: B15 → **done** (what shipped, commit refs); B14 → updated (partially closed for pages with testId-carrying elements; still open for pages without).
  - Roadmap: M7 ✅ row in the milestone table; "Where a fresh session resumes" → next-milestone decision (B13/B9 interactive discovery is the standing candidate); Phase 7 row note (provenance now recorded — the Healing agent's input exists).

- [ ] **Step 8: Commit map + docs:**

```bash
git add coverage/functional-map.json docs/
git commit -m "feat(foundation): schema-1.3 map with testId provenance; M7 live-validated (closes B15)"
```

---

## Self-review notes

- Spec coverage: type + `TESTID_ATTRS` sharing (spec §1) → Task 1 Steps 3/5/6; `locate()` resolution + escaping (§2) → Task 1 Steps 1-4; producers (§3) → Task 1 Step 6; schema bump, no migration, single legacy guard (§4) → Task 1 Step 7 + Task 2 Step 3; Builder revert + inverted regression test + legacy test (§5) → Task 2; offline tests (§6) → Tasks 1-2; live steps 1-6 (§6) → Task 3 Steps 1-6 + docs Step 7. Non-goals respected (no healing, no classification changes, no speculative attributes — Task 3 Step 1 explicitly stops to reassess if an unknown attribute appears).
- Type consistency: `TestIdHint`/`TestIdAttr`/`TESTID_ATTRS` defined once (Task 1 Step 3) and imported everywhere else; `toStrategy`'s guard (Task 2) matches `SelectorHints.testId?: TestIdHint` from Task 1 Step 5; the nested literal test (Task 1 Step 9) matches `strategyLiteral`'s emission (Task 1 Step 8).
- The `typeof hints.testId === 'object'` guard is legal TypeScript against a declared `TestIdHint | undefined` (runtime-legacy JSON is the reason it exists); the string case is only constructible in tests via `as unknown as TestIdHint`, which is confined to the legacy-guard test.
- `hints.ts` deliberately does NOT gain `data-qa-anchor` (dom mode never probed it; adding it untested would be speculative — YAGNI).
