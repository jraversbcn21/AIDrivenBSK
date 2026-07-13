# DES Live-Validation Findings

**Date:** 2026-06-17 (created), last updated 2026-07-12 (earlier, 2026-07-06: PLP-grid extraction gap closed; Builder Engine M6b live-validated; testId attribute-provenance fix M7 closes B15; Checkout/PDP classifier gap closed, M7b closes B13; shared-element deprioritization closes the remaining scope of B14, §14; interaction-aware crawl M8 live-validated, closes the last open row of backlog B9, §15; deterministic must-capture interactions M8b live-validated, closes the M9 prerequisite, §16; Builder interaction-spec generation M9 live-validated and closes B16, §17; 2026-07-12: A5's Personalizable-product fix shipped and live-validated, closing backlog A5, §18; 2026-07-12, later: A6's login-flow-drift fix shipped and live-validated, closing backlog A6, §19; 2026-07-13: F18 coverage-matching re-root live-validated, §20; 2026-07-13, later: B17 element-id dedup live-validated, closing B17 and audit findings F1/F7, schema 1.6→1.7, §21).
**Status:** Foundation fully validated live — login, search, PLP/PDP, filters, and cart all pass reliably in isolation **and as a serialized full suite** (`pnpm test` 4/4, no `--no-deps` workaround needed — confirmed §19). A5's catalog-drift gap in `add-to-cart.spec.ts` is fixed and live-validated (§18). A6's login-flow drift (`/es/logon.html` rendering the e-mail+password form directly, no "Continuar con e-mail" interstitial — found during A5's probe, contradicted §4's recorded recipe) is fixed and live-validated (§19) — `LoginPage.login()` now matches the real, current flow. All known interaction-reliability bugs found live have been fixed (§7). The Explorer Agent is DES-ready with a first live crawl committed (§8). The Coverage Planner is live-validated with a first evidence-annotated map committed (§9). The Builder Engine (M6b) generates navigation specs that pass live against DES (§11); the testId/`locate()` gap it surfaced is now closed (§12, M7) — generated specs assert on real, page-specific testIds again. The Checkout/PDP classifier gap (§10) is closed (§13, B13). B14's remaining scope (leaf pages with no testId-bearing element picking a generic shared header signal) is closed (§14) — the map now tags Header/Footer/MiniCart provenance on elements and the Builder deprioritizes them. The crawler now opens overlays/dialogs during the crawl (M8, §15) — the map records trigger→outcome→revealed-elements (schema 1.5), closing the last open row of backlog B9 ("nav menus/overlays... opened during crawl"). The crawl now deterministically captures the "Añadir a la cesta" → "Tallas" interaction in the committed canonical map (M8b, §16), closing the M9 prerequisite. The Builder now generates interaction specs from that capture (M9, §17) — live-validated 5/5, closing B16 (non-unique testId as loaded-signal) along the way, and surfacing/fixing a genuine live bug in the overlay-open signal itself (a persistent chrome dialog broke `getByRole('dialog')` uniqueness). Coverage matching is restored (F18, §20) — `coveredBy` links evidence to map flows live again. The duplicate-`MapElement.id` observation surfaced in §17 is now fixed (B17, §21, schema 1.7 — zero duplicate ids). Residual, non-blocking environment noise and forward-looking leads remain open — see the "Open leads" callouts in §7/§8 and the map-completeness consequence in §9.
**Environment:** DES (`https://des-ecombknj-test-webecom.bk.apps.axdesecocp1.ecommerce.inditex.grp/es/`)
**Test account:** `jorge@esqa.com` (in local `.env`, gitignored).

---

## 1. What was validated live ✅ (merged)

Running `pnpm exec playwright test --project=setup` and `--project=chromium` against DES:

- **`auth.setup` (login) — PASS** (~32s)
- **`login.spec` — PASS**
- `search-plp-pdp.spec`, `add-to-cart.spec` — still failing (see §5).

The login fixes are merged to `master`. Files changed: `src/support/consent.ts`, `src/pages/LoginPage.ts`, `src/components/Header.ts`, `src/config/environments.ts`, `tests/auth.setup.ts`.

---

## 2. Infrastructure / environment notes

