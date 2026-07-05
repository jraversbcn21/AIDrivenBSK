# M8 — Interaction-Aware Crawl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The crawler opens overlays/dialogs (nav menus, PDP "Tallas") during the crawl and the map records each trigger → outcome → revealed elements (schema 1.5), so the Builder can later (M9) generate interaction specs.

**Architecture:** New `explorer/crawl/interact.ts` module (candidate selection with equivalence-class dedupe, snapshot-diff outcome detection, act→verify→retry protocol behind an injectable `InteractionDriver`), wired into `crawlSession` after passive extraction. Schema 1.4 → 1.5 adds top-level `interactions[]` plus `revealedBy` on elements; `builder/select.ts` gains a guard excluding revealed elements from loaded-signals.

**Tech Stack:** TypeScript strict, Playwright (aria snapshots), Vitest (offline unit tests with fake drivers/clocks — `settle.unit.test.ts` pattern).

**Spec:** `docs/superpowers/specs/2026-07-05-m8-interaction-aware-crawl-design.md` (approved 2026-07-05).

## Global Constraints

- `@typescript-eslint/no-explicit-any` is an **error** — no `any`, ever.
- `import/no-cycle` is an **error**, `maxDepth: Infinity`. `explorer/crawl/interact.ts` may import from `extract/` and `../url`, never the reverse.
- Package manager: **pnpm**. Unit tests: `pnpm test:unit` (Vitest). Also `pnpm typecheck`, `pnpm lint`.
- Conventional Commits: `feat(explorer): ...`, `feat(builder): ...`, `docs: ...`.
- TDD: every task writes the failing test first.
- The analyzer/schema layers stay browser-free; only `crawler.ts`/`cli.ts` (and the new real driver) touch Playwright.
- Work on a feature branch `feat/m8-interaction-aware-crawl` (create via using-git-worktrees at execution time if isolating).
- Live DES steps (Task 9) require VPN + `.env`; never against prod (`EXPLORER_ALLOW_PROD` untouched).

---

### Task 1: Interaction config (`EXPLORER_INTERACTIONS`, `EXPLORER_MAX_INTERACTIONS_PER_PAGE`)

**Files:**
- Modify: `explorer/config.ts`
- Modify: `explorer/config.unit.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `ExplorerConfig.interactions: InteractionsConfig` where `interface InteractionsConfig { enabled: boolean; maxPerPage: number }`. Defaults: `{ enabled: true, maxPerPage: 3 }`. Env: `EXPLORER_INTERACTIONS` accepts only `'on' | 'off'` (fail-fast otherwise); `EXPLORER_MAX_INTERACTIONS_PER_PAGE` positive number (reuses `envPositiveNumber`).

- [ ] **Step 1: Write the failing tests** — append to `explorer/config.unit.test.ts` (follow the file's existing env-stub pattern):

```ts
describe('interactions config', () => {
  it('defaults to enabled with maxPerPage 3', () => {
    const cfg = loadExplorerConfig();
    expect(cfg.interactions).toEqual({ enabled: true, maxPerPage: 3 });
  });

  it('EXPLORER_INTERACTIONS=off disables', () => {
    process.env.EXPLORER_INTERACTIONS = 'off';
    expect(loadExplorerConfig().interactions.enabled).toBe(false);
  });

  it('rejects invalid EXPLORER_INTERACTIONS', () => {
    process.env.EXPLORER_INTERACTIONS = 'yes';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_INTERACTIONS/);
  });

  it('EXPLORER_MAX_INTERACTIONS_PER_PAGE overrides the budget', () => {
    process.env.EXPLORER_MAX_INTERACTIONS_PER_PAGE = '5';
    expect(loadExplorerConfig().interactions.maxPerPage).toBe(5);
  });
});
```

(Mirror the file's existing `beforeEach`/`afterEach` env cleanup for the two new vars.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:unit -- explorer/config.unit.test.ts`
Expected: FAIL — `interactions` undefined on config.

- [ ] **Step 3: Implement** in `explorer/config.ts`:

```ts
export interface InteractionsConfig {
  enabled: boolean;
  maxPerPage: number;
}
```

Add `interactions: InteractionsConfig;` to `ExplorerConfig`; add to `DEFAULTS`:

```ts
  interactions: { enabled: true, maxPerPage: 3 },
```

Env parsing (next to `envExtraction`):

```ts
function envInteractions(): boolean | undefined {
  const v = process.env.EXPLORER_INTERACTIONS;
  if (v === undefined) return undefined;
  if (v !== 'on' && v !== 'off') throw new Error('EXPLORER_INTERACTIONS must be on | off');
  return v === 'on';
}
```

In `loadExplorerConfig`, build `base.interactions`:

```ts
    interactions: {
      enabled: envInteractions() ?? DEFAULTS.interactions.enabled,
      maxPerPage: envPositiveNumber('EXPLORER_MAX_INTERACTIONS_PER_PAGE', DEFAULTS.interactions.maxPerPage),
    },
```

