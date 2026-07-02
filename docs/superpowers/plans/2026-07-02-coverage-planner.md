# Coverage Planner Implementation Plan (M5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `pnpm plan` CLI that annotates the functional map's flows with `coveredBy` (from real execution evidence recorded during `pnpm test`) and ranks uncovered flows into test proposals.

**Architecture:** Evidence collection touches the framework in exactly one place (an auto-fixture in `src/fixtures/test.ts` + a custom reporter aggregating to `reports/route-evidence.json`). A new `planner/` sub-project (mirroring `explorer/`) matches evidence URL sequences — normalized with the Explorer's own `routePattern` — as ordered subsequences against flow step chains, writes `coveredBy` (schema `1.1 → 1.2`), and emits ranked proposals.

**Tech Stack:** TypeScript strict, Playwright reporter API, Vitest (offline). Live validation (real evidence) is DEFERRED to the final task (VPN).

**Design spec:** `docs/superpowers/specs/2026-07-02-coverage-planner-design.md`

## Global Constraints

- `pnpm typecheck` (strict, no `any`) and `pnpm lint` (no import cycles) pass after every task; unit tests offline/deterministic.
- Coverage counts **only `status === 'passed'`** test results; a flow is covered iff its steps' routePatterns are an **ordered subsequence** of a passing test's visited-pattern sequence.
- Session simplification v1: matching is by routePattern; both session variants of a chain get annotated (per spec §2.2).
- After `pnpm plan --update`, **every** flow carries `coveredBy` (empty array = evaluated, uncovered).
- `--update` refuses (exit 1) when evidence has zero passed tests; default mode never mutates anything.
- Reuse `normalizePath`/`routePattern` from `explorer/url.ts` — never reimplement.

---

### Task 1: Scaffold + schema 1.2

**Files:**
- Modify: `package.json` (script), `tsconfig.json` (include), `vitest.config.ts` (include), `explorer/map/schema.ts`, `explorer/map/builder.unit.test.ts` (version assertion)
- Create: `planner/types.ts`

**Interfaces:**
- Produces (consumed by every later task):
  - `explorer/map/schema.ts`: `SCHEMA_VERSION = '1.2'`; `MapFlow` gains `coveredBy?: string[]` (optional: absent in freshly built maps, present after `plan --update`).
  - `planner/types.ts`:
    ```ts
    export interface EvidenceTestEntry { spec: string; title: string; status: string; urls: string[] }
    export interface RouteEvidence { generatedAt: string; tests: EvidenceTestEntry[] }
    ```
  - `package.json` scripts: `"plan": "tsx planner/cli.ts"`.

- [ ] **Step 1:** Add `"plan": "tsx planner/cli.ts"` to `package.json` scripts; add `"planner"` to `tsconfig.json` `include`; change vitest `include` to `['src/**/*.unit.test.ts', 'explorer/**/*.unit.test.ts', 'planner/**/*.unit.test.ts']`.
- [ ] **Step 2:** In `explorer/map/schema.ts`: set `SCHEMA_VERSION = '1.2'` and add `coveredBy?: string[]; // spec file paths; present after plan --update (empty = evaluated, uncovered)` to `MapFlow`.
- [ ] **Step 3:** In `explorer/map/builder.unit.test.ts`, change `expect(a.schemaVersion).toBe('1.1')` to `'1.2'`.
- [ ] **Step 4:** Create `planner/types.ts` with the two interfaces above.
- [ ] **Step 5:** Run `pnpm typecheck && pnpm lint && pnpm test:unit` — all green (97 tests; the version assertion now matches).
- [ ] **Step 6:** Commit:
```bash
git add package.json tsconfig.json vitest.config.ts explorer/map/schema.ts explorer/map/builder.unit.test.ts planner/types.ts
git commit -m "feat(planner): scaffold, schema 1.2 with optional MapFlow.coveredBy"
```

---

### Task 2: Evidence collection (aggregate + reporter + fixture)

