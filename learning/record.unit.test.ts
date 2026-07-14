import { describe, it, expect } from 'vitest';
import type { FailureReport } from '../analyzer/types';
import type { RiskReport } from '../analyzer/types';
import type { RunHistory } from './types';
import { appendRun } from './record';

function makeFailureReport(overrides: Partial<FailureReport> = {}): FailureReport {
  return {
    generatedAt: '2026-07-14T12:00:00.000Z',
    resultsPath: 'reports/results.json',
    mapGeneratedAt: '2026-07-13T19:00:00.000Z',
    totals: { tests: 4, passed: 4, failed: 0, flaky: 0, skipped: 0 },
    byCategory: {
      infrastructure: 0, 'catalog-drift': 0, 'environment-noise': 0,
      'selector-drift': 0, assertion: 0, timeout: 0, unknown: 0,
    },
    failures: [],
    affectedFlowIds: [],
    ...overrides,
  };
}

function makeRiskReport(generatedAt: string): RiskReport {
  return {
    generatedAt,
    baselineGeneratedAt: '2026-07-10T00:00:00.000Z',
    currentGeneratedAt: '2026-07-13T19:00:00.000Z',
    totals: { high: 1, med: 0, low: 0 },
    entries: [{ kind: 'flow', id: 'f-1', change: 'removed', score: 1, band: 'high', reasons: ['removed flow'] }],
  };
}

const OPTS = { now: '2026-07-14T12:30:00.000Z', maxEntries: 50 };

describe('appendRun', () => {
  it('creates a fresh history from null and records the run essentials', () => {
    const { history, compacted } = appendRun(null, makeFailureReport(), null, OPTS);
    expect(history.schemaVersion).toBe('1.0');
    expect(history.entries).toHaveLength(1);
    expect(compacted).toBe(0);
    const e = history.entries[0];
    expect(e.recordedAt).toBe(OPTS.now);
    expect(e.failureReportGeneratedAt).toBe('2026-07-14T12:00:00.000Z');
    expect(e.totals.passed).toBe(4);
    expect(e.failures).toEqual([]);
    expect(e.drift).toBeUndefined();
  });

  it('records failure events with their flow linkage', () => {
    const report = makeFailureReport({
      totals: { tests: 4, passed: 3, failed: 1, flaky: 0, skipped: 0 },
      failures: [{
        spec: 'tests/auth/login.spec.ts', title: 'logs in', projectName: 'chromium',
        outcome: 'failed', persistence: 'persistent', category: 'selector-drift',
        attempts: [], flowsAffected: ['flow-login'],
      }],
      affectedFlowIds: ['flow-login'],
    });
    const { history } = appendRun(null, report, null, OPTS);
    expect(history.entries[0].failures).toEqual([{
      spec: 'tests/auth/login.spec.ts', title: 'logs in', outcome: 'failed',
      category: 'selector-drift', flowsAffected: ['flow-login'],
    }]);
  });

  it('appends to an existing history, oldest first', () => {
    const first = appendRun(null, makeFailureReport({ generatedAt: '2026-07-14T10:00:00.000Z' }), null, OPTS).history;
    const { history } = appendRun(first, makeFailureReport({ generatedAt: '2026-07-14T12:00:00.000Z' }), null, OPTS);
    expect(history.entries.map((e) => e.failureReportGeneratedAt))
      .toEqual(['2026-07-14T10:00:00.000Z', '2026-07-14T12:00:00.000Z']);
  });

  it('refuses to record the same failure report twice (idempotency)', () => {
    const { history } = appendRun(null, makeFailureReport(), null, OPTS);
    expect(() => appendRun(history, makeFailureReport(), null, OPTS))
      .toThrow(/already recorded/);
  });

  it('folds in a risk report only when it is fresh relative to the failure report', () => {
    const fresh = appendRun(null, makeFailureReport(), makeRiskReport('2026-07-14T12:05:00.000Z'), OPTS).history;
    expect(fresh.entries[0].drift).toBeDefined();
    expect(fresh.entries[0].drift?.entries).toEqual([{ kind: 'flow', id: 'f-1', change: 'removed', band: 'high' }]);
    // stale risk report (from a previous session) must NOT attach to today's run
    const stale = appendRun(null, makeFailureReport(), makeRiskReport('2026-07-13T09:00:00.000Z'), OPTS).history;
    expect(stale.entries[0].drift).toBeUndefined();
  });

  it('compacts to the newest maxEntries and reports how many were dropped', () => {
    let history: RunHistory | null = null;
    for (let i = 0; i < 5; i++) {
      history = appendRun(history, makeFailureReport({ generatedAt: `2026-07-14T0${i}:00:00.000Z` }), null, OPTS).history;
    }
    const { history: compactedHistory, compacted } = appendRun(
      history, makeFailureReport({ generatedAt: '2026-07-14T06:00:00.000Z' }), null, { ...OPTS, maxEntries: 3 },
    );
    expect(compacted).toBe(3); // 6 entries -> keep newest 3
    expect(compactedHistory.entries).toHaveLength(3);
    expect(compactedHistory.entries[2].failureReportGeneratedAt).toBe('2026-07-14T06:00:00.000Z');
    expect(compactedHistory.entries[0].failureReportGeneratedAt).toBe('2026-07-14T03:00:00.000Z');
  });
});
