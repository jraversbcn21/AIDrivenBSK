# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Working method for every task in this repo, regardless of which model is active — reformulate before executing, decompose before starting, three alternatives before committing to a design decision, adversarial self-critique before delivering, verify in the real world, stay anti-drift, report without softening:

@RIGOR-PROTOCOL.md

## What this is

Playwright + TypeScript QA framework (Page Object / Component Object model) for Bershka's DES e-commerce site, evolving toward an agentic QA platform. Four sub-projects: the framework foundation (`src/`, `tests/`), the `explorer/` crawler that builds a versioned "functional map", the `planner/` Coverage Planner that annotates the map with execution evidence, and the `builder/` Builder Engine that generates navigation specs from the planner's proposals.

## Roadmap & backlog

The platform-level roadmap (10-phase evolution toward the Agentic QA Platform, module evolution, milestone sequence) lives at `docs/roadmap/2026-07-02-platform-roadmap.md`; the complete pending-work backlog at `docs/roadmap/2026-07-02-backlog.md`. Read both before starting any new sub-project — every commit must serve one of the four North Star capabilities (Knowledge, Reasoning, Autonomy, Engineering Excellence), and the roadmap's "Where a fresh session resumes" section names the next candidate milestone.

**Current state (2026-07-12):** M9 (Builder interaction-spec generation) closed, and it closed backlog B16 along the way — see roadmap doc / findings doc §17 for full milestone detail (unchanged). A full codebase architecture/quality audit ran 2026-07-06 (Fable 5's last document-phase task before retirement — see "Model routing policy" below), diagnostic only, no code changes: `docs/superpowers/notes/2026-07-06-fable5-final-audit.md`. It root-caused the M9-observed duplicate-`MapElement.id` issue (now backlog **B17**) and surfaced a new structural finding on the coverage/evidence contract (now backlog **F18**, new section), plus 10 smaller findings tracked in the audit doc itself with a proposed sequencing. **Same day, later (2026-07-12): backlog A5 closed** — `SearchResultsPage.firstProduct()` now selects by capability (standard quick-add button present, `Personalizable` badge absent), live-validated 5/5 against DES; see findings doc §18. No milestone is currently in flight. **Confirm the next milestone with Jorge before starting brainstorm/spec work** — B17/F18 are the natural next candidates (both ⚠ schema/contract-affecting, need their own spec cycles, not quick patches). This line is meant to be replaced wholesale by the next session, not appended to — the roadmap doc is the source of truth for history.

## Pending tasks for next session

1. **No milestone is queued at top priority.** Check `docs/roadmap/2026-07-02-backlog.md` fresh and confirm with Jorge before starting a brainstorm. **B17/F18** are the most natural next candidates (see below). B-NL1 (Phase 9, natural-language instruction interface) is registered but explicitly not actionable — its dependencies (failure triage) don't exist yet.
2. **Backlog B17** (root-caused 2026-07-06, Fable 5 audit, not fixed): the canonical map's 830+ duplicate `MapElement.id` collisions trace to `makeId()` in `explorer/map/builder.ts` having no occurrence discriminator — 32% of the element table is redundant, and 127 duplicate instances actually diverge in their `testId`/`component` hints (not just harmless repeats). Fix changes committed element ids wholesale (schema-affecting, needs a dedicated spec cycle + live re-validation). See audit doc §2 finding F1, backlog B17.
3. **Backlog F18** (root-caused 2026-07-06, Fable 5 audit, not fixed, new backlog section): `pnpm plan`'s coverage matching has reported near-zero flows covered across seven consecutive sessions (M7b through M9), each time attributed to crawl-order variability — but it's a deterministic incompatibility (crawler seeds include bare `/`, which the specs never navigate to, and `isOrderedSubsequence` requires the full chain). `coveredBy` has been structurally empty since M7b; fixing it changes coverage semantics (needs its own spec cycle). See audit doc §2 finding F5, backlog F18.
4. Ten smaller audit findings (differ blind to `interactions[]`, redirect-duplicate pages paying full extraction cost, offline DOM extractor missing `data-qa-anchor`, the act→verify→retry idiom hand-rolled seven times, and others) are tracked only in `docs/superpowers/notes/2026-07-06-fable5-final-audit.md` §2–3 with a proposed sequencing — not yet individually filed as backlog items.
5. Lower-priority backlog items, unordered: **C11** (GitLab e2e runner reachability to `*.inditex.grp`, never confirmed), **C13** (flaky-test tagging for the future Reporting Agent, only partially addressed), **D15** (checkout/payment flows — highest-risk, untested, DES pre-prod only).
6. **Backlog A6** (found 2026-07-12, during A5's live probe): DES's `/es/logon.html` now renders the email+password login form directly, skipping the "Continuar con e-mail" interstitial — breaks `auth.setup`, so a full serialized `pnpm test` run cannot currently complete end-to-end (only individual specs via `--no-deps` work). Not yet fixed; needs a live probe before touching `src/pages/LoginPage.ts`. See findings doc §18, backlog A6.

## Commands

- `pnpm test` — Playwright e2e tests (`tests/`); also writes `reports/route-evidence.json` for the planner
- `pnpm test:unit` — Vitest unit tests (`src/**/*.unit.test.ts`, `explorer/**/*.unit.test.ts`, `planner/**/*.unit.test.ts`, `builder/**/*.unit.test.ts`)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — `eslint . --ext .ts`
- `pnpm explore` — Explorer Agent CLI (`tsx explorer/cli.ts`); flags `--update`, `--diff`, `--fail-on-new`
- `pnpm plan` — Coverage Planner CLI (`tsx planner/cli.ts`); flags `--update`, `--top <n>`
- `pnpm build-tests` — Builder Engine CLI (`tsx builder/cli.ts`); flag `--top <n>` (default 3); writes drafts to gitignored `tests/generated/`
- `pnpm test:generated` — runs only the generated drafts (excluded from `pnpm test` via `testIgnore`)
- Package manager is **pnpm** (not pinned in `package.json`, but `pnpm-lock.yaml` + CI's `corepack enable` confirm it)
- Browser install: `pnpm exec playwright install --with-deps chromium` (not just `pnpm install`)

## Environment

Required env vars (see `.env.example`): `ENVIRONMENT` (`prod | des | local`), `BASE_URL` (no trailing path beyond the locale root), `BERSHKA_USER`, `BERSHKA_PASS`. No hardcoded URLs anywhere — specs navigate with relative paths via `loadEnv()`.

`checkoutAllowed` is `false` for `prod` — never write tests that exercise checkout/payment against prod.

**Corp network gotcha:** Playwright's browser-binary download fails behind the corp proxy cert (`SELF_SIGNED_CERT_IN_CHAIN`). Workaround: `NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm exec playwright install chromium` (relaxes TLS for the download only), or set `NODE_EXTRA_CA_CERTS` to the corp root CA for a persistent fix.

## Code style (stricter than defaults)

- `@typescript-eslint/no-explicit-any` is an **error** (not a warning) — no `any`, ever.
- `import/no-cycle` is an **error** with `maxDepth: Infinity` — no circular imports at any depth.
- Selector priority, enforced by convention: `getByTestId` → `getByRole` → `getByLabel` → `getByPlaceholder`. No XPath, no `nth-child`, no fragile CSS.
- `tsconfig.json` has `strict: true` and the path alias `@/*` → `src/*`.

## Testing patterns

- Components/pages expose async query methods (`isVisible()`, `itemCount()`); assert with `expect.poll(() => component.isVisible()).toBe(true)`, not `expect(locator).toBeVisible()` directly.
- `tests/auth.setup.ts` is the Playwright `setup` project (matched by `testMatch: /auth\.setup\.ts/`); it logs in once and writes `.auth/state.json`, which the `chromium` project reuses via `storageState`.
- `tests/auth/login.spec.ts` tests the login path itself, so it opts out of the shared session: `test.use({ storageState: { cookies: [], origins: [] } })`.
- Other specs import `test`/`expect` from `src/fixtures/test.ts` (not raw `@playwright/test`) to get injected page objects (`homePage`, `loginPage`, `searchResultsPage`, `productPage`, `env`).
- **Never use `waitForLoadState('networkidle')` against DES** — the site streams third-party beacons (gtm, optimizely, prismic, snapchat, tangoo) indefinitely, so network never goes idle. Wait by URL or for specific elements instead.
- `ignoreHTTPSErrors` is NOT needed against DES — Chromium trusts the corporate CA from the OS store.

## DES live selectors

Before touching any selector or flow against the live DES site (search, PLP/PDP, filters, cart, login), read the confirmed findings first — DES uses shadow-DOM (`bds-`) web components and several flows are non-obvious (e.g. real PDP URL pattern is `-c0p<digits>.html`, add-to-cart is a two-step size dialog, there is no mini-cart drawer):

@docs/superpowers/notes/2026-06-17-des-live-validation-findings.md

The driver.js onboarding tour is suppressed **preventively**, not reactively: `BasePage.goto()` pre-seeds a `bsk_onboarding` cookie (`suppressOnboardingTour` in `consent.ts`) before every navigation, so the tour never fires. `dismissOnboardingTour` (Escape key) still exists as a fallback in call sites — don't remove it, but don't rely on it as the primary defense either.

**Interaction reliability (the rule):** on DES, *every state-changing interaction must act→verify→retry* — elements become visible before Vue attaches their handlers, so fire-once clicks/keypresses are silently lost (confirmed live for the search Enter, the size-selection click, and card opens; all fixed that way in `SearchBar`, `ProductPage`, `ProductCard`). Two environment facts constrain recovery design: `/es/q/{term}` is **not server-routable** (a reload lands on home — never reload the results page; re-run the search via UI instead, which the test-level `retries: 1` does), and DES pre-prod intermittently serves dead `/q/` loads and degraded app shells (untranslated or empty-`<main>` states). The suite runs `workers: 1` on purpose (one shared account; parallel runs failed 6/6). Residual intermittent failures under sustained repeated runs are characterized as environment noise in findings doc §7 (2026-07-02) — read that section, including the open nav-dialog lead and the missing cart-cleanup fixture, before touching any of this.

## Repo etiquette

Commit messages follow Conventional Commits: `type(scope): description` (e.g. `fix(search/cart): ...`, `feat(explorer): ...`). Common scopes: `explorer`, `planner`, `builder`, `foundation`, `search/cart`.

## Model routing policy (working method)

- **Documentation, brainstorming, specs, plans** (anything under `docs/superpowers/{specs,plans,notes}`, roadmap/backlog updates, design docs) → **Claude Opus 4.8**.
- **Implementation** (writing/editing code in `src/`, `explorer/`, `planner/`, `builder/`, `tests/`, running live validation) → **Claude Sonnet 5**.
- Fable 5 was used historically for documentation/spec work through the M9 milestone. As of 2026-07-06, Fable 5 is retired from this workflow — do not use it for any new spec/plan/doc cycle. Opus 4.8 replaces it fully.
- RIGOR-PROTOCOL.md (referenciado al inicio de este archivo) es un método de razonamiento heredado del trabajo de Fable 5, no una directiva de modelo. Aplica sobre Opus 4.8 y Sonnet 5 según la tabla de arriba; no reinstala a Fable 5.
- If a session cannot tell which model is currently active, ask before starting spec/plan work vs. implementation work.
