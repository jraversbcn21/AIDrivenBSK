import { describe, it, expect } from 'vitest';
import { decideVerdict } from './verdict';

describe('decideVerdict', () => {
  it('skips overlay candidates without probing (M8 lesson: not load-visible by design)', () => {
    expect(decideVerdict({ revealedBy: true })).toBe('skipped-overlay');
  });

  it('validates a unique, visible observation', () => {
    expect(decideVerdict({ revealedBy: false, observed: { count: 1, visible: true } })).toBe('validated');
  });

  it('rejects by count: 0 => not-found, >1 => not-unique (a strict-mode break in waiting)', () => {
    expect(decideVerdict({ revealedBy: false, observed: { count: 0, visible: false } })).toBe('rejected-not-found');
    expect(decideVerdict({ revealedBy: false, observed: { count: 38, visible: true } })).toBe('rejected-not-unique');
  });

  it('rejects unique-but-invisible', () => {
    expect(decideVerdict({ revealedBy: false, observed: { count: 1, visible: false } })).toBe('rejected-not-visible');
  });

  it('reports a probe error as error, and no observation at all as not-probed', () => {
    expect(decideVerdict({ revealedBy: false, error: 'net::ERR_NAME_NOT_RESOLVED' })).toBe('error');
    expect(decideVerdict({ revealedBy: false })).toBe('not-probed');
  });

  it('skipped-overlay wins over an accidental observation, error wins over observation', () => {
    expect(decideVerdict({ revealedBy: true, observed: { count: 1, visible: true } })).toBe('skipped-overlay');
    expect(decideVerdict({ revealedBy: false, error: 'boom', observed: { count: 1, visible: true } })).toBe('error');
  });
});
