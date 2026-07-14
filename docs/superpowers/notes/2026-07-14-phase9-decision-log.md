# Phase 9 — Decision Log (Autonomous Quality Engineering: orchestration v1)

**Date:** 2026-07-14
**Mode:** autonomous execution, same pattern as Phases 6–8. Scope Q&A with Jorge (three decisions) served as the brainstorm gate: deterministic pipeline + B-NL1 split out + strictly propose/report.
**Companion design:** `docs/superpowers/specs/2026-07-14-phase9-orchestration-design.md`
**Model:** full cycle on Fable 5 (neutralized routing policy — this is the phase whose completion triggers its re-evaluation).

---

## D1. Agents run as child processes, not imported functions

- **Question:** the orchestrator must run six existing CLIs. Import their logic, or spawn them?
- **Chosen:** spawn each as a child `pnpm <script>` process, treating every agent as a black box with its own guards, exit codes and console output.
- **Reason:** the CLIs are `main()` scripts with `process.exit` — importing them means refactoring six live-validated entry points (maximal touch) for zero behavioral gain; the black-box boundary is also the honest one (the orchestrator sequences agents, it doesn't reach into them).
- **Discarded:** refactoring every CLI into exported `run()` functions — touches all validated agents in the final phase, the exact opposite of minimal-touch; importing pure internals directly — would silently bypass each CLI's own guards (empty-input refusals, staleness checks), which are load-bearing.

## D2. Failure policy is per-step and fixed at design time

- **Question:** what happens when a step fails mid-cycle?
- **Chosen:** the design §3 table — `test` continues (a red suite is the cycle's most valuable input), `analyze` aborts (everything downstream consumes it), `learn`/`heal`/`plan` continue. Every exit code is recorded in the consolidated report.
- **Reason:** this is policy, not content-branching — fixed at design time, identical every run, which keeps the "deterministic pipeline" scope decision intact while making a red suite feed the loop instead of killing it.
- **Discarded:** abort-on-any-failure (defeats the purpose: the cycle exists precisely to process failures); continue-on-everything (an unparseable results file would cascade garbage through four consumers).

## D3. `pnpm test`'s red exit code is data, never masked

- **Question:** `pnpm test` exits non-zero when specs fail; a naive pipeline would die there.
- **Chosen:** run it with continue-on-failure, record the exit code faithfully in the report, and let analyze classify what happened. The orchestrator's own exit code reflects *pipeline* health (did the steps run), not *suite* health (did tests pass) — the suite's health is the report's content.
- **Reason:** conflating the two would make a legitimately-red suite look like an orchestrator crash, and a green orchestrator claim would mask real failures — the exact reporting sin the goal-format prohibits.
- **Discarded:** propagating the suite's exit code as the cycle's (ambiguous: callers can't tell "tests failed" from "pipeline broke").

## D4. `plan --update` (canonical-map annotation) is opt-in, default OFF

- **Question:** the documented planner usage is `pnpm plan --update` (writes `coveredBy` into the committed map). Should the autonomous cycle do that by default?
- **Chosen:** no — `pnpm qa-cycle` runs bare `pnpm plan` by default; `--update-map` opts in explicitly.
- **Reason:** the strictly-propose/report scope decision covers mutations of committed knowledge, not just committed code; an unattended cycle silently rewriting the canonical map's annotations crosses that line. A human (or a human-authored CI job) can pass `--update-map` deliberately.
- **Discarded:** default ON (violates the approved authority boundary); never allowing it (the flag exists because map annotation IS the documented, guarded planner behavior — the orchestrator only defers the authorization).

## D5. Artifact freshness: only this cycle's outputs count

- **Question:** the report consolidates five artifacts that may also exist stale on disk from earlier sessions (this exact hazard fired in Phase 8: a stale Phase-6 risk report sat on disk and the learn freshness guard had to exclude it).
- **Chosen:** `consolidate()` includes an artifact only when its `generatedAt` ≥ the cycle's `startedAt`; anything older is reported as `'stale'`, never silently merged.
- **Reason:** the consolidated report claims to describe *this* cycle; including a stale artifact would fabricate coherence that doesn't exist. Same lesson, now enforced at the reporting layer too.
- **Discarded:** trusting mtime (unreliable across git operations); ignoring staleness (proven live to be a real hazard, twice).

## D6. B-NL1 formally deferred, with its seams named

- **Question:** the backlog marks B-NL1 actionable now that its dependency chain is complete. Include it?
- **Chosen:** no (Jorge's explicit scope decision) — registered as the next candidate milestone after this one, with its injection point unchanged (`selectJourneys()` in `builder/cli.ts`, per backlog §E) plus a new one this phase creates: a resolved flowId could equally parameterize a future `qa-cycle --flow <id>`.
- **Reason:** text→flow resolution has its own open decisions (matching mechanism, ambiguity handling, surface) deserving their own scope round; rushing it into the orchestration v1 would compromise both.
- **Discarded:** building it here (scope creep in the final phase, against an explicit decision).

## Iteration log (max-8 loop)

**Same-failure iterations consumed: 1 of 8** — one lint error (`no-unused-vars` on a rest-destructuring discard in `report.ts`); root cause: the repo's eslint config doesn't enable `ignoreRestSiblings`, so the `_ignored` idiom flags. Fixed by building the totals object explicitly. All unit tests passed first-run (pipeline 7/7, report 6/6, args 3/3).

## Verification results (2026-07-14)

- `pnpm test:unit` — **363/363** (347 + 16 orchestrator tests). Typecheck/lint clean.
- **Live end-to-end: one real `pnpm qa-cycle` against DES, all five steps green** — test ✓ (178s, 4/4 live suite), analyze ✓, learn ✓ (the committed `coverage/run-history.json` grew to **2 real entries**), heal ✓ (the nothing-to-heal path exercised: green suite, clean no-op exit), plan ✓ (160 uncovered flows ranked from fresh evidence, 5/165 covered).
- **Consolidated report coherent with every underlying artifact, verified directly:** steps all `ok`; `suite {4/4}`; `risk: "not-run"` (no baseline requested — correctly distinguished from stale/missing); `learning {2 runs}`; `healing: "nothing-to-heal"` (named, not silently absent); `proposals {160}`.
- The orchestrator wrote `reports/orchestrator/qa-cycle-report.json` and exited 0 (pipeline health; the suite's health lives in the report — D3).

## Exit-gate status

- Suite completa (fases 0–9 v1) en verde: **met** — 363/363 unit + the live qa-cycle above (which itself ran the full e2e suite 4/4).
- Decision log revisado por el responsable humano: **pending Jorge's review.** Note for that review: this closes the roadmap's Phase 9 **orchestration core**; **B-NL1** (the NL interface) remains registered as the next candidate milestone with its own scope round — Phase 9's row stays "v1" until Jorge decides whether B-NL1 completes it or stands alone.
