import { describe, it, expect } from 'vitest';
import {
  selectJourneys, selectJourneyByFlowId, selectInteractionJourneys, unsatisfiedMustCapture, mapIsStale,
} from './select';
import type { FunctionalMap, MapPage } from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';
import type { TestIdHint } from '../src/support/locators';
import type { MapInteraction, MapElement, MapFlow } from '../explorer/map/schema';

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
  interactions: [],
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

  it('excludes revealed elements from loaded-signal selection (M8 guard)', () => {
    // A revealed element (only exists after an interaction, e.g. a size button inside the
    // "Tallas" dialog) comes first in element order and has a strong role hint — under the
    // old logic it would win. It must never be picked: asserting it in isLoaded() would
    // always time out on a freshly-loaded page (the exact failure mode B14/M7 closed).
    const revealedMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'e1', pageId: 'pPlp', type: 'button', label: 'Talla S', role: 'button', selectorHints: { role: { type: 'button', name: 'Talla S' } }, destructive: false, revealedBy: 'inter_x' },
        { id: 'e2', pageId: 'pPlp', type: 'button', label: 'Añadir a la lista', role: 'button', selectorHints: { role: { type: 'button', name: 'Añadir a la lista' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), revealedMap, 5);
    expect(r.journeys[0].loadedSignal).not.toEqual({ role: { type: 'button', name: 'Talla S' } });
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Añadir a la lista' } });
  });

  it('B16: a testId repeated on the same page is not eligible as loaded-signal; the element falls to its role hint', () => {
    const gridMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'g1', pageId: 'pPlp', type: 'button', label: 'Guardar 1', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' }, role: { type: 'button', name: 'Guardar en lista' } }, destructive: false },
        { id: 'g2', pageId: 'pPlp', type: 'button', label: 'Guardar 2', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), gridMap, 5);
    // The repeated testId (x2 on pPlp) is skipped; g1's own role hint wins in the role tier.
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Guardar en lista' } });
  });
  it('B16: a unique testId still wins over any role hint', () => {
    const uniqueMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'u1', pageId: 'pPlp', type: 'button', label: 'Filtrar', role: 'button', selectorHints: { role: { type: 'button', name: 'Filtrar' } }, destructive: false },
        { id: 'u2', pageId: 'pPlp', type: 'button', label: 'Añadir', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), uniqueMap, 5);
    expect(r.journeys[0].loadedSignal).toEqual({ testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } });
  });
  it('B16: the repeat count includes revealed/destructive instances (page-wide), not just candidates', () => {
    const mixedMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'm1', pageId: 'pPlp', type: 'button', label: 'Guardar', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' } }, destructive: false },
        { id: 'm2', pageId: 'pPlp', type: 'button', label: 'Guardar (revelado)', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' } }, destructive: false, revealedBy: 'inter_x' },
        { id: 'm3', pageId: 'pPlp', type: 'filter', label: 'Filtrar', role: 'button', selectorHints: { role: { type: 'button', name: 'Filtrar' } }, destructive: false },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), mixedMap, 5);
    // m1's testId is unique among *candidates* but repeated page-wide — a strict-mode
    // violation live resolves against the DOM, not against our candidate filter.
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Filtrar' } });
  });
  it('F7: a single deduped row whose testId repeats (count>1) is not eligible; falls to role', () => {
    const dupedMap: FunctionalMap = {
      ...map,
      elements: [
        { id: 'w1', pageId: 'pPlp', type: 'button', label: 'Guardar', role: 'button', selectorHints: { testId: { attr: 'data-qa-anchor', value: 'productItemWishlist' }, role: { type: 'button', name: 'Guardar en lista' } }, destructive: false, count: 38 },
      ],
    };
    const r = selectJourneys(report([['pRoot', 'pPlp']]), dupedMap, 5);
    // count 38 means the DOM has 38 of this testId — a strict-mode violation live — so the
    // testId tier is skipped and the element's own role hint wins.
    expect(r.journeys[0].loadedSignal).toEqual({ role: { type: 'button', name: 'Guardar en lista' } });
  });
});

const MUST = [/^añadir a (la )?cesta/i];

