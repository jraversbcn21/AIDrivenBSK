# Phase 8 — Decision Log (Continuous Learning)

**Date:** 2026-07-14
**Mode:** autonomous execution, same pattern as Phases 6–7 (Jorge: "arrancamos con esas tres propuestas, mismo patron"). Scope Q&A with Jorge served as the brainstorm gate; his three approved proposals are design §2's table.
**Companion design:** `docs/superpowers/specs/2026-07-14-phase8-continuous-learning-design.md`
**Model:** full cycle on Fable 5 (neutralized routing policy, in force until Phase 9 completes).

---

## D1. New top-level `learning/`; history types live there

- **Question:** where does recording live, and where do the `RunHistory` types live so both producers and consumers import them without cycles?
- **Chosen:** new `learning/` sub-project (seventh agent dir) with `pnpm learn`; `RunHistory`/`RunHistoryEntry` types in `learning/types.ts`. Imports: `learning` → `analyzer/types` (FailureReport/FailureCategory) + `explorer` (DiffKind); consumers (`analyzer/cli`, `planner/cli`) → `learning/types` + aggregation helpers. File-level dependency graph stays acyclic (`analyzer/types.ts` imports nothing from `learning/`), which is what `import/no-cycle` enforces.
- **Reason:** one-dir-per-agent is the six-times-proven architecture; producer-owns-the-type is the M7 shared-vocabulary rule.
- **Discarded:** folding recording into `analyzer` (conflates one run's analysis with cross-run memory — different lifecycles); a `shared/` types dir (new layering concept the repo doesn't have).

## D2. Drift is recorded from the risk report, not recomputed

- **Question:** where does `pnpm learn` get drift data — recompute a diff, extend the explorer, or reuse an artifact?
- **Chosen:** read `reports/analyzer/risk-report.json` when present **and fresh** (its `generatedAt` ≥ the failure report's; a stale file from a prior session must not attach to today's run — it would attribute old drift to the wrong run). No diff computation in `learning/`, no explorer changes.
- **Reason:** the risk report already contains exactly the per-entry kind/id/change/band the history needs, produced by the pipeline step that owns diffing; recomputing would duplicate `analyzer --risk` and demand a baseline `learn` has no business choosing.
- **Discarded:** `learn --baseline <map>` recomputing diffMaps (duplicated responsibility); teaching `pnpm explore --diff` to persist its diff (touches a Phase-1 tool for a Phase-8 need — additive elsewhere).

## D3. Committed history holds real runs only

- **Question:** the live demo needs multi-run history with failures, but today's suite is green. Doctor the committed history?
- **Chosen:** never. The committed `coverage/run-history.json` records only real pipeline runs (today: a real green run — which IS real learning: stability evidence). The multi-run consumption demo uses a scratchpad history file via `--history`, built from the real entry plus the Phase 7 demo's doctored failure records, and is deleted with the scratchpad.
- **Reason:** a knowledge artifact with fabricated entries poisons every future consumer silently — the exact opposite of this phase's purpose.
- **Discarded:** committing a demo entry flagged `synthetic: true` — a flag consumers must each remember to filter is a standing footgun.

## D4. Honest imprecision: absence of a failure event ≠ proof of passing

- **Question:** the failure report lists failures only (passing specs appear in totals, not by name), and `reports/results.json` is written by whichever suite ran last (analyzer decision log I3). Can per-spec stability be exact?
- **Chosen:** record failures + per-run totals + `resultsPath`; the stability signal is "failed/flaky in k of the last n *recorded* runs". A spec absent from a recorded run's failures either passed or didn't run — documented plainly in the schema comment, not papered over.
- **Reason:** exact per-spec pass tracking would require widening Phase 6's contract (per-spec pass lists) the day after it shipped; the k-of-n failure signal is deterministic, explainable, and sufficient for both v1 consumers.
- **Discarded:** extending FailureReport with a passed-spec list (churns a just-validated contract; natural v2 if the imprecision ever bites).

## D5. History window and weights

- **Question:** how much history do consumers read, and does the risk weight change?
- **Chosen:** `HISTORY_WINDOW = 10` most recent entries, a code constant in `learning/aggregate.ts` (single point of change, same policy as the risk weights); the analyzer's `failureHistory` weight stays 0.15 — same signal, better data; reasons now cite "(this run)" vs "(failed in k of last n recorded runs)". Planner drift counting uses the same window.
- **Reason:** changing data quality and weight magnitude in one step would make the effect unattributable; window-as-constant mirrors D10-Phase-6's no-env-tunables rule (a signal only means something if everyone computes it the same way).
- **Discarded:** recency-weighted decay (more knobs than v1 evidence justifies); env-tunable window.

