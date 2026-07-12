import { describe, it, expect } from 'vitest';
import { diffMaps, hasChanges, formatDiff } from './differ';
import type { FunctionalMap, MapPage, MapInteraction } from '../map/schema';

const page = (id: string, pageType: MapPage['pageType']): MapPage => ({
  id, path: '/p', routePattern: '/p', pageType, session: 'anon', title: 't', discoveredVia: 'seed',
});

const interaction = (id: string, outcome: MapInteraction['outcome']): MapInteraction => ({
  id, pageId: 'page_a', triggerElementId: 'elem_1', outcome, revealedElementIds: [],
});

const map = (pages: MapPage[], interactions: MapInteraction[] = []): FunctionalMap => ({
  schemaVersion: '1.0', generatedAt: 'x', environment: 'des',
  pages, components: [], elements: [], forms: [], flows: [], interactions,
});

describe('diffMaps', () => {
  it('detects added, removed, and changed pages', () => {
    const oldM = map([page('page_a', 'PLP'), page('page_b', 'Home')]);
    const newM = map([page('page_a', 'PDP'), page('page_c', 'Cart')]);
    const d = diffMaps(oldM, newM);
    expect(d.added.map((e) => e.id)).toEqual(['page_c']);
    expect(d.removed.map((e) => e.id)).toEqual(['page_b']);
    expect(d.changed.map((e) => e.id)).toEqual(['page_a']);
    expect(hasChanges(d)).toBe(true);
  });
  it('reports no changes for identical maps', () => {
    const m = map([page('page_a', 'PLP')]);
    const d = diffMaps(m, m);
    expect(hasChanges(d)).toBe(false);
    expect(formatDiff(d)).toMatch(/no changes/i);
  });
  it('detects added, removed, and changed interactions', () => {
    const oldM = map(
      [page('page_a', 'PLP')],
      [interaction('int_a', 'overlay'), interaction('int_b', 'none')],
    );
    const newM = map(
      [page('page_a', 'PLP')],
      [interaction('int_a', 'navigated'), interaction('int_c', 'overlay')],
    );
    const d = diffMaps(oldM, newM);
    expect(d.added.filter((e) => e.kind === 'interaction').map((e) => e.id)).toEqual(['int_c']);
    expect(d.removed.filter((e) => e.kind === 'interaction').map((e) => e.id)).toEqual(['int_b']);
    expect(d.changed.filter((e) => e.kind === 'interaction').map((e) => e.id)).toEqual(['int_a']);
  });
});
