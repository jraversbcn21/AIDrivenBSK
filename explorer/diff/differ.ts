import type { FunctionalMap } from '../map/schema';

export type DiffKind = 'page' | 'component' | 'element' | 'form' | 'flow';

export interface DiffEntry { kind: DiffKind; id: string; summary: string }
export interface MapDiff { added: DiffEntry[]; removed: DiffEntry[]; changed: DiffEntry[] }

interface Identified { id: string }

function diffCollection<T extends Identified>(
  kind: DiffKind, oldItems: T[], newItems: T[], diff: MapDiff,
): void {
  const oldById = new Map(oldItems.map((i) => [i.id, i]));
  const newById = new Map(newItems.map((i) => [i.id, i]));

  for (const item of newItems) {
    const prev = oldById.get(item.id);
    if (!prev) diff.added.push({ kind, id: item.id, summary: `added ${kind} ${item.id}` });
    else if (JSON.stringify(prev) !== JSON.stringify(item)) diff.changed.push({ kind, id: item.id, summary: `changed ${kind} ${item.id}` });
  }
  for (const item of oldItems) {
    if (!newById.has(item.id)) diff.removed.push({ kind, id: item.id, summary: `removed ${kind} ${item.id}` });
  }
}

export function diffMaps(oldMap: FunctionalMap, newMap: FunctionalMap): MapDiff {
  const diff: MapDiff = { added: [], removed: [], changed: [] };
  diffCollection('page', oldMap.pages, newMap.pages, diff);
  diffCollection('component', oldMap.components, newMap.components, diff);
  diffCollection('element', oldMap.elements, newMap.elements, diff);
  diffCollection('form', oldMap.forms, newMap.forms, diff);
  diffCollection('flow', oldMap.flows, newMap.flows, diff);
  return diff;
}

export function hasChanges(diff: MapDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}

export function formatDiff(diff: MapDiff): string {
  if (!hasChanges(diff)) return 'Functional map: no changes.';
  const lines = [
    `Functional map diff: +${diff.added.length} / -${diff.removed.length} / ~${diff.changed.length}`,
    ...diff.added.map((e) => `  + ${e.summary}`),
    ...diff.removed.map((e) => `  - ${e.summary}`),
    ...diff.changed.map((e) => `  ~ ${e.summary}`),
  ];
  return lines.join('\n');
}
