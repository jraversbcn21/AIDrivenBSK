import { describe, it, expect } from 'vitest';
import { parseCycleArgs } from './args';

describe('parseCycleArgs', () => {
  it('defaults: no risk baseline, live probing, no map update, no top override', () => {
    expect(parseCycleArgs([])).toEqual({ noProbe: false, updateMap: false });
  });

  it('accepts flags', () => {
    expect(parseCycleArgs(['--risk', 'b.json', '--no-probe', '--update-map', '--top', '5']))
      .toEqual({ risk: 'b.json', noProbe: true, updateMap: true, top: 5 });
  });

  it('rejects --risk without a path and non-positive --top', () => {
    expect(() => parseCycleArgs(['--risk'])).toThrow(/--risk requires/);
    expect(() => parseCycleArgs(['--risk', '--top'])).toThrow(/--risk requires/);
    expect(() => parseCycleArgs(['--top', '0'])).toThrow(/--top must be a positive number/);
  });
});
