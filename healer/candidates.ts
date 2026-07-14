import type { FunctionalMap, MapElement } from '../explorer/map/schema';
import type { Session } from '../explorer/types';
import type { Strategy } from '../src/support/locators';
import type { BrokenLocator } from './parse';

export interface RankedCandidate {
  elementId: string;
  pageId: string;
  pagePath: string;
  pageSession: Session;
  strategy: Strategy;
  matchEvidence: string[];
  rankScore: number;
  /** True when the element is only revealed by an interaction — the prober must not
   *  expect it to be load-visible (M8 lesson; verdict becomes skipped-overlay). */
  revealedBy: boolean;
}

export interface CandidateSearch {
  scope: 'flows' | 'map-wide';
  candidates: RankedCandidate[];
}

/**
 * Ranking weights (decision log D6): every signal reuses an existing, live-validated
 * map field — label text, role, component (B14), revealedBy (M8), count (B17).
 */
const SCORE = {
  exactLabel: 100,
  regexMatch: 90,
  containment: 60,
  tokenOverlapEach: 10,
  tokenOverlapCap: 40,
  roleAgreement: 30,
  roleMismatch: -20,
  sharedChrome: -25,
  revealedOverlay: -25,
} as const;

/**
 * Minimum net score to be proposed at all (decision log D11): a single shared token on
 * a chrome element (e.g. "mail" linking a login interstitial to a footer contact button)
 * scores 10+30-25=15 — real, predicted-in-advance false-positive material. The floor
 * keeps weak-evidence lookalikes out; a bare role-agreement match (strict-mode healing,
 * score exactly 30) stays in.
 */
const MIN_PROPOSAL_SCORE = 30;

// Diacritic/case-insensitive normalization: "Añadir" and "anadir" must compare equal.
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

// Minimum meaningful-token length aligned with MIN_CONTAINMENT_LENGTH: 3-char Spanish
// stopwords ("con", "por", "las") are prepositions/articles, not selector evidence —
// live-confirmed noise source (the A6 regex's "con" token, decision log D12).
function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 4));
}

/** The broken locator's comparable text: role name, or the testId/label/placeholder value. */
function brokenNeedle(broken: BrokenLocator): string | undefined {
  return broken.name ?? broken.value;
}

const REGEX_LITERAL = /^\/((?:[^/\\]|\\.)*)\/([a-z]*)$/;

// Containment below this many normalized chars is noise, not evidence — live-confirmed:
// 1-char size labels ("L", "M") "contained in" any needle with that letter (demo, D12).
const MIN_CONTAINMENT_LENGTH = 4;

function tokenOverlap(needle: string, label: string): { score: number; evidence: string } | null {
  const shared = [...tokens(needle)].filter((t) => tokens(label).has(t));
  if (shared.length === 0) return null;
  return {
    score: Math.min(shared.length * SCORE.tokenOverlapEach, SCORE.tokenOverlapCap),
    evidence: `shared tokens: ${shared.join(', ')}`,
  };
}

function nameEvidence(needle: string, label: string): { score: number; evidence: string } | null {
  const regexLit = REGEX_LITERAL.exec(needle);
  if (regexLit) {
    try {
      if (new RegExp(regexLit[1], regexLit[2]).test(label)) {
        return { score: SCORE.regexMatch, evidence: `label matches the broken locator's regex ${needle}` };
      }
      // A regex that doesn't match degrades to token overlap on its word tokens only —
      // its raw "/…/i" source is not a label to substring-match against (live finding, D12).
      return tokenOverlap(regexLit[1], label);
    } catch {
      return tokenOverlap(regexLit[1], label);
    }
  }
  const a = normalize(needle);
  const b = normalize(label);
  if (a === b) return { score: SCORE.exactLabel, evidence: 'exact label match (case/diacritic-insensitive)' };
  if (a.length >= MIN_CONTAINMENT_LENGTH && b.length >= MIN_CONTAINMENT_LENGTH && (b.includes(a) || a.includes(b))) {
    return { score: SCORE.containment, evidence: 'label containment match' };
  }
  return tokenOverlap(needle, label);
}

