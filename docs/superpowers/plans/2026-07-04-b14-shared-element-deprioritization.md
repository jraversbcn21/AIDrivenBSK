# B14 — Shared-Element Deprioritization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag Header/Footer/MiniCart component membership on extracted elements so the Builder's `loadedSignalFor` prefers page-specific loaded-signals over shared chrome.

**Architecture:** An optional `component?: ComponentKind` provenance field flows extraction → map (schema 1.3 → 1.4) → Builder. The aria extractor tags elements by ancestor landmark (`banner` → Header, `contentinfo` → Footer, cart-named-inside-banner → MiniCart); `loadedSignalFor` runs its tier order twice, pass-major: page-specific candidates first, shared chrome only as fallback.

**Tech Stack:** TypeScript strict, Vitest unit tests, Playwright (live validation only, Task 7). Spec: `docs/superpowers/specs/2026-07-04-b14-shared-element-deprioritization-design.md`.

## Global Constraints

- `@typescript-eslint/no-explicit-any` is an **error** — no `any`, ever.
- `import/no-cycle` is an **error** at any depth.
- After each task: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint` must all pass.
- Conventional Commits: `type(scope): description`; scopes here are `explorer` and `builder`.
- Only `Header` | `Footer` | `MiniCart` are ever emitted as `component` values this milestone.
- The cart regex (`/cesta|cart/i`) applies **only inside the banner subtree** — a page-body "Añadir a la cesta" must stay untagged (page-specific).
- Deprioritize ≠ exclude: if every candidate on a leaf is shared, the shared element is still returned (never `null` because of sharedness alone).
- No migration code for schema-1.3 maps; the canonical map is regenerated live in Task 7.
- Commit messages end with the Co-Authored-By/Claude-Session trailer used by this repo.

---

### Task 1: Types + schema bump (1.3 → 1.4)

**Files:**
- Modify: `explorer/types.ts` (interface `ExtractedElement`, lines 13-19)
- Modify: `explorer/map/schema.ts` (const `SCHEMA_VERSION` line 5, interface `MapElement` lines 28-36)
- Test: `explorer/map/builder.unit.test.ts` (line 24), `planner/coverage/annotate.unit.test.ts` (line 37)

**Interfaces:**
- Consumes: `ComponentKind` (already exported from `explorer/types.ts`).
- Produces: `ExtractedElement.component?: ComponentKind` and `MapElement.component?: ComponentKind` — every later task relies on these exact names; `SCHEMA_VERSION === '1.4'`.

- [ ] **Step 1: Flip the two version-asserting tests to '1.4' (failing tests)**

In `explorer/map/builder.unit.test.ts` line 24 change:

```ts
    expect(a.schemaVersion).toBe('1.4');
```

In `planner/coverage/annotate.unit.test.ts` line 37 change:

```ts
    expect(out.schemaVersion).toBe('1.4');
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:unit -- builder.unit annotate.unit`
Expected: 2 FAILs — `expected '1.3' to be '1.4'`.

- [ ] **Step 3: Bump the version and add the optional field to both types**

`explorer/map/schema.ts` line 5:

```ts
export const SCHEMA_VERSION = '1.4';
```

`explorer/types.ts` — add one line to `ExtractedElement`:

```ts
export interface ExtractedElement {
  type: ElementType;
  label: string;
  role: string;
  selectorHints: SelectorHints;
  destructive: boolean;
  component?: ComponentKind; // shared-chrome provenance (B14); absent = page-specific
}
```

(`ComponentKind` is declared later in the same file — fine for type references.)

`explorer/map/schema.ts` — add the same line to `MapElement`:

```ts
export interface MapElement {
  id: string;
  pageId: string;
  type: ElementType;
  label: string;
  role: string;
  selectorHints: SelectorHints;
  destructive: boolean;
  component?: ComponentKind; // shared-chrome provenance (B14); absent = page-specific
}
```

- [ ] **Step 4: Verify green**

Run: `pnpm test:unit` then `pnpm typecheck` then `pnpm lint`
Expected: all PASS (the optional field breaks nothing else).

- [ ] **Step 5: Commit**

```bash
git add explorer/types.ts explorer/map/schema.ts explorer/map/builder.unit.test.ts planner/coverage/annotate.unit.test.ts
git commit -m "feat(explorer): schema 1.4 - optional component provenance on elements (B14)"
```

---

### Task 2: Aria-path tagging (`analyzeAriaNodes`)

**Files:**
- Modify: `explorer/extract/analyzeAria.ts` (the `visit` closure, lines 42-84)
- Test: `explorer/extract/analyzeAria.unit.test.ts`

**Interfaces:**
- Consumes: `ExtractedElement.component` (Task 1).
- Produces: elements extracted from a `banner` subtree carry `component: 'Header'` (or `'MiniCart'` when their name matches `/cesta|cart/i`); from a `contentinfo` subtree, `'Footer'`; elsewhere the field is absent.

- [ ] **Step 1: Extend the test snapshot and add the failing tests**

In `explorer/extract/analyzeAria.unit.test.ts`, edit `SNAPSHOT`: add two buttons to the banner and give contentinfo a button child. The banner block becomes:

```ts
const SNAPSHOT = `- banner:
  - searchbox "Buscar"
  - button "Buscar en tienda"
  - button "Ver cesta"
  - link "Ir a la cesta":
    - /url: /es/shop-cart.html
```

