import { describe, it, expect } from 'vitest';
import { Frontier, type FrontierItem } from './frontier';
import { DEFAULT_ROUTE_RULES } from '../url';

const bounds = { maxPages: 3, maxDepth: 2, politenessMs: 0 };
const item = (path: string, depth = 0): FrontierItem => ({ path, session: 'anon', depth, discoveredVia: 'seed' });

describe('Frontier', () => {
  it('dedups by route pattern + session', () => {
    const f = new Frontier(DEFAULT_ROUTE_RULES, bounds);
    expect(f.add(item('/es/category/1/list'))).toBe(true);
    expect(f.add(item('/es/category/2/list'))).toBe(false); // same pattern
  });
  it('rejects denied paths and over-depth items', () => {
    const f = new Frontier(DEFAULT_ROUTE_RULES, bounds);
    expect(f.add(item('/es/campaign/x'))).toBe(false);       // denied
    expect(f.add(item('/es/deep', 5))).toBe(false);          // over maxDepth
  });
  it('stops handing out items past maxPages', () => {
    const f = new Frontier(DEFAULT_ROUTE_RULES, bounds);
    f.add(item('/es/a')); f.add(item('/es/b')); f.add(item('/es/c')); f.add(item('/es/d'));
    let count = 0;
    while (f.next()) count++;
    expect(count).toBe(3); // maxPages
  });
});
