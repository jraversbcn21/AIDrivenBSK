import { describe, it, expect } from 'vitest';
import { parseAnalyzeArgs } from './args';

describe('parseAnalyzeArgs', () => {
  it('defaults to the standard artifact paths with no risk baseline', () => {
    expect(parseAnalyzeArgs([])).toEqual({
      results: 'reports/results.json',
      map: 'coverage/functional-map.json',
      history: 'coverage/run-history.json',
      top: 10,
    });
  });

  it('accepts overrides for results, map, history and top', () => {
    const args = parseAnalyzeArgs(['--results', 'r.json', '--map', 'm.json', '--history', 'h.json', '--top', '5']);
    expect(args.results).toBe('r.json');
    expect(args.map).toBe('m.json');
    expect(args.history).toBe('h.json');
    expect(args.top).toBe(5);
  });

  it('parses --risk with a baseline map path', () => {
    expect(parseAnalyzeArgs(['--risk', 'old-map.json']).risk).toBe('old-map.json');
  });

  it('rejects --risk without a path (or with another flag as its value)', () => {
    expect(() => parseAnalyzeArgs(['--risk'])).toThrow(/--risk requires/);
    expect(() => parseAnalyzeArgs(['--risk', '--top'])).toThrow(/--risk requires/);
  });

  it('rejects a non-positive --top', () => {
    expect(() => parseAnalyzeArgs(['--top', '0'])).toThrow(/--top must be a positive number/);
    expect(() => parseAnalyzeArgs(['--top', 'x'])).toThrow(/--top must be a positive number/);
  });
});
