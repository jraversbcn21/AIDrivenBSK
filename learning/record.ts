import type { FailureReport, RiskReport } from '../analyzer/types';
import { RUN_HISTORY_SCHEMA_VERSION, type RunHistory, type RunHistoryEntry } from './types';

export interface AppendResult {
  history: RunHistory;
  /** Entries dropped by compaction this write — reported, never silent (no-silent-caps rule). */
  compacted: number;
}

/**
 * Pure append of one run into the history (decision log D2/D6). The risk report is folded
 * in only when fresh relative to the failure report — a stale risk file from a previous
 * session must not attribute old drift to today's run. Idempotent by
 * failureReportGeneratedAt; compaction keeps the newest maxEntries.
 */
export function appendRun(
  existing: RunHistory | null,
  failureReport: FailureReport,
  riskReport: RiskReport | null,
  opts: { now: string; maxEntries: number },
): AppendResult {
  const history: RunHistory = existing ?? { schemaVersion: RUN_HISTORY_SCHEMA_VERSION, entries: [] };

  if (history.entries.some((e) => e.failureReportGeneratedAt === failureReport.generatedAt)) {
    throw new Error(
      `Run already recorded: an entry with failureReportGeneratedAt ${failureReport.generatedAt} exists — re-running \`pnpm learn\` must not double-count a run.`,
    );
  }

  const freshRisk = riskReport !== null && riskReport.generatedAt >= failureReport.generatedAt ? riskReport : null;

  const entry: RunHistoryEntry = {
    recordedAt: opts.now,
    failureReportGeneratedAt: failureReport.generatedAt,
    resultsPath: failureReport.resultsPath,
    mapGeneratedAt: failureReport.mapGeneratedAt,
    totals: failureReport.totals,
    failures: failureReport.failures.map((f) => ({
      spec: f.spec, title: f.title, outcome: f.outcome, category: f.category, flowsAffected: f.flowsAffected,
    })),
    ...(freshRisk !== null ? {
      drift: {
        baselineGeneratedAt: freshRisk.baselineGeneratedAt,
        currentGeneratedAt: freshRisk.currentGeneratedAt,
        totals: freshRisk.totals,
        entries: freshRisk.entries.map((e) => ({ kind: e.kind, id: e.id, change: e.change, band: e.band })),
      },
    } : {}),
  };

  const all = [...history.entries, entry];
  const kept = all.slice(-opts.maxEntries);
  return {
    history: { schemaVersion: history.schemaVersion, entries: kept },
    compacted: all.length - kept.length,
  };
}
