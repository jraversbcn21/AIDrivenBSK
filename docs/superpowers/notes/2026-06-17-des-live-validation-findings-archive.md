# DES Live-Validation Findings — Archive (§1, §5, §8–§23, §25–§30, §32–§35, §37)

**Split out of [`2026-06-17-des-live-validation-findings.md`](./2026-06-17-des-live-validation-findings.md) on 2026-08-06.** The parent doc is `@`-imported by `CLAUDE.md` and had crossed its 150k-char budget; these sections were moved here **verbatim, unedited**.

**Second tranche, 2026-08-16 (§5, §23, §25, §30).** The parent had grown back to ~136k/150k. Same rule, same verbatim move: §5 and §23 are MOBILE-layout captures that §24 supersedes, §25's fix was refuted and replaced by §31, and §30 is a closed coverage-expansion milestone whose one durable rule now lives in `CLAUDE.md`. Sections are kept in numeric order, so this tranche is interleaved rather than appended.

**What is here:** closed milestone reports — work that shipped, bugs that are fixed, backlog items that are closed. Each one's durable takeaway is summarised in the parent doc's "Archived sections" table, which also preserves the `§N` anchors (~480 citations across `src/`, `explorer/`, `tests/`, specs and plans point at them).

**How to use it:** consult the parent doc first. Come here when you need the *evidence behind* a takeaway — the live measurements, the raw aria dumps, the reproduction steps, the rejected hypotheses. Nothing here was rewritten to look tidier in hindsight, so a claim dated before 2026-08-02 was measured on DES's **MOBILE** layout (see §24 in the parent doc).

**Do not append new sections here.** New findings go at the end of the parent doc; sections arrive here only when they stop describing current behaviour.

---
## 1. What was validated live ✅ (merged)

Running `pnpm exec playwright test --project=setup` and `--project=chromium` against DES:

- **`auth.setup` (login) — PASS** (~32s)
- **`login.spec` — PASS**
- `search-plp-pdp.spec`, `add-to-cart.spec` — still failing (see §5).

The login fixes are merged to `master`. Files changed: `src/support/consent.ts`, `src/pages/LoginPage.ts`, `src/components/Header.ts`, `src/config/environments.ts`, `tests/auth.setup.ts`.

---

## 5. Search/Cart — selectors confirmed live (2026-06-17, second pass)

All real selectors below were confirmed live against DES (accessibility-tree probing + screenshots) and are now implemented in `SearchBar`, `Header`, `FiltersPanel`, `ProductCard`, `ProductPage`, `MiniCart`, `SearchResultsPage`. Unit suite (76 tests), `typecheck`, and `lint` all pass; `login.spec` and the search/cart specs each pass **in isolation**.

