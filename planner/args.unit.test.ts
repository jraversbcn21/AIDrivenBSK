import { describe, it, expect } from 'vitest';
import { parsePlanArgs } from './args';

describe('parsePlanArgs', () => {
  it('provides defaults', () => {
    expect(parsePlanArgs([])).toEqual({
      update: false, map: 'coverage/functional-map.json', evidence: 'reports/route-evidence.json', top: 10,
    });
  });
  it('parses flags', () => {
    const a = parsePlanArgs(['--update', '--map', 'm.json', '--evidence', 'e.json', '--top', '3']);
    expect(a).toEqual({ update: true, map: 'm.json', evidence: 'e.json', top: 3 });
  });
  it('rejects a non-positive --top', () => {
    expect(() => parsePlanArgs(['--top', '0'])).toThrow(/--top/);
  });
});
