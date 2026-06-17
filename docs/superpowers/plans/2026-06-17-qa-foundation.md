# QA Framework Foundation (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Playwright + TypeScript test framework (POM/COM, multi-env config, GitLab CI) with three reference tests that lock the architecture every later AI-agent phase will imitate.

**Architecture:** Approach A — classic Page Object / Component Object model. Components are constructed from a root `Locator` and *composed into* Page Objects; Page Objects expose intent-level methods. A custom Playwright `test` fixture injects a validated, typed environment and ready-made page objects, so specs never instantiate objects or reference URLs. Auth is captured once via global setup and replayed through `storageState`.

**Tech Stack:** TypeScript, Playwright Test, Zod (config validation), Vitest (unit tests for non-browser code), ESLint + `eslint-plugin-import` (import-cycle rule), GitLab CI.

## Global Constraints

- **Language:** TypeScript only. `tsc --noEmit` must pass with `strict: true`.
- **Node:** 20 LTS (matches the `mcr.microsoft.com/playwright` CI image).
- **Package manager:** pnpm.
- **No hardcoded URLs anywhere.** `BASE_URL` from the environment is the single source of truth; specs navigate with relative paths.
- **`ENVIRONMENT`** ∈ `prod | des | local`. Checkout/payment tests are gated by `checkoutAllowed` (false for `prod`).
- **Selector priority (enforced in code):** `getByTestId` → `getByRole` → `getByLabel` → `getByPlaceholder`. No XPath, no `nth-child`, no fragile CSS.
- **No circular dependencies** (enforced by ESLint `import/no-cycle`).
- **No secrets in the repo.** Credentials come from env vars; `.env`, `.auth/`, `reports/` are gitignored.
- **Tests must be** independent, repeatable, deterministic, parallelizable. No fixed `waitForTimeout`; web-first assertions only.
- **Primary environment:** DES (`ENVIRONMENT=des`).

> **Note on selectors (read before Tasks 10–12):** The exact Bershka DES DOM is not known at planning time. The locators written in the page/component objects below are *strategy-correct placeholders following the priority above*. During implementation you MUST confirm each against the live DES site using `pnpm exec playwright codegen "$BASE_URL"` and adjust to the real attributes, keeping the priority order. Record any page that lacks `data-testid` — that finding feeds the future Selector Healing Agent.

---

### Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `.eslintrc.cjs`, `vitest.config.ts`
- Create: `.env.example`
- Modify: `.gitignore` (already exists from the spec commit — verify contents)

**Interfaces:**
- Consumes: nothing.
- Produces: pnpm scripts `test` (Playwright), `test:unit` (Vitest), `typecheck`, `lint`; a compiling TS project with `strict: true`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "aidriven-bsk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "playwright test",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^8.57.0",
    "eslint-plugin-import": "^2.30.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "zod": "^3.23.0",
    "dotenv": "^16.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "tests", "global-setup.ts", "playwright.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `.eslintrc.cjs`** (enforces no import cycles)

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:import/typescript'],
  settings: { 'import/resolver': { typescript: {} } },
  rules: {
    'import/no-cycle': ['error', { maxDepth: Infinity }],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  ignorePatterns: ['node_modules', 'reports', 'playwright-report', 'test-results', '.auth'],
};
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.unit.test.ts'], environment: 'node' },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
```

- [ ] **Step 5: Create `.env.example`**

```bash
# Which logical environment. One of: prod | des | local
ENVIRONMENT=des
# Base URL for the target environment. No trailing path beyond locale root.
BASE_URL=https://des-ecombknj-test-webecom.bk.apps.axdesecocp1.ecommerce.inditex.grp/es/
# Test account credentials (never commit real values)
BERSHKA_USER=
BERSHKA_PASS=
```

- [ ] **Step 6: Verify `.gitignore` contains the required ignores**

Expected to already contain (from the spec commit): `node_modules/`, `.env`, `.auth/`, `reports/`, `test-results/`, `playwright-report/`. Add any that are missing.

- [ ] **Step 7: Install dependencies and browsers**

Run: `pnpm install && pnpm exec playwright install --with-deps chromium`
Expected: install completes; `pnpm exec playwright --version` prints a version.

- [ ] **Step 8: Verify typecheck and lint run (no source yet)**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0 (no files to fail yet).

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json .eslintrc.cjs vitest.config.ts .env.example .gitignore pnpm-lock.yaml
git commit -m "chore: project scaffold and tooling"
```

