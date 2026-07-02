# Explorer DES-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Explorer extract real content from shadow-DOM DES pages by driving extraction from Playwright's accessibility tree, fix the crawler's onboarding-tour blindness, bound crawls by wall-clock time, and move crawl errors out of the map into a per-run `errors[]` artifact section.

**Architecture:** One `ariaSnapshot()` call per page is parsed into a node tree (`explorer/extract/aria.ts`) and mapped to the existing `PageExtraction` contract (`explorer/extract/analyzeAria.ts`) — downstream (classifier, map builder, differ, IDs) is untouched. Focused locator probes add DOM-only facts (test-id attributes). The linkedom path stays as `EXPLORER_EXTRACTION=dom` for offline tests and as an escape hatch. Crawler seeds the `bsk_onboarding` cookie, enforces a time budget in the frontier, and returns `{ extractions, errors }`.

**Tech Stack:** TypeScript strict, Playwright 1.61 (`locator.ariaSnapshot()`), Vitest (offline), existing foundation (`loadEnv`, `suppressOnboardingTour`).

**Design spec:** `docs/superpowers/specs/2026-07-02-explorer-des-readiness-design.md` (verified ariaSnapshot format lives there).

## Global Constraints

- TypeScript only; `pnpm typecheck` (strict) and `pnpm lint` pass; no `any`; no import cycles.
- pnpm for all commands. No hardcoded URLs — base URL only via `loadEnv()`.
- Read-only crawl guarantees unchanged (never submit forms, never click destructive affordances).
- All unit tests offline and deterministic; browser-coupled code is DEFERRED-live (verified by `pnpm typecheck && pnpm lint` only).
- The canonical map file (`coverage/functional-map.json`) remains a pure `FunctionalMap` — only the gitignored per-run artifact changes shape.
- Aria snapshot format assumptions are the probed ones documented in the spec; anything DES-specific is `CONFIRM`ed during the M2c live crawl.

---

### Task 1: Config — `EXPLORER_EXTRACTION` mode and `EXPLORER_TIME_BUDGET_MS`

**Files:**
- Modify: `explorer/config.ts`
- Test: `explorer/config.unit.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 5–7):
  - `type ExtractionMode = 'aria' | 'dom'`
  - `CrawlBounds` gains `timeBudgetMs: number` (default `600_000`)
  - `ExplorerConfig` gains `extraction: ExtractionMode` (default `'aria'`)
  - Env vars: `EXPLORER_EXTRACTION` (validated like `EXPLORER_MODE`), `EXPLORER_TIME_BUDGET_MS` (positive number, validated like `EXPLORER_MAX_PAGES`).

- [ ] **Step 1: Write the failing tests** — append to `explorer/config.unit.test.ts` (inside the existing `describe`, and add the two env vars to the existing `beforeEach` deletions):

```ts
  it('defaults extraction to aria and time budget to 10 minutes', () => {
    const c = loadExplorerConfig();
    expect(c.extraction).toBe('aria');
    expect(c.bounds.timeBudgetMs).toBe(600_000);
  });

  it('reads extraction mode and time budget from env', () => {
    process.env.EXPLORER_EXTRACTION = 'dom';
    process.env.EXPLORER_TIME_BUDGET_MS = '120000';
    const c = loadExplorerConfig();
    expect(c.extraction).toBe('dom');
    expect(c.bounds.timeBudgetMs).toBe(120_000);
  });

  it('rejects an invalid extraction mode', () => {
    process.env.EXPLORER_EXTRACTION = 'bogus';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_EXTRACTION/);
  });

  it('rejects a non-positive time budget', () => {
    process.env.EXPLORER_TIME_BUDGET_MS = '0';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_TIME_BUDGET_MS/);
  });
