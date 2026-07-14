import { describe, it, expect } from 'vitest';
import type { FailureReport, RiskReport } from '../analyzer/types';
import type { HealingReport } from '../healer/types';
import type { RunHistory } from '../learning/types';
import type { PlanReport } from '../planner/propose/propose';
import { consolidate, type QaCycleArtifacts } from './report';
import type { StepResult } from './pipeline';

const STARTED = '2026-07-14T12:00:00.000Z';
const NOW = '2026-07-14T12:10:00.000Z';
const FRESH = '2026-07-14T12:05:00.000Z';
const STALE = '2026-07-14T09:00:00.000Z';

const okStep = (name: string): StepResult => ({ name, command: `pnpm ${name}`, status: 'ok', exitCode: 0, durationMs: 100 });
const STEPS = ['test', 'analyze', 'learn', 'heal', 'plan'].map(okStep);

function failureReport(generatedAt: string, selectorDrift = 0): FailureReport {
  return {
    generatedAt, resultsPath: 'reports/results.json', mapGeneratedAt: 'm',
    totals: { tests: 4, passed: 4, failed: 0, flaky: 0, skipped: 0 },
    byCategory: {
      infrastructure: 0, 'catalog-drift': 0, 'environment-noise': 0,
      'selector-drift': selectorDrift, assertion: 0, timeout: 0, unknown: 0,
    },
    failures: [], affectedFlowIds: [],
  };
}

function riskReport(generatedAt: string): RiskReport {
  return {
    generatedAt, baselineGeneratedAt: 'b', currentGeneratedAt: 'c',
    totals: { high: 1, med: 2, low: 3 },
    entries: [{ kind: 'flow', id: 'f-1', change: 'removed', score: 1, band: 'high', reasons: ['removed flow'] }],
  };
}

function runHistory(lastRecordedAt: string): RunHistory {
  return {
    schemaVersion: '1.0',
    entries: [{
      recordedAt: lastRecordedAt, failureReportGeneratedAt: 'x', resultsPath: 'reports/results.json',
      mapGeneratedAt: 'm', totals: { tests: 4, passed: 4, failed: 0, flaky: 0, skipped: 0 }, failures: [],
    }],
  };
}

function healingReport(generatedAt: string): HealingReport {
  return {
    generatedAt, failureReportGeneratedAt: 'x', mapGeneratedAt: 'm',
    totals: { selectorDriftFailures: 1, confirmed: 1, unconfirmed: 0, unparseable: 0, noCandidates: 0 },
    proposals: [],
  };
}

function planReport(generatedAt: string): PlanReport {
  return {
    generatedAt, mapGeneratedAt: 'm', evidenceGeneratedAt: 'e',
    flows: { total: 10, covered: 2, uncovered: 8 },
    uncoveredByPriority: { high: 5, med: 2, low: 1 },
    proposals: [
      { flowId: 'f-1', name: 'journey one', priority: 'high', session: 'auth', steps: ['a'], rationale: 'r', driftEvents: 2 },
      { flowId: 'f-2', name: 'journey two', priority: 'med', session: 'auth', steps: ['a'], rationale: 'r' },
    ],
  };
}

const artifacts = (parts: Partial<QaCycleArtifacts>): QaCycleArtifacts => ({
  failureReport: null, riskReport: null, runHistory: null, healingReport: null, planReport: null,
  ...parts,
});

describe('consolidate', () => {
  it('includes fresh artifacts and summarizes each section', () => {
    const report = consolidate(artifacts({
      failureReport: failureReport(FRESH, 1),
      riskReport: riskReport(FRESH),
      runHistory: runHistory(FRESH),
      healingReport: healingReport(FRESH),
      planReport: planReport(FRESH),
    }), STARTED, NOW, STEPS, { riskRequested: true, top: 1 });
    expect(report.suite).toEqual(expect.objectContaining({ tests: 4, passed: 4 }));
    expect(report.risk).toEqual(expect.objectContaining({ high: 1, med: 2, low: 3 }));
    expect((report.risk as { topEntries: unknown[] }).topEntries).toHaveLength(1);
    expect(report.learning).toEqual({ recordedRuns: 1, lastEntryRecordedAt: FRESH });
    expect(report.healing).toEqual(expect.objectContaining({ confirmed: 1 }));
    expect(report.proposals).toEqual({
      total: 2,
      top: [{ name: 'journey one', priority: 'high', driftEvents: 2 }],
    });
    expect(report.startedAt).toBe(STARTED);
    expect(report.generatedAt).toBe(NOW);
  });

  it('marks stale artifacts as stale — never silently merged (D5, the Phase 8 lesson)', () => {
    const report = consolidate(artifacts({
      failureReport: failureReport(STALE),
      riskReport: riskReport(STALE),
      runHistory: runHistory(STALE),
      healingReport: healingReport(STALE),
      planReport: planReport(STALE),
    }), STARTED, NOW, STEPS, { riskRequested: true, top: 3 });
    expect(report.suite).toBe('stale');
    expect(report.risk).toBe('stale');
    expect(report.learning).toBe('stale');
    expect(report.healing).toBe('stale');
    expect(report.proposals).toBe('stale');
  });

  it('reports risk as not-run when no baseline was requested', () => {
    const report = consolidate(artifacts({ failureReport: failureReport(FRESH) }),
      STARTED, NOW, STEPS, { riskRequested: false, top: 3 });
    expect(report.risk).toBe('not-run');
  });

  it('detects the nothing-to-heal path: green suite, no fresh healing report', () => {
    const report = consolidate(artifacts({
      failureReport: failureReport(FRESH, 0),
      healingReport: healingReport(STALE),
    }), STARTED, NOW, STEPS, { riskRequested: false, top: 3 });
    expect(report.healing).toBe('nothing-to-heal');
  });

  it('leaves sections undefined when the artifact is missing entirely', () => {
    const report = consolidate(artifacts({}), STARTED, NOW, STEPS, { riskRequested: false, top: 3 });
    expect(report.suite).toBeUndefined();
    expect(report.proposals).toBeUndefined();
    // but a missing healing report with an unknown suite cannot claim nothing-to-heal
    expect(report.healing).toBeUndefined();
  });

  it('carries the step results verbatim', () => {
    const report = consolidate(artifacts({}), STARTED, NOW, STEPS, { riskRequested: false, top: 3 });
    expect(report.steps).toEqual(STEPS);
  });
});
