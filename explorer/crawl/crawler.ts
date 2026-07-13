import type { BrowserContext, Page } from '@playwright/test';
import type { PageExtraction, Session } from '../types';
import type { CrawlBounds, ExtractionMode, InteractionsConfig } from '../config';
import { Frontier, type FrontierItem } from './frontier';
import { waitForSettle, DEFAULT_SETTLE } from './settle';
import { extractorFor } from '../extract/fromPage';
import { normalizePath, isSameOrigin, type RouteRules } from '../url';
import { acceptConsent, suppressOnboardingTour } from '../../src/support/consent';
import { selectCandidates, discoverInteractions, INTERACT_SETTLE, type InteractionDriver, type InteractionLedger } from './interact';

export interface CrawlDeps {
  context: BrowserContext;
  baseURL: string;
  rules: RouteRules;
  bounds: CrawlBounds;
  extraction: ExtractionMode;
  interactions: InteractionsConfig;
  /** Per-crawl-global, shared by both sessions (M8b fix a): chrome dedupe and
   *  must-capture satisfaction span the whole crawl, not one session. */
  ledger: InteractionLedger;
}

function playwrightDriver(page: Page, originalPath: string, baseURL: string): InteractionDriver {
  return {
    snapshot: () => page.locator('body').ariaSnapshot(),
    // force: true per the DES hover-reveal precedent (SearchBar, findings §5); the
    // act→verify→retry loop in discoverInteractions is the real reliability layer.
    click: (role, name) => page.getByRole(role as Parameters<Page['getByRole']>[0], { name, exact: true }).first().click({ force: true }),
    pressEscape: () => page.keyboard.press('Escape'),
    currentPath: () => normalizePath(page.url(), baseURL),
    recover: async () => {
      await page.goto(originalPath, { waitUntil: 'domcontentloaded' });
      await acceptConsent(page);
      await waitForSettle(() => page.locator('body').ariaSnapshot(), (ms) => page.waitForTimeout(ms), INTERACT_SETTLE);
    },
    wait: (ms) => page.waitForTimeout(ms),
  };
}

export interface CrawlError {
  path: string;
  session: Session;
  depth: number;
  discoveredVia: string;
  message: string;
}

export interface CrawlResult {
  extractions: PageExtraction[];
  errors: CrawlError[];
}

export async function crawlSession(deps: CrawlDeps, session: Session, seeds: string[]): Promise<CrawlResult> {
  const frontier = new Frontier(deps.rules, deps.bounds);
  for (const seed of seeds) {
    frontier.add({ path: normalizePath(seed, deps.baseURL), session, depth: 0, discoveredVia: 'seed' });
  }

  const extract = extractorFor(deps.extraction);
  const extractions: PageExtraction[] = [];
  const errors: CrawlError[] = [];
  const page = await deps.context.newPage();
  // Pre-seed the bsk_onboarding cookie BEFORE the first navigation: the driver.js tour
  // otherwise intercepts clicks/overlays on a fresh session (findings §7). The crawler
  // bypasses BasePage.goto(), so it must do this itself.
  await suppressOnboardingTour(page);

  for (let item = frontier.next(); item; item = frontier.next()) {
    try {
      await page.goto(item.path, { waitUntil: 'domcontentloaded' });
      await acceptConsent(page);
      // Product grids (PLP/category pages) hydrate client-side ~1-2s after this point —
      // extracting immediately missed them entirely (findings §8). Condition-based wait:
      // poll the aria tree until it stops changing, bounded so a page that never quite
      // settles doesn't stall the crawl (aria-only signal, so skip it in `dom` mode).
      if (deps.extraction === 'aria') {
        await waitForSettle(
          () => page.locator('body').ariaSnapshot(),
          (ms) => page.waitForTimeout(ms),
          DEFAULT_SETTLE,
        );
      }
      const extraction = await extract(page, session, item.discoveredVia, deps.baseURL);

      // DES server-side redirects (e.g. the gender gate) can land two different queued
      // paths on the same destination. The requested path was already deduped by add();
      // only re-check when the resolved path differs, so a plain single-visit page isn't
      // rejected against its own dedup entry.
      if (extraction.meta.path !== item.path && !frontier.markSeen(session, extraction.meta.path)) {
        continue;
      }
      extractions.push(extraction);

      if (deps.extraction === 'aria' && deps.interactions.enabled) {
        const candidates = selectCandidates(
          extraction.elements, extraction.meta.path, deps.ledger, deps.interactions.maxPerPage,
        );
        if (candidates.length > 0) {
          const driver = playwrightDriver(page, extraction.meta.path, deps.baseURL);
          extraction.interactions = await discoverInteractions(driver, candidates, extraction.meta);
          for (const it of extraction.interactions) {
            // Only an overlay capture satisfies a must-capture class — `none`/`navigated`
            // leave it retryable on later pages (design §3.2).
            if (it.outcome === 'overlay') deps.ledger.markSatisfied(it.trigger.label);
            extraction.links.push(...it.revealedLinks);
          }
        }
      }

      for (const href of extraction.links) {
        if (!isSameOrigin(href, deps.baseURL)) continue;
        frontier.add({
          path: normalizePath(href, deps.baseURL),
          session,
          depth: item.depth + 1,
          // Resolved parent path, not the requested `item.path`: children are discovered on
          // the page as it actually resolved (`extraction.meta.path` = page.url()), and
          // buildMap indexes parents under their resolved meta.path. Using the requested path
          // truncates every chain rooted at a redirecting seed (audit F4, unmasked by F18's
          // drop of the non-redirecting `/` seed). Inert when requested === resolved.
          discoveredVia: extraction.meta.path,
        } satisfies FrontierItem);
      }
    } catch (err) {
      errors.push({ ...item, message: String(err) });
    }
    if (deps.bounds.politenessMs > 0) await page.waitForTimeout(deps.bounds.politenessMs);
  }

  await page.close();
  return { extractions, errors };
}
