import type { Classifier, PageContext, Classification } from './Classifier';

export class RuleClassifier implements Classifier {
  async classifyPage(ctx: PageContext): Promise<Classification> {
    const s = ctx.signals;
    const p = ctx.path;

    if (s.hasAddToCart && s.hasSizeSelector) return { pageType: 'PDP', confidence: 0.9 };
    if (s.hasProductGrid && s.hasFilters) return { pageType: 'PLP', confidence: 0.85 };
    if (s.hasCheckoutSteps) return { pageType: 'Checkout', confidence: 0.8 };
    if (s.hasLoginForm) return { pageType: 'Account', confidence: 0.75 };
    if (s.hasSearchResults) return { pageType: 'Search', confidence: 0.75 };
    if (/\/wishlist|\/favoritos/.test(p)) return { pageType: 'Wishlist', confidence: 0.8 };
    if (/\/cart|\/cesta/.test(p)) return { pageType: 'Cart', confidence: 0.8 };
    if (p === '/' || /^\/[a-z]{2}$/.test(p)) return { pageType: 'Home', confidence: 0.7 };

    return { pageType: 'Other', confidence: 0.3 };
  }
}
