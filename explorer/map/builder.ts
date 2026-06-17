import type { PageExtraction } from '../types';
import type { Classification } from '../classify/Classifier';
import {
  SCHEMA_VERSION, type FunctionalMap, type MapPage, type MapComponent,
  type MapElement, type MapForm, type MapFlow, type PageType, type Priority,
} from './schema';
import { makeId } from '../ids';
import { routePattern } from '../url';

export interface ClassifiedPage {
  extraction: PageExtraction;
  classification: Classification;
}

const PRIORITY_BY_TYPE: Record<PageType, Priority> = {
  PDP: 'high', PLP: 'high', Cart: 'high', Checkout: 'high', Account: 'high',
  Wishlist: 'high', Search: 'high', Home: 'med', Other: 'low',
};

export function buildMap(input: { classified: ClassifiedPage[]; environment: string; now?: string }): FunctionalMap {
  const pages: MapPage[] = [];
  const elements: MapElement[] = [];
  const forms: MapForm[] = [];
  const flows: MapFlow[] = [];
  const componentsByKey = new Map<string, MapComponent>();

  for (const { extraction: ex, classification } of input.classified) {
    const pattern = routePattern(ex.meta.path);
    const pageId = makeId('page', pattern, ex.meta.session);
    pages.push({
      id: pageId, path: ex.meta.path, routePattern: pattern, pageType: classification.pageType,
      session: ex.meta.session, title: ex.meta.title, discoveredVia: ex.meta.discoveredVia,
    });

    ex.elements.forEach((el) => {
      elements.push({
        id: makeId('elem', pageId, el.role, el.label, el.type),
        pageId, type: el.type, label: el.label, role: el.role,
        selectorHints: el.selectorHints, destructive: el.destructive,
      });
    });

    ex.forms.forEach((f, i) => {
      forms.push({ id: makeId('form', pageId, f.purposeHint, String(i)), pageId, purpose: f.purposeHint, fields: f.fields });
    });

    ex.componentKinds.forEach((kind) => {
      const key = `comp:${kind}`;
      const existing = componentsByKey.get(key);
      if (existing) {
        if (!existing.foundOnPages.includes(pageId)) existing.foundOnPages.push(pageId);
      } else {
        componentsByKey.set(key, { id: makeId('comp', kind), kind, foundOnPages: [pageId] });
      }
    });

    flows.push({
      id: makeId('flow', pageId),
      name: `${classification.pageType} (${ex.meta.session})`,
      type: classification.pageType,
      session: ex.meta.session,
      priority: PRIORITY_BY_TYPE[classification.pageType],
      steps: [pageId],
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.now ?? new Date().toISOString(),
    environment: input.environment,
    pages, components: [...componentsByKey.values()], elements, forms, flows,
  };
}