**Confirmed flow.** ⚠ *Mobile-layout capture (2026-06-17). The suite tests DESKTOP since §24 — the search trigger, search input, filters and add-to-cart flow all diverge there; read §24's closing divergence table before using any selector below.*
1. Search trigger is `getByRole('button', { name: 'Buscar', exact: true })` (not the icon-only "Buscar en tienda" — that one stayed `--hidden` the whole time and wasn't needed). It's CSS hover-revealed, so Playwright needs `force: true`, retried against a wall-clock deadline (Vue hydration lag observed anywhere from ~1s to >20s).
2. The opened input has no role (`bds-input` shadow-DOM component) — use `getByPlaceholder('Escribe aquí')`.
3. Submitting lands on `/es/q/{term}` (no `searchResult.html?q=`-style shortcut exists).
4. PDP URL pattern is **`-c0p<digits>.html`** (not `-p<digits>.html` — the original placeholder regex was wrong; fixed in `explorer/url.ts` too).
5. Filters: "Filtrar" opens a `role=dialog` drawer (heading "Filtrar", no accessible dialog name) with a "Con descuento" checkbox + "Ver resultados" button to apply.
6. Add-to-cart is a **two-step dialog**, not a single click: clicking "Añadir a cesta" opens a `dialog` named "Tallas…" with `button "Talla {size}"` options; clicking a size both selects it **and** completes the add (no separate confirm step).
7. There is **no mini-cart drawer** — "Ir a la cesta" navigates to the full `/es/shop-cart.html` page. Item count is read from the `tab "Cesta (N)"` label (cart-page content itself renders as a slow skeleton — the tab count is the fast, reliable signal).

**driver.js onboarding popover** ("TU ESPACIO MMBRS, TU CUENTA") is the main remaining blocker: it appears asynchronously (observed ~5s after load) and intercepts clicks at fixed screen coordinates even with `force: true`. `dismissOnboardingTour(page)` (Escape if `.driver-overlay` is present) was added to `consent.ts` and is called defensively before every click in `SearchBar`, `FiltersPanel`, `ProductCard`, `Header.openMiniCart`, and `ProductPage.addToCart`.

**Known flakiness at the time (fully resolved — see §7):** the two specs above passed alone but failed intermittently in the full suite run. The original hypothesis (a fresh `auth.setup` session triggering more persistent onboarding-tour behavior than a reused one) was investigated directly and found **wrong** — see §7 for the real root cause (a cookie-gated tour, unrelated to session freshness) and the eventual full resolution.

---

---

## 8. Structural finding for the Explorer Agent (important)

DES is built with **`bds-` web components (Shadow DOM)**. Playwright locators pierce shadow DOM (so the foundation works), **but the Explorer's analyzer uses `page.content()` (light DOM only)** — it will miss most interactive content on this site. Before running the Explorer live against DES, revisit its extraction strategy (e.g. drive extraction from the accessibility tree / `ariaSnapshot`, or Playwright-locator-based enumeration, instead of `page.content()`). Tracked as a follow-up to the Explorer sub-project.

**2026-07-02 — resolved (M2 DES-readiness) and first live crawl completed:**

Extraction moved to `locator('body').ariaSnapshot()` (default `EXPLORER_EXTRACTION=aria`; the `page.content()`/linkedom path survives as `EXPLORER_EXTRACTION=dom` for offline tests). Two real bugs were found and fixed during the *first-ever* live run of the crawler (it had never been executed against a browser before this session, only unit-tested offline):

1. **Missing `baseURL` on the crawler's browser context** — `browser.newContext()` never received it, so `page.goto(item.path)` (a bare path like `/es/`) failed as "Cannot navigate to invalid URL." Fixed in `explorer/cli.ts` by passing `baseURL: env.baseURL` for both anon and auth contexts.
2. **Redirect-based duplicate crawling** — the `Frontier` deduped on the *requested* path only. DES redirects the gender gate server-side, so two different queued seeds (`/` and `/es`) both resolved to `/es/h-woman.html`; each visit's extraction then re-discovered the same gate link and re-enqueued it, producing 5 duplicate map entries for one real page in a 25-page test crawl. Fixed by exposing `Frontier.markSeen(session, path)` and having `crawlSession` re-check the *resolved* path against the same seen-set whenever it differs from the requested one.

After both fixes, a 152-page bounded crawl (`EXPLORER_MAX_PAGES=80`, both sessions) produced **152 unique pages, 2499 real elements, 0 duplicates, 0 errors** — a large, real improvement over the light-DOM path, which saw almost nothing on this shadow-DOM site.

**Residual gap found in this first crawl — RESOLVED, see §10 below (2026-07-03):** PLP/category pages (e.g. `/es/mujer/ropa/camisetas-n4365.html`) never triggered `ProductCard`/grid detection in this first crawl — every non-landing page classified as `Other`, 0 `-c0p` route patterns found among 152 pages. Live probing during this session found two compounding causes:
- **PLP grid hydration is slower than the ~5s search-results grid** (findings §7): a probe found 0 product links in the DOM at +0/+3/+6s, appearing only around +10s. The crawler extracts immediately after `domcontentloaded` + `acceptConsent()`, with no wait for grid hydration — so PLP pages are very likely extracted before their product grid renders.
- **Direct deep-linking to a category URL intermittently re-triggers the gender-selection gate**, even with a valid `storageState` — inconsistent across otherwise-identical probe runs (matches the general DES pre-prod flakiness pattern in §7, not a bug in the crawler itself).
- Not yet isolated: whether DES's PLP grid, once hydrated, is exposed to the accessibility tree the same way the `/es/q/{term}` search-results grid is (confirmed working via `getByRole('main').getByRole('listitem')` in §5) — a probe that *did* find 10 `-c0p` DOM links via `page.locator(...).count()` still produced a nearly-empty `ariaSnapshot()` immediately after, which needs more investigation before concluding root cause.
- **Next step:** add a bounded post-navigation settle wait (or a content-based poll, mirroring `SearchBar`'s pattern) before extracting on pages likely to contain a product grid, then re-probe with `ariaSnapshot()` to confirm whether the grid becomes visible to the accessibility tree once hydrated. Do not chase this by increasing crawl bounds/timeouts blindly — confirm the mechanism first.

**Fixtures captured:** `explorer/__fixtures__/home.aria.txt` and `category-gate.aria.txt` — real anonymous-session `ariaSnapshot()` output (reviewed for PII before committing; none found), to ground future extractor changes in real DES output instead of only synthetic fixtures.

**First canonical map committed:** `coverage/functional-map.json`, environment `des`, both sessions, from the 152-page bounded crawl above.

**2026-07-02 (later) — flow synthesis (M4) refresh, live-confirmed clean:** after `MapFlow.steps` changed to carry full navigation chains (schema 1.1 — see `docs/superpowers/specs/2026-07-02-flow-synthesis-design.md`), a fresh live re-crawl produced 152 pages / 152 flows (74 of them real multi-step chains, up to 4 hops), zero cross-session steps, zero errors. One VPN drop mid-crawl during this work silently overwrote the good committed map with an empty one before the fix landed — `pnpm explore --update` now refuses to write a 0-page map (see `explorer/cli.ts`); the good map was restored from git and the guard added. The PLP-grid gap above is still open and unrelated to this fix.

---

## 9. Coverage Planner live validation (2026-07-03, M5b)

First live run of the full evidence→annotation pipeline (`pnpm test` → `pnpm plan --update`), against the committed 152-flow map. Suite green on first attempt (4/4 in 1.6m, `workers: 1`, no retries needed).

**Evidence quality — good.** `reports/route-evidence.json` contained exactly 3 entries (one per spec; `auth.setup.ts` correctly absent — it uses the raw base test, by design). URL trails are plausible and complete: login shows home→gate→logon(×5 SPA re-navigations, collapsed by the matcher)→member-hub; add-to-cart shows the full home→gate→`/q/camiseta`→PDP(`-c0p227229879`)→shop-cart chain; search-plp-pdp shows the filtered `?discount=1` step. The `routeEvidence` auto-fixture added no measurable overhead.

**Coverage result — 3/152 flows covered.** Lower than the plan's optimistic expectation ("login, search→PLP→PDP and add-to-cart cover their flows"), and the reasons are all *map-completeness gaps*, not planner bugs:

- Covered (all `auth`-session single-step flows): `/es/h-woman.html` (by all 3 specs), `/es/shop-cart.html` (add-to-cart), `/es/member-hub.html` (login).
- The map has **no** `/es/logon.html`, `/es/q/{term}`, or `-c0p{id}` PDP flows to match: the crawler is link-following, `/q/` results exist only behind a typed search (and aren't server-routable, §7), and PDPs are missing because of the open PLP-grid extraction gap (§8). The suite demonstrably walks these routes — the evidence has them — but the map doesn't know them yet.
- The `anon`-session multi-step chains (e.g. `/ → /es/h-woman.html → /es/shop-cart.html`) all root at `/`, which the specs never visit (they start at the `/es/` locale root per `BASE_URL`), so their first step never matches. The session-v1 "both variants annotate" simplification behaved as designed — it applies to identical chains, and these chains differ.

**Verified on the annotated map:** `schemaVersion: "1.2"`, all 152 flows carry `coveredBy` (149 empty = evaluated, uncovered), covered flows reference real spec paths. The empty-evidence guard and the missing-file fail-fast were both exercised (the latter before the first `pnpm test` run).

**Consequence for the roadmap:** the planner's proposals currently rank low-priority sitemap/category chains at the top simply because the high-value journeys (search→PDP→cart) aren't in the map to be proposed. Closing the Explorer's PLP-grid gap (§8) — and eventually interaction-based discovery for `/q/` — is now what most improves the *usefulness* of coverage numbers and proposals, and should be weighed accordingly when scoping M6+.

---

## 10. PLP-grid extraction gap — root cause found and fixed (2026-07-03)

Followed up directly on §8's open lead ("PLP grid hydration slower than search results; not yet isolated whether the aria tree exposes it once hydrated"). Root cause investigation (systematic-debugging skill) found **two distinct, compounding bugs**, both now fixed and live-validated.

**Bug 1 — extraction ran before the grid hydrated, with no settle wait.** `crawlSession` extracted immediately after `page.goto(..., {waitUntil:'domcontentloaded'})` + `acceptConsent()` — confirmed live via direct probing (`page.locator('body').ariaSnapshot()` at +0/+3/+6/+10/+15s) that a fresh single-navigation page renders its product grid (`-c0p` links inside `listitem` nodes) within ~1-2s, cleanly and reproducibly — **resolving §8's open question**: yes, the aria tree does faithfully expose the hydrated grid.

**A second, sneakier layer surfaced when reproducing the crawler's real conditions** (same `page`/context reused across several prior navigations, matching `crawlSession`'s loop exactly, not a fresh single-navigation probe): the aria snapshot holds a **false-stable plateau** — unchanged for ~2-3s in a "shell rendered, grid not yet fetched" state — before transitioning and settling with real content by ~4-6s. Reproduced deterministically twice, identical timing both times. A naive "stop as soon as two consecutive reads are identical" poll locks onto that shell plateau and declares victory before the grid ever arrives — this is why an initial `waitForSettle` implementation using pure stability-diffing still measured 0 PLP pages / 0 `-c0p` routes at crawl scale, despite working perfectly on the isolated fresh-page probe.

**Fix:** `explorer/crawl/settle.ts`'s `waitForSettle` gained a `minWaitMs` floor (`DEFAULT_SETTLE = { minWaitMs: 3500, pollIntervalMs: 500, maxWaitMs: 10000 }`) — wait out the floor *before* taking the first snapshot, skipping past the known plateau, then do the same 2-consecutive-identical-reads check. Wired into `crawlSession` right after `acceptConsent()`, gated to `extraction === 'aria'` (the `dom` mode is offline-only, doesn't use `ariaSnapshot()`). Unit-tested with an injectable clock (mirrors `Frontier`'s existing `now: () => number` pattern) covering: stabilizes-after-plateau, never-stabilizes/gives-up-at-ceiling, already-stable, and the specific floor-skips-a-false-plateau case reproducing the live shape.

**Bug 2 — classifier priority bug, discovered as a direct consequence of Bug 1's fix working.** Once grids were actually visible to extraction, `RuleClassifier` started mislabeling real PLP/category pages as **PDP**: DES's grid cards each carry their own per-card "Añadir a la cesta {product}" quick-add button, and category pages often mention "talla" somewhere incidental (e.g. a size-guide link) — together these satisfied the PDP rule (`hasAddToCart && hasSizeSelector`), which was checked *before* the PLP rule (`hasProductGrid && hasFilters`). This bug was latent and undetectable before Bug 1's fix, since PLP pages were previously extracted as empty `Other` pages with no elements at all. **Fix:** reordered `RuleClassifier` to check the more specific PLP signal first (`explorer/classify/RuleClassifier.ts`); added a regression test with all four signals true simultaneously, asserting PLP wins.

**Live validation (bounded 40-pages/session crawls, both fixes):**
- Before either fix: 72 pages crawled, 70 classified `Other`, 0 PLP, 0 `-c0p` routes.
- After Bug 1's fix alone: 46 PLP, but 15 real category pages misclassified `PDP` (Bug 2 exposed).
- After both fixes: **59 PLP**, 1 residual `Other` (a single page where the best-effort settle wait didn't catch up in time — accepted as environment noise, not chased further per "don't blindly increase timeouts"), 1 pre-existing unrelated edge case (`/es/shop-cart.html` auth session occasionally classifies `PDP` instead of `Other`/`Cart` — not caused by either fix, not investigated further, noted as a small open lead below).
- The specific page probed by hand throughout this investigation (`/es/mujer/ropa/camisetas-n4365.html`) now consistently classifies `PLP` with `FiltersPanel`+`ProductCard` components and 10 real product elements.

**Cost:** the `minWaitMs` floor adds real, uniform per-page latency (measured: ~10 min wall-clock for a 72-page/both-sessions bounded crawl, ~8.3s/page average including navigation, consent, and the floor+poll). `EXPLORER_TIME_BUDGET_MS`'s default (600_000ms/10min per session) no longer comfortably covers an 80-page/session crawl at this cost (≈664s bare minimum, no margin) — bumped to `1200_000` (20 min) in `.gitlab-ci.yml`'s `explore` job and used explicitly for the live full re-crawl in this session. This is a deliberate, evidence-based trade-off (better knowledge per page, slower crawl), not a blind timeout increase — consistent with the project's existing precedent (`HYDRATION_TIMEOUT_MS`, `retries: 1`, the 150s DES test budget).

**Open lead — resolved, see §13 (2026-07-04):** `/es/shop-cart.html` (auth session) occasionally classified as `PDP` instead of `Other`/a dedicated `Cart` type. B13's deterministic path rules (`shop-cart.html`/`/cart`/`/cesta` → `Cart`, checked before any text signal) close this for good — `shop-cart.html` now classifies `Cart` in both sessions regardless of line-item add-to-cart language.

**Third classifier bug found at full scale (2026-07-02/03 full 152-page re-crawl), NOT fixed this session — tracked, not blind-patched:** at full crawl scope (80 pages/session), 16 of 19 genuinely-crawled `-c0p` PDP pages classify as **`Checkout`** instead of `PDP`. Root cause confirmed via direct element inspection: real PDPs never expose a visible "talla" (size) signal to passive crawling — per §5, the size selector only exists inside the "Tallas…" dialog opened by clicking "Añadir a cesta", which the crawler never clicks (link-following only, backlog B9). So `hasAddToCart` fires but `hasSizeSelector` never does, the PDP rule (`hasAddToCart && hasSizeSelector`) never matches, and the page falls through to the much looser `hasCheckoutSteps` regex (`/pago|checkout|envío|shipping|payment/` over any page text), which matches ordinary PDP boilerplate (a "Envíos y devoluciones" accordion, present on every product page). **Deliberately not fixed now**: the obvious quick fix (drop the `hasSizeSelector` requirement from the PDP rule, since PLP is already checked first and wins) was considered but rejected without live confirmation — Cart pages may carry similar add-to-cart-adjacent language (see the open lead just above), and loosening the PDP rule could turn that already-observed Cart/PDP edge case into a systematic mislabeling instead of a rare one. This needs its own root-cause pass (ideally informed by opening the size dialog interactively, tying into backlog B9's "nav menus/overlays" gap) rather than a guess. **Impact on the map just committed:** the affected pages' `path`/`routePattern`/elements are still fully correct — only the `pageType` label and the flow's `type` field are wrong for these 16 pages (labeled `Checkout` instead of `PDP`). Given D15 flags Checkout as the highest-risk flow type, a future Coverage Planner run or human reading `pageType: Checkout` should not assume these are real checkout journeys without checking the path first.

---

## 11. Builder Engine (M6b) live validation: testId/`locate()` mismatch found and worked around (2026-07-03)

First live run of the Builder Engine's generated navigation specs (`pnpm build-tests --top 3` → `pnpm test:generated` against DES). Full offline pipeline (unit tests, typecheck, lint, an offline smoke generation against the real committed map) was clean going in — this section covers what live execution found.

**First attempt: 3/3 generated specs failed, consistently, both retry attempts (6/6 failures).** All three journeys walked their chain correctly (confirmed via each failure's Playwright ARIA snapshot: the real leaf PDP had loaded — correct title, correct "Añadir a cesta" button visible, correct product images) but `expect.poll(() => target.isLoaded())` timed out after 20s on all three. Root cause, confirmed by direct code inspection (not guessed):

- `builder/select.ts`'s `loadedSignalFor` picked a `testId`-based `Strategy` (`{ testId: 'addToCartSizeBtn' }`, the same value for all three leaf pages) as the highest-priority loaded-signal, per the framework's stated selector priority (testId → role → label → placeholder).
- `explorer/extract/enrichTestIds.ts` records `selectorHints.testId` from whichever of `data-testid`, `data-qa-anchor`, or `data-qa` it finds first on the live DOM — **without recording which attribute matched**.
- `src/support/locators.ts`'s `locate()` always resolves a `testId` `Strategy` via Playwright's `getByTestId()`, which by default only matches the `data-testid` attribute — **not** `data-qa-anchor` or `data-qa`.
- Net effect: a testId hint sourced from `data-qa-anchor`/`data-qa` (both real, previously-confirmed-live DES attributes — findings §7's closing note) silently resolves to zero elements. `isVisible()` never becomes true; the poll times out on a page that in fact loaded fine.

This is exactly the gap CLAUDE.md's foundation spec had already earmarked ("relevant to foundation Risk #1 and the future Selector Healing agent") — the Builder Engine is simply the first thing to generate `locate()` calls driven by the map's synthesized testId hints; the hand-written reference specs never exercised this path (they only ever use role/label selectors written by a human who could see the real page).

**Scope decision (asked, no response after 60s, proceeded with the recommended option):** a proper fix touches `explorer/extract/enrichTestIds.ts` and/or `src/support/locators.ts` — both shared framework files well outside the Builder Engine's designed boundary ("touches existing framework files in exactly two places: playwright.config.ts and package.json/.gitignore — no crawler, planner, or POM/COM changes," per the design spec). Rather than expanding M6b's scope mid-flight, `builder/select.ts`'s `loadedSignalFor` was narrowed to **exclude testId from the priority order** (role → label only) — a real, scoped deviation from the stated testId-first priority, justified by this live evidence and documented as a code comment at the deviation site. Committed separately (`95448e8`) from the original Task 3 implementation, with its own updated/added unit tests locking in the new behavior (a testId-only candidate now yields `null`, never a testId `Strategy`).

**Second attempt, after the fix: 3/3 passed, no retries (4/4 including setup, 1.3m total).** Milestone success criterion met and exceeded (only one passing spec was required).

**New weakness surfaced, not blocking, worth tracking:** with testId excluded, all three regenerated page objects picked the **same generic header element** as their loaded-signal — `{ role: { type: 'button', name: 'Buscar en tienda' } }` (the "search in store" button present in the header of every DES page, not specific to the leaf page). It's a *true* signal (genuinely visible once the leaf page renders) but a *weak* one: `loadedSignalFor` returns the first non-destructive element with a role/label hint in map-element order, and the header search button is typically the very first such element captured on any page (it's at the top of the DOM/aria tree), so it wins over more page-specific candidates (e.g. "Añadir a la lista de deseos", "Añadir a cesta") purely by extraction order, not by relevance. Tracked in the backlog (B14) as a future refinement — e.g. deprioritizing elements known to be shared across many pages (Header/Footer component members) in favor of page-body-specific ones.

**Not touched, left for a dedicated fix:** reconciling `enrichTestIds`/`locate()` so testId hints are trustworthy again (recording which attribute matched, and either configuring a custom `testIdAttribute` per-hint or having `locate()` resolve via a raw attribute selector when the hint didn't come from `data-testid`). Tracked in the backlog (B15).

---

## 12. TestId attribute-provenance fix (M7) — closes B15, live-validated (2026-07-03)

Closed the gap left open at the end of §11. `TestIdHint { attr, value }` now lives in `src/support/locators.ts` (the base layer); `enrichTestIds.ts` and `hints.ts` record which of `data-testid`/`data-qa-anchor`/`data-qa` actually matched; `locate()` resolves `data-testid` via Playwright's `getByTestId()` and the other two via a raw CSS attribute locator. Schema bumped `1.2 → 1.3` (no migration code — the map is regenerated live as part of this milestone). `builder/select.ts`'s M6b workaround (excluding testId from its own loaded-signal priority) is reverted; a single legacy-shape guard tolerates stale schema-1.2 string testIds (and, after a task-review finding, `null`-shaped hints too) by falling through to role/label instead of crashing.

**Live probe confirmed the root cause exactly as suspected:** on a real PDP, "Añadir a cesta"'s test-id-like value (`addToCartSizeBtn`) comes from `data-qa-anchor` — not `data-testid` — exactly the mismatch §11 diagnosed. "Añadir a la lista de deseos" carries no test-id-like attribute at all under any of the three names (legitimate absence, not a bug).

**Full re-crawl (schema 1.3, 152 pages, both sessions):** 2,508 elements now carry a `{ attr, value }` testId hint (previously all provenance-less strings). `pnpm plan --update` re-annotated coverage: 8/152 flows covered (up from 3/152 pre-M7 — the map itself changed shape between crawls, as already documented as expected variability in §7/§9, not a planner regression).

**Builder regeneration — the concrete payoff:** `pnpm build-tests --top 3` against the fresh map produced three PDP journeys whose `isLoaded()` now asserts `locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } })` — a real, page-specific, product-level signal — instead of §11's generic `{ role: { type: 'button', name: 'Buscar en tienda' } }` header button. This is B14's partial closure: pages whose leaf element carries a testId attribute now get a strong signal; pages with no testId-bearing element at all still fall back to role/label and can still pick a generic one (B14 stays open for that narrower subset).

**Live validation: 3/3 generated specs pass, no retries** (4/4 with setup, 1.6m total) — the exact three journeys above, running with the restored testId-first priority.

**No-regression check:** the full manual reference suite (`pnpm test` — login, search→PLP→PDP, add-to-cart) still passes 4/4 live against DES, confirming the shared `locate()`/`Strategy` type change didn't disturb any hand-written page object (none of them construct a testId `Strategy` today, as verified during design).

**Task-review finding, fixed:** the legacy-shape guard as originally specified (`typeof hints.testId === 'object'`) didn't exclude JavaScript's `typeof null === 'object'` quirk — a hand-edited or corrupted map with `testId: null` would have passed the guard and crashed downstream in `locate()`. Fixed to `typeof hints.testId === 'object' && hints.testId !== null`, with a regression test.

**B15: closed.** **B14: partially closed** — tracked further only for leaf pages with no testId-bearing element.

---

## 13. Checkout/PDP classifier fix (B13) — closes §10's third classifier bug and the shop-cart open lead (2026-07-04)

`RuleClassifier` now evaluates deterministic path rules before text-signal rules: `-c0p{id}.html` → PDP (0.95), `shop-cart.html`/`/cart`/`/cesta` → Cart (0.9), wishlist paths unchanged. The Checkout rule additionally requires a path hint (`/checkout|order|pago|payment/i`) besides the text signal — the text regex alone matches ordinary PDP/help boilerplate ("Envíos y devoluciones"), which is exactly how 16 real PDPs became `Checkout` (§10). A task-review finding on the first cut of this fix (anchoring the Cart/Checkout regexes to path segments, not free substrings — false positives like "carteras"/"cartagena" matching `/cart`) was fixed before commit. The path-hint list is a best guess to confirm against the real DES checkout URL when one is first reached (D15).

**Root-cause detail confirmed during design (2026-07-03):** comparing a correctly-classified PDP against a mislabeled one in the committed map showed near-identical elements — the PDP rule's `hasSizeSelector` fired on the lucky two only because "talla" happened to appear in their `textSummary` (hydration timing), while `hasCheckoutSteps` fires on every PDP. Two adjacent bugs in the same family: the old Cart path regex (`/\/cart|\/cesta/`) never matched the real DES cart path `shop-cart.html`, and `shopping-guide.html` classified Checkout from help text alone.

**Live validation (2026-07-04):** full re-crawl (80 pages/session, both sessions, settle wait active): 151 pages. All 17 `-c0p` pages → `PDP` (0 in any other bucket), `shop-cart.html` → `Cart` (both sessions), `shopping-guide.html` → `Other` (both sessions), `Checkout` total: 0 (no real checkout page is reachable by link-following, as expected). Diff against the previous committed map showed 10 label transitions, all in the expected families (`Checkout → PDP`, `Checkout → Cart`, `Checkout → Other`) plus a handful of `Other ↔ PLP` flips consistent with ordinary crawl-to-crawl PLP-grid-hydration variability (§10/§12) — one of those (`/es/mujer/ropa/rebajas-n5303.html`, auth session, `PLP → Other`) was investigated directly: its `title` field degraded from "Rebajas en ropa de mujer \| Bershka" to the generic "Bershka \| Bershka" in the new crawl, the documented degraded-app-shell signature (§7), confirming it as environment noise rather than a classifier regression. `pnpm test` 4/4 (no retries) + `pnpm plan --update`: 0/151 flows covered — lower than M7's 8/152, but explained the same way as §9/§12: this crawl's discovery order rooted every flow (including previously single-step ones like `/es/member-hub.html`) at `/`, which the specs never visit (they start at `/es/`); not caused by this fix. Zero `Checkout`-typed flows remain, so the 16 fake `Checkout` flows are gone from the planner's ranking (D15 relevance).

**Still true:** the map has no real checkout pages — the Checkout path-hint list is unvalidated against a real DES checkout URL until D15 work reaches one.

---

## 14. Shared-element deprioritization (B14) — closes the remaining Builder loaded-signal gap (2026-07-04)

Closes the narrower scope §11/§12 left open after M7: leaf pages with no testId-bearing element still picked a generic shared header element (e.g. `{ role: { type: 'button', name: 'Buscar en tienda' } }`) as their loaded-signal, purely by map-element order. Design: `docs/superpowers/specs/2026-07-04-b14-shared-element-deprioritization-design.md`. Plan: `docs/superpowers/plans/2026-07-04-b14-shared-element-deprioritization.md`.

**What changed.** Both extraction paths (`explorer/extract/analyzeAria.ts`, the live aria path; `explorer/extract/analyze.ts`, the offline DOM path) now tag each element with `component?: 'Header' | 'Footer' | 'MiniCart'` based on landmark ancestry (`banner`/`header` → Header, `contentinfo`/`footer` → Footer, a cart-named element *inside* the header/banner → MiniCart, taking precedence). The cart-name check is deliberately scoped to inside the header only — an unscoped version would also tag the PDP's own "Añadir a la cesta" button as shared, defeating the purpose. Schema bumped `1.3 → 1.4` (no migration code, same precedent as M7 — the map is regenerated live). `builder/select.ts`'s `loadedSignalFor` now runs pass-major: the full testId→role→label tier order runs over page-specific candidates first, and only falls back to shared-chrome candidates if no page-specific candidate has any usable hint — deprioritize, not exclude, so an all-shared leaf still returns a real signal instead of `null`.

**Live re-crawl (80 pages/session, both sessions, settle wait active): 152 pages, schema 1.4.** 1,048 of 6,011 elements now carry `component` (288 Header, 760 Footer, 0 MiniCart). The 0 MiniCart count is expected, not a gap: DES's header cart affordance ("Ir a la cesta") is a `link`, and the extractor's `elementTypeFor`/element-pass logic only turns `button`/`checkbox`/`dialog`/`combobox` nodes into map elements — links were never captured as elements before this change either, so no live element could ever earn the MiniCart tag; the tagging logic itself is covered by synthetic unit tests (a hypothetical cart-named button) in both extraction paths. Spot-checked "Añadir a la cesta" (PDP body button) across multiple pages: correctly carries no `component` in every instance.

**Builder payoff, confirmed live.** The milestone's top-3 proposals were all PDPs with a strong `data-qa-anchor`/`addToCartSizeBtn` testId (M7's win persisting, unaffected by this change) — the "leaf without a testId-bearing element" case wasn't in the top-3, exactly the known risk flagged in the design's §7. Scanned the full 152-proposal list programmatically for the first proposal whose leaf page has no non-destructive testId-bearing element: found at index 15 (`/es/sudadera-cremallera-quick-dry-%26-breathable-c0p209126942.html`). Regenerated with `--top 16` to include it. Its generated `isLoaded()` asserts `locate(this.page, { role: { type: 'button', name: 'Anterior' } })` — a PDP-body image-carousel control — even though `Buscar en tienda` (Header) and `Acceder` (Header) both precede it in map-element order and would have won under the pre-B14 single-pass logic. This is the design's success criterion met directly, not inferred.

**Live validation: 17/17 passed** (`auth.setup` + all 16 generated specs, including the no-testId case above), no retries, 4.2m total. No-regression check: `pnpm test` (manual reference suite) 4/4 — `add-to-cart.spec.ts` was flaky on the first attempt (`page.waitForTimeout: Target page, context or browser has been closed`, the size-dialog-close confirmation from §7) and passed on retry #1; unrelated to B14 (no `tests/`, `src/pages/`, or `src/support/` files touched by this milestone) and consistent with the documented environment-noise pattern the test-level `retries: 1` exists for. `pnpm plan --update`: 0/152 flows covered — same root cause as §9/§12/§13 (this crawl's discovery order roots every flow at `/`, which the specs never visit), not caused by this fix.

**B14 closed.**

---

## 15. Interaction-aware crawl (M8) — closes backlog B9's remaining "nav menus/overlays" row (2026-07-05)

Design: `docs/superpowers/specs/2026-07-05-m8-interaction-aware-crawl-design.md`. Plan: `docs/superpowers/plans/2026-07-05-m8-interaction-aware-crawl.md`.

**What changed.** The crawler now opens a bounded, deduped set of non-destructive candidate elements (buttons/filters/sort, per-`routePattern` for page-specific triggers, once-per-crawl for Header/Footer/MiniCart chrome — `explorer/crawl/interact.ts`) on every visited page (aria mode only), diffs the before/after aria snapshot to detect a new overlay (dialog/menu), a navigation, or no change, extracts any revealed overlay's elements/links via the existing analyzer, and closes via Escape (falling back to a full page reload if it won't close). Schema bumped `1.4 → 1.5`: a new top-level `interactions[]` records `{ pageId, triggerElementId, outcome, revealedElementIds, navigatedTo? }`; revealed `MapElement`s carry `revealedBy` back to their interaction. `builder/select.ts`'s `loadedSignalFor` now excludes any `revealedBy`-tagged element from loaded-signal selection (a revealed element isn't visible on page load — asserting on one would regress exactly what B14/M7 fixed).

**Live validation (2026-07-05, VPN reconnected mid-session after an initial DNS-flakiness block — see the session's own troubleshooting, not a code issue).** Two full crawls run (both sessions, interactions on):
- 80-page/session bound: 103 pages, 0 errors, 262 interactions (83 overlay / 172 none / 7 navigated), ~42 min wall-clock (interactions add real, expected cost over the pre-M8 ~10 min/72-page baseline — findings §10's cost precedent).
- 150-page/session bound (matching B13/B14's historical full-crawl scale): 106 pages in the 20-min time budget (time-bound, not page-cap-bound, at this interaction cost — expected), 0 errors, 278 interactions (90 overlay / 181 none / 7 navigated).

**Core success criterion met, with an honest caveat on scope.** Neither crawl's discovery order reached a literal `-c0p{id}.html` PDP page (both crawls landed 0 PDP / mostly PLP: 75 and 84 respectively) — the same crawl-order/PLP-proliferation variability already documented in §9/§12/§13, not an M8 defect (confirmed by page-type breakdown: `{Home:2, Other:18-24, Cart:2, PLP:75-84, PDP:0}` in both runs). Per that section's own precedent ("don't chase this by increasing crawl bounds/timeouts blindly — confirm the mechanism first"), a third even-larger crawl was not attempted. Instead, the **mechanism** the milestone exists to prove was captured directly via the functionally-identical "Añadir a la cesta" component that also appears in the Cart page's related-products carousel: clicking `Añadir a la cesta {product}` (testId `{attr: 'data-qa-anchor', value: 'addToCartSizeBtn'}`, the exact real attribute confirmed in §11/§12) reliably opened the "Tallas" dialog and the analyzer correctly extracted `Descartar` (close) + `Talla 32/34/36/38/40/42-Agotado` buttons, each correctly tagged `revealedBy` pointing back at the interaction. **Verified against the raw crawl reports: the mechanism fired twice total, not three times** — once in the 20-page probe crawl (`2026-07-05T08-00-36-510Z.json`, "Talla 32–42" on "Short denim mini") and once in the 80-page crawl (`2026-07-05T08-42-51-799Z.json`, "Talla XS–L" on "Vestido mini tirantes corsé"); the 150-page crawl (`2026-07-05T09-25-14-080Z.json`) captured it zero times. This is the exact knowledge §10's third classifier bug identified as invisible to passive crawling ("the real size-selector signal only exists inside the 'Tallas' dialog... which the crawler never clicks") — now captured, at least twice. Since `discoverInteractions`'s logic is page-agnostic (it operates identically on any candidate element regardless of `pageType`), there is no code-level reason the same mechanism would behave differently on a literal PDP; closing the actual PDP-discovery gap is tracked already as the pre-existing, unrelated PLP-grid/crawl-order variability in §9/§12/§13, not reopened here.

The overlay-with-revealed-links mechanism more generally (not just Tallas) was also confirmed via the `Mercado` country/market-selector dialog (60 revealed country-locale links on Home) — a real, distinct overlay capture, but **not** the design spec §8's specific "header nav-menu interaction" success criterion: `Mercado`'s trigger carries no `component: 'Header'` tag in the map, and the real header nav overlay ("Categorías y productos") was never captured by either crawl (0 interactions with that trigger). Noted as an honest gap alongside the PDP one above, not glossed over.

**Canonical map**: the 150-page-bound crawl's report (`reports/explorer/2026-07-05T09-25-14-080Z.json`, 106 pages, schema 1.5) was written directly to `coverage/functional-map.json` rather than re-crawling a third time under `--update` (identical effect — `--update` only gates whether an already-produced map gets written, it doesn't change crawl behavior). 929 elements now carry `revealedBy`-linked provenance in addition to B14's 741-element `component` provenance (previously written here as "1048+", which was actually B14's `component` count — corrected on final whole-branch review). **The committed canonical map itself contains none of the flagship Tallas knowledge above**: 0 interactions have an "Añadir a la cesta" trigger, and both Cart pages (`shop-cart.html`, anon and auth) show 0 interactions — verified directly against `coverage/functional-map.json`. The mechanism was proven real in the two gitignored crawl reports that captured it, but crawl nondeterminism (the Cart page's related-products carousel contents vary per visit, and the candidate label includes the product name, so the dedup ledger's key differs run to run) meant the specific 150-page crawl chosen for the canonical artifact happened to be the one run where it didn't land. **M9 (interaction-spec generation) will need a crawl that actually captures this interaction in the canonical map before it can consume it** — re-running `pnpm explore --update` until a crawl lands an "Añadir a la cesta" → Tallas-dialog interaction (or making that capture deterministic) is a prerequisite, not a nice-to-have.

**No-regression, live:** `pnpm test` (manual reference suite) 4/4 — one retry on `add-to-cart.spec.ts` (`ProductPage: the size-selection dialog did not open within the deadline`, retried and passed), the same documented environment-noise pattern as B14's closure, unrelated to M8 (no `tests/`, `src/pages/`, `src/support/` files touched). `pnpm plan --update`: 0/106 flows covered — same root cause as §9/§12/§13 (this crawl's discovery order roots every flow at `/`, which the specs never visit; not caused by M8). `pnpm build-tests --top 3` against the new map: 3/3 generated, 0 skips, no missing-loaded-signal warnings. `pnpm test:generated`: **20/20 passed** live (the 3 fresh specs plus 17 accumulated from prior sessions in the gitignored `tests/generated/` — all still passing, confirming the `revealedBy` guard is correct and introduces no regression across the full accumulated corpus, not just the newest specs).

**M8 closed** (backlog B9's "nav menus/overlays... opened during crawl" row — the last item in that deviation table — moves from "still open" to done).

---

## 16. Deterministic must-capture interactions (M8b) — closes the M9 prerequisite (2026-07-05)

Design: `docs/superpowers/specs/2026-07-05-m8b-deterministic-must-capture-design.md`. Plan: `docs/superpowers/plans/2026-07-05-m8b-deterministic-must-capture.md`.

**Problem being closed.** §15 proved M8's interaction mechanism live but left the committed canonical map with zero captures — a crawl-order coincidence, not a mechanism failure. M9 (Builder generating interaction specs) needs a map that actually contains the "Añadir a la cesta" → "Tallas" capture, not just a proof it can happen.

**What changed.** `explorer/config.ts` gained `interactions.mustCapture: RegExp[]` (default `/^añadir a (la )?cesta/i`, overridable via `EXPLORER_MUST_CAPTURE`, semicolon-separated, empty string disables). `explorer/crawl/interact.ts` gained `labelClass()` (collapses per-product label variants like "Añadir a la cesta Vestido corsé" into one equivalence class) and `interactionScope()` (a ledger-only scope that additionally collapses all category-PLP paths `-n{digits}.html` into one shared scope, leaving the map-facing `routePattern` untouched). `InteractionLedger` gained `mustCaptureClass`/`isSatisfied`/`markSatisfied`/`unsatisfiedPatterns` — a must-capture class is retried on every page (with priority over ordinary candidates in `selectCandidates`'s new two-pass selection) until it yields one `overlay` outcome anywhere in the crawl, then never picked again. The ledger moved from per-session to per-crawl-global (constructed once in `explorer/cli.ts`, shared by both sessions — closing a minor finding from M8's final review), and the CLI warns (non-fatally) if any must-capture pattern ends the crawl unsatisfied. No schema change — the map stays 1.5.

**Live validation (2026-07-05).** A bounded 20-page/session probe crawl (32 pages total, 0 errors) captured the target interaction on the **first attempt**: trigger "Añadir a la cesta Pantalón bombacho" → `overlay` outcome, revealing "Tallas 32-44", "Descartar", and the size buttons, each correctly `revealedBy`-tagged. The full 150-page/session re-crawl (149 pages, 0 errors, 168 total interactions — `{overlay: 38, none: 111, navigated: 19}` — written via `pnpm explore --update`) landed the same class of capture in the **committed canonical map**: 1 "Añadir a la cesta" → `overlay` interaction (trigger "Añadir a la cesta Pantalón bombacho") with its revealed Talla elements correctly linked via `revealedBy`. Verified directly against `coverage/functional-map.json`, not inferred from logs. **This closes the M9 prerequisite** — the mechanism is no longer a coin flip; it generalizes to any future must-capture trigger via `EXPLORER_MUST_CAPTURE` (e.g. the still-uncaptured header nav-menu overlay noted as an honest gap in §15 could be added as a second pattern in a future session, without new code).

**Note for M9:** by design (§3.2), a satisfied must-capture class is never picked again for the rest of the crawl — the map is guaranteed exactly one exemplar capture per must-capture class per crawl, not per-page coverage. A future literal PDP reached later in the same crawl will not re-trigger an "Añadir a (la) cesta" interaction once the class is already satisfied. M9's design should consume this as "at least one real example exists," not assume every PDP-shaped page carries its own capture.

**No-regression, live — two new findings surfaced, both confirmed unrelated to M8b.** `pnpm test` (manual reference suite): `login.spec` and `search-plp-pdp.spec` pass; `add-to-cart.spec.ts` failed **5 consecutive attempts** (2 in the full-suite run including its retry, 3 further isolated attempts run to distinguish transient noise from a real issue). Root-caused, not just retried blindly: every failure snapshot showed the same product, "Camiseta tirantes rib" — currently the top result for the search term "camiseta" — and it is a **Personalizable** product whose PDP exposes "Personalizar"/"Añadir" buttons instead of the plain "Añadir a cesta" button `ProductPage.selectFirstSize()`'s selector expects. `git diff --stat` from the pre-M8b tip (`e0a0d7a`) confirms M8b's diff never touches `src/` or `tests/` — this is a **catalog-drift fragility in the existing manual reference spec** (whichever product currently ranks first for "camiseta" can be a personalizable variant with a different add-to-cart UI), not a regression. Filed as a new, lower-priority backlog item (see roadmap/backlog updates below) — out of M8b's scope to fix (touches `src/pages/ProductPage.ts` and/or `tests/cart/add-to-cart.spec.ts`, both outside this milestone's declared file list).

Second: `pnpm build-tests --top 3` + `pnpm test:generated` against the fresh map produced 3 generated specs, 2 passed, 1 failed with a Playwright strict-mode violation — `locator('[data-qa-anchor="productItemWishlist"]')` resolved to 38 elements on the leaf page (a "Recomendados"/product-grid section repeats the same testId per card). Root-caused: `builder/select.ts`'s `loadedSignalFor` picks a testId hint if it exists and isn't shared chrome (Header/Footer/MiniCart, per B14) or `revealedBy`-tagged (per M8), but never checks whether the hint is **unique in the page's own DOM** — a per-card testId repeated across an in-page product grid isn't chrome and isn't revealed, so nothing in the current priority order excludes it. `git diff --stat` confirms M8b never touches `builder/` or `explorer/extract/`; this is a **pre-existing latent gap in Builder's signal selection**, exposed only because this crawl's discovery-order variance (the same crawl-to-crawl non-determinism documented since §9) happened to rank a page with this shape into the top-3 proposals. Filed as a new backlog item alongside the one above.

`pnpm plan --update`: 0/149 flows covered — same root cause as §9/§12/§13/§15 (this crawl's discovery order roots every flow at `/`, which the specs never visit; not caused by M8b).

**M8b closed** — the M9 prerequisite (a canonical map containing the "Añadir a la cesta" → Tallas capture) is met. Two new, out-of-scope findings (catalog-drift test fragility; Builder testId-uniqueness gap) are tracked in the backlog, not fixed here.

---

## 17. Builder interaction-spec generation (M9) — live-validated, closes B16 (2026-07-06)

Design: `docs/superpowers/specs/2026-07-06-m9-interaction-spec-generation-design.md`. Plan: `docs/superpowers/plans/2026-07-06-m9-interaction-spec-generation.md`.

**What changed.** `builder/select.ts` gained `selectInteractionJourneys(map, mustCapture)` (map-only selection, no `PlanReport` — inherits its navigation chain from the flow whose leaf is the interaction's page) and `unsatisfiedMustCapture(map, mustCapture)`. `builder/generate/TemplateGenerator.ts` gained `generateInteraction()`, emitting a page object with `openOverlay()`/`isOverlayOpen()`/`closeOverlay()` (act→verify→retry, mirroring `ProductPage.selectFirstSize()`/`addToCart()`) and a spec walking open→verify-loaded→open-overlay→verify-open→close-overlay→verify-closed. `builder/cli.ts` wires both alongside the existing navigation-journey generation, reading must-capture patterns from `loadExplorerConfig().interactions.mustCapture` (same source the crawler uses) and warning non-fatally if a pattern is unsatisfied in the map. Same milestone closes **B16**: `loadedSignalFor` now excludes a testId hint from the loaded-signal tier when it repeats among the leaf page's own elements (page-wide count, deprioritize not exclude — the element still competes via role/label), while interaction *triggers* deliberately keep the opposite policy (`.first()` on a possibly-repeated testId, "any exemplar opens the overlay").

**Live validation (2026-07-06).** `pnpm build-tests --top 3` against the committed canonical map (`coverage/functional-map.json`, schema 1.5, unchanged) produced 3 navigation specs + exactly 1 interaction spec (the "Añadir a la cesta Pantalón bombacho" → Tallas capture from M8b). **B16 confirmed fixed live**: the top proposal, `falda-mini-flecos-c0p233761111.html` — the exact page M8b's no-regression check found generating a non-unique `productItemWishlist` testId (§16) — now generates `isLoaded()` asserting `{ role: { type: 'button', name: 'Anterior' } }` (a PDP carousel control), never the repeated wishlist testId.

**A real live bug found and fixed during this validation (systematic-debugging, not blind-patched).** The first live run of the generated interaction spec failed: `isOverlayOpen()`'s `this.page.getByRole('dialog').isVisible()` (the design's original signal for `overlayIsDialog: true`) hit a Playwright strict-mode violation once the real Tallas dialog opened. Root-caused by isolated reproduction (`--retries=0`, single spec): DES keeps a **second, permanently-mounted dialog-role element** in the DOM on every page — the mobile nav-menu drawer (`id="category-menu-modal"`, accessible name "Categorías y productos"), present (and matched by `getByRole('dialog')`) even when visually closed, most likely an off-screen slide-in drawer rather than `display:none`. Once the real product-overlay dialog also opens, two elements match a bare `getByRole('dialog')`. **Fix (decided with Jorge): baseline dialog-count diff**, mirroring the crawler's own before/after-snapshot-diff idiom (`explorer/crawl/interact.ts`, M8) instead of asserting single-element visibility: the generated class captures `dialogBaselineCount = await this.page.getByRole('dialog').count()` in `open()` (after navigation, before any interaction), and `isOverlayOpen()` becomes `(await this.page.getByRole('dialog').count()) > this.dialogBaselineCount`. Scoped strictly to the `overlayIsDialog` branch — the non-dialog fallback (`overlayElementSignal`-based) was untouched and never exhibited this failure mode. This is a genuine design correction to the original spec's §4 decision, not an implementer defect; recorded here so a future must-capture interaction whose trigger reveals a dialog does not re-hit the same failure.

**Full live results after the fix:** `pnpm test:generated` — **5/5 passed, no retries** (setup + 3 navigation specs + the 1 interaction spec), ~2.6 min. The interaction spec is the milestone's core success criterion: it opens the Tallas dialog via the PLP's quick-add grid button, verifies it opened, closes it via Escape, and verifies it closed — all against the live site.

**No-regression, live:** `pnpm test` (manual reference suite) — **3/4**, exactly as anticipated by the plan's own known-caveat criterion: `login.spec` and `search-plp-pdp.spec` pass; `add-to-cart.spec.ts` fails both attempts, and the failure snapshot confirms the same pre-existing, unrelated **A5** signature (`heading "Camiseta tirantes rib"` with `button "Personalizar"` / `button "Añadir"` instead of the plain "Añadir a cesta" the spec expects) — not a new regression. `pnpm plan --update`: 0/149 flows covered, same root cause as §9/§12/§13/§15/§16 (this crawl's discovery order roots every flow at `/`, which the specs never visit); the re-annotated map was byte-identical to the committed one (checksum-verified after stripping line endings) once the CRLF-only working-tree touch was discarded — nothing to commit.

**New, minor, out-of-scope observation surfaced during Task 3's implementation (not a live-validation finding, but recorded here since it was discovered this session):** the committed canonical map contains duplicate `MapElement.id` values — at least 830 label+page collisions counted directly against `coverage/functional-map.json`. `selectInteractionJourneys` tolerates this by design (first-match via `.find()`, documented at the call site), so it did not block M9, but it is a real Explorer-side data-quality gap (likely an id-generation collision for elements sharing the same page+label+role) worth a dedicated root-cause pass in a future session.

**Final whole-branch review (fable) caught one more real bug before merge — fixed and re-validated live.** The baseline-dialog-count fix above was originally captured inside `open()`, immediately after the navigation chain's `goto()` calls. The reviewer traced this against the project's own hydration doctrine (`BasePage.goto()` only waits `domcontentloaded`; the persistent nav-menu drawer is a Vue-hydrated component that can mount well after that) and flagged a real race: an early, empty baseline would make `isOverlayOpen()` return `true` before any real overlay opened, silently defeating the whole mechanism — a latent flake the single live pass hadn't hit yet. **Fix:** moved the baseline capture to the start of `openOverlay()` instead, which runs only after the generated spec's own `expect.poll(isLoaded)` has already confirmed hydration. A new test locks in the location (asserts the capture line is inside `openOverlay()`'s body, not `open()`'s). Re-validated live after the fix: `pnpm test:generated` **5/5 passed, no retries** again (interaction spec: 30.6s). This is the second live-validation pass to find and fix a real design gap in the same overlay-open mechanism within one session — both fixes are now load-bearing parts of the design, not deferred follow-ups.

**M9 closed.** B16 closed. A5 remains open (unrelated, pre-existing, tracked in the backlog).

---

## 18. A5 — Personalizable-product probe (2026-07-12)

Design: `docs/superpowers/specs/2026-07-12-a5-personalizable-product-design.md`. Plan: `docs/superpowers/plans/2026-07-12-a5-personalizable-product.md`. This section is Task 1 of that plan (live probe only — no code fix; the fix is Task 2).

**Step 2 — reproducing A5 live, with two honest surprises.**

*First attempt* (`pnpm exec playwright test tests/cart/add-to-cart.spec.ts --project=chromium`, i.e. including the `setup` project dependency) never reached the target spec: `setup` itself failed both attempts (`Test timeout of 120000ms exceeded` waiting for `getByRole('button', { name: /continuar con e-?mail/i })`). The failure's accessibility snapshot showed `/es/logon.html` rendering the e-mail+password form **directly** — no "Continuar con e-mail" interstitial screen appeared at all (contradicts findings §4's recorded recipe). This is a genuine, live-observed drift in the DES login flow, unrelated to A5 and outside Task 1's file list (`src/pages/LoginPage.ts` was not touched) — recorded here as an environment aside for a future session, not investigated further. It did not block this probe: the `.auth/state.json` copied into the worktree was confirmed still a valid, live session by re-running with `--no-deps` (skips the `setup` dependency, reuses the stored session), which authenticated fine and drove the app normally.

*Second attempt* (`--no-deps`, reused session): reached the real spec and the real PDP. The current **top-ranked** "camiseta" result is now **"Camiseta oversize print OLIVIA RODRIGO"** (`camiseta-oversize-print-olivia-rodrigo-c0p227229879.html`) — a **standard**, non-personalizable product (plain "Añadir a cesta" button, confirmed in the failure screenshot). The spec still **FAILED**, both attempts, but for an **unrelated** reason: `ProductPage.addToCart()`'s size-dialog-close retry loop exhausted its budget (`ProductPage: the size dialog did not close after selecting a size (add not confirmed)`) — matching the pre-existing Tallas-dialog-close environment-noise pattern already documented in §14/§16, not A5.

**Catalog drift confirmed exactly as the brief anticipated ("cuts both ways"):** the Personalizable product ("Camiseta tirantes rib", the same product confirmed failing in M8b §16 and M9 §17) is no longer top-ranked for "camiseta" — it moved down the grid. Per the brief's branch instruction for this exact case, proceeded to the probe (Step 3) and searched deeper than the first card for a Personalizable signal.

**Step 3/4 — probe results** (`tests/_probe/a5-probe.spec.ts`, temporary, deleted after this section was written; real live output, single run, **passed clean, 30.7s, no retries**):

32 total `-c0p` cards rendered on first load of the "camiseta" grid (no scrolling needed). First 6 dumped for baseline, then a scan of all 32 for a `personaliz*` signal:

- Card 0 "Camiseta oversize print OLIVIA RODRIGO" — standard: `button "Añadir a la cesta Camiseta oversize print OLIVIA RODRIGO"`.
- Card 1 "Camiseta ajustada SPIDER-MAN" (colorId=600) — **out of stock**: `button "Temporalmente sin stock, ¡Avísame!"`, no quick-add button at all. A third card shape, outside A5's scope (a stock-status variant, not a personalization variant) but worth flagging for Task 2 so it isn't conflated with the Personalizable filter.
- Card 2 "Camiseta ajustada SPIDER-MAN" (colorId=800) — standard.
- Card 3 "Camiseta manga corta fruncido" — standard.
- **Card 4 "Camiseta tirantes rib" — the Personalizable product.** Aria dump:
  ```yaml
  - listitem:
    - link "Camiseta tirantes rib Añadir a la cesta Camiseta tirantes rib Añadir a la lista de deseos Personalizable Camiseta tirantes rib 5,99 € 6 Colores":
      - /url: /es/camiseta-tirantes-rib-c0p229723035.html?colorId=251
      - img "Camiseta tirantes rib"
      - button "Añadir a la cesta Camiseta tirantes rib"
      - button "Añadir a la lista de deseos"
      - text: Personalizable
      - paragraph: Camiseta tirantes rib
      - text: 5,99 €
      - paragraph: 6 Colores
  ```
  Note the `button "Añadir a la cesta Camiseta tirantes rib"` — **identical role and wording** to a standard card's quick-add — plus one extra node: a plain, unlabelled `text: Personalizable`, sibling to the buttons.
- Card 5 "Camiseta tirantes cuello pico" — standard. No other card among the 32 scanned carried a `personaliz*` signal.

Opening Card 4's PDP (`camiseta-tirantes-rib-c0p229723035.html?colorId=251`) confirmed the incompatible UI: `<main>` contains `button "Personalizar"` and `button "Añadir"` — **no** "Añadir a cesta"/"Añadir a la cesta" button anywhere in the PDP (grepped the full PDP dump to confirm; zero matches outside the card listing).

**Q1 — card signal:** every card, including the Personalizable one, exposes the same per-card quick-add button, exact accessible name `"Añadir a la cesta {producto}"`, `getByRole('button')`-reachable (shadow DOM pierced fine as always on this site). The Personalizable card does **not** differ on this button — it carries it too, verbatim. The only thing that differs is an additional plain-text `"Personalizable"` node (no role, not part of any button's accessible name) that appeared on exactly one of the 32 cards scanned.

**Q2 — correlation (load-bearing, the question the whole design hinges on):** confirmed **the positive-affordance test is defeated, exactly as design §4.1 flagged as the risk case.** A filter that keeps cards with a standard `"Añadir a la cesta"` quick-add button would **not** exclude Card 4 — it has that exact button, yet its PDP has no such button at all. Stated plainly, without softening (RIGOR Regla 7): **rung 1 (positive card-level capability filter) is rejected** — the presence of the standard quick-add on the card does not predict the PDP's add-to-cart variant. The `"Personalizable"` text badge, however, **does** correlate: it is present on exactly the one card whose PDP is confirmed (by direct navigation) to be incompatible, and absent from all 5 other cards dumped/all 32 scanned. → **rung 2 (negative card-level variant filter) is confirmed usable.**

**Q3 — timing:** `waitForResults()` returned promptly; the entire probe (search → results → dump 6 cards → scan 32 for the badge → open PDP → dump PDP → `goBack()`) completed in 30.7s, zero retries. Both the quick-add button and the `"Personalizable"` badge were present in the very first `ariaSnapshot()` taken immediately after `waitForResults()` returned — no hover, no extra interaction. Not lazy, not hover-only.

**Q4 — fallback viability:** not required (rung 2 is usable, so rungs 1–2 are not *both* rejected), but captured anyway since it was cheap: `page.goBack()` from the PDP returned to `https://…/es/q/camiseta` (the results grid URL), not home. Positive data point for a future rung-3 discussion, unused by this decision.

**Rung decision: rung-2 — negative card-level variant filter.**

Exact signal: a plain text node with content **`"Personalizable"`** (case-sensitive as observed, no ARIA role, not part of any button's accessible name), present inside the product card's `<listitem>`. Exact predicate, composing with the existing `-c0p` positive filter already in `SearchResultsPage.firstProduct()`:

```ts
this.page.getByRole('main').getByRole('listitem')
  .filter({ has: this.page.locator('a[href*="-c0p"]') })
  .filter({ hasNotText: 'Personalizable' })
  .first()
```

Rationale: the design's rung 1 (positive quick-add-presence filter) is unusable here because the Personalizable card's quick-add button is indistinguishable from a standard card's — confirmed live, not assumed. Rung 2's denylist works because the `"Personalizable"` badge is a reliable, confirmed-correlated card-level signal for today's case. Per the design's own characterization (§3.2), this is a denylist — it fixes today's known variant but does not generalize to a hypothetically different incompatible variant that doesn't carry this exact badge; that residual risk is accepted as designed, not treated as a gap in this probe.

**Exit gate:** rung-2 selected → proceed to Task 2 with this predicate. Rung-3 (PDP-level fallback) is **not** needed.

**Task 2 — fix shipped and live-validated (2026-07-12), closes A5.**

After reviewing this probe, Jorge decided to broaden the shipped predicate beyond rung-2 alone: `SearchResultsPage.firstProduct()` now applies a **combined filter** — a positive filter (the card exposes the standard per-card `"Añadir a la cesta"` quick-add button, `getByRole('button', { name: /^Añadir a la cesta/i })`, which excludes the out-of-stock card shape flagged as Card 1 above) **and** the rung-2 negative filter (`hasNotText: 'Personalizable'`, which excludes the personalizable variant — it carries the identical quick-add button, so needs the separate negative check to be excluded). A new private `productCards()` helper extracts the pre-existing `-c0p` banner-skip filter, reused by both `firstProduct()` and a reworked `waitForResults()`, which now throws two distinct diagnostics: `"results grid rendered but no standard-add-to-cart product found... (all variants Personalizable?)"` when a product card is visible but none is compatible, versus the original, unchanged "dead `/q/` load" message when no product card renders at all.

**Live validation.** `add-to-cart.spec.ts` — **5/5 PASS** across 5 consecutive live runs. Stated plainly, without softening (RIGOR Regla 7): 2 of those 5 runs needed a retry, for the pre-existing, already-documented, **unrelated** `ProductPage.addToCart()` size-dialog-close flakiness (the same environment-noise pattern recorded in §14/§16) — not caused by, and not touched by, this fix. `search-plp-pdp.spec.ts` (also calls `firstProduct()`) — PASS, confirming no regression. `pnpm typecheck` and `pnpm lint` — both clean. The full `pnpm test` suite could not be run end-to-end because of the unrelated login-flow drift this same probe surfaced above (blocks the whole `chromium` project's `setup` dependency); the two specs this fix actually touches were instead validated directly with `--no-deps` (reusing a known-good stored session), both green — the real no-regression evidence for this change, not a full-suite `pnpm test` 4/4 claim.

**One Minor, unfixed finding from Task 2's code review (deferred, not blocking):** the new diagnostic message reads "(all variants Personalizable?)" but the guard also excludes out-of-stock cards — the wording names only the Personalizable cause, not the out-of-stock one. Left as-is; not fixed as part of Task 2.

**A5 closed.**

---

## 19. A6 — DES login-flow drift fix, live-validated, closes A6 (2026-07-12)

**Backlog:** `docs/roadmap/2026-07-02-backlog.md` §A, item A6. Filed during A5's final-review fix-up (§18) after Task 1's probe found `/es/logon.html` rendering the e-mail+password form directly, with no "Continuar con e-mail" interstitial — contradicting the login recipe recorded in §4. A6 explicitly required confirming live whether the interstitial's absence is permanent or session/A-B-test dependent before touching `LoginPage.ts` (RIGOR Regla 5 — verify in the real world, don't guess).

**Root-cause investigation (systematic-debugging, not blind-patched).** Reproduced live twice, independently, each in a fresh unauthenticated session (`pnpm exec playwright test --project=setup` starts with no stored auth state by design — that is the exact mechanism `auth.setup` exists to bootstrap): first attempt and retry #1 both failed identically, `locator.click: Test timeout of 120000ms exceeded` waiting for `getByRole('button', { name: /continuar con e-?mail/i })`. The captured accessibility snapshot at both failures shows the full e-mail+password form already rendered on `/es/logon.html` — `heading "Inicia sesión o crea tu cuenta"`, `textbox "E-mail"`, `textbox "Contraseña"` (with a "Mostrar la contraseña" toggle), a `checkbox "Mantener sesión"`, and `button "Iniciar sesión"` — with no "Continuar con e-mail" button or Facebook option anywhere in the tree. Two independent fresh sessions showing byte-identical structure is real evidence the direct-form rendering is not tied to reused state; it does not rule out a server-side A/B test uncorrelated with session freshness, but no live evidence of the old interstitial-first variant was found in either reproduction.

**Fix — `src/pages/LoginPage.ts`, `login()`:** removed the `getByRole('button', { name: /continuar con e-?mail/i }).click()` step entirely; `login()` now interacts directly with the e-mail/password form that DES renders on `/es/logon.html` today (fill e-mail → fill password → click `"Iniciar sesión"` → wait for the member-hub/account redirect, unchanged). The class doc comment was updated to describe the current flow and record the drift. No other file touched; no speculative dual-path handling added for the old interstitial (no live evidence it still exists in any observed session — matches this project's standing precedent of fixing to observed reality, not hedging against unconfirmed hypotheticals).

**Live validation.** `pnpm exec playwright test --project=setup` — **1/1 PASS, no retry** (53.8s), immediately after the fix (vs. 2/2 failures before it, both exhausting the full 120s timeout + retry budget). Full `pnpm test` — **4/4 PASS, no retries, exit code 0** (2.5m): `auth.setup` (53.6s), `tests/auth/login.spec.ts` (46.1s), `tests/cart/add-to-cart.spec.ts` (22.4s), `tests/search/search-plp-pdp.spec.ts` (26.2s) — the first time this session that the full serialized suite has completed end-to-end without the `--no-deps` workaround A5's validation had to fall back on. `pnpm typecheck` and `pnpm lint` — both clean.

**A6 closed.**

---

## 20. F18 — coverage matching restored by re-rooting the map (2026-07-13)

Design: `docs/superpowers/specs/2026-07-13-f18-coverage-matching-reroot-design.md`. Plan: `docs/superpowers/plans/2026-07-13-f18-coverage-matching-reroot.md`. Backlog: §F, item F18 (root-caused 2026-07-06 in the Fable 5 final audit, finding F5; not fixed until now).

**Problem being closed.** Every coverage run since M7b reported near-zero flows covered (3/152 → 8/152 → 0/151 → 0/152 → 0/106 → 0/149 → 0/149 across M7/M7b/B13/B14/M8/M8b/M9), each attributed in §9/§12/§13/§15/§16/§17 to "this crawl's discovery order roots every flow at `/`, which the specs never visit." Correct each time, but after seven consecutive occurrences it is not crawl-order variability — it is a deterministic incompatibility between three fixed facts: the crawler seeded discovery at bare `/`; the manual specs enter via the `/es/` locale root per `BASE_URL` doctrine and never visit bare `/`; and `planner/coverage/match.ts`'s `isOrderedSubsequence` requires the flow's *entire* step chain (including that never-visited `/` root) to appear in the evidence trail. So `coveredBy` was structurally empty on every annotated map since M7b — M5b's headline capability (evidence→map coverage linkage, the seed of Phase 8: Continuous Learning) has been dark for the platform's entire post-M7b history.

**Fix (commit `304c35e`).** Two coupled changes in `explorer/`, no planner/coverage code touched:
1. **Dropped `/` from the crawler's seed list** (`explorer/cli.ts`: `SEEDS` is now `['/es/', '/es/search']`, previously included bare `/`). On this site `/es/` already discovers the same tree via the gender gate, so removing the bare-root seed removes the un-navigated prefix without losing any real page.
2. **Fixed the F4 chain-truncation latent bug in `explorer/crawl/crawler.ts`:** a discovered child's `discoveredVia` is now the parent's *resolved* path (`extraction.meta.path`), not the originally-requested path. This was **necessary, not optional** — dropping `/` alone would have unmasked audit finding F4: once the redirecting `/es/` seed became the crawl root, recording `discoveredVia` against the requested (pre-redirect) path would have broken the parent-link tree `buildMap()` walks to reconstruct navigation chains, collapsing multi-step flows toward single-step. Two new `buildMap` contract tests were added to lock the chain-reconstruction behavior.

**Live re-crawl (commit `e02acc8`).** `EXPLORER_MAX_PAGES=150`, `EXPLORER_TIME_BUDGET_MS=1200000`, both sessions, via `pnpm explore --update`:
- **155 pages, 0 errors, ~37 min wall-clock** (anon session first ~20 min, auth session to completion). The crawl finished within budget rather than being time-cut-off.
- **Schema is now 1.6.** This is the pre-existing F11 additive `MapPage.truncated` bump (landed in the 2026-07-12 hygiene grouping, see audit doc §3.1) taking effect on this natural re-crawl — **not** a new F18 schema change. F18 itself changes no schema.
- **No `/` page in the new map** — verified directly (`/` page present: false), no residual `/`-rooted flows.
- **153/155 flows are multi-step**, vs. the prior map's 147 — the F4 fix held live, chains were NOT collapsed by re-rooting. **100% (155/155) of flows root at `/es/h-woman.html`** (the gender-gate landing), no other root page at all.

**Manual reference suite, then coverage annotation (order preserved so `route-evidence.json` isn't clobbered):**
- `pnpm test` — **4/4 PASS, zero retries** (2.4m): `auth.setup` (50.3s), `login.spec` (42.6s), `add-to-cart.spec` (22.6s), `search-plp-pdp.spec` (20.4s). Stated plainly (RIGOR Regla 7): no add-to-cart retry was even needed this run, cleaner than the environment-noise pattern §14/§16/§18 documents as acceptable.
- `pnpm plan --update` — **5/155 flows covered.** Verified directly against the annotated map: every `coveredBy` entry correctly names one or more of the three real manual specs — `tests/auth/login.spec.ts`, `tests/cart/add-to-cart.spec.ts`, `tests/search/search-plp-pdp.spec.ts` — no bogus or empty spec-path entries. The covered set: `/es/h-woman.html` (by all three specs), `/es/h-woman.html → /es/shop-cart.html` (add-to-cart), `/es/h-woman.html → /es/logon.html` (login).

**This is the milestone's core success criterion, met live: the evidence→map coverage linkage is confirmed working for the first time since M7b** — seven consecutive sessions of structurally-empty `coveredBy` are resolved by the `/`-seed removal + F4 fix + this live re-crawl, together.

**Builder no-regression (run after coverage annotation, so it clobbers `route-evidence.json` only after the planner has consumed it):**
- `pnpm build-tests --top 3` produced **3 fresh navigation specs + 1 fresh interaction spec**, no missing-loaded-signal errors, no stale-proposals error. (The 1 interaction spec is expected M9 behavior — an unsatisfied must-capture pattern in the top-N yields an interaction journey; the plan's Step 7 wording said "3 navigation specs," a wording nit, not a defect. See the minor findings below.)
- `pnpm test:generated` — **23/24 passed, 1 failed** (both attempts). All 4 of this session's freshly-generated specs passed. The single failure is a **pre-existing accumulated spec, not F18's output**: `bermuda-denim-baggy-c0p-75fca1ff.spec.ts`, built 2026-07-04 (its own `// GENERATED from ... map generated 2026-07-04` header proves it predates this session's re-crawl, and its journey is literally rooted at the now-removed `/` seed). It failed on a genuine, unrelated testId-uniqueness bug — a `getByTestId`-equivalent locator for `data-qa-anchor="addToCartSizeBtn"` resolved to 2 elements on that specific PDP (a recommendations-carousel quick-add button sharing the testId value), the same B16/M8b (§16/§17) family. Stated plainly, without smoothing: `pnpm test:generated` was **not** a clean 24/24. But it is demonstrably **not** an F18 regression — neither F18 commit touches any `builder/` file (the diff is `explorer/` code + `coverage/functional-map.json` only), and the failing spec's own content shows it predates this work. It did not block the milestone: `pnpm test:generated` writes nothing to the canonical map, and the map's own guardrails (schema/roots/chains and coverage-non-zero) already passed independently.

**Two new Minor findings surfaced during this task's review — both non-blocking, recorded as future backlog candidates, not fixed here:**
- **(a) `tests/generated/` has no pruning mechanism.** Specs built against a superseded map accumulate in the gitignored directory and can fail for reasons unrelated to whatever's currently being validated — exactly what happened here (a 2026-07-04 spec rooted at the removed `/` seed, still on disk, still run by `pnpm test:generated`). A prune step (or a build-time staleness check against the current map's crawl timestamp) would keep the generated-suite signal clean.
- **(b) Plan Step 7 wording nit:** the plan said `pnpm build-tests --top 3` yields "3 navigation specs," but Builder correctly also generated 1 interaction spec (expected M9 behavior when an unsatisfied must-capture pattern exists in the top-N). Wording imprecision in the plan, not a code defect.

**F18 closed.** The other ⚠ schema/contract-affecting audit item, **B17** (duplicate `MapElement.id` collisions), becomes the recommended next candidate — see backlog §F/§B and CLAUDE.md.

---

## 21. B17 — `MapElement.id` deduplication (2026-07-13)

Design: `docs/superpowers/specs/2026-07-13-b17-element-id-dedup-design.md`. Plan: `docs/superpowers/plans/2026-07-13-b17-element-id-dedup.md`. Backlog: §B, item B17 (= 2026-07-06 Fable 5 audit finding F1; also closes audit finding F7). Root-caused 2026-07-06, first surfaced as an unfiled observation in M9 (§17); not fixed until now.

**Problem being closed.** `explorer/map/builder.ts`'s `makeId('elem', pageId, el.role, el.label, el.type)` had no occurrence discriminator, and neither extraction path deduplicated repeated elements — so two elements on the same page sharing role+label+type got the *same* id. Measured directly against the committed map (as of F18's close, 2026-07-13): **830 duplicate ids / 1,968 excess element rows — 32% of the table redundant**, worst case 27 identical "Añadir a la lista de deseos" grid buttons collapsing to one id. **127 of those duplicate instances genuinely diverge** from their first occurrence (in `selectorHints.testId` or `component`) — not harmless repeats, so a `byId` first-match `.find()` could return an instance whose hints differ from the element that actually produced an interaction.

**Fix — three commits.**
1. **`c17bdcc` — extraction-time content dedup + `count`.** Both extraction paths — `explorer/extract/analyzeAria.ts` (live aria path, dedup applied *before* the 60-element cap so genuine unique knowledge no longer loses slots to repeats) and `explorer/extract/analyze.ts` (offline DOM path, kept at parity per the F6 dual-path lesson) — now collapse full-content-identical elements into one row carrying a new `count` field, via a shared strict-equality predicate (`explorer/extract/dedup.ts`). The predicate requires `type + label + role + destructive + component + selectorHints` to *all* match; **genuinely divergent elements are never merged** (the 127 divergent instances above stay distinct rows).
2. **`8a5cabf` + `60e7c61` — occurrence-discriminated ids + `count` passthrough.** `buildMap` folds a per-page occurrence index into `makeId(...)` for the residual rows that still share `role+label+type` after content dedup but diverge in other fields, making every id unique; `MapElement.count` is a straight passthrough from the extractor. Schema bumped **1.6 → 1.7** (additive). **A real plan gap was found and fixed during implementation** (not smoothed over): `buildMap`'s separate `triggerElementId` computation (for `MapInteraction`) needed the same occurrence-index treatment or it would silently desync from the passive loop's ids. Fixed by resolving to the trigger's real occurrence — walking `ex.elements`, matching the passive loop's own counting scheme, stopping at the first non-destructive/eligible match, consistent with `explorer/crawl/interact.ts`'s `eligible()` and `selectCandidates`'s first-eligible-wins selection — rather than a naive hardcoded index.
3. **`0e4057f` — closes audit finding F7.** `builder/select.ts`'s `loadedSignalFor` testId-uniqueness check (from B16, M9) now **sums each row's `count`** instead of counting rows, so a testId collapsed into one deduped row with `count: 38` is correctly read as non-unique (its real DOM occurrence count), not wrongly passed as unique. F1's dedup makes B16's uniqueness check exact for free, exactly as the audit's F7 predicted.

**Explicitly accepted, documented residual scope gap (not fixed — predates B17).** If a page ever has *two or more eligible* (non-destructive) elements sharing the exact same `role+label+type`, the trigger-id resolution still can't perfectly disambiguate which specific one was the real interaction trigger — `MapInteraction.trigger`'s type never carried a unique instance pointer, even before B17. This matches the project's existing "any exemplar" tolerance for a repeated trigger (`builder/generate/TemplateGenerator.ts`'s `.first()` policy from M9). A full fix would widen `ExtractedInteraction.trigger`'s shape in `explorer/types.ts` / `explorer/crawl/interact.ts` — a data-model change out of B17's scope, worth a one-line future backlog note only if ever hit live.

**Live re-crawl (commit `b8dfbdf`) — eventful path, stated plainly (RIGOR Regla 7).** The first attempt was **BLOCKED**: the VPN had disconnected, DNS resolution to the DES host failed (confirmed via both `curl`/PowerShell `Resolve-DnsName` and the VPN adapter showing "Disconnected") — the session correctly refused to fabricate results rather than guess. After Jorge reconnected the VPN, a retry's crawl step hit an API session rate limit mid-crawl — **but the crawl process had already completed successfully on disk before the interruption** (confirmed independently by direct filesystem inspection: a fresh crawl-report file plus an updated map with the correct guardrail-passing shape), so the continuation correctly skipped a redundant second crawl and went straight to validation.

**Final numbers — twice independently verified** (once by the controller, once by an independent task reviewer, both querying the actual committed map directly, not trusting any report's prose):
- **Schema 1.7. 165 pages / 165 flows** (up from the prior 155 — normal crawl-to-crawl page-count variability, not a regression).
- **4,222 element rows**, down from the pre-fix baseline of **4,809** — a real, measured reduction.
- **4,222 / 4,222 unique `MapElement.id` values — ZERO duplicates.** This is the core B17 guardrail, met.
- **484 elements carry `count > 1`** — proof real dedup is happening, not just an empty schema field.
- `pnpm test` (manual reference suite): **4/4 PASS, zero retries** — no add-to-cart retry needed this run.
- `pnpm plan --update`: **5/165 flows covered** — same ballpark as the pre-B17 5/155 (F18's result), confirming **no coverage regression**; B17 touches no flow/matching logic at all.
- `pnpm build-tests --top 3` + `pnpm test:generated`: **26/26 passed** (this session's 4 fresh specs + 21 pre-existing accumulated drafts + setup) — all green, no stale-draft failures this time (unlike F18's 23/24 in §20).
- `pnpm test:unit`: **258/258.** `pnpm typecheck` / `pnpm lint`: clean.

**Code-review findings — all resolved within the branch, none carried forward.** Task 2's review found and fixed the `triggerElementId` occurrence-index gap described above (plus a citation nit). Task 4's review surfaced two narrative-only Minors — the initial report didn't mention the mid-crawl rate-limit interruption (now recorded here), and a small breakdown-arithmetic slip in the `test:generated` count reconciliation (the 26/26 total was still correct). Neither affects the deliverable; neither needs its own backlog entry.

**B17 closed.** Both remaining ⚠ schema/contract-affecting audit items (B17 = F1, F18 = F5) are now done. Per the audit's own §3 sequencing the next table item is F8 (centralizing the act→verify→retry idiom), but it is rated ⚠ ("touches every live-validated interaction path... mandates a full live re-validation pass... human call on whether the consolidation is worth it now") — so it is a candidate, not an auto-declared next milestone, alongside F3 (Order-2, small, output-identical) and the lower-priority C11/C13/D15. Confirm with Jorge before starting brainstorm/spec work, per the standing working agreement.

---

## 22. D15 phase 1 — the real DES checkout, reached for the first time (2026-07-14)

**Backlog:** §D, item D15 (phase 1: reach + capture knowledge; payment/shipping forms deliberately deferred to a future phase 2, per Jorge's scope decision). Probe run live via a temporary `tests/_probe/d15-checkout-probe.spec.ts` (deleted after this section, same lifecycle as the A5 probe §18).

**Captured live — the knowledge that was missing since B13:**
- **The real checkout URL is `/es/checkout.html`** (title: "Checkout | Bershka"). First time any part of this project has reached it — the crawler never can (link-following only; checkout sits behind a cart with items).
- **The entry affordance is "Tramitar pedido"** on `/es/shop-cart.html`.
- **B13's Checkout path-hint list is now VALIDATED against reality:** the classifier's `/checkout|order|pago|payment/i` requirement (recorded in §13 as "a best guess to confirm against the real DES checkout URL when one is first reached — D15") matches `checkout.html` directly. The best guess was right; no classifier change needed.
- The probe's first attempt hit the documented add-to-cart environment noise (size dialog not closing, §14/§16/§18) — the retry captured everything. The cart's `<main>`-scoped aria snapshot was empty at +5s (skeleton still rendering) while the page-level "Tramitar pedido" locator resolved fine — consistent with §5's "cart-page content renders as a slow skeleton" finding.

**Permanent spec shipped: `tests/checkout/checkout-reach.spec.ts`** — walks the full UI path (search → PDP → add → cart → "Tramitar pedido") and verifies `/es/checkout.html` loads (URL + title). Guards: `test.skip(!env.checkoutAllowed)` — never runs where checkout is disallowed (prod). Never fills payment, never places an order. Uses F8's `actUntil` for the checkout click (act→verify→retry — the click can be lost to the cart skeleton's late hydration, observed on the spec's own first live attempt: no navigation within 30s, retry passed; the same documented noise class as §14/§16/§18).

**Deliberately NOT done (phase 2 material, needs its own scope round):** checkout's inner structure (shipping/payment forms) — the probe's post-navigation body snapshot came back essentially empty at +5s (checkout SPA hydrates slowly; a dedicated settle/probe pass is needed); whether `/es/checkout.html` is server-routable (the spec walks the UI path on purpose); test payment methods on DES (unknown — do not guess).

**Also unblocked:** `pnpm ask "prueba el checkout"` still answers no-match honestly — the *map* has no Checkout flow (the crawler still can't reach it). The knowledge captured here lives in this doc and the spec; feeding a checkout flow into the map (e.g. a must-capture-style seeded route) is phase-2 material.

**Known cosmetic side effect (pre-existing):** probe + spec runs add items to the shared test account's cart; no cleanup fixture exists (§7's open lead, unchanged).

---


## 23. D15 phase 2 — checkout inner structure, settle profile, routability (2026-07-18)

**Task:** D15 phase 2, Task 1 (plan: `docs/superpowers/plans/2026-07-18-d15-phase2-checkout-inner.md`; design: `docs/superpowers/specs/2026-07-18-d15-phase2-checkout-inner-design.md`). Temporary probe `tests/_probe/d15-checkout-inner-probe.spec.ts` (deleted after this section, same lifecycle as §18/§22). **Strict read-only inside checkout honored throughout: nothing on `/es/checkout.html` was ever focused, filled, or clicked** — all structure below comes from `ariaSnapshot()` of the page as it renders.

### Headline results

- **`/es/checkout.html` IS server-routable with a non-empty cart.** Direct `goto` lands on it — no redirect. Confirmed in **two independent browser contexts** this session (a standalone spike context, plus the probe's context — where both the entry navigation and the Q3 re-check landed; those two share a context, so they count as one independent confirmation, not two). **Branch decision: C (routable).**
- Settle profile measured (Q1 below); **`CHECKOUT_SETTLE` derived: `{ minWaitMs: 13_000, maxWaitMs: 26_000, pollIntervalMs: 500 }`** (first stable Q1 mark +12s, +1s margin; ceiling 2×).
- The read-only entry state exposes **only the shipping-method step** — no shipping address form and **no payment methods anywhere in the tree**. Payment knowledge requires selecting a shipping method (a click — out of scope under the strict read-only rule; a future phase decision for Jorge, do not guess).

### Environment turbulence found on the way (RIGOR Regla 7 — none of this is smoothed over)

The brief's verbatim probe (UI priming: search → PDP → add → cart → "Tramitar pedido") was **unrunnable tonight** (evening session, 2026-07-18, consistent with §7's service-quality-varies-within-a-day pattern). Four distinct, live-confirmed causes, in discovery order:

1. **The login interstitial is BACK — §19's premise is reopened.** `auth.setup` failed 2/2 (120s timeout each): `/es/logon.html` again renders the pre-A6 **"Continuar con e-mail" / "Continuar con Facebook"** method-choice screen (§4's original recipe), which the post-A6 `LoginPage.login()` (direct e-mail form, §19) cannot pass. This confirms §19's explicitly-unruled-out hypothesis: the flow is server-side variant-switched (A/B or config), not permanently drifted. The stored `.auth/state.json` had also expired (member-hub redirected to logon). A fresh session was minted via a temporary scratchpad script handling BOTH variants; notably, the interstitial button needed **one plain actionability-waiting `click()` after a ~5s settle** — rapid `force: true` clicks at 1s cadence were ALL silently lost (57 clicks/60s, form never opened): §7's hydration-lag doctrine confirmed again, and a reminder that `force: true` retry loops are not automatically safer. **`LoginPage.login()` needs a dual-variant fix (tolerate both the interstitial and the direct form) — NOT shipped here (outside Task 1's file list); recorded as an open item for Jorge.**
2. **`/es/q/` search results served dead loads persistently:** 5 consecutive dead `/q/camiseta` loads across two independent contexts over ~30 min (grid never rendered; §7's documented noise class, but tonight sustained, not intermittent). Search-based cart priming was abandoned after discrimination probes, per §7's own doctrine.
3. **Category URL scheme drift (real catalog drift, not noise):** the old `-n{digits}.html` category URLs — including `/es/mujer/ropa/camisetas-n4365.html`, §10's own probe page — now render a SPA 404 ("Oh no… esto es un 404") with the degraded generic title "Bershka | Bershka". The store home is healthy (133 anchors, correct title) and its category links now use **`-c{digits}.html`** (e.g. `/es/mujer/ropa/tops-y-bodies-c1010193220.html`, which rendered 10 product cards + 10 per-card quick-adds cleanly). Consequences: the committed map's category routes are stale until the next re-crawl; the PDP pattern `-c0p<digits>.html` is unaffected (category ids observed all start `c1…`, no `0p`).
4. **The cart page's content service was down:** `/es/shop-cart.html`'s `<main>` stayed an EMPTY skeleton for 60+ seconds in a clean independent context (and across 6 reload rounds in probe attempts), so "Tramitar pedido" never existed to click — while the header tab read "Cesta (3)", proving the cart items are real server-side. §5's "slow skeleton" finding, degraded to "never renders" tonight. **Phase 1's `checkout-reach.spec.ts` would fail tonight for this reason** — environment, not regression. Even the tab's "(N)" count intermittently failed to hydrate (observed bare "Cesta" for 50+s in one probe attempt; "Cesta (5)" within the poll budget in the passing run).

### Probe shape actually run (deviation from the brief, recorded honestly)

Because of (2)+(4), the passing probe run primed nothing itself: the cart already held the items added **earlier this same session** via the working path — category PLP (`-c1010193220.html`) → first standard card (A5's predicate: has quick-add, not Personalizable) → PDP → `ProductPage.selectFirstSize()`/`addToCart()` (the proven Tallas recipe, which worked fine tonight) — during earlier probe attempts (cart grew 3→5 items across runs; §7's no-cleanup accumulation, unchanged). The probe then: verified the cart tab (best-effort observation, `"Cesta (5)"`, count hydrated), entered checkout by **direct `goto`** (the same entry branch C's crawler seeding will use — so Q1's numbers measure exactly what Tasks 4C/5 will consume), ran Q1/Q2 verbatim, then Q3 verbatim. **PASS, attempt 1, 1.0m, no retries.**

### Q1 — settle profile (real console output, passing run)

| mark | len | changed |
|---|---|---|
| +2000ms | 144 | true |
| +5000ms | 378 | true |
| +8000ms | 994 | true |
| +12000ms | 994 | **false** ← first stable mark |
| +20000ms | 994 | false |

Corroborating spike run (same session, minutes earlier): `+2s len=378`, `+5s len=378 changed=false`, `+8s len=994 changed=true`, `+12s/+20s len=994 stable` — i.e. **checkout exhibits §10's false-stable plateau**: the 378-length shell can sit unchanged across consecutive reads before content arrives ~+8s. A naive two-identical-reads poll without a floor would lock onto the shell — `CHECKOUT_SETTLE`'s `minWaitMs` floor exists for exactly this (same design as `DEFAULT_SETTLE`, §10). Derived numbers: **`minWaitMs: 13_000`** (first stable mark 12s + 1s margin), **`maxWaitMs: 26_000`** (2×), **`pollIntervalMs: 500`**.

Two caveats on these numbers: (a) they were measured on a degraded-service evening (see the turbulence list above) and may be conservative — a healthy-window re-measure could tighten the floor; (b) Q1 measured the **direct-`goto` entry profile** — a "Tramitar pedido" SPA navigation from an already-hydrated cart could settle on a different profile, and Task 5's spec should keep that in mind.

### Q2 — inner structure (verbatim aria dump, entry state, read-only)

```yaml
- link "Saltar al contenido principal":
  - /url: "#main-content"
- status
- main "Contenido principal":
  - navigation:
    - heading "Método de envío" [level=1]
    - button "Cerrar"
  - heading "Método de envío" [level=2]
  - list:
    - listitem:
      - paragraph:
        - button "Recógelo en 4 horas"
      - paragraph: Disponible en alguna de nuestras tiendas Gratis
      - img
    - listitem:
      - paragraph:
        - button "Recoger en tienda"
      - paragraph: Recíbelo entre Lunes 20 - Miércoles 22
      - paragraph: Gratis
      - img
    - listitem:
      - paragraph:
        - button "Envío estándar a domicilio"
      - paragraph: Recíbelo entre Lunes 20 - Jueves 23
      - paragraph: Antes 3,95 € Gratis
      - img
  - text: Total
  - link "(Impuestos, en su caso, incluidos)":
    - /url: https://static.bershka.net/4/static/itxwebstandard/docs/termsandconditions/terms_and_conditions_es_ES.pdf?t=20260718015333
  - text: 119,95 €
  - button "Ver detalle de costes"
```

**Structural summary:**
- **Checkout steps seen:** exactly one — **shipping-method selection** ("Método de envío"). The SPA's entry state is a method chooser, not a form.
- **Shipping-form fields:** **none exist in the entry state** — no address inputs, no textboxes at all. (Do not guess what a later step renders.)
- **Payment methods listed:** **none are exposed in the read-only tree.** Reaching the payment step requires clicking a shipping method — forbidden by this phase's strict read-only rule. Recorded plainly: **the payment-method inventory D15 wanted is NOT obtainable read-only from the entry state**; it needs a future, explicitly-scoped interaction decision with Jorge.
- Shipping options (buttons, exact accessible names): `"Recógelo en 4 horas"`, `"Recoger en tienda"`, `"Envío estándar a domicilio"`.
- The checkout page renders **no store header/footer chrome** (no search pill, no cart tab, no nav drawer in the tree) — every element above is page-specific, which is good news for loaded-signal selection.
- Strict-mode hazard for Task 5: `"Método de envío"` appears as **two headings** (level 1 inside `navigation`, level 2 in `main`) — a bare `getByRole('heading', { name: 'Método de envío' })` will hit a strict-mode violation; scope or pick a level.

**Two most page-specific, stable-looking structural signals for Task 5's spec (chosen from the dump; none are header/chrome — the page has none):**
1. **Shipping-side:** `role: button`, name **`"Envío estándar a domicilio"`** (unique; the standard-shipping option is the least likely of the three to vary by store/campaign).
2. **Payment-side: not available read-only** (see above). Recorded substitute, cost-summary side: `role: button`, name **`"Ver detalle de costes"`** (unique, page-specific, part of the order-total block). Task 5 must treat this as the second signal *in lieu of* a payment element, not as evidence a payment element exists.

### Q3 — routability (raw verdict)

- Probe run: `[Q3] attempt 1: goto /es/checkout.html landed on https://des-ecombknj-test-webecom.bk.apps.axdesecocp1.ecommerce.inditex.grp/es/checkout.html` — routable on the first attempt, second attempt not needed per the probe's own loop rule.
- Standalone spike (independent context, minutes earlier): the same direct `goto` landed on `/es/checkout.html`, title `"Checkout | Bershka"`.
- The probe's own entry navigation was also a successful direct `goto` — but it shares the probe's browser context with the Q3 attempt above, so the honest count is two independent confirmations (spike context + probe context), not three.

**Branch decision: C (routable).** §22's open question ("whether `/es/checkout.html` is server-routable") is now answered: yes, with a non-empty cart and an authenticated session. Not tested (out of scope, do not assume): direct `goto` with an EMPTY cart, or anonymous.

### Open items handed forward

- **`LoginPage.login()` dual-variant fix** (the interstitial is back — item 1 above): needed before any suite run that depends on `auth.setup`; decide with Jorge whether it lands inside this phase's tasks or as its own item. **DONE 2026-07-18 — Jorge authorized inserting it as Task 4.5 of this phase; shipped and live-validated (setup 1/1 PASS, 42.1s, no retry, variant A served — see the Status paragraph's ⚠ note).**
- **Map/category staleness** from the `-n{digits}` → `-c{digits}` category URL drift (item 3): the next `pnpm explore --update` re-crawl will re-root category knowledge; until then the committed map's PLP routes 404. **2026-07-21 update: the drift is UNSTABLE, not permanent — the old `-n{digits}.html` category URLs rendered normally again in all three of this session's crawls (real PLP grids, interactions running on them). The committed map reflects what the closing crawl saw; treat the `-n`/`-c` scheme as environment-variable, not as a one-way migration.**
- **Payment-step capture** needs a scoped interaction decision (click one shipping method, read-only beyond that?) — future phase, Jorge's call.
- Cart accumulation grew to 5 items on the shared account (§7's cleanup-fixture lead, unchanged, cosmetic). **2026-07-21 update: DES purged the shared cart server-side at some point between 2026-07-18 and 2026-07-21 (itemCount 0 confirmed by direct probe) — accumulation is bounded by pre-prod purges, which also means a non-empty cart can NOT be assumed across days (see the primeCart episode in the completion section below).**

### D15 phase 2 COMPLETED (2026-07-21) — Tasks 5 and 6 closed, all gates green

**Task 5 — permanent spec `tests/checkout/checkout-structure.spec.ts` (commit `edaa296`).** The `/es/q/` outage that paused the phase (4/4 dead loads across 2026-07-18/19) is over — search walked healthy in every run this session. The health-check-by-running-the-spec surfaced a real signal drift instead: the spec failed BOTH attempts with checkout fully rendered, because the cost-summary disclosure button's accessible name is **state-dependent** — `"Ver detalle de costes"` collapsed (§23's Q2 capture) vs **`"Ocultar detalle de costes"` expanded**, which is how checkout rendered that run (`[expanded]` in both failure snapshots). Root-caused from the error-context snapshots; fix: the in-lieu-of payment signal accepts both names (either proves the cost-summary block rendered), documented in the spec header. After the fix: spec PASS (retry #1 — first attempt was the pre-existing Tallas-dialog-close noise §14/§16/§18, before reaching checkout), then **full suite 7/7 PASS, zero retries, 2.9m**. Both names have now been observed live (spec run: expanded; closing crawl's capture: collapsed) — the toggle state at entry is not deterministic.

**Task 6 Step 1 — the opted-in crawl took three attempts (stated plainly, RIGOR Regla 7).** Attempt 1 was externally stopped mid-anon-session (~13 min in; map untouched — `--update` writes only on completion). Attempt 2 completed (exit 0, map written) **but `primeCart` returned `failed` and the checkout seed was skipped** — the never-throws contract worked as designed, but the gate wasn't met. Diagnosed with a temporary probe (deleted, §18 lifecycle) instead of blind re-runs: `goToCart()` and `cartTab().itemCount()` both worked fine and returned **0 — DES had purged the shared cart server-side** (≥5 items on 2026-07-18 → 0), so `cartCount() === 0` was legitimate and the recovery `addOneItem()` fell to the documented Tallas-dialog noise (the same class hit `add-to-cart.spec`'s first attempt minutes later). Neither watch item from Task 3's review (empty-cart tab shape; lost `goToCart` click) was the cause. Mitigation: pre-primed the cart via `add-to-cart.spec` (PASS, retry #1), re-ran the crawl. Attempt 3: completed, `primeCart` short-circuited (no failure line), **checkout crawled and in the canonical map**.

**Map verified directly (JSON, not logs — B17 precedent):** schema 1.7, **154 pages / 154 flows**. `/es/checkout.html` present (auth session), `pageType: Checkout`, **5 elements** — exactly §23's Q2 inventory: `Cerrar`, the 3 shipping-method buttons, and the cost-summary disclosure (captured collapsed, `"Ver detalle de costes"`). **1 Checkout-typed flow** (single-step, auth — the branch-C direct-goto seed shape). **B17 guard: 4,245/4,245 unique element ids, zero duplicates.** 1 interaction recorded on the checkout page — **the `"Cerrar"` click, outcome `none`** (not a shipping-method click). Note: the M8 interaction pass also attempted clicks on two shipping-method buttons (`"Recógelo en 4 horas"`, `"Recoger en tienda"`) — both timed out with no effect and produced no map interaction, so the strict read-only stance survived de facto; a future payment-step scope round should not assume the crawler's clicks would land there anyway.

**`pnpm ask` gate — resolution works, draft generation intentionally blocked; Jorge's call recorded.** Both `pnpm ask "checkout"` and `pnpm ask "prueba el checkout"` resolve to the Checkout flow (score 65, explainable: token + type match — no blind-spot message; the map-derived answer works exactly as B-NL1 designed). But the Builder's **deliberate `CHECKOUT_ROUTE` path guard** (`builder/select.ts`, original Builder Engine 2026-07-03: generated specs never navigate to checkout; they carry no `checkoutAllowed` skip) refuses the journey: `"checkout-looking route, skipped by path guard"`, exit 1. This is a **design gap in the phase-2 spec** — its §7 gate 3 expected a passing draft, but its zero-change verification only checked `intent/`, never the Builder guard. **Jorge's decision (2026-07-21): keep the guard, close the gate as resolution-only.** Generating checkout drafts safely (template gains `test.skip(!env.checkoutAllowed)` + guard allows single-step checkout flows) is filed as a future backlog item, not smuggled into this phase.

**Remaining gates:** default-crawl boundary check — a 10-page/session crawl WITHOUT the flag: 16 pages, **0 checkout pages in the run report, zero primeCart/seed output** (opt-in boundary demonstrated). Offline: unit **399/399** (incl. `resolve` 9/9 — the blind-spot test still passes against its own checkout-less fixture map), typecheck/lint clean.

**Net cart effect this session:** purge to 0 (DES) → +1 (pre-prime) → +1 per checkout-structure/add-to-cart run — the seed itself added nothing (short-circuit). §7's cleanup-fixture lead unchanged.

---

---

## 25. PDP wishlist button — confirmed live on desktop; repeated-element strict-mode bug found and fixed (2026-08-04)

**Context:** onboarding Fase 5 repeat (Automatización), run fully interactively — Jorge executing every command and reading the real console output, per the standing agreement after the two invalidated prior attempts (see `docs/onboarding/manual-del-alumno.md`, "🔖 Dónde retomar"). Exercise: hand-write a wishlist spec, POM pattern, on the now-stabilized true-desktop base (§24).

**Confirmed selector (desktop) — no divergence from historical mobile knowledge.** On the PDP, `getByRole('button', { name: 'Añadir a la lista de deseos' })` toggles, on click, to `getByRole('button', { name: 'Eliminar de la lista de deseos' })` — same element, same accessible name flip as the confirmation signal. No dialog, no login gate, no separate confirm step (probed live via `codegen` against `?device=desktop`). Shipped: `ProductPage.addToWishlist()` / `ProductPage.isInWishlist()` (`src/pages/ProductPage.ts`), `tests/wishlist/add-to-wishlist.spec.ts`.

**A real bug found and fixed (systematic-debugging, not blind-retried).** The first live run failed — `ProductPage: wishlist button did not confirm the add within the deadline` — despite the failure's own captured aria snapshot showing the main product's button had already toggled correctly to "Eliminar de la lista de deseos". Root-caused directly from that snapshot, not guessed: the PDP's own "También te puede gustar" recommendations carousel repeats the **exact same accessible name** (`"Añadir a la lista de deseos"` / `"Eliminar de la lista de deseos"`) once per recommended product card — the same repeated-element family already documented for testIds in B16/M8b, here hitting a bare role-based locator instead. Once the carousel had rendered (observed as arriving after the main click, mid-poll), a bare `getByRole(...).isVisible()` resolved to 3 elements (the main button + 2 recommendation cards, one of them a self-referencing recommendation of the exact same product) and threw a strict-mode violation — which `isInWishlist()`'s `.catch(() => false)` (written to mean "button not found yet") silently swallowed, masking an already-successful state change and starving `actUntil`'s `verify()` forever.

**Fix: ⚠ SUPERSEDED by §31 (2026-08-10) — the reasoning below was REFUTED and the `.first()` is gone.** Order only breaks ties among elements that *match*, and this button renames itself by state: the moment the main product leaves the wishlist its button stops matching the remove-name and `.first()` slides to a cross-selling card. The locators are now scoped to `div.product-detail-info__labels-wishlist` with no `.first()`. Original text kept for the record, because §31 reasons about it: ~~`.first()` on both the query locator and the add-button locator — the main product's own button always renders before the recommendations carousel in DOM order (confirmed directly in the failure snapshot), so `.first()` always resolves to the main product, never a recommendation card. Same "any exemplar via `.first()`" precedent M9 (§17) already established for a different repeated-trigger hazard.~~

**Live validation:** 2 consecutive standalone runs of the new spec after the fix, 2/2 passed, zero retries (23-72s each — ordinary DES-speed variance, not flakiness). Full manual reference suite: **8/8 PASSED, zero retries** (`pnpm test`, 5.5m) — the first fully green full-suite run since the interceptor merge that also includes the newly promoted wishlist spec, confirming no regression in the shared `ProductPage.ts` file.

**Decision on the prior mobile-era attempt:** the stash `fase5-solo-attempt-2026-07-29` (the invalidated solo attempt from the first try at this exercise — mobile-only knowledge, MMBRS promo-modal auto-dismiss + a bounded `ProductCard.open()` click + an old wishlist spec) was discarded (`git stash drop`) rather than reused — this session's implementation was built fresh from live desktop probes, per the onboarding manual's rule (c).

**Closes the onboarding Fase 5 repeat.**

---

---

## 30. Coverage expansion round 2 — 10 more Builder drafts promoted, suite 15 → 25, coverage 26 → 38/139 (2026-08-06)

**Context.** Same day as §29, later session. Jorge asked directly for more coverage; `pnpm plan` was already the answer to "what measures it", but raising the number meant repeating §26's promote-from-drafts cycle: `pnpm build-tests --top 10` → review → promote → validate live.

**Drafts reviewed before touching anything (11 generated, not 10 — one turned out redundant).** `pnpm build-tests --top 10` wrote 10 journey drafts + 1 interaction draft. The interaction draft (`inter_e04838ecc799` / `flow_960ceaa6b799`, product `vestidos-n3802`) was a **byte-identical duplicate of the already-promoted `tests/mujer/vestidos-tallas-overlay.spec.ts`** (§26) — the planner still lists that flow as uncovered because its evidence-matching doesn't recognise the promoted spec's manually-renamed page object as satisfying the same flow id. Discarded, not promoted; the mismatch itself is cosmetic (the flow genuinely has a spec), not a new defect.

**The redundancy shape from §26 recurred, but wasn't actually the same problem.** 8 of the remaining 10 drafts shared the chain `h-woman → combo-wins-n5214.html → PDP`, split across the same two signal shapes §26 already named (3 × `role button "Anterior"`, 5 × `testId addToCartBtn`). Unlike §26's five drafts — which were **the same PDP** captured by different crawl sessions — these 8 are **8 genuinely different products**, each a distinct flow id the planner independently lists as high-priority and uncovered. Promoting all of them is real coverage, not padding; asked Jorge to choose the scope explicitly rather than deciding unilaterally (a real suite-size/runtime trade-off, not a redundant-duplicate call like §26's). **Decision: promote all 10** (the 2 PLPs + all 8 PDPs).

**Signal hardening repeated §26's zero-live-probe trick.** Every new page object got the same two-part `isLoaded()`: a `page.title()` prefix check (sourced straight from the committed map's own `title` field for that page, crawl 2026-07-30) ahead of the Builder's original structural signal. One title collision found and recorded honestly rather than hidden: `"COMBO WINS % | Bershka"` is shared by **6** map entries (confirmed by grep before writing the comment) — same limitation §26 already flagged for a different combo-wins page — so `PantalonesComboWinsPlpPage`'s title check proves the right *campaign*, not uniquely this PLP; the `filterButton` structural signal is what actually anchors it. All other 9 titles were grep-checked unique (1-2 hits, the 2 being anon/auth session twins) before writing the regex.

**Live validation, in two passes (a real mistake made and caught, not glossed over).** First pass ran only the 10 new specs standalone: 11/11 passed (setup + 10), zero retries, 3.0m. Ran `pnpm plan --update` immediately after and coverage **dropped** to 17/139 — a mistake, not a regression: `reports/route-evidence.json` is overwritten by whichever `pnpm test` invocation ran last, not accumulated across runs, so the planner only saw the 10 new specs' evidence and briefly "forgot" the other 15. Fixed by re-running the **full** `pnpm test` (all 25 specs) before updating the plan. Full suite: **23/25 passed, 2 flaky, 0 failed** — recovered on retry #1 both times, and neither was one of the 10 new specs (zero regression from the promotion itself):
- `add-to-cart.spec` — the "confirmation drawer never appeared" error, same shape §28 fixed the *detector* for. This is its **3rd occurrence today** with the corrected content-based detector in place, which shifts the weight of evidence: this now reads as genuine intermittent DES noise rather than a lingering detection bug. Not re-opened, just noted for whoever next investigates it.
- `hombre/lo-mas-vendido.spec` — a fresh `isLoaded()` timeout, first time seen on this spec. Recovered on retry; treated as one-off environment noise, not chased.

**Coverage after full-suite evidence: 38/139 flows (evidence: 24 passed tests)** — up from 26/139 (this same day's earlier `qa-cycle` run) and the best number in the map's history by a wide margin (prior bests: 10/140 §24, 5/155 §20). `typecheck`/`lint` clean throughout.

**Method note for next time a coverage push happens:** `pnpm plan --update` only ever reflects the *most recent* `pnpm test` invocation's route evidence — always run the full suite (not a filtered subset) immediately before updating the plan, or the coverage number will silently regress to whatever subset happened to run last.

---

---

## 32. Cart inner structure — probed live for the first time (2026-08-13)

**Context.** Cart-regression effort, Task 1 (plan: `docs/superpowers/plans/2026-08-13-cart-regression.md`). The functional map holds **0 elements** for `/es/shop-cart.html` (the crawler has never had a reason to interact past it) and no remove/quantity selector had ever been confirmed against DES — this section is the first live look inside `/es/shop-cart.html`'s content. Temporary probe `tests/_probe/cart-inner-probe.spec.ts` (deleted after this section, same §18 lifecycle as §18/§22/§23/§31). Full P1–P8 answers are recorded in the plan's Probe Results table; this section carries the verbatim evidence and the two live surprises the round-2 script had to adapt to. **Note on the aria dumps below:** the recommendation/"Podría gustarte"/"Te puede interesar" carousel subtree is deliberately elided to `(N recommendation cards, each an article inside a listitem)` rather than expanded — a length choice, not a claim that the real console output stopped there.

### Round 1 (observe only) — real content dump, quantity 1

Primed via the proven recipe (search "camiseta" → first standard card → PDP → select size → add), entered the cart, dumped `main` at t0 (skeleton) and t+12s (real content):

```yaml
# t0 — mid-load skeleton
- main "Contenido principal"
```

```yaml
# t+12s — real content, one line, quantity 1
- main "Contenido principal":
  - link:
    - /url: /es/camiseta-ajustada-spider-man-c0p228471235.html?colorId=600
  - link "Camiseta ajustada SPIDER-MAN":
    - /url: /es/camiseta-ajustada-spider-man-c0p228471235.html?colorId=600
  - text: 15,99 € XS Rojo
  - button "Eliminar producto"
  - status: "1"
  - button "Sumar unidad"
  - alertdialog "Te faltan 19,01 € para conseguir tu envío estándar gratis":
    - text: Información
    - paragraph: Te faltan 19,01 € para conseguir tu envío estándar gratis
  - text: Total
  - link "(Impuestos, en su caso, incluidos)"
  - text: 15,99 €
  - button "Tramitar pedido"
  - button "Comprar con Apple Pay"
  - list: [Ticket regalo checkbox, Código promocional checkbox]
  - heading "Podría gustarte" [level=2]
  - list "Productos que te pueden interesar": (19 recommendation cards, each an `article` inside a `listitem`)
```

Structured queries confirmed: `[P7 TAB] 1`; only `/eliminar/i` (→ "Eliminar producto", count=1) and `/unidad/i` (→ "Sumar unidad", count=1) matched any button name out of the 7 candidate regexes tried; `[P3 SPINBUTTONS] 0`; `[P3 COMBOBOXES] 0`; `[P1 MAIN LISTITEMS] 21` / `[P1 MAIN ARTICLES] 19` (both fully accounted for by the recommendations list + the 2 gift-ticket/promo-code items — **zero** belong to the cart's own line); `[P6 TOTAL-ish] ["Total"]` (the € amount is a separate text node, not part of this match).

**Ancestor chain (the anchoring container, same technique as §31):**
```
BUTTON.bds-button bds-button-icon bds-button--size-s bds-button--tertiary
  < DIV.quantity-selector product-card-full-screen__quantity-selector
  < DIV.product-list-card__wrapper
  < DIV.product-list-card__content
  < DIV.product-list-card product-card-full-screen product-list-card--desktop
  < DIV.shop-cart__grid < DIV.shop-cart__products < DIV.shop-cart
```
Both "Eliminar producto" and "Sumar unidad" share this exact chain — the line-item container is `div.product-list-card.product-card-full-screen.product-list-card--desktop`, a plain CSS-classed div with **no wrapping ARIA role**. This directly falsifies the plan's provisional `CartPage.lineItems()`, which used `getByRole('listitem')` — that call would match only recommendation cards, never the cart's own line.

### Surprise 1 — the remove button is state-dependent, found by round 2's first (adapted) attempt

Round 2's script (brief-provided, `REMOVE_NAME = /eliminar producto/i`) re-ran the identical prime step. DES **merged** the newly-added unit into the *existing* line rather than creating a second one — the dump showed one line at **quantity 2**, with `button "Restar unidad"` present and **`button "Eliminar producto"` absent entirely**. The unmodified removal loop found 0 matches, no-opped, and the "[P5 EMPTY STATE]" capture was actually still the loaded 2-unit state — caught by reading the output rather than trusting the PASS.

**Adapted per the brief's own guidance** ("record exactly what you saw in P2 and adapt round 2's step-5 loop minimally"): the loop now targets `/eliminar producto|restar unidad/i` (whichever name is present) and uses the header tab's unit count — confirmed to track total units exactly (P7) — as the settle signal instead of the combined-button count (which legitimately stays at "1 button present" across a decrement, since exactly one of the two names is always shown while units remain).

### Round 2 (adapted) — full drain to zero, quantity 13 → 0, and a live re-confirmation of §28's second-order damage

The re-run's **first attempt failed** inside the priming step: `ProductPage: the add-to-cart confirmation drawer never appeared (add not confirmed)` — the exact §28-documented DES noise class, still occurring 2026-08-13 (a further occurrence beyond §26/§27/§30's tally, consistent with §30's read that it is genuine intermittent environment noise, not a lingering detector bug). §28's own predicted "second-order damage" reproduced live: while the confirmation-drawer detector kept failing, `addToCart`'s act kept re-clicking "Añadir a la cesta" for the full 20s deadline, and **each click was a real, separate server-side add** — the line's quantity jumped from 2 to **13** (+11) during that one failed attempt, confirmed by the retry's own opening dump. **Retry #1 passed** (1.5m) with the drawer confirming normally, and the removal loop then drained all 13 units cleanly:

```
[P2 REMOVE] clicked "Restar unidad", tab 13 -> 12
[P2 REMOVE] clicked "Restar unidad", tab 12 -> 11
[P2 REMOVE] clicked "Restar unidad", tab 11 -> 10
[P2 REMOVE] clicked "Restar unidad", tab 10 -> 9
[P2 REMOVE] clicked "Restar unidad", tab 9 -> 8
[P2 REMOVE] clicked "Restar unidad", tab 8 -> 7
[P2 REMOVE] clicked "Restar unidad", tab 7 -> 6
[P2 REMOVE] clicked "Restar unidad", tab 6 -> 5
[P2 REMOVE] clicked "Restar unidad", tab 5 -> 4
[P2 REMOVE] clicked "Restar unidad", tab 4 -> 3
[P2 REMOVE] clicked "Restar unidad", tab 3 -> 2
[P2 REMOVE] clicked "Restar unidad", tab 2 -> 1
[P2 REMOVE] clicked "Eliminar producto", tab 1 -> 0
```

Every one of the 13 clicks dropped the tab count by exactly 1 (no confirm dialog ever intervened), and the last click's button name — "Eliminar producto" — confirms the state-dependent swap holds symmetrically on the way down too: decrementing to quantity 1 restores the trash-icon button, which then performs the actual removal.

**P5 — the real empty state, captured this time:**

```yaml
- main "Contenido principal":
  - img
  - text: Cesta vacía Aún no tienes ningún artículo en la cesta, descubre todo lo que tenemos para ti
  - link "Descubrir":
    - /url: /es/h-woman.html
  - heading "Te puede interesar" [level=2]
  - list "Productos que te pueden interesar": (16 recommendation cards)
```

`[P5 TAB FINAL] 0` — the header tab independently corroborates the empty state.

### Surprise 2 — the Total label and its € amount are separate text nodes, and a Subtotal breakdown can appear alongside it

Added after round 1's dump showed `[P6 TOTAL-ish]` returning `["Total"]` with no amount attached: an ancestor-chain probe (same technique as above) on both the "Total" text and the `/€/`-suffixed amount texts found they render as **separate sibling nodes**, not one combined string:

```
[P6 TOTAL LABEL ancestors] SPAN.total-amount-module__title bds-typography-label-m-highlight
  < DIV.total-amount-module__title-wrapper < DIV.total-amount-module__content
  < DIV.total-amount-module < DIV.total-module__content < DIV.bds-button-dock__content
  < DIV.bds-button-dock total-module__button-dock ... < DIV.total-module shop-cart-total-dock__module

[P6 TOTAL AMOUNT ancestors] SPAN.current-price-elem
  < DIV.price-elem total-amount-module__price bds-typography-label-l-highlight price-grid
  < DIV.total-amount-module__price-and-touch < DIV.total-amount-module__content
  < DIV.total-amount-module < DIV.total-module__content < DIV.bds-button-dock__content
```

`div.total-amount-module` is the nearest shared ancestor of both — the correct scoping container for `CartPage.totalRegion()`, replacing the plan's provisional bare `getByText(/total/i)` (which returns only the label, never the €, so `parseEuroAmount` would see `null`). At 13 units (past the free-shipping threshold, with the "Ocultar detalle de costes" [expanded] cost breakdown rendered) a sibling `paragraph "Subtotal"` also appeared, and `[P6 TOTAL-ish]` correspondingly returned `["Subtotal","Total"]` — a live-confirmed false-positive risk for any locator scoped no tighter than `main` and matched on `/total/i` alone. `div.total-amount-module` does not contain "Subtotal" (that lives in the sibling `div.sub-total-module`), so scoping to it avoids the collision.

### Net structural findings (full detail in the plan's Probe Results table P1–P8)

- **P1:** cart line = plain `div.product-list-card...` (no ARIA role), not a `listitem` — anchor via CSS class (§31 precedent).
- **P2:** remove button name is state-dependent — "Eliminar producto" only at quantity 1, "Restar unidad" at quantity ≥2; no confirm dialog on any click (13/13 clean).
- **P3:** quantity control exists, shape = 2-button stepper + `status` readout, no spinbutton/combobox; names "Sumar unidad" / "Restar unidad".
- **P4:** quantity read from a `status`-role element's text (not an input value).
- **P5:** empty state = `getByText(/cesta vacía/i)` — confirmed exact copy above.
- **P6:** total = two separate text nodes under a shared `div.total-amount-module` container; a sibling "Subtotal" can collide with a bare `/total/i` match.
- **P7:** the header tab counts **units**, not lines (1→2→13→0, exact throughout).
- **P8:** the mid-load skeleton is a bare `main` with zero children — indistinguishable from "0 lines" by count alone, confirming the either/or `waitForLoaded()` design is necessary.
- **Bonus, unasked but load-bearing for Task 5's prime step:** re-adding the same product+size to the cart **merges into the existing line's quantity** rather than creating a duplicate line — confirmed twice live (1→2, then the noise-driven 2→13).

### Environment note, not chased

The confirmation-drawer failure and its quantity-inflation side effect (§28's documented mechanism) is recorded here as a live recurrence, not a new defect — consistent with §26/§27/§30's characterization as genuine intermittent DES noise. No action taken beyond noting it; the retry recovered cleanly and the probe's own goal (structural knowledge) was unaffected.

**Probe deleted after this section** (§18 lifecycle). Side effect, deliberate: the shared account's cart is empty at the end of this session.

### Task 7 completion — full validation: three defect fixes recorded, one new gap found live (2026-08-13)

**Context.** Same effort, closing task (plan `docs/superpowers/plans/2026-08-13-cart-regression.md`, Task 7). Between this probe and here, Tasks 2–6 built `parseEuroAmount`, `CartPage` (with the P1–P8 probe results above), `cart-lifecycle.spec.ts`, the `cleanCart`/`ensureEmptyCart` fixture, and tightened `add-to-cart.spec.ts` to assert the 0→1 transition — full detail in `.superpowers/sdd/2026-08-13-cart-regression/task-{1,2,3,4,5,6}-report.md`. ⚠ **Those task reports are GITIGNORED** (`.superpowers/` is not versioned), so they exist only on the machine that ran the effort and are absent from a fresh clone — noted 2026-08-16. Every load-bearing fact from them was deliberately restated in this section; treat the citations as provenance, not as retrievable sources. This section records Task 7's own full-suite validation, the coverage update, and one real defect that validation surfaced for the first time.

**Three defects were found live and fixed during Tasks 3–6** (all in `src/pages/`, all found by the new spec's live validation, none previously known). *(Corrected at session-close audit, 2026-08-13 — the original wording called all three "pre-existing production defects". That was wrong for two of them: #1 and #2 live in `CartPage`, which THIS same effort wrote (Task 3) — they never reached master unfixed; the effort's own live gates caught them pre-merge, which is the method working, not legacy debt. Only #3, in `ProductPage`, is genuinely pre-existing production code — on master since the desktop migration.)*

1. **`CartPage.setQuantity()` click-retry overshoot** — a single intended "increase 1→2" click could balloon to 4 or 19 real server-side units (subtotal-confirmed both times) because the act re-clicked every retry cycle regardless of whether the previous click had already landed. Fixed with an early-return act guard (commit `325e3b3`) — narrows the race, documented as NOT eliminating it (see "residual overshoot", below).
2. **`CartPage.removeFirstItem()` stray re-click + exact-match verify gap** — the same unconditional-re-click shape, plus a verify that only accepted an exact `before − 1` count, so a two-line drain that skipped the intermediate count (confirmed live: `firstLine()` re-resolving into a second line once the first was gone) could never be recognized as the success it already was. Fixed with the same act guard shape and an unconditional `isEmpty()` acceptance branch (commits `12dba87`, `0c09b78`).
3. **`ProductPage.addToCart()`'s desktop add button was page-wide `.first()`-unanchored** — the exact §25/§31 unanchored-`.first()` family, here on the add button rather than the wishlist button: one intended "Añadir a la cesta" click could add a **second, different** product (its identity varied between live runs), because the locator matched the first "Añadir a la cesta"-named button anywhere on the page, not necessarily the main product's. Invisible to the whole suite until now — no prior spec ever counted cart lines (`lineItemCount()`), so a silent second add had nothing to catch it. Fixed by anchoring to `div.product-detail-info__actions` (`mainProductActionsPanel()`, commit `dcdfe89`). **This is §29's "a false green is invisible to the whole agentic stack" thesis, confirmed in production code a third time** (after §25's wishlist button and §31's `.first()` anchoring lesson) — the map/planner/analyzer/healer chain would never have seen this bug, because nothing failed until a spec finally counted what was really in the cart.

**A residual, documented-not-eliminated race remains in `setQuantity()`.** Its docstring is explicit that the fix narrows the overshoot window rather than closing it (a bounded post-click poll, not a single-shot guarantee) — and that prediction held live: one post-fix run (task-5-report.md, Scope expansion 4) still overshot 1→3 on a single click, retry-recovered. This is a new, named noise class for future sessions: **`setQuantity` residual overshoot** — small (1-2 extra units, not the pre-fix 4/19), rare, retry-recovered, root cause understood and accepted as a probability-reducing fix rather than a categorical one. Do not re-diagnose it from scratch if seen again; it is this paragraph.

**§28 drawer noise (`ProductPage: the add-to-cart confirmation drawer never appeared`) fired 3 more times across today's session** (Task 1's probe, Task 5's Scope-expansion-4 regression guard, and this task's own full-suite run on `cart-lifecycle.spec` attempt 1) — consistent with its established characterization as genuine intermittent DES noise, not re-investigated.

**Full-suite validation (`pnpm test`, 26 tests) — 24 passed, 2 failed, both attempts, both cart specs.** `tests/cart/add-to-cart.spec.ts` and `tests/cart/cart-lifecycle.spec.ts` both failed on attempt 1 AND retry #1 — the first time either spec has run inside a full suite (Tasks 4–6 validated `cleanCart`/`cart-lifecycle` only in isolation, immediately after their own fresh `auth.setup`, per their own reports — never after `login.spec`). Read from each failure's own `error-context.md` before any re-run, per doctrine:

- `add-to-cart.spec` (both attempts): `CartPage: neither line items nor the empty state rendered within the deadline — cart content service degraded? (findings §23)`, thrown from `CartPage.waitForLoaded()` inside the `cleanCart` fixture — i.e. before the test body even starts. The snapshot in both attempts shows the header's `button "Iniciar sesión"` (not the authenticated state) and `main` rendering the **Mujer home page** (`Categorías destacadas`, `Get the look`, PLP category tiles) — not cart content, not the mid-load skeleton, not the empty-cart copy.
- `cart-lifecycle.spec` attempt 1: a **different** error — `ProductPage: the add-to-cart confirmation drawer never appeared` (the pre-existing §28 class, confirmed unrelated: the snapshot shows a normal, if degraded — title `"Bershka | Bershka"` — page, no dialog present). Retry #1: the **same** `CartPage: neither line items nor the empty state rendered` error as `add-to-cart.spec`, same "Iniciar sesión" header tell.

**Root cause, confirmed rather than guessed at.** The signature (header shows "Iniciar sesión", `main` renders unrelated home content instead of cart content) is exactly findings §24's documented mechanism: **DES single-sessions the shared test account, and `login.spec`'s mid-suite re-auth (it deliberately opts out of the shared `storageState`, `tests/auth/login.spec.ts:5`) invalidates the `auth.setup`-minted session that every other test relies on for the rest of that invocation.** §24 already named this exact tell ("an 'Iniciar sesión' header on a supposedly-authed run") and already shipped a fix for the one place it was known to bite — `src/support/loginGate.ts`, an in-dialog re-login completer wired into `checkout-reach.spec`'s own act, because DES gates **"Tramitar pedido"** on a live session and opens a login dialog in place of navigating when the session is dead. **`CartPage`/`cleanCart` has no equivalent.** Direct navigation to `/es/shop-cart.html` with a dead session does not open a login dialog the way clicking "Tramitar pedido" does — it renders the home page instead — so `loginGate.ts`'s dialog-detection mechanism would not even apply as-is; recovering here needs different logic (detect the degraded/logged-out render, re-authenticate, retry the navigation).

**This is corroborating, not speculative:** `checkout-reach.spec` (which DOES carry the login-gate) ran two tests later in the same invocation and **passed cleanly**, and all 22 non-cart specs after it passed cleanly too — proving the session genuinely was recoverable and the rest of the suite was unaffected, isolating the gap precisely to `CartPage`'s missing session-recovery path rather than a broader DES outage. This is also why the error message's own wording ("cart content service degraded?", written against §23's *different* failure mode — an empty `<main>` skeleton that never resolves) is now known to be an incomplete diagnosis for this specific case: the `<main>` here was not empty, it was fully rendered — just rendering the wrong page.

**Why this is a genuinely NEW failure shape, not a re-occurrence of §23/§24/§28.** §23's "cart content service degraded" is a bare, childless `<main>` skeleton persisting past the deadline (a backend-outage shape). §24's session-invalidation mechanism was previously only observed gating the checkout entry point, with a shipped fix. §28's drawer noise is a different error message on a different call site. This run is the **first live evidence that `CartPage` itself — new in this same effort — inherits §24's session-invalidation exposure with no mitigation**, reproduced identically on both cart specs. Per this effort's own Task 5 escalation doctrine ("if the gate fails both attempts for a non-environment reason, stop and report — do not weaken assertions to get green"), this is recorded here as an open, unfixed defect rather than smoothed into the existing noise taxonomy. **Not fixed in this task** — Task 7's file list is docs/coverage only; extending `loginGate.ts`'s pattern (or an equivalent) to `CartPage`/`cleanCart` is future scoped work, filed in the backlog.

**Offline gates, unaffected:** `pnpm test:unit` **428/428**, `pnpm typecheck` clean, `pnpm lint` clean — the failure is DES-session-shaped, not a code-correctness regression the offline gates could ever have caught.

**Coverage (`pnpm plan --update`, run immediately after the full suite per the §30 rule): 38/139 flows, unchanged from before this effort** (evidence: 23 passed tests). Recorded honestly, and CORRECTED from an earlier, wrong version of this paragraph (task-review finding, 2026-08-13): the map does **not** lack a cart flow — two `type: "Cart"` flows exist (`flow_e7b11142f5d8`, anon, and `flow_5c335c37c325`, auth, both `/es/h-woman.html → /es/shop-cart.html`), verified directly against `coverage/functional-map.json`. The real mechanism is that **both were already in the covered set before this task ran** — their `coveredBy` arrays list `tests/checkout/checkout-reach.spec.ts` and `tests/checkout/checkout-structure.spec.ts`, which exercise the same route independently of the cart specs. `add-to-cart.spec.ts` (the *pre-Task-6* version, which navigated to the cart page via `header.goToCart()`) had also been in both arrays; this run's `add-to-cart.spec` failure dropped it back out of `coveredBy` (confirmed in the commit diff), but the flow stayed covered regardless because the checkout specs' evidence was untouched — so the number could not have moved either way. **`0 elements extracted for `/es/shop-cart.html`` remains true and is a separate fact** (the crawler never interacted past the cart page, so it recorded no elements there) — it explains why the map's *element* inventory for the cart page is empty, not why the *flow-coverage number* didn't move. Coverage growth from this effort was never going to come from the planner's flow-matching (the Cart flow's coverage was already saturated by checkout specs); it comes from the suite now exercising code and DES surface (`CartPage`, the cart's own remove/quantity/total controls) that no spec touched before.

**Net for the suite: 25 → 26 tests** (`cart-lifecycle.spec.ts` is new; `add-to-cart.spec.ts` was tightened, not added). *(Task-review fix, 2026-08-13: this paragraph's original passing-count juxtaposition — "22 → 24 tests passing" — is deleted here; it described Task 7's own RED run and is superseded by Task 8's 25/1/0 full-suite result reported below, so keeping it invited misreading a fixed number as still current.)* The `cleanCart` fixture itself is validated and closes the §7 cart-cleanup backlog lead **for the case it was built for** (a live, valid session) — Task 4's report shows both its remove-path and short-circuit-path working cleanly. What is **not** closed is session resilience under the specific ordering this full-suite run exposed; that is a new, separate, and more specific gap than the general cleanup lead was.

### Task 8 completion — CartPage session-invalidation recovery shipped, closes backlog P5 (2026-08-13)

> ⚠ **Read §33 alongside this subsection.** Everything below about the recovery mechanism still holds, but the "new cold-navigation defect" it files (gate 4) was root-caused on 2026-08-16 and is **not** a DES defect: it is this very recovery firing when it should not, because DES serves a logged-out header for ~5-8s before hydrating. §33 has the measurement, the fix and the falsified hypotheses.

**Context.** Same effort, unplanned Jorge-approved task (brief `.superpowers/sdd/2026-08-13-cart-regression/task-8-brief.md`), approved specifically to un-red the full suite before the `cart-regression` branch merges. Scope: `src/pages/CartPage.ts` only (no other file needed changing).

**Reproduction confirmed the exact mechanism before any fix (gate 1, `tests/auth tests/cart`).** `cart-lifecycle.spec` attempt 1 failed with `CartPage: neither line items nor the empty state rendered within the deadline` and the same "Iniciar sesión" header tell task-7-report.md's own reproduction captured — mechanism confirmed live, not assumed.

**Fix — `CartPage.waitForLoaded()`, one chokepoint.** Every poll cycle's `act` checks `Header.isUserLoggedIn()` — the SAME primitive `auth.setup`/`login.spec` already trust for this exact question — BEFORE doing anything else, bounded to exactly one recovery attempt per call (a local `recovered` flag). On the positively-observed logged-out tell, `recoverInvalidSession()` re-authenticates via the same `LoginPage` flow (`auth.setup`/`login.spec` reuse, both variants §19/§23, not reimplemented) and retries the cart navigation — there is no login dialog to complete here (unlike checkout's `Tramitar pedido` gate, `src/support/loginGate.ts`): a dead-session direct navigation renders the wrong page outright, confirmed again in this task's own reproduction. The deadline widens by a fixed `RECOVERY_DEADLINE_MS` (90s at this point — later raised to 120s by the final-review fix wave, sized against `LoginPage.login()`'s own bounded worst case rather than one observed run; see the session-close subsection below) to fit exactly one recovery cycle — the same "ceiling, not a cost" reasoning as `VestidosTallasOverlayPage.openOverlay()` (§26): the happy path never pays it, confirmed live (gate 5 below: `cart-lifecycle.spec` passed its first attempt in 1.6m, no recovery, no timing penalty). `onTimeout` now distinguishes two diagnoses instead of one generic message — re-checks `isUserLoggedIn()` to report "session invalid and recovery failed" vs. the pre-existing §23 "cart content service degraded" wording — satisfying §28's doctrine that a diagnostic must say what it saw.

**Detector choice: the header tell, not "non-cart main content."** Evaluated live and rejected as the primary signal: every failure snapshot across this task (session-invalid AND the new lead below) shows `main` fully rendered with real, if wrong, content — a home page or a member-hub page, never a skeleton or an empty shell — so a content-shape check would need its own positive definition of "not cart content" with no natural anchor, where `Header.isUserLoggedIn()` is already a single proven boolean. It also cannot misfire on hydration lag: the button check defaults to "logged in" on absence (not-found ≠ seen-and-false), so only a *positively rendered* "Iniciar sesión" button can trigger recovery — confirmed by reading `Header.isUserLoggedIn()`'s own implementation before relying on it, not assumed. `isEmpty()`/`lineItemCount()` needed no change: DES never renders the "Cesta vacía" copy on any of the wrong-page renders observed this task, so the verify cannot bless a logged-out or wrong-page render as an empty cart (§29) — confirmed directly in every failure snapshot below, not merely inferred.

**Gate 2 — offline, clean.** `pnpm typecheck` clean, `pnpm lint` clean (incl. the `import/no-cycle` check — `CartPage` now imports `LoginPage`/`primaryUser`, no cycle found), `pnpm test:unit` **428/428**, no regression.

**Gate 3 — reproduction recipe, post-fix (`tests/auth tests/cart`): green, 2 clean + 2 flaky, both flakes independently confirmed unrelated.** `auth.setup` (1.4m) and `login.spec` (1.0m) passed clean; both cart specs failed attempt 1 and passed retry 1 — but neither attempt-1 failure was the session-invalidation error. Read from each failure's own `error-context.md` (not inferred): `add-to-cart.spec` attempt 1 failed with `ProductPage: the add-to-cart confirmation drawer never appeared` (the pre-existing §28 class — header showed `button "Mi cuenta"`, a real PDP, no session issue); `cart-lifecycle.spec` attempt 1 failed with a quantity assertion (`expected 2, received 3` after `increaseQuantity()`) — the documented, accepted `setQuantity` residual-overshoot class named in this same §32's Task 7 completion — header again showed `"Mi cuenta"` and a real, populated cart (`Cesta (3)` tab). The targeted failure mode (the "Iniciar sesión" tell + wrong-page `main`) did not recur anywhere in this run. **Stated precisely (task-review finding 1, corrected):** this is evidence the OLD symptom is gone across this run, not a direct observation of `recoverInvalidSession()` itself firing and succeeding — this run predates the observability lines added below, so whether recovery silently engaged and worked, or simply wasn't needed this time, could not be told apart from this evidence alone. Direct, positive confirmation of the recovery path engaging was captured afterward, once the gap was flagged — see "Task 8 fix report" below.

**Gate 4 — standalone `cart-lifecycle.spec.ts`: found a second, narrower, previously-undocumented `CartPage` defect — reproduced 2/2, filed, NOT fixed (out of this task's scope).** Two separate invocations (4 attempts total: attempt + retry, twice) all failed identically with the SAME diagnostic (`CartPage: neither line items nor the empty state rendered… cart content service degraded?` — the non-session branch of the new `onTimeout`, confirming `Header.isUserLoggedIn()` genuinely returned `true` throughout, i.e. this is NOT the mechanism Task 8 was scoped to fix). Read from all four `error-context.md` files: the header shows unambiguous authenticated content (`button "Mi cuenta"`, `button "Cerrar sesión"`), yet `main` renders **`/es/member-hub.html` content** (`"¡Hola, Jota!"`, "Mi perfil", "Mis compras"…) with the degraded-shell title `"Bershka | Bershka"` (§7/§13's own documented signature) — not cart content, not a skeleton, not an error page. `recoverInvalidSession()` never engaged (the act's session check always short-circuited true), so this is provably not a code path Task 8 touched.

⚠ **BOTH HYPOTHESES BELOW WERE FALSIFIED — see §33 (2026-08-16), which root-caused this and closed backlog P6.** The persisted-route one was falsified offline (nothing in `.auth/state.json` holds a route); the session-propagation one was falsified live (the cold navigation returns 200 with no redirect and the URL never leaves `/es/shop-cart.html`). The real cause was this same effort's own session detector misfiring on a *valid* session. Kept verbatim because §33 pre-registered them as the hypotheses it set out to discriminate — do not re-chase them.

Hypothesis, stated as such and NOT confirmed live (out of scope to probe further this task): a timing/propagation effect specific to `CartPage` being the very FIRST post-`auth.setup` navigation in an invocation. `auth.setup` itself ends on `/es/member-hub.html` (the MMBRS login redirect target) before writing `storageState`; a cold `page.goto('/es/shop-cart.html')` immediately after loading that `storageState` may be racing either DES's own backend session-association propagation or the SPA's own client-side bootstrap (which could read a persisted "last route" from the captured `origins` localStorage and override the freshly-requested URL) before either is fully settled. Two pieces of corroborating, not conclusive, evidence: this exact failure did **not** occur in gate 3 (`cart-lifecycle.spec` ran there as the 4th test, several minutes after `auth.setup`) nor in gate 5 below (`cart-lifecycle.spec` ran 5th of 26, passing its first attempt in 1.6m) — only the "single spec, nothing between it and a fresh `auth.setup`" ordering reproduced it, and it did so deterministically both times tried.

**This does not block Task 8's actual mandate.** The brief's real acceptance bar is the full suite (gate 5), and the specific mechanism the brief described (`login.spec`'s mid-suite invalidation) is confirmed fixed by gate 3's evidence. Extending the fix to also cover a *session-valid* wrong-page render would be probing an unconfirmed hypothesis about SPA bootstrap/backend-propagation timing — squarely the kind of unplanned scope expansion the brief's own escalation clause asks to stop and report rather than chase solo. Filed as a new backlog lead (below) for a future session with room for a proper live probe (a session-timing discriminator, not a blind retry-add).

**Gate 5 — full suite (`pnpm test`, 26 tests): 25 passed / 1 flaky / 0 failed, 17.5m — the best full-suite result in the cart-regression effort's history.** `add-to-cart.spec` flaked on attempt 1 (`Expected: 1, Received: 6` on the cart-tab item count) and passed retry 1; read from its own `error-context.md`: header shows `"Mi cuenta"` (authenticated) and a real product-line quantity status of `"6"` — the same pre-existing §28 drawer-noise second-order-damage class named in this same §32's Task 7 completion (repeated real adds while the confirmation-drawer detector was timing out), not a session or a member-hub-bounce issue. `cart-lifecycle.spec` passed its FIRST attempt, 1.6m — no recovery needed, confirming the healthy path costs nothing extra. Every other spec passed clean. This satisfies the brief's gate 5 bar ("26/26 modulo documented noise classes") — the one flake is retry-recovered and independently attributable to an already-named, unrelated class.

**Self-review, evidence-backed:**
- Detector identifies WHAT it sees, not a timeout: confirmed — `onTimeout` re-checks `isUserLoggedIn()` and reports one of two distinct diagnoses; gate 4's failures prove this works correctly in the negative direction too (it never misreported the member-hub-bounce as session-invalid).
- `isEmpty()` cannot bless a logged-out/wrong-page render: confirmed directly in every failure snapshot this task produced (gate 1, 3, 4) — DES never rendered "Cesta vacía" on any of them.
- Recovery is ONE chokepoint, bounded, with an explicit diagnostic on failure: confirmed — `CartPage.waitForLoaded()` only, a single `recovered` flag, a fixed deadline ceiling.
- Healthy path pays ~nothing: confirmed — gate 5's `cart-lifecycle.spec` at 1.6m, no recovery engaged.

**Backlog P5 (`CartPage` session-invalidation gap) is CLOSED.** A new lead is filed for the gate-4 finding — see the backlog and CLAUDE.md pending-task list.

### Task 8 fix report — task review found three Important issues, all addressed (2026-08-13)

A task review of the above flagged three gaps before this branch merges. All three are in
`src/pages/CartPage.ts` only; no behavior changed beyond what each finding required.

1. **Evidence-strength overclaim.** The gate-3 paragraph above said the fix's absence-of-old-
   symptom was "direct evidence the fix closes the mechanism" — it wasn't; no run had yet
   directly observed `recoverInvalidSession()` firing. Corrected in place (see the paragraph
   above) to say precisely what the evidence supported. **Fixed with an actual instrument, not
   just softer words:** `recoverInvalidSession()` now logs when it engages (the tell was
   observed) and when it completes (with the post-recovery URL) — plain `console.log`,
   surfaced live by Playwright's own reporters. Re-running the gate-3 recipe with this in
   place gave the FIRST direct, positive confirmation: all four cart-spec attempts (both
   specs × attempt + retry) logged both lines, meaning `recoverInvalidSession()` genuinely
   fired and completed on every single one — the shared account's session was dead for the
   whole run, exactly as expected the run right after `login.spec`. Neither attempt-1 failure
   in this re-run was the session-invalidation error (confirmed the same way as before, via
   each failure's own `error-context.md`): `add-to-cart.spec` — the pre-existing §28 drawer
   class again; `cart-lifecycle.spec` — the `setQuantity` overshoot class again (`expected 2,
   received 6` this time — a larger overshoot than the earlier run, still the same named,
   accepted noise family, findings §32 Task 7 completion). 2 clean + 2 flaky, 0 failed, 12.7m.

2. **Undocumented interaction risk with the gate-4 cold-navigation lead.** *(⚠ RESOLVED by §33, 2026-08-16: the risk was real but inverted — recovery does not "race into" a DES defect, it IS the defect when called on a valid session, because the re-login it performs cannot succeed against a live one. Read §33, not the speculation below.)*
   `recoverInvalidSession()` ends with fresh-login → immediate cold `this.open()` — structurally
   the same sequence as the still-open, separately-filed cold-navigation defect (this section,
   Task 8 completion above). If that defect's mechanism turns out to be session-propagation
   timing rather than something specific to `auth.setup`'s own storageState snapshot, recovery
   could itself race into it right after a "successful" re-login. Documented explicitly at the
   recovery site (`CartPage.ts`, the doc comment above `recoverInvalidSession()`) and in the
   backlog's lead for this defect, which now names the specific correlation the next
   investigation should check : does a
   `waitForLoaded()` timeout with `recovered === true` correlate with the cold-nav
   signature (member-hub content, degraded title, valid session) rather than a genuinely broken
   re-login? Not observed either way this session — recovery succeeded cleanly all four times
   it fired in the re-validation run above.

3. **Diagnostic contract gap.** If recovery's own login failed partway, the old `onTimeout`
   re-checked `Header.isUserLoggedIn()` at the moment of timeout — which could read `true` even
   though a recovery attempt had run and failed (mid-navigation, a partially-completed login, or
   exactly finding 2's race), misreporting it as the generic §23 "cart content service degraded"
   message instead of naming the real situation. Fixed: `onTimeout` now branches on the
   `recovered` flag itself (ground truth for "did this call attempt recovery," set the instant
   the tell is observed, never reset) rather than re-deriving it from page state. When recovery
   was attempted, the thrown message says so explicitly and includes the current URL; the
   generic §23 message is now reserved for calls where recovery was never attempted at all.

**Covering gates re-run:** `pnpm typecheck` clean, `pnpm lint` clean (no `no-console` rule
configured in `.eslintrc.cjs`, confirmed by reading it rather than assuming). Targeted
recipe (`pnpm exec playwright test tests/auth tests/cart`): green as reported in finding 1
above — 2 clean + 2 flaky (both independently confirmed pre-existing noise), 0 failed, 12.7m.
The full suite was not re-run for this fix round — none of the three findings changed the
happy-path behavior validated by gate 5 (25/1/0) in the original Task 8 pass, and the
covering-gates instruction for this round scoped to the targeted recipe specifically.

### Session close — final-review fix wave + audit addendum (2026-08-13)

**The whole-branch review ("merge with fixes") produced one final fix wave** (commits `fdc1d35` code, `8805851` docs/map), previously unrecorded here — this subsection closes that gap, found by the session-close audit:

- **Code:** the `ensureEmptyCart` zero-line race (after the last removal, the loop now settles on `waitForLoaded()`'s either/or state before re-checking, so a cleanup that succeeded can no longer throw "no line items to remove"); `lineItems()` re-anchored through `div.shop-cart__products` (P1's real container — `main` alone would count product tiles on a wrong-page render); `RECOVERY_DEADLINE_MS` 90s → **120s** (sized against `LoginPage.login()`'s bounded worst case ~105s, not one observed run — the 90s figure in the Task 8 subsection above is superseded); `lineQuantity()` returns `null` on empty status text instead of `0`.
- **Docs/ids:** the new cold-nav lead renumbered **P5 → P6** everywhere (P5 stays the closed session-invalidation item); the `Header.isUserLoggedIn()` member-hub URL short-circuit documented as a P6 confounder.
- **Validation:** targeted `tests/cart` gate — **2 hard failures, and they are the P6 lead firing live for the first time**: all 4 attempts showed the exact previously-only-hypothesized signature (member-hub content, degraded title `"Bershka | Bershka"`, genuinely valid session) on recovery's own retried navigation. P6's interaction-risk paragraph is thereby CONFIRMED observable, not speculative — recorded in the backlog's P6 entry. Then the real gate: **full suite 25 passed / 1 flaky / 0 failed, 14.2m — both cart specs clean on first attempt** — followed immediately by `pnpm plan --update`, so the committed coverage map now derives from a GREEN run (fixing the final review's finding that it had been committed from Task 7's red one). Coverage 38/139, unchanged, per the corrected mechanism above (the Cart flows were already covered by the checkout specs).

**Audit addendum (session-close pass, 2026-08-13):**

1. **The "three pre-existing production defects" wording used across this effort's records was corrected** (see the note in the Task 7 subsection): only `ProductPage.addToCart`'s unanchored add button was pre-existing production code; the `setQuantity`/`removeFirstItem` defects were in this same effort's new `CartPage` code, caught by its own gates pre-merge.
2. **150s budget collision** *(⚠ 2026-08-16: this item OUTLIVED P6 — it is now backlog item 5 in its own right, and §33 proved it with a live bare timeout; the sentence below that files it under "the P6 investigation" is superseded)* **— made permanent here (was only in an ephemeral task report):** `waitForLoaded()`'s worst case (30s skeleton + 120s recovery) equals the des `timeout: 150_000` — on specs without an extended `test.setTimeout` (i.e. every cart consumer except `cart-lifecycle.spec`'s 240s), a failed recovery can be masked by Playwright's generic test timeout before the crafted "recovery failed" diagnostic fires. Diagnostic-quality only, not correctness (the test fails either way); belongs to the P6 investigation.
3. **`ProductPage.addToCart()` has a FIFTH consumer nobody's gates validated: `explorer/crawl/primeCart.ts`** (the seeded-checkout crawl's cart primer), alongside the four specs. `primeCart` never throws by contract, so if the `div.product-detail-info__actions` anchor ever misses on a PDP variant, the failure degrades silently into "checkout seed skipped" — the exact situation the 2026-07-30 P0 re-crawl fixed. Named here so a future seeded-crawl failure isn't re-diagnosed from scratch.
4. **Dead-code scan: clean.** Every public method of the session's new code (`CartPage`, `cartCleanup`, `price`) has a live consumer (`CartPage.header` is used internally by the recovery detector); no probes or throwaway specs remain on disk.

---

---

*Tranche archived 2026-08-21 (parent was 157.5k chars, over its 150k budget): §26–§29, §33–§35, §37 — full text verbatim below, in numeric order.*

## 26. Coverage expansion by promoting Builder drafts — 6 promoted, suite 8 → 14 (2026-08-04)

**Context.** First deliberate use of the platform to *widen* the manual suite rather than fix something: `pnpm build-tests --top 10` → review → promote. Not a crawl — the map (140 desktop pages) already knew far more flows than any spec visited; the bottleneck was promotion, not knowledge. `pnpm test:generated`: **12/12 PASS, zero retries.**

**What was promoted (6 of 11 drafts).** The 11 drafts held real redundancy, verified by reading them rather than assumed: two *byte-identical* pairs (`camisas-n3700`, `combo-wins-n5324` — anon/auth session twins of the same flow), and **all five PDP drafts sharing one chain** (`h-woman → /es/mujer/ropa/combo-wins-n5214.html → PDP`), differing only in which signal the Builder picked (3 × `role button "Anterior"`, 2 × `testId addToCartBtn`). Promoted: 3 Hombre PLPs (`camisas`, `combo-wins`, `lo-mas-vendido` — a category the suite never touched), one PDP per signal shape (`body-tirantes-escote-redondo`, `camiseta-tirantes-rib`), and the Tallas-overlay interaction spec (`vestidos-n3802`). The rest were left to be pruned by the next `build-tests`.

`camiseta-tirantes-rib` was kept deliberately: it is the known **Personalizable** product (§16/§18) that `add-to-cart.spec` filters out of the search grid. This spec only asserts the PDP renders — it never adds to cart — so it guards that variant's reachability without re-hitting the A5 incompatibility.

**Signal hardening without a live probe — the map's `title` field.** Every Builder loaded-signal here was page-*type*-specific, not page-specific (`filterButton` on any PLP, `Anterior`/`addToCartBtn` on any PDP) — the exact weakness B14 exists for, and the reason `bombacho-barrel` was hardened to a heading in §24. The cheap fix: `MapPage.title` is already in the committed map, captured live by the crawl, so each `isLoaded()` gained a **prefix** title check ahead of the structural one, with **zero live probing**. Prefix, not exact, for a reason read straight off the map: the same PDP was captured as `"Camiseta tirantes rib - Camisetas - Mujer | Bershka"` (anon) and `"Camiseta tirantes rib - Mujer | Bershka"` (auth). Bonus: a title check also catches the degraded-app-shell signature (`"Bershka | Bershka"`, §7/§13). Honest limit recorded at the call site: `"COMBO WINS %"` is the title of the **Mujer** combo-wins pages too, so there the title proves the right campaign page, not the right gender.

**The one real failure, root-caused (systematic-debugging, not retried away).** `vestidos-tallas-overlay` failed **both attempts** in the first full-suite run, each burning the full 150s test timeout — despite `openOverlay()`'s own `deadlineMs: 20_000`. Two separable defects:

1. **Ours, certain — an unbounded click starves `actUntil`.** The act's `.click()` carried no `timeout`, so a click on a locator the SPA had re-rendered away waited out the *test* timeout and `actUntil` never regained control; its diagnostic never fired. This is the exact hang mode already root-caused in the checkout login gate and guarded in `ProductPage.addToCart` (§24) — and it is inherited from **the Builder's interaction template**, which omits the bound, so *every* future generated interaction spec carries it. Fixed on promotion (`click({ timeout: 5_000 })`); the template gap is filed as a backlog item, not fixed here.
2. **Environmental — the page bounced off the PLP.** The failure snapshots decided this, not inference: `isLoaded()` had already passed (title + `filterButton`), yet at failure the page was the **Mujer home** (`Categorías destacadas`, `Get the look`, no grid), the header read `button "Iniciar sesión"` (§24's session tell), and attempt 1 additionally carried the degraded-shell title `"Bershka | Bershka"`. That run took **15.3m vs the ~5.5m baseline** and `add-to-cart` also failed its first attempt — a visibly degraded DES window (§7).

**Discriminating run, and what it proved.** The same spec **passes in isolation (19.3s, no retry)** and passed in `pnpm test:generated` (21.4s) — and that config, read directly, runs *only* the generated specs, i.e. **without `login.spec`**, whose mid-suite re-auth invalidates the shared account's storageState session (§24). So the failure is **context-dependent**, confirmed. The causal chain from session invalidation to the SPA bounce is a **hypothesis, not a proven mechanism** — stated plainly rather than dressed up.

**Recovery shipped (Jorge's call, over the conservative option of un-promoting it).** `ensureOnPlp()` re-navigates when the SPA has left the PLP, then waits out hydration via `actUntil`'s pure-polling shape (no `act`) so the next cycle doesn't re-navigate a still-hydrating page and thrash. Legitimate here precisely because a category PLP **is** server-routable — unlike `/es/q/{term}`, which §7 forbids reloading. `openOverlay`'s deadline went 20s → 60s **only** to fit one recovery cycle (documented at the call site so it isn't misread as the blind timeout increase the project's doctrine forbids); the happy path pays nothing, `ensureOnPlp()` returning immediately when already loaded.

**Re-validation: `pnpm test` 13 passed / 1 flaky / 7.8m** — `vestidos-tallas-overlay` green in 18.9s. Stated plainly: **this run does not validate the recovery.** DES was healthy (7.8m vs 15.3m) and 18.9s indicates the recovery path never ran; what it proves is no regression on the happy path and zero added cost. The recovery stays unvalidated under the degraded conditions it was written for.

**Watch-item escalation. ✅ CLOSED — see §28: the probe this paragraph proposes was run and its hypothesis REFUTED (the drawer was always there; the detector could not identify it).** Original text: the desktop add-confirmation drawer (§24's watch item, 4× on 2026-08-02) failed the first attempt in **both** full-suite runs today — 6 occurrences now, always recovered on retry. It has hardened into a pattern; §24's own suggested probe (is the drawer suppressed when the product is already in the cart?) is now worth running when someone has the window.

**Net: the manual reference suite goes from 8 to 14 tests** — Hombre PLPs, two PDP shapes, and PLP-card overlay interaction, all live-green.

---

## 27. Footer component — `pnpm ask` correctly finds no flow; selectors confirmed live on desktop (2026-08-04)

**Why `pnpm ask "Navega por el footer"` answers no-match, and why that is right.** The resolver matches *flows* — navigation chains between pages. The footer is not a destination; it is chrome repeated inside every page, which is exactly why the crawler tags ~760 map elements `component: 'Footer'` (B14) and why no Footer flow exists to resolve. The honest no-match is the correct answer here, not a resolver gap — worth recording so a future session does not file it as P1 evidence (the LLM-seam item wants intentions a human *would* have resolved; this is not one).

**Architectural placement:** shared chrome ⇒ **Component Object** (`src/components/Footer.ts`, alongside `Header`/`SearchBar`/`CartTab`), not a Page Object. Scoped by accessible name — `getByRole('contentinfo', { name: 'Pie de página' })` — mirroring Header's own reasoning about unscoped landmark locators.

**Confirmed live (desktop, 2026-08-04):**
- `contentinfo "Pie de página"` — the footer landmark, one per page.
- `link "Nuestras tiendas"` → `/es/store-locator.html`, inside the "We are BERSHKA" block.
- **The click actually navigates.** This was the real open question, not the selector: §24 established that on desktop a correct-looking affordance can still leave you elsewhere (Enter on `/q/` reaches the results page and the SPA then bounces home ~1s later). The footer link does not do this — it lands and stays. Verified by the spec, twice.

**Deliberately NOT asserted: the footer's section inventory** ("¿Necesitas ayuda?", "Ayuda", "We are BERSHKA", "Te puede interesar", "Síguenos en redes sociales", the legal block, `button "Configurar cookies"`, `button "España | Español"`). All were captured live and are recorded here as knowledge, but the spec asserts only the landmark: those sections are marketing content Bershka reorganizes, so asserting them would generate noise on every reshuffle instead of catching a defect. The landmark is semantic and stable.

**Shipped:** `Footer.isVisible()` (landmark = render signal, doubles as the click precondition) and `Footer.goToStoreLocator()` (act → verify → retry on the URL). Two guards carried over from the same day's failures rather than re-learned: the click is **bounded** (`timeout: 5_000` — an unbounded click on a re-rendered locator burns the whole test timeout and starves `actUntil`'s deadline, §24/§26) and the act **returns early once the URL has changed**, so a navigation slower than one cadence cannot fire a second stray click (`ProductPage.addToCart` precedent). `HomePage` exposes `footer` alongside `header`.

**Live validation:** standalone **PASS first attempt, 16.1s, no retry**; then full suite **14 passed / 1 flaky / 9.3m** with the footer spec green in 11.0s — second confirmation plus the no-regression check for the shared `HomePage.ts` edit. Suite is now **15 tests**.

**⚠ Watch item escalates again — 7 occurrences.** That run's flaky was the *same* add-confirmation-drawer failure (`ProductPage: no confirmation dialog appeared`), this time in `checkout-reach.spec` while `add-to-cart.spec` passed clean — so it is **not spec-specific**: it lives in the shared `ProductPage.addToCart` desktop branch and moves between whichever spec adds to cart. §24's untested hypothesis (is the drawer suppressed when the product is already in the cart?) is now the obvious next probe; it has earned a real investigation rather than another tally mark.

---

## 28. The add-confirmation "watch item" was never a DES problem — the detector was (2026-08-04)

**Closes the watch item opened in §24 and escalated in §26/§27.** Seven `ProductPage: no confirmation dialog appeared after "Añadir a la cesta"` failures between 2026-08-02 and 2026-08-04, always retry-recovered, had been characterized as DES environment noise with an untested hypothesis (*is the drawer suppressed when the product is already in the cart?*). **That hypothesis is refuted, and the noise characterization was wrong.**

**The evidence that settled it** — the failing run's own `error-context.md`, read instead of retried. At the moment the test declared the drawer absent, the page snapshot contained exactly one `dialog`, and it was unmistakably the drawer:

```yaml
- dialog [active]:
    - alert: Producto añadido
    - heading: Camiseta manga corta fruncido
    - 19,99 €  /  Talla XS
    - button: Tramitar pedido
    - button: Ver cesta (10)
```

The add had **succeeded** and the drawer was **on screen announcing it**. Stated plainly: for two days the suite was reporting a DES failure that never happened.

**Root cause — a count cannot identify *which* dialog appeared.** `addToCart`'s desktop branch measured `baseline = getByRole('dialog').count()` before acting and verified `count() > baseline`. Two documented facts make that unsafe on this site: dialogs stay **mounted while visually closed** (§17, the mobile nav drawer), and desktop renders the **search overlay as a dialog** (§24). So any concurrent dialog churn — one closing as the drawer opens — leaves the count flat while the real drawer is plainly there. The original comment's premise ("a page with no permanent dialog — desktop has no mobile nav drawer") was true about the *mobile* drawer specifically and wrong as a general assumption.

**Second-order damage the false negative caused, previously invisible.** The act's own anti-double-add guard used the same count diff, so it never fired either: every failing run kept re-clicking "Añadir a la cesta" for the full 20s deadline. Cart counts of 10 on the shared account (§7's accumulation lead) are partly this, not just missing cleanup.

**Fix — identify the drawer by its CONTENT.** New `addConfirmationDrawer()`: `getByRole('dialog').filter({ hasText: /producto añadido|ver cesta/i }).first()`, with `isAddConfirmed()` over it, used by the verify AND the anti-double-add guard. Either text alone proves the drawer; "Ver cesta" is also the desktop header cart link (§24) but the locator is scoped to dialogs and the header is not one. The count-diff mechanism is **deleted**, not patched — this removes the whole failure class rather than the day's instance.

**A second, smaller bug found in the same snapshot.** The drawer's close button was **nameless** there (icon-only, image unresolved), while the close step located it as `getByRole('button', { name: 'Cerrar' })` — and its verify was *also* count-based, so it could report a still-open drawer as closed. Now: click "Cerrar" when present, otherwise **Escape**, verifying on the content locator. Escape rather than a positionally-guessed button on purpose — the drawer's other two buttons are "Tramitar pedido" and "Ver cesta", and **both navigate**. Recorded honestly: Escape is this site's established overlay-close idiom (M9 §17) but is *not* separately confirmed against this drawer; if it ever fails to close it, the 10s timeout says so explicitly.

**Live validation: `pnpm test` 15/15 PASS, zero retries, 7.1m** — the day's first fully clean full suite, with `add-to-cart` (28.2s) and `checkout-reach` (36.5s) both green on the first attempt. What this does and does not prove, plainly: it proves no regression across the four specs sharing `ProductPage.ts`; it does **not** prove the intermittent failure is gone, because earlier runs today also saw one of those two pass clean. The proof is the snapshot, not the green run — the detector demonstrably could not see a drawer that was there, and that cause no longer exists. Confirmation comes from repeated use over the coming days.

**Method note worth keeping.** Three real bugs this session (§25's strict-mode violation, §26's unbounded click, and this one) were all found by **reading the failure's own `error-context.md`** rather than re-running. Two of the three had been sitting behind a "documented environment noise" label. `test-results/` is overwritten by the next run, so the artifact must be read before re-running — the earlier six occurrences of this bug left no evidence behind.

**Watch item: CLOSED as a DES issue, resolved as a framework defect.**

---

## 29. The wishlist spec was structurally incapable of failing — found by injecting a bug (2026-08-06)

**How it surfaced.** Onboarding Fase 6 (Debugging), run interactively. The exercise was to inject a realistic selector defect and practise diagnosing it from evidence: the add-locator's accessible name lost one word — `'Añadir a la lista de deseos'` → `'Añadir a lista de deseos'` (not a substring of the real name, so `getByRole`'s default substring matching cannot rescue it; the trace's Log confirmed the locator never resolved).

**The test passed anyway. Twice.** That is worse than a red suite: a spec that cannot fail reports safety it does not provide, and nobody re-reads a green test.

**Root cause — the spec asserted a STATE, not a TRANSITION.** `add-to-wishlist.spec.ts` did `addToWishlist()` then `expect.poll(isInWishlist).toBe(true)`, with no guaranteed starting state. The shared DES account carries wishlist items across runs (§7's no-cleanup lead, previously filed as cosmetic — it is not), so the asserted `true` was already true before the test acted. Compounding it, a hydration race defeated `addToWishlist()`'s own idempotency guard: on a PDP whose body had not painted yet, `isInWishlist()` answers `false` for "not rendered", which is indistinguishable from a genuine "not in the wishlist" — so the guard did not short-circuit either, and the run burned a full 5s click timeout against a locator that matched nothing before the page hydrated and made the verify true on its own.

**This is §28's defect class, one layer up.** There, a dialog-COUNT diff could not identify *which* dialog appeared. Here, the verify cannot distinguish **"my action worked"** from **"it was already true when I started"**. Any `actUntil` whose `verify` cannot make that distinction will bless a no-op — and `actUntil` swallows the act's error *by design* ("the verify is the truth", `src/support/retry.ts`), so a completely broken act is invisible to it. That contract is sound; it just puts the entire burden of correctness on the verify.

**Platform consequence worth stating explicitly.** A false green is invisible to the whole agentic stack: `pnpm analyze` classifies failures out of `reports/results.json`, and `pnpm heal` only acts on `selector-drift` failures. No failure, no classification, no healing proposal. The Risk Analyzer would never have reported this broken selector — not because it misjudged it, but because it never saw it.

**Fix (`src/pages/ProductPage.ts`, `tests/wishlist/add-to-wishlist.spec.ts`).** `waitForWishlistControl()` polls until *either* wishlist button is visible — the same either-state readiness shape as the file's existing `detectAddFlow()` — which is what makes `isInWishlist()`'s answer information rather than a guess; `isInWishlist()`'s docstring now says so. `removeFromWishlist()` (mirror of `addToWishlist()`) establishes the "not in wishlist" starting state. The spec asserts the transition: `removeFromWishlist()` → `expect.poll(...).toBe(false)` → `addToWishlist()` → `expect.poll(...).toBe(true)`. The intermediate assertion is deliberate even though `removeFromWishlist()` throws on failure — it documents in the spec *why* the final `true` means anything.

**Validation — a controlled experiment, not a green run.** Broken selector + old spec: PASS (×2). Broken selector + new spec: **FAIL** (`neither wishlist button rendered`, from `removeFromWishlist`). Correct selector + new spec: PASS (31.9s vs the false green's 21.8s — the extra time is the work it was skipping). One variable changed between the last two, so the green is causally attributable to the selector. Full suite **15/15, zero retries, 6.7m** (no regression across the four specs sharing `ProductPage.ts`); unit 421/421, typecheck/lint clean.

**Two open items, recorded honestly rather than smoothed over:**

1. **One intermediate run passed in 21.8s and is still unexplained — STILL OPEN as of 2026-08-10** (§31 confirmed lead 2 below, which makes the unanchored locator a *plausible* mechanism for this too, but the evidence is gone so it cannot be closed). With the new spec and the broken selector, both code paths should have thrown; the timing leaves no room for a 20s `actUntil` deadline. **The evidence was destroyed by re-running** — `test-results/` is overwritten by the next run, which is exactly §28's own method note, hit live within two sessions of writing it. If this recurs, capture the trace before re-running.
2. **✅ CONFIRMED AND FIXED 2026-08-10 — see §31.** The hypothesis below was proven live with a discriminating-state probe and the locators are now anchored; kept verbatim because it was §31's pre-registered hypothesis. ~~**Unverified lead**~~ — **`.first()` on the remove-button locator is not anchored to the main product.** §25 added `.first()` to silence a strict-mode violation caused by the "También te puede gustar" carousel repeating the same accessible name, reasoning that "the main product's button always renders before the carousel". That reasoning only holds *while the main product is in the wishlist*: once it is not, its button is named "Añadir…", stops matching the remove locator, and `.first()` slides silently to the first carousel card that *is* in the wishlist. If so, `isInWishlist()` answers **"is ANY product on this page in the wishlist"**, not "is *this* product". This is a plausible mechanism for item 1 but was **not** confirmed — the failing run showed no "Eliminar" button anywhere, carousel included. Probing it means scoping the locator to the PDP's own product panel instead of the page; it needs a live probe to find the right scope. `.first()` fixed the symptom (ambiguity) rather than the cause (an unanchored locator) — a pattern worth watching for elsewhere in the suite.

---

## 33. Backlog P6 root-caused and CLOSED — the "cold-navigation defect" was our own session detector misfiring (2026-08-16)

**P6 was never a DES defect.** For three sessions it was filed as "a cold cart navigation can render `/es/member-hub.html` content with a genuinely valid session", with two competing hypotheses about DES (backend session-propagation timing, or an SPA bootstrap restoring a persisted route). Both are wrong. The cart navigation is healthy; what fails is `CartPage`'s own session-invalidation detector, which fires on a **valid** session and triggers a re-login that cannot possibly work. Every observed symptom — member-hub content, the "degraded" title, the authenticated header, the 150s death — is downstream of that one misfire.

### The measurement that settled it

Temporary probe `tests/_probe/p6-cold-nav-probe.spec.ts` (deleted after this section, §18 lifecycle), run standalone so `auth.setup` → cold cart navigation is the exact P6 ordering. Instruments were explicit and never the suspect (§31): the navigation's own `Response`, the redirect chain, `page.url()`, and content identified by CONTENT (§28), not counted.

**Round 1 — the cold navigation is perfectly healthy, and it did NOT reproduce.** Status `200`, **no redirect chain at all**, `page.url()` stays on `/es/shop-cart.html`, title `"Cesta | Bershka"` (the healthy one — *not* the `"Bershka | Bershka"` degraded shell the reports described), cart content rendered at t+10s, `memberHub=0` at every mark. A `page.reload()` changed nothing because nothing was wrong. **The non-reproduction was the clue**: the probe had navigated exactly like `cleanCart` does, but never ran `waitForLoaded()`'s act — so whatever P6 is, it is not in the navigation.

**Round 2 — the same run, sampled densely from t=0 and reading the header.** This is the whole finding:

| mark | `loginBtn` visible | `isUserLoggedIn()` | cart lines |
|---|---|---|---|
| t+0 … t+5000ms | **true** | **false** | 0 |
| t+8000ms onward | false | true | 1 |

**For the first ~5-8s of a cold cart navigation, on a perfectly valid, freshly-minted session, DES serves its server-rendered header in the LOGGED-OUT state — a real, visible "Iniciar sesión" button — and only then does hydration swap it for "Mi cuenta" and render the cart.**

### The causal chain, end to end

1. `waitForLoaded()`'s `act` runs at **t≈0** (`immediateFirstCheck` makes the verify fail against the skeleton, so the act fires immediately) — squarely inside that window.
2. `Header.isUserLoggedIn()` returns `false`. The detector believes the session is dead. It is not.
3. `recoverInvalidSession()` runs a full re-login: `LoginPage.open()` → `/es/` → `logon.html`.
4. The user is **already authenticated**, so `logon.html` never renders a login form (the run ends on `/es/member-hub.html`, and no form was ever reached — see "honest limits" below).
5. `LoginPage.login()`'s variant-detection `actUntil` throws at its 30s deadline ("neither the e-mail form nor the interstitial rendered").
6. **`actUntil` swallows the act's error by design** (`retry.ts`, §29's "the verify is the truth") — so the broken recovery is invisible. `recovered` is already `true`, so the act no-ops from then on and the loop just spins against member-hub.
7. The test dies at **150s**, page sitting on member-hub with a valid session. That snapshot is what three sessions filed as a mysterious DES defect.

Confirmed directly in the failing run's own trace: exactly **three** navigations — `shop-cart` → `""` → `logon.html`. `recoverInvalidSession()`'s own final `this.open()` **never executed**, which is only possible if `login()` threw.

### What this falsifies

- **Backlog hypothesis (b), "the SPA bootstrap restores a persisted route" — falsified OFFLINE**, before any live run. `.auth/state.json`'s only SPA-owned key, `piniaLocal-navigation`, holds `{"genderCategoryKey":"BERSHKA_WOMAN","targetGroupKey":"BERSHKA_WOMAN"}`; `firstPageSession` holds `/es/logon.html`. **No stored key contains a member-hub URL or any route** — there is nothing for a bootstrap to restore.
- **Backlog hypothesis (a), "DES redirects / backend propagation" — falsified LIVE**: 200, no redirect chain, URL unchanged, 2/2 runs.
- **The "degraded shell" reading** — `"Bershka | Bershka"` was member-hub's generic title mid-load, not §7/§13's degraded shell.
- **The `Header.isUserLoggedIn()` member-hub URL short-circuit (the documented P6 confounder) never intervened**: measured `false` on the real cold navigation. It was a red herring.
- **The `CartPage.waitForLoaded()` doc comment was itself wrong**, and had been since Task 8: *"a not-yet-hydrated header cannot misfire this into an unnecessary re-login — only an actually-rendered logged-out header can."* The premise is false. A not-yet-hydrated header on this site is not an **absent** header, it is the **logged-out** one, button and all. Corrected in place.

### The fix — one change, one place

`CartPage.waitForLoaded()`'s act now requires the logged-out tell to **persist** across `SESSION_TELL_CONFIRM_MS` (15s, ~2× the measured 5-8s window) before believing it: read the tell, settle, read again. A hydrating header flips to "Mi cuenta" and the act returns without acting; a genuinely dead session still reads logged-out and recovery proceeds. Nothing else changed — not `Header`, not `LoginPage`, not the fixture, not `actUntil`.

### Validation — a controlled experiment, both directions

- **Offline:** `typecheck` clean, `lint` clean, unit **428/428**.
- **True negative (valid session, the P6 trigger):** the documented reproducer `pnpm exec playwright test tests/cart/cart-lifecycle.spec.ts`, which failed **both attempts** pre-fix (6.6m, ending on member-hub), now passes **2/2, first attempt each time** (1.2m and 54.9s), with **no recovery line logged** — the misfire is gone.
- **True positive (genuinely dead session):** full suite **24 passed / 3 flaky / 0 failed** (19.2m, a slow DES window). Recovery fired **3 times** — `add-to-cart` attempt 0, `cart-lifecycle` attempts 0 and 1 — and **all three logged completion and landed on `/es/shop-cart.html`**, not member-hub (read from `reports/results.json`'s per-test stdout, not inferred). The 15s confirmation does not block legitimate recovery; and this is the positive proof that the member-hub landing was only ever a consequence of re-logging-in an already-authenticated session.
- The 3 flakes were each read from their own `error-context.md` before being dismissed: `cart-lifecycle` attempt 0 failed on the quantity assertion (`Expected: 2, Received: 11`) with a demonstrably healthy session (header `"Mi cuenta"`, **zero** "Iniciar sesión" occurrences) and *after* `cleanCart` had already succeeded — the documented `setQuantity` residual-overshoot class (§32 Task 7 completion); `checkout-structure` and `pantalones-capri` are unrelated specs this change does not touch.

### Why the full suite was always immune — now explained, not guessed

In the full suite the cart specs run after `login.spec`, which genuinely invalidates the shared session (§24), so the tell is **real**, recovery is **correct**, and `logon.html` renders a real form because the user really is logged out. The misfire needs the opposite state — a **valid** session plus a cold cart navigation — which only the standalone/targeted ordering produces. Same code, opposite session state, opposite outcome. That is why three sessions of full-suite green never contradicted a 2/2 standalone red.

### Rules earned

- **"Not found ≠ seen-and-false" is only safe when the pre-hydration DOM is genuinely EMPTY.** On a server-rendered site it is the *logged-out page* — a positively rendered **wrong** answer, which satisfies a "positive tell" check perfectly. Prefer requiring a tell to **persist** over trusting a single instant.
- **§29's rule applies to detectors, not just to specs' verifies.** A detector that cannot tell its target state from a transient that looks identical will act on the transient — and here the action was destructive (an unnecessary re-login), not merely a false green.
- **`actUntil` swallowing the act's error hides a broken recovery, not just a broken click.** When an act does something expensive and fallible, its failure surfaces only as the generic deadline. Worth knowing before putting more work inside an act.
- **A probe that does NOT reproduce is evidence.** Round 1's healthy navigation is what eliminated the navigation and pointed at the detector; without it the investigation would still be chasing DES.

### Honest limits and what stays open

- **The `logon.html` → member-hub redirect for an authenticated user is inferred, not instrumented.** It is the only reading consistent with the three observations (final URL is member-hub; no login form was reached; `login()` threw rather than returned), but no probe captured that redirect directly. Cheap to confirm if it ever matters.
- **The 150s budget collision is REAL, CONFIRMED, and deliberately NOT fixed here** (one fix at a time). Proven by the pre-fix attempt 1's raw `Test timeout of 150000ms exceeded while setting up "cleanCart"`: `cleanCart` is a **fixture**, so `cart-lifecycle.spec`'s own `test.setTimeout(240_000)` — which lives in the test **body** — has not applied yet when it runs, and `waitForLoaded()`'s own budget (`SKELETON_DEADLINE_MS` 30s + `RECOVERY_DEADLINE_MS` 120s) equals the des 150s test timeout exactly. Consequence: a slow-but-legitimate recovery can still be killed by Playwright's generic timeout before the crafted diagnostic fires. Much less likely now that the misfire is gone, but unchanged as a defect. Stays in the backlog.
- **`SESSION_TELL_CONFIRM_MS = 15_000` is sized against one live measurement** (~5-8s, sampled every 250ms) with a 2× margin, not against a bounded worst case DES publishes. If a future session sees a legitimate recovery skipped, that constant is the first suspect.

---

## 34. `/code-review high` on the cart-regression diff, then two Jorge-directed follow-ups — five real fixes, two of them multi-part (2026-08-16, same day as §33)

**Context.** Immediately after §33 closed, Jorge asked for a multi-agent code review of the cart-regression effort (`e2272a9..HEAD`) specifically framed as "keep the platform in use-and-maintain until more coverage is added" — i.e. hunt real bugs, don't redesign. `/code-review high` ran 8 finder agents + an independent verification pass; every finding below was re-verified by hand (reading the actual source, and in one case Playwright's own bundled source) before being acted on, not taken on the sub-agents' word.

### P0 — `ensureEmptyCart`'s session-blind-spot, and a self-caught regression while fixing it

**Finding, verified against `CartPage.ts`/`Header.ts`:** `src/support/cartCleanup.ts`'s drain loop only routed through `CartPage.waitForLoaded()` (the session-aware detector §33 just hardened) when a removal happened to bring the line count to exactly 0 — so a session death mid-drain, with lines still remaining, fell through to the loop's own bare `isEmpty()` check next tick, which reads `false` on a wrong-page render, and `removeFirstItem()` then threw its generic "no line items to remove" instead of the crafted session diagnostic. Fix: call `waitForLoaded()` unconditionally after every removal (commit `0a9b8ca`) — free on the happy path via `actUntil`'s `immediateFirstCheck`.

**The fix's own first live-validation attempt failed — and the failure was mine, not DES's.** The first `Edit` accidentally deleted the `await cart.removeFirstItem();` line while replacing its neighbouring comment; the live rerun showed `ensureEmptyCart` looping 15 times against an unchanged `Cesta (2)` cart with zero clicks fired. Caught by reading the failure's own state (not assumed passing) exactly as §28's method note prescribes — corrected in place, re-validated live: the drain now completes cleanly, and the run's two remaining failures were independently attributed to already-named, unrelated noise (`§28`'s drawer message; the `setQuantity` overshoot class). Worth recording as its own lesson: **live-validating a fix is what caught a bug the fix itself introduced** — the review→fix→validate loop worked as designed, including on its own mistake.

**Second evidence pass on the still-open 150s budget item (backlog item 5, no code change).** The same review found that `SESSION_TELL_CONFIRM_MS` (15s, §33) fires on *every* cold cart navigation, not only genuine misfires, and that `RECOVERY_DEADLINE_MS` (120s) was never re-sized after that addition landed on top of `LoginPage.login()`'s ~105s worst case — narrowing, not confirming, the "far less likely now" read §33 shipped with. Recorded as evidence only; the item's *start when* threshold (it costs an actual diagnosis) is unchanged.

### Builder unbounded click — closed (commit `03aa765`)

`builder/generate/TemplateGenerator.ts`'s generated `openOverlay()` clicked its trigger with no `timeout`, so an SPA-re-rendered-away trigger burned the full 150s test timeout instead of the generated `actUntil`'s own 20s deadline (findings §26, never fixed there). Added `{ timeout: 5_000 }`, matching the hand-written precedent everywhere else in the suite. Validated: unit assertion updated, a fresh `pnpm build-tests --top 5` draft carried the bound, `pnpm test:generated` ran it live — overlay opened/closed cleanly, 22.4s, no retry.

### Analyzer vocabulary gap — half of it was a real gap (commit `368d334`)

The backlog described two messages "falling through to `unknown`". Verified against `analyzer/failures/classify.ts` and its own pre-existing unit test: only the §28 drawer message (`ProductPage: the add-to-cart confirmation drawer never appeared`) actually did — added to the existing `environment-noise` pattern, alongside its two `ProductPage` siblings already there. The *other* message CLAUDE.md's own summary had paired with it (`add-to-cart.spec`'s tightened `toBe(1)` mismatch) was **already** correctly classified `assertion` — `expect(received).toBe(expected)` matches that rule's pattern regardless of the specific numbers. Deliberately left as `assertion`, not folded into `environment-noise`: the message text (`Expected: 1, Received: N`) is identical whether the cause is drawer-retry noise or a genuine cart-add regression, so no signature could tell them apart without risking `heal` missing a real bug. A regression test locks the decision in.

### Desktop PLP filter/sort gap — TWO fixes were needed, not one (commits `c8b5544`, then `01dd927`)

**First fix (`c8b5544`), correct but insufficient alone.** Live-probed the actual desktop toolbar: "Filtrar" is a normal, on-screen, non-off-canvas button — clicking it (the crawler's own `force:true, timeout:5_000` shape) succeeded cleanly (~1.9s) and revealed `role=complementary "Filtros"`, **not** `dialog`/`menu`. `newOverlayNodes()`'s `OVERLAY_ROLES` only recognized the latter two, so a successful click was never registered as a reveal — the crawler had the knowledge on screen and threw it away. Added `complementary` to `OVERLAY_ROLES`; `discoverInteractions()` end-to-end against a live PLP returned `outcome: "overlay"` with all 7 target labels. Two unit tests lock in the confirmed `Filtros` shape. **This is where the investigation paused and the fix was reported as closing the backlog item** — a mistake, corrected below.

**Jorge directed a re-crawl to prove it in the map, not just in isolation.** Two live seeded re-crawls followed:
1. First attempt used the bare `pnpm explore --update` (no env overrides) — completed but used the small default budget: 85 pages, **0 Checkout pages** (a real regression against the committed 139-page map — reported and NOT committed).
2. Second attempt used the full documented recipe (`EXPLORER_TIME_BUDGET_MS=1200000 EXPLORER_MAX_PAGES=150 EXPLORER_SEED_CHECKOUT=on`), launched **detached** via PowerShell `Start-Process` per the 2026-07-30 harness-kill lesson — completed cleanly, 192 pages (better breadth than the historical 139), but **still 0 Checkout pages**, and — read directly from the written map, not the log — **0 `complementary` elements anywhere**, despite "Filtrar" apparently succeeding mid-crawl in the log tail. Grepping the full log found the real picture: **"Filtrar" was attempted 8 times across 8 different pages, and all 8 failed** with `TimeoutError: locator.click: Timeout 5000ms exceeded — waiting for getByRole(...)` — the locator never resolved at all, not an off-canvas/actionability failure.

**Second fix (`01dd927`), the actual root cause.** A dedicated timing probe (real `waitForSettle(DEFAULT_SETTLE)` + a live `getByRole` poll, no manual extra wait) measured it directly: `waitForSettle` returned at t+10.7s (a slow but ordinary DES window), yet "Filtrar" did not even exist in the accessibility tree until **t+16.1s**, and a click attempt right then still timed out (2s bound) — the toolbar hydrates on a materially later, separate cycle than the product grid `waitForSettle` is keyed on. This is precisely the "element visible before its Vue handler attaches" class CLAUDE.md's Interaction-reliability rule exists for — except `discoverInteractions()`'s own `MAX_CLICK_ATTEMPTS` retry loop never applied to a **throwing** click: the exception escaped the loop after one try, straight to the outer per-candidate `catch`, so a genuinely slow-hydrating element got exactly one shot instead of three. Fixed: a throwing click now pauses (`INTERACT_SETTLE.pollIntervalMs`) and retries in place, same as a click that succeeded without visible effect; if every attempt still throws, the candidate now gets a recorded `outcome: 'none'` instead of vanishing from the map with no trace at all (§28's "a diagnostic must say what it saw," applied one level up, to the crawler itself). **Live-validated at real crawler timing** (settle → `discoverInteractions` immediately, no added wait): settle returned at t+7.4s, `discoverInteractions` retried ~8.5s and returned `outcome: "overlay"` with all 7 labels — the exact case that failed 8/8 in the live crawl, now succeeding. Two existing unit tests whose expectations encoded the old "abandon on any throw" behaviour were rewritten; a new test locks in the retry-then-succeed shape.

**Rule earned, worth promoting alongside §29's:** *retry doctrine must cover a THROWING act, not just an act that succeeded and changed nothing* — a hand-rolled retry loop that only re-tries the "no-op" branch quietly halves what act→verify→retry was supposed to protect, and the gap is invisible until something's hydration is slow enough to hit it reliably.

### `primeCart` — the checkout seed's silent failure, root-caused (commit `9a9aade`)

Both live crawls above logged `primeCart failed — skipping the checkout seed this crawl` with **zero** diagnostic detail — `explorer/crawl/primeCart.ts`'s catch block was a bare `catch { return 'failed'; }`, exactly the risk the §32 session-close audit had already flagged and left unfixed. First fix: log the caught error (`console.warn`, matching the crawler's own diagnostic convention) — still never throws.

**Reproducing it live surfaced a second, more interesting bug: there was no caught error at all.** `primeCart`'s own recipe (`addOneItem()`, the same "camiseta" search → PDP → size → add path used throughout this doc) completed with **no exception**, yet the post-add `cartCount()` check still read 0, landing on the `(await driver.cartCount()) > 0 ? 'primed' : 'failed'` branch's `'failed'` side — a genuine add, misreported as a failure, no error anywhere to log. A follow-up probe pinned the mechanism exactly: `cartCount()` navigates via `goToCart()` and reads `CartTab.itemCount()` **once**, with no retry — measured directly, that single read returned `0` at t+4055ms and the *correct* count 500ms later. Every other `itemCount()` call site in the suite wraps it in `expect.poll(...)`; `primeCart`'s driver was the one place that read it bare. Fixed: `cartCount()` now polls via `actUntil` (`deadlineMs: 6_000`), the same fix shape as every other cart-hydration race already documented in this file (§29/§31/§33's own family — "0 ≠ genuinely empty" is "not found ≠ seen-and-false" wearing a different disguise). Live-validated: re-ran `primeCart` against DES with the fix — correctly reports `already-primed` (the shared account carries 9 leftover items) instead of racing the same read that misreported `'failed'` moments earlier.

### Net state at the end of this entry

Both explorer fixes (`01dd927`, `9a9aade`) are validated **in isolation**, live, against DES — but **postdate** both live re-crawls above, so neither crawled map (85-page and 192-page, both uncommitted) demonstrates them together in a real full crawl. The committed map is still the pre-existing 139-page one (2026-07-30). **Standing next action, Jorge-directed:** run one more seeded re-crawl with all fixes in place before anything else — full recipe, detached launch. Until that lands, "the map has the PLP-filter panel and checkout back" is an expectation, not a verified fact. **(✅ RUN 2026-08-17 — see §35. Two of the three fixes proved out; `c8b5544` did not.)**

---

## 35. The standing re-crawl, run — two fixes proven in a real crawl, the third still unproven, and the crawl found a defect in one of the fixes (2026-08-17)

**Context.** §34's standing next action, executed. Full recipe (`EXPLORER_TIME_BUDGET_MS=1200000`, `EXPLORER_MAX_PAGES=150`, `EXPLORER_SEED_CHECKOUT=on`), launched **detached** via PowerShell `Start-Process` per the 2026-07-30 harness-kill lesson. DES probed HTTP 200 before launch; working tree clean at `65bca07`. Completed cleanly: **exit 0, 140 pages (58 anon + 82 auth), 1 auth error**, ~55 min wall-clock. Map committed as `0144363`.

⚠ **Method note, earned twice in ten minutes: a gate that "fails" in a verification script you have never checked against the real schema is worth nothing.** The first two passes over the written JSON reported `elements: 0` and `must-capture: 0` — both were my script's wrong assumptions, not map defects. Elements and interactions are **top-level collections** (`m.elements`, `m.interactions`, joined by `pageId`/`triggerElementId`), not nested under `pages[]`; and an element's name field is **`label`**, not `name`. Read one sample object before trusting any aggregate over it. B17's "verify against the JSON, not the log prose" needs this corollary or it produces confident nonsense.

### Gates, verified directly against the written JSON

| Gate | Result |
|---|---|
| schema / pages / flows | 1.7 / 140 / 140 |
| unique element ids (B17) | **3896 / 3896**, zero duplicates |
| Checkout | 1 page, 1 flow, `pageType: Checkout` |
| must-capture "Añadir a la cesta" | **1 → `overlay`**, 7 revealed |
| desktop fingerprint (mobile drawer) | 0 — correct |
| **`complementary` elements** | **0 — FAILED** |

### Against the committed 2026-07-30 map — the only honest way to read the numbers

| | committed (139p) | this crawl (140p) |
|---|---|---|
| elements | 3781 | 3896 |
| interactions | 66 | **119** |
| outcomes | 19 overlay / 46 none / 1 nav | 22 overlay / 95 none / 2 nav |
| **filter/sort interactions** | **0** | **19** |
| `revealedBy` elements | 70 | 86 |
| PDP / PLP | 50 / 33 | 43 / 36 |

**`9a9aade` (primeCart's cart-count hydration race) — PROVEN in a real crawl.** No `primeCart failed` line anywhere, and `/es/checkout.html` was the auth session's **first** visited page. Both of §34's re-crawls failed at exactly this point; this is the first crawl since the fix and it seeded on the first try.

**`01dd927` (retry a THROWING click) — PROVEN, and visible as a number.** The 19 filter/sort candidates ("Filtrar" ×3, "Precio ascendente"/"descendente" ×4 each, "Color" ×4, "Talla", "Con descuento", "Novedad", "Limpiar") **exist in the map at all** for the first time — the committed map holds zero. Total interactions 66 → 119. They no longer vanish without a record, which is exactly what the fix set out to change.

**`c8b5544` (`complementary` as an overlay role) — NOT proven, still open.** Zero `complementary` elements anywhere, and all 19 filter/sort interactions recorded `outcome: 'none'` with 0 revealed elements. It remains correct in isolation (§34's probe) and unproven in a crawl. **Do not close it on isolated evidence a second time** — that is precisely the mistake §34 had to walk back.

### The crawl's own finding: `01dd927` traded a logged failure for a silent one

§34's diagnosis came from grepping **8 `TimeoutError` lines** out of the previous crawl's log. **This crawl's log contains not one line about "Filtrar"** — no timeout, no "interaction skipped". The reason is inside the fix itself: the new click-retry `catch` (`interact.ts:194`) was written bare — `catch { await wait; continue; }` — so from the map alone `outcome: 'none'` cannot distinguish

- every attempt **threw** (locator never resolved — §34's hydration-lag shape), from
- a click that **landed** and revealed nothing the crawler recognizes (what a still-missing overlay role looks like).

Those two demand opposite next moves, and the crawl commissioned to settle the question could not answer it. The fix's own comment cites §28 ("a diagnostic must say what it saw") to justify *recording* the `none` — it kept the **what** and dropped the **why**.

**Fixed the same session (`d5f9595`).** The last unresolved click error is retained and logged when attempts are exhausted, and **cleared the moment any attempt lands**, so a later genuine no-op is never blamed on an earlier throw. Two unit tests lock both directions (warn when every attempt throws; **no** warn when a later attempt clicked cleanly). The next crawl's log will name which branch the filter toolbar is actually in.

**Rule earned — a corollary to §28:** *when a fix converts a crash into a recorded outcome, check that the REASON survives the conversion.* Swallowing an exception to keep going is right; swallowing it without a trace turns a diagnosable failure into an ambiguous one, and the loss stays invisible until the next investigation needs exactly that line.

### Honest limits

- **Why the filter clicks yield `none` is unknown, not narrowed.** One plausible-but-unmeasured mechanism: 3 attempts × (5s click bound + 0.5s pause) ≈ 16.5s against §34's measured ~16.1s hydration leaves ~0.4s of margin — a coin flip, not a budget. Not probed; the new log line is the cheap instrument that settles it next crawl, before anyone spends a probe on it.
- **The 1 auth error's detail is unrecoverable.** The crawler pushes it to an in-memory `errors[]` that neither the log nor the map persists. Ordinary variability (2026-07-30's seeded crawl logged 2), but worth knowing it cannot be read after the fact.
- **PDP 50 → 43** is a real drop against the committed map, within documented crawl-to-crawl variability, not investigated.
- **The suite was not re-run** — nothing in this session touches `tests/` or `src/`. *(Superseded hours later — §36 ran it twice.)*

---

## 37. The addToCart re-click: one spec add landed 8 units — root-caused, bounded with a click cap (2026-08-18)

**Context.** The queued coverage pair ran first thing in a healthy window (`pnpm test` **26/26, 0 flaky, 13.0m** — the cleanest run in weeks — then `pnpm plan --update`, coverage 38/139 → **16/140**, commit `1fd9c41`). The same day's `pnpm qa-cycle` hit a slower window (19.2m) and went 24/26 with **both cart specs flaky**; Jorge directed the investigation. All evidence was read before any conclusion (`error-context.md`s, `reports/results.json` per-attempt timings/stdout) and preserved in the scratchpad (`evidence-2026-08-18-qacycle/`) before any re-run.

**The failing snapshot** (`cart-lifecycle` attempt 0, failed `lineItemCount toBe(1)`): `tab "Cesta (9)"`, two lines — **"Camiseta cuello perkins encaje manga volantes", talla L, qty 8** (8 × 25,99 = 207,92 €) and **"Jeans barrel tiro alto lazos", talla 32, qty 1** (35,99 €). This after `cleanCart` had verified a content-identified empty state (its `isEmpty()` reads the `/cesta vacía/i` copy, not a bare zero count) and the spec had performed exactly ONE `addToCart()` — which **returned success**.

### Root cause — the act's destructive click repeats while its only confirmation lags

`ProductPage.addToCart()`'s desktop branch is an `actUntil` loop at ~1-1.5s cadence: click "Añadir a la cesta" → sleep 500ms → check the confirmation drawer (content-identified, §28). **Every non-throwing click is a REAL server-side add; the drawer is the only observable, and in degraded windows it renders several cycles late.** The anti-double-add guard (`if (await confirmed()) return`) reads that same lagging drawer, so it cannot see the adds it is supposed to prevent — it only stops clicking once the drawer is finally detectable. Eight cycles before the drawer appeared → 8 clicks → 8 units, merged into ONE line by §32's same-product+size merge (which is also what proves they came from one loop, not eight events). The sibling flake (`add-to-cart` attempt 0) is the unbounded worst case: the drawer **never** appeared within the 20s deadline → ~15-25 clicks fired at a degraded add service; the residue only stayed within `cleanCart`'s 15-removal drain bound by luck.

**This mechanism was already documented, not new:** `removeFirstItem`'s own deadline comment (§32) records a line observed live at **quantity 13 "via §28's confirmation-drawer noise re-triggering the add"** on 2026-08-13. What is new is that it graduated from "dirties the shared account" to "breaks a spec's exact-count assertion" — twice in one window. The structural statement, for the standing-rules list: **an act→verify→retry loop whose act is DESTRUCTIVE and whose only observable is laggy re-fires the destructive act once per cycle of lag.** "Click lost (must retry, §7)" and "click landed, confirmation late (must NOT retry)" are indistinguishable through a single lagging observable.

### The fix — a cap on real clicks (Jorge's call: option 2 of 3)

`MAX_ADD_CLICKS = 3` (the crawler's `MAX_CLICK_ATTEMPTS` precedent, §34): past the cap the act degrades to pure polling for the rest of the deadline. A **throwing** click is deliberately not counted (it never resolved a target — §34's retry-on-throw distinction, applied in reverse). Worst-case shared-account residue drops from ~15-25 units to 3 on both paths (drawer-late AND drawer-never). The timeout diagnostic now reports the click count, and — §35's `d5f9595` lesson, applied BEFORE the loss this time — a **late success** logs `addToCart needed N clicks`, so a later exact-quantity failure can be told apart from §32's Sumar-unidad overshoot (the two need opposite fixes).

**Validation.** Offline: typecheck/lint clean, unit 434/434. Live (targeted, 3 specs sharing `addToCart`): **3 passed / 1 flaky, 5.6m** — the flaky read from its own snapshot before classifying: ONE line, qty 3 (77,97 €), failed `lineQuantity toBe(2)` *after* `increaseQuantity`, i.e. either §32's overshoot class or a 2-unit add under the cap — **indistinguishable from this evidence** — stated plainly: that run carried the cap but PREDATES the log line (which landed right after it, prompted by exactly this ambiguity), so the next occurrence, not this one, will name its branch. NOT a regression: the cap can only stop clicks earlier, never create units. Honest limit: the cap **bounds** the class, it does not eliminate it — `cart-lifecycle`'s exact-quantity assertions remain exposed to 2-3-unit adds in degraded windows.

### Open, recorded honestly

- **The jeans line is UNEXPLAINED.** No spec adds jeans; every cart-affecting locator is scope+name-anchored (`removeFirstItem` clicks only "Eliminar producto"/"Restar unidad" inside the first `.product-list-card`; `addBtn` is panel-scoped with an exact name) — none can resolve to a recommendation quick-add ("Añadir a la cesta {producto}", §18's name shape). The product (`c0p226930445`) IS in the cart page's own recommendations carousel, which suggests a spurious add on that surface, but nothing discriminates our code vs. another actor on the shared account vs. DES itself. If a foreign line appears again in a failure snapshot, that recurrence is the evidence this needs.
- **Option 1 (a second, faster observable for the guard: the header cart badge — a `9+` generic was visible next to "Ver cesta" in the failing snapshot) is filed, not built.** It is the only fix that would eliminate the class, and it needs a live probe first: does the badge update reactively without navigation, and what does it render at 0? *Start when:* a `[ProductPage] addToCart needed N clicks` log line co-occurs with a broken exact-quantity assertion — that pairing proves the cap's residue is what breaks specs, and the badge probe earns its cost.

---

