# Phase 6 — Decision Log (Risk Analysis Agent)

**Date:** 2026-07-14
**Mode:** autonomous execution under Jorge's /goal directive — decide-and-continue, every non-trivial decision recorded here with question / choice / reason / discarded alternatives.
**Companion design:** `docs/superpowers/specs/2026-07-14-phase6-risk-analysis-design.md`

---

## D1. Model routing: full cycle on Fable 5

- **Question:** CLAUDE.md's model routing policy (2026-07-06) retires Fable 5 ("do not use it for any new spec/plan/doc cycle") and routes implementation to Sonnet 5. Jorge's explicit instruction (2026-07-14, this session) is to run the entire Phase 6 cycle — analysis, docs, plan, implementation — on Fable 5.
- **Chosen:** Follow Jorge's direct instruction; run everything on Fable 5. Recorded here as the goal requires ("inconsistencies are documented, not silently corrected"). CLAUDE.md's policy text is NOT rewritten autonomously — whether this is a one-off exception or a policy change is Jorge's call at review time.
- **Reason:** direct user instruction supersedes repo doc defaults; changing the standing policy doc autonomously would overstep the goal's own inconsistency rule.
- **Discarded:** (a) refusing and routing per CLAUDE.md — contradicts an explicit, informed instruction (the conflict was flagged to Jorge before the goal was set, and he proceeded); (b) silently editing the routing policy — policy changes need the human, not the agent.
- **RESOLVED at gate review (2026-07-14, Jorge):** policy change, not a one-off exception — CLAUDE.md's routing policy is **neutralized until Phase 9 completes**: the full cycle runs on Fable 5. CLAUDE.md updated accordingly; the old split policy is suspended, to be re-evaluated at Phase 9's close.

## D2. Process: design doc + decision log, no separate plan doc

- **Question:** the repo's standing method is brainstorm → spec → plan → implement, with the plan as its own doc. The goal mandates autonomous, non-stopping execution with a decision log.
- **Chosen:** write the spec (design doc) + this decision log; skip a separate plan doc; execute directly with TDD and the session task list as the plan.
- **Reason:** matches the audit Order-1 precedent (findings items "already fully specified" shipped direct-TDD without a fresh plan cycle, audit §3.1); the goal's own iteration-loop instructions *are* the plan; a plan doc no human reviews mid-flight (autonomy mode) adds no safety.
- **Discarded:** full spec→plan cycle — its value is the human checkpoint between docs, which this goal explicitly removes.

## D3. New top-level sub-project `analyzer/`, depending only on `explorer/`

- **Question:** where does Phase 6 code live — inside `planner/` (it also consumes evidence), inside `explorer/` (it reuses the differ), or as a new sub-project?
- **Chosen:** new top-level `analyzer/`, importing only from `explorer/` (map schema + differ). Nothing imports `analyzer/`.
- **Reason:** the repo's architecture is one sub-project per agent (explorer=Knowledge, planner=Planning, builder=Execution — audit §1.1); the roadmap names the Failure Analyzer as its own agent (Phase 6 row). Keeps the one-way dependency chain clean (`src ← explorer ← {planner, builder, analyzer}`).
- **Discarded:** (a) `planner/failures/` — conflates the Planning agent with the Risk agent, and the planner never needs failure data; (b) `explorer/risk/` — the explorer is a producer of knowledge, not a consumer of run results.

## D4. Failure input: `reports/results.json` typed with Playwright's own `JSONReport` types

