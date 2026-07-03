import { describe, it, expect } from 'vitest';
import { urlsToPatterns, isOrderedSubsequence } from './match';

describe('urlsToPatterns', () => {
  it('normalizes absolute URLs to route patterns and collapses consecutive duplicates', () => {
    expect(urlsToPatterns([
      'https://des.example/es/h-woman.html',
      'https://des.example/es/h-woman.html?promo=1',
      'https://des.example/es/camiseta-c0p229723098.html',
    ])).toEqual(['/es/h-woman.html', '/es/camiseta-c0p{id}.html']);
  });
  it('returns an empty list for no urls', () => {
    expect(urlsToPatterns([])).toEqual([]);
  });
});

describe('isOrderedSubsequence', () => {
  const trail = ['/', '/es/h-woman.html', '/es/q/camiseta', '/es/x-c0p{id}.html', '/es/shop-cart.html'];
  it('matches the full trail', () => {
    expect(isOrderedSubsequence(trail, trail)).toBe(true);
  });
  it('matches with interleaved noise pages', () => {
    expect(isOrderedSubsequence(['/', '/es/q/camiseta', '/es/shop-cart.html'], trail)).toBe(true);
  });
  it('rejects order violations', () => {
    expect(isOrderedSubsequence(['/es/shop-cart.html', '/'], trail)).toBe(false);
  });
  it('rejects steps that never appear', () => {
    expect(isOrderedSubsequence(['/es/wishlist.html'], trail)).toBe(false);
  });
  it('an empty needle is trivially covered', () => {
    expect(isOrderedSubsequence([], trail)).toBe(true);
  });
});
