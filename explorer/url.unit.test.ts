import { describe, it, expect } from 'vitest';
import { normalizePath, routePattern, isAllowed, isDenied, DEFAULT_ROUTE_RULES } from './url';

const BASE = 'https://des.example/es/';

describe('normalizePath', () => {
  it('returns lowercase pathname without trailing slash', () => {
    expect(normalizePath('https://des.example/es/Search/', BASE)).toBe('/es/search');
  });
  it('resolves relative URLs against base', () => {
    expect(normalizePath('/es/cart', BASE)).toBe('/es/cart');
  });
  it('keeps root as "/"', () => {
    expect(normalizePath('https://des.example/', BASE)).toBe('/');
  });
});

describe('routePattern', () => {
  it('collapses numeric id segments', () => {
    expect(routePattern('/es/category/1234/list')).toBe('/es/category/{id}/list');
  });
});

describe('route rules', () => {
  it('denies marketing/campaign paths', () => {
    expect(isDenied('/es/campaign/summer', DEFAULT_ROUTE_RULES)).toBe(true);
    expect(isAllowed('/es/campaign/summer', DEFAULT_ROUTE_RULES)).toBe(false);
  });
  it('allows ordinary paths when allowlist is empty', () => {
    expect(isAllowed('/es/search', DEFAULT_ROUTE_RULES)).toBe(true);
  });
  it('does not over-match legitimate paths containing a denied word as a substring', () => {
    expect(isDenied('/es/marketing-jobs', DEFAULT_ROUTE_RULES)).toBe(false);
    expect(isAllowed('/es/marketing-jobs', DEFAULT_ROUTE_RULES)).toBe(true);
    expect(isDenied('/es/campaign/summer', DEFAULT_ROUTE_RULES)).toBe(true);
  });
});