and the last line changes from `- contentinfo: info` to:

```ts
- contentinfo "Pie de página":
  - button "WhatsApp"`;
```

(Existing assertions are label-lookup based and unaffected; the `landmarkRoles`/`componentKinds` assertions still hold.)

Append two tests inside the existing `describe`:

```ts
  it('tags banner/contentinfo elements with shared-chrome provenance (B14)', () => {
    const byLabel = (l: string) => extraction.elements.find((e) => e.label === l);
    expect(byLabel('Buscar en tienda')?.component).toBe('Header');
    expect(byLabel('Ver cesta')?.component).toBe('MiniCart'); // cart-named, inside banner
    expect(byLabel('WhatsApp')?.component).toBe('Footer');
    // Page-body elements stay page-specific — including cart-named ones (the exact
    // candidate B14 wants to win must never be tagged shared):
    expect(byLabel('Añadir a la cesta')?.component).toBeUndefined();
    expect(byLabel('Filtrar')?.component).toBeUndefined();
  });

  it('tags the real DES chrome in category-gate.aria.txt (B14)', () => {
    const snapshot = readFileSync(new URL('../__fixtures__/category-gate.aria.txt', import.meta.url), 'utf8');
    const ex = analyzeAriaNodes(parseAriaSnapshot(snapshot), meta);
    const byLabel = (l: string) => ex.elements.find((e) => e.label === l);
    expect(byLabel('Buscar en tienda')?.component).toBe('Header');
    expect(byLabel('Acceder')?.component).toBe('Header');
    expect(byLabel('WhatsApp')?.component).toBe('Footer');
    expect(byLabel('Buscar')?.component).toBeUndefined(); // main-body search button
  });
```

Add the import at the top of the file:

```ts
import { readFileSync } from 'node:fs';
```

(The fixture holds 24 capturable elements — safely under the extractor's 60-element cap, verified during planning, so the footer's "WhatsApp" is guaranteed to be extracted.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm test:unit -- analyzeAria`
Expected: the two new tests FAIL (`component` is `undefined` where `'Header'`/`'Footer'`/`'MiniCart'` expected); all pre-existing tests still PASS.

- [ ] **Step 3: Thread a chrome context through `visit`**

In `explorer/extract/analyzeAria.ts`, replace the entire `visit` closure and its root call with the version below. Changed lines: the new `chrome` parameter, the `nextChrome` computation, the element push (now builds `el` and conditionally sets `component`), and the recursive/root calls. Everything else is byte-identical to the current file.

