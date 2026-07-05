# M8b — Deterministic Must-Capture Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that any crawl visiting a page with an "Añadir a (la) cesta" button captures the Tallas-dialog interaction in the map, and land that capture in the committed canonical map (the M9 prerequisite).

**Architecture:** A configurable must-capture pattern list gives matching trigger labels priority in `selectCandidates` (two-pass selection) with global satisfaction bookkeeping in `InteractionLedger` (retry until one `overlay` outcome, then never again). The ledger becomes per-crawl-global (created in `cli.ts`, shared by both sessions) and dedupes ordinary candidates with a ledger-only `interactionScope` that collapses all category PLPs. No schema change — the map stays 1.5.

**Tech Stack:** TypeScript strict, Vitest (unit), Playwright (live crawl), pnpm.

**Design spec:** `docs/superpowers/specs/2026-07-05-m8b-deterministic-must-capture-design.md` — read it first.

## Global Constraints

- `@typescript-eslint/no-explicit-any` is an **error** — no `any`, ever.
- `import/no-cycle` is an **error** (`maxDepth: Infinity`).
- Package manager is **pnpm**. Unit tests: `pnpm test:unit`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.
- Commits follow Conventional Commits; scope here is `explorer` (`feat(explorer): ...`).
- No changes to `src/`, `tests/`, `planner/`, `builder/`, or the map schema (stays `1.5`).
- Live tasks (5–7) need VPN to DES and `.env` credentials; everything before them is offline.

---

### Task 1: Config — `interactions.mustCapture` + `EXPLORER_MUST_CAPTURE`

**Files:**
- Modify: `explorer/config.ts`
- Test: `explorer/config.unit.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `InteractionsConfig.mustCapture: RegExp[]` (later tasks read it); default `[/^añadir a (la )?cesta/i]` — the pattern MUST match both live label variants: `"Añadir a cesta"` (PDP main button, findings §5) and `"Añadir a la cesta {product}"` (card quick-add, findings §15).

- [ ] **Step 1: Write the failing tests**

In `explorer/config.unit.test.ts`, add `delete process.env.EXPLORER_MUST_CAPTURE;` to the existing `beforeEach` block, **replace** the existing test `'defaults interactions to enabled with maxPerPage 3'` (its `toEqual` breaks when the new field lands) with the first test below, and add the other three after the `EXPLORER_MAX_INTERACTIONS_PER_PAGE` test:

```ts
it('defaults interactions to enabled, maxPerPage 3, and the añadir-a-cesta must-capture', () => {
  const cfg = loadExplorerConfig();
  expect(cfg.interactions.enabled).toBe(true);
  expect(cfg.interactions.maxPerPage).toBe(3);
  expect(cfg.interactions.mustCapture).toHaveLength(1);
  // Both live label variants: PDP main button and card quick-add (design §3.1).
  expect(cfg.interactions.mustCapture[0].test('Añadir a cesta')).toBe(true);
  expect(cfg.interactions.mustCapture[0].test('Añadir a la cesta Short denim mini')).toBe(true);
  expect(cfg.interactions.mustCapture[0].test('Filtrar')).toBe(false);
});

it('EXPLORER_MUST_CAPTURE replaces the default list (semicolon-separated, case-insensitive)', () => {
  process.env.EXPLORER_MUST_CAPTURE = '^categorías y productos; ^mercado';
  const { mustCapture } = loadExplorerConfig().interactions;
  expect(mustCapture).toHaveLength(2);
  expect(mustCapture[0].test('Categorías y productos')).toBe(true);
  expect(mustCapture[1].test('Mercado')).toBe(true);
  expect(mustCapture.some((r) => r.test('Añadir a cesta'))).toBe(false);
});

it('EXPLORER_MUST_CAPTURE="" disables must-capture entirely', () => {
  process.env.EXPLORER_MUST_CAPTURE = '';
  expect(loadExplorerConfig().interactions.mustCapture).toEqual([]);
});

