# Multi-Step Flow Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MapFlow.steps` becomes the real root-to-leaf navigation chain (reconstructed from each page's `discoveredVia` parent link) instead of a single page id.

**Architecture:** Contained entirely in `explorer/map/` — `buildMap()` gains a first-pass `session:path → page` index and a second pass that walks each page's `discoveredVia` chain backward to a seed. Schema bumps `1.0 → 1.1`. No crawler/extractor changes. After green tests, a live crawl refreshes the committed canonical map so data matches the new schema.

**Tech Stack:** TypeScript strict, Vitest (offline). Live refresh uses `pnpm explore` (VPN).

**Design spec:** `docs/superpowers/specs/2026-07-02-flow-synthesis-design.md`

## Global Constraints

- `pnpm typecheck` (strict, no `any`) and `pnpm lint` (no import cycles) pass; all unit tests offline/deterministic.
- `buildMap()` stays a pure, total function over `ClassifiedPage[]` — no dependency on `explorer/config.ts`; the anti-cycle guard is a local `MAX_CHAIN_HOPS = 50` constant.
- One flow per page (parity with today); `MapFlow.id` stays `makeId('flow', pageId)` keyed on the endpoint page only.
- Chains never cross sessions (lookup key includes `session`); a missing parent stops the chain short instead of throwing.
- Canonical map (`coverage/functional-map.json`) must be regenerated live (`--update`) in the same milestone — no stale schema-1.0 data left committed.

---

### Task 1: Chain synthesis in `buildMap()` + schema 1.1

**Files:**
- Modify: `explorer/map/schema.ts` (line 5: `SCHEMA_VERSION`)
- Modify: `explorer/map/builder.ts` (flow assembly)
- Test: `explorer/map/builder.unit.test.ts`

**Interfaces:**
- Consumes: existing `ClassifiedPage`, `makeId`, `routePattern`, schema types.
- Produces: `buildMap()` — signature unchanged; `flows[*].steps` is now the ordered chain of page ids from a seed-discovered root to the flow's endpoint page, `flows[*].name` is the chain's paths joined with `" -> "`.

- [ ] **Step 1: Update the existing tests and add the new ones** — `explorer/map/builder.unit.test.ts` becomes:

