import { describe, it, expect } from 'vitest';
import { classNameFor, specFileNameFor, pageFileNameFor } from './naming';

describe('classNameFor', () => {
  it('PascalCases all non-locale segments and appends Page plus the flowId suffix', () => {
    expect(classNameFor('/es/mujer/ropa/camisetas-n4365.html', 'flow_a1b2c3d4e5f6'))
      .toBe('MujerRopaCamisetasN4365PageA1B2C3D4');
  });
  it('decodes percent-encoding and strips diacritics', () => {
    expect(classNameFor('/es/mujer/sale/jers%c3%a9is-y-sudaderas-c1010850198.html', 'flow_a1b2c3d4e5f6'))
      .toBe('MujerSaleJerseisYSudaderasC1010850198PageA1B2C3D4');
  });
  it('strips {id} tokens from route patterns', () => {
    expect(classNameFor('/es/camiseta-basica-c0p{id}.html', 'flow_a1b2c3d4e5f6')).toBe('CamisetaBasicaC0pPageA1B2C3D4');
  });
  it('falls back to HomePage for the root path', () => {
    expect(classNameFor('/', 'flow_a1b2c3d4e5f6')).toBe('HomePageA1B2C3D4');
  });
  it('produces distinct class names for two flows sharing the same leaf routePattern (regression: product-id collision)', () => {
    // blusa-x-c0p111.html and blusa-x-c0p222.html both normalize to the same routePattern
    // ('/es/blusa-x-c0p{id}.html') once the numeric product id is stripped. Before this fix,
    // classNameFor (and therefore pageFileNameFor) depended only on routePattern, so two
    // unrelated flows would collide on the same page-object class/file and silently overwrite
    // each other's generated page object.
    const a = classNameFor('/es/blusa-x-c0p{id}.html', 'flow_aaaaaaaaaaaa');
    const b = classNameFor('/es/blusa-x-c0p{id}.html', 'flow_bbbbbbbbbbbb');
    expect(a).not.toBe(b);
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
    expect(pageFileNameFor('/es/mujer/ropa/camisetas-n4365.html', 'flow_a1b2c3d4e5f6'))
      .toBe('MujerRopaCamisetasN4365PageA1B2C3D4.ts');
  });
  it('produces distinct file names for two flows sharing the same leaf routePattern', () => {
    const a = pageFileNameFor('/es/blusa-x-c0p{id}.html', 'flow_aaaaaaaaaaaa');
    const b = pageFileNameFor('/es/blusa-x-c0p{id}.html', 'flow_bbbbbbbbbbbb');
    expect(a).not.toBe(b);
  });
});
