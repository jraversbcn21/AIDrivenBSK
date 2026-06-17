import { describe, it, expect } from 'vitest';
import { diffMaps, hasChanges, formatDiff } from './differ';
import type { FunctionalMap, MapPage } from '../map/schema';

const page = (id: string, pageType: MapPage['pageType']): MapPage => ({
  id, path: '/p', routePattern: '/p', pageType, session: 'anon', title: 't', discoveredVia: 'seed',
});

const map = (pages: MapPage[]): FunctionalMap => ({
  schemaVersion: '1.0', generatedAt: 'x', environment: 'des',
  pages, components: [], elements: [], forms: [], flows: [],
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
});
