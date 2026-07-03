import { describe, it, expect } from 'vitest';
import { RuleClassifier } from './RuleClassifier';
import type { PageContext } from './Classifier';

const ctx = (over: Partial<PageContext['signals']>, path = '/es/x'): PageContext => ({
  path, title: '', landmarkRoles: [], textSummary: '',
  signals: { hasAddToCart: false, hasSizeSelector: false, hasProductGrid: false, hasFilters: false, hasCheckoutSteps: false, hasLoginForm: false, hasSearchResults: false, ...over },
});

describe('RuleClassifier', () => {
  const c = new RuleClassifier();
  it('classifies PDP from add-to-cart + size', async () => {
    expect((await c.classifyPage(ctx({ hasAddToCart: true, hasSizeSelector: true }))).pageType).toBe('PDP');
  });
  it('classifies PLP from product grid + filters', async () => {
    expect((await c.classifyPage(ctx({ hasProductGrid: true, hasFilters: true }))).pageType).toBe('PLP');
  });
  it('prefers PLP over PDP when a grid page also has per-card quick-add buttons and a stray "talla" mention', async () => {
    // Live-confirmed 2026-07-03: DES's PLP cards each carry their own "Añadir a la cesta"
    // quick-add button, and category pages often mention "talla" somewhere (e.g. a size-guide
    // link) without being a genuine single-product PDP — hasAddToCart+hasSizeSelector alone
    // is too coarse once the grid is visible; the more specific grid+filters signal must win.
    expect((await c.classifyPage(ctx({
      hasAddToCart: true, hasSizeSelector: true, hasProductGrid: true, hasFilters: true,
    }))).pageType).toBe('PLP');
  });
  it('classifies Home from root path', async () => {
    expect((await c.classifyPage(ctx({}, '/es'))).pageType).toBe('Home');
  });
  it('falls back to Other with low confidence', async () => {
    const r = await c.classifyPage(ctx({}, '/es/unknown'));
    expect(r.pageType).toBe('Other');
    expect(r.confidence).toBeLessThan(0.5);
  });
});
