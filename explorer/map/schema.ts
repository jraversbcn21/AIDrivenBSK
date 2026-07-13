import type {
  Session, SelectorHints, ElementType, ComponentKind, ExtractedFormField,
} from '../types';

export const SCHEMA_VERSION = '1.7';

export type PageType =
  | 'Home' | 'PLP' | 'PDP' | 'Cart' | 'Checkout' | 'Account' | 'Wishlist' | 'Search' | 'Other';

export type Priority = 'high' | 'med' | 'low';

export interface MapPage {
  id: string;
  path: string;
  routePattern: string;
  pageType: PageType;
  session: Session;
  title: string;
  discoveredVia: string;
  truncated?: boolean; // true when extraction hit the per-page element cap (audit F11)
}

export interface MapComponent {
  id: string;
  kind: ComponentKind;
  foundOnPages: string[];
}

export interface MapElement {
  id: string;
  pageId: string;
  type: ElementType;
  label: string;
  role: string;
  selectorHints: SelectorHints;
  destructive: boolean;
  component?: ComponentKind; // shared-chrome provenance (B14); absent = page-specific
  revealedBy?: string; // MapInteraction id; present when this element was discovered via interaction (M8)
  count?: number; // occurrences collapsed by content-dedup (B17); absent = 1
}

export interface MapInteraction {
  id: string;
  pageId: string;
  triggerElementId: string;
  outcome: 'overlay' | 'navigated' | 'none';
  revealedElementIds: string[];
  navigatedTo?: string;
}

export interface MapForm {
  id: string;
  pageId: string;
  purpose: string;
  fields: ExtractedFormField[];
}

export interface MapFlow {
  id: string;
  name: string;
  type: string;
  session: Session;
  priority: Priority;
  steps: string[]; // page ids
  coveredBy?: string[]; // spec file paths; present after plan --update (empty = evaluated, uncovered)
}

export interface FunctionalMap {
  schemaVersion: string;
  generatedAt: string;
  environment: string;
  pages: MapPage[];
  components: MapComponent[];
  elements: MapElement[];
  forms: MapForm[];
  flows: MapFlow[];
  interactions: MapInteraction[];
}
