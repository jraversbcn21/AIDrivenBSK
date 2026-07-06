import { describe, it, expect } from 'vitest';
import { TemplateGenerator } from './TemplateGenerator';
import type { JourneyInput, InteractionJourneyInput } from './Generator';

const input: JourneyInput = {
  flowId: 'flow_a1b2c3d4e5f6',
  journeyName: '/ -> /es/h-woman.html -> /es/mujer/ropa/camisetas-n4365.html',
  session: 'anon',
  chain: [
    { path: '/', routePattern: '/', title: 'Home' },
    { path: '/es/h-woman.html', routePattern: '/es/h-woman.html', title: 'Woman' },
    { path: '/es/mujer/ropa/camisetas-n4365.html', routePattern: '/es/mujer/ropa/camisetas-n4365.html', title: 'Camisetas' },
  ],
  loadedSignal: { role: { type: 'button', name: 'Filtrar' } },
  mapGeneratedAt: '2026-07-03T06:00:00Z',
};

describe('TemplateGenerator', () => {
  const g = new TemplateGenerator();
  const [pageFile, specFile] = g.generate(input);

  it('emits the page object at pages/<ClassName>.ts extending BasePage with the chain walk', () => {
    expect(pageFile.relPath).toBe('pages/MujerRopaCamisetasN4365PageA1B2C3D4.ts');
    expect(pageFile.content).toContain('export class MujerRopaCamisetasN4365PageA1B2C3D4 extends BasePage {');
    expect(pageFile.content).toContain("await this.goto('/');");
    expect(pageFile.content).toContain("await this.goto('/es/h-woman.html');");
    expect(pageFile.content).toContain("await this.goto('/es/mujer/ropa/camisetas-n4365.html');");
    expect(pageFile.content).toContain("locate(this.page, { role: { type: 'button', name: 'Filtrar' } })");
  });

  it('emits the spec importing the shared fixture and polling isLoaded', () => {
    expect(specFile.relPath).toBe('camisetas-n4365-a1b2c3d4.spec.ts');
    expect(specFile.content).toContain("import { test, expect } from '../../src/fixtures/test';");
    expect(specFile.content).toContain("import { MujerRopaCamisetasN4365PageA1B2C3D4 } from './pages/MujerRopaCamisetasN4365PageA1B2C3D4';");
    expect(specFile.content).toContain('journey: / -> /es/h-woman.html -> /es/mujer/ropa/camisetas-n4365.html');
    expect(specFile.content).toContain('await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);');
  });

  it('stamps a header with flowId and map generatedAt — never wall-clock time', () => {
    for (const f of [pageFile, specFile]) {
      expect(f.content.startsWith('// GENERATED from flow flow_a1b2c3d4e5f6 (map generated 2026-07-03T06:00:00Z)')).toBe(true);
    }
  });

  it('is fully deterministic: same input, identical bytes', () => {
    expect(g.generate(input)).toEqual(g.generate(input));
  });

  it('falls back to the main landmark when loadedSignal is null, without importing locate', () => {
    const [p] = g.generate({ ...input, loadedSignal: null });
    expect(p.content).toContain("return this.page.getByRole('main').isVisible();");
    expect(p.content).not.toContain('import { locate }');
  });

  it('escapes single quotes in strategy names', () => {
    const [p] = g.generate({ ...input, loadedSignal: { role: { type: 'button', name: "Women's sale" } } });
    expect(p.content).toContain("name: 'Women\\'s sale'");
  });

  it('emits a nested testId literal carrying the attribute provenance', () => {
    const [p] = g.generate({ ...input, loadedSignal: { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } } });
    expect(p.content).toContain("locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } })");
    expect(p.content).toContain("import { locate }");
  });
});