and merge overrides like `bounds`/`llm`: `interactions: { ...base.interactions, ...overrides.interactions }`.

- [ ] **Step 4: Run tests** — `pnpm test:unit -- explorer/config.unit.test.ts` → PASS. Also `pnpm typecheck`.

- [ ] **Step 5: Document** — append to `.env.example` under the Explorer block:

```
# Interaction discovery (M8): open non-destructive overlays/dialogs during the crawl (aria mode only).
# EXPLORER_INTERACTIONS=on|off (default on) ; EXPLORER_MAX_INTERACTIONS_PER_PAGE (default 3)
```

- [ ] **Step 6: Commit**

```bash
git add explorer/config.ts explorer/config.unit.test.ts .env.example
git commit -m "feat(explorer): interaction-discovery config (M8)"
```

---

### Task 2: Types + schema 1.5 + buildMap emission

**Files:**
- Modify: `explorer/types.ts`
- Modify: `explorer/map/schema.ts`
- Modify: `explorer/map/builder.ts`
- Test: `explorer/map/builder.unit.test.ts`

**Interfaces:**
- Produces (in `explorer/types.ts`):

```ts
export type InteractionOutcome = 'overlay' | 'navigated' | 'none';

export interface ExtractedInteraction {
  trigger: { role: string; label: string; type: ElementType };
  outcome: InteractionOutcome;
  revealedElements: ExtractedElement[]; // empty unless outcome === 'overlay'
  revealedLinks: string[];              // empty unless outcome === 'overlay'
  navigatedTo?: string;                 // normalized path; only when outcome === 'navigated'
}
```

  and `PageExtraction` gains `interactions?: ExtractedInteraction[]` (optional — analyzers never set it; the crawler attaches it).
- Produces (in `explorer/map/schema.ts`): `SCHEMA_VERSION = '1.5'`; `MapElement` gains `revealedBy?: string`; new:

```ts
export interface MapInteraction {
  id: string;
  pageId: string;
  triggerElementId: string;
  outcome: 'overlay' | 'navigated' | 'none';
  revealedElementIds: string[];
  navigatedTo?: string;
}
```

  and `FunctionalMap` gains `interactions: MapInteraction[]`.
