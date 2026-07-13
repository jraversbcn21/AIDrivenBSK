# CLAUDE.md

Antes de cualquier tarea, lee y aplica RIGOR-PROTOCOL.md. Es obligatorio, no opcional.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Playwright + TypeScript QA framework (Page Object / Component Object model) for Bershka's DES e-commerce site, evolving toward an agentic QA platform. Four sub-projects: the framework foundation (`src/`, `tests/`), the `explorer/` crawler that builds a versioned "functional map", the `planner/` Coverage Planner that annotates the map with execution evidence, and the `builder/` Builder Engine that generates navigation specs from the planner's proposals.

## Roadmap & backlog

The platform-level roadmap (10-phase evolution toward the Agentic QA Platform, module evolution, milestone sequence) lives at `docs/roadmap/2026-07-02-platform-roadmap.md`; the complete pending-work backlog at `docs/roadmap/2026-07-02-backlog.md`. Read both before starting any new sub-project — every commit must serve one of the four North Star capabilities (Knowledge, Reasoning, Autonomy, Engineering Excellence), and the roadmap's "Where a fresh session resumes" section names the next candidate milestone.

**Current state (2026-07-13):** **B17 closed** — the last of the two ⚠ schema/contract-affecting Fable 5 audit items (both now done). `MapElement.id` collisions are eliminated: `makeId()` had no occurrence discriminator and neither extraction path deduped, so the committed map had 830 duplicate ids / 1,968 excess rows (32% redundant, 127 instances genuinely divergent in `testId`/`component`). Fix, three commits: `c17bdcc` — extraction-time content dedup with a new `MapElement.count` field (`explorer/extract/dedup.ts`, shared strict-equality predicate, applied in both `analyzeAria.ts` before the 60-element cap and the offline `analyze.ts`, only full-content-identical elements merged); `8a5cabf`+`60e7c61` — `buildMap` folds a per-page occurrence index into `makeId(...)` for residual same-role+label+type rows and passes `count` through, schema **1.6 → 1.7** (a plan gap was found and fixed here: `triggerElementId` needed the same occurrence-index treatment or it would desync from the passive loop's ids); `0e4057f` — closes audit finding **F7**, `builder/select.ts`'s `loadedSignalFor` uniqueness check now sums each row's `count` instead of counting rows. Live re-crawl (commit `b8dfbdf`; eventful path — first attempt blocked by a VPN/DNS drop, retry hit a mid-crawl API rate limit *after* the crawl had already completed on disk, so validation proceeded on the good map; RIGOR Regla 7, findings §21): schema 1.7, **165 pages/165 flows, 4,222 element rows (down from 4,809), 4,222/4,222 unique ids — zero duplicates**, 484 rows carry `count > 1`; `pnpm test` 4/4 no retries; `pnpm plan --update` **5/165 covered** (no coverage regression vs. F18's 5/155); `pnpm test:generated` 26/26; `pnpm test:unit` 258/258; typecheck/lint clean. Accepted residual (predates B17, not fixed): trigger-id resolution still can't disambiguate ≥2 *eligible* same-role+label+type elements — matches M9's "any exemplar" `.first()` tolerance. See findings doc §21 and audit doc §2 (F1/F7 annotated resolved). Prior context still standing: **F18 closed 2026-07-13** (coverage matching restored, 5/155 covered — findings §20); M9 closed B16 (findings §17); A5/A6 closed 2026-07-12 (findings §18/§19); the audit's "hygiene" grouping (F2, F9, F6, F11, F12) closed 2026-07-12 (audit §3.1). No milestone is currently in flight. **Confirm the next milestone with Jorge before starting brainstorm/spec work** — no ⚠ schema/contract items remain; the next candidates are all lower-priority (F8 is next in the audit's §3 table but is ⚠-rated "human call", F3 is a small output-identical win, plus C11/C13/D15), none auto-recommended. This line is meant to be replaced wholesale by the next session, not appended to — the roadmap doc is the source of truth for history.

## Pending tasks for next session

1. **No milestone is queued at top priority, and no ⚠ schema/contract-affecting item remains — both (B17 and F18) closed 2026-07-13.** Check `docs/roadmap/2026-07-02-backlog.md` fresh and confirm with Jorge before starting any brainstorm; nothing below is auto-recommended. B-NL1 (Phase 9, natural-language instruction interface) is registered but explicitly not actionable — its dependencies (failure triage) don't exist yet.
2. **Backlog B17 — done (2026-07-13).** `MapElement.id` collisions eliminated via extraction-time content dedup + a `MapElement.count` field plus occurrence-discriminated ids (schema 1.6 → 1.7; three commits `c17bdcc`, `8a5cabf`+`60e7c61`, `0e4057f`, the last closing audit finding F7). Live re-crawl: 165-page map, 4,222 element rows (down from 4,809), 4,222/4,222 unique ids — zero duplicates, 484 rows with `count > 1`; `pnpm plan --update` 5/165 covered (no coverage regression), all suites green. See findings doc §21, backlog §B, audit §2 (F1/F7 resolved).
3. **Backlog F18 — done (2026-07-13).** Coverage matching restored: `/` dropped from `SEEDS` + F4 chain-truncation fix (commit `304c35e`), live re-crawl to a 155-page map with no `/` root (commit `e02acc8`), `pnpm plan --update` 5/155 covered with `coveredBy` naming all three real manual specs. See findings doc §20, backlog §F.
4. **Next-candidate context (all lower-priority than the closed ⚠ items — confirm with Jorge first):** per the audit's own §3 sequencing, **F8** is next in the table (centralize the act→verify→retry idiom hand-rolled seven times) but is ⚠-rated ("touches every live-validated interaction path... mandates a full live re-validation pass; human call on whether the consolidation is worth it now") — a candidate, not a default. **F3** (Order-2, redirect-duplicate pages paying full extraction cost before dedup discards them) is small and output-identical. Both are tracked only in `docs/superpowers/notes/2026-07-06-fable5-final-audit.md` §2–3, not yet filed as numbered backlog items. Also open: `tests/generated/` has no pruning mechanism (audit F10) and a plan-wording nit (from F18's close-out).
5. Lower-priority backlog items, unordered: **C11** (GitLab e2e runner reachability to `*.inditex.grp`, never confirmed), **C13** (flaky-test tagging for the future Reporting Agent, only partially addressed), **D15** (checkout/payment flows — highest-risk, untested, DES pre-prod only).

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
- If a session cannot tell which model is currently active, ask before starting spec/plan work vs. implementation work.
