import type { IntentMatch } from './resolve';

/**
 * Two flows are session twins when they share name+type+steps but differ in
 * `session` (v1.1: findings from B-NL1's 2026-07-14 decision log). `Session` is a
 * fixed 'anon' | 'auth' union, so a twin group is always exactly a pair.
 */
export interface TwinGroup {
  kind: 'twin-group';
  members: [IntentMatch, IntentMatch];
}

export type MatchEntry = IntentMatch | TwinGroup;

/**
 * Collapses session-twin pairs into a single TwinGroup entry; everything else
 * passes through unchanged. Preserves the input's relative order, using the
 * position of a pair's first-appearing member as the group's slot. Purely a
 * display transform — never used for scoring, tie-breaking, or auto-pick.
 */
export function groupSessionTwins(matches: IntentMatch[]): MatchEntry[] {
  // Bucket by name+type+steps. JSON.stringify (not string concatenation) avoids a
  // delimiter-free-join collision: `name` itself contains spaces and "->" arrows.
  const buckets = new Map<string, IntentMatch[]>();
  for (const m of matches) {
    const key = JSON.stringify([m.name, m.type, m.steps]);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(m);
    else buckets.set(key, [m]);
  }

  // Only a bucket of exactly 2 with differing session is a real twin pair.
  const pairByKey = new Map<string, [IntentMatch, IntentMatch]>();
  for (const [key, bucket] of buckets) {
    if (bucket.length === 2 && bucket[0].session !== bucket[1].session) {
      pairByKey.set(key, [bucket[0], bucket[1]]);
    }
  }

  const emittedFlowIds = new Set<string>();
  const result: MatchEntry[] = [];
  for (const m of matches) {
    if (emittedFlowIds.has(m.flowId)) continue; // already emitted as a pair's 2nd member
    const key = JSON.stringify([m.name, m.type, m.steps]);
    const pair = pairByKey.get(key);
    if (pair) {
      result.push({ kind: 'twin-group', members: pair });
      emittedFlowIds.add(pair[0].flowId);
      emittedFlowIds.add(pair[1].flowId);
    } else {
      result.push(m);
    }
  }
  return result;
}