**Files:**
- Create: `planner/evidence/aggregate.ts`, `planner/evidence/reporter.ts`
- Modify: `src/fixtures/test.ts`, `playwright.config.ts`
- Test: `planner/evidence/aggregate.unit.test.ts`

**Interfaces:**
- Consumes: `RouteEvidence`/`EvidenceTestEntry` (Task 1).
- Produces:
  - `aggregate.ts`: `interface RawResult { specFile: string; title: string; status: string; attachmentBody?: string }`; `function aggregateEvidence(results: RawResult[], now: string): RouteEvidence` — pure, testable.
  - `reporter.ts`: default-export Playwright `Reporter` writing `reports/route-evidence.json` on `onEnd`.
  - Fixture: auto `routeEvidence` recording main-frame navigations per test, attached as `'route-evidence'`.

- [ ] **Step 1: Write the failing test** — `planner/evidence/aggregate.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregateEvidence } from './aggregate';

const NOW = '2026-07-02T20:00:00Z';

describe('aggregateEvidence', () => {
  it('keeps entries with a parseable attachment and their status', () => {
    const e = aggregateEvidence([
      { specFile: 'tests/auth/login.spec.ts', title: 'logs in', status: 'passed', attachmentBody: '["https://x/","https://x/es/logon.html"]' },
      { specFile: 'tests/cart/add-to-cart.spec.ts', title: 'adds', status: 'failed', attachmentBody: '["https://x/"]' },
    ], NOW);
    expect(e.generatedAt).toBe(NOW);
    expect(e.tests).toEqual([
      { spec: 'tests/auth/login.spec.ts', title: 'logs in', status: 'passed', urls: ['https://x/', 'https://x/es/logon.html'] },
      { spec: 'tests/cart/add-to-cart.spec.ts', title: 'adds', status: 'failed', urls: ['https://x/'] },
    ]);
  });
  it('skips entries without an attachment (e.g. auth.setup, which uses the raw base test)', () => {
    const e = aggregateEvidence([{ specFile: 'tests/auth.setup.ts', title: 'authenticate', status: 'passed' }], NOW);
    expect(e.tests).toEqual([]);
  });
  it('skips entries whose attachment is not valid JSON', () => {
    const e = aggregateEvidence([{ specFile: 's.ts', title: 't', status: 'passed', attachmentBody: 'not-json' }], NOW);
    expect(e.tests).toEqual([]);
  });
  it('normalizes Windows path separators in spec paths', () => {
    const e = aggregateEvidence([{ specFile: 'tests\\cart\\add-to-cart.spec.ts', title: 't', status: 'passed', attachmentBody: '[]' }], NOW);
    expect(e.tests[0].spec).toBe('tests/cart/add-to-cart.spec.ts');
  });
});
```

- [ ] **Step 2:** Run `pnpm test:unit planner/evidence/aggregate.unit.test.ts` → FAIL (cannot resolve `./aggregate`).

- [ ] **Step 3: Implement** — `planner/evidence/aggregate.ts`:

```ts
import type { RouteEvidence, EvidenceTestEntry } from '../types';

export interface RawResult {
  specFile: string;
  title: string;
  status: string;
  attachmentBody?: string;
}

export function aggregateEvidence(results: RawResult[], now: string): RouteEvidence {
  const tests: EvidenceTestEntry[] = [];
  for (const r of results) {
    if (r.attachmentBody === undefined) continue;
    let urls: string[];
    try {
      const parsed: unknown = JSON.parse(r.attachmentBody);
      if (!Array.isArray(parsed) || !parsed.every((u) => typeof u === 'string')) continue;
      urls = parsed;
    } catch {
      continue;
    }
    tests.push({ spec: r.specFile.replace(/\\/g, '/'), title: r.title, status: r.status, urls });
  }
  return { generatedAt: now, tests };
}
```

- [ ] **Step 4:** Run the test → PASS (4 tests).

- [ ] **Step 5: Create the reporter** — `planner/evidence/reporter.ts`:

