# CLAUDE.md

Antes de cualquier tarea, lee y aplica RIGOR-PROTOCOL.md. Es obligatorio, no opcional.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Playwright + TypeScript QA framework (Page Object / Component Object model) for Bershka's DES e-commerce site, now a full agentic QA platform. Eight sub-projects: the framework foundation (`src/`, `tests/`), the `explorer/` crawler that builds a versioned "functional map", the `planner/` Coverage Planner that annotates the map with execution evidence (drift-aware via run history), the `builder/` Builder Engine that generates navigation specs from the planner's proposals, the `analyzer/` Risk Analysis Agent that classifies run failures and risk-scores map diffs (multi-run failure history), the `healer/` Selector Healing Agent that proposes live-validated fixes for selector-drift failures, the `learning/` Continuous Learning recorder that accumulates cross-run memory in `coverage/run-history.json`, and the `orchestrator/` that runs the whole cycle deterministically (`pnpm qa-cycle`).

## Roadmap & backlog

The platform-level roadmap (10-phase evolution toward the Agentic QA Platform, module evolution, milestone sequence) lives at `docs/roadmap/2026-07-02-platform-roadmap.md`; the complete pending-work backlog at `docs/roadmap/2026-07-02-backlog.md`. Read both before starting any new sub-project — every commit must serve one of the four North Star capabilities (Knowledge, Reasoning, Autonomy, Engineering Excellence), and the roadmap's "Where a fresh session resumes" section names the next candidate milestone.

**Current state (2026-07-19, session closed):** **`pnpm ask` v1.1 (session-twin flow grouping) shipped, merged (`dfbd271`) and pushed** — designed, planned and executed same session via subagent-driven-development (3 task-reviewed commits, final whole-branch review clean), live-validated against the committed map. **D15 phase 2 remains PAUSED mid-branch** (worktree `d15-phase2-checkout-inner`, Tasks 1–4.5 done, Task 5 blocked by the `/es/q/` outage); at session close Jorge reported `/q/` responding again — unverified, so the resume health check still applies. Docs deduplicated and synced: the backlog's resume section is now the live prioritized pending list; the roadmap's resume section is the chronological history log. Roadmap remains COMPLETE, no open gate. This line is a pointer, not a re-narration; **replace it wholesale next session**, don't append to it.

## Pending tasks for next session (by priority)

Standing working agreement: confirm with Jorge before starting any of these. Routing: everything on Fable 5 (Opus/Sonnet split on standby). The live, authoritative list is `docs/roadmap/2026-07-02-backlog.md`'s "Where a fresh session resumes" section — read it fresh.

1. **P1 — Resume D15 phase 2** (mid-branch, PAUSED; plan `docs/superpowers/plans/2026-07-18-d15-phase2-checkout-inner.md`; worktree `.claude/worktrees/d15-phase2-checkout-inner`, branch `worktree-d15-phase2-checkout-inner`, HEAD `4731717`). Tasks 1–4.5 done and reviewed clean; Task 5's spec is written (uncommitted) with its checkout signals live-verified; the walk-in was blocked by a sustained `/es/q/` outage (4/4 dead loads across 2026-07-18/19). Jorge reported `/q/` responding again late on 2026-07-19 (manual check, unverified). **First action: verify `/q/` health by re-running `tests/checkout/checkout-structure.spec.ts` once (a home-page curl is NOT enough — home was healthy both times while `/q/` was dead), then Task 5 Step 2 → Task 6 → final review → merge.** If still dead, don't re-litigate the walk-in choice solo — the 4-option decision context is in that worktree's `.superpowers/sdd/progress.md` SESSION HANDOFF section (the authoritative resume state). VPN required.
2. **P2 — `pnpm ask`: LLM resolution seam** (the remaining half of v1.1; the session-twin grouping half is DONE 2026-07-19, merged at `dfbd271`). Mirrors `ClassifierMode`, registered in the B-NL1 design §6. Needs its own scope round.
3. **P3 — CI depth:** wire `pnpm analyze --risk` into `explore.yml` (needs a baseline-snapshotting decision first: v1 requires a caller-supplied baseline map). Healer v2 (proactive drift detection) stays noted in the Phase 7 design, not planned.
4. **P4 — C13:** CI-side flaky tagging — the failure report already surfaces flaky/transient; what remains is a pipeline stage consuming it.
5. **P5 — cosmetic, unordered:** cart-cleanup fixture (the shared account's cart accumulates items — findings §7 open lead); the F18 plan-wording nit.

**Closed, no longer pending** (history lives in the roadmap doc's resume section and the backlog's item entries — not here): C11 + the runner's Windows-service promotion (2026-07-17/18, `docs/ci/github-selfhosted-runner.md`); ask v1.1 session-twin grouping (2026-07-19); the 2026-07-14 sweep (F8, F10, D15 phase 1, CI migration, B-NL1, dead-code sweep).

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
- Package manager is **pnpm** (not pinned in `package.json`, but `pnpm-lock.yaml` confirms it)
- CI is **GitHub Actions** (2026-07-14; `.gitlab-ci.yml` retired): `ci.yml` = offline gates on cloud runners per push; `qa-cycle.yml`/`explore.yml` = live jobs on a **self-hosted runner** (labels `[self-hosted, des-vpn]`, Jorge's machine — cloud runners can't reach DES). Runner setup + C11 closure steps: `docs/ci/github-selfhosted-runner.md`
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