```

In the test file's `beforeEach`, also `delete process.env.EXPLORER_EXTRACTION; delete process.env.EXPLORER_TIME_BUDGET_MS;`.

- [ ] **Step 2: Run tests to verify they fail** — `pnpm test:unit explorer/config.unit.test.ts` → FAIL (`extraction`/`timeBudgetMs` undefined).

- [ ] **Step 3: Implement** in `explorer/config.ts`:

```ts
export type ExtractionMode = 'aria' | 'dom';

export interface CrawlBounds {
  maxPages: number;
  maxDepth: number;
  politenessMs: number;
  timeBudgetMs: number;
}

export interface ExplorerConfig {
  mode: ClassifierMode;
  extraction: ExtractionMode;
  bounds: CrawlBounds;
  llm: LlmConfig;
  autoThreshold: number;
}

const EXTRACTIONS: ExtractionMode[] = ['aria', 'dom'];

const DEFAULTS: ExplorerConfig = {
  mode: 'rules',
  extraction: 'aria',
  bounds: { maxPages: 200, maxDepth: 4, politenessMs: 300, timeBudgetMs: 600_000 },
  llm: { model: 'claude-haiku-4-5-20251001', apiKeyEnv: 'ANTHROPIC_API_KEY' },
  autoThreshold: 0.7,
};

function envExtraction(): ExtractionMode | undefined {
  const e = process.env.EXPLORER_EXTRACTION;
  if (e === undefined) return undefined;
  if (!EXTRACTIONS.includes(e as ExtractionMode)) {
    throw new Error(`EXPLORER_EXTRACTION must be one of: ${EXTRACTIONS.join(' | ')}`);
  }
  return e as ExtractionMode;
}

function envPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}
```

Rework `loadExplorerConfig` to use `envPositiveNumber('EXPLORER_MAX_PAGES', …)` and `envPositiveNumber('EXPLORER_TIME_BUDGET_MS', …)` for both bounds and to merge `extraction: envExtraction() ?? DEFAULTS.extraction` (overrides spread continues to win, as today).

- [ ] **Step 4: Run tests** — `pnpm test:unit explorer/config.unit.test.ts` → PASS (all, incl. pre-existing).
- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm lint` → exit 0 (Tasks 5–7 not yet using the new fields is fine).
- [ ] **Step 6: Commit** — `git add explorer/config.ts explorer/config.unit.test.ts && git commit -m "feat(explorer): extraction mode and crawl time budget in config"`

---

### Task 2: Aria snapshot parser

**Files:**
- Create: `explorer/extract/aria.ts`
- Test: `explorer/extract/aria.unit.test.ts`

**Interfaces:**
- Produces (consumed by Task 3):
  - `interface AriaNode { role: string; name?: string; url?: string; text?: string; children: AriaNode[] }`
  - `function parseAriaSnapshot(snapshot: string): AriaNode[]`

Format contract (probed live on Playwright 1.61, see spec): 2-space indentation; entries are `- role`, `- role "name"`, optional `[attr]`/`[attr=value]` blocks (ignored), optional trailing `:`; a link's href is a child line `- /url: <href>`; free text is `- text: <content>`; an entire entry may be single-quote-wrapped when it contains a colon (`- 'link "Ir a: New"':`).

- [ ] **Step 1: Write the failing test** — `explorer/extract/aria.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseAriaSnapshot } from './aria';

const SNAPSHOT = `- banner:
  - navigation:
    - searchbox "Buscar"
- main:
  - heading "Novedades" [level=1]
  - link "Camiseta":
    - /url: /es/product/abc-c0p123.html
  - button "Añadir a la cesta"
  - button "Pagar"
  - form "login":
    - textbox "E-mail"
    - textbox "Contraseña"
    - button "Iniciar sesión"
  - dialog "cookies":
    - text: consent
    - button "Aceptar"
  - list:
    - listitem:
      - 'link "Ir a: Faldas"':
        - /url: /es/mujer/faldas-c0p456.html
