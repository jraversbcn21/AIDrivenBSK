import { describe, it, expect } from 'vitest';
import { buildPlanReport } from './propose';
import type { FunctionalMap, MapFlow } from '../../explorer/map/schema';

const flow = (id: string, priority: MapFlow['priority'], steps: string[], coveredBy: string[]): MapFlow => ({
  id, name: id, type: 'Other', session: 'anon', priority, steps, coveredBy,
});

const map: FunctionalMap = {
  schemaVersion: '1.2', generatedAt: '2026-07-02T18:00:00Z', environment: 'des',
  pages: [], components: [], elements: [], forms: [], interactions: [],
  flows: [
    flow('covered-high', 'high', ['a', 'b'], ['tests/x.spec.ts']),
    flow('deep-high', 'high', ['a', 'b', 'c'], []),
    flow('shallow-high', 'high', ['a'], []),
    flow('deep-low', 'low', ['a', 'b', 'c', 'd'], []),
    flow('med', 'med', ['a'], []),
  ],
};

describe('buildPlanReport', () => {
  const r = buildPlanReport(map, '2026-07-02T20:00:00Z', '2026-07-02T21:00:00Z');

  it('counts covered vs uncovered and carries both timestamps', () => {
    expect(r.flows).toEqual({ total: 5, covered: 1, uncovered: 4 });
    expect(r.mapGeneratedAt).toBe('2026-07-02T18:00:00Z');
    expect(r.evidenceGeneratedAt).toBe('2026-07-02T20:00:00Z');
    expect(r.uncoveredByPriority).toEqual({ high: 2, med: 1, low: 1 });
  });
  it('ranks proposals by priority, then chain depth (desc), then name', () => {
    expect(r.proposals.map((p) => p.flowId)).toEqual(['deep-high', 'shallow-high', 'med', 'deep-low']);
  });
  it('writes a deterministic rationale', () => {
    expect(r.proposals[0].rationale).toBe('high-priority 3-step journey, no spec exercises it');
  });

  it('is byte-identical without drift history — Phase 8 is strictly additive (regression lock)', () => {
    const withUndefined = buildPlanReport(map, '2026-07-02T20:00:00Z', '2026-07-02T21:00:00Z', undefined);
    expect(withUndefined).toEqual(r);
    expect(withUndefined.proposals.every((p) => !('driftEvents' in p))).toBe(true);
  });

  it('ranks drift-prone flows above equal-priority stable ones, below higher priority (Phase 8)', () => {
    // 'shallow-high' steps through page 'a' which drifted 3 times; 'deep-high' is stable.
    const drift = new Map([['a', 3]]);
    const withDrift = buildPlanReport(map, '2026-07-02T20:00:00Z', '2026-07-02T21:00:00Z', drift);
    // deep-high also steps 'a'! Both high flows step page 'a' -> same driftEvents; falls to depth.
    // 'med' steps 'a' too but stays below both highs: priority still wins over drift.
    expect(withDrift.proposals.map((p) => p.flowId)).toEqual(['deep-high', 'shallow-high', 'med', 'deep-low']);
    expect(withDrift.proposals[0].driftEvents).toBe(3);
    // now target drift at a page only 'shallow-high' does NOT step: 'c' (deep-high steps a,b,c)
    const drift2 = new Map([['c', 2]]);
    const withDrift2 = buildPlanReport(map, '2026-07-02T20:00:00Z', '2026-07-02T21:00:00Z', drift2);
    expect(withDrift2.proposals.map((p) => p.flowId)).toEqual(['deep-high', 'shallow-high', 'med', 'deep-low']);
    expect(withDrift2.proposals[0].driftEvents).toBe(2);
    expect(withDrift2.proposals[1].driftEvents).toBe(0);
  });

  it('drift breaks ties among equal-priority flows and counts flow-id drift too', () => {
    const tieMap: FunctionalMap = {
      ...map,
      flows: [
        flow('stable-high', 'high', ['x', 'y', 'z'], []),
        flow('drifty-high', 'high', ['x'], []),
      ],
    };
    // Without drift: stable-high first (3 steps beat 1). With drift on drifty-high's own
    // flow id: drifty-high overtakes despite being shallower — the learning effect.
    const before = buildPlanReport(tieMap, 'e', 'n');
    expect(before.proposals.map((p) => p.flowId)).toEqual(['stable-high', 'drifty-high']);
    const after = buildPlanReport(tieMap, 'e', 'n', new Map([['drifty-high', 2]]));
    expect(after.proposals.map((p) => p.flowId)).toEqual(['drifty-high', 'stable-high']);
    expect(after.proposals[0].driftEvents).toBe(2);
    expect(after.proposals[0].rationale).toContain('2 drift event(s)');
  });
});
