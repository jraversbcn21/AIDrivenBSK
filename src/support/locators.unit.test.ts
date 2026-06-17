import { describe, it, expect } from 'vitest';
import { pickStrategyKey } from './locators';

describe('pickStrategyKey', () => {
  it('prefers testId above all', () => {
    expect(pickStrategyKey({ testId: 'a', role: { name: 'x', type: 'button' }, label: 'l' })).toBe('testId');
  });
  it('falls back to role when no testId', () => {
    expect(pickStrategyKey({ role: { name: 'x', type: 'button' }, label: 'l' })).toBe('role');
  });
  it('falls back to label when no testId/role', () => {
    expect(pickStrategyKey({ label: 'l', placeholder: 'p' })).toBe('label');
  });
  it('falls back to placeholder last', () => {
    expect(pickStrategyKey({ placeholder: 'p' })).toBe('placeholder');
  });
  it('throws when nothing is provided', () => {
    expect(() => pickStrategyKey({})).toThrow(/at least one selector/i);
  });
});
