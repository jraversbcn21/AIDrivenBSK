# CLAUDE.md

Antes de cualquier tarea, lee y aplica RIGOR-PROTOCOL.md. Es obligatorio, no opcional.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Playwright + TypeScript QA framework (Page Object / Component Object model) for Bershka's DES e-commerce site, now a full agentic QA platform. **Nine sub-projects:** the framework foundation (`src/`, `tests/`), the `explorer/` crawler that builds a versioned "functional map", the `planner/` Coverage Planner that annotates the map with execution evidence (drift-aware via run history), the `builder/` Builder Engine that generates navigation specs from the planner's proposals, the `analyzer/` Risk Analysis Agent that classifies run failures and risk-scores map diffs (multi-run failure history), the `healer/` Selector Healing Agent that proposes live-validated fixes for selector-drift failures, the `learning/` Continuous Learning recorder that accumulates cross-run memory in `coverage/run-history.json`, the `orchestrator/` that runs the whole cycle deterministically (`pnpm qa-cycle`), and the `intent/` NL instruction interface (`pnpm ask`) that resolves a natural-language request against the map's flows.

## Roadmap & backlog

The platform-level roadmap (10-phase evolution toward the Agentic QA Platform, module evolution, milestone sequence) lives at `docs/roadmap/2026-07-02-platform-roadmap.md`; the complete pending-work backlog at `docs/roadmap/2026-07-02-backlog.md`. Read both before starting any new sub-project — every commit must serve one of the four North Star capabilities (Knowledge, Reasoning, Autonomy, Engineering Excellence). **Division of labour between the two docs:** the roadmap's "Where a fresh session resumes" section is the *chronological history log*; the backlog's section of the same name is the *live prioritized pending list*. The roadmap is complete — it no longer names a next milestone.

