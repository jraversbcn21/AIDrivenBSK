import { describe, it, expect } from 'vitest';
import { buildMap, type ClassifiedPage } from './builder';
import type { PageExtraction } from '../types';

const pdp: PageExtraction = {
  meta: { path: '/es/abc-c0p123.html', url: 'u', title: 'Camiseta', session: 'anon', discoveredVia: '/es/search' },
  landmarkRoles: ['banner', 'main'], textSummary: 'talla',
  links: [], componentKinds: ['Header'],
  elements: [{ type: 'button', label: 'Añadir a la cesta', role: 'button', selectorHints: { testId: 'add' }, destructive: false }],
  forms: [{ purposeHint: 'login', fields: [{ name: 'email', type: 'email', required: true }] }],
};

const classified: ClassifiedPage[] = [{ extraction: pdp, classification: { pageType: 'PDP', confidence: 0.9 } }];

describe('buildMap', () => {
  it('produces a schema-versioned map with stable, deterministic ids', () => {
    const a = buildMap({ classified, environment: 'des', now: '2026-01-01T00:00:00Z' });
    const b = buildMap({ classified, environment: 'des', now: '2026-01-01T00:00:00Z' });
    expect(a.schemaVersion).toBe('1.0');
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
});
