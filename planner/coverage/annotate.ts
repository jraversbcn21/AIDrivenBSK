import { SCHEMA_VERSION, type FunctionalMap } from '../../explorer/map/schema';
import type { RouteEvidence } from '../types';
import { urlsToPatterns, isOrderedSubsequence } from './match';

/**
 * Marks each flow with the specs whose PASSED runs demonstrably walked the flow's step
 * patterns in order (subsequence: interleaved gates/redirects don't break a match).
 * Session simplification v1: matching is by routePattern, so both session variants of the
 * same chain annotate identically (design spec §2.2). Pure — returns a new map.
 */
export function annotateCoverage(map: FunctionalMap, evidence: RouteEvidence): FunctionalMap {
  const patternByPageId = new Map(map.pages.map((p) => [p.id, p.routePattern]));
  const passed = evidence.tests
    .filter((t) => t.status === 'passed')
    .map((t) => ({ spec: t.spec, patterns: urlsToPatterns(t.urls) }));

  const flows = map.flows.map((flow) => {
    const stepPatterns = flow.steps
      .map((id) => patternByPageId.get(id))
      .filter((p): p is string => p !== undefined);
    const coveredBy = [...new Set(
      passed.filter((t) => isOrderedSubsequence(stepPatterns, t.patterns)).map((t) => t.spec),
    )].sort();
    return { ...flow, coveredBy };
  });

  return { ...map, schemaVersion: SCHEMA_VERSION, flows };
}
