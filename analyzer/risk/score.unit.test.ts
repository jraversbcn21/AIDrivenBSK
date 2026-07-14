import { describe, it, expect } from 'vitest';
import type { FunctionalMap, MapElement, MapFlow, MapPage, PageType, Priority } from '../../explorer/map/schema';
import type { MapDiff } from '../../explorer/diff/differ';
import { buildRiskReport, WEIGHTS } from './score';

// --- fixture factories ---

function makePage(id: string, pageType: PageType): MapPage {
  return { id, path: `/${id}`, routePattern: `/${id}`, pageType, session: 'auth', title: id, discoveredVia: 'seed' };
}

function makeFlow(id: string, opts: { steps?: string[]; priority?: Priority; coveredBy?: string[] } = {}): MapFlow {
  return {
    id, name: id, type: 'Other', session: 'auth',
    priority: opts.priority ?? 'low', steps: opts.steps ?? [],
    ...(opts.coveredBy !== undefined ? { coveredBy: opts.coveredBy } : {}),
  };
}

function makeElement(id: string, pageId: string, opts: { destructive?: boolean; testId?: boolean } = {}): MapElement {
  return {
    id, pageId, type: 'button', label: id, role: 'button',
    selectorHints: opts.testId ? { testId: { attr: 'data-qa-anchor', value: 'x' } } : {},
    destructive: opts.destructive ?? false,
  };
}

function makeMap(parts: Partial<FunctionalMap> = {}): FunctionalMap {
  return {
    schemaVersion: '1.7', generatedAt: '2026-07-14T00:00:00.000Z', environment: 'des',
    pages: [], components: [], elements: [], forms: [], flows: [], interactions: [],
    ...parts,
  };
}

const emptyDiff = (): MapDiff => ({ added: [], removed: [], changed: [] });
const OPTS = { now: '2026-07-14T12:00:00.000Z' };

