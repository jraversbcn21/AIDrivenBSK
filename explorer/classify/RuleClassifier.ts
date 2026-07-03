import type { Classifier, PageContext, Classification } from './Classifier';

export class RuleClassifier implements Classifier {
  async classifyPage(ctx: PageContext): Promise<Classification> {
    const s = ctx.signals;
    const p = ctx.path;

    // Deterministic path rules first — confirmed-live URL patterns beat text signals on
    // this site (B13, 2026-07-03). `-c0p{id}.html` is THE DES PDP pattern (findings §5;
    // already trusted by explorer/url.ts routePattern and analyzeAria's ProductCard
    // detection). A -c0p page is a PDP even when it shows a recommendations carousel with
    // per-card quick-add buttons, so this wins over the PLP signal rule too.
    if (/-c0p\d+\.html$/i.test(p)) return { pageType: 'PDP', confidence: 0.95 };
    if (/\/shop-cart\.html$|\/cart|\/cesta/.test(p)) return { pageType: 'Cart', confidence: 0.9 };
    if (/\/wishlist|\/favoritos/.test(p)) return { pageType: 'Wishlist', confidence: 0.8 };

    // PLP checked first among signal rules: DES's grid cards each carry their own "Añadir
    // a la cesta" quick-add button, and category pages often mention "talla" somewhere
    // (e.g. a size-guide link) without being a genuine PDP — hasProductGrid+hasFilters is
    // the more specific signal and must win when both fire together (live-confirmed
    // 2026-07-03, findings doc §8).
    if (s.hasProductGrid && s.hasFilters) return { pageType: 'PLP', confidence: 0.85 };
    if (s.hasAddToCart && s.hasSizeSelector) return { pageType: 'PDP', confidence: 0.9 };
    // Checkout needs a path hint besides the text signal: the text regex alone matches
    // ordinary PDP/help boilerplate ("Envíos y devoluciones" — B13). The hint list is a
    // best guess to confirm against the real DES checkout URL when one is first reached
    // (backlog D15).
    if (s.hasCheckoutSteps && /checkout|order|pago|payment/i.test(p)) {
      return { pageType: 'Checkout', confidence: 0.8 };
    }
    if (s.hasLoginForm) return { pageType: 'Account', confidence: 0.75 };
    if (s.hasSearchResults) return { pageType: 'Search', confidence: 0.75 };
    if (p === '/' || /^\/[a-z]{2}$/.test(p)) return { pageType: 'Home', confidence: 0.7 };

    return { pageType: 'Other', confidence: 0.3 };
  }
}