const el = (id: string, pageId: string, over: Partial<MapElement> = {}): MapElement => ({
  id, pageId, type: 'button', label: 'x', role: 'button',
  selectorHints: { role: { type: 'button', name: 'x' } }, destructive: false, ...over,
});
const inter = (id: string, pageId: string, triggerElementId: string, over: Partial<MapInteraction> = {}): MapInteraction => ({
  id, pageId, triggerElementId, outcome: 'overlay', revealedElementIds: [], ...over,
});
const flow = (id: string, steps: string[], session: 'anon' | 'auth' = 'anon'): MapFlow => ({
  id, name: steps.join(' -> '), type: 'PLP', session, priority: 'med', steps,
});

const trigger = el('eTrig', 'pPlp', {
  label: 'Añadir a la cesta Pantalón bombacho',
  selectorHints: { role: { type: 'button', name: 'Añadir a la cesta Pantalón bombacho' }, testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } },
});
const dialogEl = el('eDlg', 'pPlp', { type: 'modal', label: 'Tallas', role: 'dialog', selectorHints: { role: { type: 'dialog', name: 'Tallas 32 34' } }, revealedBy: 'i1' });

const interMap: FunctionalMap = {
  ...map,
  elements: [trigger, dialogEl],
  flows: [flow('fPlp', ['pRoot', 'pHub', 'pPlp'])],
  interactions: [inter('i1', 'pPlp', 'eTrig', { revealedElementIds: ['eDlg'] })],
};

describe('selectJourneyByFlowId (B-NL1 injection point)', () => {
  const flowMap: FunctionalMap = {
    ...map,
    flows: [
      { id: 'flow_ask_ok', name: '/ -> /es/h-woman.html -> /es/mujer/ropa/camisetas-n4365.html', type: 'PLP', session: 'anon', priority: 'high', steps: ['pRoot', 'pHub', 'pPlp'] },
      { id: 'flow_ask_pay', name: '/ -> /es/checkout/payment.html', type: 'Other', session: 'auth', priority: 'high', steps: ['pRoot', 'pPay'] },
      { id: 'flow_ask_ghost', name: 'ghost', type: 'Other', session: 'anon', priority: 'low', steps: ['pRoot', 'pMissing'] },
    ],
  };

  it('builds the same journey shape as the ranking path, keyed by flowId', () => {
    const { journey, reason } = selectJourneyByFlowId(flowMap, 'flow_ask_ok');
    expect(reason).toBeUndefined();
    expect(journey?.flowId).toBe('flow_ask_ok');
    expect(journey?.chain.map((s) => s.path)).toEqual(['/', '/es/h-woman.html', '/es/mujer/ropa/camisetas-n4365.html']);
    expect(journey?.session).toBe('anon');
    expect(journey?.loadedSignal).toEqual({ testId: { attr: 'data-qa-anchor', value: 'quick-add' } });
    expect(journey?.mapGeneratedAt).toBe(map.generatedAt);
  });

  it('returns a reason for an unknown flowId', () => {
    const { journey, reason } = selectJourneyByFlowId(flowMap, 'flow_nope');
    expect(journey).toBeNull();
    expect(reason).toMatch(/not found in the map/);
  });

  it('an explicit ask cannot bypass the checkout route guard', () => {
    const { journey, reason } = selectJourneyByFlowId(flowMap, 'flow_ask_pay');
    expect(journey).toBeNull();
    expect(reason).toMatch(/checkout-looking route/);
  });

  it('returns a reason when the flow references a missing page id', () => {
    const { journey, reason } = selectJourneyByFlowId(flowMap, 'flow_ask_ghost');
    expect(journey).toBeNull();
    expect(reason).toMatch(/page id missing/);
  });
});

