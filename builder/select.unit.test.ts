import { describe, it, expect } from 'vitest';
import { selectJourneys } from './select';
import type { FunctionalMap, MapPage } from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';
import type { TestIdHint } from '../src/support/locators';

const page = (id: string, path: string): MapPage => ({
  id, path, routePattern: path, pageType: 'Other', session: 'anon', title: path, discoveredVia: '/',
});

const map: FunctionalMap = {
  schemaVersion: '1.2', generatedAt: '2026-07-03T06:00:00Z', environment: 'des',
  pages: [
    page('pRoot', '/'),
    page('pHub', '/es/h-woman.html'),
    page('pPlp', '/es/mujer/ropa/camisetas-n4365.html'),
    page('pPay', '/es/checkout/payment.html'),
    page('pBare', '/es/pag/bershkastyle.html'),
  ],
  components: [], forms: [],
  elements: [
    { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Eliminar', role: 'button', selectorHints: { role: { type: 'button', name: 'Eliminar' } }, destructive: true },
    { id: 'e2', pageId: 'pPlp', type: 'filter', label: 'Filtrar', role: 'button', selectorHints: { role: { type: 'button', name: 'Filtrar' } }, destructive: false },
    { id: 'e3', pageId: 'pPlp', type: 'button', label: 'Añadir', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'quick-add' } }, destructive: false },
  ],
  flows: [],
};

const report = (steps: string[][], names?: string[]): PlanReport => ({
  generatedAt: 'x', mapGeneratedAt: map.generatedAt, evidenceGeneratedAt: 'x',
  flows: { total: 0, covered: 0, uncovered: 0 },
  uncoveredByPriority: { high: 0, med: 0, low: 0 },
  proposals: steps.map((s, i) => ({
    flowId: `flow_${i}00000000000`, name: names?.[i] ?? `journey ${i}`, priority: 'high', session: 'anon', steps: s,
    rationale: 'r',
  })),
});

describe('selectJourneys', () => {
  it('resolves chains in planner order and honours top', () => {
    const r = selectJourneys(report([['pRoot', 'pHub', 'pPlp'], ['pRoot', 'pHub'], ['pRoot']]), map, 2);
    expect(r.journeys).toHaveLength(2);
    expect(r.journeys[0].chain.map((s) => s.path)).toEqual(['/', '/es/h-woman.html', '/es/mujer/ropa/camisetas-n4365.html']);
    expect(r.journeys[0].mapGeneratedAt).toBe('2026-07-03T06:00:00Z');
  });
  it('picks the loaded signal by framework priority (testId first), skipping destructive elements', () => {
    const r = selectJourneys(report([['pRoot', 'pPlp']]), map, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ testId: { attr: 'data-qa-anchor', value: 'quick-add' } });
  });
  it('ignores legacy string-shaped testIds (schema-1.2 maps) and falls through to role/label', () => {
    // A stale 1.2 map carries provenance-less string testIds — exactly the untrustworthy
    // data M7 replaced. They must never surface as a Strategy (M6b's live failure mode).
    const legacyMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Añadir', role: 'button', selectorHints: { testId: 'legacy-string' as unknown as TestIdHint }, destructive: false },
        { id: 'e2', pageId: 'pPlp', type: 'filter', label: 'Filtrar', role: 'button', selectorHints: { role: { type: 'button', name: 'Filtrar' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), legacyMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Filtrar' } });
  });
  it('falls back to a null signal when the leaf has no usable element', () => {
    const r = selectJourneys(report([['pRoot', 'pBare']]), map, 5);
    expect(r.journeys[0].loadedSignal).toBeNull();
  });
  it('skips proposals referencing unknown page ids, without consuming top slots', () => {
    const r = selectJourneys(report([['pGone'], ['pRoot']]), map, 1);
    expect(r.journeys).toHaveLength(1);
    expect(r.journeys[0].chain[0].path).toBe('/');
    expect(r.skipped[0].reason).toMatch(/missing from the map/);
  });
  it('skips checkout-looking routes by path (never by pageType)', () => {
    const r = selectJourneys(report([['pRoot', 'pPay']]), map, 5);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/checkout/i);
  });
  it('skips proposals with an empty steps array, without consuming top slots', () => {
    // A proposal with steps: [] should not crash, not be added to journeys,
    // and should appear in skipped with a reason mentioning "empty".
    // A valid proposal following it should still be included (not consumed by the empty one).
    const r = selectJourneys(report([[], ['pRoot', 'pHub']], ['empty', 'valid']), map, 1);
    expect(r.journeys).toHaveLength(1);
    expect(r.journeys[0].chain[0].path).toBe('/');
    expect(r.skipped[0].flowId).toBe('flow_000000000000');
    expect(r.skipped[0].reason).toMatch(/empty/i);
  });
  it('excludes null from legacy testId guard, falls through to role when testId is null', () => {
    // A malformed map (loaded without schema validation) could have testId: null.
    // typeof null === 'object' is true in JS, so the guard must explicitly check !== null
    // to avoid accepting null as a valid TestIdHint and producing { testId: null } as Strategy.
    // With testId: null but role valid, the loader should skip null and use role instead.
    const nullTestIdMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Añadir', role: 'button', selectorHints: { testId: null as unknown as TestIdHint, role: { type: 'button', name: 'Seleccionar' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), nullTestIdMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Seleccionar' } });
  });
  it('deprioritizes shared chrome: an own role hint beats an earlier header role hint (B14)', () => {
    const chromeMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Buscar en tienda', role: 'button', selectorHints: { role: { type: 'button', name: 'Buscar en tienda' } }, destructive: false, component: 'Header' },
        { id: 'e2', pageId: 'pPlp', type: 'button', label: 'Añadir a la lista', role: 'button', selectorHints: { role: { type: 'button', name: 'Añadir a la lista' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), chromeMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Añadir a la lista' } });
  });

  it('pass-major: an own role hint beats a shared testId hint (B14)', () => {
    // A header testId is just as weak a leaf-page signal as a header role —
    // page-specificity outranks tier (design spec §5).
    const chromeMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Buscar en tienda', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'storeSearch' } }, destructive: false, component: 'Header' },
        { id: 'e2', pageId: 'pPlp', type: 'button', label: 'Añadir a la lista', role: 'button', selectorHints: { role: { type: 'button', name: 'Añadir a la lista' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), chromeMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Añadir a la lista' } });
  });

  it('falls back to the shared element when everything on the leaf is shared (B14)', () => {
    // Deprioritize, never exclude: a shared signal still beats the null/main fallback.
    const allSharedMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Buscar en tienda', role: 'button', selectorHints: { role: { type: 'button', name: 'Buscar en tienda' } }, destructive: false, component: 'Header' },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), allSharedMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Buscar en tienda' } });
  });
});
