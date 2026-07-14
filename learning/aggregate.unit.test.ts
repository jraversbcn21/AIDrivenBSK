import { describe, it, expect } from 'vitest';
import type { RunHistory, RunHistoryEntry } from './types';
import { HISTORY_WINDOW, historicalFlowFailures, historicalDriftEvents } from './aggregate';

function entry(stamp: string, overrides: Partial<RunHistoryEntry> = {}): RunHistoryEntry {
  return {
    recordedAt: stamp, failureReportGeneratedAt: stamp, resultsPath: 'reports/results.json',
    mapGeneratedAt: '2026-07-13T19:00:00.000Z',
    totals: { tests: 4, passed: 4, failed: 0, flaky: 0, skipped: 0 },
    failures: [],
    ...overrides,
  };
}

function failing(stamp: string, flowIds: string[]): RunHistoryEntry {
  return entry(stamp, {
    totals: { tests: 4, passed: 3, failed: 1, flaky: 0, skipped: 0 },
    failures: [{ spec: 's.spec.ts', title: 't', outcome: 'failed', category: 'selector-drift', flowsAffected: flowIds }],
  });
}

function drifting(stamp: string, ids: Array<{ kind: 'page' | 'flow'; id: string; change: 'changed' | 'removed' | 'added' }>): RunHistoryEntry {
  return entry(stamp, {
    drift: {
      baselineGeneratedAt: 'x', currentGeneratedAt: 'y',
      totals: { high: ids.length, med: 0, low: 0 },
      entries: ids.map((i) => ({ ...i, band: 'high' as const })),
    },
  });
}

const history = (entries: RunHistoryEntry[]): RunHistory => ({ schemaVersion: '1.0', entries });

describe('historicalFlowFailures', () => {
  it('counts per-flow failures across the window and reports how many runs it considered', () => {
    const h = history([
      failing('2026-07-10T00:00:00.000Z', ['f-a']),
      failing('2026-07-11T00:00:00.000Z', ['f-a', 'f-b']),
      entry('2026-07-12T00:00:00.000Z'), // green run
    ]);
    const agg = historicalFlowFailures(h);
    expect(agg.window).toBe(3);
    expect(agg.byFlow.get('f-a')).toBe(2);
    expect(agg.byFlow.get('f-b')).toBe(1);
    expect(agg.byFlow.has('f-c')).toBe(false);
  });

  it('only looks at the newest HISTORY_WINDOW entries', () => {
    const old = Array.from({ length: HISTORY_WINDOW }, (_, i) => entry(`2026-07-01T0${i}:00:00.000Z`));
    const h = history([failing('2026-06-30T00:00:00.000Z', ['f-old']), ...old]);
    const agg = historicalFlowFailures(h);
    expect(agg.window).toBe(HISTORY_WINDOW);
    expect(agg.byFlow.has('f-old')).toBe(false);
  });

  it('handles a null/empty history as zero signal', () => {
    expect(historicalFlowFailures(null).window).toBe(0);
    expect(historicalFlowFailures(history([])).byFlow.size).toBe(0);
  });
});

describe('historicalDriftEvents', () => {
  it('counts changed/removed drift events per entity id, ignoring added', () => {
    const h = history([
      drifting('2026-07-10T00:00:00.000Z', [
        { kind: 'page', id: 'p-1', change: 'changed' },
        { kind: 'page', id: 'p-1', change: 'removed' },
        { kind: 'flow', id: 'f-1', change: 'changed' },
        { kind: 'page', id: 'p-new', change: 'added' }, // additions are news, not churn
      ]),
      drifting('2026-07-11T00:00:00.000Z', [{ kind: 'page', id: 'p-1', change: 'changed' }]),
    ]);
    const agg = historicalDriftEvents(h);
    expect(agg.byId.get('p-1')).toBe(3);
    expect(agg.byId.get('f-1')).toBe(1);
    expect(agg.byId.has('p-new')).toBe(false);
  });

  it('handles entries without drift blocks and null history', () => {
    expect(historicalDriftEvents(history([entry('2026-07-10T00:00:00.000Z')])).byId.size).toBe(0);
    expect(historicalDriftEvents(null).byId.size).toBe(0);
  });
});
