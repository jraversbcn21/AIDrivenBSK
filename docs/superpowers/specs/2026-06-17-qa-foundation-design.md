# Phase 0 — QA Automation Framework Foundation (Bershka)

**Date:** 2026-06-17
**Status:** Approved (design)
**Scope:** Phase 0 only — the Playwright + TypeScript framework foundation. The AI agents are later phases.

---

## Context

This is the first sub-project of a larger agentic QA Automation platform for Bershka eCommerce. The full platform comprises 8+ independent subsystems (Explorer, Coverage, Test Generator, Playwright Builder Engine, Failure Analyzer, Selector Healing, Reporting/Dashboard agents, plus this framework foundation). It is too large for a single spec, so each subsystem gets its own spec → plan → implementation cycle.

**A code-generating agent cannot "follow the existing architecture" until that architecture exists.** Phase 0 builds and proves that architecture. It is the bedrock every later phase depends on, and it delivers value (a working, multi-env test suite) even before any AI is added.

### Decisions locked during brainstorming

- **Starting point:** Phase 0 — Foundation.
- **Primary environment:** DES (`des-...inditex.grp`), reachable on corp network/VPN, with test credentials. Safe for full flows including checkout/payment (later phases).
- **CI platform:** GitLab CI.
- **Reference test scope:** Lean trio (Login; Search→PLP→PDP; Add-to-Cart).
- **Architecture:** Approach A — Classic POM/COM with Playwright fixtures (components composed into pages; tests never instantiate objects or see URLs).

### Supported environments

| ENVIRONMENT | URL (via `BASE_URL`) | Checkout/payment tests |
|---|---|---|
| `prod` | `https://www.bershka.com` | **Disabled** (no real orders) |
| `des` | `https://des-ecombknj-test-webecom.bk.apps.axdesecocp1.ecommerce.inditex.grp/es/` | Allowed |
| `local` | `https://localhost:3443/es/` | Allowed |

URLs are **never hardcoded** — `BASE_URL` from the environment is the single source of truth.

---

## 1. Project structure (Phase 0)

```
AIDrivenBsk/
├── src/
│   ├── config/
│   │   ├── env.ts              # typed loader: validates ENVIRONMENT + BASE_URL at startup (zod)
│   │   └── environments.ts     # per-env NON-URL defaults (timeouts, locale, checkoutAllowed flag)
│   ├── pages/
│   │   ├── BasePage.ts         # shared nav/wait helpers; no selectors, no business logic
│   │   ├── HomePage.ts
│   │   ├── LoginPage.ts
│   │   ├── SearchResultsPage.ts   # PLP
│   │   └── ProductPage.ts          # PDP
│   ├── components/
│   │   ├── BaseComponent.ts    # rooted at a Locator, not the page
│   │   ├── Header.ts
│   │   ├── SearchBar.ts
│   │   ├── ProductCard.ts
│   │   ├── FiltersPanel.ts
│   │   └── MiniCart.ts
│   ├── fixtures/
│   │   └── test.ts             # custom `test` = base + env + page objects
│   ├── support/
│   │   ├── consent.ts          # cookie banner + country/language handling
│   │   └── locators.ts         # selector-strategy helper (testid→role→label→placeholder)
│   └── data/
│       └── users.ts            # reads creds from env; zero secrets in repo
├── tests/
│   ├── auth/login.spec.ts
│   ├── search/search-plp-pdp.spec.ts
│   └── cart/add-to-cart.spec.ts
├── global-setup.ts             # authenticate once → storageState
├── .auth/                      # gitignored
├── reports/                    # gitignored (HTML report, traces, videos)
├── playwright.config.ts
├── .env.example  .gitignore  .gitlab-ci.yml
├── tsconfig.json  package.json
```

`agents/`, `coverage/`, `dashboard/` from the full vision are **deliberately absent** — they belong to later phases. Phase 0 ships only the framework + 3 reference tests.

---

## 2. Multi-environment config

- **`src/config/env.ts`** reads `ENVIRONMENT` (`prod|des|local`) and `BASE_URL` from the process env (via `dotenv` locally, real env vars in CI) and **validates them at startup with zod** — a missing/invalid `BASE_URL` fails fast with a clear message. No URL is ever hardcoded.
- **`src/config/environments.ts`** holds only *non-URL* per-env settings (default timeouts, locale `es`, and `checkoutAllowed` — `true` for DES/local, `false` for prod). This is the gate that keeps checkout/payment tests from ever running against production.
- **`.env.example`** documents every variable (`ENVIRONMENT`, `BASE_URL`, `BERSHKA_USER`, `BERSHKA_PASS`); the real `.env` is gitignored.
- `playwright.config.ts` consumes `env.ts` for `use.baseURL`, so tests navigate with relative paths (`page.goto('/es/')`).

---

## 3. POM / COM contracts

These are the patterns the future Builder Engine will be required to imitate, so they must be regular and boilerplate-light.