```ts
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { aggregateEvidence, type RawResult } from './aggregate';

const OUT_PATH = 'reports/route-evidence.json';

/**
 * Aggregates the per-test 'route-evidence' attachments (written by the routeEvidence
 * auto-fixture in src/fixtures/test.ts) into reports/route-evidence.json, the input the
 * planner CLI matches against the functional map. Retried tests contribute one entry per
 * attempt; the planner only counts status === 'passed'.
 */
export default class RouteEvidenceReporter implements Reporter {
  private readonly results: RawResult[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find((a) => a.name === 'route-evidence');
    this.results.push({
      specFile: relative(process.cwd(), test.location.file),
      title: test.title,
      status: result.status,
      attachmentBody: attachment?.body?.toString('utf8'),
    });
  }

  async onEnd(): Promise<void> {
    const evidence = aggregateEvidence(this.results, new Date().toISOString());
    await mkdir(dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }

  printsToStdio(): boolean {
    return false;
  }
}
```

- [ ] **Step 6: Add the auto-fixture** — in `src/fixtures/test.ts`, extend the `Fixtures` interface and `test.extend`:

```ts
interface Fixtures {
  env: AppEnv;
  homePage: HomePage;
  loginPage: LoginPage;
  searchResultsPage: SearchResultsPage;
  productPage: ProductPage;
  routeEvidence: void;
}
```

and add to the `test.extend({...})` object (after the page-object fixtures):

```ts
  // Records every main-frame navigation and attaches the ordered URL list to the test
  // result; planner/evidence/reporter.ts aggregates the attachments into
  // reports/route-evidence.json for journey-coverage matching (design spec
  // 2026-07-02-coverage-planner-design.md).
  routeEvidence: [async ({ page }, use, testInfo) => {
    const urls: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) urls.push(frame.url());
    });
    await use();
    await testInfo.attach('route-evidence', { body: JSON.stringify(urls), contentType: 'application/json' });
  }, { auto: true }],
```

- [ ] **Step 7: Register the reporter** — in `playwright.config.ts`, add to the `reporter` array:

```ts
    ['./planner/evidence/reporter.ts'],
```

- [ ] **Step 8:** Run `pnpm typecheck && pnpm lint && pnpm test:unit` → all green.
- [ ] **Step 9:** Commit:
```bash
git add planner/evidence/aggregate.ts planner/evidence/aggregate.unit.test.ts planner/evidence/reporter.ts src/fixtures/test.ts playwright.config.ts
git commit -m "feat(planner): route-evidence auto-fixture, reporter, and aggregation"
```

---

### Task 3: Subsequence matcher + URL normalization

**Files:**
- Create: `planner/coverage/match.ts`
- Test: `planner/coverage/match.unit.test.ts`

**Interfaces:**
- Consumes: `normalizePath`, `routePattern` from `explorer/url.ts`.
- Produces (consumed by Task 4):
  - `function urlsToPatterns(urls: string[]): string[]` — normalize each absolute URL to its routePattern, collapsing consecutive duplicates.
  - `function isOrderedSubsequence(needle: string[], haystack: string[]): boolean`.

- [ ] **Step 1: Write the failing test** — `planner/coverage/match.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { urlsToPatterns, isOrderedSubsequence } from './match';

describe('urlsToPatterns', () => {
  it('normalizes absolute URLs to route patterns and collapses consecutive duplicates', () => {
    expect(urlsToPatterns([
      'https://des.example/es/h-woman.html',
      'https://des.example/es/h-woman.html?promo=1',
      'https://des.example/es/camiseta-c0p229723098.html',
    ])).toEqual(['/es/h-woman.html', '/es/camiseta-c0p{id}.html']);
  });
  it('returns an empty list for no urls', () => {
    expect(urlsToPatterns([])).toEqual([]);
  });
});

describe('isOrderedSubsequence', () => {
  const trail = ['/', '/es/h-woman.html', '/es/q/camiseta', '/es/x-c0p{id}.html', '/es/shop-cart.html'];
  it('matches the full trail', () => {
    expect(isOrderedSubsequence(trail, trail)).toBe(true);
  });
  it('matches with interleaved noise pages', () => {
    expect(isOrderedSubsequence(['/', '/es/q/camiseta', '/es/shop-cart.html'], trail)).toBe(true);
  });
  it('rejects order violations', () => {
    expect(isOrderedSubsequence(['/es/shop-cart.html', '/'], trail)).toBe(false);
  });
  it('rejects steps that never appear', () => {
    expect(isOrderedSubsequence(['/es/wishlist.html'], trail)).toBe(false);
  });
  it('an empty needle is trivially covered', () => {
    expect(isOrderedSubsequence([], trail)).toBe(true);
  });
});
```

