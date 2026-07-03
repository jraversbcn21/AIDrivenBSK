import { describe, it, expect } from 'vitest';
import { buildPlanReport } from './propose';
import type { FunctionalMap, MapFlow } from '../../explorer/map/schema';

const flow = (id: string, priority: MapFlow['priority'], steps: string[], coveredBy: string[]): MapFlow => ({
  id, name: id, type: 'Other', session: 'anon', priority, steps, coveredBy,
});

const map: FunctionalMap = {
  schemaVersion: '1.2', generatedAt: '2026-07-02T18:00:00Z', environment: 'des',
  pages: [], components: [], elements: [], forms: [],
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
});
