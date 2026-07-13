import type { PageExtraction } from '../types';
import type { Classification } from '../classify/Classifier';
import {
  SCHEMA_VERSION, type FunctionalMap, type MapPage, type MapComponent,
  type MapElement, type MapForm, type MapFlow, type MapInteraction, type PageType, type Priority,
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

// Defensive ceiling only: the crawler's Frontier dedups before enqueueing, so the discovery
// graph is a tree and real chains are bounded by crawl depth. This guards against a malformed
// fixture (or a future crawler change) introducing a cycle, without coupling buildMap to
// crawl config.
const MAX_CHAIN_HOPS = 50;

interface ChainNode {
  id: string;
  path: string;
  discoveredVia: string;
}

export function buildMap(input: { classified: ClassifiedPage[]; environment: string; now?: string }): FunctionalMap {
  const pages: MapPage[] = [];
  const elements: MapElement[] = [];
  const forms: MapForm[] = [];
  const flows: MapFlow[] = [];
  const interactions: MapInteraction[] = [];
  const componentsByKey = new Map<string, MapComponent>();
  // session:path -> chain node, for reconstructing each page's discoveredVia chain (design
  // spec 2026-07-02-flow-synthesis-design.md).
  const nodeByKey = new Map<string, ChainNode>();

  for (const { extraction: ex, classification } of input.classified) {
    const pattern = routePattern(ex.meta.path);
    const pageId = makeId('page', pattern, ex.meta.session);
    const mapPage: MapPage = {
      id: pageId, path: ex.meta.path, routePattern: pattern, pageType: classification.pageType,
      session: ex.meta.session, title: ex.meta.title, discoveredVia: ex.meta.discoveredVia,
    };
    if (ex.truncated) mapPage.truncated = true;
    pages.push(mapPage);
    nodeByKey.set(`${ex.meta.session}:${ex.meta.path}`, { id: pageId, path: ex.meta.path, discoveredVia: ex.meta.discoveredVia });

    // B17: fold a per-(role,label,type) occurrence index into the id so residual rows that
    // dedup left sharing those fields but diverging in hints/component (the audit's 127
    // divergent cases) still get distinct ids. Index 0 for the common singleton case.
    const elemOccurrence = new Map<string, number>();
    ex.elements.forEach((el) => {
      const occKey = `${el.role} ${el.label} ${el.type}`;
      const idx = elemOccurrence.get(occKey) ?? 0;
      elemOccurrence.set(occKey, idx + 1);
      const mapEl: MapElement = {
        id: makeId('elem', pageId, el.role, el.label, el.type, String(idx)),
        pageId, type: el.type, label: el.label, role: el.role,
        selectorHints: el.selectorHints, destructive: el.destructive,
      };
      if (el.component !== undefined) mapEl.component = el.component;
      if (el.count !== undefined) mapEl.count = el.count;
      elements.push(mapEl);
    });

    (ex.interactions ?? []).forEach((it) => {
      // B17: resolve the trigger's real occurrence index rather than assuming '0'. A trigger
      // is only ever chosen from *eligible* candidates (explorer/crawl/interact.ts's
      // eligible(): !destructive + clickable type + named role), and selectCandidates always
      // picks the first eligible match in ex.elements order — so walk ex.elements counting
      // every same-(role,label,type) element (destructive or not, matching the passive loop's
      // own counting scheme above) and stop at the first non-destructive one. This resolves
      // the concrete destructive-vs-eligible divergence risk this task's id scheme introduced.
      // Residual, pre-existing ambiguity if TWO OR MORE eligible elements share the same key
      // (ExtractedInteraction.trigger never carried a unique instance pointer, even before
      // B17) is unchanged — same "any exemplar" tolerance the project already accepts
      // elsewhere for a repeated trigger (builder/generate/TemplateGenerator.ts's .first()).
      let triggerIdx = 0;
      for (const e of ex.elements) {
        if (e.role !== it.trigger.role || e.label !== it.trigger.label || e.type !== it.trigger.type) continue;
        if (!e.destructive) break;
        triggerIdx++;
      }
      const triggerElementId = makeId('elem', pageId, it.trigger.role, it.trigger.label, it.trigger.type, String(triggerIdx));
      const interactionId = makeId('inter', pageId, triggerElementId);
      const revealedElementIds: string[] = [];
      const revealedOccurrence = new Map<string, number>();
      it.revealedElements.forEach((el) => {
        const occKey = `${el.role} ${el.label} ${el.type}`;
        const idx = revealedOccurrence.get(occKey) ?? 0;
        revealedOccurrence.set(occKey, idx + 1);
        const mapEl: MapElement = {
          id: makeId('elem', interactionId, el.role, el.label, el.type, String(idx)),
          pageId, type: el.type, label: el.label, role: el.role,
          selectorHints: el.selectorHints, destructive: el.destructive,
          revealedBy: interactionId,
        };
        if (el.component !== undefined) mapEl.component = el.component;
        if (el.count !== undefined) mapEl.count = el.count;
        elements.push(mapEl);
        revealedElementIds.push(mapEl.id);
      });
      const interaction: MapInteraction = {
        id: interactionId, pageId, triggerElementId, outcome: it.outcome, revealedElementIds,
      };
      if (it.navigatedTo !== undefined) interaction.navigatedTo = it.navigatedTo;
      interactions.push(interaction);
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
  }

  // Second pass: flows carry the full root-to-leaf navigation chain. Parents always precede
  // children in real crawl output (BFS), but a two-pass build keeps buildMap total over any
  // fixture ordering.
  for (const { extraction: ex, classification } of input.classified) {
    const pageId = makeId('page', routePattern(ex.meta.path), ex.meta.session);

    const chain: ChainNode[] = [];
    let node: ChainNode | undefined = { id: pageId, path: ex.meta.path, discoveredVia: ex.meta.discoveredVia };
    let hops = 0;
    while (node && hops++ < MAX_CHAIN_HOPS) {
      chain.unshift(node);
      if (node.discoveredVia === 'seed') break;
      node = nodeByKey.get(`${ex.meta.session}:${node.discoveredVia}`);
    }

    flows.push({
      id: makeId('flow', pageId),
      name: chain.map((n) => n.path).join(' -> '),
      type: classification.pageType,
      session: ex.meta.session,
      priority: PRIORITY_BY_TYPE[classification.pageType],
      steps: chain.map((n) => n.id),
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.now ?? new Date().toISOString(),
    environment: input.environment,
    pages, components: [...componentsByKey.values()], elements, forms, flows, interactions,
  };
}