- [ ] **Step 2:** Run it → FAIL (cannot resolve `./match`).

- [ ] **Step 3: Implement** — `planner/coverage/match.ts`:

```ts
import { normalizePath, routePattern } from '../../explorer/url';

/** Absolute evidence URLs -> route patterns (the same normalization that built the map),
 *  collapsing consecutive duplicates (query-string changes, in-page re-navigations). */
export function urlsToPatterns(urls: string[]): string[] {
  const patterns: string[] = [];
  for (const url of urls) {
    const p = routePattern(normalizePath(url, url));
    if (patterns[patterns.length - 1] !== p) patterns.push(p);
  }
  return patterns;
}

export function isOrderedSubsequence(needle: string[], haystack: string[]): boolean {
  let i = 0;
  for (const item of haystack) {
    if (i < needle.length && item === needle[i]) i++;
  }
  return i === needle.length;
}
```

- [ ] **Step 4:** Run it → PASS (7 tests). Then `pnpm typecheck && pnpm lint` → exit 0 (also proves `planner → explorer` import introduces no cycle).
- [ ] **Step 5:** Commit:
```bash
git add planner/coverage/match.ts planner/coverage/match.unit.test.ts
git commit -m "feat(planner): route-pattern subsequence matcher"
```

---

### Task 4: Coverage annotator

**Files:**
- Create: `planner/coverage/annotate.ts`
- Test: `planner/coverage/annotate.unit.test.ts`

**Interfaces:**
- Consumes: `urlsToPatterns`/`isOrderedSubsequence` (Task 3); `FunctionalMap` (schema); `RouteEvidence` (Task 1).
- Produces (consumed by Tasks 5–6): `function annotateCoverage(map: FunctionalMap, evidence: RouteEvidence): FunctionalMap` — pure; returns a new map with `schemaVersion: SCHEMA_VERSION` and `coveredBy` (sorted, deduped) on **every** flow.

