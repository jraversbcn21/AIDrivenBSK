import type { FailureCategory, FailureReport, RiskEntry, RiskReport } from '../analyzer/types';
import type { HealingReport } from '../healer/types';
import type { RunHistory } from '../learning/types';
import type { PlanReport } from '../planner/propose/propose';
import type { StepResult } from './pipeline';

export interface QaCycleArtifacts {
  failureReport: FailureReport | null;
  riskReport: RiskReport | null;
  runHistory: RunHistory | null;
  healingReport: HealingReport | null;
  planReport: PlanReport | null;
}

export interface QaCycleReport {
  generatedAt: string;
  startedAt: string;
  steps: StepResult[];
  suite?: {
    tests: number; passed: number; failed: number; flaky: number; skipped: number;
    byCategory: Record<FailureCategory, number>;
  } | 'stale';
  risk?: { high: number; med: number; low: number; topEntries: RiskEntry[] } | 'stale' | 'not-run';
  learning?: { recordedRuns: number; lastEntryRecordedAt: string } | 'stale';
  healing?: {
    confirmed: number; unconfirmed: number; unparseable: number; noCandidates: number;
  } | 'stale' | 'nothing-to-heal';
  proposals?: {
    total: number;
    top: Array<{ name: string; priority: string; driftEvents?: number }>;
  } | 'stale';
}

/**
 * Pure consolidation of the cycle's artifacts. Freshness rule (decision log D5): an
 * artifact contributes only when produced during THIS cycle (generatedAt >= startedAt);
 * anything older on disk is reported as 'stale', never silently merged — the same
 * hazard Phase 8's learn guard caught live (a stale risk report from a prior session).
 */
export function consolidate(
  artifacts: QaCycleArtifacts,
  startedAt: string,
  now: string,
  steps: StepResult[],
  opts: { riskRequested: boolean; top: number },
): QaCycleReport {
  const fresh = (generatedAt: string): boolean => generatedAt >= startedAt;

  const report: QaCycleReport = { generatedAt: now, startedAt, steps };

  const fr = artifacts.failureReport;
  if (fr !== null) {
    report.suite = fresh(fr.generatedAt) ? { ...fr.totals, byCategory: fr.byCategory } : 'stale';
  }

  if (!opts.riskRequested) {
    report.risk = 'not-run';
  } else if (artifacts.riskReport !== null) {
    const rr = artifacts.riskReport;
    report.risk = fresh(rr.generatedAt)
      ? { ...rr.totals, topEntries: rr.entries.slice(0, opts.top) }
      : 'stale';
  }

  const rh = artifacts.runHistory;
  if (rh !== null && rh.entries.length > 0) {
    const last = rh.entries[rh.entries.length - 1];
    report.learning = fresh(last.recordedAt)
      ? { recordedRuns: rh.entries.length, lastEntryRecordedAt: last.recordedAt }
      : 'stale';
  }

  const hr = artifacts.healingReport;
  const suiteFresh = fr !== null && fresh(fr.generatedAt);
  if (hr !== null && fresh(hr.generatedAt)) {
    report.healing = {
      confirmed: hr.totals.confirmed, unconfirmed: hr.totals.unconfirmed,
      unparseable: hr.totals.unparseable, noCandidates: hr.totals.noCandidates,
    };
  } else if (suiteFresh && fr.byCategory['selector-drift'] === 0) {
    // heal exits without writing when there is nothing to heal — with a fresh green-on-drift
    // suite, an absent/stale healing report IS the expected outcome, name it as such.
    report.healing = 'nothing-to-heal';
  } else if (hr !== null) {
    report.healing = 'stale';
  }

  const pr = artifacts.planReport;
  if (pr !== null) {
    report.proposals = fresh(pr.generatedAt)
      ? {
        total: pr.proposals.length,
        top: pr.proposals.slice(0, opts.top).map((p) => ({
          name: p.name, priority: p.priority,
          ...(p.driftEvents !== undefined ? { driftEvents: p.driftEvents } : {}),
        })),
      }
      : 'stale';
  }

  return report;
}
