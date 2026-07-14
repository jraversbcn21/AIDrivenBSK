import type { CandidateVerdict } from './types';

export interface ProbeObservation {
  revealedBy: boolean;
  observed?: { count: number; visible: boolean };
  error?: string;
}

/**
 * Pure verdict over a probe observation (unit-testable without a browser — the same
 * split the crawler uses: browser plumbing thin, decisions pure). Precedence:
 * overlay-skip > probe error > observation > not-probed.
 */
export function decideVerdict(obs: ProbeObservation): CandidateVerdict {
  if (obs.revealedBy) return 'skipped-overlay';
  if (obs.error !== undefined) return 'error';
  if (obs.observed === undefined) return 'not-probed';
  if (obs.observed.count === 0) return 'rejected-not-found';
  if (obs.observed.count > 1) return 'rejected-not-unique';
  return obs.observed.visible ? 'validated' : 'rejected-not-visible';
}
