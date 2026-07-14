# Phase 6 — Risk Analysis Agent: Failure Analyzer + diff risk-scoring (design)

**Date:** 2026-07-14
**Status:** Approved via Jorge's /goal directive (autonomous execution, decision-log-audited). Companion decision log: `docs/superpowers/notes/2026-07-14-phase6-decision-log.md`.
**Phase gate:** Phase 6 of the platform roadmap (`docs/roadmap/2026-07-02-platform-roadmap.md` §1) — "Risk Analysis Agent: Failure Analyzer (+ risk-scoring of map diffs). Traces/videos/JSON results are already captured by default as its inputs."
**North Star:** Reasoning (failure classification, risk ranking) + Autonomy (no human needed to triage a red run or eyeball a diff).

---

## 1. What this is

A new top-level sub-project, `analyzer/`, joining the existing four (`src/`+`tests/`, `explorer/`, `planner/`, `builder/`). It has two halves sharing one CLI (`pnpm analyze`):

- **(a) Failure Analyzer** — consumes `reports/results.json` (Playwright's JSON reporter output — the seam deliberately emitted since day one and never consumed until now, roadmap §2) and classifies every failed/flaky test into a deterministic taxonomy grounded in the failure signatures this project has actually observed live (findings doc §7/§14/§16/§18). Links each failure back to the Knowledge Graph: the map flows whose `coveredBy` names the failing spec.
- **(b) Risk-scoring engine** — consumes a map diff (`explorer/diff/differ.ts`'s `MapDiff`, computed between a baseline map and the current one) plus the annotated map (`coveredBy`, `pageType`, `priority`) plus the Failure Analyzer's output (failure history), and assigns each diff entry a deterministic risk score + band, ranked.

Both outputs are report artifacts (`reports/analyzer/*.json`), NOT map mutations — feeding results back *into* the map is Phase 8 (Continuous Learning), explicitly out of scope here.

## 2. Data flow (which existing contracts it consumes)

```
pnpm test / pnpm test:generated
        └─> reports/results.json          (Playwright JSON reporter — typed with Playwright's own JSONReport types)
coverage/functional-map.json              (schema 1.7; coveredBy from pnpm plan --update)
        └─> pnpm analyze                  ── writes ──> reports/analyzer/failure-report.json
a baseline map (e.g. git-committed copy)
        └─> pnpm analyze --risk <path>    ── also writes ──> reports/analyzer/risk-report.json
                                              (diff via explorer's diffMaps; history via failure-report)
```

Dependency direction stays one-way and clean: `analyzer/` imports from `explorer/` (schema, differ) only — never from `planner/` or `builder/`, and nothing imports `analyzer/`.

## 3. Failure Analyzer

### 3.1 Input parsing

`reports/results.json` is typed with Playwright's exported `JSONReport`/`JSONReportSuite`/`JSONReportTest`/`JSONReportTestResult` (from `@playwright/test/reporter`, verified re-exported in the installed 1.61.0). Suites nest; a recursive walk flattens to `(file, specTitle, test)` triples. Error messages carry ANSI color codes in the JSON report — stripped before classification.

### 3.2 Classification taxonomy (deterministic, first-match, RuleClassifier precedent)

Categories, checked in this order (most specific first), each anchored to a **real, observed** signature — the exact diagnostic strings the framework's own page objects throw, or documented live failure shapes:

| # | Category | Signature anchor (real source) |
|---|---|---|
| 1 | `infrastructure` | `net::ERR_*`, `ENOTFOUND`, `ECONNREFUSED`, "Cannot navigate to invalid URL" — VPN/DNS drops (findings §21, §8 bug 1) |
| 2 | `catalog-drift` | "no standard-add-to-cart product found … (all variants Personalizable or out-of-stock?)" — `SearchResultsPage.ts:62`, the A5 family (findings §18) |
| 3 | `environment-noise` | "dead /q/ load" (`SearchResultsPage.ts:66`), "did not reach the /q/ results URL" (`SearchBar.ts:51`), "size-selection dialog did not open" (`ProductPage.ts:30`), "size dialog did not close" (`ProductPage.ts:50`), "did not navigate to a product detail page" (`ProductCard.ts:28`) — the documented DES pre-prod noise class the test-level retry exists for (§7/§14/§16/§18) |
| 4 | `selector-drift` | "strict mode violation" (the B16/M9 family, §16/§17/§20), or an action/wait timeout carrying "waiting for locator/getBy…" (the A6 family: the awaited element no longer exists, §19) |
| 5 | `assertion` | `expect(…)`/`expect.poll` failure text — the page loaded but observed state ≠ expected (behavior change) |
| 6 | `timeout` | generic "Test timeout of Nms exceeded" with none of the above — undiagnosable from the message alone |
| 7 | `unknown` | anything else |

A second, orthogonal dimension comes free from Playwright's retry data: **persistence** — `transient` (test status `flaky`: failed then passed on retry — the environment-noise pattern `retries: 1` exists for) vs `persistent` (status `unexpected`: failed all attempts — the A5/A6 pattern that needs a human or a healing agent). Per-attempt categories are recorded; the record's headline category is the **last failing attempt's** (the one that exhausted retries — most informative).

### 3.3 Knowledge Graph linkage

For each failing spec, `flowsAffected` = the map flows whose `coveredBy` includes that spec path (suffix-boundary match: the JSON report's `file` is testDir-relative, `coveredBy` entries are cwd-relative posix — see decision log D7). This is the evidence→map linkage F18 restored, now consumed in the failure direction: a red spec names exactly which known journeys are impacted.

### 3.4 Output — `reports/analyzer/failure-report.json`

```ts
type FailureCategory = 'infrastructure' | 'catalog-drift' | 'environment-noise'
  | 'selector-drift' | 'assertion' | 'timeout' | 'unknown';

interface FailureAttempt { retry: number; status: string; durationMs: number; category: FailureCategory; message?: string }
interface FailureRecord {
  spec: string; title: string; projectName: string;
  outcome: 'failed' | 'flaky';
  persistence: 'persistent' | 'transient';
  category: FailureCategory;         // last failing attempt's
  attempts: FailureAttempt[];        // failing attempts only
  flowsAffected: string[];           // MapFlow ids via coveredBy
}
interface FailureReport {
  generatedAt: string; resultsPath: string; mapGeneratedAt: string;
  totals: { tests: number; passed: number; failed: number; flaky: number; skipped: number };
  byCategory: Record<FailureCategory, number>;
  failures: FailureRecord[];
  affectedFlowIds: string[];         // union, the risk engine's history input
}
```

## 4. Risk-scoring engine

### 4.1 Inputs

- `MapDiff` from `diffMaps(baseline, current)` — reusing the explorer's differ verbatim (it already covers all six entity kinds including `interactions`, F2).
- The current map (entity resolution: pageType, coveredBy, priority, selector hints). Removed entities resolve against the baseline map instead (they no longer exist in the current one).
- The `FailureReport` (optional at the API level; the CLI always computes it first) — `affectedFlowIds` drives the failure-history signal.

### 4.2 Scoring signals (the DoD's "criterios reales", each grounded in repo evidence)

Deterministic weighted sum, clamped to [0, 1]. All weights in one exported const table (single point of change). Per entry, `reasons[]` names every signal that fired — a score is explainable or it is worthless.

| Signal | Values | Grounding |
|---|---|---|
| **Change kind** (base) | removed 0.50 · changed 0.35 · added 0.15 | Removals break existing selectors/specs outright; changes may; additions are new knowledge (the CI diff gate already watches those — C12) |
| **Entity kind** | flow 0.20 · interaction 0.18 · page 0.15 · element 0.10 · form 0.08 · component 0.05 | Flows are what specs are generated from (M6b/M9); interactions are the hardest-won knowledge class (M8/M8b — invisible to passive crawling) |
| **Page-type criticality** | Checkout 0.15 · Cart 0.12 · PDP 0.10 · PLP 0.06 · Search/Home/Account 0.05 · Wishlist 0.03 · Other 0.00 | D15: checkout/payment are the highest-risk flows; Cart/PDP carry the purchase path. Entity→page resolution: page = itself; element/form/interaction = `pageId`; flow = leaf step |
| **Coverage impact** | +0.15 when the entity is a covered flow, or its page is a step of a covered flow | A `coveredBy`-linked flow has a real green spec walking it — a change there is regression surface, not just map churn (F18's restored linkage, consumed) |
| **Flow priority** (flows only) | high +0.10 · med +0.05 · low +0 | Reuses `MapFlow.priority` — the planner's existing ranking vocabulary |
| **Failure history** | +0.15 when the entity is an affected flow, or its page is a step of one | The Failure Analyzer's `affectedFlowIds` — "historial de fallos del módulo tocado", the (a)→(b) integration |
| **Element modifiers** (elements only) | destructive +0.05 · testId-bearing +0.05 | Destructive elements guard state-changing actions; testId-bearing elements are what generated specs assert on (M7/B16) |

### 4.3 Bands

`high` ≥ 0.70 · `med` ≥ 0.40 · `low` < 0.40. The 0.70 cut mirrors the repo's only existing confidence threshold (`autoThreshold: 0.7`, `explorer/config.ts`).

Sanity anchors (verified in unit tests): a removed, covered, high-priority Checkout flow with failure history ⇒ 1.0 `high`. An added `Other`-page element with no modifiers ⇒ 0.25 `low`. A changed covered PDP flow ⇒ ~0.80 `high` (changed covered flows are exactly what breaks existing green specs).

### 4.4 Output — `reports/analyzer/risk-report.json`

```ts
interface RiskEntry {
  kind: DiffKind; id: string; change: 'added' | 'removed' | 'changed';
  score: number; band: 'high' | 'med' | 'low'; reasons: string[];
}
interface RiskReport {
  generatedAt: string; baselineGeneratedAt: string; currentGeneratedAt: string;
  totals: Record<'high' | 'med' | 'low', number>;
  entries: RiskEntry[];              // sorted score desc, then kind/id for determinism
}
```

## 5. CLI — `pnpm analyze` (`tsx analyzer/cli.ts`)

- Default run: read `reports/results.json` (`--results` override; fail-fast "run `pnpm test` first" — planner CLI idiom) + `coverage/functional-map.json` (`--map` override; fail-fast "run `pnpm explore --update` first"); write `reports/analyzer/failure-report.json`; print totals, per-category counts, affected flows.
- `--risk <baselineMapPath>`: additionally diff baseline→current map, score, write `reports/analyzer/risk-report.json`, print band totals + top `--top` (default 10) entries with reasons.
- Guard: a results file with 0 tests is refused (suspicious input — the empty-evidence/empty-map guard precedent).

## 6. Deliberately NOT in scope

- No map schema change; no map mutation (Phase 8's job).
- No LLM classification path (rules-first precedent: `EXPLORER_MODE=rules` was used in every live crawl ever run; an LLM tier can be added behind the same interface later if signatures prove insufficient).
- No selector healing, no auto-fixing, no orchestration (Phases 7–9, prohibited by the goal).
- No new Playwright reporter — the JSON reporter output is already there; the analyzer is a pure consumer.

## 7. Testing

TDD; unit tests only (the analyzer is pure JSON-in/JSON-out — no live surface):
- `classify.unit.test.ts` — every taxonomy rule with its real signature string (taken verbatim from the page objects/findings), order-sensitivity cases (e.g. a strict-mode message that also contains "Timed out"), ANSI stripping, unknown fallback.
- `analyze.unit.test.ts` — suite flattening (nested suites), flaky vs failed vs passed vs skipped, per-attempt categories, last-failing-attempt headline, coveredBy suffix matching, empty-failure happy path, 0-test guard.
- `score.unit.test.ts` — each signal in isolation, the §4.3 sanity anchors, clamping, removed-entity resolution against baseline, deterministic ordering.
- `args.unit.test.ts` — flag parsing incl. validation errors (planner `args.unit.test.ts` template).

Wiring additions (all additive): `vitest.config.ts` include + `tsconfig.json` include + `package.json` script. Regression gate: full `pnpm test:unit` + `pnpm typecheck` + `pnpm lint`; the phases-0-5 e2e suite (`pnpm test`) attempted if DES is reachable.