## D6. Compaction: newest 50, reported, never silent

- **Question:** an append-forever committed file grows without bound.
- **Chosen:** on every write, keep the newest `--max-entries` (default 50); when compaction drops entries, say so on the console (the no-silent-caps rule). Idempotency: an entry whose `failureReportGeneratedAt` already exists is refused. Corrupt existing file: abort loudly, never overwrite (the VPN-drop/empty-map lesson).
- **Reason:** every guard here is a lesson this repo already paid for once; the history file must be the *most* protected artifact, being the only one that cannot be regenerated.
- **Discarded:** unbounded growth (2.6 MB map precedent says JSON-in-git is fine *bounded*); silent truncation.

## D7. Planner ranking places driftEvents after priority, before steps-length

- **Question:** where does the drift signal sit in the proposal ordering?
- **Chosen:** priority → driftEvents desc → steps-length desc → name. `TestProposal.driftEvents?: number` is additive; without history the field is absent and ordering is byte-identical to today (locked by a regression test).
- **Reason:** priority is the planner's existing headline semantic (don't demote it); among equals, drift-prone territory earns coverage first — that IS the learning effect; steps-length remains the tiebreaker it always was.
- **Discarded:** drift above priority (a low-priority churning sitemap page would outrank a high-priority stable checkout flow — wrong); drift as a separate report section (invisible to the ranking = invisible to the Builder's top-N).

## D8. Consumers read history tolerantly; only the writer protects it

- **Question:** what do analyzer/planner do with a corrupt or missing history file?
- **Chosen:** read-only consumers degrade gracefully — missing file: no history signal (behavior identical to pre-Phase-8); unparseable/malformed: warn and proceed without. Only `pnpm learn` (the writer) aborts loudly on a corrupt file.
- **Reason:** a broken history must never make `pnpm analyze`/`pnpm plan` unusable (they have real single-run work to do regardless); the anti-clobber duty sits with the only command that writes.
- **Discarded:** hard-failing consumers — couples three tools' availability to one file's health.

## Honest notes

- **Two pre-existing unit tests were updated** (not behavioral regressions): the `parseAnalyzeArgs`/`parsePlanArgs` defaults tests use strict `toEqual`, and both parsers gained the additive `history` field. Every other pre-existing test passes unmodified; the planner's no-history ordering is additionally locked byte-identical by a new regression test.
- The scratch demo history intentionally contains a duplicated underlying test run (entries 1 and 3 derive from the same live suite run, re-analyzed) — scratchpad-only, never committed; the committed `coverage/run-history.json` holds exactly one real green run.

## Iteration log (max-8 loop)

**Same-failure iterations consumed: 1 of 8** — one unit-test failure in `record.unit.test.ts` (compaction case). Root cause: my test fixture's arithmetic (6 entries compacted to newest 3 keeps [03,04,06]; the expectation said 04 at index 0), not the implementation. Fixed the expectation; everything else passed first-run (aggregate 5/5, args 3/3, analyzer +3, planner +3).

## Verification results (2026-07-14)

- `pnpm test:unit` — **347/347** (327 + 20 new: learning 14, analyzer risk +3, planner propose +3). Typecheck/lint clean.
- **Phases 0–7 e2e regression gate, live against DES:** `pnpm test` — **4/4 PASS, no retries, 3.4m** (this same run seeded the history). Zero regressions.
- **Real pipeline, live:** `pnpm test` → `pnpm analyze` → `pnpm learn` recorded the first real entry into the committed `coverage/run-history.json` (1 entry, 4/4 passed, 0 failure events). **The freshness guard proved itself live:** the stale Phase-6 demo risk-report sitting on disk was correctly excluded ("no fresh drift report").
- **Multi-run consumption demo (scratchpad history, real map/flows):**
  - *Analyzer:* `--risk` + 2-entry history → the changed logon page scored 0.80 with reason **"failure history (page on a flow that failed in 1 of last 2 recorded runs)"** — the k-of-n signal live, propagated through the real flow linkage.
  - *Recording drift:* the fresh risk report attached to entry 3 ("drift: 3 entries (2 high)").
  - *Planner:* without history, top proposals = pantalones journeys; with drift history on the zapatos page, **the zapatos journeys jump to the top**, each carrying "1 drift event(s) in recorded history" in its rationale — the run → learn → better-decisions loop, visible in one diff of two console outputs.

## Exit-gate status

- Suite completa (fases 0–8) en verde: **met** — 347/347 unit + 4/4 e2e live.
- Decision log revisado por el responsable humano: **pending Jorge's review** — Phase 9 must not start before it.
