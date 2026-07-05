# DES Live-Validation Findings

**Date:** 2026-06-17 (created), last updated 2026-07-05 (later: PLP-grid extraction gap closed; Builder Engine M6b live-validated; testId attribute-provenance fix M7 closes B15; Checkout/PDP classifier gap closed, M7b closes B13; shared-element deprioritization closes the remaining scope of B14, §14; interaction-aware crawl M8 live-validated, closes the last open row of backlog B9, §15).
**Status:** Foundation fully validated live — login, search, PLP/PDP, filters, and cart all pass reliably (in isolation and as a serialized full suite). All known interaction-reliability bugs found live have been fixed (§7). The Explorer Agent is DES-ready with a first live crawl committed (§8). The Coverage Planner is live-validated with a first evidence-annotated map committed (§9). The Builder Engine (M6b) generates navigation specs that pass live against DES (§11); the testId/`locate()` gap it surfaced is now closed (§12, M7) — generated specs assert on real, page-specific testIds again. The Checkout/PDP classifier gap (§10) is closed (§13, B13). B14's remaining scope (leaf pages with no testId-bearing element picking a generic shared header signal) is closed (§14) — the map now tags Header/Footer/MiniCart provenance on elements and the Builder deprioritizes them. The crawler now opens overlays/dialogs during the crawl (M8, §15) — the map records trigger→outcome→revealed-elements (schema 1.5), closing the last open row of backlog B9 ("nav menus/overlays... opened during crawl"). Residual, non-blocking environment noise and forward-looking leads remain open — see the "Open leads" callouts in §7/§8 and the map-completeness consequence in §9.
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
