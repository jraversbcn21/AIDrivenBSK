import type { Strategy } from '../../src/support/locators';
import type { Generator, JourneyInput, InteractionJourneyInput, GeneratedFile } from './Generator';
import {
  classNameFor,
  specFileNameFor,
  pageFileNameFor,
  interactionClassNameFor,
  interactionSpecFileNameFor,
  interactionPageFileNameFor,
} from '../naming';

const sq = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function strategyLiteral(s: Strategy): string {
  if (s.testId !== undefined) {
    return `{ testId: { attr: ${sq(s.testId.attr)}, value: ${sq(s.testId.value)} } }`;
  }
  if (s.role !== undefined) return `{ role: { type: ${sq(s.role.type)}, name: ${sq(s.role.name)} } }`;
  if (s.label !== undefined) return `{ label: ${sq(s.label)} }`;
  return `{ placeholder: ${sq(s.placeholder ?? '')} }`;
}

function headerFor(kind: 'flow' | 'interaction', id: string, input: JourneyInput): string {
  const source = kind === 'flow' ? `flow ${id}` : `interaction ${id} / flow ${input.flowId}`;
  return `// GENERATED from ${source} (map generated ${input.mapGeneratedAt}) — review before promoting; regeneration overwrites.\n`;
}

function gotosBlock(input: JourneyInput): string {
  return input.chain.map((s) => `    await this.goto(${sq(s.path)});`).join('\n');
}

function isLoadedBody(input: JourneyInput): string {
  return input.loadedSignal !== null
    ? `    return locate(this.page, ${strategyLiteral(input.loadedSignal)}).isVisible();`
    : `    return this.page.getByRole('main').isVisible();`;
}

const leafOf = (i: JourneyInput) => i.chain[i.chain.length - 1];

function pageObjectFile(input: JourneyInput): GeneratedFile {
  const className = classNameFor(leafOf(input).routePattern, input.flowId);
  const usesLocate = input.loadedSignal !== null;
  const imports = `import { BasePage } from '../../../src/pages/BasePage';\n${usesLocate ? "import { locate } from '../../../src/support/locators';\n" : ''}`;
  const content = `${headerFor('flow', input.flowId, input)}${imports}
export class ${className} extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so the journey navigates the way it
   * was discovered.
   */
  async open(): Promise<void> {
${gotosBlock(input)}
  }

  async isLoaded(): Promise<boolean> {
${isLoadedBody(input)}
  }
}
`;
  return { relPath: `pages/${pageFileNameFor(leafOf(input).routePattern, input.flowId)}`, content };
}

function specFile(input: JourneyInput): GeneratedFile {
  const className = classNameFor(leafOf(input).routePattern, input.flowId);
  const content = `${headerFor('flow', input.flowId, input)}import { test, expect } from '../../src/fixtures/test';
import { ${className} } from './pages/${className}';

const HYDRATION_TIMEOUT_MS = 20_000;

test(${sq(`journey: ${input.journeyName}`)}, async ({ page }) => {
  const target = new ${className}(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
`;
  return { relPath: specFileNameFor(leafOf(input).routePattern, input.flowId), content };
}

function overlayOpenExpr(input: InteractionJourneyInput): string {
  return input.overlayIsDialog
    ? `this.page.getByRole('dialog').isVisible()`
    : `locate(this.page, ${strategyLiteral(input.overlayElementSignal as Strategy)}).first().isVisible()`;
}

function interactionPageObjectFile(input: InteractionJourneyInput): GeneratedFile {
  const className = interactionClassNameFor(leafOf(input).routePattern, input.interactionId);
  const content = `${headerFor('interaction', input.interactionId, input)}import { BasePage } from '../../../src/pages/BasePage';
import { locate } from '../../../src/support/locators';
import { dismissOnboardingTour } from '../../../src/support/consent';

export class ${className} extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so the journey navigates the way it
   * was discovered.
   */
  async open(): Promise<void> {
${gotosBlock(input)}
  }

  async isLoaded(): Promise<boolean> {
${isLoadedBody(input)}
  }

  /**
   * Act -> verify -> retry (CLAUDE.md standing rule): a fire-once click can be silently
   * lost to Vue hydration lag. .first() on the trigger is deliberate — the testId may
   * repeat across a product grid and any exemplar opens the overlay (M9 design §4).
   */
  async openOverlay(): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await dismissOnboardingTour(this.page);
      await locate(this.page, ${strategyLiteral(input.trigger)}).first().click().catch(() => undefined);
      await this.page.waitForTimeout(500);
      if (await this.isOverlayOpen().catch(() => false)) return;
    }
    throw new Error('${className}: the overlay did not open within the deadline');
  }

  async isOverlayOpen(): Promise<boolean> {
    return ${overlayOpenExpr(input)};
  }

  async closeOverlay(): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await this.page.waitForTimeout(500);
      if (!(await this.isOverlayOpen().catch(() => false))) return;
    }
    throw new Error('${className}: the overlay did not close on Escape within the deadline');
  }
}
`;
  return { relPath: `pages/${interactionPageFileNameFor(leafOf(input).routePattern, input.interactionId)}`, content };
}

function interactionSpecFile(input: InteractionJourneyInput): GeneratedFile {
  const className = interactionClassNameFor(leafOf(input).routePattern, input.interactionId);
  const content = `${headerFor('interaction', input.interactionId, input)}import { test, expect } from '../../src/fixtures/test';
import { ${className} } from './pages/${className}';

const HYDRATION_TIMEOUT_MS = 20_000;

test(${sq(`interaction: ${input.journeyName}`)}, async ({ page }) => {
  const target = new ${className}(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.openOverlay();
  await expect.poll(() => target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.closeOverlay();
  await expect.poll(() => target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(false);
});
`;
  return { relPath: interactionSpecFileNameFor(leafOf(input).routePattern, input.interactionId), content };
}

export class TemplateGenerator implements Generator {
  generate(input: JourneyInput): GeneratedFile[] {
    return [pageObjectFile(input), specFile(input)];
  }
  generateInteraction(input: InteractionJourneyInput): GeneratedFile[] {
    return [interactionPageObjectFile(input), interactionSpecFile(input)];
  }
}