- **`BasePage`** — owns the `page`, exposes `goto(path)` and common waits. No selectors, no business logic.
- **Page Objects** extend `BasePage`, expose **intent-level methods** (`login(user)`, `searchFor(term)`), and *compose* components. They stay small because reusable UI lives in components.
- **`BaseComponent`** — constructed from a **root `Locator`** (not the whole page), so a `ProductCard` is scoped to its own DOM subtree and reusable inside PLP, wishlist, cart, recommendations.
- **Component Objects** (`Header`, `SearchBar`, `ProductCard`, `FiltersPanel`, `MiniCart`) expose actions/queries scoped to their root.
- **Selector strategy enforced in code** via `support/locators.ts` following the priority `getByTestId → getByRole → getByLabel → getByPlaceholder`. XPath, nth-child, and fragile CSS are avoided.

> ⚠️ **Assumption to verify on the real DES site:** that `data-testid`/`data-qa` attributes exist. If Bershka's markup lacks them, the realistic primary becomes `getByRole`, and that finding feeds directly into the future Selector Healing Agent.

---

## 4. Fixtures & authentication

- **`src/fixtures/test.ts`** extends Playwright's `base test` to inject a typed `env` and ready-instantiated page objects. Tests never call `new PageObject()` and never see a URL — they read as plain business steps. This keeps "business logic out of tests" and "low coupling" true by construction.
- **`global-setup.ts`** logs in once against DES and writes `storageState` to `.auth/`; a Playwright **project dependency** makes authenticated specs reuse it instead of logging in repeatedly → faster, deterministic, independent tests.
- **`support/consent.ts`** dismisses the cookie/consent banner and handles country/language so every test starts from a clean, deterministic state.

---

## 5. Reference tests (lean trio)

Each is independent, deterministic, parallelizable, and exercises a distinct slice of the architecture.

- **`tests/auth/login.spec.ts`** — drives `LoginPage.login(user)` with credentials from `data/users.ts`; asserts authenticated state via `Header`. The only spec that does **not** reuse `storageState` (it validates the login path itself), and it is what `global-setup.ts` reuses internally. Proves: auth pattern, env-injected data, `Header` component.
- **`tests/search/search-plp-pdp.spec.ts`** — `Header.searchBar.searchFor(term)` → `SearchResultsPage` → apply one filter via `FiltersPanel` → open a `ProductCard` → assert `ProductPage`. Proves: component composition, components rooted at locators, navigation across page objects.
- **`tests/cart/add-to-cart.spec.ts`** — from PDP, select size, add to cart, assert via `MiniCart`. Proves: stateful component + cross-page state.

No checkout/payment in Phase 0 — later phase, gated by `checkoutAllowed`.

---

## 6. GitLab CI

`.gitlab-ci.yml`:
- Official `mcr.microsoft.com/playwright` image (browsers preinstalled); `node_modules` cached by lockfile hash.
- Single `test` stage, parameterized by `ENVIRONMENT` (default `des`); `BASE_URL` and credentials supplied via **masked/protected GitLab CI variables** — never in the repo.
- Artifacts on failure: Playwright **HTML report + traces + videos**, retained ~7 days.
- `retries: 1` in CI only, to surface (not hide) flakiness; flaky results are tagged for the future Reporting Agent rather than silently passed.

> ⚠️ **Risk:** GitLab runners must reach `*.inditex.grp` (corp network/VPN). If shared runners cannot, a self-hosted runner is required.

---

## 7. Reporting baseline

Phase 0 uses Playwright's **built-in HTML reporter + JSON reporter**. The JSON output is the deliberate seam the future Reporting Agent / dashboard will consume — no dashboards now, but machine-readable results are emitted from day one to avoid a retrofit. No custom reporting code in Phase 0.

---

## 8. Error handling & determinism

- **Fail fast on config:** invalid `ENVIRONMENT`/`BASE_URL` throws at startup, before any browser launches.
- **Web-first assertions & auto-waiting only** — no fixed `waitForTimeout`.
- **Trace on first retry, screenshot + video on failure** — exactly the artifacts the future Failure Analyzer Agent needs, captured by default.
- **Consent/locale normalized in setup** so dynamic marketing banners/popups cannot destabilize runs (aligns with the "don't test marketing content" rule).

---

## 9. Testing the framework itself

The reference tests *are* the validation: a green run against DES proves config, fixtures, auth reuse, and POM/COM composition end-to-end. Additionally, CI runs `tsc --noEmit` + ESLint with an **import-cycle rule** to enforce "no circular dependencies."

---

## 10. Risks / assumptions to verify during implementation

1. **`data-testid` presence** on DES — if absent, primary selector shifts to `getByRole` (feeds Selector Healing later).
2. **DES reachability from GitLab runners** — runner must be on corp network/VPN; may require a self-hosted runner.
3. **Test credential stability** on DES (no forced password rotation mid-suite).
4. **Country/language entry flow** variability between prod and DES.

---

## 11. Roadmap (what Phase 0 unlocks)

Phase 0 done = the architecture exists and is proven. Sequence:

**Phase 0 (Foundation)** → **Explorer Agent** (maps DES against this structure) → **Coverage + Test Generator** → **Builder Engine** (generates code imitating exactly these patterns) → **Failure Analyzer + Selector Healing** → **Reporting/Dashboard**.

Coverage will be measured by **user journeys / business processes**, never by code lines or test counts.

---

## Non-goals for Phase 0

- No AI agents of any kind.
- No checkout/payment tests.
- No custom dashboards or reporting UI.
- No exhaustive coverage of the critical-flow list — only the three reference tests needed to lock the patterns.
