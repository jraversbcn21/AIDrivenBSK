# Builder Engine Implementation Plan (M6b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `pnpm build-tests` CLI that turns the Coverage Planner's top-ranked proposals into runnable Playwright navigation specs + minimal page objects imitating the framework's POM/COM contracts, isolated in gitignored `tests/generated/` until a human promotes them.

**Architecture:** New `builder/` sub-project (mirrors `explorer/`/`planner/`). `select.ts` resolves proposals against the functional map into `JourneyInput`s (chain paths + a loaded-signal `Strategy` from real map elements); a deterministic `TemplateGenerator` behind a minimal `Generator` interface (the LLM seam) emits byte-identical spec + page-object files; the CLI writes them and reports skips/weak signals. Generated code extends `BasePage`, uses `locate()`, and imports the shared `test` fixture — exactly like a hand-written spec.

**Tech Stack:** TypeScript strict, Vitest (offline), Playwright secondary config for `pnpm test:generated`. Live validation DEFERRED to the final task (VPN).

**Design spec:** `docs/superpowers/specs/2026-07-03-builder-engine-design.md`

## Global Constraints

- `pnpm typecheck` (strict, no `any`) and `pnpm lint` (no import cycles) pass after every task; unit tests offline/deterministic.
- **Generated output is fully deterministic: same inputs → byte-identical files. No wall-clock timestamps anywhere in generated content** (headers carry `flowId` + the map's `generatedAt` instead).
- Generated code must itself pass `pnpm typecheck` and `pnpm lint` when present (tsconfig already includes `tests/`; ESLint lints everything) — templates use single quotes, semicolons, 2-space indent, no `any`.
- The builder never re-ranks: proposals are consumed in the planner's order.
- Checkout guard is **route-based** (`/checkout|pago|payment|purchase/i` on step paths), never `pageType`-based (backlog B13: `Checkout` labels unreliable).
- `tests/generated/` is gitignored and excluded from the default `pnpm test` run.
- Reuse `Strategy`/`locate()` (`src/support/locators.ts`), `BasePage`, `FunctionalMap`/`MapPage` (`explorer/map/schema.ts`), `PlanReport`/`TestProposal` (`planner/propose/propose.ts`), `Session`/`SelectorHints` (`explorer/types.ts`) — never reimplement.

---

### Task 1: Scaffold + isolation configs

**Files:**
- Modify: `package.json` (scripts), `tsconfig.json` (include), `vitest.config.ts` (include), `.gitignore`, `playwright.config.ts`
- Create: `playwright.generated.config.ts`

**Interfaces:**
- Produces (consumed by every later task): `pnpm build-tests` script wiring; `pnpm test:generated` runner; `tests/generated/**` ignored by git and by the default Playwright run.

- [ ] **Step 1:** In `package.json` scripts, add:

```json
    "build-tests": "tsx builder/cli.ts",
    "test:generated": "playwright test --config playwright.generated.config.ts"
```

- [ ] **Step 2:** In `tsconfig.json`, change `include` to:

```json
  "include": ["src", "explorer", "planner", "builder", "tests", "playwright.config.ts", "playwright.generated.config.ts", "vitest.config.ts"]
```

- [ ] **Step 3:** In `vitest.config.ts`, change the test `include` to:

```ts
  test: { include: ['src/**/*.unit.test.ts', 'explorer/**/*.unit.test.ts', 'planner/**/*.unit.test.ts', 'builder/**/*.unit.test.ts'], environment: 'node' },
```

- [ ] **Step 4:** In `.gitignore`, add a line after `test-results/`:

```
tests/generated/
```

- [ ] **Step 5:** In `playwright.config.ts`, add one top-level option to the `defineConfig({...})` object (after `retries: 1,`):

```ts
  // Generated drafts (pnpm build-tests) never run in the default suite — they are reviewed
  // and promoted by a human first; run them explicitly with pnpm test:generated.
  testIgnore: ['**/tests/generated/**'],
```

- [ ] **Step 6:** Create `playwright.generated.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Runs ONLY the generated drafts in tests/generated/ (pnpm test:generated), which the base
 * config deliberately testIgnores. Everything else (workers: 1, retries, budgets, baseURL)
 * is inherited from the base config — same DES constraints apply to generated specs.
 */
export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'generated',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/state.json' },
      testMatch: /generated[\\/].*\.spec\.ts$/,
      dependencies: ['setup'],
    },
  ],
});
```

- [ ] **Step 7:** Run `pnpm typecheck && pnpm lint && pnpm test:unit` — all green (typecheck now also parses the new config; `builder/` doesn't exist yet, which is fine — tsconfig `include` tolerates missing folders).
- [ ] **Step 8:** Commit:

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore playwright.config.ts playwright.generated.config.ts
git commit -m "feat(builder): scaffold, generated-tests isolation configs"
```

---

### Task 2: Deterministic naming

**Files:**
- Create: `builder/naming.ts`
- Test: `builder/naming.unit.test.ts`

**Interfaces:**
- Produces (consumed by Task 4):
  - `classNameFor(routePattern: string): string` — PascalCase from all non-locale segments + `Page` suffix.
  - `specFileNameFor(routePattern: string, flowId: string): string` — kebab leaf slug + first 8 chars of the flowId hash.
  - `pageFileNameFor(routePattern: string): string` — `<ClassName>.ts`.

- [ ] **Step 1: Write the failing test** — `builder/naming.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classNameFor, specFileNameFor, pageFileNameFor } from './naming';

describe('classNameFor', () => {
  it('PascalCases all non-locale segments and appends Page', () => {
    expect(classNameFor('/es/mujer/ropa/camisetas-n4365.html')).toBe('MujerRopaCamisetasN4365Page');
  });
  it('decodes percent-encoding and strips diacritics', () => {
    expect(classNameFor('/es/mujer/sale/jers%c3%a9is-y-sudaderas-c1010850198.html'))
      .toBe('MujerSaleJerseisYSudaderasC1010850198Page');
  });
  it('strips {id} tokens from route patterns', () => {
    expect(classNameFor('/es/camiseta-basica-c0p{id}.html')).toBe('CamisetaBasicaC0pPage');
  });
  it('falls back to HomePage for the root path', () => {
    expect(classNameFor('/')).toBe('HomePage');
  });
});

describe('specFileNameFor', () => {
  it('kebab leaf slug + 8-char flow hash', () => {
    expect(specFileNameFor('/es/mujer/ropa/camisetas-n4365.html', 'flow_a1b2c3d4e5f6'))
      .toBe('camisetas-n4365-a1b2c3d4.spec.ts');
  });
  it('handles the root path', () => {
    expect(specFileNameFor('/', 'flow_a1b2c3d4e5f6')).toBe('home-a1b2c3d4.spec.ts');
  });
});

describe('pageFileNameFor', () => {
  it('is the class name plus .ts', () => {
    expect(pageFileNameFor('/es/mujer/ropa/camisetas-n4365.html')).toBe('MujerRopaCamisetasN4365Page.ts');
  });
});
```

- [ ] **Step 2:** Run `pnpm test:unit builder/naming.unit.test.ts` → FAIL (cannot resolve `./naming`).

- [ ] **Step 3: Implement** — `builder/naming.ts`:

```ts
const stripDiacritics = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function words(raw: string): string[] {
  return stripDiacritics(raw)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function nonLocaleSegments(routePattern: string): string[] {
  return decodeURIComponent(routePattern)
    .split('/')
    .filter(Boolean)
    .filter((seg, i) => !(i === 0 && /^[a-z]{2}$/i.test(seg)))
    .map((seg) => seg.replace(/\.html?$/i, '').replace(/\{id\}/g, ''));
}

export function classNameFor(routePattern: string): string {
  const ws = words(nonLocaleSegments(routePattern).join('-'));
  const base = ws.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return `${base || 'Home'}Page`;
}

export function specFileNameFor(routePattern: string, flowId: string): string {
  const segments = nonLocaleSegments(routePattern);
  const slug = words(segments[segments.length - 1] ?? '').join('-') || 'home';
  return `${slug}-${flowId.replace(/^flow_/, '').slice(0, 8)}.spec.ts`;
}

export function pageFileNameFor(routePattern: string): string {
  return `${classNameFor(routePattern)}.ts`;
}
```

- [ ] **Step 4:** Run `pnpm test:unit builder/naming.unit.test.ts` → PASS (7 tests). Then `pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5:** Commit:

```bash
git add builder/naming.ts builder/naming.unit.test.ts
git commit -m "feat(builder): deterministic class and file naming from route patterns"
```

---

### Task 3: Generator seam types + proposal selection

**Files:**
- Create: `builder/generate/Generator.ts`, `builder/select.ts`
- Test: `builder/select.unit.test.ts`

**Interfaces:**
- Consumes: `FunctionalMap`/`MapPage` (explorer schema), `PlanReport` (planner), `Strategy` (locators), `Session`/`SelectorHints` (explorer types).
- Produces (consumed by Tasks 4–5):
  - `Generator.ts`:
    ```ts
    export interface ChainStep { path: string; routePattern: string; title: string }
    export interface JourneyInput {
      flowId: string; journeyName: string; session: Session;
      chain: ChainStep[]; loadedSignal: Strategy | null; mapGeneratedAt: string;
    }
    export interface GeneratedFile { relPath: string; content: string }
    export interface Generator { generate(input: JourneyInput): GeneratedFile[] }
    ```
  - `select.ts`: `interface SkippedProposal { flowId: string; reason: string }`; `interface Selection { journeys: JourneyInput[]; skipped: SkippedProposal[] }`; `function selectJourneys(report: PlanReport, map: FunctionalMap, top: number): Selection`.

- [ ] **Step 1:** Create `builder/generate/Generator.ts` (types only — the seam an LLM generator would implement later):

```ts
import type { Session } from '../../explorer/types';
import type { Strategy } from '../../src/support/locators';

export interface ChainStep {
  path: string;
  routePattern: string;
  title: string;
}

/** Everything a generator needs to emit one journey's files — resolved, map-independent. */
export interface JourneyInput {
  flowId: string;
  journeyName: string; // human-readable chain, from the proposal
  session: Session;
  chain: ChainStep[]; // root -> leaf
  loadedSignal: Strategy | null; // best real element of the leaf page; null = main-landmark fallback
  mapGeneratedAt: string; // stamped into headers instead of wall-clock time (determinism)
}

export interface GeneratedFile {
  relPath: string; // relative to the output dir
  content: string;
}

/** The pluggable seam (same pattern as the Explorer's Classifier): deterministic
 *  templates today, an LLM-backed implementation can plug in without CLI changes. */
export interface Generator {
  generate(input: JourneyInput): GeneratedFile[];
}
```

- [ ] **Step 2: Write the failing test** — `builder/select.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectJourneys } from './select';
import type { FunctionalMap, MapPage } from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';

const page = (id: string, path: string): MapPage => ({
  id, path, routePattern: path, pageType: 'Other', session: 'anon', title: path, discoveredVia: '/',
});

const map: FunctionalMap = {
  schemaVersion: '1.2', generatedAt: '2026-07-03T06:00:00Z', environment: 'des',
  pages: [
    page('pRoot', '/'),
    page('pHub', '/es/h-woman.html'),
    page('pPlp', '/es/mujer/ropa/camisetas-n4365.html'),
    page('pPay', '/es/checkout/payment.html'),
    page('pBare', '/es/pag/bershkastyle.html'),
  ],
  components: [], forms: [],
  elements: [
    { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Eliminar', role: 'button', selectorHints: { role: { type: 'button', name: 'Eliminar' } }, destructive: true },
    { id: 'e2', pageId: 'pPlp', type: 'filter', label: 'Filtrar', role: 'button', selectorHints: { role: { type: 'button', name: 'Filtrar' } }, destructive: false },
    { id: 'e3', pageId: 'pPlp', type: 'button', label: 'Añadir', role: 'button', selectorHints: { testId: 'quick-add' }, destructive: false },
  ],
  flows: [],
};

const report = (steps: string[][], names?: string[]): PlanReport => ({
  generatedAt: 'x', mapGeneratedAt: map.generatedAt, evidenceGeneratedAt: 'x',
  flows: { total: 0, covered: 0, uncovered: 0 },
  uncoveredByPriority: { high: 0, med: 0, low: 0 },
  proposals: steps.map((s, i) => ({
    flowId: `flow_${i}00000000000`, name: names?.[i] ?? `journey ${i}`, priority: 'high', session: 'anon', steps: s,
    rationale: 'r',
  })),
});

describe('selectJourneys', () => {
  it('resolves chains in planner order and honours top', () => {
    const r = selectJourneys(report([['pRoot', 'pHub', 'pPlp'], ['pRoot', 'pHub'], ['pRoot']]), map, 2);
    expect(r.journeys).toHaveLength(2);
    expect(r.journeys[0].chain.map((s) => s.path)).toEqual(['/', '/es/h-woman.html', '/es/mujer/ropa/camisetas-n4365.html']);
    expect(r.journeys[0].mapGeneratedAt).toBe('2026-07-03T06:00:00Z');
  });
  it('picks the loaded signal by framework priority (testId first), skipping destructive elements', () => {
    const r = selectJourneys(report([['pRoot', 'pPlp']]), map, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ testId: 'quick-add' });
  });
  it('falls back to a null signal when the leaf has no usable element', () => {
    const r = selectJourneys(report([['pRoot', 'pBare']]), map, 5);
    expect(r.journeys[0].loadedSignal).toBeNull();
  });
  it('skips proposals referencing unknown page ids, without consuming top slots', () => {
    const r = selectJourneys(report([['pGone'], ['pRoot']]), map, 1);
    expect(r.journeys).toHaveLength(1);
    expect(r.journeys[0].chain[0].path).toBe('/');
    expect(r.skipped[0].reason).toMatch(/missing from the map/);
  });
  it('skips checkout-looking routes by path (never by pageType)', () => {
    const r = selectJourneys(report([['pRoot', 'pPay']]), map, 5);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/checkout/i);
  });
});
```

- [ ] **Step 3:** Run `pnpm test:unit builder/select.unit.test.ts` → FAIL (cannot resolve `./select`).

- [ ] **Step 4: Implement** — `builder/select.ts`:

```ts
import type { FunctionalMap, MapPage } from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';
import type { SelectorHints } from '../explorer/types';
import type { Strategy } from '../src/support/locators';
import type { JourneyInput } from './generate/Generator';

// Route-based on purpose: the map's pageType 'Checkout' labels are unreliable (backlog B13),
// and the checkoutAllowed rule must never depend on them.
const CHECKOUT_ROUTE = /checkout|pago|payment|purchase/i;

export interface SkippedProposal {
  flowId: string;
  reason: string;
}

export interface Selection {
  journeys: JourneyInput[];
  skipped: SkippedProposal[];
}

function toStrategy(hints: SelectorHints): Strategy | null {
  if (hints.testId !== undefined) return { testId: hints.testId };
  if (hints.role !== undefined && hints.role.name !== '') {
    return { role: { type: hints.role.type as NonNullable<Strategy['role']>['type'], name: hints.role.name } };
  }
  if (hints.label !== undefined) return { label: hints.label };
  return null;
}

/** First non-destructive element whose best hint matches the framework's selector
 *  priority (testId -> role -> label); null means the template falls back to the
 *  main landmark. Deterministic: map element order. */
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

export function selectJourneys(report: PlanReport, map: FunctionalMap, top: number): Selection {
  const pageById = new Map(map.pages.map((p) => [p.id, p]));
  const journeys: JourneyInput[] = [];
  const skipped: SkippedProposal[] = [];

  for (const proposal of report.proposals) {
    if (journeys.length >= top) break;
    const pages = proposal.steps.map((id) => pageById.get(id));
    if (pages.some((p) => p === undefined)) {
      skipped.push({ flowId: proposal.flowId, reason: 'references a page id missing from the map (stale proposals? re-run pnpm plan)' });
      continue;
    }
    const chain = (pages as MapPage[]).map((p) => ({ path: p.path, routePattern: p.routePattern, title: p.title }));
    if (chain.some((s) => CHECKOUT_ROUTE.test(s.path))) {
      skipped.push({ flowId: proposal.flowId, reason: 'checkout-looking route, skipped by path guard' });
      continue;
    }
    const leaf = (pages as MapPage[])[pages.length - 1];
    journeys.push({
      flowId: proposal.flowId,
      journeyName: proposal.name,
      session: proposal.session,
      chain,
      loadedSignal: loadedSignalFor(map, leaf),
      mapGeneratedAt: map.generatedAt,
    });
  }

  return { journeys, skipped };
}
```

- [ ] **Step 5:** Run `pnpm test:unit builder/select.unit.test.ts` → PASS (5 tests). Then `pnpm typecheck && pnpm lint` → exit 0 (also proves `builder → explorer/planner/src` introduces no cycle).
- [ ] **Step 6:** Commit:

```bash
git add builder/generate/Generator.ts builder/select.ts builder/select.unit.test.ts
git commit -m "feat(builder): generator seam types and ranked proposal selection"
```

---

### Task 4: TemplateGenerator

**Files:**
- Create: `builder/generate/TemplateGenerator.ts`
- Test: `builder/generate/TemplateGenerator.unit.test.ts`

**Interfaces:**
- Consumes: `Generator`/`JourneyInput`/`GeneratedFile` (Task 3), naming functions (Task 2).
- Produces (consumed by Task 5): `class TemplateGenerator implements Generator` — `generate(input)` returns exactly `[pageObjectFile, specFile]` with `relPath`s `pages/<ClassName>.ts` and `<slug>-<hash8>.spec.ts`.

- [ ] **Step 1: Write the failing test** — `builder/generate/TemplateGenerator.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TemplateGenerator } from './TemplateGenerator';
import type { JourneyInput } from './Generator';

const input: JourneyInput = {
  flowId: 'flow_a1b2c3d4e5f6',
  journeyName: '/ -> /es/h-woman.html -> /es/mujer/ropa/camisetas-n4365.html',
  session: 'anon',
  chain: [
    { path: '/', routePattern: '/', title: 'Home' },
    { path: '/es/h-woman.html', routePattern: '/es/h-woman.html', title: 'Woman' },
    { path: '/es/mujer/ropa/camisetas-n4365.html', routePattern: '/es/mujer/ropa/camisetas-n4365.html', title: 'Camisetas' },
  ],
  loadedSignal: { role: { type: 'button', name: 'Filtrar' } },
  mapGeneratedAt: '2026-07-03T06:00:00Z',
};

describe('TemplateGenerator', () => {
  const g = new TemplateGenerator();
  const [pageFile, specFile] = g.generate(input);

  it('emits the page object at pages/<ClassName>.ts extending BasePage with the chain walk', () => {
    expect(pageFile.relPath).toBe('pages/MujerRopaCamisetasN4365Page.ts');
    expect(pageFile.content).toContain('export class MujerRopaCamisetasN4365Page extends BasePage {');
    expect(pageFile.content).toContain("await this.goto('/');");
    expect(pageFile.content).toContain("await this.goto('/es/h-woman.html');");
    expect(pageFile.content).toContain("await this.goto('/es/mujer/ropa/camisetas-n4365.html');");
    expect(pageFile.content).toContain("locate(this.page, { role: { type: 'button', name: 'Filtrar' } })");
  });

  it('emits the spec importing the shared fixture and polling isLoaded', () => {
    expect(specFile.relPath).toBe('camisetas-n4365-a1b2c3d4.spec.ts');
    expect(specFile.content).toContain("import { test, expect } from '../../src/fixtures/test';");
    expect(specFile.content).toContain("import { MujerRopaCamisetasN4365Page } from './pages/MujerRopaCamisetasN4365Page';");
    expect(specFile.content).toContain('journey: / -> /es/h-woman.html -> /es/mujer/ropa/camisetas-n4365.html');
    expect(specFile.content).toContain('await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);');
  });

  it('stamps a header with flowId and map generatedAt — never wall-clock time', () => {
    for (const f of [pageFile, specFile]) {
      expect(f.content.startsWith('// GENERATED from flow flow_a1b2c3d4e5f6 (map generated 2026-07-03T06:00:00Z)')).toBe(true);
    }
  });

  it('is fully deterministic: same input, identical bytes', () => {
    expect(g.generate(input)).toEqual(g.generate(input));
  });

  it('falls back to the main landmark when loadedSignal is null, without importing locate', () => {
    const [p] = g.generate({ ...input, loadedSignal: null });
    expect(p.content).toContain("return this.page.getByRole('main').isVisible();");
    expect(p.content).not.toContain('import { locate }');
  });

  it('escapes single quotes in strategy names', () => {
    const [p] = g.generate({ ...input, loadedSignal: { role: { type: 'button', name: "Women's sale" } } });
    expect(p.content).toContain("name: 'Women\\'s sale'");
  });
});
```

- [ ] **Step 2:** Run `pnpm test:unit builder/generate/TemplateGenerator.unit.test.ts` → FAIL (cannot resolve `./TemplateGenerator`).

- [ ] **Step 3: Implement** — `builder/generate/TemplateGenerator.ts`:

```ts
import type { Strategy } from '../../src/support/locators';
import type { Generator, JourneyInput, GeneratedFile } from './Generator';
import { classNameFor, specFileNameFor, pageFileNameFor } from '../naming';

const sq = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function strategyLiteral(s: Strategy): string {
  if (s.testId !== undefined) return `{ testId: ${sq(s.testId)} }`;
  if (s.role !== undefined) return `{ role: { type: ${sq(s.role.type)}, name: ${sq(s.role.name)} } }`;
  if (s.label !== undefined) return `{ label: ${sq(s.label)} }`;
  return `{ placeholder: ${sq(s.placeholder ?? '')} }`;
}

const header = (i: JourneyInput): string =>
  `// GENERATED from flow ${i.flowId} (map generated ${i.mapGeneratedAt}) — review before promoting; regeneration overwrites.\n`;

const leafOf = (i: JourneyInput) => i.chain[i.chain.length - 1];

function pageObjectFile(input: JourneyInput): GeneratedFile {
  const className = classNameFor(leafOf(input).routePattern);
  const gotos = input.chain.map((s) => `    await this.goto(${sq(s.path)});`).join('\n');
  const usesLocate = input.loadedSignal !== null;
  const isLoadedBody = usesLocate
    ? `    return locate(this.page, ${strategyLiteral(input.loadedSignal as Strategy)}).isVisible();`
    : `    return this.page.getByRole('main').isVisible();`;
  const imports = `import { BasePage } from '../../../src/pages/BasePage';\n${usesLocate ? "import { locate } from '../../../src/support/locators';\n" : ''}`;
  const content = `${header(input)}${imports}
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
}
`;
  return { relPath: `pages/${pageFileNameFor(leafOf(input).routePattern)}`, content };
}

function specFile(input: JourneyInput): GeneratedFile {
  const className = classNameFor(leafOf(input).routePattern);
  const content = `${header(input)}import { test, expect } from '../../src/fixtures/test';
import { ${className} } from './pages/${className}';

const HYDRATION_TIMEOUT_MS = 20_000;

test(${sq(`journey: ${input.journeyName}`)}, async ({ page }) => {
  const target = new ${className}(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
`;
  return { relPath: specFileNameFor(leafOf(input).routePattern, input.flowId), content };
}

export class TemplateGenerator implements Generator {
  generate(input: JourneyInput): GeneratedFile[] {
    return [pageObjectFile(input), specFile(input)];
  }
}
```

- [ ] **Step 4:** Run `pnpm test:unit builder/generate/TemplateGenerator.unit.test.ts` → PASS (6 tests). Then `pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5:** Commit:

```bash
git add builder/generate/TemplateGenerator.ts builder/generate/TemplateGenerator.unit.test.ts
git commit -m "feat(builder): deterministic template generator (spec + page object)"
```

---

### Task 5: CLI (`pnpm build-tests`) + README

**Files:**
- Create: `builder/args.ts`, `builder/cli.ts`
- Modify: `README.md`
- Test: `builder/args.unit.test.ts`

**Interfaces:**
- Consumes: `selectJourneys` (Task 3), `TemplateGenerator` (Task 4), `PlanReport` (planner), `FunctionalMap` (explorer).
- Produces: `pnpm build-tests [--top <n>=3] [--proposals <path>] [--map <path>] [--out <dir>]`.

- [ ] **Step 1: Write the failing test** — `builder/args.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseBuildArgs } from './args';

describe('parseBuildArgs', () => {
  it('provides defaults', () => {
    expect(parseBuildArgs([])).toEqual({
      top: 3, proposals: 'reports/planner/proposals.json', map: 'coverage/functional-map.json', out: 'tests/generated',
    });
  });
  it('parses flags', () => {
    expect(parseBuildArgs(['--top', '5', '--proposals', 'p.json', '--map', 'm.json', '--out', 'o']))
      .toEqual({ top: 5, proposals: 'p.json', map: 'm.json', out: 'o' });
  });
  it('rejects a non-positive --top', () => {
    expect(() => parseBuildArgs(['--top', '0'])).toThrow(/--top/);
  });
});
```

- [ ] **Step 2:** Run `pnpm test:unit builder/args.unit.test.ts` → FAIL (cannot resolve `./args`).

- [ ] **Step 3: Implement** — `builder/args.ts`:

```ts
export interface BuildArgs {
  top: number;
  proposals: string;
  map: string;
  out: string;
}

export function parseBuildArgs(argv: string[]): BuildArgs {
  const args: BuildArgs = { top: 3, proposals: 'reports/planner/proposals.json', map: 'coverage/functional-map.json', out: 'tests/generated' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--proposals') args.proposals = argv[++i] ?? args.proposals;
    else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
```

- [ ] **Step 4: Implement the CLI** — `builder/cli.ts`:

```ts
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseBuildArgs } from './args';
import { selectJourneys } from './select';
import { TemplateGenerator } from './generate/TemplateGenerator';
import type { FunctionalMap } from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';

async function readJson<T>(path: string, producedBy: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    throw new Error(`Cannot read ${path} — run \`${producedBy}\` first.`);
  }
}

