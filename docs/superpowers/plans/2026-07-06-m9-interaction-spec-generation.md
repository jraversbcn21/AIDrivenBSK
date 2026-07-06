# M9 — Builder Interaction-Spec Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Builder generates interaction specs (navigate → open overlay → verify → close → verify) from the map's `interactions[]` for must-capture triggers, and `loadedSignalFor` stops picking same-page-repeated testIds (closes B16).

**Architecture:** Approach A from the design spec (`docs/superpowers/specs/2026-07-06-m9-interaction-spec-generation-design.md`): extend `builder/select.ts` (new `selectInteractionJourneys`, B16 uniqueness check), `builder/generate/TemplateGenerator.ts` (second template pair), `builder/naming.ts` (interaction-prefixed helpers), `builder/cli.ts` (wire both, non-fatal staleness warning). Planner, schema (1.5), and crawler untouched.

**Tech Stack:** TypeScript strict, Vitest unit tests (offline, no browser), Playwright only inside generated spec code (as text). Package manager: pnpm.

## Global Constraints

- `@typescript-eslint/no-explicit-any` is an **error** — no `any`, ever.
- `import/no-cycle` is an **error**, `maxDepth: Infinity`. `builder → explorer` imports are fine (already exist); never `explorer → builder`.
- Selector priority: `getByTestId` → `getByRole` → `getByLabel` → `getByPlaceholder`. No XPath, no fragile CSS.
- Generated code must follow CLAUDE.md's interaction-reliability rule: every state-changing interaction is act→verify→retry.
- Conventional Commits: `feat(builder): ...`, `test(builder): ...`.
- All offline gates green before any live run: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`.
- Live runs require VPN to DES; live validation is Task 6 and needs Jorge's go.

---

### Task 1: Interaction naming helpers (`builder/naming.ts`)

**Files:**
- Modify: `builder/naming.ts`
- Test: `builder/naming.unit.test.ts`

**Interfaces:**
- Consumes: existing private helpers `words`, `nonLocaleSegments` (same file).
- Produces (used by Task 4):
  - `interactionClassNameFor(routePattern: string, interactionId: string): string` — e.g. `MujerRopaRebajasN5303InteractionF05B1C4B`
  - `interactionSpecFileNameFor(routePattern: string, interactionId: string): string` — e.g. `interaction-rebajas-n5303-f05b1c4b.spec.ts`
  - `interactionPageFileNameFor(routePattern: string, interactionId: string): string` — `<className>.ts`

- [ ] **Step 1: Write the failing tests** — append to `builder/naming.unit.test.ts`:

```ts
import { interactionClassNameFor, interactionSpecFileNameFor, interactionPageFileNameFor } from './naming';

describe('interaction naming', () => {
  it('builds the class name with an Interaction suffix and the interaction-id tail', () => {
    expect(interactionClassNameFor('/es/mujer/ropa/rebajas-n5303.html', 'inter_f05b1c4b0668'))
      .toBe('MujerRopaRebajasN5303InteractionF05B1C4B');
  });
  it('prefixes the spec filename with interaction- so it never collides with the navigation spec', () => {
    expect(interactionSpecFileNameFor('/es/mujer/ropa/rebajas-n5303.html', 'inter_f05b1c4b0668'))
      .toBe('interaction-rebajas-n5303-f05b1c4b.spec.ts');
  });
  it('derives the page object filename from the class name', () => {
    expect(interactionPageFileNameFor('/es/mujer/ropa/rebajas-n5303.html', 'inter_f05b1c4b0668'))
      .toBe('MujerRopaRebajasN5303InteractionF05B1C4B.ts');
  });
  it('falls back to Home for a bare root pattern', () => {
    expect(interactionClassNameFor('/', 'inter_0011223344')).toBe('HomeInteraction00112233');
  });
});
```

(If the file has no top-level `describe` import mismatch, keep the existing `import { describe, it, expect } from 'vitest';` header.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit builder/naming.unit.test.ts`
Expected: FAIL — `interactionClassNameFor` is not exported.

- [ ] **Step 3: Implement** — in `builder/naming.ts`, generalize the suffix helper and add the three functions:

```ts
function idSuffix(id: string): string {
  return id.replace(/^(flow|inter)_/, '').slice(0, 8).toUpperCase();
}
```

Replace the body of the existing `flowSuffix` usages: change `flowSuffix(flowId)` calls to `idSuffix(flowId)` and delete `flowSuffix` (behavior identical for `flow_` ids). In `specFileNameFor`, keep its inline `flowId.replace(/^flow_/, '').slice(0, 8)` as is (unchanged behavior) or switch to `idSuffix(flowId).toLowerCase()` — prefer the switch for DRY:

```ts
export function specFileNameFor(routePattern: string, flowId: string): string {
  const segments = nonLocaleSegments(routePattern);
  const slug = words(segments[segments.length - 1] ?? '').join('-') || 'home';
  return `${slug}-${idSuffix(flowId).toLowerCase()}.spec.ts`;
}
```

Then append:

