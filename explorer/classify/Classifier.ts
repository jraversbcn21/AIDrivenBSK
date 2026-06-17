import type { PageType } from '../map/schema';

export interface PageSignals {
  hasAddToCart: boolean;
  hasSizeSelector: boolean;
  hasProductGrid: boolean;
  hasFilters: boolean;
  hasCheckoutSteps: boolean;
  hasLoginForm: boolean;
  hasSearchResults: boolean;
}

export interface PageContext {
  path: string;
  title: string;
  landmarkRoles: string[];
  textSummary: string;
  signals: PageSignals;
}

export interface Classification {
  pageType: PageType;
  confidence: number;
}

export interface Classifier {
  classifyPage(ctx: PageContext): Promise<Classification>;
}
