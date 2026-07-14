import { describe, it, expect } from 'vitest';
import { classifyFailureMessage, stripAnsi } from './classify';

describe('stripAnsi', () => {
  it('removes ANSI color codes (the JSON reporter embeds them in error messages)', () => {
    expect(stripAnsi('[31mError:[39m expect(received)')).toBe('Error: expect(received)');
  });
});

describe('classifyFailureMessage', () => {
  // Real signature strings, taken verbatim from the framework's own throw sites / live findings.

  it('classifies VPN/DNS failures as infrastructure (findings §21)', () => {
    expect(classifyFailureMessage('page.goto: net::ERR_NAME_NOT_RESOLVED at https://des-...')).toBe('infrastructure');
    expect(classifyFailureMessage('Error: getaddrinfo ENOTFOUND des-ecombknj')).toBe('infrastructure');
    expect(classifyFailureMessage('page.goto: Cannot navigate to invalid URL')).toBe('infrastructure');
  });

  it('classifies the A5 diagnostic as catalog-drift (SearchResultsPage.ts:62)', () => {
    expect(classifyFailureMessage(
      'Error: SearchResultsPage: results grid rendered but no standard-add-to-cart product found within 30000ms (all variants Personalizable or out-of-stock?)',
    )).toBe('catalog-drift');
  });

  it('classifies each documented DES pre-prod noise diagnostic as environment-noise', () => {
    // SearchResultsPage.ts:66
    expect(classifyFailureMessage(
      'Error: SearchResultsPage: results grid did not render within 30000ms — dead /q/ load (DES pre-prod noise); the test-level retry re-runs the search',
    )).toBe('environment-noise');
    // SearchBar.ts:51
    expect(classifyFailureMessage(
      'Error: SearchBar: search for "camiseta" did not reach the /q/ results URL within the deadline',
    )).toBe('environment-noise');
    // ProductPage.ts:30 / ProductPage.ts:50
    expect(classifyFailureMessage(
      'Error: ProductPage: the size-selection dialog did not open within the deadline',
    )).toBe('environment-noise');
    expect(classifyFailureMessage(
      'Error: ProductPage: the size dialog did not close after selecting a size (add not confirmed)',
    )).toBe('environment-noise');
    // ProductCard.ts:28
    expect(classifyFailureMessage(
      'Error: ProductCard: click did not navigate to a product detail page within the deadline',
    )).toBe('environment-noise');
  });

  it('classifies strict-mode violations as selector-drift (B16/M9 family, findings §16/§17/§20)', () => {
    expect(classifyFailureMessage(
      'Error: strict mode violation: getByRole(\'dialog\') resolved to 2 elements',
    )).toBe('selector-drift');
  });

  it('classifies an action timeout waiting for a gone element as selector-drift, NOT timeout (A6 family, §19)', () => {
    // Order-sensitivity: this real shape contains both "Test timeout ... exceeded" and
    // "waiting for getBy..." — the selector rule must win over the generic timeout rule.
    expect(classifyFailureMessage(
      'locator.click: Test timeout of 120000ms exceeded.\nCall log:\n  - waiting for getByRole(\'button\', { name: /continuar con e-?mail/i })',
    )).toBe('selector-drift');
    expect(classifyFailureMessage(
      'locator.fill: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator(\'[data-qa-anchor="addToCartSizeBtn"]\')',
    )).toBe('selector-drift');
  });

  it('classifies expect failures as assertion, including locator-expect timeouts', () => {
    expect(classifyFailureMessage(
      'Error: expect(received).toBe(expected) // Object.is equality\n\nExpected: true\nReceived: false',
    )).toBe('assertion');
    // "waiting for expect(locator..." must NOT match the selector-drift "waiting for locator" rule.
    expect(classifyFailureMessage(
      'Timed out 20000ms waiting for expect(locator).toBeVisible()',
    )).toBe('assertion');
  });

  it('classifies a bare test timeout with no locator/expect context as timeout', () => {
    expect(classifyFailureMessage('Test timeout of 120000ms exceeded.')).toBe('timeout');
  });

  it('falls back to unknown for unrecognized messages and missing messages', () => {
    expect(classifyFailureMessage('Error: something completely novel happened')).toBe('unknown');
    expect(classifyFailureMessage(undefined)).toBe('unknown');
    expect(classifyFailureMessage('')).toBe('unknown');
  });

  it('classifies through ANSI codes (real reporter output is colorized)', () => {
    expect(classifyFailureMessage('[31mError: strict mode violation:[39m getByRole resolved to 2 elements')).toBe('selector-drift');
  });
});
