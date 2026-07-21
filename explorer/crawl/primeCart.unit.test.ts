import { describe, it, expect } from 'vitest';
import { primeCart, type PrimeCartDriver } from './primeCart';

function driver(counts: number[], addImpl: () => Promise<void> = async () => {}): PrimeCartDriver {
  let i = 0;
  return { cartCount: async () => counts[Math.min(i++, counts.length - 1)], addOneItem: addImpl };
}

describe('primeCart', () => {
  it('returns already-primed without adding when the cart has items', async () => {
    let added = false;
    const r = await primeCart(driver([3], async () => { added = true; }));
    expect(r).toBe('already-primed');
    expect(added).toBe(false);
  });

  it('adds one item and verifies when the cart is empty', async () => {
    const r = await primeCart(driver([0, 1]));
    expect(r).toBe('primed');
  });

  it('returns failed when the add did not stick (count still 0)', async () => {
    expect(await primeCart(driver([0, 0]))).toBe('failed');
  });

  it('returns failed when the driver throws (never lets the error escape)', async () => {
    expect(await primeCart(driver([0], async () => { throw new Error('DES noise'); }))).toBe('failed');
  });
});
