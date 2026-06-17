import { describe, it, expect } from 'vitest';
import { makeId } from './ids';

describe('makeId', () => {
  it('is deterministic for the same inputs', () => {
    expect(makeId('page', '/es/cart', 'anon')).toBe(makeId('page', '/es/cart', 'anon'));
  });
  it('differs when any part differs', () => {
    expect(makeId('page', '/es/cart', 'anon')).not.toBe(makeId('page', '/es/cart', 'auth'));
  });
  it('prefixes the id', () => {
    expect(makeId('elem', 'a', 'b')).toMatch(/^elem_[0-9a-f]{12}$/);
  });
});