---

### Task 2: Typed multi-environment config

**Files:**
- Create: `src/config/environments.ts`
- Create: `src/config/env.ts`
- Test: `src/config/env.unit.test.ts`

**Interfaces:**
- Consumes: `process.env.ENVIRONMENT`, `process.env.BASE_URL`.
- Produces:
  - `type EnvName = 'prod' | 'des' | 'local'`
  - `interface EnvironmentDefaults { defaultTimeoutMs: number; locale: string; checkoutAllowed: boolean }`
  - `const environments: Record<EnvName, EnvironmentDefaults>`
  - `interface AppEnv extends EnvironmentDefaults { name: EnvName; baseURL: string }`
  - `function loadEnv(): AppEnv` — throws on invalid/missing config.

- [ ] **Step 1: Write the failing unit test** — `src/config/env.unit.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.ENVIRONMENT; delete process.env.BASE_URL; });
  afterEach(() => { process.env = { ...saved }; });

  it('loads a valid des config with merged defaults', () => {
    process.env.ENVIRONMENT = 'des';
    process.env.BASE_URL = 'https://des.example/es/';
    const env = loadEnv();
    expect(env.name).toBe('des');
    expect(env.baseURL).toBe('https://des.example/es/');
    expect(env.checkoutAllowed).toBe(true);
    expect(env.locale).toBe('es');
  });

  it('marks prod as checkout-disallowed', () => {
    process.env.ENVIRONMENT = 'prod';
    process.env.BASE_URL = 'https://www.bershka.com/';
    expect(loadEnv().checkoutAllowed).toBe(false);
  });

  it('throws when BASE_URL is missing', () => {
    process.env.ENVIRONMENT = 'des';
    expect(() => loadEnv()).toThrow(/BASE_URL/);
  });

  it('throws when ENVIRONMENT is not a known value', () => {
    process.env.ENVIRONMENT = 'staging';
    process.env.BASE_URL = 'https://x/';
    expect(() => loadEnv()).toThrow(/ENVIRONMENT/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit src/config/env.unit.test.ts`
Expected: FAIL — `loadEnv` not found / module `./env` cannot be resolved.

- [ ] **Step 3: Create `src/config/environments.ts`**

```ts
export type EnvName = 'prod' | 'des' | 'local';

export interface EnvironmentDefaults {
  defaultTimeoutMs: number;
  locale: string;
  checkoutAllowed: boolean;
}

export const environments: Record<EnvName, EnvironmentDefaults> = {
  prod:  { defaultTimeoutMs: 30_000, locale: 'es', checkoutAllowed: false },
  des:   { defaultTimeoutMs: 30_000, locale: 'es', checkoutAllowed: true },
  local: { defaultTimeoutMs: 30_000, locale: 'es', checkoutAllowed: true },
};
```

- [ ] **Step 4: Create `src/config/env.ts`**

```ts
import { z } from 'zod';
import { environments, type EnvName, type EnvironmentDefaults } from './environments';

const schema = z.object({
  ENVIRONMENT: z.enum(['prod', 'des', 'local'], {
    errorMap: () => ({ message: 'ENVIRONMENT must be one of: prod | des | local' }),
  }),
  BASE_URL: z.string({ required_error: 'BASE_URL is required' }).url('BASE_URL must be a valid URL'),
});

export interface AppEnv extends EnvironmentDefaults {
  name: EnvName;
  baseURL: string;
}

export function loadEnv(): AppEnv {
  const parsed = schema.safeParse({
    ENVIRONMENT: process.env.ENVIRONMENT,
    BASE_URL: process.env.BASE_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.errors.map((e) => `- ${e.message}`).join('\n')}`);
  }
  const name = parsed.data.ENVIRONMENT;
  return { name, baseURL: parsed.data.BASE_URL, ...environments[name] };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:unit src/config/env.unit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts src/config/environments.ts src/config/env.unit.test.ts
