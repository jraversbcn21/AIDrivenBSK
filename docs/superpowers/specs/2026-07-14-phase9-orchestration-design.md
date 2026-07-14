# Phase 9 — Autonomous Quality Engineering: deterministic orchestration (design)

**Date:** 2026-07-14
**Status:** Scope approved by Jorge (three decisions, this session): **deterministic pipeline** + **B-NL1 split out as its own future milestone** + **strictly propose/report**. Same working pattern as Phases 6–8. Companion decision log: `docs/superpowers/notes/2026-07-14-phase9-decision-log.md`.
**Phase gate:** Phase 9 of the platform roadmap — "Autonomous Quality Engineering: orchestration of phases 4–8." (The B-NL1 NL interface is deliberately NOT this milestone — see §6.)
**North Star:** Autonomy (one command runs the whole quality cycle end to end, unattended).

---

## 1. What this is

A new top-level sub-project, `orchestrator/` (`pnpm qa-cycle`, the eighth agent directory). One command runs the full quality cycle in a **fixed, deterministic order**, treating every existing agent as a black box with its own guards:

```
pnpm qa-cycle [--risk <baseline>] [--no-probe] [--update-map] [--top <n>]
  1. pnpm test                        (live suite — a RED run is data, not a pipeline failure)
  2. pnpm analyze [--risk <baseline>] (failure classification [+ diff risk scoring])
  3. pnpm learn                       (record the run into coverage/run-history.json)
  4. pnpm heal [--no-probe]           (selector-drift proposals; exits clean when nothing to heal)
  5. pnpm plan [--update]             (drift-aware proposals from fresh evidence)
  → reports/orchestrator/qa-cycle-report.json  (consolidated summary)
```

The orchestrator contains **no conditional logic driven by signal content** (the approved scope): the sequence is fixed; each agent's own guards decide what it does with its inputs (heal already no-ops without selector-drift failures; learn already refuses duplicates; plan already warns on stale evidence). What the orchestrator adds is sequencing, per-step failure policy, and one consolidated report.

## 2. Confirmed scope decisions (Jorge, 2026-07-14)

| Decision | Choice | Why |
|---|---|---|
| Orchestration mechanism | **Deterministic pipeline**, fixed order, no content-driven branching. | Rules-first doctrine (every agent since Phase 6); autonomous ≠ unpredictable. |
| B-NL1 (NL interface) | **Out of scope — its own future milestone.** | Text→flow resolution is a genuinely new capability with its own open decisions (matching mechanism, ambiguity handling, surface); bolting it onto the orchestration v1 would rush both. |
| Authority | **Strictly propose/report.** The cycle never promotes generated specs, never applies healing fixes, and by default never writes the canonical map. | Preserves the propose-don't-apply pattern Phase 7 fixed; the human stays the gate on every mutation of committed code/knowledge. |

## 3. Per-step failure policy (fixed at design time, not reactive)

| Step | On failure | Why |
|---|---|---|
| `pnpm test` | **continue** | A red suite is the cycle's most valuable input — analyze/learn/heal exist for exactly that. Exit code recorded, never masked. |
| `pnpm analyze` | **abort** | Everything downstream consumes its output; if results can't be parsed, continuing would report garbage. |
| `pnpm learn` | **continue** | A refusal (e.g. duplicate run) is a legitimate guard firing, not a cycle failure; heal/plan don't depend on it. |
| `pnpm heal` | **continue** | Healing is advisory; its failure must not block planning. |
| `pnpm plan` | **continue** | Last step; its own console/report say what happened. |

Every step's exit code, duration and status land in the consolidated report — nothing is smoothed over.

## 4. Implementation shape

- **`orchestrator/pipeline.ts`** — `runPipeline(steps, exec)`: sequential runner with the failure policy above; `exec` is injectable (`(command) → {exitCode, durationMs}`), so the runner is unit-tested without spawning anything. Step definitions (`buildSteps(args)`) are pure: flags map to the exact child commands.
- **`orchestrator/report.ts`** — `consolidate(artifacts, cycleStartedAt, stepResults)`: pure function reading the five artifacts' *parsed contents* and producing the consolidated summary. **Freshness rule:** an artifact only contributes when its `generatedAt` ≥ the cycle's start; a stale file on disk is reported as `stale` (not silently included) — the same lesson `pnpm learn`'s risk-report guard proved live in Phase 8.
- **`orchestrator/cli.ts`** — thin: parse args → build steps → run (spawning `pnpm <script>` children, `shell: true` for Windows) → read artifacts → consolidate → write `reports/orchestrator/qa-cycle-report.json` → print the cycle summary.
- **`orchestrator/args.ts`** — `--risk <baseline>` (passes through to analyze), `--no-probe` (passes to heal), `--update-map` (opts in to `plan --update`; default OFF — writing coveredBy to the committed map is a human-authorized mutation, decision log D4), `--top <n>` (passes to plan/analyze printing).

## 5. Consolidated report — `reports/orchestrator/qa-cycle-report.json`

```ts
interface StepResult { name: string; command: string; status: 'ok' | 'failed' | 'aborted-pipeline' | 'skipped'; exitCode: number | null; durationMs: number }
interface QaCycleReport {
  generatedAt: string; startedAt: string;
  steps: StepResult[];
  suite?: { tests: number; passed: number; failed: number; flaky: number; skipped: number; byCategory: Record<FailureCategory, number> } | 'stale';
  risk?: { high: number; med: number; low: number; topEntries: RiskEntry[] } | 'stale' | 'not-run';
  learning?: { recordedRuns: number; lastEntryRecordedAt: string } | 'stale';
  healing?: { confirmed: number; unconfirmed: number; unparseable: number; noCandidates: number } | 'stale' | 'nothing-to-heal';
  proposals?: { total: number; top: Array<{ name: string; priority: string; driftEvents?: number }> } | 'stale';
}
```

## 6. Deliberately NOT in scope

- **B-NL1** — registered in the backlog (§E), actionable, but its own milestone with its own scope round.
- Content-driven branching, retries beyond the agents' own, scheduling/cron (CI wiring is a later, separate decision — C11 still unresolved).
- Promoting generated specs, applying healing fixes, writing the canonical map by default.

## 7. Testing & validation plan

- **Unit (TDD):** `pipeline` (order, abort-on-analyze-failure skips the rest and marks them, continue-on-test-failure, exit codes recorded); `buildSteps` (flag passthrough exactness); `consolidate` (freshness rule per artifact, stale marking, nothing-to-heal detection, missing-artifact handling); `args`.
- **Gate:** full `pnpm test:unit` + typecheck + lint.
- **Live end-to-end (the milestone's success criterion):** one real `pnpm qa-cycle` against DES completing all five steps — suite live, failure report fresh, a **new real entry** in the committed `coverage/run-history.json`, heal's nothing-to-heal path exercised, drift-aware proposals produced — and the consolidated report coherent with each underlying artifact.
