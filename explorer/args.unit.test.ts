import { describe, it, expect } from 'vitest';
import { parseArgs } from './args';

describe('parseArgs', () => {
  it('defaults to both sessions, no diff/update, canonical out path', () => {
    const a = parseArgs([]);
    expect(a).toEqual({ session: 'both', diff: false, update: false, failOnNew: false, out: 'coverage/functional-map.json' });
  });
  it('parses flags', () => {
    const a = parseArgs(['--session', 'anon', '--diff', '--update', '--fail-on-new', '--out', 'x.json']);
    expect(a).toEqual({ session: 'anon', diff: true, update: true, failOnNew: true, out: 'x.json' });
  });
  it('rejects an invalid session', () => {
    expect(() => parseArgs(['--session', 'nope'])).toThrow(/session/);
  });
  it('defaults fromReport to undefined and parses --from-report (audit F12)', () => {
    expect(parseArgs([]).fromReport).toBeUndefined();
    expect(parseArgs(['--from-report', 'reports/explorer/x.json']).fromReport).toBe('reports/explorer/x.json');
  });
});
