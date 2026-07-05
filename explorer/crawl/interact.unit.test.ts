import { describe, it, expect } from 'vitest';
import { InteractionLedger, selectCandidates, newOverlayNodes, discoverInteractions } from './interact';
import type { ExtractedElement, PageMeta } from '../types';
import type { InteractionDriver } from './interact';
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

const META: PageMeta = { path: '/es/p-c0p1.html', url: 'https://x/es/p-c0p1.html', title: 'P', session: 'auth', discoveredVia: 'seed' };
const D_BASE = `- main:\n  - button "Añadir a cesta"`;
const D_WITH_DIALOG = `${D_BASE}\n- dialog "Tallas":\n  - button "Talla S"\n  - link "Guía de tallas":\n    - /url: /es/guia.html`;

/** Driver whose snapshot() pops from a script; other calls are recorded. */
function fakeDriver(script: string[], opts: { path?: () => string } = {}): InteractionDriver & { calls: string[] } {
  const calls: string[] = [];
  let last = script[0];
  return {
    calls,
    snapshot: async () => { calls.push('snapshot'); if (script.length > 0) last = script.shift() as string; return last; },
    click: async (_r, n) => { calls.push(`click:${n}`); },
    pressEscape: async () => { calls.push('escape'); },
    currentPath: () => (opts.path ? opts.path() : META.path),
    recover: async () => { calls.push('recover'); },
    wait: async () => {},
  };
}

describe('discoverInteractions', () => {
  it('detects an overlay, extracts revealed elements/links, closes with Escape', async () => {
    // before, settle(first read + stable read), after-click diff read, post-escape read
    const d = fakeDriver([D_BASE, D_WITH_DIALOG, D_WITH_DIALOG, D_WITH_DIALOG, D_BASE]);
    const [it1] = await discoverInteractions(d, [btn('Añadir a cesta')], META);
    expect(it1.outcome).toBe('overlay');
    expect(it1.revealedElements.map((e) => e.label)).toContain('Talla S');
    expect(it1.revealedLinks).toContain('/es/guia.html');
    expect(d.calls).toContain('escape');
    expect(d.calls).not.toContain('recover');
  });

  it('records navigated and recovers', async () => {
    let path = META.path;
    const d = fakeDriver([D_BASE, D_BASE, D_BASE], { path: () => path });
    d.click = async () => { path = '/es/otra.html'; };
    d.recover = async () => { path = META.path; d.calls.push('recover'); };
    const [it1] = await discoverInteractions(d, [btn('Añadir a cesta')], META);
    expect(it1.outcome).toBe('navigated');
    expect(it1.navigatedTo).toBe('/es/otra.html');
    expect(d.calls).toContain('recover');
  });

  it('aborts remaining candidates when recovery fails', async () => {
    let path = META.path;
    const d = fakeDriver([D_BASE, D_BASE, D_BASE], { path: () => path });
    d.click = async (_r, n) => { d.calls.push(`click:${n}`); path = '/es/otra.html'; };
    d.recover = async () => { d.calls.push('recover'); }; // path stays wrong
    const out = await discoverInteractions(d, [btn('Uno'), btn('Dos')], META);
    expect(out).toHaveLength(1);
    expect(d.calls.filter((c) => c.startsWith('click:'))).toEqual(['click:Uno']);
  });

  it('returns none after bounded click attempts with no change', async () => {
    const d = fakeDriver([D_BASE]); // snapshot never changes
    const [it1] = await discoverInteractions(d, [btn('Inerte')], META);
    expect(it1.outcome).toBe('none');
    expect(d.calls.filter((c) => c === 'click:Inerte').length).toBeLessThanOrEqual(3);
  });

  it('falls back to recover() when Escape never closes the overlay', async () => {
    const always = [D_BASE, ...Array(20).fill(D_WITH_DIALOG)] as string[];
    const d = fakeDriver(always);
    const [it1] = await discoverInteractions(d, [btn('Añadir a cesta')], META);
    expect(it1.outcome).toBe('overlay');
    expect(d.calls).toContain('recover');
  });

  it('skips a candidate whose driver call throws and continues', async () => {
    // candidate 1 ('Roto') consumes one snapshot call (its own `before` read) before throwing on click.
    // candidate 2's before-read must stay dialog-free and its post-click reads must show the dialog —
    // tuned from the brief's script (last entry changed BASE -> D_WITH_DIALOG) so the diff-read after
    // the click actually observes the opened dialog; see report for why.
    const d = fakeDriver([D_BASE, D_BASE, D_WITH_DIALOG, D_WITH_DIALOG, D_WITH_DIALOG]);
    const boom = btn('Roto');
    const orig = d.click.bind(d);
    d.click = async (r, n) => { if (n === 'Roto') throw new Error('boom'); return orig(r, n); };
    const out = await discoverInteractions(d, [boom, btn('Añadir a cesta')], META);
    expect(out).toHaveLength(1);
    expect(out[0].outcome).toBe('overlay');
  });
});