describe('selectInteractionJourneys', () => {
  it('generates for an overlay interaction whose trigger matches a must-capture pattern, inheriting chain and session from the flow ending at its page', () => {
    const r = selectInteractionJourneys(interMap, MUST);
    expect(r.journeys).toHaveLength(1);
    const j = r.journeys[0];
    expect(j.interactionId).toBe('i1');
    expect(j.flowId).toBe('fPlp');
    expect(j.session).toBe('anon');
    expect(j.chain.map((s) => s.path)).toEqual(['/', '/es/h-woman.html', '/es/mujer/ropa/camisetas-n4365.html']);
    expect(j.trigger).toEqual({ testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } });
    expect(j.overlayIsDialog).toBe(true);
    expect(j.overlayElementSignal).toBeNull();
    expect(j.mapGeneratedAt).toBe(interMap.generatedAt);
  });
  it('the trigger may use a testId that repeats on the page (opposite policy to B16 — .first() semantics)', () => {
    const repeated: FunctionalMap = {
      ...interMap,
      elements: [trigger, { ...trigger, id: 'eTrig2', label: 'Añadir a la cesta Vestido corsé' }, dialogEl],
    };
    const r = selectInteractionJourneys(repeated, MUST);
    expect(r.journeys[0].trigger).toEqual({ testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } });
  });
  it('ignores non-overlay outcomes and non-matching trigger labels silently (not skips)', () => {
    const m: FunctionalMap = {
      ...interMap,
      elements: [trigger, el('eOther', 'pPlp', { label: 'Filtrar' })],
      interactions: [
        inter('i2', 'pPlp', 'eTrig', { outcome: 'navigated', navigatedTo: '/x' }),
        inter('i3', 'pPlp', 'eOther'),
      ],
    };
    const r = selectInteractionJourneys(m, MUST);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped).toHaveLength(0);
  });
  it('resolves a duplicated trigger element id to the first occurrence (canonical map has id collisions)', () => {
    const dup: FunctionalMap = {
      ...interMap,
      elements: [trigger, { ...trigger, label: 'Añadir a la cesta Otro' }, dialogEl],
    };
    const r = selectInteractionJourneys(dup, MUST);
    expect(r.journeys).toHaveLength(1);
    expect(r.journeys[0].triggerLabel).toBe('Añadir a la cesta Pantalón bombacho');
  });
  it('skips with a reason when no flow ends at the interaction page', () => {
    const m: FunctionalMap = { ...interMap, flows: [flow('fHub', ['pRoot', 'pHub'])] };
    const r = selectInteractionJourneys(m, MUST);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped[0]).toEqual({ flowId: 'i1', reason: expect.stringMatching(/no flow ends/i) });
  });
  it('skips when the trigger element id resolves to nothing', () => {
    const m: FunctionalMap = { ...interMap, elements: [dialogEl] };
    const r = selectInteractionJourneys(m, MUST);
    expect(r.skipped[0].reason).toMatch(/trigger element missing/i);
  });
  it('skips checkout-looking chains by path guard', () => {
    const m: FunctionalMap = {
      ...interMap,
      elements: [el('eT', 'pPay', { label: 'Añadir a la cesta X' }), el('eD', 'pPay', { role: 'dialog', selectorHints: { role: { type: 'dialog', name: 'D' } } })],
      flows: [flow('fPay', ['pRoot', 'pPay'])],
      interactions: [inter('i9', 'pPay', 'eT', { revealedElementIds: ['eD'] })],
    };
    const r = selectInteractionJourneys(m, MUST);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/checkout/i);
  });
  it('falls back to the first usable revealed hint when no revealed element is a dialog, and skips when there is none', () => {
    const btn = el('eBtn', 'pPlp', { label: 'Descartar', selectorHints: { role: { type: 'button', name: 'Descartar' } }, revealedBy: 'i1' });
    const withBtn: FunctionalMap = { ...interMap, elements: [trigger, btn], interactions: [inter('i1', 'pPlp', 'eTrig', { revealedElementIds: ['eBtn'] })] };
    expect(selectInteractionJourneys(withBtn, MUST).journeys[0]).toMatchObject({
      overlayIsDialog: false,
      overlayElementSignal: { role: { type: 'button', name: 'Descartar' } },
    });
    const bare = el('eBare', 'pPlp', { label: '', selectorHints: {}, revealedBy: 'i1' });
    const without: FunctionalMap = { ...interMap, elements: [trigger, bare], interactions: [inter('i1', 'pPlp', 'eTrig', { revealedElementIds: ['eBare'] })] };
    const r = selectInteractionJourneys(without, MUST);
    expect(r.journeys).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/no verifiable overlay/i);
  });
});

describe('unsatisfiedMustCapture', () => {
  it('names patterns with no matching overlay capture in the map', () => {
    expect(unsatisfiedMustCapture(interMap, MUST)).toEqual([]);
    expect(unsatisfiedMustCapture({ ...interMap, interactions: [] }, MUST)).toEqual([MUST[0].source]);
  });
});

describe('mapIsStale', () => {
  it('is false when the report was computed from the given map', () => {
    expect(mapIsStale(report([]), map)).toBe(false);
  });
  it('is true when the report references a different map generation', () => {
    const staleReport = { ...report([]), mapGeneratedAt: '2020-01-01T00:00:00Z' };
    expect(mapIsStale(staleReport, map)).toBe(true);
  });
});