- [ ] **Step 1: Write the failing test** — `planner/coverage/annotate.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { annotateCoverage } from './annotate';
import type { FunctionalMap } from '../../explorer/map/schema';
import type { RouteEvidence } from '../types';

const map: FunctionalMap = {
  schemaVersion: '1.1', generatedAt: '2026-07-02T18:00:00Z', environment: 'des',
  pages: [
    { id: 'pA', path: '/', routePattern: '/', pageType: 'Home', session: 'anon', title: 'Home', discoveredVia: 'seed' },
    { id: 'pB', path: '/es/shop-cart.html', routePattern: '/es/shop-cart.html', pageType: 'Cart', session: 'anon', title: 'Cesta', discoveredVia: '/' },
    { id: 'pA2', path: '/', routePattern: '/', pageType: 'Home', session: 'auth', title: 'Home', discoveredVia: 'seed' },
    { id: 'pB2', path: '/es/shop-cart.html', routePattern: '/es/shop-cart.html', pageType: 'Cart', session: 'auth', title: 'Cesta', discoveredVia: '/' },
    { id: 'pC', path: '/es/wishlist.html', routePattern: '/es/wishlist.html', pageType: 'Wishlist', session: 'anon', title: 'W', discoveredVia: '/' },
  ],
  components: [], elements: [], forms: [],
  flows: [
    { id: 'fCart', name: '/ -> /es/shop-cart.html', type: 'Cart', session: 'anon', priority: 'high', steps: ['pA', 'pB'] },
    { id: 'fCart2', name: '/ -> /es/shop-cart.html', type: 'Cart', session: 'auth', priority: 'high', steps: ['pA2', 'pB2'] },
    { id: 'fWish', name: '/es/wishlist.html', type: 'Wishlist', session: 'anon', priority: 'high', steps: ['pC'] },
  ],
};

const evidence: RouteEvidence = {
  generatedAt: '2026-07-02T20:00:00Z',
  tests: [
    { spec: 'tests/cart/add-to-cart.spec.ts', title: 'adds', status: 'passed',
      urls: ['https://x/', 'https://x/es/promo-banner.html', 'https://x/es/shop-cart.html'] },
    { spec: 'tests/wish/wishlist.spec.ts', title: 'wishes', status: 'failed',
      urls: ['https://x/es/wishlist.html'] },
  ],
};

describe('annotateCoverage', () => {
  const out = annotateCoverage(map, evidence);

  it('bumps schemaVersion and leaves the input untouched', () => {
    expect(out.schemaVersion).toBe('1.2');
    expect(map.flows[0].coveredBy).toBeUndefined(); // pure: input not mutated
  });
  it('covers a flow when its step patterns are an ordered subsequence of a PASSED test', () => {
    expect(out.flows.find((f) => f.id === 'fCart')?.coveredBy).toEqual(['tests/cart/add-to-cart.spec.ts']);
  });
  it('annotates both session variants of the same chain (v1 session simplification)', () => {
    expect(out.flows.find((f) => f.id === 'fCart2')?.coveredBy).toEqual(['tests/cart/add-to-cart.spec.ts']);
  });
  it('ignores failed tests: every flow still carries coveredBy, empty when uncovered', () => {
    expect(out.flows.find((f) => f.id === 'fWish')?.coveredBy).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run it → FAIL (cannot resolve `./annotate`).

- [ ] **Step 3: Implement** — `planner/coverage/annotate.ts`:

```ts
import { SCHEMA_VERSION, type FunctionalMap } from '../../explorer/map/schema';
import type { RouteEvidence } from '../types';
import { urlsToPatterns, isOrderedSubsequence } from './match';

/**
 * Marks each flow with the specs whose PASSED runs demonstrably walked the flow's step
 * patterns in order (subsequence: interleaved gates/redirects don't break a match).
 * Session simplification v1: matching is by routePattern, so both session variants of the
 * same chain annotate identically (design spec §2.2). Pure — returns a new map.
 */
export function annotateCoverage(map: FunctionalMap, evidence: RouteEvidence): FunctionalMap {
  const patternByPageId = new Map(map.pages.map((p) => [p.id, p.routePattern]));
  const passed = evidence.tests
    .filter((t) => t.status === 'passed')
    .map((t) => ({ spec: t.spec, patterns: urlsToPatterns(t.urls) }));

  const flows = map.flows.map((flow) => {
    const stepPatterns = flow.steps
      .map((id) => patternByPageId.get(id))
      .filter((p): p is string => p !== undefined);
    const coveredBy = [...new Set(
      passed.filter((t) => isOrderedSubsequence(stepPatterns, t.patterns)).map((t) => t.spec),
    )].sort();
    return { ...flow, coveredBy };
  });

  return { ...map, schemaVersion: SCHEMA_VERSION, flows };
}
```

- [ ] **Step 4:** Run it → PASS (4 tests). `pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5:** Commit:
```bash
git add planner/coverage/annotate.ts planner/coverage/annotate.unit.test.ts
git commit -m "feat(planner): evidence-based coverage annotator (coveredBy, schema 1.2)"
```

---

### Task 5: Proposal generator

**Files:**
- Create: `planner/propose/propose.ts`
- Test: `planner/propose/propose.unit.test.ts`

