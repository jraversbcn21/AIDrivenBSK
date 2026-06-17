import type {
  Session, SelectorHints, ElementType, ComponentKind, ExtractedFormField,
} from '../types';

export const SCHEMA_VERSION = '1.0';

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
}