- **DES is reachable** from the dev machine on VPN (HTTP 200).
- **Playwright browser download is blocked by the corporate proxy cert** (`SELF_SIGNED_CERT_IN_CHAIN`). Workarounds:
  - One-off: `NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm exec playwright install chromium` (relaxes TLS for the download only).
  - Clean/persistent: `export NODE_EXTRA_CA_CERTS=/path/to/corp-root-ca.pem` before installing.
- **`ignoreHTTPSErrors` is NOT needed** — Chromium trusts the corporate CA from the OS store, so navigation to DES works.
- **Never use `waitForLoadState('networkidle')`** on this site: it streams third-party beacons (gtm, optimizely, prismic, snapchat, tangoo) indefinitely, so the network never goes idle. Wait by URL or for specific elements instead.

---

## 3. Confirmed entry gates (handled in `acceptConsent`)

On a fresh session, DES layers several gates before the store is usable:

1. **OneTrust cookie banner** — accept button `#onetrust-accept-btn-handler` (text "Aceptar todas las cookies"). Injected asynchronously and re-appears across pages, so it is handled with `page.addLocatorHandler(...)` (auto-dismiss on demand) — see `installCookieAutoDismiss`.
2. **Gender/section gate** — `link "Ir a moda Mujer"` (`/es/h-woman.html`) or `"Ir a moda Hombre"`. Required to enter the store; clicking it is part of `acceptConsent`.
3. **Location prompt** — floating "¿Quieres guardar tu ubicación?" / "España" / "Guardar". Non-blocking; ignored.
4. **driver.js onboarding tour** — `.driver-overlay` coach-marks that intercept clicks on a first session (root cause found and fixed — see §7).

---

## 4. Confirmed login recipe (the working flow)

DES login is the multi-step **"BERSHKA MMBRS"** flow (implemented in `LoginPage`):

1. `goto('/es/')`
2. `acceptConsent` → OneTrust auto-dismiss handler + gender gate ("Ir a moda Mujer").
3. `goto('/es/logon.html')` **directly** — the header `button "Iniciar sesión"` is hydration-flaky; direct navigation is robust. (Reaching `logon.html` requires the gates to have been passed, else it redirects to `/es/`.)
4. `button "Continuar con e-mail"` (the MMBRS method screen; also offers Facebook).
5. `textbox "E-mail"` (wait for visible — hydrates late) → fill user.
6. `textbox "Contraseña"` → fill password.
7. `button "Iniciar sesión"` (the only one on `logon.html` is the form submit) → submit.
8. Success → redirect to **`/es/member-hub.html`** (the MMBRS member card). Logged-in signal: URL matches `member-hub`/`account`, and the store header no longer shows a *visible* "Iniciar sesión" affordance.

Confirmed header selectors (store, role-based — Playwright pierces shadow DOM):
- **Search** → `button "Buscar en tienda"` (icon button; opens an overlay).
- **Cart** → `link "Ir a la cesta"` → `/es/shop-cart.html`.
- **Login** → `button "Iniciar sesión"` (text "Acceder").

---

## 5. Search/Cart — selectors confirmed live (2026-06-17, second pass)

All real selectors below were confirmed live against DES (accessibility-tree probing + screenshots) and are now implemented in `SearchBar`, `Header`, `FiltersPanel`, `ProductCard`, `ProductPage`, `MiniCart`, `SearchResultsPage`. Unit suite (76 tests), `typecheck`, and `lint` all pass; `login.spec` and the search/cart specs each pass **in isolation**.

**Confirmed flow:**
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

## 7. Onboarding-tour + search/cart flakiness: root causes found and fixed (2026-06-22 → 2026-07-02)

The §5 hypothesis ("fresh `auth.setup` session triggers the tour more persistently") was investigated directly and found **wrong**. The real mechanism, and everything discovered chasing the flakiness underneath it, is summarized below as final state — the intermediate "narrowed but not fixed" investigation steps are omitted; only the resolutions and the environment facts that constrain future work are kept.