**Interfaces:**
- Consumes: annotated `FunctionalMap` (Task 4 output shape).
- Produces (consumed by Task 6):
  ```ts
  export interface TestProposal { flowId: string; name: string; priority: Priority; session: Session; steps: string[]; rationale: string }
  export interface PlanReport {
    generatedAt: string; mapGeneratedAt: string; evidenceGeneratedAt: string;
    flows: { total: number; covered: number; uncovered: number };
    uncoveredByPriority: Record<Priority, number>;
    proposals: TestProposal[];
  }
  export function buildPlanReport(map: FunctionalMap, evidenceGeneratedAt: string, now: string): PlanReport
  ```

- [ ] **Step 1: Write the failing test** — `planner/propose/propose.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPlanReport } from './propose';
import type { FunctionalMap, MapFlow } from '../../explorer/map/schema';

const flow = (id: string, priority: MapFlow['priority'], steps: string[], coveredBy: string[]): MapFlow => ({
  id, name: id, type: 'Other', session: 'anon', priority, steps, coveredBy,
});

const map: FunctionalMap = {
  schemaVersion: '1.2', generatedAt: '2026-07-02T18:00:00Z', environment: 'des',
  pages: [], components: [], elements: [], forms: [],
  flows: [
    flow('covered-high', 'high', ['a', 'b'], ['tests/x.spec.ts']),
    flow('deep-high', 'high', ['a', 'b', 'c'], []),
    flow('shallow-high', 'high', ['a'], []),
    flow('deep-low', 'low', ['a', 'b', 'c', 'd'], []),
    flow('med', 'med', ['a'], []),
  ],
};

describe('buildPlanReport', () => {
  const r = buildPlanReport(map, '2026-07-02T20:00:00Z', '2026-07-02T21:00:00Z');

  it('counts covered vs uncovered and carries both timestamps', () => {
    expect(r.flows).toEqual({ total: 5, covered: 1, uncovered: 4 });
    expect(r.mapGeneratedAt).toBe('2026-07-02T18:00:00Z');
    expect(r.evidenceGeneratedAt).toBe('2026-07-02T20:00:00Z');
    expect(r.uncoveredByPriority).toEqual({ high: 2, med: 1, low: 1 });
  });
  it('ranks proposals by priority, then chain depth (desc), then name', () => {
    expect(r.proposals.map((p) => p.flowId)).toEqual(['deep-high', 'shallow-high', 'med', 'deep-low']);
  });
  it('writes a deterministic rationale', () => {
    expect(r.proposals[0].rationale).toBe('high-priority 3-step journey, no spec exercises it');
  });
});
```

- [ ] **Step 2:** Run it → FAIL (cannot resolve `./propose`).

- [ ] **Step 3: Implement** — `planner/propose/propose.ts`:

```ts
import type { FunctionalMap, MapFlow, Priority } from '../../explorer/map/schema';
import type { Session } from '../../explorer/types';

export interface TestProposal {
  flowId: string;
  name: string;
  priority: Priority;
  session: Session;
  steps: string[];
  rationale: string;
}

export interface PlanReport {
  generatedAt: string;
  mapGeneratedAt: string;
  evidenceGeneratedAt: string;
  flows: { total: number; covered: number; uncovered: number };
  uncoveredByPriority: Record<Priority, number>;
  proposals: TestProposal[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, med: 1, low: 2 };

function toProposal(flow: MapFlow): TestProposal {
  const stepsWord = flow.steps.length === 1 ? 'page' : `${flow.steps.length}-step journey`;
  return {
    flowId: flow.id,
    name: flow.name,
    priority: flow.priority,
    session: flow.session,
    steps: flow.steps,
    rationale: `${flow.priority}-priority ${stepsWord}, no spec exercises it`,
  };
}

export function buildPlanReport(map: FunctionalMap, evidenceGeneratedAt: string, now: string): PlanReport {
  const uncovered = map.flows.filter((f) => (f.coveredBy ?? []).length === 0);
  const covered = map.flows.length - uncovered.length;

  const uncoveredByPriority: Record<Priority, number> = { high: 0, med: 0, low: 0 };
  for (const f of uncovered) uncoveredByPriority[f.priority]++;

  const proposals = [...uncovered]
    .sort((a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      || b.steps.length - a.steps.length
      || a.name.localeCompare(b.name))
    .map(toProposal);

  return {
    generatedAt: now,
    mapGeneratedAt: map.generatedAt,
    evidenceGeneratedAt,
    flows: { total: map.flows.length, covered, uncovered: uncovered.length },
    uncoveredByPriority,
    proposals,
  };
}
```

