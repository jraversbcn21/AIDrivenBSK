import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseAriaSnapshot } from './aria';
import { analyzeAriaNodes } from './analyzeAria';
import type { PageMeta } from '../types';

const meta: PageMeta = { path: '/es/x', url: 'https://des.example/es/x', title: 'X', session: 'anon', discoveredVia: 'seed' };

const SNAPSHOT = `- banner:
  - searchbox "Buscar"
  - button "Buscar en tienda"
  - button "Ver cesta"
  - link "Ir a la cesta":
    - /url: /es/shop-cart.html
- main:
  - button "Filtrar"
  - button "Añadir a la cesta"
  - button "Pagar"
  - checkbox "Con descuento"
  - form "login":
    - textbox "E-mail"
    - textbox "Contraseña"
  - dialog "Tallas":
    - button "Talla S"
  - list:
    - listitem:
      - link "Camiseta":
        - /url: /es/camiseta-c0p123.html
  - text: Selecciona tu talla
- contentinfo "Pie de página":
  - button "WhatsApp"`;

const extraction = analyzeAriaNodes(parseAriaSnapshot(SNAPSHOT), meta);

describe('analyzeAriaNodes', () => {
  it('collects hrefs from link nodes', () => {
    expect(extraction.links).toEqual(expect.arrayContaining(['/es/shop-cart.html', '/es/camiseta-c0p123.html']));
  });
  it('maps roles to element types and flags destructive labels', () => {
    const byLabel = (l: string) => extraction.elements.find((e) => e.label === l);
    expect(byLabel('Filtrar')?.type).toBe('filter');
    expect(byLabel('Con descuento')?.type).toBe('filter');
    expect(byLabel('Tallas')?.type).toBe('modal');
    expect(byLabel('Añadir a la cesta')).toMatchObject({ type: 'button', destructive: false });
    expect(byLabel('Pagar')).toMatchObject({ type: 'button', destructive: true });
    expect(byLabel('Añadir a la cesta')?.selectorHints.role).toEqual({ type: 'button', name: 'Añadir a la cesta' });
  });
  it('extracts forms with label-based fields and a login purpose', () => {
    expect(extraction.forms[0].purposeHint).toBe('login');
    expect(extraction.forms[0].fields).toEqual([
      { name: 'E-mail', type: 'textbox', required: false },
      { name: 'Contraseña', type: 'textbox', required: false },
    ]);
  });
  it('records landmarks, components, and a text summary', () => {
    expect(extraction.landmarkRoles).toEqual(expect.arrayContaining(['banner', 'main', 'contentinfo', 'form', 'dialog']));
    expect(extraction.componentKinds).toEqual(expect.arrayContaining(['Header', 'Footer', 'SearchBar', 'FiltersPanel', 'MiniCart', 'ProductCard']));
    expect(extraction.textSummary).toContain('Selecciona tu talla');
  });
  it('tags banner/contentinfo elements with shared-chrome provenance (B14)', () => {
    const byLabel = (l: string) => extraction.elements.find((e) => e.label === l);
    expect(byLabel('Buscar en tienda')?.component).toBe('Header');
    expect(byLabel('Ver cesta')?.component).toBe('MiniCart'); // cart-named, inside banner
    expect(byLabel('WhatsApp')?.component).toBe('Footer');
    // Page-body elements stay page-specific — including cart-named ones (the exact
    // candidate B14 wants to win must never be tagged shared):
    expect(byLabel('Añadir a la cesta')?.component).toBeUndefined();
    expect(byLabel('Filtrar')?.component).toBeUndefined();
  });

  it('tags the real DES chrome in category-gate.aria.txt (B14)', () => {
    const snapshot = readFileSync(new URL('../__fixtures__/category-gate.aria.txt', import.meta.url), 'utf8');
    const ex = analyzeAriaNodes(parseAriaSnapshot(snapshot), meta);
    const byLabel = (l: string) => ex.elements.find((e) => e.label === l);
    expect(byLabel('Buscar en tienda')?.component).toBe('Header');
    expect(byLabel('Acceder')?.component).toBe('Header');
    expect(byLabel('WhatsApp')?.component).toBe('Footer');
    expect(byLabel('Buscar')?.component).toBeUndefined(); // main-body search button
  });
});