/**
 * Convert a candidate's selectorHints into the proposed Strategy, honouring the framework
 * priority testId → role → label — except a testId that repeats on its own page (B17's
 * count, B16's uniqueness rule) falls through to role/label: proposing it would just
 * re-create a strict-mode violation.
 */
function toStrategy(el: MapElement): Strategy | null {
  const testIdUnique = el.selectorHints.testId != null && (el.count ?? 1) === 1;
  if (testIdUnique) return { testId: el.selectorHints.testId };
  if (el.selectorHints.role) {
    return { role: { type: el.selectorHints.role.type as NonNullable<Strategy['role']>['type'], name: el.selectorHints.role.name } };
  }
  if (el.selectorHints.label) return { label: el.selectorHints.label };
  if (el.selectorHints.testId) return { testId: el.selectorHints.testId }; // repeated but the only hint — the probe will judge it
  return null;
}

function scoreElement(broken: BrokenLocator, el: MapElement): { score: number; evidence: string[] } | null {
  const evidence: string[] = [];
  let score = 0;

  const needle = brokenNeedle(broken);
  if (needle !== undefined) {
    const name = nameEvidence(needle, el.label);
    if (name === null) return null; // no textual link at all — not a candidate
    score += name.score;
    evidence.push(name.evidence);
  } else if (broken.role !== undefined && el.role === broken.role) {
    // Bare getByRole('dialog') strict-mode shape: role is the only evidence available.
    evidence.push(`same role as the broken locator (${broken.role})`);
  } else {
    return null;
  }

  if (broken.role !== undefined) {
    if (el.role === broken.role) { score += SCORE.roleAgreement; evidence.push(`role agreement (${el.role})`); }
    else { score += SCORE.roleMismatch; evidence.push(`role mismatch (${el.role} vs ${broken.role})`); }
  }
  if (el.component !== undefined) { score += SCORE.sharedChrome; evidence.push(`shared chrome (${el.component}) — deprioritized`); }
  if (el.revealedBy !== undefined) { score += SCORE.revealedOverlay; evidence.push('revealed by interaction — not load-visible'); }

  return score >= MIN_PROPOSAL_SCORE ? { score, evidence } : null;
}

export function findCandidates(
  broken: BrokenLocator,
  flowsAffected: string[],
  map: FunctionalMap,
  top: number,
): CandidateSearch {
  const pageById = new Map(map.pages.map((p) => [p.id, p]));

  // All step pages of the affected flows — the break can be mid-journey (A6 was), not just at the leaf.
  const scopedPageIds = new Set<string>();
  for (const flowId of flowsAffected) {
    for (const step of map.flows.find((f) => f.id === flowId)?.steps ?? []) scopedPageIds.add(step);
  }

  const rank = (elements: MapElement[]): RankedCandidate[] => elements
    .flatMap((el) => {
      const scored = scoreElement(broken, el);
      const strategy = scored !== null ? toStrategy(el) : null;
      const page = pageById.get(el.pageId);
      if (scored === null || strategy === null || page === undefined) return [];
      return [{
        elementId: el.id, pageId: el.pageId, pagePath: page.path, pageSession: page.session,
        strategy, matchEvidence: scored.evidence, rankScore: scored.score,
        revealedBy: el.revealedBy !== undefined,
      }];
    })
    .sort((a, b) => b.rankScore - a.rankScore || a.elementId.localeCompare(b.elementId))
    .slice(0, top);

  if (scopedPageIds.size > 0) {
    const scoped = rank(map.elements.filter((el) => scopedPageIds.has(el.pageId)));
    if (scoped.length > 0) return { scope: 'flows', candidates: scoped };
  }
  return { scope: 'map-wide', candidates: rank(map.elements) };
}
