# CLAUDE.md

Antes de cualquier tarea, lee y aplica RIGOR-PROTOCOL.md. Es obligatorio, no opcional.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Playwright + TypeScript QA framework (Page Object / Component Object model) for Bershka's DES e-commerce site, now a full agentic QA platform. Eight sub-projects: the framework foundation (`src/`, `tests/`), the `explorer/` crawler that builds a versioned "functional map", the `planner/` Coverage Planner that annotates the map with execution evidence (drift-aware via run history), the `builder/` Builder Engine that generates navigation specs from the planner's proposals, the `analyzer/` Risk Analysis Agent that classifies run failures and risk-scores map diffs (multi-run failure history), the `healer/` Selector Healing Agent that proposes live-validated fixes for selector-drift failures, the `learning/` Continuous Learning recorder that accumulates cross-run memory in `coverage/run-history.json`, and the `orchestrator/` that runs the whole cycle deterministically (`pnpm qa-cycle`).

## Roadmap & backlog

The platform-level roadmap (10-phase evolution toward the Agentic QA Platform, module evolution, milestone sequence) lives at `docs/roadmap/2026-07-02-platform-roadmap.md`; the complete pending-work backlog at `docs/roadmap/2026-07-02-backlog.md`. Read both before starting any new sub-project — every commit must serve one of the four North Star capabilities (Knowledge, Reasoning, Autonomy, Engineering Excellence), and the roadmap's "Where a fresh session resumes" section names the next candidate milestone.

**Current state (2026-07-21, D15 phase 2 branch):** **D15 phase 2 is COMPLETE on this branch** — checkout in the canonical map (branch C opt-in seed `EXPLORER_SEED_CHECKOUT`, 154 pages/flows, B17 guard intact), `pnpm ask "checkout"` resolves (draft generation deliberately still blocked by the Builder's checkout path guard — Jorge's 2026-07-21 decision, filed as a new backlog item), permanent spec `tests/checkout/checkout-structure.spec.ts` green live (suite 7/7). Full narrative: findings §23's completion section; backlog §D D15. Roadmap remains COMPLETE, no open gate. This line is a pointer, not a re-narration; **replace it wholesale next session**, don't append to it. The roadmap doc's "Where a fresh session resumes" section is the source of truth for history.

## Pending tasks for next session

1. **C11 is DONE (2026-07-17)** — the GitHub self-hosted runner is installed on Jorge's machine (`run.cmd` mode, label `des-vpn`) + the 3 repo secrets created; the first green `qa-cycle` run ran live against DES from Actions ([run 29617369558](https://github.com/jraversbcn21/AIDrivenBSK/actions/runs/29617369558), all steps success). Backlog §C closed. No open action item remains — everything below is optional depth work; confirm with Jorge before starting any of it (standing working agreement). Routing: everything on Fable 5 (Opus/Sonnet split on standby). Read `docs/roadmap/2026-07-02-backlog.md`'s "Where a fresh session resumes" section fresh (it's the live, authoritative list). **The optional CI follow-up is DONE (2026-07-18):** the runner is now a **Windows service** (`NETWORK SERVICE`, delayed auto-start — survives reboots; L-V 07:00 jobs run unattended while the machine is on and the VPN connected). The switch surfaced and fixed two service-account gaps in the live workflows (bash probe → PowerShell, `366175a`; empty Playwright cache hit the corp-proxy cert on first real download → TLS relaxed for that step only, `a9bd57d`), verified green end-to-end (run 29638531264). Details: `docs/ci/github-selfhosted-runner.md` §"Gotchas de la cuenta de servicio".
2. **NEXT SESSION STARTS HERE — execute the D15 phase 2 plan** (`docs/superpowers/plans/2026-07-18-d15-phase2-checkout-inner.md`; scope round already done 2026-07-18, no re-brainstorm needed): use superpowers:subagent-driven-development or superpowers:executing-plans, starting at **Task 1 (live probe — VPN required)**, whose findings-§23 output decides branch C vs B before Tasks 4C/4B. The design doc is `docs/superpowers/specs/2026-07-18-d15-phase2-checkout-inner-design.md`. Jorge deferred execution at the handoff point (2026-07-18); execution mode (subagent-driven vs inline) is still his call at session start.
3. **Other milestone candidates (each needs its own scope round with Jorge):**
   - **`pnpm ask` v1.1** — the LLM resolution seam (mirrors `ClassifierMode`, registered in the B-NL1 design §6) and/or grouping session-twin flows in the ambiguity list (live finding, B-NL1 decision log).
   - **CI depth** — wire `pnpm analyze --risk` into `explore.yml` (needs a baseline-snapshotting decision: v1 requires a caller-supplied baseline map). Healer v2 (proactive drift detection; structured broken-locator data) stays noted in the Phase 7 design, not planned.
4. **Lower-priority, unordered:** **C13** (CI-side flaky tagging — the failure report already surfaces flaky/transient; what remains is a pipeline stage consuming it); cart-cleanup fixture (the shared account's cart accumulates items — findings §7 open lead, cosmetic); the F18 plan-wording nit (cosmetic). **Done 2026-07-14, no longer pending:** F8, F10, D15 phase 1, CI migration to GitHub Actions, B-NL1, dead-code sweep.

## Commands

- `pnpm test` — Playwright e2e tests (`tests/`); also writes `reports/route-evidence.json` for the planner
- `pnpm test:unit` — Vitest unit tests (`src/**/*.unit.test.ts`, `explorer/**/*.unit.test.ts`, `planner/**/*.unit.test.ts`, `builder/**/*.unit.test.ts`)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — `eslint . --ext .ts`
- `pnpm explore` — Explorer Agent CLI (`tsx explorer/cli.ts`); flags `--update`, `--diff`, `--fail-on-new`; env `EXPLORER_SEED_CHECKOUT=on` (opt-in, default OFF) seeds `/es/checkout.html` into the auth session behind `primeCart` (ensures a non-empty cart first; a failed prime skips the seed non-fatally — D15 phase 2, branch C)
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
