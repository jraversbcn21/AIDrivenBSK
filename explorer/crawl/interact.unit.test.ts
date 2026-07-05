import { describe, it, expect } from 'vitest';
import { InteractionLedger, selectCandidates, newOverlayNodes } from './interact';
import type { ExtractedElement } from '../types';
import { parseAriaSnapshot } from '../extract/aria';

const btn = (label: string, over: Partial<ExtractedElement> = {}): ExtractedElement => ({
  type: 'button', label, role: 'button',
  selectorHints: { role: { type: 'button', name: label } }, destructive: false, ...over,
});

describe('selectCandidates', () => {
  it('filters to non-destructive role-hinted buttons within budget', () => {
    const ledger = new InteractionLedger();
    const els = [
      btn('Añadir a cesta'),
      btn('Comprar', { destructive: true }),
      btn('', { selectorHints: {} }),
      { ...btn('Ir a la cesta'), type: 'link' } as ExtractedElement,
      btn('Filtrar', { type: 'filter' }),
      btn('Ordenar', { type: 'sort' }),
      btn('Cuarto botón'),
    ];
    const picked = selectCandidates(els, '/es/prod-c0p1.html', ledger, 3);
    expect(picked.map((e) => e.label)).toEqual(['Añadir a cesta', 'Filtrar', 'Ordenar']);
  });

  it('dedupes page-specific triggers by routePattern across pages', () => {
    const ledger = new InteractionLedger();
    // Both normalize to the same routePattern ('/es/a-c0p{id}.html') — same equivalence class.
    expect(selectCandidates([btn('Añadir a cesta')], '/es/a-c0p1.html', ledger, 3)).toHaveLength(1);
    expect(selectCandidates([btn('Añadir a cesta')], '/es/a-c0p2.html', ledger, 3)).toHaveLength(0);
    // Different routePattern entirely — not deduped against the c0p class.
    expect(selectCandidates([btn('Añadir a cesta')], '/es/mujer/ropa.html', ledger, 3)).toHaveLength(1);
  });

  it('dedupes chrome triggers globally regardless of route', () => {
    const ledger = new InteractionLedger();
    const menu = btn('Menú', { component: 'Header' });
    expect(selectCandidates([menu], '/es/a-c0p1.html', ledger, 3)).toHaveLength(1);
    expect(selectCandidates([menu], '/es/mujer/ropa.html', ledger, 3)).toHaveLength(0);
  });
});

const BEFORE = `- banner:\n  - button "Menú"\n- main:\n  - button "Añadir a cesta"`;
const AFTER_DIALOG = `${BEFORE}\n- dialog "Tallas":\n  - button "Talla S"\n  - button "Talla M"`;

describe('newOverlayNodes', () => {
  it('finds a dialog present only after the click', () => {
    const found = newOverlayNodes(parseAriaSnapshot(BEFORE), parseAriaSnapshot(AFTER_DIALOG));
    expect(found).toHaveLength(1);
    expect(found[0].role).toBe('dialog');
    expect(found[0].name).toBe('Tallas');
  });

  it('ignores dialogs already present before', () => {
    expect(newOverlayNodes(parseAriaSnapshot(AFTER_DIALOG), parseAriaSnapshot(AFTER_DIALOG))).toHaveLength(0);
  });

  it('returns empty when nothing overlay-like appeared', () => {
    const after = `${BEFORE}\n- text: nuevo banner promocional`;
    expect(newOverlayNodes(parseAriaSnapshot(BEFORE), parseAriaSnapshot(after))).toHaveLength(0);
  });
});