```ts
  const visit = (node: AriaNode, inListitem: boolean, chrome: 'Header' | 'Footer' | undefined): void => {
    if (node.role === 'text') {
      if (node.text) texts.push(node.text);
      return;
    }
    const nextChrome =
      node.role === 'banner' ? 'Header' : node.role === 'contentinfo' ? 'Footer' : chrome;
    if (LANDMARKS.has(node.role)) landmarkRoles.push(node.role);
    if (node.role === 'banner') componentKinds.add('Header');
    if (node.role === 'contentinfo') componentKinds.add('Footer');
    if (node.role === 'searchbox') componentKinds.add('SearchBar');
    const name = node.name ?? '';
    if (/filtr/i.test(name)) componentKinds.add('FiltersPanel');
    if ((node.role === 'link' || node.role === 'button') && /cesta|cart/i.test(name)) componentKinds.add('MiniCart');

    if (node.role === 'link' && node.url) {
      links.push(node.url);
      if (inListitem && /-c0p/i.test(node.url)) componentKinds.add('ProductCard');
    }

    const type = elementTypeFor(node);
    if (type && elements.length < MAX_ELEMENTS_PER_PAGE) {
      const el: ExtractedElement = {
        type,
        label: name,
        role: node.role,
        selectorHints: name ? { role: { type: node.role, name } } : {},
        destructive: isDestructive(name),
      };
      // Cart-named chrome inside the banner is the header cart affordance (MiniCart) —
      // the regex is scoped to the banner so page-body "Añadir a la cesta" stays untagged.
      const component = nextChrome === 'Header' && /cesta|cart/i.test(name) ? 'MiniCart' : nextChrome;
      if (component !== undefined) el.component = component;
      elements.push(el);
    }

    if (node.role === 'form') {
      const fields: ExtractedFormField[] = [];
      const collect = (n: AriaNode): void => {
        if (FIELD_ROLES.has(n.role)) fields.push({ name: n.name ?? '', type: n.role, required: false });
        n.children.forEach(collect);
      };
      node.children.forEach(collect);
      forms.push({ purposeHint: inferFormPurpose(node, fields.map((f) => f.name)), fields });
    }

    node.children.forEach((child) => visit(child, inListitem || node.role === 'listitem', nextChrome));
  };

  nodes.forEach((n) => visit(n, false, undefined));
```

- [ ] **Step 4: Verify green**

Run: `pnpm test:unit -- analyzeAria` then `pnpm typecheck` then `pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add explorer/extract/analyzeAria.ts explorer/extract/analyzeAria.unit.test.ts
git commit -m "feat(explorer): tag Header/Footer/MiniCart provenance in aria extraction (B14)"
```

---

### Task 3: DOM-path tagging (`analyzePage`, offline-only parity)

**Files:**
- Modify: `explorer/extract/analyze.ts` (the `pushEl` helper, lines 41-44)
- Test: `explorer/extract/analyze.unit.test.ts`

**Interfaces:**
- Consumes: `ExtractedElement.component` (Task 1).
- Produces: same tagging semantics as Task 2 for the linkedom/DOM extraction path (`EXPLORER_EXTRACTION=dom`, offline tests only).

- [ ] **Step 1: Add the failing test**

Append to the `describe` in `explorer/extract/analyze.unit.test.ts`:

```ts
  it('tags header/footer elements with component provenance, leaving body elements untagged (B14)', () => {
    const html = `
<html><body>
  <header><button>Buscar en tienda</button><button>Ver cesta</button></header>
  <main><button>Añadir a la cesta</button></main>
  <footer><button>Ayuda</button></footer>
</body></html>`;
    const r = analyzePage(html, meta);
    const byLabel = (l: string) => r.elements.find((e) => e.label === l);
    expect(byLabel('Buscar en tienda')?.component).toBe('Header');
    expect(byLabel('Ver cesta')?.component).toBe('MiniCart');
    expect(byLabel('Ayuda')?.component).toBe('Footer');
    expect(byLabel('Añadir a la cesta')?.component).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit -- analyze.unit`
Expected: new test FAILs (`component` undefined); existing tests PASS.

- [ ] **Step 3: Implement `componentFor` and wire it into `pushEl`**

In `explorer/extract/analyze.ts`, add above `analyzePage`:

```ts
function componentFor(el: Element, label: string): ComponentKind | undefined {
  // Cart-named chrome inside the header is the cart affordance (MiniCart); the regex is
  // scoped to the header so page-body "Añadir a la cesta" stays untagged (page-specific).
  if (el.closest('header, [role=banner]')) return /cesta|cart/i.test(label) ? 'MiniCart' : 'Header';
  if (el.closest('footer, [role=contentinfo]')) return 'Footer';
  return undefined;
}
```

