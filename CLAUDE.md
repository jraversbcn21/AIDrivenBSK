# CLAUDE.md

Antes de cualquier tarea, lee y aplica RIGOR-PROTOCOL.md. Es obligatorio, no opcional.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Playwright + TypeScript QA framework (Page Object / Component Object model) for Bershka's DES e-commerce site, now a full agentic QA platform. Eight sub-projects: the framework foundation (`src/`, `tests/`), the `explorer/` crawler that builds a versioned "functional map", the `planner/` Coverage Planner that annotates the map with execution evidence (drift-aware via run history), the `builder/` Builder Engine that generates navigation specs from the planner's proposals, the `analyzer/` Risk Analysis Agent that classifies run failures and risk-scores map diffs (multi-run failure history), the `healer/` Selector Healing Agent that proposes live-validated fixes for selector-drift failures, the `learning/` Continuous Learning recorder that accumulates cross-run memory in `coverage/run-history.json`, and the `orchestrator/` that runs the whole cycle deterministically (`pnpm qa-cycle`).

## Roadmap & backlog

The platform-level roadmap (10-phase evolution toward the Agentic QA Platform, module evolution, milestone sequence) lives at `docs/roadmap/2026-07-02-platform-roadmap.md`; the complete pending-work backlog at `docs/roadmap/2026-07-02-backlog.md`. Read both before starting any new sub-project — every commit must serve one of the four North Star capabilities (Knowledge, Reasoning, Autonomy, Engineering Excellence), and the roadmap's "Where a fresh session resumes" section names the next candidate milestone.

**Current state (2026-07-14):** **B-NL1 is done, v1 — the roadmap is COMPLETE: all ten phases, both Phase 9 halves (orchestration + NL interface), live-validated.** New `intent/` sub-project (`pnpm ask`): deterministic NL→flow resolver + generation via the `selectJourneyByFlowId` injection point, 381/381 unit, live-validated in all four conversation shapes + `--run` 5/5 green. **Exit gate pending: Jorge must review `docs/superpowers/notes/2026-07-14-bnl1-decision-log.md`.** Same day, earlier: Phases 6/7/8/9-core done + gates closed, F3 + F10 closed, one hands-on session by Jorge (qa-cycle, generation, promotion of `tests/mujer/bombacho-barrel.spec.ts`). This line is a pointer, not a re-narration; **replace it wholesale next session**, don't append to it. The roadmap doc's "Where a fresh session resumes" section is the source of truth for history.

## Pending tasks for next session

1. **Start here:** **the B-NL1 exit gate is the blocking item — Jorge's review of `docs/superpowers/notes/2026-07-14-bnl1-decision-log.md`.** After it: **no phase or registered milestone remains** — the platform is in use-and-maintain mode. Support Jorge's hands-on usage, fix what he finds, don't start new milestone work unprompted. Open maintenance candidates only: **F8** (⚠ retry consolidation, human call), **D15** (checkout flows — also unblocks `pnpm ask "checkout"` intents), **C11** (runner reachability), CI wiring of `qa-cycle`/`--risk`. Routing stays on Fable 5 (Opus/Sonnet split on standby). Read `docs/roadmap/2026-07-02-backlog.md`'s "Where a fresh session resumes" section fresh (it's the live, authoritative list — don't rely on the summary below if the two have drifted).
2. **Other open items (lower priority):** **F8** (centralize the act→verify→retry idiom, hand-rolled 7×) remains ⚠-rated — "touches every live-validated interaction path... human call," not a default pick. Wiring `pnpm analyze --risk` into the CI diff gate (needs a baseline-snapshotting decision — v1 requires a caller-supplied baseline). Healer v2 candidates (proactive drift detection; structured broken-locator data in the failure report) are noted in the Phase 7 design §7/decision log D4, not planned.
3. **Lower-priority, unordered:** two Minors from B17/F18's closes (`tests/generated/` has no pruning mechanism — audit F10; a plan-wording nit); **C11** (GitLab e2e runner reachability, never confirmed); **C13** (flaky-test tagging for the future Reporting Agent, partial); **D15** (checkout/payment flows — highest-risk, untested, DES pre-prod only). **B-NL1** (Phase 9 NL interface) is registered but not actionable — its dependency (failure triage) doesn't exist yet.

