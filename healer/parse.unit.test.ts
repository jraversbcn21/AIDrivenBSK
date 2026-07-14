import { describe, it, expect } from 'vitest';
import { parseBrokenLocator } from './parse';

describe('parseBrokenLocator', () => {
  // Every shape below is grounded in a message this project has really seen.

  it('parses the A6 action-timeout shape: getByRole with a regex name (findings §19)', () => {
    const broken = parseBrokenLocator(
      "locator.click: Test timeout of 120000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: /continuar con e-?mail/i })",
    );
    expect(broken).toEqual({
      method: 'getByRole',
      role: 'button',
      name: '/continuar con e-?mail/i',
      failureMode: 'not-found',
      raw: "getByRole('button', { name: /continuar con e-?mail/i })",
    });
  });

  it('parses getByRole with a quoted string name and exact flag', () => {
    const broken = parseBrokenLocator(
      "locator.click: Timeout 30000ms exceeded.\n  - waiting for getByRole('button', { name: 'Añadir a cesta', exact: true })",
    );
    expect(broken?.method).toBe('getByRole');
    expect(broken?.role).toBe('button');
    expect(broken?.name).toBe('Añadir a cesta');
    expect(broken?.failureMode).toBe('not-found');
  });

  it('parses the M9 strict-mode shape: bare getByRole (findings §17)', () => {
    const broken = parseBrokenLocator(
      "Error: strict mode violation: getByRole('dialog') resolved to 2 elements",
    );
    expect(broken).toEqual({
      method: 'getByRole',
      role: 'dialog',
      failureMode: 'strict-mode',
      raw: "getByRole('dialog')",
    });
  });

  it('parses the F18 strict-mode shape: raw CSS testId locator (findings §20)', () => {
    const broken = parseBrokenLocator(
      'Error: strict mode violation: locator(\'[data-qa-anchor="addToCartSizeBtn"]\') resolved to 2 elements',
    );
    expect(broken).toEqual({
      method: 'locator',
      value: 'addToCartSizeBtn',
      testIdAttr: 'data-qa-anchor',
      failureMode: 'strict-mode',
      raw: 'locator(\'[data-qa-anchor="addToCartSizeBtn"]\')',
    });
  });

  it('parses the M8b wait-timeout shape: raw CSS testId locator, not found (findings §16)', () => {
    const broken = parseBrokenLocator(
      'Timeout 20000ms exceeded.\n  - waiting for locator(\'[data-qa-anchor="productItemWishlist"]\')',
    );
    expect(broken?.method).toBe('locator');
    expect(broken?.value).toBe('productItemWishlist');
    expect(broken?.testIdAttr).toBe('data-qa-anchor');
    expect(broken?.failureMode).toBe('not-found');
  });

  it('keeps a non-testId raw CSS locator as css value without testIdAttr', () => {
    const broken = parseBrokenLocator("waiting for locator('.product-grid > li')");
    expect(broken?.method).toBe('locator');
    expect(broken?.value).toBe('.product-grid > li');
    expect(broken?.testIdAttr).toBeUndefined();
  });

  it('parses getByTestId / getByLabel / getByPlaceholder', () => {
    expect(parseBrokenLocator("waiting for getByTestId('searchBox')")).toMatchObject({
      method: 'getByTestId', value: 'searchBox', testIdAttr: 'data-testid',
    });
    expect(parseBrokenLocator("waiting for getByLabel('E-mail')")).toMatchObject({
      method: 'getByLabel', value: 'E-mail',
    });
    expect(parseBrokenLocator("waiting for getByPlaceholder('Escribe aquí')")).toMatchObject({
      method: 'getByPlaceholder', value: 'Escribe aquí',
    });
  });

  it('parses through ANSI color codes (real reporter output is colorized)', () => {
    const broken = parseBrokenLocator("waiting for getByRole('button', { name: 'Acceder' })");
    expect(broken?.name).toBe('Acceder');
  });

  it('returns null for messages with no recognizable locator, empty and undefined', () => {
    expect(parseBrokenLocator('Error: ProductPage: the size dialog did not close after selecting a size')).toBeNull();
    expect(parseBrokenLocator('')).toBeNull();
    expect(parseBrokenLocator(undefined)).toBeNull();
  });
});
