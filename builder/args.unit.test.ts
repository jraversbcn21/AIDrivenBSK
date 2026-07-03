import { describe, it, expect } from 'vitest';
import { parseBuildArgs } from './args';

describe('parseBuildArgs', () => {
  it('provides defaults', () => {
    expect(parseBuildArgs([])).toEqual({
      top: 3, proposals: 'reports/planner/proposals.json', map: 'coverage/functional-map.json', out: 'tests/generated',
    });
  });
  it('parses flags', () => {
    expect(parseBuildArgs(['--top', '5', '--proposals', 'p.json', '--map', 'm.json', '--out', 'o']))
      .toEqual({ top: 5, proposals: 'p.json', map: 'm.json', out: 'o' });
  });
  it('rejects a non-positive --top', () => {
    expect(() => parseBuildArgs(['--top', '0'])).toThrow(/--top/);
  });
});
