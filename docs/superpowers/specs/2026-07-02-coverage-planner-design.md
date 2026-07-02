# Coverage Planner Design (Planning Agent, Phase 4)

**Date:** 2026-07-02
**Status:** Approved (design)
**Scope:** Milestone M5 of the platform roadmap — the Coverage + Test Generator *planning* half of Phase 4. Consumes the functional map's multi-step flows (M4, schema 1.1) plus execution evidence from the Playwright suite, annotates flows with `coveredBy`, reports journey coverage, and proposes what to validate next. **Generating test code is explicitly out of scope** — that is the Builder Engine (M6, Phase 5), which will consume this agent's proposals.

---

## Context

The platform now has persistent knowledge of DES (152 flows, 74 real multi-step navigation chains) but no notion of which of those journeys the existing test suite actually exercises. The foundation spec mandates that coverage be measured by **user journeys / business processes, never code lines or test counts**. This sub-project closes that loop deterministically: real execution evidence in, annotated knowledge + ranked proposals out.

### Decisions locked during brainstorming

- **Scope:** coverage annotation + coverage report + ranked test proposals. No code generation (M6).
- **Mechanism:** **execution evidence, not static analysis.** The suite's specs navigate through page objects with no literal URLs (by framework rule), so parsing spec files would require a hand-maintained page-object→page mapping — exactly the hardcoded knowledge the platform exists to eliminate. Instead, the normal `pnpm test` run records the URLs each test actually visited; coverage is what *demonstrably happened*, and it decays automatically when a spec stops passing or stops visiting a page. This is also the seed of the Phase-8 Continuous Learning loop (run results feeding the map).

---

## 1. Location & reuse

- New sub-project: `planner/` (mirrors `explorer/`), CLI via `pnpm plan` (`tsx planner/cli.ts`).
- **Reuses without duplication:** `routePattern`/`normalizePath` from `explorer/url.ts` (URL→pattern normalization identical to what built the map — like-for-like matching), `FunctionalMap`/`MapFlow` types from `explorer/map/schema.ts`, `loadEnv` conventions.
- **Touches the framework in exactly one place:** evidence collection hooks into `src/fixtures/test.ts` (auto-fixture) + a lightweight custom reporter registered in `playwright.config.ts`.
- No POM/COM, crawler, or extractor changes.

## 2. Units

### 2.1 Evidence collector
- An **auto-fixture** in `src/fixtures/test.ts` subscribes to frame navigations on the test's page and attaches the ordered URL list to the test result (Playwright attachment).
- A small **custom reporter** (`planner/evidence/reporter.ts`, registered alongside the existing html/json/list reporters) aggregates per-test attachments into `reports/route-evidence.json` (gitignored):

```jsonc
{
  "generatedAt": "<ISO-8601>",
  "tests": [
    { "spec": "tests/cart/add-to-cart.spec.ts", "title": "adding a product updates the mini cart",
      "status": "passed", "urls": ["https://…/", "https://…/es/h-woman.html", "https://…/es/q/camiseta", "…"] }
  ]
}
```

- Evidence is produced by the **normal `pnpm test` run** — no separate execution mode. `auth.setup.ts` is excluded (it imports raw `@playwright/test`, not the custom fixture, and setup isn't coverage).

### 2.2 Coverage annotator (`planner/coverage/`)
- Normalizes every evidence URL with `normalizePath` + `routePattern` (the Explorer's own functions).
- **A flow is covered by a test iff the flow's steps' routePatterns appear as an ordered subsequence of that test's visited-pattern sequence.** Subsequence, not exact match: gates, redirects, and intermediate pages between steps don't break the match.
- **Only `status: "passed"` tests count** (for retried tests, the passing attempt). A red spec proves nothing.
- **Session simplification (v1, explicit and revisable):** flow steps are session-scoped page ids, but matching is by routePattern; a test that walks a chain annotates **both** session variants of it. Reliably detecting which session a test ran under is fragile today; v1 coverage measures journeys-by-route. Revisit if/when the Coverage agent needs session-accurate numbers.
- Writes `coveredBy: string[]` (spec file paths, sorted, deduped) onto every `MapFlow`. **After an `--update`, every flow carries the field** — empty array means "evaluated, uncovered"; a missing field can only mean a pre-1.2 map.
- **Schema `1.1 → 1.2`** (`MapFlow.coveredBy: string[]`, additive).

### 2.3 Proposal generator (`planner/propose/`)
- Input: the annotated flows. Uncovered flows (`coveredBy.length === 0`) ranked by `priority` (high → med → low), then by chain depth (longer journeys first — more behavior per test), then by name (deterministic ties).
- Output: `reports/planner/proposals.json` (gitignored — regenerable; the durable knowledge is the map's `coveredBy`) with, per proposal: flow id, human-readable name (the path chain), priority, steps, and a one-line deterministic rationale (`"high-priority 3-step journey, no spec exercises it"`). Plus a console summary: covered/uncovered counts by priority, top-N proposals.
- Deterministic, no LLM in M5. The Explorer's pluggable-classifier pattern is the reference if reasoning ever needs one.

### 2.4 CLI (`planner/cli.ts`)
- `pnpm plan` (default `--report`): read-only — loads map + evidence, prints coverage summary and top proposals, writes `reports/planner/proposals.json`. Exit 0.
- `pnpm plan --update`: additionally writes the annotated map back to `coverage/functional-map.json` (reviewable git diff, same convention as `pnpm explore --update`).
- Flags: `--map <path>` (default `coverage/functional-map.json`), `--evidence <path>` (default `reports/route-evidence.json`), `--top <n>` (default 10).

## 3. Error handling & guards

- Missing/unreadable map or evidence file → fail fast with a message pointing to the producing command (`pnpm explore --update` / `pnpm test`).
- **Empty-evidence guard** (lesson from the VPN-drop incident): `--update` refuses (exit 1) if the evidence contains zero passed tests — never strip real `coveredBy` data because a run produced nothing.
- Freshness: the report prints both `generatedAt` stamps and warns when the map is newer than the evidence (coverage may be stale relative to the map).
- The default mode never mutates anything.

## 4. Testing

- **Offline (vitest):** subsequence matcher (covered / not covered / interleaved-noise / order-violation cases); annotator (schema bump, empty-array semantics, both-session annotation, determinism); proposal ranking (priority → depth → name); reporter's aggregation logic as a pure function over fake test-result shapes.
- **DEFERRED-live (VPN):** run the real suite to produce evidence, then `pnpm plan --update`; expected result with today's suite: the login, search→PLP→PDP, and add-to-cart journeys annotate their corresponding flows, everything else surfaces as proposals. Findings recorded in the findings doc; annotated map committed.

## 5. Non-goals

- Test code generation (M6 — consumes `proposals.json`).
- Session-accurate coverage (v1 simplification above).
- LLM-assisted reasoning or proposal wording.
- CI wiring for `pnpm plan` (follow-up once the flow is proven manually; would chain after the scheduled `explore` job).
- Element/form-level coverage — journeys only, per the foundation's coverage definition.

## 6. Risks

- **Evidence fixture overhead:** listening to navigations is passive; attachment size is a few KB per test. No measurable suite impact expected; verified during live validation.
- **Route-pattern drift:** matching depends on `routePattern()` behaving identically for map and evidence — guaranteed by importing the same function, and unit-tested with real patterns from the committed map.
- **DES noise:** dead loads / degraded shells (findings §7) can make a passing test's URL trail unusual; subsequence semantics plus passed-only filtering keep false *positives* unlikely (false negatives just leave a flow uncovered until the next good run).
