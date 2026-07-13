import { describe, it, expect } from 'vitest';
import { sameExtractedElement } from './dedup';
import type { ExtractedElement } from '../types';

const base: ExtractedElement = {
  type: 'button', label: 'Guardar', role: 'button',
  selectorHints: { role: { type: 'button', name: 'Guardar' } }, destructive: false,
};

describe('sameExtractedElement', () => {
  it('is true for two byte-identical elements (count ignored)', () => {
    expect(sameExtractedElement({ ...base }, { ...base, count: 5 })).toBe(true);
  });
  it('is false when selectorHints diverge (e.g. different testId)', () => {
    const a: ExtractedElement = { ...base, selectorHints: { testId: { attr: 'data-qa-anchor', value: 'wish' } } };
    const b: ExtractedElement = { ...base, selectorHints: { testId: { attr: 'data-qa-anchor', value: 'other' } } };
    expect(sameExtractedElement(a, b)).toBe(false);
  });
  it('is false when component provenance diverges', () => {
    expect(sameExtractedElement({ ...base, component: 'Header' }, { ...base })).toBe(false);
  });
});