describe('buildRiskReport', () => {
  it('scores the worst case at 1.0 high: removed, covered, high-priority Checkout flow with failure history', () => {
    const baseline = makeMap({
      pages: [makePage('p-checkout', 'Checkout')],
      flows: [makeFlow('f-1', { steps: ['p-checkout'], priority: 'high', coveredBy: ['tests/x.spec.ts'] })],
    });
    const current = makeMap(); // flow removed
    const diff = emptyDiff();
    diff.removed.push({ kind: 'flow', id: 'f-1', summary: 'removed flow f-1' });
    const report = buildRiskReport(diff, baseline, current, ['f-1'], OPTS);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].score).toBe(1);
    expect(report.entries[0].band).toBe('high');
    expect(report.entries[0].reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('removed'),
      expect.stringContaining('Checkout'),
      expect.stringContaining('covered'),
      expect.stringContaining('failure history'),
      expect.stringContaining('high-priority'),
    ]));
    expect(report.totals).toEqual({ high: 1, med: 0, low: 0 });
  });

  it('scores an added element on an Other page as low (design §4.3 sanity anchor)', () => {
    const current = makeMap({
      pages: [makePage('p-other', 'Other')],
      elements: [makeElement('e-1', 'p-other')],
    });
    const diff = emptyDiff();
    diff.added.push({ kind: 'element', id: 'e-1', summary: 'added element e-1' });
    const report = buildRiskReport(diff, makeMap(), current, [], OPTS);
    // change added 0.15 + kind element 0.10 + pageType Other 0 = 0.25
    expect(report.entries[0].score).toBe(0.25);
    expect(report.entries[0].band).toBe('low');
  });

  it('scores a changed covered PDP flow as high (regression surface, design §4.3)', () => {
    const current = makeMap({
      pages: [makePage('p-pdp', 'PDP')],
      flows: [makeFlow('f-pdp', { steps: ['p-pdp'], priority: 'high', coveredBy: ['tests/x.spec.ts'] })],
    });
    const diff = emptyDiff();
    diff.changed.push({ kind: 'flow', id: 'f-pdp', summary: 'changed flow f-pdp' });
    const report = buildRiskReport(diff, makeMap(), current, [], OPTS);
    // 0.35 + 0.20 + 0.10 (PDP) + 0.15 (covered) + 0.10 (high prio) = 0.90
    expect(report.entries[0].score).toBe(0.9);
    expect(report.entries[0].band).toBe('high');
  });

  it('resolves a removed entity against the baseline map (it no longer exists in the current one)', () => {
    const baseline = makeMap({
      pages: [makePage('p-cart', 'Cart')],
      elements: [makeElement('e-cart-btn', 'p-cart', { testId: true })],
    });
    const diff = emptyDiff();
    diff.removed.push({ kind: 'element', id: 'e-cart-btn', summary: 'removed element e-cart-btn' });
    const report = buildRiskReport(diff, baseline, makeMap(), [], OPTS);
    // 0.50 + 0.10 + 0.12 (Cart) + 0.05 (testId-bearing) = 0.77 high
    expect(report.entries[0].score).toBe(0.77);
    expect(report.entries[0].band).toBe('high');
    expect(report.entries[0].reasons).toEqual(expect.arrayContaining([expect.stringContaining('testId')]));
  });

  it('applies coverage impact and failure history to a page that is a step of a covered/affected flow', () => {
    const current = makeMap({
      pages: [makePage('p-plp', 'PLP')],
      flows: [makeFlow('f-x', { steps: ['p-plp'], coveredBy: ['tests/x.spec.ts'] })],
    });
    const diff = emptyDiff();
    diff.changed.push({ kind: 'page', id: 'p-plp', summary: 'changed page p-plp' });
    const report = buildRiskReport(diff, makeMap(), current, ['f-x'], OPTS);
    // 0.35 + 0.15 (page) + 0.06 (PLP) + 0.15 (covered) + 0.15 (history) = 0.86
    expect(report.entries[0].score).toBe(0.86);
    expect(report.entries[0].band).toBe('high');
  });

  it('adds the destructive-element modifier', () => {
    const current = makeMap({
      pages: [makePage('p-pdp', 'PDP')],
      elements: [makeElement('e-buy', 'p-pdp', { destructive: true })],
    });
    const diff = emptyDiff();
    diff.changed.push({ kind: 'element', id: 'e-buy', summary: 'changed element e-buy' });
    const report = buildRiskReport(diff, makeMap(), current, [], OPTS);
    // 0.35 + 0.10 + 0.10 (PDP) + 0.05 (destructive) = 0.60 med
    expect(report.entries[0].score).toBe(0.6);
    expect(report.entries[0].band).toBe('med');
  });

  it('sorts entries by score desc, then kind, then id — deterministic output', () => {
    const current = makeMap({
      pages: [makePage('p-a', 'Other'), makePage('p-b', 'Checkout')],
    });
    const diff = emptyDiff();
    diff.added.push({ kind: 'page', id: 'p-a', summary: 'added page p-a' });
    diff.changed.push({ kind: 'page', id: 'p-b', summary: 'changed page p-b' });
    const report = buildRiskReport(diff, makeMap(), current, [], OPTS);
    expect(report.entries.map((e) => e.id)).toEqual(['p-b', 'p-a']);
  });

  it('handles an entity unresolvable in either map (dangling diff id) without crashing', () => {
    const diff = emptyDiff();
    diff.changed.push({ kind: 'element', id: 'ghost', summary: 'changed element ghost' });
    const report = buildRiskReport(diff, makeMap(), makeMap(), [], OPTS);
    // change 0.35 + kind 0.10, no page resolution => 0.45 med
    expect(report.entries[0].score).toBe(0.45);
    expect(report.entries[0].band).toBe('med');
  });

  it('clamps the score at 1.0 and bands exactly at the documented cutoffs', () => {
    expect(WEIGHTS.bands.high).toBe(0.7);
    expect(WEIGHTS.bands.med).toBe(0.4);
    // 0.35 + 0.20 + 0.05 (Search) + 0.10 (high prio) = 0.70 — exactly at the high cut
    const current = makeMap({
      pages: [makePage('p-s', 'Search')],
      flows: [makeFlow('f-s', { steps: ['p-s'], priority: 'high' })],
    });
    const diff = emptyDiff();
    diff.changed.push({ kind: 'flow', id: 'f-s', summary: 'changed flow f-s' });
    const report = buildRiskReport(diff, makeMap(), current, [], OPTS);
    expect(report.entries[0].score).toBe(0.7);
    expect(report.entries[0].band).toBe('high');
  });

  it('carries map timestamps and band totals in the report envelope', () => {
    const baseline = makeMap({ generatedAt: '2026-07-10T00:00:00.000Z' });
    const current = makeMap({ generatedAt: '2026-07-14T00:00:00.000Z', pages: [makePage('p', 'Other')] });
    const diff = emptyDiff();
    diff.added.push({ kind: 'page', id: 'p', summary: 'added page p' });
    const report = buildRiskReport(diff, baseline, current, [], OPTS);
    expect(report.baselineGeneratedAt).toBe('2026-07-10T00:00:00.000Z');
    expect(report.currentGeneratedAt).toBe('2026-07-14T00:00:00.000Z');
    expect(report.generatedAt).toBe(OPTS.now);
    expect(report.totals.low).toBe(1);
  });
});