```ts
import { describe, it, expect } from 'vitest';
import { buildMap, type ClassifiedPage } from './builder';
import type { PageExtraction } from '../types';

const pdp: PageExtraction = {
  meta: { path: '/es/abc-c0p123.html', url: 'u', title: 'Camiseta', session: 'anon', discoveredVia: '/es/search' },
  landmarkRoles: ['banner', 'main'], textSummary: 'talla',
  links: [], componentKinds: ['Header'],
  elements: [{ type: 'button', label: 'Añadir a la cesta', role: 'button', selectorHints: { testId: 'add' }, destructive: false }],
  forms: [{ purposeHint: 'login', fields: [{ name: 'email', type: 'email', required: true }] }],
};

const classified: ClassifiedPage[] = [{ extraction: pdp, classification: { pageType: 'PDP', confidence: 0.9 } }];

const page = (path: string, discoveredVia: string): PageExtraction => ({
  meta: { path, url: 'u', title: path, session: 'anon', discoveredVia },
  landmarkRoles: [], textSummary: '', links: [], componentKinds: [], elements: [], forms: [],
});

describe('buildMap', () => {
  it('produces a schema-versioned map with stable, deterministic ids', () => {
    const a = buildMap({ classified, environment: 'des', now: '2026-01-01T00:00:00Z' });
    const b = buildMap({ classified, environment: 'des', now: '2026-01-01T00:00:00Z' });
    expect(a.schemaVersion).toBe('1.1');
    expect(a.pages[0].pageType).toBe('PDP');
    expect(a.pages[0].routePattern).toBe('/es/abc-c0p{id}.html');
    expect(a).toEqual(b); // fully deterministic
  });

  it('assigns high priority to PDP flows and maps elements/forms/components to the page', () => {
    const m = buildMap({ classified, environment: 'des' });
    const pageId = m.pages[0].id;
    expect(m.elements[0].pageId).toBe(pageId);
    expect(m.forms[0].purpose).toBe('login');
    expect(m.components.find((c) => c.kind === 'Header')?.foundOnPages).toContain(pageId);
    expect(m.flows.find((f) => f.type.includes('PDP'))?.priority).toBe('high');
  });

  it('synthesizes the full discoveredVia chain into flow steps and a path-chain name', () => {
    const m = buildMap({
      classified: [
        { extraction: page('/', 'seed'), classification: { pageType: 'Home', confidence: 0.9 } },
        { extraction: page('/es/h-woman.html', '/'), classification: { pageType: 'Other', confidence: 0.3 } },
        { extraction: page('/es/shop-cart.html', '/es/h-woman.html'), classification: { pageType: 'Cart', confidence: 0.8 } },
      ],
      environment: 'des',
    });
    const cartFlow = m.flows.find((f) => f.type === 'Cart');
    const ids = m.pages.map((p) => p.id);
    expect(cartFlow?.steps).toEqual(ids); // root -> hub -> cart, in crawl order
    expect(cartFlow?.name).toBe('/ -> /es/h-woman.html -> /es/shop-cart.html');
    // Seed page keeps a single-step flow (degenerate 1-page chain)
    expect(m.flows.find((f) => f.type === 'Home')?.steps).toEqual([ids[0]]);
  });

  it('stops the chain short when a parent is missing instead of throwing', () => {
    const m = buildMap({
      classified: [
        { extraction: page('/es/orphan.html', '/es/never-crawled.html'), classification: { pageType: 'Other', confidence: 0.3 } },
      ],
      environment: 'des',
    });
    expect(m.flows[0].steps).toEqual([m.pages[0].id]);
    expect(m.flows[0].name).toBe('/es/orphan.html');
  });

  it('never chains across sessions', () => {
    const auth = { ...page('/es/x.html', '/'), meta: { ...page('/es/x.html', '/').meta, session: 'auth' as const } };
    const m = buildMap({
      classified: [
        { extraction: page('/', 'seed'), classification: { pageType: 'Home', confidence: 0.9 } }, // anon
        { extraction: auth, classification: { pageType: 'Other', confidence: 0.3 } },             // auth, parent '/' only exists in anon
      ],
      environment: 'des',
    });
    const authFlow = m.flows.find((f) => f.session === 'auth');
    expect(authFlow?.steps).toHaveLength(1); // anon '/' must NOT be its parent
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm test:unit explorer/map/builder.unit.test.ts`
Expected: FAIL — `schemaVersion` is `'1.0'`, chain test gets single-element `steps`, name test gets `'Cart (anon)'`.

- [ ] **Step 3: Bump schema** — `explorer/map/schema.ts` line 5:

```ts
export const SCHEMA_VERSION = '1.1';
```

- [ ] **Step 4: Implement chain synthesis** — in `explorer/map/builder.ts`, add after `PRIORITY_BY_TYPE`:

```ts
// Defensive ceiling only: the crawler's Frontier dedups before enqueueing, so the discovery
// graph is a tree and real chains are bounded by crawl depth. This guards against a malformed
// fixture (or a future crawler change) introducing a cycle, without coupling buildMap to
// crawl config.
const MAX_CHAIN_HOPS = 50;

interface ChainNode {
  id: string;
  path: string;
  discoveredVia: string;
}
```

Then rework `buildMap()`: the existing single loop keeps building `pages`/`elements`/`forms`/`components` and additionally populates the index, while `flows` moves to a second loop (parents always precede children in real crawl order, but a two-pass build keeps `buildMap` total over any fixture ordering):

