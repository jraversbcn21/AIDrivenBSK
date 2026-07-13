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

  it('marks truncated: true when a page has more eligible elements than the 60-cap (F11)', () => {
    const manyButtons = Array.from({ length: 65 }, (_, i) => `  - button "Item ${i}"`).join('\n');
    const bigSnapshot = `- main:\n${manyButtons}`;
    const ex = analyzeAriaNodes(parseAriaSnapshot(bigSnapshot), meta);
    expect(ex.elements).toHaveLength(60);
    expect(ex.truncated).toBe(true);
  });

  it('leaves truncated unset when a page has fewer elements than the cap (F11)', () => {
    expect(extraction.truncated).toBeUndefined();
  });

  it('collapses content-identical elements into one row with a count (B17)', () => {
    const dupes = Array.from({ length: 4 }, () => '  - button "Guardar"').join('\n');
    const ex = analyzeAriaNodes(parseAriaSnapshot(`- main:\n${dupes}`), meta);
    const guardar = ex.elements.filter((e) => e.label === 'Guardar');
    expect(guardar).toHaveLength(1);
    expect(guardar[0].count).toBe(4);
  });

  it('keeps elements that share role/label/type but diverge in content as separate rows (B17)', () => {
    // Same role+label+type, different component provenance (banner vs body) — must not merge.
    const snapshot = `- banner:\n  - button "Ver cesta"\n- main:\n  - button "Ver cesta"`;
    const ex = analyzeAriaNodes(parseAriaSnapshot(snapshot), meta);
    const verCesta = ex.elements.filter((e) => e.label === 'Ver cesta');
    expect(verCesta).toHaveLength(2);
    expect(verCesta.every((e) => e.count === undefined)).toBe(true);
  });

  it('dedup frees cap slots for unique content that repeats would have crowded out (B17)', () => {
    const repeats = Array.from({ length: 65 }, () => '  - button "Repeat"').join('\n');
    const uniques = Array.from({ length: 5 }, (_, i) => `  - button "Unique ${i}"`).join('\n');
    const ex = analyzeAriaNodes(parseAriaSnapshot(`- main:\n${repeats}\n${uniques}`), meta);
    // Without dedup: 60 "Repeat" rows + truncated, all 5 uniques lost. With dedup: 1 "Repeat"
    // (count 65) + 5 uniques = 6 rows, nothing truncated.
    expect(ex.elements).toHaveLength(6);
    expect(ex.elements.find((e) => e.label === 'Repeat')?.count).toBe(65);
    expect(ex.elements.filter((e) => e.label.startsWith('Unique'))).toHaveLength(5);
    expect(ex.truncated).toBeUndefined();
  });
});
