import type { PageExtraction } from '../types';
import type { PageContext, PageSignals } from './Classifier';

export function buildPageContext(ex: PageExtraction): PageContext {
  const labels = ex.elements.map((e) => e.label.toLowerCase());
  const text = ex.textSummary.toLowerCase();
  const has = (re: RegExp) => labels.some((l) => re.test(l)) || re.test(text);

  const signals: PageSignals = {
    hasAddToCart: has(/añadir a la cesta|add to (cart|bag)/),
    hasSizeSelector: has(/talla|size/),
    hasProductGrid: ex.componentKinds.includes('ProductCard') || has(/productos|results|resultados/),
    hasFilters: ex.componentKinds.includes('FiltersPanel') || ex.elements.some((e) => e.type === 'filter'),
    hasCheckoutSteps: has(/pago|checkout|envío|shipping|payment/),
    hasLoginForm: ex.forms.some((f) => f.purposeHint === 'login'),
    hasSearchResults: has(/resultados de búsqueda|search results/),
  };

  return {
    path: ex.meta.path,
    title: ex.meta.title,
    landmarkRoles: ex.landmarkRoles,
    textSummary: ex.textSummary,
    signals,
  };
}
