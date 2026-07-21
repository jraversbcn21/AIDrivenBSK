# CLAUDE.md

Antes de cualquier tarea, lee y aplica RIGOR-PROTOCOL.md. Es obligatorio, no opcional.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Playwright + TypeScript QA framework (Page Object / Component Object model) for Bershka's DES e-commerce site, now a full agentic QA platform. **Nine sub-projects:** the framework foundation (`src/`, `tests/`), the `explorer/` crawler that builds a versioned "functional map", the `planner/` Coverage Planner that annotates the map with execution evidence (drift-aware via run history), the `builder/` Builder Engine that generates navigation specs from the planner's proposals, the `analyzer/` Risk Analysis Agent that classifies run failures and risk-scores map diffs (multi-run failure history), the `healer/` Selector Healing Agent that proposes live-validated fixes for selector-drift failures, the `learning/` Continuous Learning recorder that accumulates cross-run memory in `coverage/run-history.json`, the `orchestrator/` that runs the whole cycle deterministically (`pnpm qa-cycle`), and the `intent/` NL instruction interface (`pnpm ask`) that resolves a natural-language request against the map's flows.

## Roadmap & backlog

The platform-level roadmap (10-phase evolution toward the Agentic QA Platform, module evolution, milestone sequence) lives at `docs/roadmap/2026-07-02-platform-roadmap.md`; the complete pending-work backlog at `docs/roadmap/2026-07-02-backlog.md`. Read both before starting any new sub-project — every commit must serve one of the four North Star capabilities (Knowledge, Reasoning, Autonomy, Engineering Excellence). **Division of labour between the two docs:** the roadmap's "Where a fresh session resumes" section is the *chronological history log*; the backlog's section of the same name is the *live prioritized pending list*. The roadmap is complete — it no longer names a next milestone.

**Current state (2026-07-21, session closed):** **D15 phase 2 is DONE and MERGED** (`28a080d`, pushed) — checkout is in the canonical map (opt-in seed `EXPLORER_SEED_CHECKOUT`, 154 pages/flows, B17 guard intact), `pnpm ask "checkout"` resolves, and `tests/checkout/checkout-structure.spec.ts` is green live (suite 7/7, zero retries). Final whole-branch review: zero Critical. **With that, every roadmap phase AND the last real coverage gap are closed, so the project moves to `use-and-maintain` mode** (Jorge's decision, 2026-07-21): run the platform against DES as normal QA work and let real usage decide what gets built next — see "Operating mode" below. Full narrative: findings §23's completion section; backlog §D. This line is a pointer, not a re-narration; **replace it wholesale next session**, don't append to it.

## Operating mode: use-and-maintain (since 2026-07-21)

There is **no open milestone and no open gate**. The default activity is *using* the platform, not extending it:

- **Regular cycle:** `pnpm qa-cycle` (test → analyze → learn → heal → plan) against DES. Each run feeds `coverage/run-history.json`, which is what makes the analyzer's multi-run failure history and the planner's drift-aware ranking meaningful — they get better with every real run, so run them for real.
- **Targeted requests:** `pnpm ask "<intención>"` for a one-off flow instead of hand-writing a spec.
- **Re-crawl** (`pnpm explore --update`) when DES changes shape — the map is the platform's knowledge base; a stale map degrades every downstream agent. **Budget ~35-40 min** for a full 150-page/session crawl and pass `EXPLORER_TIME_BUDGET_MS=1200000`: the M6 PLP-grid fix added a deliberate per-page settle wait (~3.5-5s), so crawls are slow by design — that cost buys the grid knowledge, don't "optimize" it away without reading findings §10.
- **Maintenance work is pull-based:** the backlog below is a *menu*, not a queue. Pick an item when real usage produces evidence that it hurts — not to empty the list.

## Pending tasks — revisit when the platform has more real run data

Standing working agreement: confirm with Jorge before starting any of these. Each entry names **the evidence that would justify starting it**, since none is urgent today. The full item detail lives in `docs/roadmap/2026-07-02-backlog.md`'s "Where a fresh session resumes" section — read it fresh rather than trusting this summary.

1. **`pnpm ask`: LLM resolution seam** — *start when:* real usage shows the deterministic resolver mis-resolving or returning no-match on intentions Jorge considers reasonable. Collect the failing phrasings first; they become the seam's test corpus. (The session-twin-grouping half shipped 2026-07-19, `dfbd271`.)
2. **CI depth — `pnpm analyze --risk` in `explore.yml`** — *start when:* enough crawls have accumulated that map drift between runs is a real question. Blocked on a design decision regardless: v1 needs a caller-supplied baseline map (no automatic snapshotting).
3. **C13 — CI-side flaky tagging** — *start when:* the failure reports show a recurring flaky set worth acting on in the pipeline. The analyzer already classifies flaky/transient; only the consuming stage is missing.
4. **Low-priority, unordered:** checkout draft generation vs the Builder's `CHECKOUT_ROUTE` guard (needs `test.skip(!env.checkoutAllowed)` in the template first — its own scope round); per-path interaction disable for seeded checkout crawls + `tramitar` in the destructive regex (pairs with the previous item); D15 phase 3 (payment-step capture — hypothetical, parked); cart-cleanup fixture (findings §7); the F18 plan-wording nit.

**Closed, not pending** (detail in the roadmap's history log and the backlog's item entries — deliberately not re-narrated here): D15 phases 1 & 2, C11 + the runner's Windows-service promotion, `pnpm ask` v1 and v1.1 session-twin grouping, the 2026-07-14 maintenance sweep (F8, F10, F3, CI migration, dead-code sweep), F18, B17, A5, A6.

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
- `pnpm ask "<intención>"` — NL instruction interface (`tsx intent/cli.ts`, B-NL1); resolves natural language against the map's flows (deterministic, explainable) and generates that flow's draft spec via the Builder — bridging the ranking for one targeted request; flags `--flow <id>` (ambiguity follow-up), `--run` (also executes `pnpm test:generated`), `--top <n>`, `--map`. Ambiguous ⇒ top-N list (session-twin flows grouped into one entry, v1.1) + exit 0; no match ⇒ honest message + exit 1. **Checkout intents now RESOLVE** (D15 phase 2 put a Checkout flow in the map, 2026-07-21) — the old blind-spot answer only fires for flows genuinely absent from the map. Note the Builder still refuses to *generate* a checkout draft (`CHECKOUT_ROUTE` path guard, deliberate) so `pnpm ask "checkout"` resolves and then exits 1 on generation — expected, not a bug. Writes drafts WITHOUT pruning (targeted addition — F10's prune belongs to `build-tests`)
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

- **Default: everything on Claude Fable 5** (Jorge's decision, 2026-07-14, reaffirmed at the Phase 9 gate review): analysis, documentation, specs, plans, and implementation. No per-task model splitting.
- The old Opus/Sonnet split (Opus 4.8 for docs/specs/plans, Sonnet 5 for implementation) remains **on standby, not deleted** — Jorge will decide if/when to bring it back.
- **Observed 2026-07-21:** Jorge ran one session across Fable 5 → Sonnet 5 → Opus 4.8 (1M context), switching per stretch of work rather than per task type. The "no per-task splitting" default above is unchanged as a *policy*, but treat the model in use as Jorge's live choice, not something to infer from this file.
- History for traceability: Fable 5 did doc/spec work through M9, was retired 2026-07-06, and was reinstated for the full cycle on 2026-07-14 starting with Phase 6 (decision log D1, `docs/superpowers/notes/2026-07-14-phase6-decision-log.md`).
