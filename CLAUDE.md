# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Playwright + TypeScript QA framework (Page Object / Component Object model) for Bershka's DES e-commerce site, evolving toward an agentic QA platform. Four sub-projects: the framework foundation (`src/`, `tests/`), the `explorer/` crawler that builds a versioned "functional map", the `planner/` Coverage Planner that annotates the map with execution evidence, and the `builder/` Builder Engine that generates navigation specs from the planner's proposals.

## Roadmap & backlog

The platform-level roadmap (10-phase evolution toward the Agentic QA Platform, module evolution, milestone sequence) lives at `docs/roadmap/2026-07-02-platform-roadmap.md`; the complete pending-work backlog at `docs/roadmap/2026-07-02-backlog.md`. Read both before starting any new sub-project — every commit must serve one of the four North Star capabilities (Knowledge, Reasoning, Autonomy, Engineering Excellence), and the roadmap's "Where a fresh session resumes" section names the next candidate milestone.

**Current state (2026-07-06):** M9 (Builder interaction-spec generation) closed, and it closed backlog B16 along the way. The Builder now generates a spec that opens/verifies/closes a map-captured overlay interaction (`selectInteractionJourneys`/`unsatisfiedMustCapture` in `builder/select.ts`, `TemplateGenerator.generateInteraction`), alongside its existing navigation-spec generation; `loadedSignalFor` now deprioritizes (not excludes) a testId hint that repeats among a page's own elements, closing B16. Live-validated (subagent-driven, worktree `feat/m9-interaction-spec-generation`): a genuine live bug was found and fixed during validation — DES keeps a persistent nav-menu dialog mounted on every page, which broke the original `getByRole('dialog')` overlay-open signal; fixed with a baseline dialog-count diff (mirrors M8's crawler diffing idiom). After the fix: `pnpm test:generated` 5/5 no retries, B16 confirmed fixed live, `pnpm test` 3/4 (backlog A5 confirmed, unrelated, pre-existing). Full detail: roadmap doc's "Where a fresh session resumes", findings doc §17. No milestone is currently in flight. **Confirm the next milestone with Jorge before starting brainstorm/spec work** — A5 is the most natural candidate (open across two sessions now, still unfixed). This line is meant to be replaced wholesale by the next session, not appended to — the roadmap doc is the source of truth for history.

## Pending tasks for next session

1. **No milestone is queued at top priority.** Check `docs/roadmap/2026-07-02-backlog.md` fresh and confirm with Jorge before starting a brainstorm. **A5** is the most natural next candidate (see below). B-NL1 (Phase 9, natural-language instruction interface) is registered but explicitly not actionable — its dependencies (failure triage) don't exist yet.
2. **Backlog A5** (found 2026-07-05, reconfirmed live 2026-07-06, still open): `tests/cart/add-to-cart.spec.ts` fails deterministically right now — the current top "camiseta" search result is a Personalizable product with a different add-to-cart UI ("Personalizar"/"Añadir" instead of "Añadir a cesta"). Confirmed unrelated to both M8b and M9. Needs a live probe of the Personalizable flow before fixing.
3. **New, minor, out-of-scope observation (found 2026-07-06, not yet a numbered backlog item):** the committed canonical map has 830+ duplicate `MapElement.id` collisions (label+page). Tolerated by design in M9's selection code (first-match); a real Explorer-side data-quality gap worth a future root-cause pass. See findings doc §17.
4. Lower-priority backlog items, unordered: **C11** (GitLab e2e runner reachability to `*.inditex.grp`, never confirmed), **C13** (flaky-test tagging for the future Reporting Agent, only partially addressed), **D15** (checkout/payment flows — highest-risk, untested, DES pre-prod only).

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