**driver.js tour — root cause confirmed and fixed.**
The tour is gated by a `bsk_onboarding` cookie (JSON array of tour ids already seen). Pre-setting it **before any navigation** suppresses the tour everywhere — home, logon, member-hub, search, PLP/PDP, cart:
```
bsk_onboarding = ["mmbrs","mmbrs_hub_mobile"]
```
(`mmbrs` covers home/logon/search/PDP/cart; `mmbrs_hub_mobile` covers `/es/member-hub.html` specifically.) Implemented as `suppressOnboardingTour(page)` in `src/support/consent.ts`, called from the single navigation chokepoint `BasePage.goto()` — every page object gets it for free, including `LoginPage`/`auth.setup`. This replaces reactive Escape-key dismissal as the primary defense; `dismissOnboardingTour` stays as a fallback in case a new tour id ships. Verified live across the full home→login→member-hub→search→PDP→cart flow: `.driver-overlay` never reappeared.

**`firstProduct()` banner-tile bug — found and fixed.**
On `/es/q/{term}` results, the grid's first `listitem` is **always** a promo/sale banner tile (e.g. `href=/es/mujer/sale/bershka-...html`, no PDP link) — reproducible 100% of the time, not flaky. Fixed by filtering on the confirmed PDP href pattern (`a[href*="-c0p"]`) instead of "any listitem containing a link."

**Three interaction-reliability bugs — found and fixed.** All the same class: *fire-once interactions silently lost to Vue hydration lag* (an element can be visible/clickable before its handler is attached). This is now the framework's standing rule — see CLAUDE.md's "Interaction reliability" section.
1. **Search `Enter` lost** — the first Enter press was ignored (~1.5s dead window after the input turns visible), the second navigated. Fixed in `SearchBar.search()`: re-fill + re-press until the URL is `/q/…` (act→verify→retry).
2. **Size-click lost (add-to-cart)** — a "successful" `force: true` click on a size could leave the cart genuinely empty. Fixed in `ProductPage`: `selectFirstSize` retries until the "Tallas" dialog is open; `addToCart` retries until the dialog *closes* (the only real confirmation the add happened).
3. **Card-open unverified** — `ProductCard.open()` now retries until the `-c0p<id>.html` PDP URL is reached.
4. Explicit timeouts were also added to `search-plp-pdp.spec.ts`/`add-to-cart.spec.ts` (`HYDRATION_TIMEOUT_MS`, sized to the measured ~5s+ grid hydration) — a real, verified improvement, but insufficient alone; it took the three act→verify→retry fixes above plus the environment facts below to close the flakiness fully.

**Environment facts established** (clean independent probes, not framework bugs):
- **`/es/q/{term}` is NOT server-routable** — a reload/direct-nav lands on the home page. **Never reload the results page as a recovery**; re-run the whole search through the UI instead (`waitForResults()` fails fast with a diagnostic error; the test-level retry re-runs the search).
- **Dead `/q/` loads are real**: some loads never leave the pre-results state even with a long budget — waiting longer does not help.
- **Degraded app shells are real**: DES occasionally serves an untranslated shell or a broken one (empty `<main>`, raw `/ItxHomePage?genderUrlName=…` hrefs) where the header search pill never exists. `SearchBar.search()` reloads the current page once mid-deadline for these.
- **Genuine DES maintenance/error pages appear occasionally** ("We're making some improvements right now", "OH NO... ESTO ES UN ERROR") — pre-prod backend instability, not a selector bug; did not reproduce on retry.
- **Parallel full-suite runs failed 6/6** (one shared account; `login.spec` re-authenticates it mid-run) before serialization; isolated runs pass essentially always. `playwright.config.ts` now runs `workers: 1` and `retries: 1` (trace-on-first-retry captures evidence); `des`/`local` test budget raised to 150s so composed act→verify→retry deadlines can finish.
- Some DES elements carry test-id-like attributes (e.g. `data-qa-anchor="filterButton"`) — this attribute-provenance gap is now handled, see §12 (M7).

**Open leads (not yet investigated, low priority — pick up only if flakiness resurfaces):**
- In some late-afternoon failure snapshots the mobile-nav dialog ("Categorías y productos") was open, blocking clicks. Suspicion: queued retry force-clicks fire later against shifted UI. Would need state-aware retry loops (check what's on screen before re-clicking, close stray overlays first) to confirm/fix.
- Nothing empties the test account's cart between runs — repeated same-day runs accumulate items. A cart-cleanup fixture is missing (cosmetic/observability only; doesn't affect correctness).
- DES service quality visibly varies within a day (morning runs cleaner than afternoon in observed sessions) — treat a sustained red streak as environment noise, cross-check with a quick manual probe before touching framework code.

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