**Current state (2026-08-10):** Suite **25 tests, TRUE desktop, latest full run 22/25 passed / 2 flaky recovered on retry / 1 failed** (search-plp-pdp, both attempts, in a visibly degraded 15.1m DES window with the §24 session-tell in the failure snapshot; analyzer: `timeout/persistent`, consistent with §7's documented class — not chased). Platform in **use-and-maintain, no open queue item**. Landed today (2026-08-10, findings §31): **§29's lead 2 is CONFIRMED and fixed** — the wishlist `.first()` was never anchored to the main product; `isInWishlist()` provably answered "is ANY product on this page in the wishlist" (row-D probe: main product out, one cross-selling card in → `true`). Fix: both wishlist locators scoped to `div.product-detail-info__labels-wishlist` (the main button carries NO test-id — documented CSS-class deviation), `.first()` removed (strict mode re-armed as the ambiguity detector), the ambiguity-hiding `.catch(() => false)` removed (`isVisible()` on 0 matches returns `false` without throwing — verified offline). Validated as a controlled experiment: same row-D probe, one variable changed, answer flipped to `false`; `add-to-wishlist.spec` green first-try in the full suite. Also worth knowing: the §28 drawer noise fired twice more (both checkout specs, both retry-recovered) and the analyzer classifies that message `unknown` — its pattern isn't in the classifier's vocabulary; a candidate backlog item if it keeps recurring. Older context, still current:

1. **This findings doc was split** (commit `771fb5b`): it had crossed the 150k-char auto-import budget, so §1 and §8–§22 (closed milestone reports) moved verbatim to `docs/superpowers/notes/2026-06-17-des-live-validation-findings-archive.md`, which is **not** auto-loaded. The parent keeps a one-line durable takeaway per archived section and every `§N` anchor — ~480 citations across `src/`, `explorer/`, `tests/`, specs and plans point at them, several from source code, so **never renumber a section**. New findings append to the parent; archive the next tranche when it nears the budget again. Its own "How this doc is organised" section is the maintenance rule.

2. **A spec that could not fail was found and fixed** (commit `15e64ed`, findings §29). `add-to-wishlist.spec.ts` asserted a *state* rather than a *transition*, on a shared account that carries wishlist items across runs (§7's no-cleanup lead — **not** cosmetic after all), so a deliberately broken selector passed green twice. Same defect class as §28 one layer up: a `verify` that cannot distinguish "my action worked" from "it was already true", made lethal because `actUntil` swallows the act's error **by design**. Generalise this, don't just read it as one spec's bug: **when writing an `actUntil` verify, ask whether it could bless a no-op**, and prefer asserting transitions with a guaranteed starting state. Platform consequence stated plainly: **a false green is invisible to `analyze` and `heal`** — they only ever see failures, so no classification and no healing proposal is ever produced for a broken selector that a test fails to catch.

One open lead from §29 remains, not blocking: one run passed in 21.8s and is still unexplained (its trace was lost by re-running — §28's own method note, hit live). Note §31's fix makes that mechanism plausible-but-unprovable now: the unanchored locator COULD explain it, but the evidence is gone. §29's other lead (the `.first()` anchoring suspicion) was **confirmed and fixed 2026-08-10 — findings §31**. Also still open from 2026-08-04: the Builder's interaction template emits an **unbounded click**, so a generated interaction spec hangs to the 150s test timeout instead of failing fast (findings §26). Method note that keeps earning its place: every real bug of the last two sessions came from **reading the failure's own `error-context.md`/trace instead of re-running** — and `test-results/` is overwritten by the next run, so read it first.

3. **Coverage expansion round 2** (findings §30, 2026-08-06): suite went 15 → 25 tests, coverage 26 → 38/139 flows (best ever). Standing lesson: **always run the full suite before `pnpm plan --update`** — it only reflects the most recent `pnpm test` invocation's evidence, never accumulated history. The §28 drawer flake is now at 5+ occurrences with the corrected detector: treat as genuine intermittent DES noise.

## Operating mode: use-and-maintain (since 2026-07-21)

There is **no open milestone and no open gate**. The default activity is *using* the platform, not extending it:

- **Regular cycle:** `pnpm qa-cycle` (test → analyze → learn → heal → plan) against DES. Each run feeds `coverage/run-history.json`, which is what makes the analyzer's multi-run failure history and the planner's drift-aware ranking meaningful — they get better with every real run, so run them for real.
- **Targeted requests:** `pnpm ask "<intención>"` for a one-off flow instead of hand-writing a spec.
- **Re-crawl** (`pnpm explore --update`) when DES changes shape — the map is the platform's knowledge base; a stale map degrades every downstream agent. **Budget ~35-40 min** for a full 150-page/session crawl and pass `EXPLORER_TIME_BUDGET_MS=1200000`: the M6 PLP-grid fix added a deliberate per-page settle wait (~3.5-5s), so crawls are slow by design — that cost buys the grid knowledge, don't "optimize" it away without reading findings §10.
- **Maintenance work is pull-based:** the backlog below is a *menu*, not a queue. Pick an item when real usage produces evidence that it hurts — not to empty the list.

## Pending tasks — revisit when the platform has more real run data

Standing working agreement: confirm with Jorge before starting any of these. Each entry names **the evidence that would justify starting it**. The full item detail lives in `docs/roadmap/2026-07-02-backlog.md`'s "Where a fresh session resumes" section — read it fresh rather than trusting this summary.

0. **P0 — SEEDED RE-CRAWL: DONE (2026-07-30, later — map commit `3b901bf`).** Checkout flow restored to the desktop map; `pnpm ask "checkout"` resolves again. Detail in the backlog's P0 entry and findings §24's seeded note (including the new checkout-inventory observation). The queue is empty again — everything below is menu.
1. **`pnpm ask`: LLM resolution seam** — *start when:* real usage shows the deterministic resolver mis-resolving or returning no-match on intentions Jorge considers reasonable. Collect the failing phrasings first; they become the seam's test corpus. (The session-twin-grouping half shipped 2026-07-19, `dfbd271`.)
2. **CI depth — `pnpm analyze --risk` in `explore.yml`** — *start when:* enough crawls have accumulated that map drift between runs is a real question. Blocked on a design decision regardless: v1 needs a caller-supplied baseline map (no automatic snapshotting).
3. **C13 — CI-side flaky tagging** — *start when:* the failure reports show a recurring flaky set worth acting on in the pipeline. The analyzer already classifies flaky/transient; only the consuming stage is missing.
4. **Low-priority, unordered:** checkout draft generation vs the Builder's `CHECKOUT_ROUTE` guard (needs `test.skip(!env.checkoutAllowed)` in the template first — its own scope round); per-path interaction disable for seeded checkout crawls + `tramitar` in the destructive regex (pairs with the previous item); D15 phase 3 (payment-step capture — hypothetical, parked); cart-cleanup fixture (findings §7); the F18 plan-wording nit; **desktop PLP filter/sort viewport gap (new 2026-07-30)** — the crawler can't click PLP filter/sort controls on desktop (outside-viewport/timeout skips, findings §24), so PLP overlay knowledge is thinner than mobile's; plus the Builder interaction-template's unbounded click (confirmed defect, findings §26); **analyzer vocabulary gap (new 2026-08-10)** — the §28 drawer-noise message (`confirmation drawer never appeared`) classifies as `unknown` because no classifier pattern matches it; worth adding a pattern if it keeps recurring (5+ occurrences so far, always retry-recovered). ~~Wishlist locator anchoring~~ — **RESOLVED 2026-08-10 (findings §31):** the suspicion was confirmed live via a discriminating-state probe and fixed by scoping both locators to the main product's panel; the cart-cleanup fixture (§7) remains open as the same root problem for a different surface — the shared account carrying state across runs is a proven source of false greens.

**Closed, not pending** (detail in the roadmap's history log and the backlog's item entries — deliberately not re-narrated here): D15 phases 1 & 2, C11 + the runner's Windows-service promotion, `pnpm ask` v1 and v1.1 session-twin grouping, the 2026-07-14 maintenance sweep (F8, F10, F3, CI migration, dead-code sweep), F18, B17, A5, A6.

## Commands

- `pnpm test` — Playwright e2e tests (`tests/`); also writes `reports/route-evidence.json` for the planner
- `pnpm test:unit` — Vitest unit tests (`src/**/*.unit.test.ts`, `explorer/**/*.unit.test.ts`, `planner/**/*.unit.test.ts`, `builder/**/*.unit.test.ts`)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — `eslint . --ext .ts`
- `pnpm explore` — Explorer Agent CLI (`tsx explorer/cli.ts`); flags `--update`, `--diff`, `--fail-on-new`; env `EXPLORER_SEED_CHECKOUT=on` (opt-in, default OFF) seeds `/es/checkout.html` into the auth session behind `primeCart` (ensures a non-empty cart first; a failed prime skips the seed non-fatally — D15 phase 2, branch C); env `EXPLORER_DEVICE` (default `desktop`) appends DES's server-side layout param `device=<value>` to every crawl navigation — empty string disables it (server default = MOBILE layout; findings §24 — the team tests desktop, so don't disable it without a reason)
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

That doc is auto-loaded and has a **150k-char budget**, so closed milestone reports (§1, §8–§22) were split out on 2026-08-06 into `docs/superpowers/notes/2026-06-17-des-live-validation-findings-archive.md` — **not** auto-loaded, read it on demand. The parent keeps a one-line durable takeaway per archived section, and the `§N` anchors are preserved (~480 citations across `src/`, `explorer/`, `tests/`, specs and plans point at them — never renumber a section). New findings are appended to the parent, not the archive; when the parent nears the budget again, archive the next tranche of closed reports rather than deleting anything.

**The suite tests DES's DESKTOP layout** (the team's target since findings §24): enforcement lives in `src/support/layout.ts` — `forceDesktopLayout(context)` rewrites every same-origin document request to carry `device=desktop` at the context level (NOT `BasePage.goto()` — a URL-append there proved insufficient because in-page clicks reload without the param), installed by `src/fixtures/test.ts` and `auth.setup`; `assertDesktopLayout(page)` guards every passing test against a silent mobile fallback. Selectors are dual-layout (mobile names kept — the divergence table is in findings §24's closing subsection).

The driver.js onboarding tour is suppressed **preventively**, not reactively: `BasePage.goto()` pre-seeds a `bsk_onboarding` cookie (`suppressOnboardingTour` in `consent.ts`) before every navigation, so the tour never fires. `dismissOnboardingTour` (Escape key) still exists as a fallback in call sites — don't remove it, but don't rely on it as the primary defense either.

**Interaction reliability (the rule):** on DES, *every state-changing interaction must act→verify→retry* — elements become visible before Vue attaches their handlers, so fire-once clicks/keypresses are silently lost (confirmed live for the search Enter, the size-selection click, and card opens; all fixed that way in `SearchBar`, `ProductPage`, `ProductCard`). Two environment facts constrain recovery design: `/es/q/{term}` is **not server-routable** (a reload lands on home — never reload the results page; re-run the search via UI instead, which the test-level `retries: 1` does), and DES pre-prod intermittently serves dead `/q/` loads and degraded app shells (untranslated or empty-`<main>` states). The suite runs `workers: 1` on purpose (one shared account; parallel runs failed 6/6). Residual intermittent failures under sustained repeated runs are characterized as environment noise in findings doc §7 (2026-07-02) — read that section, including the open nav-dialog lead and the missing cart-cleanup fixture, before touching any of this.

## Repo etiquette

Commit messages follow Conventional Commits: `type(scope): description` (e.g. `fix(search/cart): ...`, `feat(explorer): ...`). Common scopes: `explorer`, `planner`, `builder`, `foundation`, `search/cart`.

## Model routing policy (working method)

**Jorge switches models as the need dictates** (his decision, 2026-07-21). There is no fixed routing table and no model assigned to a task type — he picks per stretch of work, mid-session if it helps, and that choice is his alone.

What this means in practice:

- **Never infer the model from this file, and never announce or assume one.** Whatever is running is what Jorge selected; work with it.
- **Never treat a past routing decision as binding** — the superseded ones (Fable 5 for everything from 2026-07-14; before that an Opus-for-docs/Sonnet-for-implementation split) are history, not policy. Don't "restore" them.
- **The quality bar does not move with the model.** RIGOR-PROTOCOL.md applies identically whichever one is active — it is a reasoning method, not a model setting.
- If a task genuinely seems better suited to a different model (e.g. a very large context, or a long mechanical pass), say so once as a suggestion and continue with the current one. Do not stall waiting for a switch.

Historical trace, for reading old decision logs only: Fable 5 did doc/spec work through M9, was retired 2026-07-06, was reinstated for the whole cycle on 2026-07-14 (decision log D1, `docs/superpowers/notes/2026-07-14-phase6-decision-log.md`), and the fixed-routing framing ended on 2026-07-21 — the 2026-07-21 session itself ran across Fable 5, Sonnet 5 and Opus 4.8.
