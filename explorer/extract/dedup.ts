import type { ExtractedElement } from '../types';

/** Full-content equality for dedup (B17): two elements collapse into one row (with a
 *  bumped `count`) only when every identity-bearing field matches. `count` itself is not
 *  part of identity. selectorHints is compared structurally via JSON.stringify — its shapes
 *  ({attr,value} / {type,name} / string) are constructed with stable key order in the
 *  extractors, so stringify is a sound deep-equality here. */
export function sameExtractedElement(a: ExtractedElement, b: ExtractedElement): boolean {
  return a.type === b.type
    && a.label === b.label
    && a.role === b.role
    && a.destructive === b.destructive
    && a.component === b.component
    && JSON.stringify(a.selectorHints) === JSON.stringify(b.selectorHints);
}