- contentinfo: info`;

describe('parseAriaSnapshot', () => {
  const roots = parseAriaSnapshot(SNAPSHOT);

  it('builds the top-level landmark sequence', () => {
    expect(roots.map((n) => n.role)).toEqual(['banner', 'main', 'contentinfo']);
  });

  it('nests children by indentation', () => {
    expect(roots[0].children[0].role).toBe('navigation');
    expect(roots[0].children[0].children[0]).toMatchObject({ role: 'searchbox', name: 'Buscar' });
  });

  it('attaches /url children to their parent link', () => {
    const link = roots[1].children.find((n) => n.role === 'link');
    expect(link).toMatchObject({ name: 'Camiseta', url: '/es/product/abc-c0p123.html' });
  });

  it('ignores attribute blocks like [level=1]', () => {
    expect(roots[1].children[0]).toMatchObject({ role: 'heading', name: 'Novedades' });
  });

  it('captures text nodes', () => {
    const dialog = roots[1].children.find((n) => n.role === 'dialog');
    expect(dialog?.children[0]).toMatchObject({ role: 'text', text: 'consent' });
  });

  it('unwraps single-quoted entries containing colons', () => {
    const listitem = roots[1].children.find((n) => n.role === 'list')?.children[0];
    expect(listitem?.children[0]).toMatchObject({ role: 'link', name: 'Ir a: Faldas', url: '/es/mujer/faldas-c0p456.html' });
  });

  it('parses inline text after a role (contentinfo: info) as a text child', () => {
    expect(roots[2].children[0]).toMatchObject({ role: 'text', text: 'info' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm test:unit explorer/extract/aria.unit.test.ts` → FAIL (cannot resolve `./aria`).

- [ ] **Step 3: Implement** — `explorer/extract/aria.ts`:

```ts
export interface AriaNode {
  role: string;
  name?: string;
  url?: string;
  text?: string;
  children: AriaNode[];
}

// Entry shapes (probed on Playwright 1.61 — see the design spec):
//   - role
//   - role "name" [attr] [attr=value]:
//   - text: free text
//   - /url: /some/path            (child of a link)
//   - 'role "name with: colon"':  (single-quote-wrapped when the entry contains a colon)
const ENTRY_RE = /^(?<role>[A-Za-z][\w-]*)(?:\s+"(?<name>(?:[^"\\]|\\.)*)")?(?<rest>.*)$/;

function unquote(content: string): string {
  if (content.startsWith("'")) {
    const end = content.lastIndexOf("'");
    if (end > 0) return content.slice(1, end) + content.slice(end + 1);
  }
  return content;
}

export function parseAriaSnapshot(snapshot: string): AriaNode[] {
  const roots: AriaNode[] = [];
  // Stack of [indentLevel, node] — children are 2 spaces deeper than their parent.
  const stack: Array<[number, AriaNode]> = [];

  for (const rawLine of snapshot.split('\n')) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (!line.startsWith('- ')) continue;
    const content = unquote(line.slice(2).trim());

    while (stack.length > 0 && stack[stack.length - 1][0] >= indent) stack.pop();
    const parent = stack.length > 0 ? stack[stack.length - 1][1] : undefined;
    const siblings = parent ? parent.children : roots;

    if (content.startsWith('/url:')) {
      if (parent) parent.url = content.slice('/url:'.length).trim();
      continue;
    }
    if (content.startsWith('text:')) {
      siblings.push({ role: 'text', text: content.slice('text:'.length).trim(), children: [] });
      continue;
    }

    const m = ENTRY_RE.exec(content);
    if (!m?.groups) continue;
    const node: AriaNode = { role: m.groups.role, children: [] };
    if (m.groups.name !== undefined) node.name = m.groups.name.replace(/\\(.)/g, '$1');
    // Inline text after a nameless landmark ("contentinfo: info") becomes a text child.
    const rest = m.groups.rest.replace(/\s*\[[^\]]*\]/g, '').trim();
    if (rest.startsWith(':') && rest.length > 1) {
      node.children.push({ role: 'text', text: rest.slice(1).trim(), children: [] });
    }
    siblings.push(node);
    stack.push([indent, node]);
  }
  return roots;
}
```