- ID rules (consumed by Task 9's live checks): interaction id = `makeId('inter', pageId, triggerElementId)`; trigger element id recomputed exactly as the elements pass does: `makeId('elem', pageId, role, label, type)`; revealed element id = `makeId('elem', interactionId, role, label, type)` (interactionId in the parts prevents collision with a passively-extracted twin).

- [ ] **Step 1: Write the failing test** — append to `explorer/map/builder.unit.test.ts` (reuse the file's existing extraction-fixture helper):

```ts
it('emits interactions and revealed elements with revealedBy back-references', () => {
  const ex = fixtureExtraction({ path: '/es/prod-c0p1.html', session: 'auth' }); // adapt to the file's helper
  ex.elements.push({
    type: 'button', label: 'Añadir a cesta', role: 'button',
    selectorHints: { role: { type: 'button', name: 'Añadir a cesta' } }, destructive: false,
  });
  ex.interactions = [{
    trigger: { role: 'button', label: 'Añadir a cesta', type: 'button' },
    outcome: 'overlay',
    revealedElements: [{
      type: 'button', label: 'Talla S', role: 'button',
      selectorHints: { role: { type: 'button', name: 'Talla S' } }, destructive: false,
    }],
    revealedLinks: [],
  }];

  const map = buildMap({ classified: [{ extraction: ex, classification: { pageType: 'PDP', confidence: 1 } }], environment: 'des' });

  expect(map.schemaVersion).toBe('1.5');
  expect(map.interactions).toHaveLength(1);
  const inter = map.interactions[0];
  const page = map.pages[0];
  const trigger = map.elements.find((e) => e.label === 'Añadir a cesta');
  expect(inter.pageId).toBe(page.id);
  expect(inter.triggerElementId).toBe(trigger?.id);
  expect(inter.outcome).toBe('overlay');
  const revealed = map.elements.find((e) => e.label === 'Talla S');
  expect(revealed?.revealedBy).toBe(inter.id);
  expect(inter.revealedElementIds).toEqual([revealed?.id]);
});

it('interactions[] is always present (empty when no extraction has any)', () => {
  const map = buildMap({ classified: [], environment: 'des' });
  expect(map.interactions).toEqual([]);
});
```

(Match the classification object shape to what the file already uses.)

- [ ] **Step 2: Run to verify failure** — `pnpm test:unit -- explorer/map/builder.unit.test.ts` → FAIL (`interactions` missing).

- [ ] **Step 3: Implement.** `types.ts` and `schema.ts` per the Interfaces block above. In `builder.ts`, inside the first per-page loop (after the `ex.elements.forEach` block), add:

```ts
    (ex.interactions ?? []).forEach((it) => {
      const triggerElementId = makeId('elem', pageId, it.trigger.role, it.trigger.label, it.trigger.type);
      const interactionId = makeId('inter', pageId, triggerElementId);
      const revealedElementIds: string[] = [];
      it.revealedElements.forEach((el) => {
        const mapEl: MapElement = {
          id: makeId('elem', interactionId, el.role, el.label, el.type),
          pageId, type: el.type, label: el.label, role: el.role,
          selectorHints: el.selectorHints, destructive: el.destructive,
          revealedBy: interactionId,
        };
        if (el.component !== undefined) mapEl.component = el.component;
        elements.push(mapEl);
        revealedElementIds.push(mapEl.id);
      });
      const interaction: MapInteraction = {
        id: interactionId, pageId, triggerElementId, outcome: it.outcome, revealedElementIds,
      };
      if (it.navigatedTo !== undefined) interaction.navigatedTo = it.navigatedTo;
      interactions.push(interaction);
    });
```

Declare `const interactions: MapInteraction[] = [];` beside the other accumulators, import the type, and add `interactions` to the returned map. Bump nothing else — the differ ignores the new section by design (spec §6).

- [ ] **Step 4: Run tests** — `pnpm test:unit` (full — schema bump may touch other fixtures' expectations on `schemaVersion`; update any that assert `'1.4'`). Then `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add explorer/types.ts explorer/map/schema.ts explorer/map/builder.ts explorer/map/builder.unit.test.ts
git commit -m "feat(explorer): schema 1.5 — interactions[] and revealedBy on elements (M8)"
```

---

### Task 3: Candidate selection + equivalence-class ledger

**Files:**
- Create: `explorer/crawl/interact.ts`
- Test: `explorer/crawl/interact.unit.test.ts`

**Interfaces:**
- Consumes: `ExtractedElement` (`explorer/types.ts`), `routePattern` (`explorer/url.ts`).
- Produces:

```ts
export class InteractionLedger {
  /** Claims the candidate's equivalence class; false if already claimed this crawl.
   *  Chrome triggers (component Header/Footer/MiniCart): key `chrome|role|label` (global).
   *  Page-specific triggers: key `${routePattern(path)}|role|label`. */
  tryClaim(el: ExtractedElement, path: string): boolean;
}

export function selectCandidates(
  elements: ExtractedElement[], path: string, ledger: InteractionLedger, maxPerPage: number,
): ExtractedElement[];
```

  Selection filter: `type` in `{'button','filter','sort'}`, `destructive === false`, `selectorHints.role` present with non-empty `name`; then ledger claim; stop at `maxPerPage`.

- [ ] **Step 1: Write the failing tests** — `explorer/crawl/interact.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { InteractionLedger, selectCandidates } from './interact';
import type { ExtractedElement } from '../types';

const btn = (label: string, over: Partial<ExtractedElement> = {}): ExtractedElement => ({
  type: 'button', label, role: 'button',
  selectorHints: { role: { type: 'button', name: label } }, destructive: false, ...over,
});

describe('selectCandidates', () => {
  it('filters to non-destructive role-hinted buttons within budget', () => {
    const ledger = new InteractionLedger();
    const els = [
      btn('Añadir a cesta'),
      btn('Comprar', { destructive: true }),
      btn('', { selectorHints: {} }),
      { ...btn('Ir a la cesta'), type: 'link' } as ExtractedElement,
      btn('Filtrar', { type: 'filter' }),
      btn('Ordenar', { type: 'sort' }),
      btn('Cuarto botón'),
    ];
    const picked = selectCandidates(els, '/es/prod-c0p1.html', ledger, 3);
    expect(picked.map((e) => e.label)).toEqual(['Añadir a cesta', 'Filtrar', 'Ordenar']);
  });

  it('dedupes page-specific triggers by routePattern across pages', () => {
    const ledger = new InteractionLedger();
    // Both normalize to the same routePattern ('/es/a-c0p{id}.html') — same equivalence class.
    expect(selectCandidates([btn('Añadir a cesta')], '/es/a-c0p1.html', ledger, 3)).toHaveLength(1);
    expect(selectCandidates([btn('Añadir a cesta')], '/es/a-c0p2.html', ledger, 3)).toHaveLength(0);
    // Different routePattern entirely — not deduped against the c0p class.
    expect(selectCandidates([btn('Añadir a cesta')], '/es/mujer/ropa.html', ledger, 3)).toHaveLength(1);
  });

  it('dedupes chrome triggers globally regardless of route', () => {
    const ledger = new InteractionLedger();
    const menu = btn('Menú', { component: 'Header' });
    expect(selectCandidates([menu], '/es/a-c0p1.html', ledger, 3)).toHaveLength(1);
    expect(selectCandidates([menu], '/es/mujer/ropa.html', ledger, 3)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test:unit -- explorer/crawl/interact.unit.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** in `explorer/crawl/interact.ts`:

```ts
import type { ExtractedElement } from '../types';
import { routePattern } from '../url';

const CLICKABLE_TYPES = new Set(['button', 'filter', 'sort']);
const CHROME = new Set(['Header', 'Footer', 'MiniCart']);

export class InteractionLedger {
  private readonly claimed = new Set<string>();

  tryClaim(el: ExtractedElement, path: string): boolean {
    const scope = el.component !== undefined && CHROME.has(el.component) ? 'chrome' : routePattern(path);
    const key = `${scope}|${el.role}|${el.label}`;
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
}

export function selectCandidates(
  elements: ExtractedElement[], path: string, ledger: InteractionLedger, maxPerPage: number,
): ExtractedElement[] {
  const picked: ExtractedElement[] = [];
  for (const el of elements) {
    if (picked.length >= maxPerPage) break;
    if (!CLICKABLE_TYPES.has(el.type) || el.destructive) continue;
    const name = el.selectorHints.role?.name;
    if (name === undefined || name === '') continue;
    if (!ledger.tryClaim(el, path)) continue;
    picked.push(el);
  }
  return picked;
}
```

- [ ] **Step 4: Run tests** — `pnpm test:unit -- explorer/crawl/interact.unit.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add explorer/crawl/interact.ts explorer/crawl/interact.unit.test.ts
git commit -m "feat(explorer): interaction candidate selection with equivalence-class dedupe (M8)"
```

---

### Task 4: Overlay detection (aria snapshot diff)

**Files:**
- Modify: `explorer/crawl/interact.ts`
- Test: `explorer/crawl/interact.unit.test.ts`

**Interfaces:**
- Consumes: `AriaNode`, `parseAriaSnapshot` (`explorer/extract/aria.ts`).
- Produces:

```ts
/** Overlay nodes (role dialog|menu, keyed role+name) present in `after` but not `before`.
 *  DES overlays are dialogs (Tallas, filter drawer, mobile-nav — findings §5/§7); menu
 *  covers plain dropdowns. Deliberately NOT a generic tree diff (spec §3). */
export function newOverlayNodes(before: AriaNode[], after: AriaNode[]): AriaNode[];
```

- [ ] **Step 1: Write the failing tests** — append to `explorer/crawl/interact.unit.test.ts`:

```ts
import { parseAriaSnapshot } from '../extract/aria';
import { newOverlayNodes } from './interact';

const BEFORE = `- banner:\n  - button "Menú"\n- main:\n  - button "Añadir a cesta"`;
const AFTER_DIALOG = `${BEFORE}\n- dialog "Tallas":\n  - button "Talla S"\n  - button "Talla M"`;

describe('newOverlayNodes', () => {
  it('finds a dialog present only after the click', () => {
    const found = newOverlayNodes(parseAriaSnapshot(BEFORE), parseAriaSnapshot(AFTER_DIALOG));
    expect(found).toHaveLength(1);
    expect(found[0].role).toBe('dialog');
    expect(found[0].name).toBe('Tallas');
  });

  it('ignores dialogs already present before', () => {
    expect(newOverlayNodes(parseAriaSnapshot(AFTER_DIALOG), parseAriaSnapshot(AFTER_DIALOG))).toHaveLength(0);
  });

  it('returns empty when nothing overlay-like appeared', () => {
    const after = `${BEFORE}\n- text: nuevo banner promocional`;
    expect(newOverlayNodes(parseAriaSnapshot(BEFORE), parseAriaSnapshot(after))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test:unit -- explorer/crawl/interact.unit.test.ts` → FAIL.

- [ ] **Step 3: Implement** (append to `interact.ts`):

```ts
import type { AriaNode } from '../extract/aria';

const OVERLAY_ROLES = new Set(['dialog', 'menu']);
const overlaySig = (n: AriaNode): string => `${n.role}|${n.name ?? ''}`;

export function newOverlayNodes(before: AriaNode[], after: AriaNode[]): AriaNode[] {
  const seen = new Set<string>();
  const collectBefore = (n: AriaNode): void => {
    if (OVERLAY_ROLES.has(n.role)) seen.add(overlaySig(n));
    n.children.forEach(collectBefore);
  };
  before.forEach(collectBefore);

  const found: AriaNode[] = [];
  const collectAfter = (n: AriaNode): void => {
    if (OVERLAY_ROLES.has(n.role) && !seen.has(overlaySig(n))) {
      found.push(n);
      return; // the whole subtree belongs to this overlay
    }
    n.children.forEach(collectAfter);
  };
  after.forEach(collectAfter);
  return found;
}
```

- [ ] **Step 4: Run tests** — PASS. **Step 5: Commit**

```bash
git add explorer/crawl/interact.ts explorer/crawl/interact.unit.test.ts
git commit -m "feat(explorer): overlay detection via aria snapshot diff (M8)"
```

---

### Task 5: `discoverInteractions` protocol (act→verify→retry, injectable driver)

**Files:**
- Modify: `explorer/crawl/interact.ts`
- Test: `explorer/crawl/interact.unit.test.ts`

**Interfaces:**
- Consumes: `waitForSettle`, `SettleOptions` (`./settle`), `analyzeAriaNodes` (`../extract/analyzeAria`), `parseAriaSnapshot`, plus Task 3/4 exports.
- Produces:

```ts
export interface InteractionDriver {
  snapshot(): Promise<string>;                       // body ariaSnapshot
  click(role: string, name: string): Promise<void>;
  pressEscape(): Promise<void>;
  currentPath(): string;                             // normalized
  /** Recover the original page: goto(originalPath) + consent + settle. */
  recover(): Promise<void>;
  wait(ms: number): Promise<void>;
}

export const INTERACT_SETTLE: SettleOptions = { minWaitMs: 1000, pollIntervalMs: 500, maxWaitMs: 5000 };
export const MAX_CLICK_ATTEMPTS = 3;
export const MAX_CLOSE_ATTEMPTS = 3;

export async function discoverInteractions(
  driver: InteractionDriver,
  candidates: ExtractedElement[],
  meta: PageMeta,                                    // the page's own meta, reused for analyzeAriaNodes
): Promise<ExtractedInteraction[]>;
```

- Behavior contract (each bullet is a test below):
  1. **overlay**: click → settle → diff finds new dialog → `analyzeAriaNodes(overlayNodes, meta)` supplies `revealedElements`/`revealedLinks` → Escape until the overlay is gone (≤ `MAX_CLOSE_ATTEMPTS`), else `recover()`.
  2. **navigated**: `currentPath()` changed after click → record `navigatedTo`, call `recover()`; if the path is still wrong after recovery, stop processing remaining candidates (return what we have).
  3. **none**: after `MAX_CLICK_ATTEMPTS` clicks with no path change and no overlay → outcome `none` (a lost hydration click and a genuine no-op are indistinguishable — bounded attempts, per CLAUDE.md's act→verify→retry rule).
  4. A driver exception on one candidate skips it (try/catch + `console.warn`) and continues with the next.

- [ ] **Step 1: Write the failing tests** — append to `interact.unit.test.ts` a scripted fake driver:

```ts
import { discoverInteractions, type InteractionDriver } from './interact';
import type { PageMeta } from '../types';

const META: PageMeta = { path: '/es/p-c0p1.html', url: 'https://x/es/p-c0p1.html', title: 'P', session: 'auth', discoveredVia: 'seed' };
const BASE = `- main:\n  - button "Añadir a cesta"`;
const WITH_DIALOG = `${BASE}\n- dialog "Tallas":\n  - button "Talla S"\n  - link "Guía de tallas":\n    - /url: /es/guia.html`;

/** Driver whose snapshot() pops from a script; other calls are recorded. */
function fakeDriver(script: string[], opts: { path?: () => string } = {}): InteractionDriver & { calls: string[] } {
  const calls: string[] = [];
  let last = script[0];
  return {
    calls,
    snapshot: async () => { calls.push('snapshot'); if (script.length > 0) last = script.shift() as string; return last; },
    click: async (_r, n) => { calls.push(`click:${n}`); },
    pressEscape: async () => { calls.push('escape'); },
    currentPath: () => (opts.path ? opts.path() : META.path),
    recover: async () => { calls.push('recover'); },
    wait: async () => {},
  };
}

describe('discoverInteractions', () => {
  it('detects an overlay, extracts revealed elements/links, closes with Escape', async () => {
    // before, settle(first read + stable read), after-click diff read, post-escape read
    const d = fakeDriver([BASE, WITH_DIALOG, WITH_DIALOG, WITH_DIALOG, BASE]);
    const [it1] = await discoverInteractions(d, [btn('Añadir a cesta')], META);
    expect(it1.outcome).toBe('overlay');
    expect(it1.revealedElements.map((e) => e.label)).toContain('Talla S');
    expect(it1.revealedLinks).toContain('/es/guia.html');
    expect(d.calls).toContain('escape');
    expect(d.calls).not.toContain('recover');
  });

  it('records navigated and recovers', async () => {
    let path = META.path;
    const d = fakeDriver([BASE, BASE, BASE], { path: () => path });
    d.click = async () => { path = '/es/otra.html'; };
    d.recover = async () => { path = META.path; d.calls.push('recover'); };
    const [it1] = await discoverInteractions(d, [btn('Añadir a cesta')], META);
    expect(it1.outcome).toBe('navigated');
    expect(it1.navigatedTo).toBe('/es/otra.html');
    expect(d.calls).toContain('recover');
  });

  it('aborts remaining candidates when recovery fails', async () => {
    let path = META.path;
    const d = fakeDriver([BASE, BASE, BASE], { path: () => path });
    d.click = async () => { path = '/es/otra.html'; };
    d.recover = async () => { d.calls.push('recover'); }; // path stays wrong
    const out = await discoverInteractions(d, [btn('Uno'), btn('Dos')], META);
    expect(out).toHaveLength(1);
    expect(d.calls.filter((c) => c.startsWith('click:'))).toEqual(['click:Uno']);
  });

  it('returns none after bounded click attempts with no change', async () => {
    const d = fakeDriver([BASE]); // snapshot never changes
    const [it1] = await discoverInteractions(d, [btn('Inerte')], META);
    expect(it1.outcome).toBe('none');
    expect(d.calls.filter((c) => c === 'click:Inerte').length).toBeLessThanOrEqual(3);
  });

  it('falls back to recover() when Escape never closes the overlay', async () => {
    const always = [BASE, ...Array(20).fill(WITH_DIALOG)] as string[];
    const d = fakeDriver(always);
    const [it1] = await discoverInteractions(d, [btn('Añadir a cesta')], META);
    expect(it1.outcome).toBe('overlay');
    expect(d.calls).toContain('recover');
  });

  it('skips a candidate whose driver call throws and continues', async () => {
    const d = fakeDriver([BASE, BASE, WITH_DIALOG, WITH_DIALOG, BASE]);
    const boom = btn('Roto');
    const orig = d.click.bind(d);
    d.click = async (r, n) => { if (n === 'Roto') throw new Error('boom'); return orig(r, n); };
    const out = await discoverInteractions(d, [boom, btn('Añadir a cesta')], META);
    expect(out).toHaveLength(1);
    expect(out[0].outcome).toBe('overlay');
  });
});
```

(Adjust the scripted snapshot counts while implementing if the settle-loop read count differs — the *behavioral* assertions are the contract; scripts may need one more/fewer entry.)

- [ ] **Step 2: Run to verify failure** — `pnpm test:unit -- explorer/crawl/interact.unit.test.ts` → FAIL.

- [ ] **Step 3: Implement** (append to `interact.ts`):

```ts
import type { ExtractedInteraction, PageMeta } from '../types';
import { waitForSettle, type SettleOptions } from './settle';
import { parseAriaSnapshot } from '../extract/aria';
import { analyzeAriaNodes } from '../extract/analyzeAria';

export interface InteractionDriver {
  snapshot(): Promise<string>;
  click(role: string, name: string): Promise<void>;
  pressEscape(): Promise<void>;
  currentPath(): string;
  recover(): Promise<void>;
  wait(ms: number): Promise<void>;
}

export const INTERACT_SETTLE: SettleOptions = { minWaitMs: 1000, pollIntervalMs: 500, maxWaitMs: 5000 };
export const MAX_CLICK_ATTEMPTS = 3;
export const MAX_CLOSE_ATTEMPTS = 3;

export async function discoverInteractions(
  driver: InteractionDriver,
  candidates: ExtractedElement[],
  meta: PageMeta,
): Promise<ExtractedInteraction[]> {
  const results: ExtractedInteraction[] = [];
  for (const el of candidates) {
    const role = el.selectorHints.role;
    if (role === undefined) continue;
    try {
      const before = await driver.snapshot();
      let outcome: ExtractedInteraction | null = null;
      for (let attempt = 0; attempt < MAX_CLICK_ATTEMPTS && outcome === null; attempt++) {
        await driver.click(role.type, role.name);
        await waitForSettle(() => driver.snapshot(), (ms) => driver.wait(ms), INTERACT_SETTLE);

        if (driver.currentPath() !== meta.path) {
          const navigatedTo = driver.currentPath();
          await driver.recover();
          outcome = {
            trigger: { role: el.role, label: el.label, type: el.type },
            outcome: 'navigated', revealedElements: [], revealedLinks: [], navigatedTo,
          };
          results.push(outcome);
          if (driver.currentPath() !== meta.path) return results; // recovery failed — abort page
          break;
        }

        const after = await driver.snapshot();
        const overlays = newOverlayNodes(parseAriaSnapshot(before), parseAriaSnapshot(after));
        if (overlays.length > 0) {
          const revealed = analyzeAriaNodes(overlays, meta);
          outcome = {
            trigger: { role: el.role, label: el.label, type: el.type },
            outcome: 'overlay', revealedElements: revealed.elements, revealedLinks: revealed.links,
          };
          results.push(outcome);
          // Close: Escape until the overlay is gone, else recover the page wholesale.
          let closed = false;
          for (let c = 0; c < MAX_CLOSE_ATTEMPTS && !closed; c++) {
            await driver.pressEscape();
            const now = await driver.snapshot();
            closed = newOverlayNodes(parseAriaSnapshot(before), parseAriaSnapshot(now)).length === 0;
          }
          if (!closed) await driver.recover();
        }
      }
      if (outcome === null) {
        results.push({
          trigger: { role: el.role, label: el.label, type: el.type },
          outcome: 'none', revealedElements: [], revealedLinks: [],
        });
      }
    } catch (err) {
      console.warn(`interaction skipped on ${meta.path} ("${el.label}"): ${String(err)}`);
    }
  }
  return results;
}
```

If `outcome === 'navigated'` was pushed via `break`, ensure no duplicate `none` push — the `outcome === null` guard covers it.

- [ ] **Step 4: Run tests** — `pnpm test:unit -- explorer/crawl/interact.unit.test.ts` → PASS (tune fake scripts to the real read count if needed). Then full `pnpm test:unit && pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add explorer/crawl/interact.ts explorer/crawl/interact.unit.test.ts
git commit -m "feat(explorer): discoverInteractions protocol — overlay/navigated/none with recovery (M8)"
```

---

### Task 6: Wire into `crawlSession` + CLI (real Playwright driver)

**Files:**
- Modify: `explorer/crawl/crawler.ts`
- Modify: `explorer/cli.ts`

**Interfaces:**
- Consumes: everything Task 3–5 exports; `InteractionsConfig` (Task 1); `acceptConsent` (already imported in crawler.ts); `normalizePath` (already imported).
- Produces: `CrawlDeps` gains `interactions: InteractionsConfig`. No other public change — revealed links ride the existing frontier loop because `discoverInteractions` output is attached as `extraction.interactions` **before** links are enqueued.

- [ ] **Step 1: Implement the real driver + wiring** in `crawler.ts`. Add imports:

```ts
import { InteractionLedger, selectCandidates, discoverInteractions, INTERACT_SETTLE, type InteractionDriver } from './interact';
import type { InteractionsConfig } from '../config';
import type { Page } from '@playwright/test';
```

Add `interactions: InteractionsConfig;` to `CrawlDeps`. Inside `crawlSession`, create `const ledger = new InteractionLedger();` next to the frontier. Add a driver factory at module level:

```ts
function playwrightDriver(page: Page, originalPath: string, baseURL: string): InteractionDriver {
  return {
    snapshot: () => page.locator('body').ariaSnapshot(),
    // force: true per the DES hover-reveal precedent (SearchBar, findings §5); the
    // act→verify→retry loop in discoverInteractions is the real reliability layer.
    click: (role, name) => page.getByRole(role as Parameters<Page['getByRole']>[0], { name, exact: true }).first().click({ force: true }),
    pressEscape: () => page.keyboard.press('Escape'),
    currentPath: () => normalizePath(page.url(), baseURL),
    recover: async () => {
      await page.goto(originalPath, { waitUntil: 'domcontentloaded' });
      await acceptConsent(page);
      await waitForSettle(() => page.locator('body').ariaSnapshot(), (ms) => page.waitForTimeout(ms), INTERACT_SETTLE);
    },
    wait: (ms) => page.waitForTimeout(ms),
  };
}
```

Then, in the crawl loop, right after `extractions.push(extraction);` and **before** the links loop:

```ts
      if (deps.extraction === 'aria' && deps.interactions.enabled) {
        const candidates = selectCandidates(
          extraction.elements, extraction.meta.path, ledger, deps.interactions.maxPerPage,
        );
        if (candidates.length > 0) {
          const driver = playwrightDriver(page, extraction.meta.path, deps.baseURL);
          extraction.interactions = await discoverInteractions(driver, candidates, extraction.meta);
          for (const it of extraction.interactions) {
            extraction.links.push(...it.revealedLinks);
          }
        }
      }
```

(Revealed links flow into the existing `for (const href of extraction.links)` enqueue loop below — no second loop.)

- [ ] **Step 2: Wire the CLI** — in `explorer/cli.ts`, extend the `crawlSession` deps object:

```ts
        { context, baseURL: env.baseURL, rules: DEFAULT_ROUTE_RULES, bounds: cfg.bounds, extraction: cfg.extraction, interactions: cfg.interactions },
```

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm lint && pnpm test:unit` → all green (no new unit test here: the driver is a thin adapter; all protocol logic was tested in Task 5 — same rationale as the untested `crawlSession` loop itself, which is browser-bound by design).

- [ ] **Step 4: Commit**

```bash
git add explorer/crawl/crawler.ts explorer/cli.ts
git commit -m "feat(explorer): wire interaction discovery into the crawl loop (M8)"
```

---

### Task 7: Builder guard — revealed elements are not loaded-signals

**Files:**
- Modify: `builder/select.ts`
- Test: `builder/select.unit.test.ts`

**Interfaces:**
- Consumes: `MapElement.revealedBy?: string` (Task 2).
- Produces: no signature change; `loadedSignalFor` never returns a strategy built from an element with `revealedBy` set.

- [ ] **Step 1: Write the failing test** — append to `builder/select.unit.test.ts` (reuse the file's existing map-fixture helpers):

```ts
it('excludes revealed elements from loaded-signal selection (M8 guard)', () => {
  // Map fixture: leaf page whose only strong-hinted elements are (a) a revealed size button
  // and (b) a page-specific role-hinted button. The revealed one comes FIRST in element order.
  // Expected: loadedSignal is the page-specific visible one, never the revealed one.
  const map = mapFixture(/* leaf page */);
  map.elements.unshift({
    id: 'elem_revealed', pageId: leafPageId, type: 'button', label: 'Talla S', role: 'button',
    selectorHints: { role: { type: 'button', name: 'Talla S' } }, destructive: false,
    revealedBy: 'inter_x',
  });
  const { journeys } = selectJourneys(reportFixture(), map, 1);
  expect(journeys[0].loadedSignal).not.toEqual({ role: { type: 'button', name: 'Talla S' } });
});
```

(Adapt fixture helper names to the file's existing ones — it already builds maps/reports for the B14 pass-major tests.)

- [ ] **Step 2: Run to verify failure** — `pnpm test:unit -- builder/select.unit.test.ts` → FAIL (revealed element wins by element order).

- [ ] **Step 3: Implement** — in `builder/select.ts`, `loadedSignalFor`, extend the candidates filter:

```ts
  // Revealed elements (M8) only exist after an interaction — asserting one in isLoaded()
  // would always time out on a freshly-loaded page (the exact failure mode B14/M7 closed).
  const candidates = map.elements.filter((e) => e.pageId === leaf.id && !e.destructive && e.revealedBy === undefined);
```

- [ ] **Step 4: Run tests** — `pnpm test:unit -- builder/select.unit.test.ts` → PASS. Full `pnpm test:unit && pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add builder/select.ts builder/select.unit.test.ts
git commit -m "feat(builder): exclude interaction-revealed elements from loaded-signals (M8 guard)"
```

---

### Task 8: Offline verification sweep

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test:unit` — all green, zero warnings.
- [ ] **Step 2:** Offline Builder smoke against the **committed 1.4 map** (backward tolerance): `pnpm build-tests --top 3` → generates without errors (`revealedBy` absent everywhere → guard is a no-op).
- [ ] **Step 3:** `git log --oneline master..HEAD` — verify the task commits are all present and conventional.

---

### Task 9: Live validation against DES (VPN required) + closure

Follow the `live-validate-des` skill's prerequisites (VPN up, `.env` present, auth state fresh via `pnpm exec playwright test --project=setup`).

- [ ] **Step 1: Bounded probe crawl** — `EXPLORER_MAX_PAGES=15 pnpm explore` (no `--update`). Inspect `reports/explorer/<stamp>.json`: `interactions[]` present; spot-check one `overlay` outcome and its `revealedElementIds` resolve into `elements[]` with `revealedBy`.
- [ ] **Step 2: Success-criteria checks (spec §8)** on a fuller crawl (`EXPLORER_MAX_PAGES=80`, `EXPLORER_TIME_BUDGET_MS=1200000`):
  - a PDP interaction with trigger "Añadir a cesta", outcome `overlay`, revealed "Talla …" buttons;
  - a header nav interaction whose `revealedLinks` enqueued at least one new page (compare page count vs a `EXPLORER_INTERACTIONS=off` control run if unclear);
  - wall-clock delta vs the `off` control run ≈ minutes, not a multiplier (spec estimate: ~10–30 interactions total).
- [ ] **Step 3: Regenerate the canonical map** — `pnpm explore --update` (same bounds). Commit `coverage/functional-map.json` (schema 1.5).
- [ ] **Step 4: No-regression** — `pnpm test` (expect 4/4, `retries: 1` tolerance per findings §7); `pnpm plan --update`; `pnpm build-tests --top 3` + `pnpm test:generated` (guard proven live).
- [ ] **Step 5: Documentation closure** — findings doc gains §15 (what was validated, numbers, any surprises); update CLAUDE.md "Current state" line (wholesale replace), roadmap "Where a fresh session resumes" + milestone table row M8, backlog B9 nav-menus row → done. Commit docs.
- [ ] **Step 6: Finish the branch** — run the superpowers:finishing-a-development-branch skill (merge to master / push per Jorge's call).

---

## Self-review (done at writing time)

- **Spec coverage:** §3 selection→Task 3; §3 protocol→Task 5; §3 config→Task 1; §4 schema→Task 2; §5 guard→Task 7; §6 exclusions→no differ/classifier/planner tasks (correct); §7 tests→Tasks 3–5, 7; §8 live→Task 9.
- **Placeholders:** none — every code step shows the code; live steps show exact commands.
- **Type consistency:** `InteractionsConfig` (Tasks 1→6), `ExtractedInteraction`/`MapInteraction`/`revealedBy` (Tasks 2→5→7), `InteractionDriver`/`INTERACT_SETTLE` (Tasks 5→6) — names match across tasks.
- **Known flexibility point:** Task 5's fake-driver snapshot scripts may need ±1 entry once the settle-loop's real read count is seen — flagged inline in the task.
