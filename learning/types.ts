import type { FailureCategory } from '../analyzer/types';
import type { DiffKind } from '../explorer/diff/differ';

export const RUN_HISTORY_SCHEMA_VERSION = '1.0';

export interface RunFailureEvent {
  spec: string;
  title: string;
  outcome: 'failed' | 'flaky';
  category: FailureCategory;
  flowsAffected: string[];
}

export interface RunDriftEntry {
  kind: DiffKind;
  id: string;
  change: 'added' | 'removed' | 'changed';
  band: 'high' | 'med' | 'low';
}

export interface RunHistoryEntry {
  recordedAt: string;
  /** Idempotency key — the same failure report never records twice. */
  failureReportGeneratedAt: string;
  /** Which suite produced it (manual vs generated — both write reports/results.json). */
  resultsPath: string;
  mapGeneratedAt: string;
  totals: { tests: number; passed: number; failed: number; flaky: number; skipped: number };
  /** Failure events only. A spec absent from a recorded run's failures either passed or
   *  didn't run in it — the stability signal is "failed in k of the last n RECORDED runs",
   *  deliberately not claiming per-spec pass proof (decision log D4). */
  failures: RunFailureEvent[];
  /** Present when a fresh risk report existed at record time (a diff was scored this run). */
  drift?: {
    baselineGeneratedAt: string;
    currentGeneratedAt: string;
    totals: Record<'high' | 'med' | 'low', number>;
    entries: RunDriftEntry[];
  };
}

export interface RunHistory {
  schemaVersion: string;
  entries: RunHistoryEntry[]; // chronological, oldest first
}