- [ ] **Step 4: Run test to verify it passes** — `pnpm test:unit explorer/extract/aria.unit.test.ts` → PASS (7 tests). If the inline-text or quote-unwrap cases fail, fix the parser — do not weaken the tests; the fixture is verbatim probed format.
- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 6: Commit** — `git add explorer/extract/aria.ts explorer/extract/aria.unit.test.ts && git commit -m "feat(explorer): aria snapshot parser"`

---

### Task 3: Aria analyzer → `PageExtraction`

**Files:**
- Create: `explorer/extract/analyzeAria.ts`
- Test: `explorer/extract/analyzeAria.unit.test.ts`

**Interfaces:**
- Consumes: `AriaNode`, `parseAriaSnapshot` (Task 2); `isDestructive` (`explorer/extract/destructive.ts`); types from `explorer/types.ts`.
- Produces (consumed by Task 5): `function analyzeAriaNodes(nodes: AriaNode[], meta: PageMeta): PageExtraction`.

Mapping rules (parity with the linkedom analyzer where the a11y tree allows):
- `link` nodes with a `url` → `links[]` (raw href) — and, when the url matches `-c0p`, the enclosing `listitem` marks `ProductCard`.
- Elements (capped at 60/page): `checkbox` → `filter`; `dialog` → `modal`; `button` → `filter` if name matches `/filtr/i`, `sort` if `/orden|sort/i`, else `button`; `combobox` with `/orden|sort/i` → `sort`. `selectorHints = { role: { type, name } }`; `destructive = isDestructive(name)`.
- Forms: `form` nodes; fields = descendant `textbox|searchbox|checkbox|combobox` → `{ name: <accessible label>, type: <aria role>, required: false }` (the a11y tree does not expose `required` — recorded decision). `purposeHint`: form name `/login|inicia/i` or labels containing both `/e-?mail/i` and `/contraseña|password/i` → `login`; `/regist/i` → `register`; any `searchbox` or `/busca|search/i` → `search`; `/newsletter/i` → `newsletter`; else `other`.
- `landmarkRoles`: every `banner|navigation|main|contentinfo|form|dialog|search` role encountered.
- `componentKinds`: `banner`→`Header`, `contentinfo`→`Footer`, `searchbox`→`SearchBar`, any name `/filtr/i`→`FiltersPanel`, any link/button name `/cesta|cart/i`→`MiniCart`, `-c0p` listitem→`ProductCard`.
- `textSummary`: text-node contents joined in tree order, capped at 500 chars.

- [ ] **Step 1: Write the failing test** — `explorer/extract/analyzeAria.unit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm test:unit explorer/extract/analyzeAria.unit.test.ts` → FAIL (cannot resolve `./analyzeAria`).

- [ ] **Step 3: Implement** — `explorer/extract/analyzeAria.ts`:

```ts
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

  const visit = (node: AriaNode, inListitem: boolean): void => {
    if (node.role === 'text') {
      if (node.text) texts.push(node.text);
      return;
    }
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
    if (type && elements.length < MAX_ELEMENTS_PER_PAGE) {
      elements.push({
        type,
        label: name,
        role: node.role,
        selectorHints: name ? { role: { type: node.role, name } } : {},
        destructive: isDestructive(name),
      });
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

    node.children.forEach((child) => visit(child, inListitem || node.role === 'listitem'));
  };

  nodes.forEach((n) => visit(n, false));

  return {
    meta,
    landmarkRoles,
    textSummary: texts.join(' ').slice(0, 500),
    links,
    elements,
    forms,
    componentKinds: [...componentKinds],
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — `pnpm test:unit explorer/extract/analyzeAria.unit.test.ts` → PASS (4 tests).
- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 6: Commit** — `git add explorer/extract/analyzeAria.ts explorer/extract/analyzeAria.unit.test.ts && git commit -m "feat(explorer): aria-tree analyzer producing PageExtraction"`

---

### Task 4: testId enrichment probe (DEFERRED-live)

**Files:**
- Create: `explorer/extract/enrichTestIds.ts`

**Interfaces:**
- Consumes: Playwright `Page`; `PageExtraction`.
- Produces (used by Task 5): `async function enrichTestIds(page: Page, extraction: PageExtraction, cap = 40): Promise<void>` — mutates `extraction.elements[*].selectorHints.testId` in place, best-effort.

Browser-coupled; live behavior is DEFERRED to M2c. Verify with `pnpm typecheck && pnpm lint` only.

- [ ] **Step 1: Implement** — `explorer/extract/enrichTestIds.ts`:

```ts
import type { Page } from '@playwright/test';
import type { PageExtraction } from '../types';

