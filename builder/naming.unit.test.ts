import { describe, it, expect } from 'vitest';
import { classNameFor, specFileNameFor, pageFileNameFor } from './naming';

describe('classNameFor', () => {
  it('PascalCases all non-locale segments and appends Page', () => {
    expect(classNameFor('/es/mujer/ropa/camisetas-n4365.html')).toBe('MujerRopaCamisetasN4365Page');
  });
  it('decodes percent-encoding and strips diacritics', () => {
    expect(classNameFor('/es/mujer/sale/jers%c3%a9is-y-sudaderas-c1010850198.html'))
      .toBe('MujerSaleJerseisYSudaderasC1010850198Page');
  });
  it('strips {id} tokens from route patterns', () => {
    expect(classNameFor('/es/camiseta-basica-c0p{id}.html')).toBe('CamisetaBasicaC0pPage');
  });
  it('falls back to HomePage for the root path', () => {
    expect(classNameFor('/')).toBe('HomePage');
  });
});

describe('specFileNameFor', () => {
  it('kebab leaf slug + 8-char flow hash', () => {
    expect(specFileNameFor('/es/mujer/ropa/camisetas-n4365.html', 'flow_a1b2c3d4e5f6'))
      .toBe('camisetas-n4365-a1b2c3d4.spec.ts');
  });
  it('handles the root path', () => {
    expect(specFileNameFor('/', 'flow_a1b2c3d4e5f6')).toBe('home-a1b2c3d4.spec.ts');
  });
});

describe('pageFileNameFor', () => {
  it('is the class name plus .ts', () => {
    expect(pageFileNameFor('/es/mujer/ropa/camisetas-n4365.html')).toBe('MujerRopaCamisetasN4365Page.ts');
  });
});
