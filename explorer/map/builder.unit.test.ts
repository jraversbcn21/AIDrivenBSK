import { describe, it, expect } from 'vitest';
import { buildMap, type ClassifiedPage } from './builder';
import type { PageExtraction } from '../types';

const pdp: PageExtraction = {
  meta: { path: '/es/abc-c0p123.html', url: 'u', title: 'Camiseta', session: 'anon', discoveredVia: '/es/search' },
  landmarkRoles: ['banner', 'main'], textSummary: 'talla',
  links: [], componentKinds: ['Header'],
  elements: [
    { type: 'button', label: 'Añadir a la cesta', role: 'button', selectorHints: { testId: { attr: 'data-testid', value: 'add' } }, destructive: false },
    { type: 'button', label: 'Buscar en tienda', role: 'button', selectorHints: { role: { type: 'button', name: 'Buscar en tienda' } }, destructive: false, component: 'Header' },
  ],
  forms: [{ purposeHint: 'login', fields: [{ name: 'email', type: 'email', required: true }] }],
};

const classified: ClassifiedPage[] = [{ extraction: pdp, classification: { pageType: 'PDP', confidence: 0.9 } }];

const page = (path: string, discoveredVia: string): PageExtraction => ({
  meta: { path, url: 'u', title: path, session: 'anon', discoveredVia },
  landmarkRoles: [], textSummary: '', links: [], componentKinds: [], elements: [], forms: [],
});

describe('buildMap', () => {
  it('produces a schema-versioned map with stable, deterministic ids', () => {
    const a = buildMap({ classified, environment: 'des', now: '2026-01-01T00:00:00Z' });
    const b = buildMap({ classified, environment: 'des', now: '2026-01-01T00:00:00Z' });
    expect(a.schemaVersion).toBe('1.6');
    expect(a.pages[0].pageType).toBe('PDP');
    expect(a.pages[0].routePattern).toBe('/es/abc-c0p{id}.html');
    expect(a).toEqual(b); // fully deterministic
  });

  it('assigns high priority to PDP flows and maps elements/forms/components to the page', () => {
    const m = buildMap({ classified, environment: 'des' });
    const pageId = m.pages[0].id;
    expect(m.elements[0].pageId).toBe(pageId);
    expect(m.forms[0].purpose).toBe('login');
    expect(m.components.find((c) => c.kind === 'Header')?.foundOnPages).toContain(pageId);
    expect(m.flows.find((f) => f.type.includes('PDP'))?.priority).toBe('high');
  });

  it('propagates PageExtraction.truncated onto the built MapPage (audit F11)', () => {
    const truncatedPage: PageExtraction = { ...page('/es/y', 'seed'), truncated: true };
    const m = buildMap({
      classified: [{ extraction: truncatedPage, classification: { pageType: 'PLP', confidence: 0.9 } }],
      environment: 'des',
    });
    expect(m.pages[0].truncated).toBe(true);
  });

  it('leaves MapPage.truncated unset when the page was not truncated', () => {
    const m = buildMap({ classified, environment: 'des' });
    expect(m.pages[0].truncated).toBeUndefined();
  });

  it('synthesizes the full discoveredVia chain into flow steps and a path-chain name', () => {
    const m = buildMap({
      classified: [
        { extraction: page('/', 'seed'), classification: { pageType: 'Home', confidence: 0.9 } },
        { extraction: page('/es/h-woman.html', '/'), classification: { pageType: 'Other', confidence: 0.3 } },
        { extraction: page('/es/shop-cart.html', '/es/h-woman.html'), classification: { pageType: 'Cart', confidence: 0.8 } },
      ],
      environment: 'des',
    });
    const cartFlow = m.flows.find((f) => f.type === 'Cart');
    const ids = m.pages.map((p) => p.id);
    expect(cartFlow?.steps).toEqual(ids); // root -> hub -> cart, in crawl order
    expect(cartFlow?.name).toBe('/ -> /es/h-woman.html -> /es/shop-cart.html');
    // Seed page keeps a single-step flow (degenerate 1-page chain)
    expect(m.flows.find((f) => f.type === 'Home')?.steps).toEqual([ids[0]]);
  });

  it('stops the chain short when a parent is missing instead of throwing', () => {
    const m = buildMap({
      classified: [
        { extraction: page('/es/orphan.html', '/es/never-crawled.html'), classification: { pageType: 'Other', confidence: 0.3 } },
      ],
      environment: 'des',
    });
    expect(m.flows[0].steps).toEqual([m.pages[0].id]);
    expect(m.flows[0].name).toBe('/es/orphan.html');
  });

  it('never chains across sessions', () => {
    const auth = { ...page('/es/x.html', '/'), meta: { ...page('/es/x.html', '/').meta, session: 'auth' as const } };
    const m = buildMap({
      classified: [
        { extraction: page('/', 'seed'), classification: { pageType: 'Home', confidence: 0.9 } }, // anon
        { extraction: auth, classification: { pageType: 'Other', confidence: 0.3 } },             // auth, parent '/' only exists in anon
      ],
      environment: 'des',
    });
    const authFlow = m.flows.find((f) => f.session === 'auth');
    expect(authFlow?.steps).toHaveLength(1); // anon '/' must NOT be its parent
  });

  it('passes element component provenance through to MapElement (B14)', () => {
    const m = buildMap({ classified, environment: 'des' });
    expect(m.elements.find((e) => e.label === 'Buscar en tienda')?.component).toBe('Header');
    expect(m.elements.find((e) => e.label === 'Añadir a la cesta')?.component).toBeUndefined();
  });

  it('emits interactions and revealed elements with revealedBy back-references', () => {
    const base = page('/es/prod-c0p1.html', 'seed');
    const ex: PageExtraction = { ...base, meta: { ...base.meta, session: 'auth' } };
    ex.elements.push({
      type: 'button', label: 'Añadir a cesta', role: 'button',
      selectorHints: { role: { type: 'button', name: 'Añadir a cesta' } }, destructive: false,
    });
    ex.interactions = [{
      trigger: { role: 'button', label: 'Añadir a cesta', type: 'button' },
      outcome: 'overlay',
      revealedElements: [{
        type: 'button', label: 'Talla S', role: 'button',
        selectorHints: { role: { type: 'button', name: 'Talla S' } }, destructive: false,
      }],
      revealedLinks: [],
    }];

    const m = buildMap({ classified: [{ extraction: ex, classification: { pageType: 'PDP', confidence: 1 } }], environment: 'des' });

    expect(m.schemaVersion).toBe('1.6');
    expect(m.interactions).toHaveLength(1);
    const inter = m.interactions[0];
    const mapPage = m.pages[0];
    const trigger = m.elements.find((e) => e.label === 'Añadir a cesta');
    expect(inter.pageId).toBe(mapPage.id);
    expect(inter.triggerElementId).toBe(trigger?.id);
    expect(inter.outcome).toBe('overlay');
    const revealed = m.elements.find((e) => e.label === 'Talla S');
    expect(revealed?.revealedBy).toBe(inter.id);
    expect(inter.revealedElementIds).toEqual([revealed?.id]);
  });

  it('interactions[] is always present (empty when no extraction has any)', () => {
    const m = buildMap({ classified: [], environment: 'des' });
    expect(m.interactions).toEqual([]);
  });
});