git commit -m "feat(config): typed multi-environment config with validation"
```

---

### Task 3: Selector-strategy helper

**Files:**
- Create: `src/support/locators.ts`
- Test: `src/support/locators.unit.test.ts`

**Interfaces:**
- Consumes: a Playwright `Page` or `Locator` scope (typed structurally to avoid importing the browser at unit-test time — see below).
- Produces:
  - `type Strategy = { testId?: string; role?: { name: string; exact?: boolean; type: Parameters<Page['getByRole']>[0] }; label?: string; placeholder?: string }`
  - `function pickStrategyKey(s: Strategy): 'testId' | 'role' | 'label' | 'placeholder'` — returns the highest-priority key present; throws if none.

> Rationale: the part worth unit-testing is the *priority resolution*, which is pure. The actual `Locator` construction is a thin switch exercised by the e2e specs.

- [ ] **Step 1: Write the failing unit test** — `src/support/locators.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { pickStrategyKey } from './locators';

describe('pickStrategyKey', () => {
  it('prefers testId above all', () => {
    expect(pickStrategyKey({ testId: 'a', role: { name: 'x', type: 'button' }, label: 'l' })).toBe('testId');
  });
  it('falls back to role when no testId', () => {
    expect(pickStrategyKey({ role: { name: 'x', type: 'button' }, label: 'l' })).toBe('role');
  });
  it('falls back to label when no testId/role', () => {
    expect(pickStrategyKey({ label: 'l', placeholder: 'p' })).toBe('label');
  });
  it('falls back to placeholder last', () => {
    expect(pickStrategyKey({ placeholder: 'p' })).toBe('placeholder');
  });
  it('throws when nothing is provided', () => {
    expect(() => pickStrategyKey({})).toThrow(/at least one selector/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit src/support/locators.unit.test.ts`
Expected: FAIL — `pickStrategyKey` not found.

- [ ] **Step 3: Create `src/support/locators.ts`**

```ts
import type { Page, Locator } from '@playwright/test';

type Role = Parameters<Page['getByRole']>[0];

export interface Strategy {
  testId?: string;
  role?: { type: Role; name: string; exact?: boolean };
  label?: string;
  placeholder?: string;
}

const PRIORITY = ['testId', 'role', 'label', 'placeholder'] as const;
export type StrategyKey = (typeof PRIORITY)[number];

export function pickStrategyKey(s: Strategy): StrategyKey {
  const key = PRIORITY.find((k) => s[k] !== undefined);
  if (!key) throw new Error('Strategy must define at least one selector (testId | role | label | placeholder)');
  return key;
}

/** Resolve a Strategy to a Locator scoped to `scope`, honouring the priority order. */
export function locate(scope: Page | Locator, s: Strategy): Locator {
  switch (pickStrategyKey(s)) {
    case 'testId': return scope.getByTestId(s.testId!);
    case 'role': return scope.getByRole(s.role!.type, { name: s.role!.name, exact: s.role!.exact });
    case 'label': return scope.getByLabel(s.label!);
    case 'placeholder': return scope.getByPlaceholder(s.placeholder!);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit src/support/locators.unit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/support/locators.ts src/support/locators.unit.test.ts
git commit -m "feat(support): selector-strategy helper with priority resolution"
```

---

### Task 4: Playwright config

**Files:**
- Create: `playwright.config.ts`

**Interfaces:**
- Consumes: `loadEnv()` from Task 2.
- Produces: a config exposing `use.baseURL`, HTML + JSON reporters, trace/video/screenshot policy, a `setup` project and a `chromium` project that depends on it and reuses `.auth/state.json`.

> The `setup` project references `global-setup.ts` logic via a spec match; the actual auth spec is created in Task 9. Until then the `chromium` project still runs (its dependency produces no tests yet). This task is committable on its own: `pnpm exec playwright test --list` succeeds.

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import { loadEnv } from './src/config/env';

dotenv.config();
const env = loadEnv();

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['list'],
  ],
  timeout: env.defaultTimeoutMs,
  use: {
    baseURL: env.baseURL,
    locale: env.locale,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/state.json' },
      dependencies: ['setup'],
    },
  ],
});
```

- [ ] **Step 2: Verify the config loads and lists tests**

Run: `ENVIRONMENT=des BASE_URL=https://des.example/es/ pnpm exec playwright test --list`
Expected: command exits 0; prints "Total: 0 tests" (no specs yet) without config errors.

- [ ] **Step 3: Verify config fails fast on bad env**

Run: `ENVIRONMENT=staging BASE_URL=x pnpm exec playwright test --list`
Expected: FAIL with the "Invalid environment configuration" message from `loadEnv`.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts
git commit -m "feat: playwright config consuming typed env"
```

---

### Task 5: Framework primitives (BasePage, BaseComponent, consent, users)

**Files:**
- Create: `src/components/BaseComponent.ts`
- Create: `src/pages/BasePage.ts`
- Create: `src/support/consent.ts`
- Create: `src/data/users.ts`

**Interfaces:**
- Consumes: `locate`/`Strategy` (Task 3); `@playwright/test` `Page`/`Locator`.
- Produces:
  - `class BaseComponent { constructor(root: Locator); protected readonly root: Locator }`
  - `class BasePage { constructor(page: Page); readonly page: Page; goto(path?: string): Promise<void> }`
  - `async function acceptConsent(page: Page): Promise<void>`
  - `interface TestUser { username: string; password: string }` and `function primaryUser(): TestUser` (reads `BERSHKA_USER`/`BERSHKA_PASS`, throws if absent).

- [ ] **Step 1: Create `src/components/BaseComponent.ts`**

```ts
import type { Locator } from '@playwright/test';

/** A component is always scoped to a root Locator, never the whole page. */
export abstract class BaseComponent {
  protected readonly root: Locator;
  constructor(root: Locator) {
    this.root = root;
  }
}
```

- [ ] **Step 2: Create `src/pages/BasePage.ts`**

```ts
import type { Page } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate relative to the configured baseURL. `path` defaults to the locale root. */
  async goto(path = ''): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }
}
```

- [ ] **Step 3: Create `src/support/consent.ts`**

```ts
import type { Page } from '@playwright/test';

/**
 * Dismiss the cookie/consent banner if present. Tolerant by design: the banner
 * may not appear (already accepted via storageState), so a miss is not a failure.
 * CONFIRM the accept-button locator against DES with `playwright codegen`.
 */
export async function acceptConsent(page: Page): Promise<void> {
  const accept = page.getByRole('button', { name: /aceptar|accept/i });
  if (await accept.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await accept.first().click();
  }
}
```

- [ ] **Step 4: Create `src/data/users.ts`**

```ts
export interface TestUser {
  username: string;
  password: string;
}

export function primaryUser(): TestUser {
  const username = process.env.BERSHKA_USER;
  const password = process.env.BERSHKA_PASS;
  if (!username || !password) {
    throw new Error('BERSHKA_USER and BERSHKA_PASS must be set (no credentials in the repo).');
  }
  return { username, password };
}
```

- [ ] **Step 5: Verify typecheck and lint pass**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/BaseComponent.ts src/pages/BasePage.ts src/support/consent.ts src/data/users.ts
git commit -m "feat: framework primitives (BasePage, BaseComponent, consent, users)"
```

---

### Task 6: Component Objects

**Files:**
- Create: `src/components/SearchBar.ts`, `src/components/Header.ts`, `src/components/ProductCard.ts`, `src/components/FiltersPanel.ts`, `src/components/MiniCart.ts`

**Interfaces:**
- Consumes: `BaseComponent` (Task 5), `locate`/`Strategy` (Task 3).
- Produces (method signatures relied on by Tasks 7–12):
  - `SearchBar.search(term: string): Promise<void>`
  - `Header`: `readonly searchBar: SearchBar`; `isUserLoggedIn(): Promise<boolean>`; `openMiniCart(): Promise<void>`
  - `ProductCard.open(): Promise<void>`
  - `FiltersPanel.applyFirstAvailable(): Promise<void>`
  - `MiniCart`: `itemCount(): Promise<number>`; `isVisible(): Promise<boolean>`

> All locators below are strategy-correct placeholders — CONFIRM against DES (see "Note on selectors").

- [ ] **Step 1: Create `src/components/SearchBar.ts`**

```ts
import { BaseComponent } from './BaseComponent';

export class SearchBar extends BaseComponent {
  async search(term: string): Promise<void> {
    const input = this.root.getByRole('searchbox');
    await input.click();
    await input.fill(term);
    await input.press('Enter');
  }
}
```

- [ ] **Step 2: Create `src/components/MiniCart.ts`**

```ts
import { BaseComponent } from './BaseComponent';

export class MiniCart extends BaseComponent {
  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async itemCount(): Promise<number> {
    return this.root.getByRole('listitem').count();
  }
}
```

- [ ] **Step 3: Create `src/components/Header.ts`**

```ts
import type { Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';
import { SearchBar } from './SearchBar';
import { MiniCart } from './MiniCart';

export class Header extends BaseComponent {
  readonly searchBar: SearchBar;
  private readonly page: Page;

  constructor(page: Page) {
    super(page.getByRole('banner'));
    this.page = page;
    this.searchBar = new SearchBar(this.root);
  }

  async isUserLoggedIn(): Promise<boolean> {
    // CONFIRM: a logged-in header typically exposes an account/logout affordance.
    return this.root.getByRole('link', { name: /mi cuenta|account|logout|cerrar sesión/i }).isVisible();
  }

  async openMiniCart(): Promise<void> {
    await this.root.getByRole('link', { name: /cesta|cart|bag/i }).click();
  }

  miniCart(): MiniCart {
    return new MiniCart(this.page.getByRole('dialog', { name: /cesta|cart|bag/i }));
  }
}
```

- [ ] **Step 4: Create `src/components/ProductCard.ts`**

```ts
import { BaseComponent } from './BaseComponent';

export class ProductCard extends BaseComponent {
  async open(): Promise<void> {
    await this.root.getByRole('link').first().click();
  }
}
```

- [ ] **Step 5: Create `src/components/FiltersPanel.ts`**

```ts
import { BaseComponent } from './BaseComponent';

export class FiltersPanel extends BaseComponent {
  /** Apply the first available filter option to exercise filtering deterministically. */
  async applyFirstAvailable(): Promise<void> {
    const trigger = this.root.getByRole('button').first();
    await trigger.click();
    const option = this.root.getByRole('checkbox').first();
    await option.check();
  }
}
```

- [ ] **Step 6: Verify typecheck and lint pass**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0 (the import-cycle rule confirms components don't cycle).

- [ ] **Step 7: Commit**

```bash
git add src/components/
git commit -m "feat(components): Header, SearchBar, ProductCard, FiltersPanel, MiniCart"
```

---

### Task 7: Page Objects

**Files:**
- Create: `src/pages/HomePage.ts`, `src/pages/LoginPage.ts`, `src/pages/SearchResultsPage.ts`, `src/pages/ProductPage.ts`

**Interfaces:**
- Consumes: `BasePage` (Task 5), `Header`/`ProductCard`/`FiltersPanel` (Task 6), `TestUser` (Task 5).
- Produces (relied on by fixtures and specs):
  - `HomePage`: `readonly header: Header`; `open(): Promise<void>`
  - `LoginPage`: `open(): Promise<void>`; `login(user: TestUser): Promise<void>`
  - `SearchResultsPage`: `readonly filters: FiltersPanel`; `firstProduct(): ProductCard`
  - `ProductPage`: `readonly header: Header`; `selectFirstSize(): Promise<void>`; `addToCart(): Promise<void>`

> Locators are strategy-correct placeholders — CONFIRM against DES.

- [ ] **Step 1: Create `src/pages/HomePage.ts`**

```ts
import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';
import { acceptConsent } from '../support/consent';

export class HomePage extends BasePage {
  readonly header: Header;
  constructor(page: Page) {
    super(page);
    this.header = new Header(page);
  }
  async open(): Promise<void> {
    await this.goto();
    await acceptConsent(this.page);
  }
}
```

- [ ] **Step 2: Create `src/pages/LoginPage.ts`**

```ts
import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { acceptConsent } from '../support/consent';
import type { TestUser } from '../data/users';

export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('logon'); // CONFIRM the login route on DES
    await acceptConsent(this.page);
  }

  async login(user: TestUser): Promise<void> {
    await this.page.getByLabel(/email|correo/i).fill(user.username);
    await this.page.getByLabel(/contraseña|password/i).fill(user.password);
    await this.page.getByRole('button', { name: /iniciar sesión|entrar|log ?in/i }).click();
  }
}
```

- [ ] **Step 3: Create `src/pages/SearchResultsPage.ts`**

```ts
import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { FiltersPanel } from '../components/FiltersPanel';
import { ProductCard } from '../components/ProductCard';

export class SearchResultsPage extends BasePage {
  readonly filters: FiltersPanel;
  constructor(page: Page) {
    super(page);
    this.filters = new FiltersPanel(page.getByRole('complementary')); // CONFIRM filters container
  }

  firstProduct(): ProductCard {
    // CONFIRM: product grid items. Prefer a testid on the card if present.
    return new ProductCard(this.page.getByRole('listitem').first());
  }
}
```

- [ ] **Step 4: Create `src/pages/ProductPage.ts`**

```ts
import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';

export class ProductPage extends BasePage {
  readonly header: Header;
  constructor(page: Page) {
    super(page);
    this.header = new Header(page);
  }

  async selectFirstSize(): Promise<void> {
    // CONFIRM: size selector. Often a button group.
    await this.page.getByRole('button', { name: /talla|size/i }).first().click();
    await this.page.getByRole('option').first().click();
  }

  async addToCart(): Promise<void> {
    await this.page.getByRole('button', { name: /añadir|add to/i }).click();
  }
}
```

- [ ] **Step 5: Verify typecheck and lint pass**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/
git commit -m "feat(pages): HomePage, LoginPage, SearchResultsPage, ProductPage"
```

---

### Task 8: Custom test fixture

**Files:**
- Create: `src/fixtures/test.ts`

**Interfaces:**
- Consumes: all page objects (Task 7), `loadEnv()` (Task 2).
- Produces: `export const test` with fixtures `env: AppEnv`, `homePage: HomePage`, `loginPage: LoginPage`, `searchResultsPage: SearchResultsPage`, `productPage: ProductPage`; and `export const expect`.

- [ ] **Step 1: Create `src/fixtures/test.ts`**

```ts
import { test as base, expect } from '@playwright/test';
import { loadEnv, type AppEnv } from '../config/env';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { SearchResultsPage } from '../pages/SearchResultsPage';
import { ProductPage } from '../pages/ProductPage';

interface Fixtures {
  env: AppEnv;
  homePage: HomePage;
  loginPage: LoginPage;
  searchResultsPage: SearchResultsPage;
  productPage: ProductPage;
}

export const test = base.extend<Fixtures>({
  env: async ({}, use) => { await use(loadEnv()); },
  homePage: async ({ page }, use) => { await use(new HomePage(page)); },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  searchResultsPage: async ({ page }, use) => { await use(new SearchResultsPage(page)); },
  productPage: async ({ page }, use) => { await use(new ProductPage(page)); },
});

export { expect };
```

- [ ] **Step 2: Verify typecheck and lint pass**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/fixtures/test.ts
git commit -m "feat(fixtures): custom test fixture injecting env and page objects"
```

---

### Task 9: Auth setup → storageState

**Files:**
- Create: `tests/auth.setup.ts`

**Interfaces:**
- Consumes: `LoginPage`, `HomePage` (Task 7), `primaryUser()` (Task 5). Matched by the `setup` project's `testMatch: /auth\.setup\.ts/` (Task 4).
- Produces: `.auth/state.json` (an authenticated storage state) consumed by the `chromium` project.

- [ ] **Step 1: Create `tests/auth.setup.ts`**

```ts
import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../src/pages/LoginPage';
import { HomePage } from '../src/pages/HomePage';
import { primaryUser } from '../src/data/users';

const STATE_PATH = '.auth/state.json';

setup('authenticate', async ({ page }) => {
  const login = new LoginPage(page);
  await login.open();
  await login.login(primaryUser());

  const home = new HomePage(page);
  await expect.poll(() => home.header.isUserLoggedIn()).toBe(true);

  await page.context().storageState({ path: STATE_PATH });
});
```

- [ ] **Step 2: Confirm login locators against DES, then run setup**

First confirm the login route and field locators: `BASE_URL=$DES_URL pnpm exec playwright codegen "$BASE_URL"` and adjust `LoginPage` (Task 7) if needed.
Run: `ENVIRONMENT=des BASE_URL=$DES_URL BERSHKA_USER=$U BERSHKA_PASS=$P pnpm exec playwright test --project=setup`
Expected: PASS; `.auth/state.json` is created.

- [ ] **Step 3: Commit**

```bash
git add tests/auth.setup.ts
git commit -m "feat(auth): global login setup persisting storageState"
```

---

### Task 10: Reference test — Login

**Files:**
- Create: `tests/auth/login.spec.ts`

**Interfaces:**
- Consumes: `test`/`expect` (Task 8). This spec validates the login path itself, so it does **not** rely on the stored auth state — it runs against a fresh context.

- [ ] **Step 1: Write the spec** — `tests/auth/login.spec.ts`

```ts
import { test, expect } from '../../src/fixtures/test';
import { primaryUser } from '../../src/data/users';

// Validate the login path itself, independent of the shared storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test('user can log in with valid credentials', async ({ loginPage, homePage }) => {
  await loginPage.open();
  await loginPage.login(primaryUser());
  await expect.poll(() => homePage.header.isUserLoggedIn()).toBe(true);
});
```

- [ ] **Step 2: Confirm locators against DES (per the selector note), then run**

Run: `ENVIRONMENT=des BASE_URL=$DES_URL BERSHKA_USER=$U BERSHKA_PASS=$P pnpm exec playwright test tests/auth/login.spec.ts --project=chromium`
Expected: PASS. If it fails on a locator, fix the relevant page/component object (keeping selector priority) and re-run — do not weaken assertions.

- [ ] **Step 3: Commit**

```bash
git add tests/auth/login.spec.ts src/pages/LoginPage.ts src/components/Header.ts
git commit -m "test(auth): login reference test"
```

---

### Task 11: Reference test — Search → PLP → PDP

**Files:**
- Create: `tests/search/search-plp-pdp.spec.ts`

**Interfaces:**
- Consumes: `test`/`expect` (Task 8); reuses stored auth state (default `chromium` project).

- [ ] **Step 1: Write the spec** — `tests/search/search-plp-pdp.spec.ts`

```ts
import { test, expect } from '../../src/fixtures/test';

test('search, filter, and open a product detail page', async ({ homePage, searchResultsPage, productPage, page }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');

  await expect(searchResultsPage.firstProduct()['root']).toBeVisible();
  await searchResultsPage.filters.applyFirstAvailable();

  await searchResultsPage.firstProduct().open();
  await expect(productPage.page).toHaveURL(/product|\/p\//i); // CONFIRM PDP URL pattern on DES
  await expect(page.getByRole('button', { name: /añadir|add to/i })).toBeVisible();
});
```

- [ ] **Step 2: Confirm locators/URL pattern against DES, then run**

Run: `ENVIRONMENT=des BASE_URL=$DES_URL pnpm exec playwright test tests/search/search-plp-pdp.spec.ts --project=chromium`
Expected: PASS. Adjust the PDP URL regex and component locators to the real DES values if needed.

- [ ] **Step 3: Commit**

```bash
git add tests/search/search-plp-pdp.spec.ts src/components/ src/pages/
git commit -m "test(search): search to PDP reference test"
```

---

### Task 12: Reference test — Add to cart

**Files:**
- Create: `tests/cart/add-to-cart.spec.ts`

**Interfaces:**
- Consumes: `test`/`expect` (Task 8); reuses stored auth state.

- [ ] **Step 1: Write the spec** — `tests/cart/add-to-cart.spec.ts`

```ts
import { test, expect } from '../../src/fixtures/test';

test('adding a product updates the mini cart', async ({ homePage, searchResultsPage, productPage }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.firstProduct().open();

  await productPage.selectFirstSize();
  await productPage.addToCart();

  await productPage.header.openMiniCart();
  const miniCart = productPage.header.miniCart();
  await expect.poll(() => miniCart.isVisible()).toBe(true);
  expect(await miniCart.itemCount()).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Confirm locators against DES, then run**

Run: `ENVIRONMENT=des BASE_URL=$DES_URL pnpm exec playwright test tests/cart/add-to-cart.spec.ts --project=chromium`
Expected: PASS. Fix size/add-to-cart/mini-cart locators to real DES values if needed.

- [ ] **Step 3: Run the full suite to confirm independence and parallelism**

Run: `ENVIRONMENT=des BASE_URL=$DES_URL BERSHKA_USER=$U BERSHKA_PASS=$P pnpm exec playwright test`
Expected: all reference tests PASS; `reports/results.json` and `reports/html` are produced.

- [ ] **Step 4: Commit**

```bash
git add tests/cart/add-to-cart.spec.ts src/components/ src/pages/
git commit -m "test(cart): add-to-cart reference test"
```

---

### Task 13: GitLab CI + README

**Files:**
- Create: `.gitlab-ci.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: pnpm scripts (Task 1), CI variables `ENVIRONMENT`, `BASE_URL`, `BERSHKA_USER`, `BERSHKA_PASS` (configured in GitLab as masked/protected).
- Produces: a `test` pipeline stage that typechecks, lints, runs unit + Playwright tests, and archives reports on failure.

- [ ] **Step 1: Create `.gitlab-ci.yml`**

```yaml
stages: [verify, test]

default:
  image: mcr.microsoft.com/playwright:v1.48.0-jammy
  cache:
    key:
      files: [pnpm-lock.yaml]
    paths: [.pnpm-store]
  before_script:
    - corepack enable
    - pnpm config set store-dir .pnpm-store
    - pnpm install --frozen-lockfile

verify:
  stage: verify
  script:
    - pnpm typecheck
    - pnpm lint
    - pnpm test:unit

e2e:
  stage: test
  variables:
    ENVIRONMENT: des
  script:
    - pnpm exec playwright test
  artifacts:
    when: on_failure
    expire_in: 7 days
    paths:
      - reports/
      - test-results/
```

> `BASE_URL`, `BERSHKA_USER`, `BERSHKA_PASS` are set as **masked/protected CI variables** in GitLab — never in this file. If shared runners cannot reach `*.inditex.grp`, attach a self-hosted runner with corp-network access via a tag and add `tags:` to the `e2e` job.

- [ ] **Step 2: Create `README.md`**

````markdown
# AIDriven Bershka QA — Framework Foundation (Phase 0)

Playwright + TypeScript test framework using Page Object / Component Object models with multi-environment config. Foundation for a later agentic QA platform.

## Setup
```bash
pnpm install
pnpm exec playwright install --with-deps chromium
cp .env.example .env   # fill in BASE_URL + credentials
```

## Run
```bash
# Local run against DES (values via .env or inline)
ENVIRONMENT=des BASE_URL=... BERSHKA_USER=... BERSHKA_PASS=... pnpm test
pnpm test:unit       # unit tests (config, selector strategy)
pnpm typecheck && pnpm lint
```

## Environments
Set via env vars only — no hardcoded URLs. `ENVIRONMENT` ∈ `prod | des | local`.
Checkout/payment tests are gated by `checkoutAllowed` (disabled for `prod`).

## Structure
- `src/config` — typed, validated multi-env config
- `src/pages` — Page Objects (intent-level methods)
- `src/components` — Component Objects (rooted at a Locator)
- `src/fixtures/test.ts` — injects env + page objects
- `tests/` — reference specs
````

- [ ] **Step 3: Validate CI YAML locally (lint)**

Run: `pnpm exec playwright test --list >/dev/null` (sanity) and verify `.gitlab-ci.yml` parses (push to a branch or use GitLab's CI Lint). 
Expected: no YAML/config errors.

- [ ] **Step 4: Commit**

```bash
git add .gitlab-ci.yml README.md
git commit -m "ci: GitLab pipeline (verify + e2e) and project README"
```

---

## Self-Review

**Spec coverage:**
- §1 structure → Tasks 1,5,6,7,8 (every directory created). ✓
- §2 multi-env config (no hardcoded URLs, zod validation, checkoutAllowed) → Task 2 + Task 4 `baseURL`. ✓
- §3 POM/COM contracts (BasePage/BaseComponent, components rooted at Locator, selector priority) → Tasks 3,5,6,7. ✓
- §4 fixtures & auth (custom test, global setup → storageState, consent) → Tasks 5,8,9. ✓
- §5 reference trio → Tasks 10,11,12. ✓
- §6 GitLab CI (image, env-param, artifacts, retries) → Task 13 + Task 4 `retries`. ✓
- §7 reporting baseline (HTML + JSON) → Task 4 reporters. ✓
- §8 determinism (fail-fast, web-first, trace/video/screenshot) → Task 2, Task 4 `use`. ✓
- §9 testing the framework (tsc, ESLint import-cycle, reference tests) → Tasks 1,3,12. ✓
- §10 risks (data-testid, runner reachability, creds, locale) → selector note + Task 9/13 confirmations. ✓

**Placeholder scan:** Code is complete in every step. The only intentionally deferred items are real DES locators, which are environment-derived facts; each is flagged `CONFIRM` with the exact `codegen` command and cannot be known at planning time. No "TODO/TBD/implement later" in code.

**Type consistency:** `AppEnv`/`EnvironmentDefaults` (Task 2) used consistently in Tasks 4,8. `Strategy`/`pickStrategyKey`/`locate` (Task 3) consistent. Page/component method names in Tasks 6,7 match their use in Tasks 8–12 (`searchBar.search`, `firstProduct().open`, `filters.applyFirstAvailable`, `selectFirstSize`, `addToCart`, `header.openMiniCart`, `header.miniCart().itemCount`). ✓
