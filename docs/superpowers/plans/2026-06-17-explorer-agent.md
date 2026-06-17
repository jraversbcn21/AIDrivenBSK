# Explorer Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CLI that deterministically crawls Bershka (DES, anon + auth), discovers pages/elements/forms/components, classifies them (rules + optional pluggable LLM), and emits a versioned functional-map JSON that diffs against a committed map to surface new/changed/removed flows.

**Architecture:** Deterministic Playwright crawl as the backbone; extraction is a **pure DOM analyzer** (`linkedom`, offline-testable) fed by a thin Playwright page adapter that supplies rendered HTML. Classification is a pluggable `Classifier` interface with an always-on `RuleClassifier` baseline + an optional Anthropic-backed `LlmClassifier` (rules fallback). A map builder assembles records into the functional map with stable IDs; a differ compares against the committed canonical map. A CLI orchestrates everything.

**Tech Stack:** TypeScript, Playwright (page adapter + crawler), `linkedom` (offline HTML analysis), `@anthropic-ai/sdk` (LLM classifier, lazy-loaded), `tsx` (run the TS CLI), Vitest (offline unit tests), reuses the Phase 0 foundation (`src/config/env.ts`, `.auth/state.json`, `src/support/consent.ts`).

## Global Constraints

- **Language:** TypeScript only. `tsc --noEmit` passes with `strict: true`. No `any` (ESLint `@typescript-eslint/no-explicit-any` is error). No import cycles (`import/no-cycle` error).
- **Node 18+ / pnpm.** All commands use `pnpm`.
- **No hardcoded URLs** — base URL comes from `loadEnv()` (`src/config/env.ts`); the Explorer never embeds an environment URL.
- **Read-only crawl, non-negotiable:** never submit forms; never click transactional/destructive affordances (pay/place-order/delete/remove/confirm/buy); overlays opened only if non-destructive; default environment is DES/local, never prod.
- **Selector hints** follow the foundation's priority `testId → role → label` and record whether `data-testid` exists.
- **Map is versioned & diffable:** canonical map committed at `coverage/functional-map.json`; per-run raw artifacts in gitignored `reports/explorer/`.
- **LLM is optional and lazy:** rules-only/offline runs must need no SDK or API key. LLM errors fall back to rules.
- **Tests:** offline, deterministic, no network. Anything needing a live browser or live LLM is DEFERRED (marked in the task) — verify those tasks with `pnpm typecheck && pnpm lint` only.

> **Note on DES-derived values:** `routePattern` product/category regexes and a few extraction signals are strategy-correct placeholders marked `CONFIRM`. They are validated against the live DES DOM when the deferred live crawl runs; unit tests assert the *logic* using generic fixtures, not Bershka's real markup.

---

### Task 1: Explorer scaffold, deps & config

**Files:**
- Modify: `package.json` (add deps + `explore` script), `tsconfig.json` (include `explorer`), `vitest.config.ts` (include `explorer/**/*.unit.test.ts`)
- Create: `explorer/config.ts`
- Test: `explorer/config.unit.test.ts`

**Interfaces:**
- Consumes: `loadEnv` from `src/config/env.ts` (returns `AppEnv` with `name`, `baseURL`).
- Produces:
  - `type ClassifierMode = 'rules' | 'llm' | 'auto'`
  - `interface CrawlBounds { maxPages: number; maxDepth: number; politenessMs: number }`
  - `interface LlmConfig { model: string; apiKeyEnv: string }`
  - `interface ExplorerConfig { mode: ClassifierMode; bounds: CrawlBounds; llm: LlmConfig; autoThreshold: number }`
  - `function loadExplorerConfig(overrides?: Partial<ExplorerConfig>): ExplorerConfig` — merges defaults + env + overrides.

- [ ] **Step 1: Add dependencies and the `explore` script**

Run:
```bash
pnpm add linkedom @anthropic-ai/sdk
pnpm add -D tsx
```
Then add to `package.json` `scripts`: `"explore": "tsx explorer/cli.ts"`.
Expected: install succeeds; lockfile updated.

- [ ] **Step 2: Update `tsconfig.json` and `vitest.config.ts` to include `explorer/`**

In `tsconfig.json`, add `"explorer"` to the `include` array.
In `vitest.config.ts`, change `include` to `['src/**/*.unit.test.ts', 'explorer/**/*.unit.test.ts']` and add the alias target for `explorer` if needed (the existing `@` alias stays).

- [ ] **Step 3: Write the failing test** — `explorer/config.unit.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadExplorerConfig } from './config';

describe('loadExplorerConfig', () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.EXPLORER_MODE; delete process.env.EXPLORER_MAX_PAGES; });
  afterEach(() => { process.env = { ...saved }; });

  it('provides sensible defaults', () => {
    const c = loadExplorerConfig();
    expect(c.mode).toBe('rules');
    expect(c.bounds.maxPages).toBeGreaterThan(0);
    expect(c.llm.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
  });

  it('reads mode and bounds from env', () => {
    process.env.EXPLORER_MODE = 'auto';
    process.env.EXPLORER_MAX_PAGES = '50';
    const c = loadExplorerConfig();
    expect(c.mode).toBe('auto');
    expect(c.bounds.maxPages).toBe(50);
  });

  it('applies explicit overrides over env and defaults', () => {
    process.env.EXPLORER_MODE = 'auto';
    const c = loadExplorerConfig({ mode: 'rules' });
    expect(c.mode).toBe('rules');
  });

  it('rejects an invalid mode', () => {
    process.env.EXPLORER_MODE = 'bogus';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_MODE/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test:unit explorer/config.unit.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 5: Create `explorer/config.ts`**

```ts
export type ClassifierMode = 'rules' | 'llm' | 'auto';

export interface CrawlBounds {
  maxPages: number;
  maxDepth: number;
  politenessMs: number;
}

export interface LlmConfig {
  model: string;
  apiKeyEnv: string;
}

export interface ExplorerConfig {
  mode: ClassifierMode;
  bounds: CrawlBounds;
  llm: LlmConfig;
  autoThreshold: number;
}

const MODES: ClassifierMode[] = ['rules', 'llm', 'auto'];

const DEFAULTS: ExplorerConfig = {
  mode: 'rules',
  bounds: { maxPages: 200, maxDepth: 4, politenessMs: 300 },
  llm: { model: 'claude-haiku-4-5-20251001', apiKeyEnv: 'ANTHROPIC_API_KEY' },
  autoThreshold: 0.7,
};

function envMode(): ClassifierMode | undefined {
  const m = process.env.EXPLORER_MODE;
  if (m === undefined) return undefined;
  if (!MODES.includes(m as ClassifierMode)) {
    throw new Error(`EXPLORER_MODE must be one of: ${MODES.join(' | ')}`);
  }
  return m as ClassifierMode;
}