// DES carries test-id-like attributes on at least some elements (data-qa-anchor="filterButton"
// confirmed live — findings §7). The a11y tree does not expose attributes, so probe the DOM via
// role locators (they pierce shadow DOM). Best-effort by design: strict-mode ambiguity or a
// timeout simply leaves the hint unset — absence is itself signal (foundation Risk #1).
const TESTID_ATTRS = ['data-testid', 'data-qa-anchor', 'data-qa'] as const;

type RoleType = Parameters<Page['getByRole']>[0];

export async function enrichTestIds(page: Page, extraction: PageExtraction, cap = 40): Promise<void> {
  const targets = extraction.elements.filter((e) => e.selectorHints.role?.name).slice(0, cap);
  for (const el of targets) {
    const role = el.selectorHints.role;
    if (!role) continue;
    try {
      const loc = page.getByRole(role.type as RoleType, { name: role.name, exact: true }).first();
      for (const attr of TESTID_ATTRS) {
        const value = await loc.getAttribute(attr, { timeout: 250 });
        if (value) {
          el.selectorHints.testId = value;
          break;
        }
      }
    } catch {
      // best-effort: leave hints as-is
    }
  }
}
```

- [ ] **Step 2: Verify** — `pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 3: Commit** — `git add explorer/extract/enrichTestIds.ts && git commit -m "feat(explorer): best-effort testId enrichment via role locators"`

---

### Task 5: Aria page adapter + extraction-mode switch (DEFERRED-live)

**Files:**
- Modify: `explorer/extract/fromPage.ts`

**Interfaces:**
- Consumes: `parseAriaSnapshot` (Task 2), `analyzeAriaNodes` (Task 3), `enrichTestIds` (Task 4), `ExtractionMode` (Task 1), existing `extractFromPage`/`normalizePath`.
- Produces (used by Task 6):
  - `async function extractFromPageAria(page: Page, session: Session, discoveredVia: string, baseURL: string): Promise<PageExtraction>`
  - `function extractorFor(mode: ExtractionMode): typeof extractFromPage` — returns `extractFromPageAria` for `'aria'`, `extractFromPage` for `'dom'`.

- [ ] **Step 1: Implement** — append to `explorer/extract/fromPage.ts`:

```ts
import type { ExtractionMode } from '../config';
import { parseAriaSnapshot } from './aria';
import { analyzeAriaNodes } from './analyzeAria';
import { enrichTestIds } from './enrichTestIds';

/**
 * Shadow-DOM-safe extraction: DES renders through bds- web components, so page.content()
 * (light DOM) misses most interactive content (findings §8). The accessibility tree pierces
 * shadow roots; one ariaSnapshot per page is the backbone, plus a bounded testId probe.
 */
export async function extractFromPageAria(
  page: Page,
  session: Session,
  discoveredVia: string,
  baseURL: string,
): Promise<PageExtraction> {
  const url = page.url();
  const title = await page.title();
  const snapshot = await page.locator('body').ariaSnapshot();
  const extraction = analyzeAriaNodes(parseAriaSnapshot(snapshot), {
    path: normalizePath(url, baseURL),
    url,
    title,
    session,
    discoveredVia,
  });
  await enrichTestIds(page, extraction);
  return extraction;
}

export function extractorFor(mode: ExtractionMode): typeof extractFromPage {
  return mode === 'aria' ? extractFromPageAria : extractFromPage;
}
```