async function main(): Promise<void> {
  const args = parseBuildArgs(process.argv.slice(2));
  const report = await readJson<PlanReport>(args.proposals, 'pnpm plan');
  const map = await readJson<FunctionalMap>(args.map, 'pnpm explore --update');

  const { journeys, skipped } = selectJourneys(report, map, args.top);
  for (const s of skipped) console.warn(`Skipped ${s.flowId}: ${s.reason}`);

  if (journeys.length === 0) {
    console.error('No specs generated: no eligible proposals (see skips above, or re-run `pnpm plan`).');
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
  console.log(`Generated ${journeys.length} journey spec(s) into ${args.out}/ — review, run with \`pnpm test:generated\`, promote by moving into tests/<domain>/.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 5:** Run `pnpm test:unit builder/args.unit.test.ts` → PASS (3 tests). Then `pnpm typecheck && pnpm lint && pnpm test:unit` → all green.
- [ ] **Step 6: Offline smoke** — generate against the real committed map with a synthetic proposals file, then verify the generated code type-checks and lints:

```bash
pnpm plan   # regenerates reports/planner/proposals.json from the committed map + evidence (offline)
pnpm build-tests --top 2
pnpm typecheck && pnpm lint
```

Expected: 2 spec + page-object pairs under `tests/generated/`, both checks green (tsconfig/ESLint pick the generated files up automatically), `git status` shows no new tracked files (`tests/generated/` ignored). Delete nothing — the drafts stay for Task 6.

- [ ] **Step 7: Update the README** — after the Coverage Planner section, add:

```markdown
## Builder Engine

Generates runnable Playwright navigation specs (+ minimal page objects imitating the
POM/COM contracts) from the planner's top-ranked uncovered journeys.

```bash
pnpm plan                  # produces reports/planner/proposals.json
pnpm build-tests --top 3   # writes drafts into tests/generated/ (gitignored)
pnpm test:generated        # runs ONLY the drafts (excluded from pnpm test)
```

Drafts are deterministic (same inputs → identical files) and never join the suite
automatically: review, run, then promote by moving into `tests/<domain>/` and committing.
Checkout-looking routes are skipped by path.
```

- [ ] **Step 8:** Commit:

```bash
git add builder/args.ts builder/args.unit.test.ts builder/cli.ts README.md
git commit -m "feat(builder): pnpm build-tests CLI with skip reporting and weak-signal notes"
```

---

### Task 6: Live validation (DEFERRED-live, requires VPN)

- [ ] **Step 1:** Fresh inputs: `pnpm plan` (offline; warns the map is newer than the evidence — fine, journeys come from the map). Then `pnpm build-tests --top 3` — inspect the drafts: chains match the top-3 proposals, headers carry flowId + map generatedAt, loaded signals reference real elements.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test:unit` → all green with the drafts present.
- [ ] **Step 3:** `pnpm test:generated` against DES (VPN active). **Success criterion: at least one generated spec passes exactly as generated.** For failures, distinguish DES environment noise (findings §7 — retry once) from generator defects (fix the template/selection, regenerate, re-run; add the offline regression test for whatever was wrong).
- [ ] **Step 4:** Update docs: findings doc (new dated section: which drafts ran/passed, chain-walk behaviour vs the gender gate, weak-signal notes), roadmap (M6 ✅ in milestones + phase-5 row + "Where a fresh session resumes"), backlog (D14: proposals now have an automated consumer; note any new leads found live).
- [ ] **Step 5:** Commit docs (generated drafts stay untracked):

```bash
git add docs/
git commit -m "docs(builder): live validation findings; M6 builder engine closed"
```

---

## Self-review notes

- Spec coverage: seam interface → Task 3; selection incl. ranking/stale-skip/checkout-guard/loaded-signal priority → Task 3; deterministic naming → Task 2; templates + header + determinism + main-fallback → Task 4; CLI + fail-fast + exit-1 + weak-signal notes → Task 5; isolation (`gitignore`/`testIgnore`/`test:generated`) → Task 1; README → Task 5; live criterion → Task 6. Non-goals respected (no LLM impl, no fixture registration, no auto-promotion, no CI wiring).
- Type consistency: `JourneyInput`/`GeneratedFile`/`Generator` defined once (Task 3) and consumed by Tasks 4–5 with matching signatures; `selectJourneys(report, map, top): Selection` matches the CLI call; naming functions used by TemplateGenerator match Task 2's exports. `SelectorHints` has no `placeholder` field (checked against `explorer/types.ts`), so the loaded-signal priority implements testId → role → label; the spec's placeholder tier simply can't occur — noted here deliberately.
- Determinism: headers use `mapGeneratedAt`; file names use stable flowId hashes; selection and signal choice follow map order; templates contain no clocks or randomness.