- [ ] **Step 4:** Run it → PASS (3 tests). `pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5:** Commit:
```bash
git add planner/propose/propose.ts planner/propose/propose.unit.test.ts
git commit -m "feat(planner): ranked test proposals from uncovered flows"
```

---

### Task 6: CLI (`pnpm plan`)

**Files:**
- Create: `planner/args.ts`, `planner/cli.ts`
- Test: `planner/args.unit.test.ts`

**Interfaces:**
- Consumes: `annotateCoverage` (Task 4), `buildPlanReport` (Task 5), `RouteEvidence` (Task 1).
- Produces: `pnpm plan [--update] [--map <path>] [--evidence <path>] [--top <n>]`.

- [ ] **Step 1: Write the failing test** — `planner/args.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePlanArgs } from './args';

describe('parsePlanArgs', () => {
  it('provides defaults', () => {
    expect(parsePlanArgs([])).toEqual({
      update: false, map: 'coverage/functional-map.json', evidence: 'reports/route-evidence.json', top: 10,
    });
  });
  it('parses flags', () => {
    const a = parsePlanArgs(['--update', '--map', 'm.json', '--evidence', 'e.json', '--top', '3']);
    expect(a).toEqual({ update: true, map: 'm.json', evidence: 'e.json', top: 3 });
  });
  it('rejects a non-positive --top', () => {
    expect(() => parsePlanArgs(['--top', '0'])).toThrow(/--top/);
  });
});
```

- [ ] **Step 2:** Run it → FAIL (cannot resolve `./args`).

- [ ] **Step 3: Implement** — `planner/args.ts`:

```ts
export interface PlanArgs {
  update: boolean;
  map: string;
  evidence: string;
  top: number;
}

