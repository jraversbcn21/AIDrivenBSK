import { describe, it, expect } from 'vitest';
import { parseEuroAmount } from './price';

describe('parseEuroAmount', () => {
  it('parses a plain amount', () => { expect(parseEuroAmount('119,95 €')).toBe(119.95); });
  it('parses thousands separators', () => { expect(parseEuroAmount('1.234,56 €')).toBe(1234.56); });
  it('parses an amount embedded in a label', () => { expect(parseEuroAmount('Total 24,99 €')).toBe(24.99); });
  it('takes the FIRST amount when several are present', () => { expect(parseEuroAmount('Antes 3,95 € Gratis 12,00 €')).toBe(3.95); });
  it('returns null when no amount is present', () => { expect(parseEuroAmount('Gratis')).toBeNull(); });
  it('returns null on empty input', () => { expect(parseEuroAmount('')).toBeNull(); });
  it('requires the euro sign', () => { expect(parseEuroAmount('12,34')).toBeNull(); });
});
