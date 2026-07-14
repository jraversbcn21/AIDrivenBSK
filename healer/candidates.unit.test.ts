import { describe, it, expect } from 'vitest';
import type { FunctionalMap, MapElement, MapFlow, MapPage } from '../explorer/map/schema';
import type { BrokenLocator } from './parse';
import { findCandidates } from './candidates';

// --- fixture factories ---

function makePage(id: string, path: string): MapPage {
  return { id, path, routePattern: path, pageType: 'Other', session: 'anon', title: id, discoveredVia: 'seed' };
}

function makeElement(id: string, pageId: string, label: string, overrides: Partial<MapElement> = {}): MapElement {
  return {
    id, pageId, type: 'button', label, role: 'button',
    selectorHints: { role: { type: 'button', name: label }, label },
    destructive: false,
    ...overrides,
  };
}

function makeFlow(id: string, steps: string[]): MapFlow {
  return { id, name: id, type: 'Other', session: 'anon', priority: 'med', steps };
}

function makeMap(parts: Partial<FunctionalMap>): FunctionalMap {
  return {
    schemaVersion: '1.7', generatedAt: '2026-07-14T00:00:00.000Z', environment: 'des',
    pages: [], components: [], elements: [], forms: [], flows: [], interactions: [],
    ...parts,
  };
}

const roleBroken = (name: string): BrokenLocator => ({
  method: 'getByRole', role: 'button', name, failureMode: 'not-found', raw: `getByRole('button', { name: '${name}' })`,
});

