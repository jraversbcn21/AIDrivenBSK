import type { Session } from '../types';
import type { CrawlBounds } from '../config';
import { routePattern, isAllowed, type RouteRules } from '../url';

export interface FrontierItem {
  path: string;
  session: Session;
  depth: number;
  discoveredVia: string;
}

export class Frontier {
  private readonly seen = new Set<string>();
  private readonly queue: FrontierItem[] = [];
  private handedOut = 0;
  private readonly start: number;

  constructor(
    private readonly rules: RouteRules,
    private readonly bounds: CrawlBounds,
    private readonly now: () => number = Date.now,
  ) {
    this.start = now();
  }

  private key(session: Session, path: string): string {
    return `${session}:${routePattern(path)}`;
  }

  /**
   * Registers a path as seen for a session; returns false if it was already registered.
   * Exposed so the crawler can also dedupe on the *resolved* URL after a navigation (DES
   * server-side redirects, e.g. the gender gate, can land two different queued paths on the
   * same destination — dedup on the requested path alone lets both through and duplicates
   * that page in the map; confirmed live during the first crawl).
   */
  markSeen(session: Session, path: string): boolean {
    const k = this.key(session, path);
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }

  add(item: FrontierItem): boolean {
    if (item.depth > this.bounds.maxDepth) return false;
    if (!isAllowed(item.path, this.rules)) return false;
    if (!this.markSeen(item.session, item.path)) return false;
    this.queue.push(item);
    return true;
  }

  next(): FrontierItem | undefined {
    if (this.handedOut >= this.bounds.maxPages) return undefined;
    if (this.now() - this.start > this.bounds.timeBudgetMs) return undefined;
    const item = this.queue.shift();
    if (item) this.handedOut++;
    return item;
  }

  get visitedCount(): number {
    return this.handedOut;
  }
}