- **Question:** what artifact feeds the Failure Analyzer, and with what typing?
- **Chosen:** `reports/results.json` (the JSON reporter output wired in `playwright.config.ts` since day one), typed via `import type { JSONReport, … } from '@playwright/test/reporter'` (verified re-exported by the installed Playwright 1.61.0).
- **Reason:** the roadmap explicitly calls this file "the Failure Analyzer / Reporting seam. Deliberately emitted since day one; nothing consumes it yet, by design" — this milestone is that seam's designed consumer. Official types beat a hand-rolled shape (the M7 lesson: shared vocabulary prevents producer/resolver drift). The real file's structure was inspected directly before design (26-test `test:generated` run, 2026-07-13) — suites nest, tests carry `status: expected|unexpected|flaky|skipped`, results carry `retry`/`error`.
- **Discarded:** (a) consuming `reports/route-evidence.json` — it has URL trails but no error/retry data, and it's the planner's contract; (b) a new custom reporter — needless producer when a complete one already runs on every `pnpm test`.

## D5. Classification: deterministic signature rules; no LLM tier in v1

- **Question:** classify failures by rules, LLM, or hybrid?
- **Chosen:** deterministic first-match signature rules (`RuleClassifier` precedent), anchored to the exact diagnostic strings the framework's own page objects throw (grepped from `src/` — `ProductPage.ts:30/50`, `SearchResultsPage.ts:62/66`, `SearchBar.ts:51`, `ProductCard.ts:28`) plus Playwright's own failure shapes (strict-mode violation, locator-wait timeout, expect text). No LLM path.
- **Reason:** most consistent with existing patterns — the explorer's classifier defaults to `rules` and every live crawl ever run used `EXPLORER_MODE=rules`; the framework deliberately throws *distinct, greppable* diagnostics (A5's two-message design in §18 exists precisely so failures are machine-distinguishable). An LLM tier can be added behind the same function signature if real signatures prove insufficient.
- **Discarded:** LLM/auto classification — "better in the abstract", but the goal mandates repo-consistency over abstract preference, and it would add a network dependency + nondeterminism to a unit-testable pure function.

## D6. Taxonomy: 7 categories + orthogonal persistence dimension

