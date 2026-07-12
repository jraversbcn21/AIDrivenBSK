import type { TestIdHint } from '../src/support/locators';

export type Session = 'anon' | 'auth';

export interface SelectorHints {
  testId?: TestIdHint;
  role?: { type: string; name: string };
  label?: string;
}

export type ElementType = 'button' | 'link' | 'filter' | 'sort' | 'modal';

export interface ExtractedElement {
  type: ElementType;
  label: string;
  role: string;
  selectorHints: SelectorHints;
  destructive: boolean;
  component?: ComponentKind; // shared-chrome provenance (B14); absent = page-specific
}

export interface ExtractedFormField {
  name: string;
  type: string;
  required: boolean;
}

export interface ExtractedForm {
  fields: ExtractedFormField[];
  purposeHint: string;
}

export type ComponentKind =
  | 'Header' | 'Footer' | 'ProductCard' | 'SearchBar' | 'FiltersPanel' | 'MiniCart' | 'Other';

export interface PageMeta {
  path: string;          // normalized path (from url.ts)
  url: string;           // full URL as visited
  title: string;
  session: Session;
  discoveredVia: string; // 'seed' or the parent path
}

export interface PageExtraction {
  meta: PageMeta;
  landmarkRoles: string[];
  textSummary: string;        // trimmed text for classifier context
  links: string[];            // raw hrefs found on the page
  elements: ExtractedElement[];
  forms: ExtractedForm[];
  componentKinds: ComponentKind[];
  interactions?: ExtractedInteraction[]; // optional — analyzers never set it; the crawler attaches it
  truncated?: boolean; // true when the page had more eligible elements than the per-page cap (audit F11)
}

export type InteractionOutcome = 'overlay' | 'navigated' | 'none';

export interface ExtractedInteraction {
  trigger: { role: string; label: string; type: ElementType };
  outcome: InteractionOutcome;
  revealedElements: ExtractedElement[]; // empty unless outcome === 'overlay'
  revealedLinks: string[];              // empty unless outcome === 'overlay'
  navigatedTo?: string;                 // normalized path; only when outcome === 'navigated'
}