export function loadExplorerConfig(overrides: Partial<ExplorerConfig> = {}): ExplorerConfig {
  const maxPages = process.env.EXPLORER_MAX_PAGES ? Number(process.env.EXPLORER_MAX_PAGES) : DEFAULTS.bounds.maxPages;
  const base: ExplorerConfig = {
    ...DEFAULTS,
    mode: envMode() ?? DEFAULTS.mode,
    bounds: { ...DEFAULTS.bounds, maxPages },
  };
  return {
    ...base,
    ...overrides,
    bounds: { ...base.bounds, ...overrides.bounds },
    llm: { ...base.llm, ...overrides.llm },
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test:unit explorer/config.unit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts explorer/config.ts explorer/config.unit.test.ts
git commit -m "feat(explorer): scaffold, deps, and config"
```

---

### Task 2: Shared types & functional-map schema

**Files:**
- Create: `explorer/types.ts`, `explorer/map/schema.ts`

**Interfaces:**
- Produces (consumed by nearly every later task):
  - `explorer/types.ts`: `Session`, `SelectorHints`, `ElementType`, `ExtractedElement`, `ExtractedFormField`, `ExtractedForm`, `ComponentKind`, `PageMeta`, `PageExtraction` (see code).
  - `explorer/map/schema.ts`: `SCHEMA_VERSION`, `PageType`, `Priority`, `MapPage`, `MapComponent`, `MapElement`, `MapForm`, `MapFlow`, `FunctionalMap`.

This task is types-only; verification is `pnpm typecheck && pnpm lint`.

- [ ] **Step 1: Create `explorer/types.ts`**

```ts
export type Session = 'anon' | 'auth';

export interface SelectorHints {
  testId?: string;
  role?: { type: string; name: string };
  label?: string;
}

export type ElementType = 'button' | 'link' | 'filter' | 'sort' | 'modal';

export interface ExtractedElement {
  type: ElementType;
  label: string;
  role: string;
  selectorHints: SelectorHints;
  destructive: boolean;
}

export interface ExtractedFormField {
  name: string;
  type: string;
  required: boolean;
}

export interface ExtractedForm {
  fields: ExtractedFormField[];
  purposeHint: string;
}

export type ComponentKind =
  | 'Header' | 'Footer' | 'ProductCard' | 'SearchBar' | 'FiltersPanel' | 'MiniCart' | 'Other';

export interface PageMeta {
  path: string;          // normalized path (from url.ts)
  url: string;           // full URL as visited
  title: string;
  session: Session;
  discoveredVia: string; // 'seed' or the parent path
}

export interface PageExtraction {
  meta: PageMeta;
  landmarkRoles: string[];
  textSummary: string;        // trimmed text for classifier context
  links: string[];            // raw hrefs found on the page
  elements: ExtractedElement[];
  forms: ExtractedForm[];
  componentKinds: ComponentKind[];
}
```

- [ ] **Step 2: Create `explorer/map/schema.ts`**

```ts
import type {
  Session, SelectorHints, ElementType, ComponentKind, ExtractedFormField,
} from '../types';

export const SCHEMA_VERSION = '1.0';

export type PageType =
  | 'Home' | 'PLP' | 'PDP' | 'Cart' | 'Checkout' | 'Account' | 'Wishlist' | 'Search' | 'Other';

export type Priority = 'high' | 'med' | 'low';

export interface MapPage {
  id: string;
  path: string;
  routePattern: string;
  pageType: PageType;
  session: Session;
  title: string;
  discoveredVia: string;
}

export interface MapComponent {
  id: string;
  kind: ComponentKind;
  foundOnPages: string[];
}

export interface MapElement {
  id: string;
  pageId: string;
  type: ElementType;
  label: string;
  role: string;
  selectorHints: SelectorHints;
  destructive: boolean;
}

export interface MapForm {
  id: string;
  pageId: string;
  purpose: string;
  fields: ExtractedFormField[];
}

export interface MapFlow {
  id: string;
  name: string;
  type: string;
  session: Session;
  priority: Priority;
  steps: string[]; // page ids
}

export interface FunctionalMap {
  schemaVersion: string;
  generatedAt: string;
  environment: string;
  pages: MapPage[];
  components: MapComponent[];
  elements: MapElement[];
  forms: MapForm[];
  flows: MapFlow[];
}
```

- [ ] **Step 3: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add explorer/types.ts explorer/map/schema.ts
git commit -m "feat(explorer): shared types and functional-map schema"
```

---

### Task 3: URL utilities

**Files:**
- Create: `explorer/url.ts`
- Test: `explorer/url.unit.test.ts`

**Interfaces:**
- Produces:
  - `function normalizePath(rawUrl: string, baseURL: string): string`
  - `function routePattern(path: string): string`
  - `interface RouteRules { allow: RegExp[]; deny: RegExp[] }`
  - `function isDenied(path: string, rules: RouteRules): boolean`
  - `function isAllowed(path: string, rules: RouteRules): boolean`
  - `const DEFAULT_ROUTE_RULES: RouteRules` (denylist marketing/campaign/landing/promo)

- [ ] **Step 1: Write the failing test** — `explorer/url.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { normalizePath, routePattern, isAllowed, isDenied, DEFAULT_ROUTE_RULES } from './url';

const BASE = 'https://des.example/es/';

describe('normalizePath', () => {
  it('returns lowercase pathname without trailing slash', () => {
    expect(normalizePath('https://des.example/es/Search/', BASE)).toBe('/es/search');
  });
  it('resolves relative URLs against base', () => {
    expect(normalizePath('/es/cart', BASE)).toBe('/es/cart');
  });
  it('keeps root as "/"', () => {
    expect(normalizePath('https://des.example/', BASE)).toBe('/');
  });
});

describe('routePattern', () => {
  it('collapses numeric id segments', () => {
    expect(routePattern('/es/category/1234/list')).toBe('/es/category/{id}/list');
  });
});

describe('route rules', () => {
  it('denies marketing/campaign paths', () => {
    expect(isDenied('/es/campaign/summer', DEFAULT_ROUTE_RULES)).toBe(true);
    expect(isAllowed('/es/campaign/summer', DEFAULT_ROUTE_RULES)).toBe(false);
  });
  it('allows ordinary paths when allowlist is empty', () => {
    expect(isAllowed('/es/search', DEFAULT_ROUTE_RULES)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit explorer/url.unit.test.ts`
Expected: FAIL — cannot resolve `./url`.

- [ ] **Step 3: Create `explorer/url.ts`**

```ts
export function normalizePath(rawUrl: string, baseURL: string): string {
  const u = new URL(rawUrl, baseURL);
  let p = u.pathname;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p.toLowerCase();
}

// CONFIRM product/category id patterns against the live DES site during the live crawl.
export function routePattern(path: string): string {
  return path
    .replace(/-p\d+\.html$/i, '-p{id}.html')   // product detail pattern (placeholder)
    .replace(/\/\d+(?=\/|$)/g, '/{id}');          // generic numeric id segments
}

export interface RouteRules {
  allow: RegExp[];
  deny: RegExp[];
}

export const DEFAULT_ROUTE_RULES: RouteRules = {
  allow: [],
  deny: [/\/campaign/i, /\/landing/i, /\/promo/i, /\/marketing/i, /\/newsletter/i],
};

export function isDenied(path: string, rules: RouteRules): boolean {
  return rules.deny.some((r) => r.test(path));
}

export function isAllowed(path: string, rules: RouteRules): boolean {
  if (isDenied(path, rules)) return false;
  return rules.allow.length === 0 || rules.allow.some((r) => r.test(path));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit explorer/url.unit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add explorer/url.ts explorer/url.unit.test.ts
git commit -m "feat(explorer): URL normalization and route rules"
```

---

### Task 4: Stable IDs

**Files:**
- Create: `explorer/ids.ts`
- Test: `explorer/ids.unit.test.ts`

**Interfaces:**
- Produces: `function makeId(prefix: string, ...parts: string[]): string` — deterministic `${prefix}_${sha1(parts)[:12]}`.

- [ ] **Step 1: Write the failing test** — `explorer/ids.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { makeId } from './ids';

describe('makeId', () => {
  it('is deterministic for the same inputs', () => {
    expect(makeId('page', '/es/cart', 'anon')).toBe(makeId('page', '/es/cart', 'anon'));
  });
  it('differs when any part differs', () => {
    expect(makeId('page', '/es/cart', 'anon')).not.toBe(makeId('page', '/es/cart', 'auth'));
  });
  it('prefixes the id', () => {
    expect(makeId('elem', 'a', 'b')).toMatch(/^elem_[0-9a-f]{12}$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit explorer/ids.unit.test.ts`
Expected: FAIL — cannot resolve `./ids`.

- [ ] **Step 3: Create `explorer/ids.ts`**

```ts
import { createHash } from 'node:crypto';

export function makeId(prefix: string, ...parts: string[]): string {
  const hash = createHash('sha1').update(parts.join(' ')).digest('hex').slice(0, 12);
  return `${prefix}_${hash}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit explorer/ids.unit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add explorer/ids.ts explorer/ids.unit.test.ts
git commit -m "feat(explorer): stable id helper"
```

---

### Task 5: Destructive-affordance detection

**Files:**
- Create: `explorer/extract/destructive.ts`
- Test: `explorer/extract/destructive.unit.test.ts`

**Interfaces:**
- Produces: `function isDestructive(label: string): boolean` — true for transactional/destructive labels (pay/place-order/delete/remove/confirm/buy, ES + EN).

- [ ] **Step 1: Write the failing test** — `explorer/extract/destructive.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { isDestructive } from './destructive';

describe('isDestructive', () => {
  it.each(['Pagar', 'Pay now', 'Realizar pedido', 'Eliminar', 'Delete', 'Confirmar compra', 'Buy now'])(
    'flags "%s" as destructive', (label) => { expect(isDestructive(label)).toBe(true); },
  );
  it.each(['Añadir a la cesta', 'Buscar', 'Ver producto', 'Filtrar', ''])(
    'treats "%s" as safe', (label) => { expect(isDestructive(label)).toBe(false); },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit explorer/extract/destructive.unit.test.ts`
Expected: FAIL — cannot resolve `./destructive`.

- [ ] **Step 3: Create `explorer/extract/destructive.ts`**

```ts
const DESTRUCTIVE_RE =
  /\b(pay|pagar|place\s*order|realizar\s*pedido|delete|eliminar|borrar|remove|quitar|confirm(ar)?|buy\s*now|comprar)\b/i;

export function isDestructive(label: string): boolean {
  if (!label) return false;
  return DESTRUCTIVE_RE.test(label);
}
```

> Note: "Añadir a la cesta" / "Add to cart" is intentionally NOT destructive — it's a discoverable, non-transactional action the map should record. Only purchase/confirm/delete-class labels are excluded from interaction.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit explorer/extract/destructive.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add explorer/extract/destructive.ts explorer/extract/destructive.unit.test.ts
git commit -m "feat(explorer): destructive-affordance detection"
```

---

### Task 6: DOM analyzer (offline extraction)

**Files:**
- Create: `explorer/extract/hints.ts`, `explorer/extract/analyze.ts`
- Test: `explorer/extract/analyze.unit.test.ts`

**Interfaces:**
- Consumes: `linkedom` `parseHTML`; `isDestructive` (Task 5); types from `explorer/types.ts`.
- Produces:
  - `explorer/extract/hints.ts`: `function hintsFor(el: Element): SelectorHints` and `function roleOf(el: Element): string`.
  - `explorer/extract/analyze.ts`: `function analyzePage(html: string, meta: PageMeta): PageExtraction`.

- [ ] **Step 1: Write the failing test** — `explorer/extract/analyze.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { analyzePage } from './analyze';
import type { PageMeta } from '../types';

const meta: PageMeta = { path: '/es/x', url: 'https://des.example/es/x', title: 'X', session: 'anon', discoveredVia: 'seed' };

const HTML = `
<html><body>
  <header><nav><input type="search" aria-label="Buscar" /></nav></header>
  <main>
    <a href="/es/product/abc-p123.html">Camiseta</a>
    <button data-testid="add-to-cart">Añadir a la cesta</button>
    <button>Pagar</button>
    <form aria-label="login">
      <input name="email" type="email" required />
      <input name="password" type="password" required />
    </form>
    <div role="dialog" aria-label="cookies">consent</div>
  </main>
  <footer>info</footer>
</body></html>`;

describe('analyzePage', () => {
  it('extracts links', () => {
    const r = analyzePage(HTML, meta);
    expect(r.links).toContain('/es/product/abc-p123.html');
  });
  it('extracts buttons with selector hints and marks destructive ones', () => {
    const r = analyzePage(HTML, meta);
    const addToCart = r.elements.find((e) => e.label.includes('Añadir'));
    const pay = r.elements.find((e) => e.label === 'Pagar');
    expect(addToCart?.selectorHints.testId).toBe('add-to-cart');
    expect(addToCart?.destructive).toBe(false);
    expect(pay?.destructive).toBe(true);
  });
  it('extracts forms with fields and a purpose hint', () => {
    const r = analyzePage(HTML, meta);
    expect(r.forms[0].fields.map((f) => f.name)).toEqual(['email', 'password']);
    expect(r.forms[0].purposeHint).toBe('login');
  });
  it('detects modal elements and component kinds', () => {
    const r = analyzePage(HTML, meta);
    expect(r.elements.some((e) => e.type === 'modal')).toBe(true);
    expect(r.componentKinds).toEqual(expect.arrayContaining(['Header', 'Footer', 'SearchBar']));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit explorer/extract/analyze.unit.test.ts`
Expected: FAIL — cannot resolve `./analyze`.

- [ ] **Step 3: Create `explorer/extract/hints.ts`**

```ts
import type { SelectorHints } from '../types';

const ROLE_BY_TAG: Record<string, string> = {
  a: 'link', button: 'button', nav: 'navigation', header: 'banner',
  footer: 'contentinfo', main: 'main', form: 'form', dialog: 'dialog',
};

export function roleOf(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const t = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (t === 'search') return 'searchbox';
    if (t === 'submit' || t === 'button') return 'button';
    if (t === 'checkbox') return 'checkbox';
    return 'textbox';
  }
  return ROLE_BY_TAG[tag] ?? tag;
}

export function hintsFor(el: Element): SelectorHints {
  const hints: SelectorHints = {};
  const testId = el.getAttribute('data-testid') ?? el.getAttribute('data-qa');
  if (testId) hints.testId = testId;
  const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (name) hints.role = { type: roleOf(el), name };
  const label = el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? undefined;
  if (label) hints.label = label;
  return hints;
}
```

- [ ] **Step 4: Create `explorer/extract/analyze.ts`**

```ts
import { parseHTML } from 'linkedom';
import type {
  PageExtraction, PageMeta, ExtractedElement, ExtractedForm, ElementType, ComponentKind,
} from '../types';
import { isDestructive } from './destructive';
import { hintsFor, roleOf } from './hints';

function text(el: Element): string {
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
}

function inferFormPurpose(form: Element): string {
  const aria = (form.getAttribute('aria-label') ?? '').toLowerCase();
  const names = Array.from(form.querySelectorAll('input')).map((i) => (i.getAttribute('name') ?? '').toLowerCase());
  if (aria.includes('login') || (names.includes('email') && names.includes('password'))) return 'login';
  if (aria.includes('register') || names.includes('confirm-password')) return 'register';
  if (names.some((n) => n.includes('search')) || form.querySelector('input[type=search]')) return 'search';
  if (names.some((n) => n.includes('newsletter'))) return 'newsletter';
  return 'other';
}

function detectComponents(document: Document): ComponentKind[] {
  const kinds: ComponentKind[] = [];
  if (document.querySelector('header, [role=banner]')) kinds.push('Header');
  if (document.querySelector('footer, [role=contentinfo]')) kinds.push('Footer');
  if (document.querySelector('input[type=search], [role=search], [role=searchbox]')) kinds.push('SearchBar');
  if (document.querySelector('[data-testid*=filter i], [aria-label*=filtr i]')) kinds.push('FiltersPanel');
  if (document.querySelector('[aria-label*=cesta i], [aria-label*=cart i], [data-testid*=cart i]')) kinds.push('MiniCart');
  return kinds;
}

export function analyzePage(html: string, meta: PageMeta): PageExtraction {
  const { document } = parseHTML(html);

  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href') ?? '')
    .filter((h) => h && !h.startsWith('#') && !h.startsWith('javascript:'));

  const elements: ExtractedElement[] = [];

  const pushEl = (el: Element, type: ElementType): void => {
    const label = text(el);
    elements.push({ type, label, role: roleOf(el), selectorHints: hintsFor(el), destructive: isDestructive(label) });
  };

  document.querySelectorAll('button, [role=button], input[type=submit], input[type=button]').forEach((el) => pushEl(el, 'button'));
  document.querySelectorAll('[role=dialog], dialog').forEach((el) => pushEl(el, 'modal'));
  document.querySelectorAll('[data-testid*=filter i], [aria-label*=filtr i], [role=checkbox]').forEach((el) => pushEl(el, 'filter'));
  document.querySelectorAll('[aria-label*=orden i], [aria-label*=sort i], select[name*=sort i]').forEach((el) => pushEl(el, 'sort'));

  const forms: ExtractedForm[] = Array.from(document.querySelectorAll('form')).map((form) => ({
    purposeHint: inferFormPurpose(form),
    fields: Array.from(form.querySelectorAll('input, select, textarea')).map((f) => ({
      name: f.getAttribute('name') ?? '',
      type: f.getAttribute('type') ?? f.tagName.toLowerCase(),
      required: f.hasAttribute('required'),
    })),
  }));

  const landmarkRoles = Array.from(document.querySelectorAll('header, footer, nav, main, [role]'))
    .map((el) => roleOf(el));

  const textSummary = (document.body?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 500);

  return { meta, landmarkRoles, textSummary, links, elements, forms, componentKinds: detectComponents(document) };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:unit explorer/extract/analyze.unit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add explorer/extract/hints.ts explorer/extract/analyze.ts explorer/extract/analyze.unit.test.ts
git commit -m "feat(explorer): offline DOM analyzer and selector hints"
```

---

### Task 7: Playwright page adapter (DEFERRED live)

**Files:**
- Create: `explorer/extract/fromPage.ts`

**Interfaces:**
- Consumes: Playwright `Page`; `analyzePage` (Task 6); `normalizePath` (Task 3); types.
- Produces: `async function extractFromPage(page: Page, session: Session, discoveredVia: string, baseURL: string): Promise<PageExtraction>`.

This task is browser-coupled; its live behavior is DEFERRED (no browser binaries here). Verify with `pnpm typecheck && pnpm lint` only.

- [ ] **Step 1: Create `explorer/extract/fromPage.ts`**

```ts
import type { Page } from '@playwright/test';
import type { PageExtraction, Session } from '../types';
import { analyzePage } from './analyze';
import { normalizePath } from '../url';

export async function extractFromPage(
  page: Page,
  session: Session,
  discoveredVia: string,
  baseURL: string,
): Promise<PageExtraction> {
  const url = page.url();
  const html = await page.content();
  const title = await page.title();
  return analyzePage(html, {
    path: normalizePath(url, baseURL),
    url,
    title,
    session,
    discoveredVia,
  });
}
```

- [ ] **Step 2: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add explorer/extract/fromPage.ts
git commit -m "feat(explorer): playwright page adapter feeding the analyzer"
```

---

### Task 8: Classifier interface, page context & RuleClassifier

**Files:**
- Create: `explorer/classify/Classifier.ts`, `explorer/classify/context.ts`, `explorer/classify/RuleClassifier.ts`
- Test: `explorer/classify/context.unit.test.ts`, `explorer/classify/RuleClassifier.unit.test.ts`

**Interfaces:**
- Consumes: `PageExtraction` (types); `PageType` (schema).
- Produces:
  - `Classifier.ts`: `interface PageSignals {...}`, `interface PageContext { path; title; landmarkRoles: string[]; textSummary: string; signals: PageSignals }`, `interface Classification { pageType: PageType; confidence: number }`, `interface Classifier { classifyPage(ctx: PageContext): Promise<Classification> }`.
  - `context.ts`: `function buildPageContext(ex: PageExtraction): PageContext`.
  - `RuleClassifier.ts`: `class RuleClassifier implements Classifier`.

- [ ] **Step 1: Write the failing tests**

`explorer/classify/context.unit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildPageContext } from './context';
import type { PageExtraction } from '../types';

const base: PageExtraction = {
  meta: { path: '/es/x', url: 'u', title: 'T', session: 'anon', discoveredVia: 'seed' },
  landmarkRoles: [], textSummary: '', links: [], elements: [], forms: [], componentKinds: [],
};

describe('buildPageContext', () => {
  it('detects add-to-cart and size-selector signals for a PDP', () => {
    const ex: PageExtraction = { ...base,
      elements: [{ type: 'button', label: 'Añadir a la cesta', role: 'button', selectorHints: {}, destructive: false }],
      textSummary: 'Selecciona tu talla' };
    const ctx = buildPageContext(ex);
    expect(ctx.signals.hasAddToCart).toBe(true);
    expect(ctx.signals.hasSizeSelector).toBe(true);
  });
  it('detects a login form signal', () => {
    const ex: PageExtraction = { ...base, forms: [{ purposeHint: 'login', fields: [] }] };
    expect(buildPageContext(ex).signals.hasLoginForm).toBe(true);
  });
});
```

`explorer/classify/RuleClassifier.unit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { RuleClassifier } from './RuleClassifier';
import type { PageContext } from './Classifier';

const ctx = (over: Partial<PageContext['signals']>, path = '/es/x'): PageContext => ({
  path, title: '', landmarkRoles: [], textSummary: '',
  signals: { hasAddToCart: false, hasSizeSelector: false, hasProductGrid: false, hasFilters: false, hasCheckoutSteps: false, hasLoginForm: false, hasSearchResults: false, ...over },
});

describe('RuleClassifier', () => {
  const c = new RuleClassifier();
  it('classifies PDP from add-to-cart + size', async () => {
    expect((await c.classifyPage(ctx({ hasAddToCart: true, hasSizeSelector: true }))).pageType).toBe('PDP');
  });
  it('classifies PLP from product grid + filters', async () => {
    expect((await c.classifyPage(ctx({ hasProductGrid: true, hasFilters: true }))).pageType).toBe('PLP');
  });
  it('classifies Home from root path', async () => {
    expect((await c.classifyPage(ctx({}, '/es'))).pageType).toBe('Home');
  });
  it('falls back to Other with low confidence', async () => {
    const r = await c.classifyPage(ctx({}, '/es/unknown'));
    expect(r.pageType).toBe('Other');
    expect(r.confidence).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:unit explorer/classify`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `explorer/classify/Classifier.ts`**

```ts
import type { PageType } from '../map/schema';

export interface PageSignals {
  hasAddToCart: boolean;
  hasSizeSelector: boolean;
  hasProductGrid: boolean;
  hasFilters: boolean;
  hasCheckoutSteps: boolean;
  hasLoginForm: boolean;
  hasSearchResults: boolean;
}

export interface PageContext {
  path: string;
  title: string;
  landmarkRoles: string[];
  textSummary: string;
  signals: PageSignals;
}

export interface Classification {
  pageType: PageType;
  confidence: number;
}

export interface Classifier {
  classifyPage(ctx: PageContext): Promise<Classification>;
}
```

- [ ] **Step 4: Create `explorer/classify/context.ts`**

```ts
import type { PageExtraction } from '../types';
import type { PageContext, PageSignals } from './Classifier';

export function buildPageContext(ex: PageExtraction): PageContext {
  const labels = ex.elements.map((e) => e.label.toLowerCase());
  const text = ex.textSummary.toLowerCase();
  const has = (re: RegExp) => labels.some((l) => re.test(l)) || re.test(text);

  const signals: PageSignals = {
    hasAddToCart: has(/añadir a la cesta|add to (cart|bag)/),
    hasSizeSelector: has(/talla|size/),
    hasProductGrid: ex.componentKinds.includes('ProductCard') || has(/productos|results|resultados/),
    hasFilters: ex.componentKinds.includes('FiltersPanel') || ex.elements.some((e) => e.type === 'filter'),
    hasCheckoutSteps: has(/pago|checkout|envío|shipping|payment/),
    hasLoginForm: ex.forms.some((f) => f.purposeHint === 'login'),
    hasSearchResults: has(/resultados de búsqueda|search results/),
  };

  return {
    path: ex.meta.path,
    title: ex.meta.title,
    landmarkRoles: ex.landmarkRoles,
    textSummary: ex.textSummary,
    signals,
  };
}
```

- [ ] **Step 5: Create `explorer/classify/RuleClassifier.ts`**

```ts
import type { Classifier, PageContext, Classification } from './Classifier';

export class RuleClassifier implements Classifier {
  async classifyPage(ctx: PageContext): Promise<Classification> {
    const s = ctx.signals;
    const p = ctx.path;

    if (s.hasAddToCart && s.hasSizeSelector) return { pageType: 'PDP', confidence: 0.9 };
    if (s.hasProductGrid && s.hasFilters) return { pageType: 'PLP', confidence: 0.85 };
    if (s.hasCheckoutSteps) return { pageType: 'Checkout', confidence: 0.8 };
    if (s.hasLoginForm) return { pageType: 'Account', confidence: 0.75 };
    if (s.hasSearchResults) return { pageType: 'Search', confidence: 0.75 };
    if (/\/wishlist|\/favoritos/.test(p)) return { pageType: 'Wishlist', confidence: 0.8 };
    if (/\/cart|\/cesta/.test(p)) return { pageType: 'Cart', confidence: 0.8 };
    if (p === '/' || /^\/[a-z]{2}$/.test(p)) return { pageType: 'Home', confidence: 0.7 };

    return { pageType: 'Other', confidence: 0.3 };
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:unit explorer/classify`
Expected: PASS (context: 2, RuleClassifier: 4).

- [ ] **Step 7: Commit**

```bash
git add explorer/classify/Classifier.ts explorer/classify/context.ts explorer/classify/RuleClassifier.ts explorer/classify/context.unit.test.ts explorer/classify/RuleClassifier.unit.test.ts
git commit -m "feat(explorer): classifier interface, page context, rule classifier"
```

---

### Task 9: LlmClassifier, AutoClassifier & factory

**Files:**
- Create: `explorer/classify/LlmClassifier.ts`, `explorer/classify/AutoClassifier.ts`, `explorer/classify/anthropic.ts`, `explorer/classify/factory.ts`
- Test: `explorer/classify/LlmClassifier.unit.test.ts`, `explorer/classify/AutoClassifier.unit.test.ts`

**Interfaces:**
- Consumes: `Classifier`, `PageContext`, `Classification` (Task 8); `RuleClassifier` (Task 8); `ExplorerConfig` (Task 1).
- Produces:
  - `LlmClassifier.ts`: `type LlmComplete = (p: { system: string; user: string }) => Promise<string>`; `class LlmClassifier implements Classifier` (ctor `(complete: LlmComplete, fallback: Classifier)`).
  - `AutoClassifier.ts`: `class AutoClassifier implements Classifier` (ctor `(rules: Classifier, llm: Classifier, threshold: number)`).
  - `anthropic.ts`: `function makeAnthropicComplete(cfg: LlmConfig): LlmComplete` (lazy dynamic import of `@anthropic-ai/sdk`).
  - `factory.ts`: `function makeClassifier(cfg: ExplorerConfig): Classifier`.

- [ ] **Step 1: Write the failing tests**

`explorer/classify/LlmClassifier.unit.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { LlmClassifier } from './LlmClassifier';
import { RuleClassifier } from './RuleClassifier';
import type { PageContext } from './Classifier';

const ctx: PageContext = { path: '/es/x', title: '', landmarkRoles: [], textSummary: '',
  signals: { hasAddToCart: false, hasSizeSelector: false, hasProductGrid: false, hasFilters: false, hasCheckoutSteps: false, hasLoginForm: false, hasSearchResults: false } };

describe('LlmClassifier', () => {
  it('parses a valid JSON completion', async () => {
    const complete = vi.fn().mockResolvedValue('{"pageType":"Wishlist","confidence":0.88}');
    const c = new LlmClassifier(complete, new RuleClassifier());
    expect(await c.classifyPage(ctx)).toEqual({ pageType: 'Wishlist', confidence: 0.88 });
    expect(complete).toHaveBeenCalledOnce();
  });
  it('falls back to rules on transport error', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('network'));
    const c = new LlmClassifier(complete, new RuleClassifier());
    expect((await c.classifyPage(ctx)).pageType).toBe('Other');
  });
  it('falls back to rules on an invalid pageType', async () => {
    const complete = vi.fn().mockResolvedValue('{"pageType":"Nonsense","confidence":1}');
    const c = new LlmClassifier(complete, new RuleClassifier());
    expect((await c.classifyPage(ctx)).pageType).toBe('Other');
  });
});
```

`explorer/classify/AutoClassifier.unit.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { AutoClassifier } from './AutoClassifier';
import type { Classifier, PageContext } from './Classifier';

const ctx = { path: '/es/x', title: '', landmarkRoles: [], textSummary: '',
  signals: { hasAddToCart: false, hasSizeSelector: false, hasProductGrid: false, hasFilters: false, hasCheckoutSteps: false, hasLoginForm: false, hasSearchResults: false } } as PageContext;

const stub = (pageType: string, confidence: number): Classifier => ({ classifyPage: vi.fn().mockResolvedValue({ pageType, confidence }) });

describe('AutoClassifier', () => {
  it('uses rules result when confidence >= threshold', async () => {
    const llm = stub('PDP', 0.99);
    const c = new AutoClassifier(stub('Home', 0.9), llm, 0.7);
    expect((await c.classifyPage(ctx)).pageType).toBe('Home');
    expect(llm.classifyPage).not.toHaveBeenCalled();
  });
  it('defers to llm when rules confidence < threshold', async () => {
    const c = new AutoClassifier(stub('Other', 0.3), stub('PDP', 0.95), 0.7);
    expect((await c.classifyPage(ctx)).pageType).toBe('PDP');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:unit explorer/classify/LlmClassifier.unit.test.ts explorer/classify/AutoClassifier.unit.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `explorer/classify/LlmClassifier.ts`**

```ts
import type { Classifier, PageContext, Classification } from './Classifier';
import type { PageType } from '../map/schema';

export type LlmComplete = (p: { system: string; user: string }) => Promise<string>;

const VALID: PageType[] = ['Home', 'PLP', 'PDP', 'Cart', 'Checkout', 'Account', 'Wishlist', 'Search', 'Other'];

const SYSTEM =
  'You classify an e-commerce web page into exactly one pageType. ' +
  `Respond ONLY with JSON: {"pageType": one of ${JSON.stringify(VALID)}, "confidence": 0..1}.`;

export class LlmClassifier implements Classifier {
  constructor(private readonly complete: LlmComplete, private readonly fallback: Classifier) {}

  async classifyPage(ctx: PageContext): Promise<Classification> {
    try {
      const raw = await this.complete({
        system: SYSTEM,
        user: JSON.stringify({ path: ctx.path, title: ctx.title, landmarkRoles: ctx.landmarkRoles, signals: ctx.signals, text: ctx.textSummary }),
      });
      const parsed = JSON.parse(raw) as { pageType?: string; confidence?: number };
      if (!parsed.pageType || !VALID.includes(parsed.pageType as PageType)) {
        return this.fallback.classifyPage(ctx);
      }
      return { pageType: parsed.pageType as PageType, confidence: Number(parsed.confidence ?? 0.5) };
    } catch {
      return this.fallback.classifyPage(ctx);
    }
  }
}
```

- [ ] **Step 4: Create `explorer/classify/AutoClassifier.ts`**

```ts
import type { Classifier, PageContext, Classification } from './Classifier';

export class AutoClassifier implements Classifier {
  constructor(
    private readonly rules: Classifier,
    private readonly llm: Classifier,
    private readonly threshold: number,
  ) {}

  async classifyPage(ctx: PageContext): Promise<Classification> {
    const r = await this.rules.classifyPage(ctx);
    if (r.confidence >= this.threshold) return r;
    return this.llm.classifyPage(ctx);
  }
}
```

- [ ] **Step 5: Create `explorer/classify/anthropic.ts`**

```ts
import type { LlmComplete } from './LlmClassifier';
import type { LlmConfig } from '../config';

// Lazily imports the SDK so rules-only/offline runs need neither the package at
// runtime nor an API key. Request shape confirmed against the claude-api reference.
export function makeAnthropicComplete(cfg: LlmConfig): LlmComplete {
  return async ({ system, user }) => {
    const apiKey = process.env[cfg.apiKeyEnv];
    if (!apiKey) throw new Error(`${cfg.apiKeyEnv} is not set`);
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: cfg.model,
      max_tokens: 256,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const block = msg.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  };
}
```

- [ ] **Step 6: Create `explorer/classify/factory.ts`**

```ts
import type { Classifier } from './Classifier';
import type { ExplorerConfig } from '../config';
import { RuleClassifier } from './RuleClassifier';
import { LlmClassifier } from './LlmClassifier';
import { AutoClassifier } from './AutoClassifier';
import { makeAnthropicComplete } from './anthropic';

export function makeClassifier(cfg: ExplorerConfig): Classifier {
  const rules = new RuleClassifier();
  if (cfg.mode === 'rules') return rules;

  const llm = new LlmClassifier(makeAnthropicComplete(cfg.llm), rules);
  if (cfg.mode === 'llm') return llm;

  return new AutoClassifier(rules, llm, cfg.autoThreshold);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test:unit explorer/classify/LlmClassifier.unit.test.ts explorer/classify/AutoClassifier.unit.test.ts`
Expected: PASS (LlmClassifier: 3, AutoClassifier: 2).

- [ ] **Step 8: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0 (confirms the lazy `@anthropic-ai/sdk` import types resolve).

- [ ] **Step 9: Commit**

```bash
git add explorer/classify/LlmClassifier.ts explorer/classify/AutoClassifier.ts explorer/classify/anthropic.ts explorer/classify/factory.ts explorer/classify/LlmClassifier.unit.test.ts explorer/classify/AutoClassifier.unit.test.ts
git commit -m "feat(explorer): pluggable LLM classifier, auto mode, and factory"
```

---

### Task 10: Map builder

**Files:**
- Create: `explorer/map/builder.ts`
- Test: `explorer/map/builder.unit.test.ts`

**Interfaces:**
- Consumes: `PageExtraction` (types), `Classification` (Task 8), schema types (Task 2), `makeId` (Task 4), `routePattern` (Task 3).
- Produces: `interface ClassifiedPage { extraction: PageExtraction; classification: Classification }`; `function buildMap(input: { classified: ClassifiedPage[]; environment: string; now?: string }): FunctionalMap`.

- [ ] **Step 1: Write the failing test** — `explorer/map/builder.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildMap, type ClassifiedPage } from './builder';
import type { PageExtraction } from '../types';

const pdp: PageExtraction = {
  meta: { path: '/es/product/abc-p123.html', url: 'u', title: 'Camiseta', session: 'anon', discoveredVia: '/es/search' },
  landmarkRoles: ['banner', 'main'], textSummary: 'talla',
  links: [], componentKinds: ['Header'],
  elements: [{ type: 'button', label: 'Añadir a la cesta', role: 'button', selectorHints: { testId: 'add' }, destructive: false }],
  forms: [{ purposeHint: 'login', fields: [{ name: 'email', type: 'email', required: true }] }],
};

const classified: ClassifiedPage[] = [{ extraction: pdp, classification: { pageType: 'PDP', confidence: 0.9 } }];

describe('buildMap', () => {
  it('produces a schema-versioned map with stable, deterministic ids', () => {
    const a = buildMap({ classified, environment: 'des', now: '2026-01-01T00:00:00Z' });
    const b = buildMap({ classified, environment: 'des', now: '2026-01-01T00:00:00Z' });
    expect(a.schemaVersion).toBe('1.0');
    expect(a.pages[0].pageType).toBe('PDP');
    expect(a.pages[0].routePattern).toBe('/es/product/abc-p{id}.html');
    expect(a).toEqual(b); // fully deterministic
  });
  it('assigns high priority to PDP flows and maps elements/forms/components to the page', () => {
    const m = buildMap({ classified, environment: 'des' });
    const pageId = m.pages[0].id;
    expect(m.elements[0].pageId).toBe(pageId);
    expect(m.forms[0].purpose).toBe('login');
    expect(m.components.find((c) => c.kind === 'Header')?.foundOnPages).toContain(pageId);
    expect(m.flows.find((f) => f.type.includes('PDP'))?.priority).toBe('high');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit explorer/map/builder.unit.test.ts`
Expected: FAIL — cannot resolve `./builder`.

- [ ] **Step 3: Create `explorer/map/builder.ts`**

```ts
import type { PageExtraction } from '../types';
import type { Classification } from '../classify/Classifier';
import {
  SCHEMA_VERSION, type FunctionalMap, type MapPage, type MapComponent,
  type MapElement, type MapForm, type MapFlow, type PageType, type Priority,
} from './schema';
import { makeId } from '../ids';
import { routePattern } from '../url';

export interface ClassifiedPage {
  extraction: PageExtraction;
  classification: Classification;
}

const PRIORITY_BY_TYPE: Record<PageType, Priority> = {
  PDP: 'high', PLP: 'high', Cart: 'high', Checkout: 'high', Account: 'high',
  Wishlist: 'high', Search: 'high', Home: 'med', Other: 'low',
};

export function buildMap(input: { classified: ClassifiedPage[]; environment: string; now?: string }): FunctionalMap {
  const pages: MapPage[] = [];
  const elements: MapElement[] = [];
  const forms: MapForm[] = [];
  const flows: MapFlow[] = [];
  const componentsByKey = new Map<string, MapComponent>();

  for (const { extraction: ex, classification } of input.classified) {
    const pattern = routePattern(ex.meta.path);
    const pageId = makeId('page', pattern, ex.meta.session);
    pages.push({
      id: pageId, path: ex.meta.path, routePattern: pattern, pageType: classification.pageType,
      session: ex.meta.session, title: ex.meta.title, discoveredVia: ex.meta.discoveredVia,
    });

    ex.elements.forEach((el) => {
      elements.push({
        id: makeId('elem', pageId, el.role, el.label, el.type),
        pageId, type: el.type, label: el.label, role: el.role,
        selectorHints: el.selectorHints, destructive: el.destructive,
      });
    });

    ex.forms.forEach((f, i) => {
      forms.push({ id: makeId('form', pageId, f.purposeHint, String(i)), pageId, purpose: f.purposeHint, fields: f.fields });
    });

    ex.componentKinds.forEach((kind) => {
      const key = `comp:${kind}`;
      const existing = componentsByKey.get(key);
      if (existing) {
        if (!existing.foundOnPages.includes(pageId)) existing.foundOnPages.push(pageId);
      } else {
        componentsByKey.set(key, { id: makeId('comp', kind), kind, foundOnPages: [pageId] });
      }
    });

    flows.push({
      id: makeId('flow', pageId),
      name: `${classification.pageType} (${ex.meta.session})`,
      type: classification.pageType,
      session: ex.meta.session,
      priority: PRIORITY_BY_TYPE[classification.pageType],
      steps: [pageId],
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.now ?? new Date().toISOString(),
    environment: input.environment,
    pages, components: [...componentsByKey.values()], elements, forms, flows,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit explorer/map/builder.unit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add explorer/map/builder.ts explorer/map/builder.unit.test.ts
git commit -m "feat(explorer): functional-map builder"
```

---

### Task 11: Differ

**Files:**
- Create: `explorer/diff/differ.ts`
- Test: `explorer/diff/differ.unit.test.ts`

**Interfaces:**
- Consumes: `FunctionalMap` (Task 2).
- Produces:
  - `type DiffKind = 'page' | 'component' | 'element' | 'form' | 'flow'`
  - `interface DiffEntry { kind: DiffKind; id: string; summary: string }`
  - `interface MapDiff { added: DiffEntry[]; removed: DiffEntry[]; changed: DiffEntry[] }`
  - `function diffMaps(oldMap: FunctionalMap, newMap: FunctionalMap): MapDiff`
  - `function formatDiff(diff: MapDiff): string`
  - `function hasChanges(diff: MapDiff): boolean`

- [ ] **Step 1: Write the failing test** — `explorer/diff/differ.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { diffMaps, hasChanges, formatDiff } from './differ';
import type { FunctionalMap, MapPage } from '../map/schema';

const page = (id: string, pageType: MapPage['pageType']): MapPage => ({
  id, path: '/p', routePattern: '/p', pageType, session: 'anon', title: 't', discoveredVia: 'seed',
});

const map = (pages: MapPage[]): FunctionalMap => ({
  schemaVersion: '1.0', generatedAt: 'x', environment: 'des',
  pages, components: [], elements: [], forms: [], flows: [],
});

describe('diffMaps', () => {
  it('detects added, removed, and changed pages', () => {
    const oldM = map([page('page_a', 'PLP'), page('page_b', 'Home')]);
    const newM = map([page('page_a', 'PDP'), page('page_c', 'Cart')]);
    const d = diffMaps(oldM, newM);
    expect(d.added.map((e) => e.id)).toEqual(['page_c']);
    expect(d.removed.map((e) => e.id)).toEqual(['page_b']);
    expect(d.changed.map((e) => e.id)).toEqual(['page_a']);
    expect(hasChanges(d)).toBe(true);
  });
  it('reports no changes for identical maps', () => {
    const m = map([page('page_a', 'PLP')]);
    const d = diffMaps(m, m);
    expect(hasChanges(d)).toBe(false);
    expect(formatDiff(d)).toMatch(/no changes/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit explorer/diff/differ.unit.test.ts`
Expected: FAIL — cannot resolve `./differ`.

- [ ] **Step 3: Create `explorer/diff/differ.ts`**

```ts
import type { FunctionalMap } from '../map/schema';

export type DiffKind = 'page' | 'component' | 'element' | 'form' | 'flow';

export interface DiffEntry { kind: DiffKind; id: string; summary: string }
export interface MapDiff { added: DiffEntry[]; removed: DiffEntry[]; changed: DiffEntry[] }

interface Identified { id: string }

function diffCollection<T extends Identified>(
  kind: DiffKind, oldItems: T[], newItems: T[], diff: MapDiff,
): void {
  const oldById = new Map(oldItems.map((i) => [i.id, i]));
  const newById = new Map(newItems.map((i) => [i.id, i]));

  for (const item of newItems) {
    const prev = oldById.get(item.id);
    if (!prev) diff.added.push({ kind, id: item.id, summary: `added ${kind} ${item.id}` });
    else if (JSON.stringify(prev) !== JSON.stringify(item)) diff.changed.push({ kind, id: item.id, summary: `changed ${kind} ${item.id}` });
  }
  for (const item of oldItems) {
    if (!newById.has(item.id)) diff.removed.push({ kind, id: item.id, summary: `removed ${kind} ${item.id}` });
  }
}

export function diffMaps(oldMap: FunctionalMap, newMap: FunctionalMap): MapDiff {
  const diff: MapDiff = { added: [], removed: [], changed: [] };
  diffCollection('page', oldMap.pages, newMap.pages, diff);
  diffCollection('component', oldMap.components, newMap.components, diff);
  diffCollection('element', oldMap.elements, newMap.elements, diff);
  diffCollection('form', oldMap.forms, newMap.forms, diff);
  diffCollection('flow', oldMap.flows, newMap.flows, diff);
  return diff;
}

export function hasChanges(diff: MapDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}

export function formatDiff(diff: MapDiff): string {
  if (!hasChanges(diff)) return 'Functional map: no changes.';
  const lines = [
    `Functional map diff: +${diff.added.length} / -${diff.removed.length} / ~${diff.changed.length}`,
    ...diff.added.map((e) => `  + ${e.summary}`),
    ...diff.removed.map((e) => `  - ${e.summary}`),
    ...diff.changed.map((e) => `  ~ ${e.summary}`),
  ];
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit explorer/diff/differ.unit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add explorer/diff/differ.ts explorer/diff/differ.unit.test.ts
git commit -m "feat(explorer): functional-map differ"
```

---

### Task 12: Crawl frontier

**Files:**
- Create: `explorer/crawl/frontier.ts`
- Test: `explorer/crawl/frontier.unit.test.ts`

**Interfaces:**
- Consumes: `routePattern`, `isAllowed`, `RouteRules` (Task 3); `CrawlBounds` (Task 1); `Session` (types).
- Produces:
  - `interface FrontierItem { path: string; session: Session; depth: number; discoveredVia: string }`
  - `class Frontier` with ctor `(rules: RouteRules, bounds: CrawlBounds)` and methods `add(item: FrontierItem): boolean`, `next(): FrontierItem | undefined`, `get visitedCount(): number`.

- [ ] **Step 1: Write the failing test** — `explorer/crawl/frontier.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Frontier, type FrontierItem } from './frontier';
import { DEFAULT_ROUTE_RULES } from '../url';

const bounds = { maxPages: 3, maxDepth: 2, politenessMs: 0 };
const item = (path: string, depth = 0): FrontierItem => ({ path, session: 'anon', depth, discoveredVia: 'seed' });

describe('Frontier', () => {
  it('dedups by route pattern + session', () => {
    const f = new Frontier(DEFAULT_ROUTE_RULES, bounds);
    expect(f.add(item('/es/category/1/list'))).toBe(true);
    expect(f.add(item('/es/category/2/list'))).toBe(false); // same pattern
  });
  it('rejects denied paths and over-depth items', () => {
    const f = new Frontier(DEFAULT_ROUTE_RULES, bounds);
    expect(f.add(item('/es/campaign/x'))).toBe(false);       // denied
    expect(f.add(item('/es/deep', 5))).toBe(false);          // over maxDepth
  });
  it('stops handing out items past maxPages', () => {
    const f = new Frontier(DEFAULT_ROUTE_RULES, bounds);
    f.add(item('/es/a')); f.add(item('/es/b')); f.add(item('/es/c')); f.add(item('/es/d'));
    let count = 0;
    while (f.next()) count++;
    expect(count).toBe(3); // maxPages
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit explorer/crawl/frontier.unit.test.ts`
Expected: FAIL — cannot resolve `./frontier`.

- [ ] **Step 3: Create `explorer/crawl/frontier.ts`**

```ts
import type { Session } from '../types';
import type { CrawlBounds } from '../config';
import { routePattern, isAllowed, type RouteRules } from '../url';

export interface FrontierItem {
  path: string;
  session: Session;
  depth: number;
  discoveredVia: string;
}

export class Frontier {
  private readonly seen = new Set<string>();
  private readonly queue: FrontierItem[] = [];
  private handedOut = 0;

  constructor(private readonly rules: RouteRules, private readonly bounds: CrawlBounds) {}

  private key(item: FrontierItem): string {
    return `${item.session}:${routePattern(item.path)}`;
  }

  add(item: FrontierItem): boolean {
    if (item.depth > this.bounds.maxDepth) return false;
    if (!isAllowed(item.path, this.rules)) return false;
    const k = this.key(item);
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    this.queue.push(item);
    return true;
  }

  next(): FrontierItem | undefined {
    if (this.handedOut >= this.bounds.maxPages) return undefined;
    const item = this.queue.shift();
    if (item) this.handedOut++;
    return item;
  }

  get visitedCount(): number {
    return this.handedOut;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit explorer/crawl/frontier.unit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add explorer/crawl/frontier.ts explorer/crawl/frontier.unit.test.ts
git commit -m "feat(explorer): bounded crawl frontier"
```

---

### Task 13: Crawler orchestrator (DEFERRED live)

**Files:**
- Create: `explorer/crawl/crawler.ts`

**Interfaces:**
- Consumes: Playwright `Browser`/`BrowserContext`/`Page`; `Frontier`, `FrontierItem` (Task 12); `extractFromPage` (Task 7); `normalizePath` (Task 3); `acceptConsent` from `src/support/consent.ts`; `PageExtraction`, `Session` (types); `CrawlBounds` (Task 1); `RouteRules` (Task 3).
- Produces: `interface CrawlDeps { context: BrowserContext; baseURL: string; rules: RouteRules; bounds: CrawlBounds }`; `async function crawlSession(deps: CrawlDeps, session: Session, seeds: string[]): Promise<PageExtraction[]>`.

This task is browser-coupled; live behavior is DEFERRED. Verify with `pnpm typecheck && pnpm lint` only.

- [ ] **Step 1: Create `explorer/crawl/crawler.ts`**

```ts
import type { BrowserContext } from '@playwright/test';
import type { PageExtraction, Session } from '../types';
import type { CrawlBounds } from '../config';
import { Frontier, type FrontierItem } from './frontier';
import { extractFromPage } from '../extract/fromPage';
import { normalizePath, type RouteRules } from '../url';
import { acceptConsent } from '../../src/support/consent';

export interface CrawlDeps {
  context: BrowserContext;
  baseURL: string;
  rules: RouteRules;
  bounds: CrawlBounds;
}

export async function crawlSession(deps: CrawlDeps, session: Session, seeds: string[]): Promise<PageExtraction[]> {
  const frontier = new Frontier(deps.rules, deps.bounds);
  for (const seed of seeds) {
    frontier.add({ path: normalizePath(seed, deps.baseURL), session, depth: 0, discoveredVia: 'seed' });
  }

  const results: PageExtraction[] = [];
  const page = await deps.context.newPage();

  for (let item = frontier.next(); item; item = frontier.next()) {
    try {
      await page.goto(item.path, { waitUntil: 'domcontentloaded' });
      await acceptConsent(page);
      const extraction = await extractFromPage(page, session, item.discoveredVia, deps.baseURL);
      results.push(extraction);

      for (const href of extraction.links) {
        const path = normalizePath(href, deps.baseURL);
        // stay on-site: only enqueue same-origin paths
        if (href.startsWith('http') && !href.includes(new URL(deps.baseURL).host)) continue;
        frontier.add({ path, session, depth: item.depth + 1, discoveredVia: item.path } satisfies FrontierItem);
      }
    } catch (err) {
      results.push(errorExtraction(item, session, String(err)));
    }
    if (deps.bounds.politenessMs > 0) await page.waitForTimeout(deps.bounds.politenessMs);
  }

  await page.close();
  return results;
}

function errorExtraction(item: FrontierItem, session: Session, message: string): PageExtraction {
  return {
    meta: { path: item.path, url: item.path, title: `ERROR: ${message}`, session, discoveredVia: item.discoveredVia },
    landmarkRoles: [], textSummary: '', links: [], elements: [], forms: [], componentKinds: [],
  };
}
```

> Note: `page.waitForTimeout` here is a deliberate politeness delay between crawl requests, NOT a test synchronization wait — the no-`waitForTimeout` rule targets test flakiness, which does not apply to a crawler's rate limiting.

- [ ] **Step 2: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add explorer/crawl/crawler.ts
git commit -m "feat(explorer): browser crawler orchestrator (live deferred)"
```

---

### Task 14: CLI orchestration

**Files:**
- Create: `explorer/cli.ts`, `explorer/args.ts`
- Test: `explorer/args.unit.test.ts`
- Modify: `README.md` (add an Explorer section)

**Interfaces:**
- Consumes: everything above — `loadEnv` (`src/config/env.ts`), `loadExplorerConfig` (Task 1), `crawlSession` (Task 13), `buildPageContext`/`makeClassifier` (Tasks 8-9), `buildMap` (Task 10), `diffMaps`/`formatDiff`/`hasChanges` (Task 11).
- Produces:
  - `explorer/args.ts`: `interface CliArgs { session: 'anon'|'auth'|'both'; diff: boolean; update: boolean; failOnNew: boolean; out: string }`; `function parseArgs(argv: string[]): CliArgs`.
  - `explorer/cli.ts`: a runnable entrypoint (invoked via `pnpm explore`). The full live run is DEFERRED.

- [ ] **Step 1: Write the failing test** — `explorer/args.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseArgs } from './args';

describe('parseArgs', () => {
  it('defaults to both sessions, no diff/update, canonical out path', () => {
    const a = parseArgs([]);
    expect(a).toEqual({ session: 'both', diff: false, update: false, failOnNew: false, out: 'coverage/functional-map.json' });
  });
  it('parses flags', () => {
    const a = parseArgs(['--session', 'anon', '--diff', '--update', '--fail-on-new', '--out', 'x.json']);
    expect(a).toEqual({ session: 'anon', diff: true, update: true, failOnNew: true, out: 'x.json' });
  });
  it('rejects an invalid session', () => {
    expect(() => parseArgs(['--session', 'nope'])).toThrow(/session/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit explorer/args.unit.test.ts`
Expected: FAIL — cannot resolve `./args`.

- [ ] **Step 3: Create `explorer/args.ts`**

```ts
export interface CliArgs {
  session: 'anon' | 'auth' | 'both';
  diff: boolean;
  update: boolean;
  failOnNew: boolean;
  out: string;
}

const SESSIONS = ['anon', 'auth', 'both'] as const;

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { session: 'both', diff: false, update: false, failOnNew: false, out: 'coverage/functional-map.json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--diff') args.diff = true;
    else if (a === '--update') args.update = true;
    else if (a === '--fail-on-new') args.failOnNew = true;
    else if (a === '--session') {
      const v = argv[++i];
      if (!SESSIONS.includes(v as (typeof SESSIONS)[number])) throw new Error(`--session must be one of: ${SESSIONS.join(' | ')}`);
      args.session = v as CliArgs['session'];
    } else if (a === '--out') {
      args.out = argv[++i] ?? args.out;
    }
  }
  return args;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit explorer/args.unit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `explorer/cli.ts`**

```ts
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import { loadEnv } from '../src/config/env';
import { loadExplorerConfig } from './config';
import { parseArgs } from './args';
import { DEFAULT_ROUTE_RULES } from './url';
import { crawlSession } from './crawl/crawler';
import { buildPageContext } from './classify/context';
import { makeClassifier } from './classify/factory';
import { buildMap, type ClassifiedPage } from './map/builder';
import { diffMaps, formatDiff, hasChanges } from './diff/differ';
import type { FunctionalMap } from './map/schema';
import type { Session } from './types';

const SEEDS = ['/', '/es/', '/es/search'];

async function main(): Promise<void> {
  dotenv.config();
  const env = loadEnv();
  const cfg = loadExplorerConfig();
  const args = parseArgs(process.argv.slice(2));

  const sessions: Session[] = args.session === 'both' ? ['anon', 'auth'] : [args.session];
  const classifier = makeClassifier(cfg);

  const browser = await chromium.launch();
  const classified: ClassifiedPage[] = [];
  try {
    for (const session of sessions) {
      const context = await browser.newContext(session === 'auth' ? { storageState: '.auth/state.json' } : {});
      const extractions = await crawlSession({ context, baseURL: env.baseURL, rules: DEFAULT_ROUTE_RULES, bounds: cfg.bounds }, session, SEEDS);
      for (const ex of extractions) {
        classified.push({ extraction: ex, classification: await classifier.classifyPage(buildPageContext(ex)) });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const map = buildMap({ classified, environment: env.name });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeArtifact(`reports/explorer/${stamp}.json`, map);

  if (args.diff || args.failOnNew) {
    const prev = await readMap(args.out);
    if (prev) {
      const diff = diffMaps(prev, map);
      console.log(formatDiff(diff));
      if (args.failOnNew && diff.added.length > 0) process.exitCode = 1;
    } else {
      console.log('No existing canonical map to diff against.');
    }
  }

  if (args.update) {
    await writeArtifact(args.out, map);
    console.log(`Wrote canonical map to ${args.out}`);
  } else if (!args.diff) {
    console.log(`Explored ${map.pages.length} pages (run with --update to write ${args.out}).`);
  }
}

async function writeArtifact(path: string, map: FunctionalMap): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
}

async function readMap(path: string): Promise<FunctionalMap | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as FunctionalMap;
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Add an Explorer section to `README.md`**

Append:
````markdown
## Explorer Agent

Crawls the site and emits a versioned functional map.

```bash
# Build the map (both sessions) and write the canonical file
ENVIRONMENT=des BASE_URL=... pnpm explore --update

# Re-run and show what changed vs the committed map
ENVIRONMENT=des BASE_URL=... pnpm explore --diff

# CI gate: fail if new uncovered flows appear
ENVIRONMENT=des BASE_URL=... pnpm explore --diff --fail-on-new
```

Classifier mode via `EXPLORER_MODE=rules|llm|auto` (default `rules`). The `llm`/`auto`
modes use `ANTHROPIC_API_KEY` and are optional. The canonical map lives at
`coverage/functional-map.json`; per-run artifacts go to `reports/explorer/`.
The live crawl needs corp VPN access to DES + browser binaries.
````

- [ ] **Step 7: Verify typecheck, lint, and the full unit suite**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: all exit 0; unit suite green across `src/` and `explorer/`.

- [ ] **Step 8: Commit**

```bash
git add explorer/cli.ts explorer/args.ts explorer/args.unit.test.ts README.md
git commit -m "feat(explorer): CLI orchestration, arg parsing, and docs"
```

---

## Self-Review

**Spec coverage:**
- §1 location & reuse → Tasks 1 (config), 7/13 (reuse consent), 14 (reuse loadEnv + storageState). ✓
- §2 units (crawl/extract/classify/map/diff/CLI) → Tasks 12-13 / 6-7 / 8-9 / 10 / 11 / 14. ✓
- §3 safety guardrails (no submit, no destructive click, denylist, DES default, politeness) → Task 5 (destructive), Task 3 (denylist), Task 6 (forms described not submitted), Task 13 (politeness), Task 14 (DES via loadEnv). ✓
- §4 map schema (all collections + stable IDs + selectorHints + priority) → Tasks 2, 4, 6, 10. ✓
- §5 classifier adapters (rules baseline, optional Claude Haiku 4.5 via Messages API, lazy import, modes rules/llm/auto, rules fallback) → Tasks 8-9. ✓
- §6 diff/new-feature detection (--diff/--update/--fail-on-new) → Tasks 11, 14. ✓
- §7 error handling (per-page errors recorded not fatal; LLM fallback; fail-fast config) → Task 13 (errorExtraction), Task 9 (fallback), Task 14 (loadEnv). ✓
- §8 testing (unit offline; analyzer via HTML fixtures; LLM mocked transport; live deferred) → Tasks 6, 9, plus DEFERRED markers on 7/13 and the CLI live run. ✓
- §9 risks → carried in the Global Constraints note (routePattern CONFIRM) and Task 3. ✓

**Placeholder scan:** No TODO/TBD. Code is complete in every step. DES-specific regexes are flagged `CONFIRM` (environment-derived facts, validated at the deferred live run), not placeholders for missing logic.

**Type consistency:** `PageExtraction`/`PageMeta`/`ExtractedElement`/`ExtractedForm`/`SelectorHints`/`ComponentKind` (Task 2) used identically in Tasks 6-10. `Classifier`/`PageContext`/`Classification`/`PageSignals` (Task 8) used identically in Tasks 9-10, 14. `FunctionalMap` + collections (Task 2) used in Tasks 10-11, 14. `ClassifiedPage` (Task 10) used in Task 14. `CrawlBounds`/`ExplorerConfig` (Task 1) used in Tasks 9, 12-14. `Frontier`/`FrontierItem` (Task 12) used in Task 13. `parseArgs`/`CliArgs` (Task 14) self-contained. `makeId`/`routePattern`/`normalizePath`/`isAllowed` signatures consistent across consumers. ✓
