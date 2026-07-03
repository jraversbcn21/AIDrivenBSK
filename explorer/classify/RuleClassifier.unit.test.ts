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
  it('classifies PDP from the -c0p path pattern even when checkout-ish text fires and no size signal exists', async () => {
    // Live-confirmed B13 (2026-07-03): every DES PDP carries an "Envíos y devoluciones"
    // accordion (hasCheckoutSteps fires), while the real size selector lives inside the
    // "Tallas" dialog the crawler never opens (hasSizeSelector is a hydration-timing
    // accident). 16/18 -c0p pages in the canonical map were mislabeled Checkout this way.
    const r = await c.classifyPage(ctx(
      { hasAddToCart: true, hasCheckoutSteps: true },
      '/es/top-bandeau-fruncido-c0p229723039.html',
    ));
    expect(r.pageType).toBe('PDP');
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
  });
  it('PDP path pattern beats the PLP grid signal (recommendations carousel on a PDP)', async () => {
    expect((await c.classifyPage(ctx(
      { hasProductGrid: true, hasFilters: true, hasAddToCart: true },
      '/es/camiseta-manga-corta-c0p207356814.html',
    ))).pageType).toBe('PDP');
  });
  it('classifies the real DES cart path shop-cart.html as Cart even with checkout-ish text', async () => {
    // The old Cart rule regex (/\/cart|\/cesta/) never matched shop-cart.html, and the
    // Checkout text rule fired first — the map's auth cart page was labeled Checkout.
    expect((await c.classifyPage(ctx(
      { hasCheckoutSteps: true, hasAddToCart: true },
      '/es/shop-cart.html',
    ))).pageType).toBe('Cart');
  });
  it('does not classify Checkout from text alone (shopping-guide shape)', async () => {
    expect((await c.classifyPage(ctx(
      { hasCheckoutSteps: true },
      '/es/shopping-guide.html',
    ))).pageType).toBe('Other');
  });
  it('still classifies Checkout when the text signal and a checkout-like path agree', async () => {
    expect((await c.classifyPage(ctx(
      { hasCheckoutSteps: true },
      '/es/checkout/payment',
    ))).pageType).toBe('Checkout');
  });
  it('does not classify Cart from a "carteras" (handbags) category that only contains "cart" as a substring', async () => {
    // Task-review finding on 425e491: /\/cart|\/cesta/ is unanchored and matches any path
    // containing "cart" as a substring, not just the "cart" path segment. "carteras" (bags)
    // is a plausible real Bershka category and must not be masked as Cart.
    expect((await c.classifyPage(ctx(
      { hasProductGrid: true, hasFilters: true },
      '/es/mujer/carteras-n4365.html',
    ))).pageType).toBe('PLP');
  });
  it('does not classify Cart from a city name ("cartagena") that only contains "cart" as a substring', async () => {
    expect((await c.classifyPage(ctx(
      {},
      '/es/tiendas/cartagena-viajero.html',
    ))).pageType).not.toBe('Cart');
  });
  it('still classifies Cart from a real "cesta" path segment', async () => {
    expect((await c.classifyPage(ctx({}, '/es/cesta'))).pageType).toBe('Cart');
  });
  it('does not classify Checkout from "order" embedded as a substring inside another word ("cordero")', async () => {
    // Same class of bug as the Cart regex: /checkout|order|pago|payment/ is unanchored.
    expect((await c.classifyPage(ctx(
      { hasCheckoutSteps: true },
      '/es/mujer/jersey-lana-cordero.html',
    ))).pageType).not.toBe('Checkout');
  });
});