- [ ] **Step 2: Verify** — `pnpm typecheck && pnpm lint` → exit 0 (also proves no import cycle: `extract → config` is one-way).
- [ ] **Step 3: Commit** — `git add explorer/extract/fromPage.ts && git commit -m "feat(explorer): aria page adapter and extraction-mode switch"`

---

### Task 6: Crawler — tour suppression, time budget, `errors[]`

**Files:**
- Modify: `explorer/crawl/frontier.ts`, `explorer/crawl/crawler.ts`
- Test: `explorer/crawl/frontier.unit.test.ts` (extend)

**Interfaces:**
- Consumes: `suppressOnboardingTour` (`src/support/consent.ts`), `extractorFor` (Task 5), `CrawlBounds.timeBudgetMs` (Task 1).
- Produces (used by Task 7):
  - `Frontier` constructor gains an injectable clock: `new Frontier(rules, bounds, now: () => number = Date.now)`; `next()` returns `undefined` once `now() - start > bounds.timeBudgetMs`.
  - `interface CrawlError { path: string; session: Session; depth: number; discoveredVia: string; message: string }`
  - `interface CrawlResult { extractions: PageExtraction[]; errors: CrawlError[] }`
  - `CrawlDeps` gains `extraction: ExtractionMode`; `crawlSession(deps, session, seeds): Promise<CrawlResult>`.

