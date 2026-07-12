import type {
  PageExtraction, PageMeta, ExtractedElement, ExtractedForm, ExtractedFormField, ElementType, ComponentKind,
} from '../types';
import { isDestructive } from './destructive';
import type { AriaNode } from './aria';

const MAX_ELEMENTS_PER_PAGE = 60;
const LANDMARKS = new Set(['banner', 'navigation', 'main', 'contentinfo', 'form', 'dialog', 'search']);
const FIELD_ROLES = new Set(['textbox', 'searchbox', 'checkbox', 'combobox']);

function elementTypeFor(node: AriaNode): ElementType | undefined {
  const name = node.name ?? '';
  if (node.role === 'checkbox') return 'filter';
  if (node.role === 'dialog') return 'modal';
  if (node.role === 'combobox' && /orden|sort/i.test(name)) return 'sort';
  if (node.role === 'button') {
    if (/filtr/i.test(name)) return 'filter';
    if (/orden|sort/i.test(name)) return 'sort';
    return 'button';
  }
  return undefined;
}

function inferFormPurpose(form: AriaNode, fieldLabels: string[]): string {
  const name = form.name ?? '';
  const labels = fieldLabels.join(' ');
  if (/login|inicia/i.test(name) || (/e-?mail/i.test(labels) && /contraseña|password/i.test(labels))) return 'login';
  if (/regist/i.test(name)) return 'register';
  if (/busca|search/i.test(`${name} ${labels}`)) return 'search';
  if (/newsletter/i.test(`${name} ${labels}`)) return 'newsletter';
  return 'other';
}

export function analyzeAriaNodes(nodes: AriaNode[], meta: PageMeta): PageExtraction {
  const links: string[] = [];
  const elements: ExtractedElement[] = [];
  const forms: ExtractedForm[] = [];
  const landmarkRoles: string[] = [];
  const componentKinds = new Set<ComponentKind>();
  const texts: string[] = [];
  let truncated = false;

  const visit = (node: AriaNode, inListitem: boolean, chrome: 'Header' | 'Footer' | undefined): void => {
    if (node.role === 'text') {
      if (node.text) texts.push(node.text);
      return;
    }
    const nextChrome =
      node.role === 'banner' ? 'Header' : node.role === 'contentinfo' ? 'Footer' : chrome;
    if (LANDMARKS.has(node.role)) landmarkRoles.push(node.role);
    if (node.role === 'banner') componentKinds.add('Header');
    if (node.role === 'contentinfo') componentKinds.add('Footer');
    if (node.role === 'searchbox') componentKinds.add('SearchBar');
    const name = node.name ?? '';
    if (/filtr/i.test(name)) componentKinds.add('FiltersPanel');
    if ((node.role === 'link' || node.role === 'button') && /cesta|cart/i.test(name)) componentKinds.add('MiniCart');

    if (node.role === 'link' && node.url) {
      links.push(node.url);
      if (inListitem && /-c0p/i.test(node.url)) componentKinds.add('ProductCard');
    }

    const type = elementTypeFor(node);
    if (type) {
      if (elements.length < MAX_ELEMENTS_PER_PAGE) {
        const el: ExtractedElement = {
          type,
          label: name,
          role: node.role,
          selectorHints: name ? { role: { type: node.role, name } } : {},
          destructive: isDestructive(name),
        };
        // Cart-named chrome inside the banner is the header cart affordance (MiniCart) —
        // the regex is scoped to the banner so page-body "Añadir a la cesta" stays untagged.
        const component = nextChrome === 'Header' && /cesta|cart/i.test(name) ? 'MiniCart' : nextChrome;
        if (component !== undefined) el.component = component;
        elements.push(el);
      } else {
        truncated = true;
      }
    }

    if (node.role === 'form') {
      const fields: ExtractedFormField[] = [];
      const collect = (n: AriaNode): void => {
        if (FIELD_ROLES.has(n.role)) fields.push({ name: n.name ?? '', type: n.role, required: false });
        n.children.forEach(collect);
      };
      node.children.forEach(collect);
      forms.push({ purposeHint: inferFormPurpose(node, fields.map((f) => f.name)), fields });
    }

    node.children.forEach((child) => visit(child, inListitem || node.role === 'listitem', nextChrome));
  };

  nodes.forEach((n) => visit(n, false, undefined));

  return {
    meta,
    landmarkRoles,
    textSummary: texts.join(' ').slice(0, 500),
    links,
    elements,
    forms,
    componentKinds: [...componentKinds],
    ...(truncated ? { truncated: true } : {}),
  };
}
