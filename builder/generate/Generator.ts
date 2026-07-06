import type { Session } from '../../explorer/types';
import type { Strategy } from '../../src/support/locators';

export interface ChainStep {
  path: string;
  routePattern: string;
  title: string;
}

/** Everything a generator needs to emit one journey's files — resolved, map-independent. */
export interface JourneyInput {
  flowId: string;
  journeyName: string; // human-readable chain, from the proposal
  session: Session;
  chain: ChainStep[]; // root -> leaf
  loadedSignal: Strategy | null; // best real element of the leaf page; null = main-landmark fallback
  mapGeneratedAt: string; // stamped into headers instead of wall-clock time (determinism)
}

/** A journey that additionally opens (and closes) a map-recorded overlay interaction
 *  on the leaf page. Selection guarantees an open-signal exists: either the overlay
 *  is a dialog (assert getByRole('dialog')) or overlayElementSignal is non-null. */
export interface InteractionJourneyInput extends JourneyInput {
  interactionId: string;
  trigger: Strategy; // clicked with .first(): "any exemplar of the (possibly grid-repeated) trigger"
  triggerLabel: string;
  overlayIsDialog: boolean;
  overlayElementSignal: Strategy | null;
}

export interface GeneratedFile {
  relPath: string; // relative to the output dir
  content: string;
}

/** The pluggable seam (same pattern as the Explorer's Classifier): deterministic
 *  templates today, an LLM-backed implementation can plug in without CLI changes. */
export interface Generator {
  generate(input: JourneyInput): GeneratedFile[];
}
