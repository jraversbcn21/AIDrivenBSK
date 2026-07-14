# Phase 8 — Continuous Learning (design)

**Date:** 2026-07-14
**Status:** Scope approved by Jorge (the three proposals, this session): **separate accumulating artifact** + **v1 learns stability & drift history** + **v1 consumers are analyzer & planner**. Same working pattern as Phases 6–7 (autonomous, decision-log-audited, Fable 5 full cycle). Companion decision log: `docs/superpowers/notes/2026-07-14-phase8-decision-log.md`.
**Phase gate:** Phase 8 of the platform roadmap — "Continuous Learning: feed run results and diffs back into the functional map."
**North Star:** Knowledge (the platform now has memory across runs) + Reasoning (decisions weighted by real history, not single-run snapshots).

---

## 1. What this is

The platform's first **cross-run memory**. Until now every artifact was single-run: a failure report describes one suite run, a risk report one diff — and everything is forgotten when the session ends. Phase 8 adds:

- A new top-level sub-project `learning/` (`pnpm learn`, the seventh agent directory) that **records** each run's outcomes into a committed, accumulating artifact: `coverage/run-history.json`.
- Two existing consumers upgraded to **read** that history:
  - the **analyzer**'s risk scoring: its failure-history signal (D8) graduates from "this run's affected flows" to "flows that failed in any of the last N recorded runs", with reasons citing real counts;
  - the **planner**'s proposals: uncovered flows whose pages drift frequently (per the accumulated diff history) rank above equal-priority stable ones — drift-prone territory earns coverage first.

The loop this closes, visibly: **run → learn → better decisions next run.**

## 2. Confirmed scope decisions (Jorge, 2026-07-14)

| Decision | Choice | Why |
|---|---|---|
| Where learned knowledge lives | **`coverage/run-history.json`** (committed, append-per-run) + annotations *recomputed* by consumers. **No direct map-schema surgery.** | The map is regenerated wholesale on every crawl (no migration code, by doctrine) — anything written into it dies on re-crawl. `coveredBy` survives because `pnpm plan --update` re-applies it from reports; same proven pattern. |
| What v1 learns | **(a)** per-spec/per-flow stability history (failure/flaky events per recorded run, from failure reports); **(b)** drift history per scored diff (from risk reports). | Closes C13's remaining scope for real (a); makes diff knowledge cumulative (b). NOT in v1: healer-confirmed fixes back into element hints (touches the element contract everywhere — v2). |
| Who consumes it in v1 | **analyzer** (multi-run failure-history signal) + **planner** (drift signal in proposal ranking). | The two decision-makers; the loop becomes observable in their outputs. |

## 3. The history artifact — `coverage/run-history.json`

```ts
interface RunHistoryEntry {
  recordedAt: string;
  failureReportGeneratedAt: string;  // idempotency key — the same report never records twice
  resultsPath: string;               // which suite produced it (manual vs generated — the I3 honesty)
  mapGeneratedAt: string;
  totals: { tests: number; passed: number; failed: number; flaky: number; skipped: number };
  /** Failure events only; a recorded run absent from a spec's events means "did not fail
   *  in that run" (passed or didn't run — see decision log D4 for this honest imprecision). */
  failures: Array<{ spec: string; title: string; outcome: 'failed' | 'flaky'; category: FailureCategory; flowsAffected: string[] }>;
  /** Present when a risk report existed at record time (a diff was scored this run). */
  drift?: {
    baselineGeneratedAt: string; currentGeneratedAt: string;
    totals: Record<'high' | 'med' | 'low', number>;
    entries: Array<{ kind: DiffKind; id: string; change: 'added' | 'removed' | 'changed'; band: 'high' | 'med' | 'low' }>;
  };
}
interface RunHistory {
  schemaVersion: '1.0';
  entries: RunHistoryEntry[];        // chronological, oldest first
}
```

**Recording (`pnpm learn`):** reads `reports/analyzer/failure-report.json` (required — "run `pnpm analyze` first") and `reports/analyzer/risk-report.json` (optional; only folded in when its `generatedAt` is fresh relative to the failure report — a stale risk file from a previous session must not attach to today's run). Appends one entry.

**Guards (each one a lesson this repo already paid for):**
- **Idempotency:** an entry with the same `failureReportGeneratedAt` already present → refuse with a clear message (re-running `pnpm learn` must never double-count a run).
- **Anti-clobber:** if the history file exists but cannot be parsed → abort loudly; never overwrite what might be recoverable knowledge (the VPN-drop/empty-map lesson).
- **Compaction:** keep the newest `--max-entries` (default 50) — compaction is reported, never silent (the no-silent-caps rule).
- **Only real runs:** the committed history holds real runs only; demos/synthetic data go to scratchpad paths via `--history`.

## 4. Consumer upgrades (both additive; absent history = today's behavior, bit for bit)

### 4.1 Analyzer — multi-run failure history

`analyzer/cli.ts` gains `--history <path>` (default `coverage/run-history.json`; missing file → signal silently limited to the current run, current behavior). The risk scorer receives, alongside the current run's `affectedFlowIds`, a **historical map** `flowId → k` (failures in the last `HISTORY_WINDOW = 10` recorded entries). The existing `failureHistory` weight (0.15) is unchanged — same signal, better data — but reasons now distinguish:
- `failure history (this run)` — current-run affected;
- `failure history (failed in k of last n recorded runs)` — historical.

### 4.2 Planner — drift-aware proposal ranking

`planner/cli.ts` optionally reads the same history. `buildPlanReport` gains an optional `driftEventsByPage` input: per uncovered flow, `driftEvents` = count of historical drift entries (changed/removed, any band) touching the flow's step pages or the flow id itself, over the same 10-entry window. `TestProposal` gains `driftEvents?: number` (additive); ranking becomes **priority → driftEvents desc → steps length desc → name**; the rationale mentions drift when present. Without history, `driftEvents` is absent and ordering is byte-identical to today (locked by a regression test).

## 5. Pipeline order (documented, not enforced)

```
pnpm test [--/ pnpm test:generated]   → reports/results.json
pnpm analyze [--risk <baseline>]      → failure-report.json [+ risk-report.json]
pnpm learn                            → coverage/run-history.json  (append)
—— next session ——
pnpm plan / pnpm analyze              → decisions now weighted by history
```

## 6. Deliberately NOT in scope

- Map schema changes (stays 1.7) or writing anything into the map.
- Healer-confirmed fixes fed back into `selectorHints` (v2 — element-contract risk).
- Any orchestration of the pipeline order (Phase 9's job, prohibited).
- Automatic baseline snapshotting for `--risk` (still caller-supplied; unchanged).

## 7. Testing & validation plan

- **Unit (TDD):** `record` (append, idempotency refusal, compaction with report, corrupt-file abort, stale-risk-report exclusion, fresh-risk-report inclusion); `historical aggregation` (window, k-counts, flow/page drift counting); analyzer reasons with/without history; planner ordering with/without history (byte-identical regression case); args.
- **Gate:** full `pnpm test:unit` + typecheck + lint; phases-0-7 e2e (`pnpm test`) live, zero regressions.
- **Live end-to-end (the milestone's success criterion):** a real green `pnpm test` run recorded into the **committed** `coverage/run-history.json` via the real pipeline (test → analyze → learn); then a **scratchpad** multi-run history (real entry + the Phase 7 demo's doctored failures, kept out of the committed file) demonstrating both consumers: analyzer risk reasons citing "failed in k of last n recorded runs", planner proposals visibly reordered by drift.
