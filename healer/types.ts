import type { Strategy } from '../src/support/locators';
import type { Session } from '../explorer/types';
import type { BrokenLocator } from './parse';

export type CandidateVerdict =
  | 'validated'            // unique + visible on the live page
  | 'rejected-not-found'   // resolved to 0 elements live
  | 'rejected-not-unique'  // resolved to >1 elements live (would re-create a strict-mode break)
  | 'rejected-not-visible' // exists but not visible at load
  | 'skipped-overlay'      // revealedBy element: load-probe would false-fail (M8 lesson)
  | 'error'                // the probe itself failed (navigation error etc.)
  | 'not-probed';          // --no-probe run

export interface HealingCandidate {
  elementId: string;
  pageId: string;
  pagePath: string;
  pageSession: Session;
  strategy: Strategy;
  matchEvidence: string[];
  rankScore: number;
  verdict: CandidateVerdict;
  observed?: { count: number; visible: boolean };
  error?: string;
}

export interface HealingProposal {
  spec: string;
  title: string;
  broken: BrokenLocator | null; // null = the error message carried no recognizable locator
  status: 'confirmed' | 'unconfirmed' | 'unparseable' | 'no-candidates';
  scope: 'flows' | 'map-wide';
  candidates: HealingCandidate[]; // rank order
}

export interface HealingReport {
  generatedAt: string;
  failureReportGeneratedAt: string;
  mapGeneratedAt: string;
  totals: {
    selectorDriftFailures: number;
    confirmed: number;
    unconfirmed: number;
    unparseable: number;
    noCandidates: number;
  };
  proposals: HealingProposal[];
}