// NOTE: the brief's relPath literal for the spec file was `interaction-rebajas-n-id-f05b1c4b.spec.ts`;
// hand-computed against the actual (already-committed) builder/naming.ts implementation, the real value
// is `interaction-rebajas-n-f05b1c4b.spec.ts` (nonLocaleSegments strips the literal `{id}` substring
// before the last segment is slugged, so no stray "id" token survives). The page-file literal in the
// brief was already correct and is used verbatim.
const interactionInput: InteractionJourneyInput = {
  flowId: 'flow_94d821294512',
  interactionId: 'inter_f05b1c4b0668',
  journeyName: '/ -> /es/mujer/ropa/rebajas-n5303.html => overlay "Añadir a la cesta"',
  session: 'anon',
  chain: [
    { path: '/', routePattern: '/', title: 'Home' },
    { path: '/es/mujer/ropa/rebajas-n5303.html', routePattern: '/es/mujer/ropa/rebajas-n{id}.html', title: 'Rebajas' },
  ],
  loadedSignal: { role: { type: 'button', name: 'Filtrar' } },
  mapGeneratedAt: '2026-07-05T00:00:00Z',
  trigger: { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } },
  triggerLabel: 'Añadir a la cesta Pantalón bombacho',
  overlayIsDialog: true,
  overlayElementSignal: null,
};

describe('TemplateGenerator.generateInteraction', () => {
  const files = new TemplateGenerator().generateInteraction(interactionInput);
  const page = files.find((f) => f.relPath.startsWith('pages/'))!;
  const spec = files.find((f) => !f.relPath.startsWith('pages/'))!;

  it('emits an interaction-prefixed spec and an Interaction-suffixed page object', () => {
    expect(spec.relPath).toBe('interaction-rebajas-n-f05b1c4b.spec.ts');
    expect(page.relPath).toBe('pages/MujerRopaRebajasNInteractionF05B1C4B.ts');
  });
  it('clicks the trigger with .first() (repeated-grid semantics) inside an act->verify->retry loop', () => {
    expect(page.content).toContain(".first().click()");
    expect(page.content).toContain('dismissOnboardingTour');
    expect(page.content).toContain('Date.now() + 20_000');
  });
  it('asserts overlay-open via a baseline dialog-count diff when overlayIsDialog (live finding: DES keeps a second, persistent dialog-role nav-menu mounted on every page)', () => {
    expect(page.content).toContain('private dialogBaselineCount = 0;');
    expect(page.content).toContain("this.dialogBaselineCount = await this.page.getByRole('dialog').count();");
    expect(page.content).toContain("return (await this.page.getByRole('dialog').count()) > this.dialogBaselineCount;");
    expect(page.content).not.toContain("this.page.getByRole('dialog').isVisible()");
    expect(page.content).not.toContain("getByRole('dialog', {"); // no name — product-variable
  });
  it('falls back to the revealed-element signal when the overlay is not a dialog, and emits no baseline-count scaffolding', () => {
    const alt = new TemplateGenerator().generateInteraction({
      ...interactionInput,
      overlayIsDialog: false,
      overlayElementSignal: { role: { type: 'button', name: 'Descartar' } },
    });
    const altPage = alt.find((f) => f.relPath.startsWith('pages/'))!;
    expect(altPage.content).toContain("locate(this.page, { role: { type: 'button', name: 'Descartar' } }).first().isVisible()");
    expect(altPage.content).not.toContain('dialogBaselineCount');
  });
  it('closes via Escape with verify-retry and stamps the interaction header', () => {
    expect(page.content).toContain("keyboard.press('Escape')");
    expect(page.content).toContain('GENERATED from interaction inter_f05b1c4b0668');
  });
  it('spec walks open -> isLoaded -> openOverlay -> open-poll -> closeOverlay -> closed-poll', () => {
    expect(spec.content).toContain("test('interaction:");
    const order = ['await target.open()', 'target.isLoaded()', 'await target.openOverlay()', 'target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true)', 'await target.closeOverlay()', 'target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(false)'];
    let last = -1;
    for (const piece of order) {
      const idx = spec.content.indexOf(piece);
      expect(idx, piece).toBeGreaterThan(last);
      last = idx;
    }
  });
});
