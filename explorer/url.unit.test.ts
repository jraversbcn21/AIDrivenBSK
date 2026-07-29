import { describe, it, expect } from 'vitest';
import { normalizePath, routePattern, isAllowed, isDenied, DEFAULT_ROUTE_RULES, isSameOrigin, withDevice } from './url';

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

describe('withDevice', () => {
  it('appends ?device=<value> to a bare path', () => {
    expect(withDevice('/es/h-woman.html', 'desktop')).toBe('/es/h-woman.html?device=desktop');
  });
  it('appends with & when the path already has a query string', () => {
    expect(withDevice('/es/list.html?page=2', 'desktop')).toBe('/es/list.html?page=2&device=desktop');
  });
  it('is the identity when device is empty (param disabled, server default layout)', () => {
    expect(withDevice('/es/h-woman.html', '')).toBe('/es/h-woman.html');
  });
  it('round-trips cleanly through normalizePath (map paths stay param-free)', () => {
    expect(normalizePath(withDevice('/es/h-woman.html', 'desktop'), BASE)).toBe('/es/h-woman.html');
  });
});

describe('routePattern', () => {
  it('collapses numeric id segments', () => {
    expect(routePattern('/es/category/1234/list')).toBe('/es/category/{id}/list');
  });
  it('collapses the real DES product-detail id pattern (-c0p{id}.html)', () => {
    expect(routePattern('/es/camiseta-manga-corta-fruncido-c0p229723098.html')).toBe('/es/camiseta-manga-corta-fruncido-c0p{id}.html');
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

describe('isSameOrigin', () => {
  it('treats relative path as same-origin', () => {
    expect(isSameOrigin('/es/cart', BASE)).toBe(true);
  });
  it('treats relative path without leading slash as same-origin', () => {
    expect(isSameOrigin('category/x', BASE)).toBe(true);
  });
  it('treats absolute same-host URL as same-origin', () => {
    expect(isSameOrigin('https://des.example/es/foo', BASE)).toBe(true);
  });
  it('treats absolute different-host URL as cross-origin', () => {
    expect(isSameOrigin('https://evil.com/x', BASE)).toBe(false);
  });
  it('treats protocol-relative different-host URL as cross-origin', () => {
    expect(isSameOrigin('//cdn.other.com/z', BASE)).toBe(false);
  });
  it('treats malformed href as cross-origin', () => {
    expect(isSameOrigin('mailto:a@b.com', BASE)).toBe(false);
  });
});