describe('findCandidates', () => {
  it('ranks an exact (diacritic/case-insensitive) label match above containment and token overlap', () => {
    const map = makeMap({
      pages: [makePage('p1', '/es/x')],
      elements: [
        makeElement('e-exact', 'p1', 'Añadir a cesta'),
        makeElement('e-contains', 'p1', 'Añadir a cesta Camiseta rib'),
        makeElement('e-tokens', 'p1', 'Ver cesta'),
      ],
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(roleBroken('anadir a CESTA'), ['f1'], map, 3);
    expect(result.scope).toBe('flows');
    expect(result.candidates.map((c) => c.elementId)).toEqual(['e-exact', 'e-contains', 'e-tokens']);
    expect(result.candidates[0].matchEvidence).toEqual(expect.arrayContaining([expect.stringContaining('exact label match')]));
  });

  it('matches a regex name (the A6 shape) against candidate labels', () => {
    const map = makeMap({
      pages: [makePage('p-logon', '/es/logon.html')],
      elements: [
        makeElement('e-login', 'p-logon', 'Iniciar sesión'),
        makeElement('e-email', 'p-logon', 'Continuar con e-mail'),
      ],
      flows: [makeFlow('f-login', ['p-logon'])],
    });
    const result = findCandidates(
      { method: 'getByRole', role: 'button', name: '/continuar con e-?mail/i', failureMode: 'not-found', raw: 'x' },
      ['f-login'], map, 3,
    );
    expect(result.candidates[0].elementId).toBe('e-email');
    expect(result.candidates[0].matchEvidence).toEqual(expect.arrayContaining([expect.stringContaining('regex')]));
  });

  it('prefers role agreement and penalizes role mismatch', () => {
    const map = makeMap({
      pages: [makePage('p1', '/es/x')],
      elements: [
        makeElement('e-link', 'p1', 'Iniciar sesión', { role: 'link', selectorHints: { role: { type: 'link', name: 'Iniciar sesión' } } }),
        makeElement('e-btn', 'p1', 'Iniciar sesión'),
      ],
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(roleBroken('Iniciar sesión'), ['f1'], map, 3);
    expect(result.candidates[0].elementId).toBe('e-btn');
  });

  it('penalizes shared chrome and revealedBy elements below page-specific load-visible ones', () => {
    const map = makeMap({
      pages: [makePage('p1', '/es/x')],
      elements: [
        makeElement('e-chrome', 'p1', 'Buscar', { component: 'Header' }),
        makeElement('e-revealed', 'p1', 'Buscar', { revealedBy: 'int_1' }),
        makeElement('e-body', 'p1', 'Buscar'),
      ],
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(roleBroken('Buscar'), ['f1'], map, 3);
    expect(result.candidates[0].elementId).toBe('e-body');
    expect(result.candidates.find((c) => c.elementId === 'e-revealed')?.revealedBy).toBe(true);
  });

  it('scopes to flowsAffected step pages (all steps, not just leaves) and falls back map-wide', () => {
    const map = makeMap({
      pages: [makePage('p-mid', '/es/mid'), makePage('p-leaf', '/es/leaf'), makePage('p-other', '/es/other')],
      elements: [
        makeElement('e-mid', 'p-mid', 'Objetivo'),
        makeElement('e-elsewhere', 'p-other', 'Objetivo'),
      ],
      flows: [makeFlow('f1', ['p-mid', 'p-leaf'])],
    });
    // in-scope: only the mid-step element, not the one on p-other
    const scoped = findCandidates(roleBroken('Objetivo'), ['f1'], map, 3);
    expect(scoped.scope).toBe('flows');
    expect(scoped.candidates.map((c) => c.elementId)).toEqual(['e-mid']);
    // no flows => map-wide fallback
    const wide = findCandidates(roleBroken('Objetivo'), [], map, 3);
    expect(wide.scope).toBe('map-wide');
    expect(wide.candidates.map((c) => c.elementId)).toEqual(expect.arrayContaining(['e-mid', 'e-elsewhere']));
  });

  it('proposes Strategy in the framework priority (testId first), but falls to role when the testId repeats on the page (B16/B17 count)', () => {
    const map = makeMap({
      pages: [makePage('p1', '/es/x')],
      elements: [
        makeElement('e-unique', 'p1', 'Añadir a cesta', {
          selectorHints: { testId: { attr: 'data-qa-anchor', value: 'uniqueBtn' }, role: { type: 'button', name: 'Añadir a cesta' } },
        }),
        makeElement('e-repeated', 'p1', 'Añadir a la lista', {
          selectorHints: { testId: { attr: 'data-qa-anchor', value: 'wishBtn' }, role: { type: 'button', name: 'Añadir a la lista' } },
          count: 27,
        }),
      ],
      flows: [makeFlow('f1', ['p1'])],
    });
    const unique = findCandidates(roleBroken('Añadir a cesta'), ['f1'], map, 3);
    expect(unique.candidates[0].strategy).toEqual({ testId: { attr: 'data-qa-anchor', value: 'uniqueBtn' } });
    const repeated = findCandidates(roleBroken('Añadir a la lista'), ['f1'], map, 3);
    expect(repeated.candidates[0].strategy).toEqual({ role: { type: 'button', name: 'Añadir a la lista' } });
  });

  it('drops weak single-token evidence on chrome below the proposal floor (the predicted A6 false positive)', () => {
    // "Enviar e-mail Te responderemos..." (Footer) shares only the token "mail" with the
    // broken /continuar con e-?mail/i locator: 10 (token) + 30 (role) - 25 (chrome) = 15 < 30.
    const map = makeMap({
      pages: [makePage('p1', '/es/h-woman.html')],
      elements: [makeElement('e-footer-mail', 'p1', 'Enviar e-mail Te responderemos lo antes posible', { component: 'Footer' })],
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(
      { method: 'getByRole', role: 'button', name: '/continuar con e-?mail/i', failureMode: 'not-found', raw: 'x' },
      ['f1'], map, 3,
    );
    expect(result.candidates).toEqual([]);
  });

  it('keeps a bare role-agreement match (strict-mode healing, exactly at the floor)', () => {
    const map = makeMap({
      pages: [makePage('p1', '/es/x')],
      elements: [makeElement('e-dialog', 'p1', 'Tallas', { role: 'dialog', type: 'modal', selectorHints: { role: { type: 'dialog', name: 'Tallas' } } })],
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(
      { method: 'getByRole', role: 'dialog', failureMode: 'strict-mode', raw: "getByRole('dialog')" },
      ['f1'], map, 3,
    );
    expect(result.candidates.map((c) => c.elementId)).toEqual(['e-dialog']);
  });

  it('does not containment-match trivially short labels (live finding: "L"/"M" size buttons vs a regex needle)', () => {
    // Live demo found: needle '/continuar con e-?mail/i' "contains" the 1-char label 'L'
    // ('mail' has an l) — meaningless containment. Both sides must be >= 4 normalized chars.
    const map = makeMap({
      pages: [makePage('p1', '/es/x')],
      elements: [
        makeElement('e-size-l', 'p1', 'L'),
        makeElement('e-size-m', 'p1', 'M'),
      ],
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(
      { method: 'getByRole', role: 'button', name: '/continuar con e-?mail/i', failureMode: 'not-found', raw: 'x' },
      ['f1'], map, 3,
    );
    expect(result.candidates).toEqual([]);
  });

  it('never containment-matches the literal source of a regex needle that failed to match', () => {
    // A regex needle either matches as a regex or degrades to token overlap on its word
    // tokens — its raw '/…/i' source text is not a label to substring-match against.
    const map = makeMap({
      pages: [makePage('p1', '/es/x')],
      elements: [makeElement('e-con', 'p1', 'con')],
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(
      { method: 'getByRole', role: 'button', name: '/continuar con e-?mail/i', failureMode: 'not-found', raw: 'x' },
      ['f1'], map, 3,
    );
    expect(result.candidates).toEqual([]);
  });

  it('drops zero-evidence candidates entirely and returns none when nothing matches anywhere', () => {
    const map = makeMap({
      pages: [makePage('p1', '/es/x')],
      elements: [makeElement('e-1', 'p1', 'Totalmente distinto')],
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(roleBroken('Inexistente'), ['f1'], map, 3);
    expect(result.candidates).toEqual([]);
  });

  it('caps at top-n and carries page path and session for the prober', () => {
    const pages = [makePage('p1', '/es/x')];
    pages[0].session = 'auth';
    const map = makeMap({
      pages,
      elements: [1, 2, 3, 4, 5].map((i) => makeElement(`e-${i}`, 'p1', `Comprar ahora ${i}`)),
      flows: [makeFlow('f1', ['p1'])],
    });
    const result = findCandidates(roleBroken('Comprar ahora'), ['f1'], map, 2);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].pagePath).toBe('/es/x');
    expect(result.candidates[0].pageSession).toBe('auth');
  });
});