it('rejects an invalid EXPLORER_MUST_CAPTURE regex', () => {
  process.env.EXPLORER_MUST_CAPTURE = '([';
  expect(() => loadExplorerConfig()).toThrow(/EXPLORER_MUST_CAPTURE/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- explorer/config.unit.test.ts`
Expected: the 4 new/replaced tests FAIL (`mustCapture` is `undefined`); the rest pass.

- [ ] **Step 3: Implement**

In `explorer/config.ts`:

```ts
export interface InteractionsConfig {
  enabled: boolean;
  maxPerPage: number;
  /** Trigger-label patterns with guaranteed capture: prioritized on every page until
   *  each yields one `overlay` outcome anywhere in the crawl (design 2026-07-05-m8b §3). */
  mustCapture: RegExp[];
}
```

In `DEFAULTS`:

```ts
  interactions: { enabled: true, maxPerPage: 3, mustCapture: [/^añadir a (la )?cesta/i] },
```

New env parser (next to `envInteractions`):

```ts
function envMustCapture(): RegExp[] | undefined {
  const raw = process.env.EXPLORER_MUST_CAPTURE;
  if (raw === undefined) return undefined;
  // Semicolon-separated regex sources; empty string disables must-capture (design §3.1).
  const sources = raw.split(';').map((s) => s.trim()).filter((s) => s !== '');
  return sources.map((s) => {
    try {
      return new RegExp(s, 'i');
    } catch {
      throw new Error(`EXPLORER_MUST_CAPTURE: invalid regex "${s}"`);
    }
  });
}
```

In `loadExplorerConfig`, inside `base.interactions`:

```ts
    interactions: {
      enabled: envInteractions() ?? DEFAULTS.interactions.enabled,
      maxPerPage: envPositiveNumber('EXPLORER_MAX_INTERACTIONS_PER_PAGE', DEFAULTS.interactions.maxPerPage),
      mustCapture: envMustCapture() ?? DEFAULTS.interactions.mustCapture,
    },
```

(The final `return` already spreads `interactions: { ...base.interactions, ...overrides.interactions }` — no change needed there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- explorer/config.unit.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add explorer/config.ts explorer/config.unit.test.ts
git commit -m "feat(explorer): interactions.mustCapture config + EXPLORER_MUST_CAPTURE (M8b)"
```

---

### Task 2: Ledger — `labelClass`, `interactionScope`, satisfaction accounting

**Files:**
- Modify: `explorer/crawl/interact.ts` (the `InteractionLedger` class and module-level helpers; do NOT touch `selectCandidates`, `newOverlayNodes`, or `discoverInteractions` in this task)
- Test: `explorer/crawl/interact.unit.test.ts`

**Interfaces:**
- Consumes: `routePattern` from `../url` (already imported).
- Produces (Task 3 and 4 rely on these exact signatures):
  - `labelClass(label: string, patterns: RegExp[]): string`
  - `interactionScope(path: string): string`
  - `class InteractionLedger { constructor(mustCapture?: RegExp[]); mustCaptureClass(label: string): string | null; isSatisfied(cls: string): boolean; markSatisfied(label: string): void; unsatisfiedPatterns(): string[]; tryClaim(el: ExtractedElement, path: string): boolean }`
  - Backward compatibility: `new InteractionLedger()` (no args) must keep all existing tests passing unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `explorer/crawl/interact.unit.test.ts` (the `btn` helper at the top of the file already exists — reuse it):

```ts
import { InteractionLedger, selectCandidates, newOverlayNodes, discoverInteractions, labelClass, interactionScope } from './interact';

const MUST = [/^añadir a (la )?cesta/i];

describe('labelClass', () => {
  it('collapses matching labels into the pattern class', () => {
    expect(labelClass('Añadir a la cesta Short denim mini', MUST)).toBe(MUST[0].source);
    expect(labelClass('Añadir a cesta', MUST)).toBe(MUST[0].source);
  });

  it('returns the label itself when nothing matches', () => {
    expect(labelClass('Filtrar', MUST)).toBe('Filtrar');
  });

  it('first matching pattern wins', () => {
    const two = [/^añadir/i, /cesta/i];
    expect(labelClass('Añadir a cesta', two)).toBe(two[0].source);
  });
});

describe('interactionScope', () => {
  it('collapses all category PLPs into one shared scope', () => {
    expect(interactionScope('/es/mujer/ropa/camisetas-n4365.html')).toBe('-n{id}.html');
    expect(interactionScope('/es/hombre/ropa/vestidos-n5001.html')).toBe('-n{id}.html');
  });

  it('keeps routePattern behavior for non-category paths', () => {
    expect(interactionScope('/es/prod-c0p123.html')).toBe('/es/prod-c0p{id}.html');
    expect(interactionScope('/es/shop-cart.html')).toBe('/es/shop-cart.html');
  });
});

describe('InteractionLedger must-capture accounting', () => {
  it('classifies must-capture labels and tracks satisfaction by class', () => {
    const l = new InteractionLedger(MUST);
    const cls = l.mustCaptureClass('Añadir a la cesta Vestido corsé');
    expect(cls).toBe(MUST[0].source);
    expect(l.isSatisfied(cls as string)).toBe(false);
    l.markSatisfied('Añadir a la cesta Short denim mini'); // different product, same class
    expect(l.isSatisfied(cls as string)).toBe(true);
    expect(l.unsatisfiedPatterns()).toEqual([]);
  });

  it('markSatisfied is a no-op for non-must-capture labels', () => {
    const l = new InteractionLedger(MUST);
    l.markSatisfied('Filtrar');
    expect(l.unsatisfiedPatterns()).toEqual([MUST[0].source]);
  });

  it('mustCaptureClass returns null with an empty pattern list', () => {
    const l = new InteractionLedger();
    expect(l.mustCaptureClass('Añadir a cesta')).toBeNull();
  });

  it('tryClaim collapses per-product label variants via labelClass', () => {
    const l = new InteractionLedger(MUST);
    expect(l.tryClaim(btn('Añadir a la cesta Uno'), '/es/shop-cart.html')).toBe(true);
    expect(l.tryClaim(btn('Añadir a la cesta Dos'), '/es/shop-cart.html')).toBe(false);
  });

  it('tryClaim dedupes ordinary candidates across all category PLPs', () => {
    const l = new InteractionLedger();
    expect(l.tryClaim(btn('Filtrar'), '/es/mujer/camisetas-n4365.html')).toBe(true);
    expect(l.tryClaim(btn('Filtrar'), '/es/hombre/vestidos-n5001.html')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- explorer/crawl/interact.unit.test.ts`
Expected: FAIL — `labelClass`/`interactionScope` not exported, ledger methods missing. All pre-existing tests still pass.

- [ ] **Step 3: Implement**

In `explorer/crawl/interact.ts`, replace the current `InteractionLedger` class (keep `CLICKABLE_TYPES` and `CHROME` as they are) with:

```ts
/** Canonical equivalence class for a label: the source of the first matching pattern,
 *  or the label itself. "Añadir a la cesta Short denim mini" and "Añadir a la cesta
 *  Vestido corsé" collapse into one class (design 2026-07-05-m8b §3.1). */
export function labelClass(label: string, patterns: RegExp[]): string {
  const p = patterns.find((r) => r.test(label));
  return p !== undefined ? p.source : label;
}

/** Ledger-only scope: routePattern plus all category PLPs (`...-n{digits}.html`)
 *  collapsed into one shared scope. Deliberately NOT routePattern itself — that
 *  feeds the map schema and the differ (design §3.3). */
export function interactionScope(path: string): string {
  const p = routePattern(path);
  return /-n\d+\.html$/i.test(p) ? '-n{id}.html' : p;
}

export class InteractionLedger {
  private readonly claimed = new Set<string>();
  private readonly satisfied = new Set<string>();

  constructor(private readonly mustCapture: RegExp[] = []) {}

  /** The pattern class for a must-capture label, or null if no pattern matches. */
  mustCaptureClass(label: string): string | null {
    const p = this.mustCapture.find((r) => r.test(label));
    return p !== undefined ? p.source : null;
  }

  isSatisfied(cls: string): boolean {
    return this.satisfied.has(cls);
  }

  /** Call with an interaction trigger's label when its outcome was `overlay`. */
  markSatisfied(label: string): void {
    const cls = this.mustCaptureClass(label);
    if (cls !== null) this.satisfied.add(cls);
  }

  unsatisfiedPatterns(): string[] {
    return this.mustCapture.filter((r) => !this.satisfied.has(r.source)).map((r) => r.source);
  }

  tryClaim(el: ExtractedElement, path: string): boolean {
    const scope = el.component !== undefined && CHROME.has(el.component) ? 'chrome' : interactionScope(path);
    const key = `${scope}|${el.role}|${labelClass(el.label, this.mustCapture)}`;
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- explorer/crawl/interact.unit.test.ts`
Expected: ALL PASS (new and pre-existing — `new InteractionLedger()` defaults to no patterns, so old behavior is unchanged except the intended PLP-scope collapse, which no existing test contradicts).

- [ ] **Step 5: Commit**

```bash
git add explorer/crawl/interact.ts explorer/crawl/interact.unit.test.ts
git commit -m "feat(explorer): label equivalence classes + PLP interactionScope + must-capture ledger accounting (M8b)"
```

---

### Task 3: Two-pass `selectCandidates` with must-capture priority

**Files:**
- Modify: `explorer/crawl/interact.ts` (only `selectCandidates`)
- Test: `explorer/crawl/interact.unit.test.ts`

**Interfaces:**
- Consumes: Task 2's ledger API (`mustCaptureClass`, `isSatisfied`, `tryClaim`).
- Produces: `selectCandidates(elements, path, ledger, maxPerPage)` — signature unchanged; Task 4's crawler wiring calls it exactly as today.

- [ ] **Step 1: Write the failing tests**

Add to `explorer/crawl/interact.unit.test.ts`:

```ts
describe('selectCandidates must-capture priority', () => {
  it('picks an unsatisfied must-capture candidate first regardless of element order', () => {
    const ledger = new InteractionLedger(MUST);
    const els = [btn('Uno'), btn('Dos'), btn('Tres'), btn('Añadir a la cesta Vestido')];
    const picked = selectCandidates(els, '/es/shop-cart.html', ledger, 3);
    expect(picked[0].label).toBe('Añadir a la cesta Vestido');
    expect(picked).toHaveLength(3); // maxPerPage still respected
  });

  it('picks at most one candidate per must-capture class per page', () => {
    const ledger = new InteractionLedger(MUST);
    const els = [btn('Añadir a la cesta Uno'), btn('Añadir a la cesta Dos')];
    expect(selectCandidates(els, '/es/shop-cart.html', ledger, 3)).toHaveLength(1);
  });

  it('retries the class on later pages while unsatisfied, never picks it again once satisfied', () => {
    const ledger = new InteractionLedger(MUST);
    // Page 1: picked, but the click was hydration-lost (`none` outcome — nothing marked satisfied).
    expect(selectCandidates([btn('Añadir a la cesta A')], '/es/shop-cart.html', ledger, 3)).toHaveLength(1);
    // Page 2: still unsatisfied — picked again. This retry IS the determinism guarantee (design §3.2).
    expect(selectCandidates([btn('Añadir a la cesta B')], '/es/mujer/camisetas-n4365.html', ledger, 3)).toHaveLength(1);
    ledger.markSatisfied('Añadir a la cesta B');
    // Page 3: satisfied — not picked again, not even as an ordinary candidate.
    expect(selectCandidates([btn('Añadir a la cesta C')], '/es/prod-c0p9.html', ledger, 3)).toHaveLength(0);
  });

  it('keeps the safety gates on must-capture candidates', () => {
    const ledger = new InteractionLedger(MUST);
    const els = [
      btn('Añadir a la cesta X', { destructive: true }),
      { ...btn('Añadir a la cesta Y'), type: 'link' } as ExtractedElement,
    ];
    expect(selectCandidates(els, '/es/shop-cart.html', ledger, 3)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- explorer/crawl/interact.unit.test.ts`
Expected: the 4 new tests FAIL (single-pass order/claiming). Pre-existing `selectCandidates` tests still pass.

- [ ] **Step 3: Implement**

Replace `selectCandidates` in `explorer/crawl/interact.ts`:

```ts
function eligible(el: ExtractedElement): boolean {
  if (!CLICKABLE_TYPES.has(el.type) || el.destructive) return false;
  const name = el.selectorHints.role?.name;
  return name !== undefined && name !== '';
}

export function selectCandidates(
  elements: ExtractedElement[], path: string, ledger: InteractionLedger, maxPerPage: number,
): ExtractedElement[] {
  const picked: ExtractedElement[] = [];

  // Pass 1: unsatisfied must-capture classes, one per class per page, ahead of the
  // extraction-order race. No ordinary claim: the class is retried on later pages
  // until it yields an overlay — a hydration-lost click must not burn it (design §3.2).
  const pickedClasses = new Set<string>();
  for (const el of elements) {
    if (picked.length >= maxPerPage) break;
    if (!eligible(el)) continue;
    const cls = ledger.mustCaptureClass(el.label);
    if (cls === null || ledger.isSatisfied(cls) || pickedClasses.has(cls)) continue;
    pickedClasses.add(cls);
    picked.push(el);
  }

  // Pass 2: ordinary candidates. Must-capture-classed elements never claim here —
  // unsatisfied ones are pass 1's job, satisfied ones are done for the crawl.
  for (const el of elements) {
    if (picked.length >= maxPerPage) break;
    if (!eligible(el)) continue;
    if (ledger.mustCaptureClass(el.label) !== null) continue;
    if (!ledger.tryClaim(el, path)) continue;
    picked.push(el);
  }
  return picked;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- explorer/crawl/interact.unit.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Run the full offline gate**

Run: `pnpm test:unit ; pnpm typecheck ; pnpm lint`
Expected: all green (this task closes the pure-logic half of the milestone).

- [ ] **Step 6: Commit**

```bash
git add explorer/crawl/interact.ts explorer/crawl/interact.unit.test.ts
git commit -m "feat(explorer): two-pass selectCandidates — must-capture priority over extraction order (M8b)"
```

---

### Task 4: Wiring — per-crawl-global ledger, satisfaction marking, CLI warning, docs

**Files:**
- Modify: `explorer/crawl/crawler.ts` (`CrawlDeps` + `crawlSession`)
- Modify: `explorer/cli.ts`
- Modify: `.env.example`, `README.md` (Explorer section)

**Interfaces:**
- Consumes: Task 2's `InteractionLedger` (constructor + `markSatisfied` + `unsatisfiedPatterns`), Task 1's `cfg.interactions.mustCapture`.
- Produces: `CrawlDeps.ledger: InteractionLedger` (required field — the compiler flags every construction site, which is only `cli.ts`).

- [ ] **Step 1: Update `crawler.ts`**

In `explorer/crawl/crawler.ts`:

1. Import (type-only is fine for the deps field, but `InteractionLedger` is no longer constructed here):
```ts
import { selectCandidates, discoverInteractions, INTERACT_SETTLE, type InteractionDriver, type InteractionLedger } from './interact';
```
2. Add to `CrawlDeps`:
```ts
export interface CrawlDeps {
  context: BrowserContext;
  baseURL: string;
  rules: RouteRules;
  bounds: CrawlBounds;
  extraction: ExtractionMode;
  interactions: InteractionsConfig;
  /** Per-crawl-global, shared by both sessions (M8b fix a): chrome dedupe and
   *  must-capture satisfaction span the whole crawl, not one session. */
  ledger: InteractionLedger;
}
```
3. Delete the line `const ledger = new InteractionLedger();` inside `crawlSession`.
4. In the interactions block, use `deps.ledger` and mark satisfaction (this replaces the existing `for (const it of extraction.interactions)` loop that pushes `revealedLinks`):
```ts
      if (deps.extraction === 'aria' && deps.interactions.enabled) {
        const candidates = selectCandidates(
          extraction.elements, extraction.meta.path, deps.ledger, deps.interactions.maxPerPage,
        );
        if (candidates.length > 0) {
          const driver = playwrightDriver(page, extraction.meta.path, deps.baseURL);
          extraction.interactions = await discoverInteractions(driver, candidates, extraction.meta);
          for (const it of extraction.interactions) {
            // Only an overlay capture satisfies a must-capture class — `none`/`navigated`
            // leave it retryable on later pages (design §3.2).
            if (it.outcome === 'overlay') deps.ledger.markSatisfied(it.trigger.label);
            extraction.links.push(...it.revealedLinks);
          }
        }
      }
```

- [ ] **Step 2: Update `cli.ts`**

In `explorer/cli.ts`:

1. Import: `import { InteractionLedger } from './crawl/interact';`
2. Before the `for (const session of sessions)` loop (next to `const classifier = ...`):
```ts
  const ledger = new InteractionLedger(cfg.interactions.mustCapture);
```
3. Add `ledger` to the `crawlSession` deps object:
```ts
      const result = await crawlSession(
        { context, baseURL: env.baseURL, rules: DEFAULT_ROUTE_RULES, bounds: cfg.bounds, extraction: cfg.extraction, interactions: cfg.interactions, ledger },
        session,
        SEEDS,
      );
```
4. After the `try/finally` block (once both sessions finished), before `buildMap`:
```ts
  if (cfg.extraction === 'aria' && cfg.interactions.enabled) {
    for (const src of ledger.unsatisfiedPatterns()) {
      console.warn(`Must-capture pattern /${src}/i never produced an overlay this crawl — the map may lack its interaction (M8b design §3.2).`);
    }
  }
```

- [ ] **Step 3: Document the new variable**

In `.env.example`, extend the M8 interactions comment block (keep it a comment — the variable is optional):

```
# Interaction discovery (M8): open non-destructive overlays/dialogs during the crawl (aria mode only).
# EXPLORER_INTERACTIONS=on|off (default on) ; EXPLORER_MAX_INTERACTIONS_PER_PAGE (default 3)
# EXPLORER_MUST_CAPTURE (M8b): semicolon-separated regex patterns (case-insensitive) for trigger
# labels with guaranteed capture — prioritized on every page until each yields an overlay once.
# Replaces the default (^añadir a (la )?cesta) when set; empty string disables must-capture.
```

In `README.md`, find the Explorer section's mention of `EXPLORER_INTERACTIONS`/interaction discovery (search for `EXPLORER_INTERACTIONS`) and add one sentence alongside it:

> `EXPLORER_MUST_CAPTURE` (optional, M8b): semicolon-separated, case-insensitive regex patterns for trigger labels the crawl must capture deterministically — matching candidates are prioritized on every page until each pattern yields an overlay outcome once per crawl. Default: `^añadir a (la )?cesta`. Empty string disables.

- [ ] **Step 4: Verify the offline gate**

Run: `pnpm typecheck ; pnpm lint ; pnpm test:unit`
Expected: all green. Typecheck is the real verification here — `CrawlDeps.ledger` is required, so a missed construction site cannot compile.

- [ ] **Step 5: Commit**

```bash
git add explorer/crawl/crawler.ts explorer/cli.ts .env.example README.md
git commit -m "feat(explorer): per-crawl-global ledger, overlay satisfaction marking, unsatisfied-pattern warning (M8b)"
```

---

### Task 5: Live probe — bounded crawl must capture Tallas

**Requires:** VPN to DES, `.env` with credentials. Run `pnpm exec playwright test --project=setup` first if `.auth/state.json` is stale.

- [ ] **Step 1: Run a bounded probe crawl (~20 pages/session)**

PowerShell:
```powershell
$env:EXPLORER_MAX_PAGES = '20'; $env:EXPLORER_TIME_BUDGET_MS = '1200000'
pnpm exec playwright test --project=setup
pnpm explore
```
Expected: crawl completes, `Explored N pages` (N ≈ 20–40 across sessions), **no** `Must-capture pattern ... never produced an overlay` warning on stdout.

- [ ] **Step 2: Verify the capture in the probe report**

The crawl writes `reports/explorer/<stamp>.json` containing `{ map, errors }`. Schema 1.5 keeps `elements[]` and `interactions[]` at the map's top level; the trigger label lives on the element referenced by `triggerElementId`. Save this as a scratch script (it is also Task 6's verifier) and run it:

```powershell
node -e "const fs=require('fs');const d='reports/explorer';const f=fs.readdirSync(d).sort().pop();const {map}=JSON.parse(fs.readFileSync(d+'/'+f,'utf8'));const els=new Map(map.elements.map(e=>[e.id,e]));const hits=map.interactions.filter(i=>i.outcome==='overlay'&&/^añadir a (la )?cesta/i.test(els.get(i.triggerElementId)?.label??''));const talla=hits.filter(i=>i.revealedElementIds.some(id=>/^talla/i.test(els.get(id)?.label??'')));console.log(f,'| añadir-a-cesta overlays:',hits.length,'| with Talla elements:',talla.length);process.exitCode=talla.length>0?0:1"
```

Acceptance criterion: **≥1 interaction with outcome `overlay` whose trigger element's label matches `/^añadir a (la )?cesta/i`, with ≥1 revealed element whose label starts with `Talla`** (exit code 0).

**If the probe does NOT capture it:** STOP. Do not re-run repeatedly and do not proceed to Task 6 — the mechanism is wrong. Use superpowers:systematic-debugging: check the warning output, check whether any visited page carried an eligible "Añadir a (la) cesta" candidate (Cart is reachable from every page's header; PLP quick-adds are hover-revealed cards), and inspect `selectCandidates` inputs on one such page. The design's conditional guarantee (§6) only excuses a miss if *no visited page carried the trigger* — verify that before blaming the environment.

- [ ] **Step 3: Commit nothing** — probe reports are gitignored; this task produces evidence, not artifacts.

---

### Task 6: Full re-crawl → canonical map with the Tallas capture + no-regression closure

**Requires:** VPN, ~45–60 min wall-clock for the crawl (M8 measured ~42 min at this scale).

- [ ] **Step 1: Full re-crawl with `--update`**

```powershell
$env:EXPLORER_MAX_PAGES = '150'; $env:EXPLORER_TIME_BUDGET_MS = '1200000'
pnpm explore --update
```
Expected: `Wrote canonical map to coverage/functional-map.json`, no unsatisfied-pattern warning.

- [ ] **Step 2: Verify the milestone success criterion on the committed artifact**

Run the same verification one-liner as Task 5 Step 2, but against the canonical map: replace the newest-report lookup with `const map=JSON.parse(fs.readFileSync('coverage/functional-map.json','utf8'));` (the canonical file holds the map directly, not `{ map, errors }`). Also verify the revealed Talla elements carry `revealedBy` pointing back at the interaction's `id`:

```powershell
node -e "const fs=require('fs');const map=JSON.parse(fs.readFileSync('coverage/functional-map.json','utf8'));const els=new Map(map.elements.map(e=>[e.id,e]));const hits=map.interactions.filter(i=>i.outcome==='overlay'&&/^añadir a (la )?cesta/i.test(els.get(i.triggerElementId)?.label??''));const ok=hits.filter(i=>i.revealedElementIds.some(id=>{const e=els.get(id);return e!==undefined&&/^talla/i.test(e.label??'')&&e.revealedBy===i.id;}));console.log('añadir-a-cesta overlays:',hits.length,'| Talla elements with revealedBy:',ok.length);process.exitCode=ok.length>0?0:1"
```
Expected: ≥1 "Añadir a (la) cesta" → overlay interaction with `revealedBy`-tagged Talla elements. **This is the milestone's success criterion (design §5).** If the warning fired or the check fails, treat as Task 5's failure branch — systematic-debugging, not blind re-runs.

- [ ] **Step 3: No-regression suite, planner, builder**

```powershell
pnpm test                    # manual reference suite: expect 4/4 (retries:1 tolerated per findings §7)
pnpm plan --update           # re-annotate coverage on the fresh map
pnpm build-tests --top 3     # expect 3/3 generated, no missing-loaded-signal warnings
pnpm test:generated          # expect all accumulated generated specs green
```
Expected: all green. Known acceptable noise: one retry on `add-to-cart.spec.ts` (documented environment noise, findings §7/§15); `pnpm plan` coverage counts vary with crawl discovery order (§9/§12/§13) — not a regression.

- [ ] **Step 4: Commit the canonical artifacts**

```bash
git add coverage/functional-map.json reports/planner/proposals.json
git commit -m "feat(explorer): M8b live validation — canonical map with deterministic Tallas capture"
```
(If `pnpm plan --update` rewrites the map's `coveredBy` annotations in place, that lands in the same commit — matches prior milestones' convention.)

---

### Task 7: Docs closure

**Files:**
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (new §16)
- Modify: `docs/roadmap/2026-07-02-platform-roadmap.md` ("Where a fresh session resumes" + milestone table row M8b)
- Modify: `docs/roadmap/2026-07-02-backlog.md` ("Where a fresh session resumes")
- Modify: `CLAUDE.md` ("Current state" line + "Pending tasks for next session")

- [ ] **Step 1: Findings doc §16**

Add a §16 titled "Deterministic must-capture interactions (M8b) — closes the M9 prerequisite (2026-07-05)" following the established section format: what changed (mustCapture config, two-pass selection, satisfaction accounting, interactionScope PLP collapse, per-crawl-global ledger), the live numbers from Tasks 5–6 (pages, interaction counts, whether the probe and the full crawl each captured Tallas), the no-regression results, and any honest caveats found live. Update the header's "last updated" line and the Status paragraph. Write real measured numbers from the Task 5/6 runs — never placeholders.

- [ ] **Step 2: Roadmap + backlog resume pointers**

- Roadmap: replace the "Where a fresh session resumes" section content: M8b done, canonical map now contains the Tallas interaction, **M9 (Builder interaction-spec generation) is unblocked and is the natural next milestone — confirm with Jorge first**. Add an M8b row to the milestone table (Phase 5 prerequisite, North Star: Knowledge + Autonomy).
- Backlog: update its "Where a fresh session resumes" equivalently; note the two M8-review findings (a) and (b) as closed by M8b.

- [ ] **Step 3: CLAUDE.md**

Replace the "Current state" line wholesale (per its own instruction) and rewrite "Pending tasks for next session": item 2's M9-prerequisite caveat is gone — M9 is actionable; keep C11/C13/D15 as lower priority; drop the two M8 minor findings (closed here).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-06-17-des-live-validation-findings.md docs/roadmap/2026-07-02-platform-roadmap.md docs/roadmap/2026-07-02-backlog.md CLAUDE.md
git commit -m "docs: M8b closure — findings §16, roadmap/backlog/CLAUDE.md resume pointers"
```
