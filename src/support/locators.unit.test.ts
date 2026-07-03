import { describe, it, expect } from 'vitest';
import type { Page, Locator } from '@playwright/test';
import { pickStrategyKey, locate } from './locators';

interface Call { method: string; args: unknown[] }

function makeScope(): { scope: Page; calls: Call[] } {
  const calls: Call[] = [];
  const record = (method: string) => (...args: unknown[]): Locator => {
    calls.push({ method, args });
    return {} as Locator;
  };
  const scope = {
    getByTestId: record('getByTestId'),
    getByRole: record('getByRole'),
    getByLabel: record('getByLabel'),
    getByPlaceholder: record('getByPlaceholder'),
    locator: record('locator'),
  };
  return { scope: scope as unknown as Page, calls };
}

describe('pickStrategyKey', () => {
  it('prefers testId above all', () => {
    expect(pickStrategyKey({ testId: { attr: 'data-testid', value: 'a' }, role: { name: 'x', type: 'button' }, label: 'l' })).toBe('testId');
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

describe('locate testId resolution', () => {
  it('resolves data-testid via getByTestId (genuine Playwright semantics)', () => {
    const { scope, calls } = makeScope();
    locate(scope, { testId: { attr: 'data-testid', value: 'add-to-cart' } });
    expect(calls).toEqual([{ method: 'getByTestId', args: ['add-to-cart'] }]);
  });
  it('resolves data-qa-anchor via a raw CSS attribute locator', () => {
    const { scope, calls } = makeScope();
    locate(scope, { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } });
    expect(calls).toEqual([{ method: 'locator', args: ['[data-qa-anchor="addToCartSizeBtn"]'] }]);
  });
  it('resolves data-qa via a raw CSS attribute locator', () => {
    const { scope, calls } = makeScope();
    locate(scope, { testId: { attr: 'data-qa', value: 'filterButton' } });
    expect(calls).toEqual([{ method: 'locator', args: ['[data-qa="filterButton"]'] }]);
  });
  it('escapes double quotes and backslashes in attribute values', () => {
    const { scope, calls } = makeScope();
    locate(scope, { testId: { attr: 'data-qa', value: 'a"b\\c' } });
    expect(calls).toEqual([{ method: 'locator', args: ['[data-qa="a\\"b\\\\c"]'] }]);
  });
});
