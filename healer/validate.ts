import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { locate } from '../src/support/locators';
import { acceptConsent, suppressOnboardingTour } from '../src/support/consent';
import type { Session } from '../explorer/types';
import type { RankedCandidate } from './candidates';
import { decideVerdict, type ProbeObservation } from './verdict';
import type { CandidateVerdict } from './types';

export interface ProbeResult {
  verdict: CandidateVerdict;
  observed?: { count: number; visible: boolean };
  error?: string;
}

// Hydration budget per probed page: DES grids/buttons attach up to ~10s after
// domcontentloaded (findings §10's settle evidence) — poll, don't one-shot.
const PROBE_DEADLINE_MS = 10_000;
const PROBE_POLL_MS = 500;

async function probeOnPage(page: Page, candidate: RankedCandidate): Promise<ProbeObservation> {
  const locator = locate(page, candidate.strategy);
  const deadline = Date.now() + PROBE_DEADLINE_MS;
  let observed = { count: 0, visible: false };
  // act→verify→retry doctrine: keep observing until the candidate is unique+visible or
  // the budget runs out; the last observation is the verdict's evidence either way.
  for (;;) {
    const count = await locator.count();
    const visible = count >= 1 ? await locator.first().isVisible() : false;
    observed = { count, visible };
    if (count === 1 && visible) break;
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(PROBE_POLL_MS);
  }
  return { revealedBy: candidate.revealedBy, observed };
}

/**
 * Probe candidates live against DES: one Chromium, one context per session kind
 * (auth reuses .auth/state.json — the explorer CLI's exact pattern), one navigation
 * per distinct page path, resolving each candidate via the framework's own locate()
 * so the probe validates exactly what a healed spec would run.
 */
export async function probeCandidates(
  candidates: RankedCandidate[],
  baseURL: string,
): Promise<Map<RankedCandidate, ProbeResult>> {
  const results = new Map<RankedCandidate, ProbeResult>();
  const probeable = candidates.filter((c) => !c.revealedBy);
  for (const c of candidates.filter((c) => c.revealedBy)) {
    results.set(c, { verdict: decideVerdict({ revealedBy: true }) });
  }
  if (probeable.length === 0) return results;

  const browser: Browser = await chromium.launch();
  try {
    const bySession = new Map<Session, RankedCandidate[]>();
    for (const c of probeable) {
      bySession.set(c.pageSession, [...(bySession.get(c.pageSession) ?? []), c]);
    }

    for (const [session, sessionCandidates] of bySession) {
      const context: BrowserContext = await browser.newContext({
        baseURL,
        ...(session === 'auth' ? { storageState: '.auth/state.json' } : {}),
      });
      const page = await context.newPage();
      await suppressOnboardingTour(page);

      const byPath = new Map<string, RankedCandidate[]>();
      for (const c of sessionCandidates) {
        byPath.set(c.pagePath, [...(byPath.get(c.pagePath) ?? []), c]);
      }

      for (const [path, pathCandidates] of byPath) {
        try {
          await page.goto(path, { waitUntil: 'domcontentloaded' });
          await acceptConsent(page);
          for (const c of pathCandidates) {
            const obs = await probeOnPage(page, c);
            results.set(c, {
              verdict: decideVerdict(obs),
              ...(obs.observed !== undefined ? { observed: obs.observed } : {}),
            });
          }
        } catch (err) {
          const message = String(err);
          for (const c of pathCandidates) {
            if (!results.has(c)) {
              results.set(c, { verdict: decideVerdict({ revealedBy: false, error: message }), error: message });
            }
          }
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}
