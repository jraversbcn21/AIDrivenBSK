import { describe, it, expect } from 'vitest';
import { parseAriaSnapshot } from './aria';
import { analyzeAriaNodes } from './analyzeAria';
import type { PageMeta } from '../types';

const meta: PageMeta = { path: '/es/x', url: 'https://des.example/es/x', title: 'X', session: 'anon', discoveredVia: 'seed' };

const SNAPSHOT = `- banner:
  - searchbox "Buscar"
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
- contentinfo: info`;

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
});
