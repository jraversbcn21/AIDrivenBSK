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

  constructor(private readonly rules: RouteRules, private readonly bounds: CrawlBounds) {}

  private key(item: FrontierItem): string {
    return `${item.session}:${routePattern(item.path)}`;
  }

  add(item: FrontierItem): boolean {
    if (item.depth > this.bounds.maxDepth) return false;
    if (!isAllowed(item.path, this.rules)) return false;
    const k = this.key(item);
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    this.queue.push(item);
    return true;
  }

  next(): FrontierItem | undefined {
    if (this.handedOut >= this.bounds.maxPages) return undefined;
    const item = this.queue.shift();
    if (item) this.handedOut++;
    return item;
  }

  get visitedCount(): number {
    return this.handedOut;
  }
}