```ts
export function interactionClassNameFor(routePattern: string, interactionId: string): string {
  const ws = words(nonLocaleSegments(routePattern).join('-'));
  const base = ws.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return `${base || 'Home'}Interaction${idSuffix(interactionId)}`;
}

export function interactionSpecFileNameFor(routePattern: string, interactionId: string): string {
  const segments = nonLocaleSegments(routePattern);
  const slug = words(segments[segments.length - 1] ?? '').join('-') || 'home';
  return `interaction-${slug}-${idSuffix(interactionId).toLowerCase()}.spec.ts`;
}

export function interactionPageFileNameFor(routePattern: string, interactionId: string): string {
  return `${interactionClassNameFor(routePattern, interactionId)}.ts`;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:unit builder/naming.unit.test.ts`
Expected: PASS (all existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add builder/naming.ts builder/naming.unit.test.ts
git commit -m "feat(builder): interaction-prefixed naming helpers (M9)"
```

---

### Task 2: B16 — testId uniqueness in `loadedSignalFor`

**Files:**
- Modify: `builder/select.ts`
- Test: `builder/select.unit.test.ts`

**Interfaces:**
- Consumes: existing `loadedSignalFor`, `toStrategy` in `builder/select.ts`.
- Produces: no signature change — `loadedSignalFor(map, leaf)` behavior change only. Also a new internal `strategyForTier(hints, key)` used by the tier loop (Task 3 keeps using `toStrategy` for the trigger).

**Background for the implementer:** today the tier loop calls `toStrategy(el.selectorHints)` (priority-collapsed: an element with testId+role always yields `{testId}`), then checks `key in s`. That means an element with a testId can never contribute its role hint. B16 needs "deprioritize, not exclude": a repeated testId must let the same element fall through to the role/label tiers — so the loop must build the strategy *per tier*.

- [ ] **Step 1: Write the failing tests** — append to the `selectJourneys` describe block in `builder/select.unit.test.ts`:

```ts
  it('B16: a testId repeated on the same page is not eligible as loaded-signal; the element falls to its role hint', () => {
    const gridMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'g1', pageId: 'pPlp', type: 'button', label: 'Guardar 1', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' }, role: { type: 'button', name: 'Guardar en lista' } }, destructive: false },
        { id: 'g2', pageId: 'pPlp', type: 'button', label: 'Guardar 2', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), gridMap, 5);
    // The repeated testId (x2 on pPlp) is skipped; g1's own role hint wins in the role tier.
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Guardar en lista' } });
  });
  it('B16: a unique testId still wins over any role hint', () => {
    const uniqueMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'u1', pageId: 'pPlp', type: 'button', label: 'Filtrar', role: 'button', selectorHints: { role: { type: 'button', name: 'Filtrar' } }, destructive: false },
        { id: 'u2', pageId: 'pPlp', type: 'button', label: 'Añadir', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), uniqueMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } });
  });
  it('B16: the repeat count includes revealed/destructive instances (page-wide), not just candidates', () => {
    const mixedMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'm1', pageId: 'pPlp', type: 'button', label: 'Guardar', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' } }, destructive: false },
        { id: 'm2', pageId: 'pPlp', type: 'button', label: 'Guardar (revelado)', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' } }, destructive: false, revealedBy: 'inter_x' },
        { id: 'm3', pageId: 'pPlp', type: 'filter', label: 'Filtrar', role: 'button', selectorHints: { role: { type: 'button', name: 'Filtrar' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), mixedMap, 5);
    // m1's testId is unique among *candidates* but repeated page-wide — a strict-mode
    // violation live resolves against the DOM, not against our candidate filter.
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Filtrar' } });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit builder/select.unit.test.ts`
Expected: first and third new tests FAIL (loaded-signal is the repeated testId).

- [ ] **Step 3: Implement** — in `builder/select.ts`, add below `toStrategy`:

```ts
type Tier = 'testId' | 'role' | 'label';

// Tier-aware sibling of toStrategy: yields the strategy for one specific tier, so an
// element whose testId is disqualified (B16) can still contribute its role/label hint
// in a later tier — deprioritize, not exclude (B14 precedent).
function strategyForTier(hints: SelectorHints, tier: Tier): Strategy | null {
  if (tier === 'testId' && hints.testId !== undefined && typeof hints.testId === 'object' && hints.testId !== null) {
    return { testId: hints.testId };
  }
  if (tier === 'role' && hints.role !== undefined && hints.role.name !== '') {
    return { role: { type: hints.role.type as NonNullable<Strategy['role']>['type'], name: hints.role.name } };
  }
  if (tier === 'label' && hints.label !== undefined) return { label: hints.label };
  return null;
}
```

Rewrite `loadedSignalFor`'s loop (keep the existing doc comment, extend it with a B16 sentence):

```ts
function loadedSignalFor(map: FunctionalMap, leaf: MapPage): Strategy | null {
  // Revealed elements (M8) only exist after an interaction — asserting one in isLoaded()
  // would always time out on a freshly-loaded page (the exact failure mode B14/M7 closed).
  // B16: a testId repeated among the page's elements resolves to a multi-element locator
  // live (strict-mode violation), so only page-unique testIds are eligible in the testId
  // tier; the element still competes in the role/label tiers. Counted page-wide (including
  // revealed/destructive instances) because Playwright resolves against the DOM, not
  // against our candidate filter. Note the deliberate asymmetry: interaction *triggers*
  // use .first() on a repeated testId instead ("any exemplar opens the overlay").
  const testIdCounts = new Map<string, number>();
  for (const e of map.elements) {
    if (e.pageId !== leaf.id) continue;
    const t = e.selectorHints.testId;
    if (t !== undefined && typeof t === 'object' && t !== null) {
      const k = `${t.attr}=${t.value}`;
      testIdCounts.set(k, (testIdCounts.get(k) ?? 0) + 1);
    }
  }
  const candidates = map.elements.filter((e) => e.pageId === leaf.id && !e.destructive && e.revealedBy === undefined);
  const specific = candidates.filter((e) => e.component === undefined || !SHARED_COMPONENTS.has(e.component));
  const shared = candidates.filter((e) => e.component !== undefined && SHARED_COMPONENTS.has(e.component));
  for (const pass of [specific, shared]) {
    for (const tier of ['testId', 'role', 'label'] as const) {
      for (const el of pass) {
        const s = strategyForTier(el.selectorHints, tier);
        if (s === null) continue;
        if (tier === 'testId') {
          const t = s.testId as TestIdHint;
          if ((testIdCounts.get(`${t.attr}=${t.value}`) ?? 0) !== 1) continue;
        }
        return s;
      }
    }
  }
  return null;
}
```

Add `TestIdHint` to the type-only import from `../src/support/locators`.

- [ ] **Step 4: Run the full builder test file**

Run: `pnpm test:unit builder/select.unit.test.ts`
Expected: PASS — all pre-existing tests (chrome deprioritization, legacy guards, null guard) must stay green; the tier-aware refactor preserves their behavior.

- [ ] **Step 5: Commit**

```bash
git add builder/select.ts builder/select.unit.test.ts
git commit -m "fix(builder): loaded-signal skips same-page-repeated testIds (closes B16)"
```

---

### Task 3: `selectInteractionJourneys` + `InteractionJourneyInput`

**Files:**
- Modify: `builder/generate/Generator.ts` (types), `builder/select.ts` (selection)
- Test: `builder/select.unit.test.ts`

**Interfaces:**
- Consumes: `toStrategy`, `loadedSignalFor`, `CHECKOUT_ROUTE`, `SkippedProposal` (Task 2's file); `FunctionalMap`/`MapFlow`/`MapPage`/`MapElement` from `explorer/map/schema`.
- Produces (used by Tasks 4–5):

```ts
// builder/generate/Generator.ts
export interface InteractionJourneyInput extends JourneyInput {
  interactionId: string;
  trigger: Strategy;            // clicked with .first() by the template
  triggerLabel: string;
  overlayIsDialog: boolean;     // true => open-signal is getByRole('dialog')
  overlayElementSignal: Strategy | null; // open-signal when overlayIsDialog === false
}

// builder/select.ts
export interface InteractionSelection { journeys: InteractionJourneyInput[]; skipped: SkippedProposal[]; }
export function selectInteractionJourneys(map: FunctionalMap, mustCapture: RegExp[]): InteractionSelection;
export function unsatisfiedMustCapture(map: FunctionalMap, mustCapture: RegExp[]): string[];
```

For interaction skips, `SkippedProposal.flowId` carries the **interaction id** (documented at the type's use site).

- [ ] **Step 1: Write the failing tests** — new describe block in `builder/select.unit.test.ts`:

```ts
import { selectInteractionJourneys, unsatisfiedMustCapture } from './select';
import type { MapInteraction, MapElement, MapFlow } from '../explorer/map/schema';

const MUST = [/^añadir a (la )?cesta/i];

const el = (id: string, pageId: string, over: Partial<MapElement> = {}): MapElement => ({
  id, pageId, type: 'button', label: 'x', role: 'button',
  selectorHints: { role: { type: 'button', name: 'x' } }, destructive: false, ...over,
});
const inter = (id: string, pageId: string, triggerElementId: string, over: Partial<MapInteraction> = {}): MapInteraction => ({
  id, pageId, triggerElementId, outcome: 'overlay', revealedElementIds: [], ...over,
});
const flow = (id: string, steps: string[], session: 'anon' | 'auth' = 'anon'): MapFlow => ({
  id, name: steps.join(' -> '), type: 'PLP', session, priority: 'med', steps,
});

const trigger = el('eTrig', 'pPlp', {
  label: 'Añadir a la cesta Pantalón bombacho',
  selectorHints: { role: { type: 'button', name: 'Añadir a la cesta Pantalón bombacho' }, testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } },
});
const dialogEl = el('eDlg', 'pPlp', { type: 'modal', label: 'Tallas', role: 'dialog', selectorHints: { role: { type: 'dialog', name: 'Tallas 32 34' } }, revealedBy: 'i1' });

const interMap: FunctionalMap = {
  ...map,
  elements: [trigger, dialogEl],
  flows: [flow('fPlp', ['pRoot', 'pHub', 'pPlp'])],
  interactions: [inter('i1', 'pPlp', 'eTrig', { revealedElementIds: ['eDlg'] })],
};

describe('selectInteractionJourneys', () => {
  it('generates for an overlay interaction whose trigger matches a must-capture pattern, inheriting chain and session from the flow ending at its page', () => {
    const r = selectInteractionJourneys(interMap, MUST);
    expect(r.journeys).toHaveLength(1);
    const j = r.journeys[0];
    expect(j.interactionId).toBe('i1');
    expect(j.flowId).toBe('fPlp');
    expect(j.session).toBe('anon');
    expect(j.chain.map((s) => s.path)).toEqual(['/', '/es/h-woman.html', '/es/mujer/ropa/camisetas-n4365.html']);
    expect(j.trigger).toEqual({ testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } });
    expect(j.overlayIsDialog).toBe(true);
    expect(j.overlayElementSignal).toBeNull();
    expect(j.mapGeneratedAt).toBe(interMap.generatedAt);
  });
  it('the trigger may use a testId that repeats on the page (opposite policy to B16 — .first() semantics)', () => {
    const repeated: FunctionalMap = {
      ...interMap,
      elements: [trigger, { ...trigger, id: 'eTrig2', label: 'Añadir a la cesta Vestido corsé' }, dialogEl],
    };
    const r = selectInteractionJourneys(repeated, MUST);
    expect(r.journeys[0].trigger).toEqual({ testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } });
  });
  it('ignores non-overlay outcomes and non-matching trigger labels silently (not skips)', () => {
    const m: FunctionalMap = {
      ...interMap,
      elements: [trigger, el('eOther', 'pPlp', { label: 'Filtrar' })],
      interactions: [
        inter('i2', 'pPlp', 'eTrig', { outcome: 'navigated', navigatedTo: '/x' }),
        inter('i3', 'pPlp', 'eOther'),
      ],
    };
    const r = selectInteractionJourneys(m, MUST);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped).toHaveLength(0);
  });
  it('resolves a duplicated trigger element id to the first occurrence (canonical map has id collisions)', () => {
    const dup: FunctionalMap = {
      ...interMap,
      elements: [trigger, { ...trigger, label: 'Añadir a la cesta Otro' }, dialogEl],
    };
    const r = selectInteractionJourneys(dup, MUST);
    expect(r.journeys).toHaveLength(1);
    expect(r.journeys[0].triggerLabel).toBe('Añadir a la cesta Pantalón bombacho');
  });
  it('skips with a reason when no flow ends at the interaction page', () => {
    const m: FunctionalMap = { ...interMap, flows: [flow('fHub', ['pRoot', 'pHub'])] };
    const r = selectInteractionJourneys(m, MUST);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped[0]).toEqual({ flowId: 'i1', reason: expect.stringMatching(/no flow ends/i) });
  });
  it('skips when the trigger element id resolves to nothing', () => {
    const m: FunctionalMap = { ...interMap, elements: [dialogEl] };
    const r = selectInteractionJourneys(m, MUST);
    expect(r.skipped[0].reason).toMatch(/trigger element missing/i);
  });
  it('skips checkout-looking chains by path guard', () => {
    const m: FunctionalMap = {
      ...interMap,
      elements: [el('eT', 'pPay', { label: 'Añadir a la cesta X' }), el('eD', 'pPay', { role: 'dialog', selectorHints: { role: { type: 'dialog', name: 'D' } } })],
      flows: [flow('fPay', ['pRoot', 'pPay'])],
      interactions: [inter('i9', 'pPay', 'eT', { revealedElementIds: ['eD'] })],
    };
    const r = selectInteractionJourneys(m, MUST);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/checkout/i);
  });
  it('falls back to the first usable revealed hint when no revealed element is a dialog, and skips when there is none', () => {
    const btn = el('eBtn', 'pPlp', { label: 'Descartar', selectorHints: { role: { type: 'button', name: 'Descartar' } }, revealedBy: 'i1' });
    const withBtn: FunctionalMap = { ...interMap, elements: [trigger, btn], interactions: [inter('i1', 'pPlp', 'eTrig', { revealedElementIds: ['eBtn'] })] };
    expect(selectInteractionJourneys(withBtn, MUST).journeys[0]).toMatchObject({
      overlayIsDialog: false,
      overlayElementSignal: { role: { type: 'button', name: 'Descartar' } },
    });
    const bare = el('eBare', 'pPlp', { label: '', selectorHints: {}, revealedBy: 'i1' });
    const without: FunctionalMap = { ...interMap, elements: [trigger, bare], interactions: [inter('i1', 'pPlp', 'eTrig', { revealedElementIds: ['eBare'] })] };
    const r = selectInteractionJourneys(without, MUST);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/no verifiable overlay/i);
  });
});

describe('unsatisfiedMustCapture', () => {
  it('names patterns with no matching overlay capture in the map', () => {
    expect(unsatisfiedMustCapture(interMap, MUST)).toEqual([]);
    expect(unsatisfiedMustCapture({ ...interMap, interactions: [] }, MUST)).toEqual([MUST[0].source]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit builder/select.unit.test.ts`
Expected: FAIL — `selectInteractionJourneys` is not exported.

- [ ] **Step 3: Implement.** In `builder/generate/Generator.ts`, append after `JourneyInput`:

```ts
/** A journey that additionally opens (and closes) a map-recorded overlay interaction
 *  on the leaf page. Selection guarantees an open-signal exists: either the overlay
 *  is a dialog (assert getByRole('dialog')) or overlayElementSignal is non-null. */
export interface InteractionJourneyInput extends JourneyInput {
  interactionId: string;
  trigger: Strategy; // clicked with .first(): "any exemplar of the (possibly grid-repeated) trigger"
  triggerLabel: string;
  overlayIsDialog: boolean;
  overlayElementSignal: Strategy | null;
}
```

In `builder/select.ts` (imports: add `MapFlow`, `MapElement` to the schema type import; add `InteractionJourneyInput` to the Generator import):

```ts
export interface InteractionSelection {
  journeys: InteractionJourneyInput[];
  // flowId carries the interaction id here — the skip list predates interactions.
  skipped: SkippedProposal[];
}

/** Must-capture patterns with no satisfying overlay capture anywhere in the map —
 *  the CLI's non-fatal staleness warning ("re-crawl with pnpm explore --update"). */
export function unsatisfiedMustCapture(map: FunctionalMap, mustCapture: RegExp[]): string[] {
  return mustCapture
    .filter((r) => !map.interactions.some((i) => {
      if (i.outcome !== 'overlay') return false;
      const trigger = map.elements.find((e) => e.id === i.triggerElementId);
      return trigger !== undefined && r.test(trigger.label);
    }))
    .map((r) => r.source);
}

/** One interaction spec per must-capture overlay capture in the map (M9 design §3).
 *  Selection is map-only — no PlanReport: the navigation chain is inherited from the
 *  flow whose leaf is the interaction's page (pages are per-session, so this fixes
 *  the session too). */
export function selectInteractionJourneys(map: FunctionalMap, mustCapture: RegExp[]): InteractionSelection {
  const journeys: InteractionJourneyInput[] = [];
  const skipped: SkippedProposal[] = [];
  const pageById = new Map(map.pages.map((p) => [p.id, p]));
  const flowByLeaf = new Map<string, MapFlow>();
  for (const f of map.flows) {
    const leafId = f.steps[f.steps.length - 1];
    if (leafId !== undefined && !flowByLeaf.has(leafId)) flowByLeaf.set(leafId, f);
  }

  for (const interaction of map.interactions) {
    if (interaction.outcome !== 'overlay') continue;
    // .find() = first match on purpose: the canonical map has duplicate element ids
    // (label+page-derived ids collide; observed 2026-07-06, recorded as a finding).
    const trigger = map.elements.find((e) => e.id === interaction.triggerElementId);
    if (trigger === undefined) {
      skipped.push({ flowId: interaction.id, reason: 'trigger element missing from the map' });
      continue;
    }
    if (!mustCapture.some((r) => r.test(trigger.label))) continue; // out of M9 scope, not a defect
    const flow = flowByLeaf.get(interaction.pageId);
    if (flow === undefined) {
      skipped.push({ flowId: interaction.id, reason: 'no flow ends at the interaction page (stale map?)' });
      continue;
    }
    const pages = flow.steps.map((id) => pageById.get(id));
    if (pages.some((p) => p === undefined)) {
      skipped.push({ flowId: interaction.id, reason: 'flow references a page id missing from the map' });
      continue;
    }
    const chain = (pages as MapPage[]).map((p) => ({ path: p.path, routePattern: p.routePattern, title: p.title }));
    if (chain.some((s) => CHECKOUT_ROUTE.test(s.path))) {
      skipped.push({ flowId: interaction.id, reason: 'checkout-looking route, skipped by path guard' });
      continue;
    }
    const triggerStrategy = toStrategy(trigger.selectorHints);
    if (triggerStrategy === null) {
      skipped.push({ flowId: interaction.id, reason: 'trigger has no usable selector hint' });
      continue;
    }
    const revealed = interaction.revealedElementIds
      .map((id) => map.elements.find((e) => e.id === id))
      .filter((e): e is MapElement => e !== undefined);
    const overlayIsDialog = revealed.some((e) => e.selectorHints.role?.type === 'dialog');
    let overlayElementSignal: Strategy | null = null;
    if (!overlayIsDialog) {
      for (const e of revealed) {
        const s = toStrategy(e.selectorHints);
        if (s !== null) { overlayElementSignal = s; break; }
      }
      if (overlayElementSignal === null) {
        skipped.push({ flowId: interaction.id, reason: 'no verifiable overlay open-signal (no dialog role, no usable revealed hint)' });
        continue;
      }
    }
    const leaf = (pages as MapPage[])[pages.length - 1];
    journeys.push({
      flowId: flow.id,
      interactionId: interaction.id,
      journeyName: `${flow.name} => overlay "${trigger.label}"`,
      session: flow.session,
      chain,
      loadedSignal: loadedSignalFor(map, leaf),
      mapGeneratedAt: map.generatedAt,
      trigger: triggerStrategy,
      triggerLabel: trigger.label,
      overlayIsDialog,
      overlayElementSignal,
    });
  }
  return { journeys, skipped };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:unit builder/select.unit.test.ts`
Expected: PASS (all new + all pre-existing).

- [ ] **Step 5: Commit**

```bash
git add builder/select.ts builder/select.unit.test.ts builder/generate/Generator.ts
git commit -m "feat(builder): select must-capture overlay interactions into interaction journeys (M9)"
```

---

### Task 4: Interaction templates in `TemplateGenerator`

**Files:**
- Modify: `builder/generate/Generator.ts` (interface method), `builder/generate/TemplateGenerator.ts`
- Test: `builder/generate/TemplateGenerator.unit.test.ts`

**Interfaces:**
- Consumes: `InteractionJourneyInput` (Task 3), naming helpers (Task 1), existing `sq`/`strategyLiteral`/`header` helpers.
- Produces: `Generator.generateInteraction(input: InteractionJourneyInput): GeneratedFile[]` — implemented by `TemplateGenerator`; used by the CLI (Task 5).

- [ ] **Step 1: Write the failing tests** — append to `builder/generate/TemplateGenerator.unit.test.ts` (reuse the file's existing fixture style; build a minimal `InteractionJourneyInput`):

```ts
import type { InteractionJourneyInput } from './Generator';

const interactionInput: InteractionJourneyInput = {
  flowId: 'flow_94d821294512',
  interactionId: 'inter_f05b1c4b0668',
  journeyName: '/ -> /es/mujer/ropa/rebajas-n5303.html => overlay "Añadir a la cesta"',
  session: 'anon',
  chain: [
    { path: '/', routePattern: '/', title: 'Home' },
    { path: '/es/mujer/ropa/rebajas-n5303.html', routePattern: '/es/mujer/ropa/rebajas-n{id}.html', title: 'Rebajas' },
  ],
  loadedSignal: { role: { type: 'button', name: 'Filtrar' } },
  mapGeneratedAt: '2026-07-05T00:00:00Z',
  trigger: { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } },
  triggerLabel: 'Añadir a la cesta Pantalón bombacho',
  overlayIsDialog: true,
  overlayElementSignal: null,
};

describe('TemplateGenerator.generateInteraction', () => {
  const files = new TemplateGenerator().generateInteraction(interactionInput);
  const page = files.find((f) => f.relPath.startsWith('pages/'))!;
  const spec = files.find((f) => !f.relPath.startsWith('pages/'))!;

  it('emits an interaction-prefixed spec and an Interaction-suffixed page object', () => {
    expect(spec.relPath).toBe('interaction-rebajas-n-id-f05b1c4b.spec.ts');
    expect(page.relPath).toBe('pages/MujerRopaRebajasNInteractionF05B1C4B.ts');
  });
  it('clicks the trigger with .first() (repeated-grid semantics) inside an act->verify->retry loop', () => {
    expect(page.content).toContain(".first().click()");
    expect(page.content).toContain('dismissOnboardingTour');
    expect(page.content).toContain('Date.now() + 20_000');
  });
  it('asserts overlay-open via a name-less dialog role when overlayIsDialog', () => {
    expect(page.content).toContain("this.page.getByRole('dialog').isVisible()");
    expect(page.content).not.toContain("getByRole('dialog', {"); // no name — product-variable
  });
  it('falls back to the revealed-element signal when the overlay is not a dialog', () => {
    const alt = new TemplateGenerator().generateInteraction({
      ...interactionInput,
      overlayIsDialog: false,
      overlayElementSignal: { role: { type: 'button', name: 'Descartar' } },
    });
    const altPage = alt.find((f) => f.relPath.startsWith('pages/'))!;
    expect(altPage.content).toContain("locate(this.page, { role: { type: 'button', name: 'Descartar' } }).first().isVisible()");
  });
  it('closes via Escape with verify-retry and stamps the interaction header', () => {
    expect(page.content).toContain("keyboard.press('Escape')");
    expect(page.content).toContain('GENERATED from interaction inter_f05b1c4b0668');
  });
  it('spec walks open -> isLoaded -> openOverlay -> open-poll -> closeOverlay -> closed-poll', () => {
    expect(spec.content).toContain("test('interaction:");
    const order = ['await target.open()', 'target.isLoaded()', 'await target.openOverlay()', 'target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true)', 'await target.closeOverlay()', 'target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(false)'];
    let last = -1;
    for (const piece of order) {
      const idx = spec.content.indexOf(piece);
      expect(idx, piece).toBeGreaterThan(last);
      last = idx;
    }
  });
});
```

(Adjust the two expected `relPath` literals in the first test to whatever Task 1's helpers produce for routePattern `/es/mujer/ropa/rebajas-n{id}.html` — compute by hand before writing: segments → `mujer`, `ropa`, `rebajas-n{id}`; `{id}` is stripped, so slug `rebajas-n`, class base `MujerRopaRebajasN`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit builder/generate/TemplateGenerator.unit.test.ts`
Expected: FAIL — `generateInteraction` does not exist.

- [ ] **Step 3: Implement.** In `builder/generate/Generator.ts`, extend the interface:

```ts
export interface Generator {
  generate(input: JourneyInput): GeneratedFile[];
  generateInteraction(input: InteractionJourneyInput): GeneratedFile[];
}
```

In `builder/generate/TemplateGenerator.ts` — add imports (`InteractionJourneyInput`, `interactionClassNameFor`, `interactionSpecFileNameFor`, `interactionPageFileNameFor`) and:

```ts
const interactionHeader = (i: InteractionJourneyInput): string =>
  `// GENERATED from interaction ${i.interactionId} / flow ${i.flowId} (map generated ${i.mapGeneratedAt}) — review before promoting; regeneration overwrites.\n`;

function overlayOpenExpr(input: InteractionJourneyInput): string {
  return input.overlayIsDialog
    ? `this.page.getByRole('dialog').isVisible()`
    : `locate(this.page, ${strategyLiteral(input.overlayElementSignal as Strategy)}).first().isVisible()`;
}

function interactionPageObjectFile(input: InteractionJourneyInput): GeneratedFile {
  const className = interactionClassNameFor(leafOf(input).routePattern, input.interactionId);
  const gotos = input.chain.map((s) => `    await this.goto(${sq(s.path)});`).join('\n');
  const isLoadedBody = input.loadedSignal !== null
    ? `    return locate(this.page, ${strategyLiteral(input.loadedSignal)}).isVisible();`
    : `    return this.page.getByRole('main').isVisible();`;
  const content = `${interactionHeader(input)}import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';
import { dismissOnboardingTour } from '../../../src/support/consent';

export class ${className} extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so the journey navigates the way it
   * was discovered.
   */
  async open(): Promise<void> {
${gotos}
  }

  async isLoaded(): Promise<boolean> {
${isLoadedBody}
  }

  /**
   * Act -> verify -> retry (CLAUDE.md standing rule): a fire-once click can be silently
   * lost to Vue hydration lag. .first() on the trigger is deliberate — the testId may
   * repeat across a product grid and any exemplar opens the overlay (M9 design §4).
   */
  async openOverlay(): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await dismissOnboardingTour(this.page);
      await locate(this.page, ${strategyLiteral(input.trigger)}).first().click().catch(() => undefined);
      await this.page.waitForTimeout(500);
      if (await this.isOverlayOpen().catch(() => false)) return;
    }
    throw new Error('${className}: the overlay did not open within the deadline');
  }

  async isOverlayOpen(): Promise<boolean> {
    return ${overlayOpenExpr(input)};
  }

  async closeOverlay(): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await this.page.waitForTimeout(500);
      if (!(await this.isOverlayOpen().catch(() => false))) return;
    }
    throw new Error('${className}: the overlay did not close on Escape within the deadline');
  }
}
`;
  return { relPath: `pages/${interactionPageFileNameFor(leafOf(input).routePattern, input.interactionId)}`, content };
}

function interactionSpecFile(input: InteractionJourneyInput): GeneratedFile {
  const className = interactionClassNameFor(leafOf(input).routePattern, input.interactionId);
  const content = `${interactionHeader(input)}import { test, expect } from '../../src/fixtures/test';
import { ${className} } from './pages/${className}';

const HYDRATION_TIMEOUT_MS = 20_000;

test(${sq(`interaction: ${input.journeyName}`)}, async ({ page }) => {
  const target = new ${className}(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.openOverlay();
  await expect.poll(() => target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.closeOverlay();
  await expect.poll(() => target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(false);
});
`;
  return { relPath: interactionSpecFileNameFor(leafOf(input).routePattern, input.interactionId), content };
}
```

Add to the class:

```ts
export class TemplateGenerator implements Generator {
  generate(input: JourneyInput): GeneratedFile[] {
    return [pageObjectFile(input), specFile(input)];
  }
  generateInteraction(input: InteractionJourneyInput): GeneratedFile[] {
    return [interactionPageObjectFile(input), interactionSpecFile(input)];
  }
}
```

Note: `leafOf` already accepts any `JourneyInput`; `InteractionJourneyInput` extends it — no change needed there.

- [ ] **Step 4: Run tests**

Run: `pnpm test:unit builder/generate/TemplateGenerator.unit.test.ts`
Expected: PASS (existing navigation-template tests untouched and green).

- [ ] **Step 5: Commit**

```bash
git add builder/generate/Generator.ts builder/generate/TemplateGenerator.ts builder/generate/TemplateGenerator.unit.test.ts
git commit -m "feat(builder): interaction page-object/spec templates — open, verify, Escape-close (M9)"
```

---

### Task 5: CLI wiring + offline smoke + full gates

**Files:**
- Modify: `builder/cli.ts`
- No new unit test file (the CLI stays thin; all logic is unit-tested in Tasks 1–4). The offline smoke against the committed canonical map is this task's verification.

**Interfaces:**
- Consumes: `selectInteractionJourneys`, `unsatisfiedMustCapture` (Task 3), `generateInteraction` (Task 4), `loadExplorerConfig` from `explorer/config` (already env-driven, fail-fast).

- [ ] **Step 1: Implement the wiring.** In `builder/cli.ts`:

Add imports:

```ts
import { selectJourneys, selectInteractionJourneys, unsatisfiedMustCapture } from './select';
import { loadExplorerConfig } from '../explorer/config';
```

Replace the body between the `selectJourneys` call and the final log with:

```ts
  const { journeys, skipped } = selectJourneys(report, map, args.top);
  for (const s of skipped) console.warn(`Skipped ${s.flowId}: ${s.reason}`);

  const mustCapture = loadExplorerConfig().interactions.mustCapture;
  const interactions = selectInteractionJourneys(map, mustCapture);
  for (const s of interactions.skipped) console.warn(`Skipped interaction ${s.flowId}: ${s.reason}`);
  for (const src of unsatisfiedMustCapture(map, mustCapture)) {
    console.warn(`Warning: the map contains no "${src}" overlay capture — re-crawl with \`pnpm explore --update\`.`);
  }

  if (journeys.length === 0 && interactions.journeys.length === 0) {
    console.error('No specs generated: no eligible proposals or interactions (see skips above, or re-run `pnpm plan`).');
    process.exitCode = 1;
    return;
  }

  const generator = new TemplateGenerator();
  for (const journey of journeys) {
    for (const file of generator.generate(journey)) {
      const outPath = join(args.out, file.relPath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, file.content, 'utf8');
      console.log(`Wrote ${outPath}`);
    }
    if (journey.loadedSignal === null) {
      console.warn(`Note: ${journey.flowId} has no usable leaf element — its isLoaded() only checks the main landmark.`);
    }
  }
  for (const journey of interactions.journeys) {
    for (const file of generator.generateInteraction(journey)) {
      const outPath = join(args.out, file.relPath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, file.content, 'utf8');
      console.log(`Wrote ${outPath}`);
    }
  }
  console.log(`Generated ${journeys.length} journey spec(s) and ${interactions.journeys.length} interaction spec(s) into ${args.out}/ — review, run with \`pnpm test:generated\`, promote by moving into tests/<domain>/.`);
```

- [ ] **Step 2: Offline smoke against the committed canonical map**

Run: `pnpm build-tests --top 3`
Expected output includes:
- 3 navigation journey file pairs written (as before),
- exactly **1** interaction pair: `tests/generated/interaction-rebajas-n-id-<tail>.spec.ts` + `tests/generated/pages/MujerRopaRebajasNInteraction<TAIL>.ts` (tail = first 8 chars of the map's real interaction id),
- **no** "contains no ... overlay capture" warning (the map satisfies the default pattern),
- final line reports `... and 1 interaction spec(s)`.

Inspect the generated interaction spec by eye: `.first()`, name-less `getByRole('dialog')`, Escape close, chain of gotos ending at the rebajas PLP.

- [ ] **Step 3: Full offline gates**

Run: `pnpm typecheck` — Expected: clean.
Run: `pnpm lint` — Expected: clean (no `any`, no cycles).
Run: `pnpm test:unit` — Expected: full suite PASS.

- [ ] **Step 4: Commit**

```bash
git add builder/cli.ts
git commit -m "feat(builder): CLI generates must-capture interaction specs alongside navigation specs (M9)"
```

---

### Task 6: Live validation + documentation closure (needs VPN/DES + Jorge's go)

**Files:**
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (new §17), `docs/roadmap/2026-07-02-platform-roadmap.md`, `docs/roadmap/2026-07-02-backlog.md` (B16 → done; M9 row), `CLAUDE.md` (Current state + pending tasks), memory (`project_overview.md`).

**Success criteria (design §7):**

- [ ] **Step 1:** `pnpm exec playwright test --project=setup` (fresh auth state), then `pnpm build-tests --top 3` → 3 nav + 1 interaction, 0 errors.
- [ ] **Step 2:** `pnpm test:generated` → **the interaction spec passes live** (opens the Tallas dialog on the rebajas PLP via grid quick-add, closes it). Navigation specs 3/3. If the top-3 lacks a B16-shaped page, additionally regenerate targeting `falda-mini-…c0p233761111` (the M8b failure): raise `--top` until included (B14 precedent used `--top 16`) and confirm its loaded-signal is no longer `productItemWishlist`.
- [ ] **Step 3:** No-regression: `pnpm test` — expected **3/4**: `add-to-cart.spec.ts` is deterministically red from A5 (pre-existing). Verify the failure snapshot still shows the Personalizable product ("Camiseta tirantes rib" or successor); anything else = investigate before closing.
- [ ] **Step 4:** `pnpm plan --update` — behaves identically (planner untouched); commit the re-annotated map only if it changed.
- [ ] **Step 5:** Documentation closure:
  - findings doc §17: what ran, results, the duplicate-element-ids observation (830 collisions) recorded as a small open lead;
  - backlog: B16 marked done (by M9), M9 resume pointer updated; A5 unchanged (still open);
  - roadmap: M9 row in the milestone table; "Where a fresh session resumes" updated;
  - CLAUDE.md: "Current state" line replaced wholesale; pending tasks list updated (A5 stays #1 candidate);
  - memory: update `project_overview.md` current-phase note.
- [ ] **Step 6: Commit** docs as `docs: M9 closure — findings §17, roadmap/backlog/CLAUDE.md resume pointers`.

---

## Self-Review (done at write time)

- **Spec coverage:** design §3 → Task 3; §4 → Tasks 1, 4; §5 → Task 2; §6 (guards) → Task 3 tests; CLI/warning (§3 last ¶) → Task 5; §7 → Tasks 1–5 offline + Task 6 live. No gaps.
- **Placeholders:** none — every code step carries the full code.
- **Type consistency:** `InteractionJourneyInput` defined once (Task 3) and consumed by name in Tasks 4–5; `strategyForTier` internal to Task 2's file; naming helpers match between Tasks 1 and 4. Task 4's expected relPaths are derived from Task 1's rules for routePattern `/…rebajas-n{id}.html` (slug `rebajas-n`, `{id}` stripped) — the implementer must confirm against the actual helper output before asserting literals.