- [ ] **Step 1: Write the failing test** — append to `explorer/crawl/frontier.unit.test.ts` (reuse the file's existing `bounds`/`rules` helpers; if it builds bounds inline, add `timeBudgetMs` to those literals — the type now requires it):

```ts
  it('stops handing out items once the time budget is exhausted', () => {
    let t = 0;
    const clock = () => t;
    const f = new Frontier(
      { allow: [], deny: [] },
      { maxPages: 10, maxDepth: 4, politenessMs: 0, timeBudgetMs: 1_000 },
      clock,
    );
    f.add({ path: '/a', session: 'anon', depth: 0, discoveredVia: 'seed' });
    f.add({ path: '/b', session: 'anon', depth: 0, discoveredVia: 'seed' });
    expect(f.next()?.path).toBe('/a');
    t = 1_500; // budget exceeded
    expect(f.next()).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify the new one fails** — `pnpm test:unit explorer/crawl/frontier.unit.test.ts` → new test FAILS (constructor arity / no budget logic); pre-existing tests may fail to compile until `timeBudgetMs` is added to their bounds literals — add it (`timeBudgetMs: 600_000`).

- [ ] **Step 3: Implement `Frontier` budget** — in `explorer/crawl/frontier.ts`:

```ts
export class Frontier {
  private readonly seen = new Set<string>();
  private readonly queue: FrontierItem[] = [];
  private handedOut = 0;
  private readonly start: number;

  constructor(
    private readonly rules: RouteRules,
    private readonly bounds: CrawlBounds,
    private readonly now: () => number = Date.now,
  ) {
    this.start = now();
  }

  // add() unchanged.

  next(): FrontierItem | undefined {
    if (this.handedOut >= this.bounds.maxPages) return undefined;
    if (this.now() - this.start > this.bounds.timeBudgetMs) return undefined;
    const item = this.queue.shift();
    if (item) this.handedOut++;
    return item;
  }
}
```

- [ ] **Step 4: Rework `crawlSession`** — `explorer/crawl/crawler.ts` becomes:

```ts
import type { BrowserContext } from '@playwright/test';
import type { PageExtraction, Session } from '../types';
import type { CrawlBounds, ExtractionMode } from '../config';
import { Frontier, type FrontierItem } from './frontier';
import { extractorFor } from '../extract/fromPage';
import { normalizePath, isSameOrigin, type RouteRules } from '../url';
import { acceptConsent, suppressOnboardingTour } from '../../src/support/consent';

export interface CrawlDeps {
  context: BrowserContext;
  baseURL: string;
  rules: RouteRules;
  bounds: CrawlBounds;
  extraction: ExtractionMode;
}

export interface CrawlError {
  path: string;
  session: Session;
  depth: number;
  discoveredVia: string;
  message: string;
}

export interface CrawlResult {
  extractions: PageExtraction[];
  errors: CrawlError[];
}

export async function crawlSession(deps: CrawlDeps, session: Session, seeds: string[]): Promise<CrawlResult> {
  const frontier = new Frontier(deps.rules, deps.bounds);
  for (const seed of seeds) {
    frontier.add({ path: normalizePath(seed, deps.baseURL), session, depth: 0, discoveredVia: 'seed' });
  }

  const extract = extractorFor(deps.extraction);
  const extractions: PageExtraction[] = [];
  const errors: CrawlError[] = [];
  const page = await deps.context.newPage();
  // Pre-seed the bsk_onboarding cookie BEFORE the first navigation: the driver.js tour
  // otherwise intercepts clicks/overlays on a fresh session (findings §7). The crawler
  // bypasses BasePage.goto(), so it must do this itself.
  await suppressOnboardingTour(page);

  for (let item = frontier.next(); item; item = frontier.next()) {
    try {
      await page.goto(item.path, { waitUntil: 'domcontentloaded' });
      await acceptConsent(page);
      const extraction = await extract(page, session, item.discoveredVia, deps.baseURL);
      extractions.push(extraction);

      for (const href of extraction.links) {
        if (!isSameOrigin(href, deps.baseURL)) continue;
        frontier.add({
          path: normalizePath(href, deps.baseURL),
          session,
          depth: item.depth + 1,
          discoveredVia: item.path,
        } satisfies FrontierItem);
      }
    } catch (err) {
      errors.push({ ...item, message: String(err) });
    }
    if (deps.bounds.politenessMs > 0) await page.waitForTimeout(deps.bounds.politenessMs);
  }

  await page.close();
  return { extractions, errors };
}
```

(The old `errorExtraction` helper is deleted — errors no longer masquerade as pages.)

- [ ] **Step 5: Run tests** — `pnpm test:unit explorer/crawl/frontier.unit.test.ts` → PASS. `pnpm typecheck` will FAIL at `explorer/cli.ts` (return-type change) — expected; Task 7 fixes it. Do not commit yet.

---

### Task 7: CLI — `{ map, errors }` run artifact

**Files:**
- Modify: `explorer/cli.ts`

**Interfaces:**
- Consumes: `CrawlResult`/`CrawlError` (Task 6), `cfg.extraction` (Task 1).
- Produces: gitignored per-run artifact shape `{ map: FunctionalMap, errors: CrawlError[] }` at `reports/explorer/<ts>.json`; canonical `coverage/functional-map.json` stays a pure `FunctionalMap` (diff/update untouched).

- [ ] **Step 1: Rework `explorer/cli.ts` main loop** — the session loop and artifact writing become:

```ts
  const classified: ClassifiedPage[] = [];
  const errors: CrawlError[] = [];
  try {
    for (const session of sessions) {
      const context = await browser.newContext(session === 'auth' ? { storageState: '.auth/state.json' } : {});
      const result = await crawlSession(
        { context, baseURL: env.baseURL, rules: DEFAULT_ROUTE_RULES, bounds: cfg.bounds, extraction: cfg.extraction },
        session,
        SEEDS,
      );
      errors.push(...result.errors);
      for (const ex of result.extractions) {
        classified.push({ extraction: ex, classification: await classifier.classifyPage(buildPageContext(ex)) });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const map = buildMap({ classified, environment: env.name });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeJson(`reports/explorer/${stamp}.json`, { map, errors });
```

with imports `import { crawlSession, type CrawlError } from './crawl/crawler';`, `writeArtifact` renamed to a generic `writeJson(path: string, data: unknown)` (same mkdir+writeFile body, parameter typed `unknown`), the `--update` branch writing `await writeJson(args.out, map)`, and the final summary line becoming:

```ts
    console.log(`Explored ${map.pages.length} pages, ${errors.length} errors (run with --update to write ${args.out}).`);
```

- [ ] **Step 2: Verify** — `pnpm typecheck && pnpm lint && pnpm test:unit` → all green (this closes the Task 6 breakage).
- [ ] **Step 3: Commit both tasks** — `git add explorer/crawl/frontier.ts explorer/crawl/frontier.unit.test.ts explorer/crawl/crawler.ts explorer/cli.ts && git commit -m "feat(explorer): tour-suppressed, time-budgeted crawl with errors[] artifact"`

---

### Task 8: Environment & docs

**Files:**
- Modify: `.env.example`, `README.md`

- [ ] **Step 1: Append to `.env.example`:**

```bash
# --- Explorer Agent (all optional) ---
# Classifier mode: rules (default, offline) | llm | auto
EXPLORER_MODE=rules
# Extraction backbone: aria (default; pierces bds- shadow DOM) | dom (light-DOM linkedom path)
EXPLORER_EXTRACTION=aria
# Crawl bounds
EXPLORER_MAX_PAGES=200
EXPLORER_TIME_BUDGET_MS=600000
# Explorer refuses to crawl prod unless this is explicitly set
EXPLORER_ALLOW_PROD=false
# Only needed for EXPLORER_MODE=llm|auto
ANTHROPIC_API_KEY=
```

- [ ] **Step 2: Update README's Explorer section** — after the existing classifier-mode paragraph, add:

```markdown
Extraction is accessibility-tree-driven by default (`EXPLORER_EXTRACTION=aria`) because DES
renders through `bds-` shadow-DOM components that light-DOM parsing cannot see; `dom` keeps the
offline linkedom path. Crawls are bounded by `EXPLORER_MAX_PAGES` and `EXPLORER_TIME_BUDGET_MS`.
Per-run artifacts in `reports/explorer/` have the shape `{ map, errors }`; the committed
canonical map stays a plain functional map.
```

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm lint` → exit 0 (docs-only, sanity).
- [ ] **Step 4: Commit** — `git add .env.example README.md && git commit -m "docs(explorer): document extraction mode, bounds, and artifact shape"`

---

### Task 9: First live crawl — M2c protocol (DEFERRED-live, requires VPN)

No code. Execute the protocol in the design spec (§M2c): bounded anon crawl (`EXPLORER_MAX_PAGES=25`), review artifact for shadow-DOM visibility / `-c0p` route patterns / path-lowercasing issues, capture 2–3 real aria-snapshot fixtures, then `--session both` + `pnpm explore --update`, review the map diff, and commit `coverage/functional-map.json` (`feat(explorer): first canonical DES functional map`). Record findings (element counts, testId coverage, surprises) in the findings doc.

---

## Self-review notes

- Spec coverage: B5 → Tasks 2/3/4/5; B6 → Task 6; B9 (errors[], time budget) → Tasks 6/7; B10 → Task 8; B7 → Task 9. `EXPLORER_EXTRACTION` escape hatch → Task 1/5.
- Type consistency: `ExtractionMode` defined once (Task 1), consumed in Tasks 5–7; `CrawlError`/`CrawlResult` defined in Task 6, consumed in Task 7; `analyzeAriaNodes`/`parseAriaSnapshot` names match across Tasks 2/3/5.
- Known intentional deviation from the linkedom analyzer: form fields carry accessible labels instead of DOM `name` attributes, `required` is always `false` (a11y tree limitation — recorded in spec Decision 2).
