import { describe, it, expect } from 'vitest';
import { parseHealArgs } from './args';

describe('parseHealArgs', () => {
  it('defaults to the standard artifact paths, live probing on, top 3', () => {
    expect(parseHealArgs([])).toEqual({
      failures: 'reports/analyzer/failure-report.json',
      map: 'coverage/functional-map.json',
      probe: true,
      top: 3,
    });
  });

  it('accepts overrides and --no-probe', () => {
    const args = parseHealArgs(['--failures', 'f.json', '--map', 'm.json', '--no-probe', '--top', '5']);
    expect(args).toEqual({ failures: 'f.json', map: 'm.json', probe: false, top: 5 });
  });

  it('rejects a non-positive --top', () => {
    expect(() => parseHealArgs(['--top', '0'])).toThrow(/--top must be a positive number/);
    expect(() => parseHealArgs(['--top', 'x'])).toThrow(/--top must be a positive number/);
  });
});