## Commands

- `pnpm test` — Playwright e2e tests (`tests/`); also writes `reports/route-evidence.json` for the planner
- `pnpm test:unit` — Vitest unit tests (`src/**/*.unit.test.ts`, `explorer/**/*.unit.test.ts`, `planner/**/*.unit.test.ts`, `builder/**/*.unit.test.ts`)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — `eslint . --ext .ts`
- `pnpm explore` — Explorer Agent CLI (`tsx explorer/cli.ts`); flags `--update`, `--diff`, `--fail-on-new`
- `pnpm plan` — Coverage Planner CLI (`tsx planner/cli.ts`); flags `--update`, `--top <n>`
- `pnpm build-tests` — Builder Engine CLI (`tsx builder/cli.ts`); flag `--top <n>` (default 3); writes drafts to gitignored `tests/generated/`, **pruning previous generations by default** (F10 — `--no-prune` keeps them)
- `pnpm analyze` — Risk Analysis Agent CLI (`tsx analyzer/cli.ts`); classifies `reports/results.json` failures into `reports/analyzer/failure-report.json`; flag `--risk <baseline-map>` additionally risk-scores the diff baseline→current map into `reports/analyzer/risk-report.json`; flags `--results`, `--map`, `--top <n>`
- `pnpm heal` — Selector Healing Agent CLI (`tsx healer/cli.ts`); proposes live-validated fixes for `selector-drift` failures from the failure report into `reports/healer/healing-report.json` (propose-only — never edits specs); flags `--failures`, `--map`, `--no-probe` (offline, candidates unprobed), `--top <n>` (default 3)
- `pnpm learn` — Continuous Learning CLI (`tsx learning/cli.ts`); records the current run (failure report + fresh risk report if any) into the committed `coverage/run-history.json` (idempotent, compacted to `--max-entries`, default 50); pipeline order: `pnpm test` → `pnpm analyze [--risk …]` → `pnpm learn`. Consumed automatically by `pnpm analyze --risk` and `pnpm plan` (override with `--history`)
- `pnpm qa-cycle` — Orchestrator CLI (`tsx orchestrator/cli.ts`); runs the full deterministic cycle test → analyze → learn → heal → plan and writes `reports/orchestrator/qa-cycle-report.json`; flags `--risk <baseline>` (passes to analyze), `--no-probe` (passes to heal), `--update-map` (opts in to `plan --update`, default OFF), `--top <n>`. Exit code = pipeline health, not suite health — a red suite is the report's content
- `pnpm ask "<intención>"` — NL instruction interface (`tsx intent/cli.ts`, B-NL1); resolves natural language against the map's flows (deterministic, explainable) and generates that flow's draft spec via the Builder — bridging the ranking for one targeted request; flags `--flow <id>` (ambiguity follow-up), `--run` (also executes `pnpm test:generated`), `--top <n>`, `--map`. Ambiguous ⇒ top-N list + exit 0; no match ⇒ honest message (incl. the D15 checkout blind spot) + exit 1. Writes drafts WITHOUT pruning (targeted addition — F10's prune belongs to `build-tests`)
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

- **Everything runs on Claude Fable 5** (Jorge's decision, 2026-07-14, reaffirmed at the Phase 9 gate review): analysis, documentation, specs, plans, and implementation. No per-task model splitting.
- The old Opus/Sonnet split (Opus 4.8 for docs/specs/plans, Sonnet 5 for implementation; Fable 5 retired 2026-07-06 after the M9-era doc work) remains **on standby, not deleted** — Jorge will decide if/when to bring it back.
- History for traceability: Fable 5 did doc/spec work through M9, was retired 2026-07-06, and was reinstated for the full cycle on 2026-07-14 starting with Phase 6 (decision log D1, `docs/superpowers/notes/2026-07-14-phase6-decision-log.md`).
