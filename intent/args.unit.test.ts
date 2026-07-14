import { describe, it, expect } from 'vitest';
import { parseAskArgs } from './args';

describe('parseAskArgs', () => {
  it('joins positional words into the query and provides defaults', () => {
    expect(parseAskArgs(['prueba', 'el', 'carrito'])).toEqual({
      query: 'prueba el carrito',
      map: 'coverage/functional-map.json',
      out: 'tests/generated',
      run: false,
      top: 5,
    });
  });

  it('accepts flags mixed with the query', () => {
    const a = parseAskArgs(['prueba', 'zapatos', '--run', '--top', '3', '--map', 'm.json', '--out', 'o']);
    expect(a).toEqual({ query: 'prueba zapatos', map: 'm.json', out: 'o', run: true, top: 3 });
  });

  it('parses --flow as the ambiguity follow-up (skips resolution)', () => {
    expect(parseAskArgs(['--flow', 'flow_abc']).flow).toBe('flow_abc');
  });

  it('requires either a query or --flow', () => {
    expect(() => parseAskArgs([])).toThrow(/query .*or --flow/i);
    expect(() => parseAskArgs(['--run'])).toThrow(/query .*or --flow/i);
  });

  it('rejects --flow without a value and a non-positive --top', () => {
    expect(() => parseAskArgs(['--flow'])).toThrow(/--flow requires/);
    expect(() => parseAskArgs(['x', '--top', '0'])).toThrow(/--top must be a positive number/);
  });
});
