import type { Classifier, PageContext, Classification } from './Classifier';
import type { PageType } from '../map/schema';

export type LlmComplete = (p: { system: string; user: string }) => Promise<string>;

const VALID: PageType[] = ['Home', 'PLP', 'PDP', 'Cart', 'Checkout', 'Account', 'Wishlist', 'Search', 'Other'];

const SYSTEM =
  'You classify an e-commerce web page into exactly one pageType. ' +
  `Respond ONLY with JSON: {"pageType": one of ${JSON.stringify(VALID)}, "confidence": 0..1}.`;

export class LlmClassifier implements Classifier {
  constructor(private readonly complete: LlmComplete, private readonly fallback: Classifier) {}

  async classifyPage(ctx: PageContext): Promise<Classification> {
    try {
      const raw = await this.complete({
        system: SYSTEM,
        user: JSON.stringify({ path: ctx.path, title: ctx.title, landmarkRoles: ctx.landmarkRoles, signals: ctx.signals, text: ctx.textSummary }),
      });
      const parsed = JSON.parse(raw) as { pageType?: string; confidence?: number };
      if (!parsed.pageType || !VALID.includes(parsed.pageType as PageType)) {
        return this.fallback.classifyPage(ctx);
      }
      return { pageType: parsed.pageType as PageType, confidence: Number(parsed.confidence ?? 0.5) };
    } catch {
      return this.fallback.classifyPage(ctx);
    }
  }
}