and change `pushEl` to:

```ts
  const pushEl = (el: Element, type: ElementType): void => {
    const label = text(el);
    const entry: ExtractedElement = {
      type, label, role: roleOf(el), selectorHints: hintsFor(el), destructive: isDestructive(label),
    };
    const component = componentFor(el, label);
    if (component !== undefined) entry.component = component;
    elements.push(entry);
  };
```

(`ExtractedElement` and `ComponentKind` are already in this file's type import from `../types`.)

- [ ] **Step 4: Verify green**

Run: `pnpm test:unit -- analyze.unit` then `pnpm typecheck` then `pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add explorer/extract/analyze.ts explorer/extract/analyze.unit.test.ts
git commit -m "feat(explorer): tag component provenance in DOM extraction path (B14)"
```

---

### Task 4: Map-build passthrough (`buildMap`)

**Files:**
- Modify: `explorer/map/builder.ts` (the element push, lines 51-57)
- Test: `explorer/map/builder.unit.test.ts`

**Interfaces:**
- Consumes: `ExtractedElement.component` (Tasks 1-3).
- Produces: `MapElement.component` populated in built maps — Task 5 reads it from `map.elements`.

- [ ] **Step 1: Add the failing test**

In `explorer/map/builder.unit.test.ts`, add a second element to the `pdp` fixture (line 9's `elements` array):

```ts
  elements: [
    { type: 'button', label: 'Añadir a la cesta', role: 'button', selectorHints: { testId: { attr: 'data-testid', value: 'add' } }, destructive: false },
    { type: 'button', label: 'Buscar en tienda', role: 'button', selectorHints: { role: { type: 'button', name: 'Buscar en tienda' } }, destructive: false, component: 'Header' },
  ],
```

Append to the `describe`:

```ts
  it('passes element component provenance through to MapElement (B14)', () => {
    const m = buildMap({ classified, environment: 'des' });
    expect(m.elements.find((e) => e.label === 'Buscar en tienda')?.component).toBe('Header');
    expect(m.elements.find((e) => e.label === 'Añadir a la cesta')?.component).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit -- builder.unit`
Expected: new test FAILs (`component` undefined on the map element); others PASS.

- [ ] **Step 3: Implement the passthrough**

In `explorer/map/builder.ts`, replace the element push (lines 51-57) with:

```ts
    ex.elements.forEach((el) => {
      const mapEl: MapElement = {
        id: makeId('elem', pageId, el.role, el.label, el.type),
        pageId, type: el.type, label: el.label, role: el.role,
        selectorHints: el.selectorHints, destructive: el.destructive,
      };
      if (el.component !== undefined) mapEl.component = el.component;
      elements.push(mapEl);
    });
```

- [ ] **Step 4: Verify green**

Run: `pnpm test:unit -- builder.unit` then `pnpm typecheck` then `pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add explorer/map/builder.ts explorer/map/builder.unit.test.ts
git commit -m "feat(explorer): carry component provenance into the functional map (B14)"
```

---

### Task 5: Builder deprioritization (`loadedSignalFor`)

**Files:**
- Modify: `builder/select.ts` (function `loadedSignalFor`, lines 40-49)
- Test: `builder/select.unit.test.ts`

**Interfaces:**
- Consumes: `MapElement.component` (Task 4).
- Produces: `loadedSignalFor` unchanged signature (`(map: FunctionalMap, leaf: MapPage) => Strategy | null`) — pass-major ordering: page-specific candidates across all tiers first, shared chrome (`Header`/`Footer`/`MiniCart`) only as fallback.

- [ ] **Step 1: Add the failing tests**

Append to the `describe` in `builder/select.unit.test.ts`:

```ts
  it('deprioritizes shared chrome: an own role hint beats an earlier header role hint (B14)', () => {
    const chromeMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Buscar en tienda', role: 'button', selectorHints: { role: { type: 'button', name: 'Buscar en tienda' } }, destructive: false, component: 'Header' },
        { id: 'e2', pageId: 'pPlp', type: 'button', label: 'Añadir a la lista', role: 'button', selectorHints: { role: { type: 'button', name: 'Añadir a la lista' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), chromeMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Añadir a la lista' } });
  });

  it('pass-major: an own role hint beats a shared testId hint (B14)', () => {
    // A header testId is just as weak a leaf-page signal as a header role —
    // page-specificity outranks tier (design spec §5).
    const chromeMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Buscar en tienda', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'storeSearch' } }, destructive: false, component: 'Header' },
        { id: 'e2', pageId: 'pPlp', type: 'button', label: 'Añadir a la lista', role: 'button', selectorHints: { role: { type: 'button', name: 'Añadir a la lista' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), chromeMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Añadir a la lista' } });
  });

  it('falls back to the shared element when everything on the leaf is shared (B14)', () => {
    // Deprioritize, never exclude: a shared signal still beats the null/main fallback.
    const allSharedMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Buscar en tienda', role: 'button', selectorHints: { role: { type: 'button', name: 'Buscar en tienda' } }, destructive: false, component: 'Header' },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), allSharedMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Buscar en tienda' } });
  });
```

(The existing tests double as the legacy-map case: `map`'s elements carry no `component`, so current behavior must be byte-identical — they must keep passing unchanged.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm test:unit -- select.unit`
Expected: the first two new tests FAIL (header element wins today); the all-shared one PASSes already (it matches current behavior); all pre-existing tests PASS.

- [ ] **Step 3: Implement pass-major deprioritization**

In `builder/select.ts`, replace `loadedSignalFor` (keep its doc comment, extend it):

```ts
// Shared chrome (Header/Footer/MiniCart) proves the app shell rendered, not that the leaf
// page did — deprioritized pass-major, never excluded (design spec 2026-07-04, B14).
const SHARED_COMPONENTS = new Set<string>(['Header', 'Footer', 'MiniCart']);

/** First non-destructive element whose best hint matches the framework's selector
 *  priority (testId -> role -> label); null means the template falls back to the
 *  main landmark. Pass-major (B14): the tier order runs over page-specific candidates
 *  first, and over shared chrome only when no page-specific candidate has any hint.
 *  Deterministic: map element order within each pass. testId is trustworthy again
 *  since M7 (attribute provenance — design spec 2026-07-03-testid-attribute-fix-design.md). */
function loadedSignalFor(map: FunctionalMap, leaf: MapPage): Strategy | null {
  const candidates = map.elements.filter((e) => e.pageId === leaf.id && !e.destructive);
  const specific = candidates.filter((e) => e.component === undefined || !SHARED_COMPONENTS.has(e.component));
  const shared = candidates.filter((e) => e.component !== undefined && SHARED_COMPONENTS.has(e.component));
  for (const pass of [specific, shared]) {
    for (const key of ['testId', 'role', 'label'] as const) {
      for (const el of pass) {
        const s = toStrategy(el.selectorHints);
        if (s !== null && key in s) return s;
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Verify green**

Run: `pnpm test:unit` then `pnpm typecheck` then `pnpm lint`
Expected: all PASS (full unit suite — this is the last code task).

- [ ] **Step 5: Commit**

```bash
git add builder/select.ts builder/select.unit.test.ts
git commit -m "feat(builder): deprioritize shared-chrome elements in loaded-signal selection (B14)"
```

---

### Task 6: Offline smoke — generation against the committed map

**Files:**
- No source changes. Read-only sanity gate before going live.

**Interfaces:**
- Consumes: everything above.
- Produces: confidence that the pipeline runs end-to-end offline; the committed schema-1.3 map must behave exactly as before (no `component` fields → nothing deprioritized).

- [ ] **Step 1: Regenerate drafts against the committed (schema-1.3) map**

Run: `pnpm build-tests --top 3`
Expected: exits 0; drafts written to `tests/generated/`. Because the committed map is schema 1.3 (no `component` anywhere), the chosen loaded-signals must be identical to the pre-B14 output — spot-check one generated spec's `isLoaded()` and confirm it still uses the `data-qa-anchor`/`addToCartSizeBtn` testId signal (M7's payoff, findings §12).

- [ ] **Step 2: Full local gate**

Run: `pnpm test:unit && pnpm typecheck && pnpm lint`
Expected: all PASS. Nothing to commit (drafts are gitignored); this task gates entry to Task 7.

---

### Task 7: Live validation & closure (requires VPN + DES)

**Files:**
- Modify: `coverage/functional-map.json` (regenerated), `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (new §14), `docs/roadmap/2026-07-02-backlog.md` (B14 → done; resume pointer), `CLAUDE.md` (current-state line)

**Interfaces:**
- Consumes: the full B14 code path (Tasks 1-5).
- Produces: regenerated schema-1.4 canonical map with `component` provenance; live-passing generated specs; B14 closed in docs.

Sequence identical to M7b. Prerequisites: VPN up, `.env` with DES credentials, Chromium installed.

- [ ] **Step 1: Full re-crawl (~20-30 min)**

```powershell
$env:EXPLORER_MAX_PAGES = '80'; $env:EXPLORER_TIME_BUDGET_MS = '1200000'; pnpm explore --update
```

Expected: ~150 pages, both sessions, 0 errors; the 0-page write guard must not trigger.

- [ ] **Step 2: Inspect the fresh map**

Check in `coverage/functional-map.json`: `schemaVersion` is `"1.4"`; elements labeled "Buscar en tienda" carry `"component": "Header"`; footer elements carry `"Footer"`; cart-named banner elements carry `"MiniCart"`; PDP body elements ("Añadir a la cesta"-family) carry **no** `component`. Rough share: header/footer chrome recurs on every page, so a substantial fraction of all elements should now carry `component`.

- [ ] **Step 3: Re-annotate coverage**

Run: `pnpm test` (expect 4/4 — this is also the no-regression gate for the reference suite) then `pnpm plan --update`
Expected: map re-annotated, all flows evaluated; coverage count may differ from previous runs (documented crawl-to-crawl variability, findings §9/§12/§13 — not caused by B14).

- [ ] **Step 4: Regenerate and inspect drafts**

Run: `pnpm build-tests --top 3`
Expected: for each generated spec, `isLoaded()` uses a page-specific signal. If a leaf has a testId-bearing element, the testId signal (M7 behavior, unchanged). The B14-specific check: **no generated spec asserts `Buscar en tienda` (or any header/footer element) while its leaf page has page-specific candidates in the map.** If the top-3 leaves all carry strong testIds (known risk, spec §7), raise `--top` until a journey whose leaf lacks a testId-bearing element appears, and verify that one picks a non-shared role/label signal; if none exists in the whole selection, record that unit tests + map inspection carried the validation instead.

- [ ] **Step 5: Run generated specs live**

Run: `pnpm test:generated`
Expected: all selected drafts PASS against DES (retries allowed per config; note any).

- [ ] **Step 6: Update docs**

- Findings doc: add **§14** — B14 closure: what was tagged, pass-major deprioritization, re-crawl numbers, which loaded-signals the regenerated specs picked, whether the no-testId case appeared in the selection (spec §7's known risk), and the `pnpm test` 4/4 no-regression result. Update the header **Status** line.
- Backlog: mark **B14 done (2026-07-04)** with a two-line summary; update the "Where a fresh session resumes" section (next candidate: M8 — confirm with Jorge first).
- `CLAUDE.md`: replace the **Current state** line wholesale (B14 closed; next candidate M8, confirm with Jorge).

- [ ] **Step 7: Commit map + docs**

```bash
git add coverage/functional-map.json reports/route-evidence.json docs/superpowers/notes/2026-06-17-des-live-validation-findings.md docs/roadmap/2026-07-02-backlog.md CLAUDE.md
git commit -m "feat(explorer): schema-1.4 map with component provenance; B14 closure docs"
```

(Adjust the `git add` list to what actually changed — e.g. `reports/route-evidence.json` only if it is tracked; check `git status` first.)

---

## Verification (whole feature)

1. `pnpm test:unit && pnpm typecheck && pnpm lint` — green.
2. Regenerated map: schema 1.4, chrome elements carry `component`, body elements don't.
3. `pnpm build-tests` output: no generated spec uses a shared-chrome loaded-signal when its leaf has page-specific candidates.
4. `pnpm test:generated` — green live against DES.
5. `pnpm test` — 4/4, reference suite unaffected.

**Success criterion (spec §7):** leaf pages of the selected journeys that lack a testId-bearing element pick a non-shared loaded-signal; generated specs pass live.