export function parsePlanArgs(argv: string[]): PlanArgs {
  const args: PlanArgs = { update: false, map: 'coverage/functional-map.json', evidence: 'reports/route-evidence.json', top: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--update') args.update = true;
    else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--evidence') args.evidence = argv[++i] ?? args.evidence;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
```

- [ ] **Step 4: Implement the CLI** — `planner/cli.ts`:

```ts
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parsePlanArgs } from './args';
import { annotateCoverage } from './coverage/annotate';
import { buildPlanReport } from './propose/propose';
import type { FunctionalMap } from '../explorer/map/schema';
import type { RouteEvidence } from './types';

const PROPOSALS_PATH = 'reports/planner/proposals.json';

async function readJson<T>(path: string, producedBy: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    throw new Error(`Cannot read ${path} — run \`${producedBy}\` first.`);
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parsePlanArgs(process.argv.slice(2));
  const map = await readJson<FunctionalMap>(args.map, 'pnpm explore --update');
  const evidence = await readJson<RouteEvidence>(args.evidence, 'pnpm test');

  const annotated = annotateCoverage(map, evidence);
  const report = buildPlanReport(annotated, evidence.generatedAt, new Date().toISOString());
  await writeJson(PROPOSALS_PATH, report);

  const passedCount = evidence.tests.filter((t) => t.status === 'passed').length;
  console.log(`Coverage: ${report.flows.covered}/${report.flows.total} flows covered (evidence: ${passedCount} passed tests).`);
  console.log(`Uncovered by priority: high=${report.uncoveredByPriority.high} med=${report.uncoveredByPriority.med} low=${report.uncoveredByPriority.low}`);
  if (map.generatedAt > evidence.generatedAt) {
    console.warn('Warning: the map is newer than the evidence — coverage may be stale; re-run `pnpm test`.');
  }
  console.log(`Top proposals (full list in ${PROPOSALS_PATH}):`);
  for (const p of report.proposals.slice(0, args.top)) {
    console.log(`  [${p.priority}] ${p.name} — ${p.rationale}`);
  }

  if (args.update) {
    // Never strip real coveredBy data because a run produced nothing (same lesson as the
    // explorer's empty-map guard: a dropped VPN must not clobber committed knowledge).
    if (passedCount === 0) {
      console.error(`Refusing to update ${args.map}: evidence has 0 passed tests.`);
      process.exitCode = 1;
      return;
    }
    await writeJson(args.map, annotated);
    console.log(`Wrote annotated map to ${args.map}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 5:** Run `pnpm test:unit planner/args.unit.test.ts` → PASS (3 tests). Then `pnpm typecheck && pnpm lint && pnpm test:unit` → all green.
- [ ] **Step 6:** Update the README — after the Explorer Agent section, add:

```markdown
## Coverage Planner

Annotates the functional map with journey coverage from real execution evidence and
proposes what to validate next.

```bash
pnpm test                 # normal run; also writes reports/route-evidence.json
pnpm plan                 # read-only: coverage summary + reports/planner/proposals.json
pnpm plan --update        # additionally writes coveredBy into coverage/functional-map.json
```

A flow counts as covered when a passing test's visited routes contain the flow's steps as
an ordered subsequence. Only passed tests count; `--update` refuses empty evidence.
```

- [ ] **Step 7:** Commit:
```bash
git add planner/args.ts planner/args.unit.test.ts planner/cli.ts README.md
git commit -m "feat(planner): pnpm plan CLI with coverage report and empty-evidence guard"
```

---

### Task 7: Live validation + annotated map commit (DEFERRED-live, requires VPN)

- [ ] **Step 1:** `pnpm exec playwright test` (full suite) — verify `reports/route-evidence.json` exists and contains one entry per test with plausible URL trails; note any fixture overhead.
- [ ] **Step 2:** `pnpm plan` — review the console summary and `reports/planner/proposals.json` (expected with today's suite: the login, search→PLP→PDP and add-to-cart journeys cover their flows; the rest surface as proposals, high-priority Checkout flows near the top).
- [ ] **Step 3:** `pnpm plan --update`, then `git diff coverage/functional-map.json` — verify `schemaVersion: "1.2"`, every flow has `coveredBy`, covered flows reference real spec paths.
- [ ] **Step 4:** Update the findings doc (new dated subsection: evidence quality, which flows matched, surprises), the roadmap (M5 ✅, phase table), and the backlog (C13 partially — flaky tagging still open; D14 now actionable via proposals).
- [ ] **Step 5:** Commit map + docs:
```bash
git add coverage/functional-map.json docs/
git commit -m "feat(planner): first evidence-annotated functional map (M5)"
```

---

## Self-review notes

- Spec coverage: evidence collector → Task 2; matcher/normalization → Task 3; annotator + schema 1.2 + session-v1 + passed-only + empty-array semantics → Task 4; proposals + ranking + rationale → Task 5; CLI + guards + freshness warning + README → Task 6; live validation + annotated map commit → Task 7. Non-goals respected (no codegen, no LLM, no CI wiring).
- Type consistency: `RouteEvidence`/`EvidenceTestEntry` (Task 1) used in Tasks 2/4/6; `RawResult` local to evidence; `annotateCoverage(map, evidence): FunctionalMap` consumed by CLI; `buildPlanReport(map, evidenceGeneratedAt, now)` matches Task 6's call.
- Note: `explore --update` rewrites the map *without* `coveredBy` (builder doesn't set it) — the intended pipeline is `explore --update` → `pnpm test` → `plan --update`; documented in the README block and acceptable because coverage should be re-derived after the map changes anyway.
