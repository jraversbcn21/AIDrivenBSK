import { describe, it, expect } from 'vitest';
import { buildPageContext } from './context';
import type { PageExtraction } from '../types';

const base: PageExtraction = {
  meta: { path: '/es/x', url: 'u', title: 'T', session: 'anon', discoveredVia: 'seed' },
  landmarkRoles: [], textSummary: '', links: [], elements: [], forms: [], componentKinds: [],
};

describe('buildPageContext', () => {
  it('detects add-to-cart and size-selector signals for a PDP', () => {
    const ex: PageExtraction = { ...base,
      elements: [{ type: 'button', label: 'Añadir a la cesta', role: 'button', selectorHints: {}, destructive: false }],
      textSummary: 'Selecciona tu talla' };
    const ctx = buildPageContext(ex);
    expect(ctx.signals.hasAddToCart).toBe(true);
    expect(ctx.signals.hasSizeSelector).toBe(true);
  });
  it('detects a login form signal', () => {
    const ex: PageExtraction = { ...base, forms: [{ purposeHint: 'login', fields: [] }] };
    expect(buildPageContext(ex).signals.hasLoginForm).toBe(true);
  });
});