```ts
export function buildMap(input: { classified: ClassifiedPage[]; environment: string; now?: string }): FunctionalMap {
  const pages: MapPage[] = [];
  const elements: MapElement[] = [];
  const forms: MapForm[] = [];
  const flows: MapFlow[] = [];
  const componentsByKey = new Map<string, MapComponent>();
  // session:path -> chain node, for reconstructing each page's discoveredVia chain (design
  // spec 2026-07-02-flow-synthesis-design.md).
  const nodeByKey = new Map<string, ChainNode>();

  for (const { extraction: ex, classification } of input.classified) {
    const pattern = routePattern(ex.meta.path);
    const pageId = makeId('page', pattern, ex.meta.session);
    pages.push({
      id: pageId, path: ex.meta.path, routePattern: pattern, pageType: classification.pageType,
      session: ex.meta.session, title: ex.meta.title, discoveredVia: ex.meta.discoveredVia,
    });
    nodeByKey.set(`${ex.meta.session}:${ex.meta.path}`, { id: pageId, path: ex.meta.path, discoveredVia: ex.meta.discoveredVia });

    // ... elements / forms / componentKinds blocks unchanged ...
  }

  for (const { extraction: ex, classification } of input.classified) {
    const pattern = routePattern(ex.meta.path);
    const pageId = makeId('page', pattern, ex.meta.session);

    const chain: ChainNode[] = [];
    let node: ChainNode | undefined = { id: pageId, path: ex.meta.path, discoveredVia: ex.meta.discoveredVia };
    let hops = 0;
    while (node && hops++ < MAX_CHAIN_HOPS) {
      chain.unshift(node);
      if (node.discoveredVia === 'seed') break;
      node = nodeByKey.get(`${ex.meta.session}:${node.discoveredVia}`);
    }

    flows.push({
      id: makeId('flow', pageId),
      name: chain.map((n) => n.path).join(' -> '),
      type: classification.pageType,
      session: ex.meta.session,
      priority: PRIORITY_BY_TYPE[classification.pageType],
      steps: chain.map((n) => n.id),
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.now ?? new Date().toISOString(),
    environment: input.environment,
    pages, components: [...componentsByKey.values()], elements, forms, flows,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit explorer/map/builder.unit.test.ts`
Expected: PASS (5 tests). Then `pnpm typecheck && pnpm lint && pnpm test:unit` — all green (no other suite asserts on `schemaVersion` or flow shape, but verify).

- [ ] **Step 6: Commit**

```bash
git add explorer/map/schema.ts explorer/map/builder.ts explorer/map/builder.unit.test.ts
git commit -m "feat(explorer): synthesize multi-step flows from discoveredVia chains"
```

---

### Task 2: Live map refresh (DEFERRED-live, requires VPN)

**Files:**
- Modify (generated): `coverage/functional-map.json`
- Modify: `docs/roadmap/2026-07-02-platform-roadmap.md` (M4 row + phase table), `docs/roadmap/2026-07-02-backlog.md` (B8)

- [ ] **Step 1: Re-crawl and update the canonical map**

Run: `EXPLORER_MAX_PAGES=80 pnpm explore --session both --update` (same bounds as the committed map / CI job, so the refresh is like-for-like; ~13 min observed).
Expected: `Wrote canonical map to coverage/functional-map.json`.

- [ ] **Step 2: Review before committing**

Check with `node -e`: `schemaVersion === '1.1'`; flows count equals pages count; multi-step flows exist (e.g. some `flows[*].steps.length >= 3`); names look like `"/ -> /es/h-woman.html -> ..."`; no cross-session ids inside any flow's steps. `git diff --stat coverage/functional-map.json` should show a large but plausible change.

- [ ] **Step 3: Update roadmap/backlog docs** — mark M4 ✅ in the milestone table, update the Phase 3 row status, and mark backlog B8 done with a pointer to the design spec.

- [ ] **Step 4: Commit**

```bash
git add coverage/functional-map.json docs/roadmap/2026-07-02-platform-roadmap.md docs/roadmap/2026-07-02-backlog.md
git commit -m "feat(explorer): refresh canonical map with schema-1.1 multi-step flows (M4)"
```

---

## Self-review notes

- Spec coverage: chain reconstruction → Task 1 Step 4; schema 1.1 → Step 3; name/type/priority semantics → Step 4; edge cases (seed, missing parent, cross-session, hop cap) → Step 1 tests + Step 4 loop; live rollout → Task 2. Coverage annotations correctly absent (non-goal).
- Type consistency: `ChainNode` defined and used only in `builder.ts`; `buildMap` signature unchanged; test helper `page()` produces valid `PageExtraction`.
- The duplicated `routePattern`/`makeId` computation in the second loop is deterministic (same inputs), so no drift risk between `pages[]` and `flows[]`.
