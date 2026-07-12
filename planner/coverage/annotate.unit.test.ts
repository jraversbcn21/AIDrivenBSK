import { describe, it, expect } from 'vitest';
import { annotateCoverage } from './annotate';
import type { FunctionalMap } from '../../explorer/map/schema';
import type { RouteEvidence } from '../types';

const map: FunctionalMap = {
  schemaVersion: '1.1', generatedAt: '2026-07-02T18:00:00Z', environment: 'des',
  pages: [
    { id: 'pA', path: '/', routePattern: '/', pageType: 'Home', session: 'anon', title: 'Home', discoveredVia: 'seed' },
    { id: 'pB', path: '/es/shop-cart.html', routePattern: '/es/shop-cart.html', pageType: 'Cart', session: 'anon', title: 'Cesta', discoveredVia: '/' },
    { id: 'pA2', path: '/', routePattern: '/', pageType: 'Home', session: 'auth', title: 'Home', discoveredVia: 'seed' },
    { id: 'pB2', path: '/es/shop-cart.html', routePattern: '/es/shop-cart.html', pageType: 'Cart', session: 'auth', title: 'Cesta', discoveredVia: '/' },
    { id: 'pC', path: '/es/wishlist.html', routePattern: '/es/wishlist.html', pageType: 'Wishlist', session: 'anon', title: 'W', discoveredVia: '/' },
  ],
  components: [], elements: [], forms: [],
  flows: [
    { id: 'fCart', name: '/ -> /es/shop-cart.html', type: 'Cart', session: 'anon', priority: 'high', steps: ['pA', 'pB'] },
    { id: 'fCart2', name: '/ -> /es/shop-cart.html', type: 'Cart', session: 'auth', priority: 'high', steps: ['pA2', 'pB2'] },
    { id: 'fWish', name: '/es/wishlist.html', type: 'Wishlist', session: 'anon', priority: 'high', steps: ['pC'] },
  ],
  interactions: [],
};

const evidence: RouteEvidence = {
  generatedAt: '2026-07-02T20:00:00Z',
  tests: [
    { spec: 'tests/cart/add-to-cart.spec.ts', title: 'adds', status: 'passed',
      urls: ['https://x/', 'https://x/es/promo-banner.html', 'https://x/es/shop-cart.html'] },
    { spec: 'tests/wish/wishlist.spec.ts', title: 'wishes', status: 'failed',
      urls: ['https://x/es/wishlist.html'] },
  ],
};

describe('annotateCoverage', () => {
  const out = annotateCoverage(map, evidence);

  it('bumps schemaVersion and leaves the input untouched', () => {
    expect(out.schemaVersion).toBe('1.6');
    expect(map.flows[0].coveredBy).toBeUndefined(); // pure: input not mutated
  });
  it('covers a flow when its step patterns are an ordered subsequence of a PASSED test', () => {
    expect(out.flows.find((f) => f.id === 'fCart')?.coveredBy).toEqual(['tests/cart/add-to-cart.spec.ts']);
  });
  it('annotates both session variants of the same chain (v1 session simplification)', () => {
    expect(out.flows.find((f) => f.id === 'fCart2')?.coveredBy).toEqual(['tests/cart/add-to-cart.spec.ts']);
  });
  it('ignores failed tests: every flow still carries coveredBy, empty when uncovered', () => {
    expect(out.flows.find((f) => f.id === 'fWish')?.coveredBy).toEqual([]);
  });
});
