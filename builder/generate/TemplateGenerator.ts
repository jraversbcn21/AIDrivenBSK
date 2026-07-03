import type { Strategy } from '../../src/support/locators';
import type { Generator, JourneyInput, GeneratedFile } from './Generator';
import { classNameFor, specFileNameFor, pageFileNameFor } from '../naming';

const sq = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function strategyLiteral(s: Strategy): string {
  if (s.testId !== undefined) return `{ testId: ${sq(s.testId)} }`;
  if (s.role !== undefined) return `{ role: { type: ${sq(s.role.type)}, name: ${sq(s.role.name)} } }`;
  if (s.label !== undefined) return `{ label: ${sq(s.label)} }`;
  return `{ placeholder: ${sq(s.placeholder ?? '')} }`;
}

const header = (i: JourneyInput): string =>
  `// GENERATED from flow ${i.flowId} (map generated ${i.mapGeneratedAt}) — review before promoting; regeneration overwrites.\n`;

const leafOf = (i: JourneyInput) => i.chain[i.chain.length - 1];

function pageObjectFile(input: JourneyInput): GeneratedFile {
  const className = classNameFor(leafOf(input).routePattern);
  const gotos = input.chain.map((s) => `    await this.goto(${sq(s.path)});`).join('\n');
  const usesLocate = input.loadedSignal !== null;
  const isLoadedBody = usesLocate
    ? `    return locate(this.page, ${strategyLiteral(input.loadedSignal as Strategy)}).isVisible();`
    : `    return this.page.getByRole('main').isVisible();`;
  const imports = `import { BasePage } from '../../../src/pages/BasePage';\n${usesLocate ? "import { locate } from '../../../src/support/locators';\n" : ''}`;
  const content = `${header(input)}${imports}
export class ${className} extends BasePage {
  /**
   * Walks the discovered chain step by step: DES intermittently re-triggers the gender
   * gate on direct deep-links (findings doc §8), so the journey navigates the way it
   * was discovered.
   */
  async open(): Promise<void> {
${gotos}
  }

  async isLoaded(): Promise<boolean> {
${isLoadedBody}
  }
}
`;
  return { relPath: `pages/${pageFileNameFor(leafOf(input).routePattern)}`, content };
}

function specFile(input: JourneyInput): GeneratedFile {
  const className = classNameFor(leafOf(input).routePattern);
  const content = `${header(input)}import { test, expect } from '../../src/fixtures/test';
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

export class TemplateGenerator implements Generator {
  generate(input: JourneyInput): GeneratedFile[] {
    return [pageObjectFile(input), specFile(input)];
  }
}
