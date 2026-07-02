import type { BrowserContext } from '@playwright/test';
import type { PageExtraction, Session } from '../types';
import type { CrawlBounds, ExtractionMode } from '../config';
import { Frontier, type FrontierItem } from './frontier';
import { extractorFor } from '../extract/fromPage';
import { normalizePath, isSameOrigin, type RouteRules } from '../url';
import { acceptConsent, suppressOnboardingTour } from '../../src/support/consent';

export interface CrawlDeps {
  context: BrowserContext;
  baseURL: string;
  rules: RouteRules;
  bounds: CrawlBounds;
  extraction: ExtractionMode;
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
      const extraction = await extract(page, session, item.discoveredVia, deps.baseURL);

      // DES server-side redirects (e.g. the gender gate) can land two different queued
      // paths on the same destination. The requested path was already deduped by add();
      // only re-check when the resolved path differs, so a plain single-visit page isn't
      // rejected against its own dedup entry.
      if (extraction.meta.path !== item.path && !frontier.markSeen(session, extraction.meta.path)) {
        continue;
      }
      extractions.push(extraction);

      for (const href of extraction.links) {
        if (!isSameOrigin(href, deps.baseURL)) continue;
        frontier.add({
          path: normalizePath(href, deps.baseURL),
          session,
          depth: item.depth + 1,
          discoveredVia: item.path,
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