- **Question:** what taxonomy? (The goal leaves it open.)
- **Chosen:** `infrastructure`, `catalog-drift`, `environment-noise`, `selector-drift`, `assertion`, `timeout`, `unknown` — checked in that order (most specific first, deterministic-path-before-text-signal per the B13 lesson) — plus **persistence** (`transient` = Playwright `flaky` status, `persistent` = `unexpected`) derived from retry data. Headline category = last failing attempt's.
- **Reason:** every category maps to a real, live-observed failure family in the findings doc (§21 VPN/DNS = infrastructure; §18 A5 = catalog-drift; §7/§14/§16 = environment-noise; §16/§17/§19/§20 strict-mode & gone-element = selector-drift), so classifications are falsifiable against history. Persistence-from-retries consumes the `retries: 1` + per-attempt data that already exists (C13's seam) without building the Reporting Agent.
- **Discarded:** (a) fewer buckets (env-noise vs real) — loses the selector/catalog/assertion distinction Phase 7 (Selector Healing) will need as input; (b) severity levels in the failure report — severity is the risk engine's job, not the classifier's.

## D7. coveredBy ↔ spec-path matching: suffix-boundary match

- **Question:** the JSON report's suite `file` is testDir-relative (`auth/login.spec.ts`), while `MapFlow.coveredBy` entries are cwd-relative posix (`tests/auth/login.spec.ts`, per `planner/evidence/reporter.ts`). How to join them?
- **Chosen:** normalize both to posix; match when `coveredBy` entry === file or ends with `/` + file.
- **Reason:** robust to the testDir prefix without parsing Playwright config; the boundary guard (`/`) prevents `x-login.spec.ts` matching `login.spec.ts`.
- **Discarded:** reading `config.rootDir`/testDir from the JSON report to reconstruct absolute paths — more moving parts, breaks if the report was generated on another machine (CI), and the suffix match is unambiguous within this repo's flat spec layout.

## D8. Risk signals and weights (the DoD's "completar con criterios reales")

- **Question:** which signals feed the diff risk score, with what weights and thresholds?
- **Chosen:** the seven-signal table in design §4.2 — change kind (removed 0.50 > changed 0.35 > added 0.15) + entity kind (flow 0.20 > interaction 0.18 > page 0.15 > element 0.10 > form 0.08 > component 0.05) + pageType criticality (Checkout 0.15 … Other 0.00, per D15's checkout-is-highest-risk) + coverage impact (+0.15, covered flow or page thereof) + flow priority (+0.10/+0.05/0, reusing `MapFlow.priority`) + failure history (+0.15 via the failure report's `affectedFlowIds`) + element modifiers (destructive/testId +0.05 each). Clamp [0,1]; bands high ≥ 0.70 / med ≥ 0.40 (0.70 mirrors `autoThreshold`, the repo's only existing confidence threshold). Weights in one exported const; every fired signal named in `reasons[]`.
- **Reason:** each signal reuses an existing map/report field with documented meaning — nothing is invented (pageType from B13's classifier, coveredBy from F18's restored linkage, priority from the planner's vocabulary, testId presence from M7, failure history from this milestone's own (a)-half). Deterministic and explainable, matching the platform's rules-first doctrine.
- **Discarded:** (a) git-history-based module churn (the goal's example "complejidad del cambio") — the map diff, not the git diff, is this phase's contract; git signals belong to a future engineering-analytics pass; (b) ML/learned weights — nothing to learn from yet (Phase 8's loop doesn't exist); (c) score in the map itself — map mutation is Phase 8, prohibited.

## D9. CLI shape: `pnpm analyze`, failure analysis always, `--risk <baseline>` opt-in

- **Question:** one command or two? What flags?
- **Chosen:** single `analyzer/cli.ts` (`pnpm analyze`). Default = failure analysis (results + map → failure-report.json). `--risk <baselineMapPath>` additionally diffs baseline→current and writes risk-report.json, consuming the failure report just computed. `--results`/`--map`/`--top` overrides mirror `parsePlanArgs`. Fail-fast `readJson` with "run `pnpm X` first" hints (planner idiom). Refuse a 0-test results file (empty-input guard precedent from the explorer's empty-map and planner's empty-evidence guards).
- **Reason:** mirrors the existing one-CLI-per-agent pattern (`pnpm explore/plan/build-tests`); risk needs a baseline the repo can't guess (which older map to compare against is a caller decision — in CI it's the committed map vs a fresh crawl).
- **Discarded:** separate `pnpm analyze-risk` script — two package scripts for one agent breaks the one-command-per-agent symmetry.

## D10. No `analyzer/config.ts` env-config module in v1

- **Question:** explorer has `loadExplorerConfig` (defaults + env + overrides). Does the analyzer need one?
- **Chosen:** no — CLI args only, like the planner (which also has no config module).
- **Reason:** the analyzer has no environment-dependent knobs (no crawl bounds, no browser, no API keys); weights are code constants by design (single reviewed point of change, not per-run tunables). The planner is the closer sibling and it uses args-only.
- **Discarded:** env-tunable weights (`ANALYZER_WEIGHT_*`) — invites silent per-machine divergence in scores; a score only means something if everyone computes it the same way.

## D11. Commits local, no push

- **Question:** the goal doesn't mention git handling; prior session pattern is Conventional Commits + push on explicit ask.
- **Chosen:** commit locally per repo convention; do NOT push. The exit gate requires Jorge's review of this log before the phase is considered closed, so publishing before that review is premature.
- **Reason:** pushing is outward-facing; every prior push in this project was an explicit ask.
- **Discarded:** pushing autonomously — violates the review gate's spirit.

## D12. E2E regression gate: attempted, VPN-dependent, honestly reported

- **Question:** the DoD requires "100% de los tests de las fases 0-5 siguen pasando". The unit suite/typecheck/lint are always runnable; the e2e suite (`pnpm test`) needs the DES VPN.
- **Chosen:** run the full unit+typecheck+lint gate unconditionally; attempt `pnpm test` (with a cheap reachability probe first); if DES is unreachable, report that plainly as an environment limitation, not as a passed gate (RIGOR Regla 7 — the B17 precedent: the session that refused to fabricate crawl results during a VPN drop).
- **Reason:** Phase 6 code is a pure offline JSON consumer — it cannot alter e2e behavior (no `src/`, `tests/`, or config-of-record changes except additive reporter-untouched wiring) — but the gate is only *claimable* if actually run.
- **Discarded:** claiming the e2e gate from the unit gate alone — that is exactly the "marcarlo como resuelto para poder avanzar" the goal prohibits.

## Inconsistencies found in existing code (documented, NOT fixed — per the goal's rule)

- **I1.** `explorer/cli.ts` names its diff baseline `args.out` (the `--out` flag doubles as "where the canonical map lives" and "what to diff against") — slightly misleading naming the analyzer does not inherit (its baseline flag is explicit: `--risk <path>`). No behavior issue.
- **I2.** `planner/coverage/annotate.ts` stamps `SCHEMA_VERSION` unconditionally on whatever map it annotates (already flagged as a minor footgun in the audit §1.2) — noted because the analyzer *reads* `schemaVersion` but deliberately does not validate it strictly (a 1.6 map annotated to claim 1.7 would false-fail a strict check). The analyzer treats the map shape structurally, not by version string.
- **I3.** The committed `reports/results.json` at design time held a `test:generated` run (26 generated specs), not a `pnpm test` run — both configs write the same path (the generated config inherits the base reporter list). Consequence: `pnpm analyze` reports on *whichever suite ran last*. Recorded as expected behavior (the analyzer names its input via `resultsPath` and totals), not silently assumed away.

## Iteration log (goal's max-8 loop)

**Same-failure iterations consumed: 0 of 8.** Every module's unit tests passed on their first run (classify 10/10, analyze 9/9, score 10/10, args 5/5). Two tooling hiccups occurred outside the test loop, both fixed on sight and recorded for honesty:

- The ANSI-stripping regex initially carried a raw ESC control byte in source (would trip `no-control-regex` from `eslint:recommended`); rewritten as `new RegExp('\\u001b\\[[0-9;]*m', 'g')` with a justified disable comment. Caught by inspection before any test/lint run failed.
- A smoke-test helper wrote to a scratchpad directory that didn't exist yet (`ENOENT`) — created it; not analyzer code.

## Verification results (2026-07-14)

- `pnpm test:unit` — **297/297** (263 pre-existing + 34 new analyzer tests). Zero pre-existing tests modified.
- `pnpm typecheck` — clean. `pnpm lint` — clean.
- **Phases 0–5 e2e regression gate, run live against DES** (VPN up, probe 200): `pnpm test` — **4/4 PASS, no retries, 3.1m** (auth.setup 1.1m, login 45.8s, add-to-cart 30.7s, search-plp-pdp 40.6s). Zero regressions, verified by execution, not inference.
- **CLI smoke against real artifacts:** `pnpm analyze` parsed the real 26-test `test:generated` results (26 passed → 0 failures, guard not tripped) and, after the live suite run, the fresh 4-test manual-suite results. `--risk` against the committed map vs itself → "no changes" path ✓. `--risk` against a doctored baseline (real committed map + a fake covered high-priority flow + one mutated testId-bearing element) → removed flow scored **0.95 high**, changed element **0.65 med**, both with correct named reasons — the (a)→(b) failure-history plumbing exercised end-to-end.

## Exit-gate status

- Suite completa (fases 0–6) en verde: **met** — 297/297 unit (incl. Phase 6's own 34) + 4/4 e2e live.
- Decision log revisado por el responsable humano: **met — reviewed and approved by Jorge (2026-07-14, same day)**, with one resolution: D1 becomes a policy change (routing neutralized to Fable 5 until Phase 9 completes — CLAUDE.md updated). **Gate closed; Phase 7 is unblocked.**
