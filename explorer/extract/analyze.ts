import { parseHTML } from 'linkedom';
import type {
  PageExtraction, PageMeta, ExtractedElement, ExtractedForm, ElementType, ComponentKind,
} from '../types';
import { isDestructive } from './destructive';
import { hintsFor, roleOf } from './hints';

function text(el: Element): string {
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
}

function inferFormPurpose(form: Element): string {
  const aria = (form.getAttribute('aria-label') ?? '').toLowerCase();
  const names = Array.from(form.querySelectorAll('input')).map((i) => (i.getAttribute('name') ?? '').toLowerCase());
  if (aria.includes('login') || (names.includes('email') && names.includes('password'))) return 'login';
  if (aria.includes('register') || names.includes('confirm-password')) return 'register';
  if (names.some((n) => n.includes('search')) || form.querySelector('input[type=search]')) return 'search';
  if (names.some((n) => n.includes('newsletter'))) return 'newsletter';
  return 'other';
}

function detectComponents(document: Document): ComponentKind[] {
  const kinds: ComponentKind[] = [];
  if (document.querySelector('header, [role=banner]')) kinds.push('Header');
  if (document.querySelector('footer, [role=contentinfo]')) kinds.push('Footer');
  if (document.querySelector('input[type=search], [role=search], [role=searchbox]')) kinds.push('SearchBar');
  if (document.querySelector('[data-testid*=filter i], [aria-label*=filtr i]')) kinds.push('FiltersPanel');
  if (document.querySelector('[aria-label*=cesta i], [aria-label*=cart i], [data-testid*=cart i]')) kinds.push('MiniCart');
  return kinds;
}

function componentFor(el: Element, label: string): ComponentKind | undefined {
  // Cart-named chrome inside the header is the cart affordance (MiniCart); the regex is
  // scoped to the header so page-body "Añadir a la cesta" stays untagged (page-specific).
  if (el.closest('header, [role=banner]')) return /cesta|cart/i.test(label) ? 'MiniCart' : 'Header';
  if (el.closest('footer, [role=contentinfo]')) return 'Footer';
  return undefined;
}

export function analyzePage(html: string, meta: PageMeta): PageExtraction {
  const { document } = parseHTML(html);

  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href') ?? '')
    .filter((h) => h && !h.startsWith('#') && !h.startsWith('javascript:'));

  const elements: ExtractedElement[] = [];

  const pushEl = (el: Element, type: ElementType): void => {
    const label = text(el);
    const entry: ExtractedElement = {
      type, label, role: roleOf(el), selectorHints: hintsFor(el), destructive: isDestructive(label),
    };
    const component = componentFor(el, label);
    if (component !== undefined) entry.component = component;
    elements.push(entry);
  };

  // Ordered highest-priority-first: an element matching multiple passes is
  // recorded once, under the type of the earliest (highest-priority) match.
  const elementPasses: Array<[ElementType, string]> = [
    ['modal', '[role=dialog], dialog'],
    ['filter', '[data-testid*=filter i], [aria-label*=filtr i], [role=checkbox]'],
    ['sort', '[aria-label*=orden i], [aria-label*=sort i], select[name*=sort i]'],
    ['button', 'button, [role=button], input[type=submit], input[type=button]'],
  ];
  const claimed = new Set<Element>();
  elementPasses.forEach(([type, selector]) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (claimed.has(el)) return;
      claimed.add(el);
      pushEl(el, type);
    });
  });

  const forms: ExtractedForm[] = Array.from(document.querySelectorAll('form')).map((form) => ({
    purposeHint: inferFormPurpose(form),
    fields: Array.from(form.querySelectorAll('input, select, textarea')).map((f) => ({
      name: f.getAttribute('name') ?? '',
      type: f.getAttribute('type') ?? f.tagName.toLowerCase(),
      required: f.hasAttribute('required'),
    })),
  }));

  const landmarkRoles = Array.from(document.querySelectorAll('header, footer, nav, main, [role]'))
    .map((el) => roleOf(el));

  const textSummary = (document.body?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 500);

  return { meta, landmarkRoles, textSummary, links, elements, forms, componentKinds: detectComponents(document) };
}
