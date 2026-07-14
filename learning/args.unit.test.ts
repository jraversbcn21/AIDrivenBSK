import { describe, it, expect } from 'vitest';
import { parseLearnArgs } from './args';

describe('parseLearnArgs', () => {
  it('defaults to the standard artifact paths and 50 max entries', () => {
    expect(parseLearnArgs([])).toEqual({
      failures: 'reports/analyzer/failure-report.json',
      risk: 'reports/analyzer/risk-report.json',
      history: 'coverage/run-history.json',
      maxEntries: 50,
    });
  });

  it('accepts overrides', () => {
    const args = parseLearnArgs(['--failures', 'f.json', '--risk', 'r.json', '--history', 'h.json', '--max-entries', '10']);
    expect(args).toEqual({ failures: 'f.json', risk: 'r.json', history: 'h.json', maxEntries: 10 });
  });

  it('rejects a non-positive --max-entries', () => {
    expect(() => parseLearnArgs(['--max-entries', '0'])).toThrow(/--max-entries must be a positive number/);
    expect(() => parseLearnArgs(['--max-entries', 'x'])).toThrow(/--max-entries must be a positive number/);
  });
});
