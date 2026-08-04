# DES Live-Validation Findings

**Date:** 2026-06-17 (created), last updated 2026-08-04, latest (§28: the add-confirmation "watch item" root-caused and CLOSED — it was never DES: a dialog-COUNT diff could not identify *which* dialog appeared, so it missed a drawer that was plainly on screen; fixed by matching the drawer's content, suite 15/15 clean). Earlier (§27: Footer component object — `pnpm ask` correctly finds no flow for chrome; landmark + "Nuestras tiendas" confirmed live and the click really navigates; watch item now 7 and proven not spec-specific). Earlier that day (§26: coverage expansion by promoting 6 Builder drafts — suite 8 → 14; map `title` used to harden page-type signals with zero live probing; an unbounded click in the Builder's interaction template root-caused as a 150s hang; the desktop add-confirmation watch item escalated to a pattern). Earlier same day: §25 (PDP wishlist button confirmed live on desktop — closes the onboarding Fase 5 repeat; found and fixed a repeated-element strict-mode-violation masked by a silent `.catch`). Previously updated 2026-08-02 (⚠ §24 CORRECTION + desktop dual-layout divergences: the 2026-07-29 "migration" left the suite still testing MOBILE — the gender-gate click inside `acceptConsent()` reloaded without the param; the real enforcement is now a context-level route interceptor, `src/support/layout.ts`, + a mobile-fingerprint guard on passing tests; task 6 then catalogued and fixed the true-desktop selector divergences — suggestion-click search (desktop Enter on /q/ bounces home client-side), off-canvas filter sidebar, inline PDP size group, "Ver cesta", and the checkout live-session login gate (`src/support/loginGate.ts`); suite 7/7 on TRUE desktop, generated 5/5 — see §24's closing subsections). (Earlier: 2026-07-30, later (SEEDED desktop re-crawl — checkout flow restored to the desktop map, backlog P0 closed: 139 pages, all gates green, `pnpm ask "checkout"` resolves again; ⚠ the desktop checkout element inventory differs from §23's mobile capture — abandon-dialog shape, no shipping methods — see §24's seeded note). (Earlier same day: desktop migration COMPLETED — full desktop re-crawl landed: 140 pages/0 errors, 42 PDPs, B17 clean, must-capture satisfied, suite 7/7, coverage 10/140 (best ever), generated specs 5/5; the canonical map is now DESKTOP-layout knowledge; open decision: checkout seed not passed, so the desktop map has no Checkout flow — §24's completion note). (Earlier: 2026-07-29 ⚠ MAJOR: the whole suite had been testing DES's MOBILE layout since inception — desktop requires `?device=desktop` per navigation, now forced at `BasePage.goto()`, §24.) (Earlier: 2026-07-21: D15 phase 2 COMPLETED — Tasks 5/6 closed, §23's completion section: checkout in the canonical map via the branch-C seed, `pnpm ask "checkout"` resolves (draft generation kept blocked by the Builder's deliberate path guard, Jorge's decision), cost-summary button's accessible name found state-dependent, DES purged the shared cart server-side, the `-n{digits}` category-URL drift proved unstable/reverted). (Earlier: 2026-07-18: D15 phase 2 Task 1 probes checkout inner structure/settle/routability, §23 — checkout IS server-routable, branch C; plus four live drift/degradation observations recorded in §23, including the login interstitial's RETURN, which reopens §19's premise.) (Earlier: 2026-07-14: D15 phase 1 reaches the real checkout, §22 — that update originally missed this header line, caught 2026-07-18; 2026-07-13, later: B17 element-id dedup live-validated, closing B17 and audit findings F1/F7, schema 1.6→1.7, §21; 2026-07-13: F18 coverage-matching re-root live-validated, §20; 2026-07-12, later: A6's login-flow-drift fix shipped and live-validated, closing backlog A6, §19; 2026-07-12: A5's Personalizable-product fix shipped and live-validated, closing backlog A5, §18; 2026-07-06: PLP-grid extraction gap closed; Builder Engine M6b live-validated; testId attribute-provenance fix M7 closes B15; Checkout/PDP classifier gap closed, M7b closes B13; shared-element deprioritization closes the remaining scope of B14, §14; interaction-aware crawl M8 live-validated, closes the last open row of backlog B9, §15; deterministic must-capture interactions M8b live-validated, closes the M9 prerequisite, §16; Builder interaction-spec generation M9 live-validated and closes B16, §17.)
**Status:** Foundation fully validated live **on the TRUE desktop layout since 2026-08-02** (context-level interceptor + per-test mobile-fingerprint guard; suite 7/7, all selectors dual-layout — §24's closing subsections; every suite claim in the paragraphs below predating 2026-08-02 was measured on the MOBILE layout, per the §24 correction). Original mobile-era status: login, search, PLP/PDP, filters, and cart all pass reliably in isolation **and as a serialized full suite** (`pnpm test` 4/4, no `--no-deps` workaround needed — confirmed §19). A5's catalog-drift gap in `add-to-cart.spec.ts` is fixed and live-validated (§18). A6's login-flow drift (`/es/logon.html` rendering the e-mail+password form directly, no "Continuar con e-mail" interstitial — found during A5's probe, contradicted §4's recorded recipe) is fixed and live-validated (§19) — `LoginPage.login()` now matches the real, current flow. **⚠ 2026-07-18 (§23): that §19 finding was REOPENED — the "Continuar con e-mail" interstitial is back on `/es/logon.html` (server-side variant switching confirmed) — and CLOSED the same day: `LoginPage.login()` is now dual-variant (Task 4.5, commit `fix(foundation): dual-variant login`), live-validated setup 1/1 PASS with variant A (interstitial) confirmed served; the "4/4, no `--no-deps` workaround" claim earlier in this paragraph still describes the 2026-07-12 state.** All known interaction-reliability bugs found live have been fixed (§7). The Explorer Agent is DES-ready with a first live crawl committed (§8). The Coverage Planner is live-validated with a first evidence-annotated map committed (§9). The Builder Engine (M6b) generates navigation specs that pass live against DES (§11); the testId/`locate()` gap it surfaced is now closed (§12, M7) — generated specs assert on real, page-specific testIds again. The Checkout/PDP classifier gap (§10) is closed (§13, B13). B14's remaining scope (leaf pages with no testId-bearing element picking a generic shared header signal) is closed (§14) — the map now tags Header/Footer/MiniCart provenance on elements and the Builder deprioritizes them. The crawler now opens overlays/dialogs during the crawl (M8, §15) — the map records trigger→outcome→revealed-elements (schema 1.5), closing the last open row of backlog B9 ("nav menus/overlays... opened during crawl"). The crawl now deterministically captures the "Añadir a la cesta" → "Tallas" interaction in the committed canonical map (M8b, §16), closing the M9 prerequisite. The Builder now generates interaction specs from that capture (M9, §17) — live-validated 5/5, closing B16 (non-unique testId as loaded-signal) along the way, and surfacing/fixing a genuine live bug in the overlay-open signal itself (a persistent chrome dialog broke `getByRole('dialog')` uniqueness). Coverage matching is restored (F18, §20) — `coveredBy` links evidence to map flows live again. The duplicate-`MapElement.id` observation surfaced in §17 is now fixed (B17, §21, schema 1.7 — zero duplicate ids). Residual, non-blocking environment noise and forward-looking leads remain open — see the "Open leads" callouts in §7/§8 and the map-completeness consequence in §9.
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

## 24. Desktop layout discovery — the whole suite had been testing MOBILE (2026-07-29)

**Context.** Found mid-onboarding-session (Fase 5), which was aborted and re-scoped into this migration. The team's manual QA always tests DES's **desktop** layout; the old ModHeader browser extension that forced it was replaced by a URL toggle. Every automated selector, the committed functional map, and all generated drafts had been validated against the **mobile** layout since the project's inception — nobody had ever passed the desktop switch.

**Mechanism, confirmed live by direct probe (run by Jorge):**
- DES decides mobile vs. desktop layout **server-side via the `?device=desktop` query param**. Example: `/es/h-woman.html?device=desktop`.
- **No cookie is set and nothing persists** — the probe confirmed no `device`-related cookie appears after a desktop navigation, and a subsequent param-less navigation renders mobile again. Every server navigation needs the param explicitly.
- Layout fingerprint used by the probe: the mobile nav drawer (`#category-menu-modal`, the permanently-mounted `dialog` from §17) exists on mobile (count 1) and **does not exist at all on desktop** (count 0) — desktop renders a real horizontal nav instead. Useful as a cheap layout assertion in future probes.

**Fix shipped (framework):** `BasePage.goto()` — the single navigation chokepoint — now appends `device=desktop` to every path (`?`/`&`-aware). One-line policy at the same place `suppressOnboardingTour` lives; no spec touched.

**Post-migration suite state (first desktop run, 2026-07-29):** 6 passed / 1 flaky / 1 failed.
- `auth.setup`, `login.spec`, `search-plp-pdp.spec`, `checkout-reach.spec`, `checkout-structure.spec` — **pass unchanged on desktop.** The role-based selector doctrine (getByRole over CSS) paid off: login, search, Tallas dialog, cart tab, and checkout structure are name-stable across layouts.
- `add-to-cart.spec` — flaky (passed on retry #1), the documented Tallas-dialog-close noise (§14/§16/§18), not layout-related.
- `tests/mujer/bombacho-barrel.spec.ts` — **FAILED, real layout casualty:** its Builder-generated `isLoaded()` asserts `[data-qa-anchor="searchBtn"]`, which is unique on mobile but resolves to **4 elements on desktop** (Playwright strict-mode violation; the extra copies live under `section-tree-structure-desktop__search` wrappers). B16's lesson recurs with a twist: **testId uniqueness is layout-dependent.** Probe of the desktop PLP page found the page's own `heading "Bombacho | Barrel"` (2 matches, both proving the right page) as the correct page-specific signal; fix is `getByRole('heading', { name: 'Bombacho | Barrel' }).first()`.

**Fix shipped and validated same day:** `BombachoBarrelPage.isLoaded()` now uses the heading signal (the unused `locate` import removed). Isolated run: PASS (11.7s, no retry). **Full suite after the fix: 7/7 PASS, zero retries, 3.7m** — the first fully-green desktop run, cleaner than many historical mobile runs (not even the Tallas-dialog noise fired). Typecheck/lint clean. The temporary probe (`tests/_probe/wishlist-probe.spec.ts`) was deleted after its knowledge landed here.

**Consequences beyond the suite (open at time of writing):**
- **The Explorer/crawler does NOT go through `BasePage.goto()`** — it navigates via its own `page.goto(path)` in `explorer/cli.ts`/`crawl/`. The committed canonical map (154 pages, schema 1.7) is therefore **mobile-layout knowledge**: element inventories, testId uniqueness (`count` fields), interactions (e.g. the §17 mobile nav drawer finding), and the M8 overlay captures all describe the mobile DOM. Migrating the crawler + a full desktop re-crawl is a pending decision, not done here. **RESOLVED 2026-07-30 — see the completion note below.**
- Generated drafts in `tests/generated/` were built from the mobile map — treat their loaded-signals as suspect on desktop (the bombacho failure above is exactly this class, in a promoted spec). **RESOLVED 2026-07-30 — `build-tests` pruned the mobile-era drafts and regenerated from the desktop map (5/5 live).**
- The stash `fase5-solo-attempt-2026-07-29` (promo-modal auto-dismiss, wishlist spec) was validated against mobile — its selectors need desktop re-probing before reuse. Notably the MMBRS promo modal container carried `class="mobile"`; its desktop behavior is unknown. **(Still open.)**

### Desktop migration COMPLETED (2026-07-30) — the canonical map is now DESKTOP-layout knowledge

**The full desktop re-crawl landed** (`pnpm explore --update`, `EXPLORER_TIME_BUDGET_MS=1200000`, 150 pages/session cap, `device=desktop` via the default `EXPLORER_DEVICE`). Two attempts, stated plainly (RIGOR Regla 7): the first was **killed externally at ~40 min** (the agent-harness background-task limit — NOT a DES hang; the anon session had already completed 70 pages/0 errors and the auth session was at 44 pages when it died; the map writes only on completion, so nothing was lost or corrupted). The second run, relaunched **detached** from the harness, completed cleanly: **140 pages (62 anon + 78 auth), 0 errors, ~40 min wall-clock**.

**The 2026-07-29 hang did not recur, and its suspected cause was directly observed being defused:** the per-interaction 5s bound (`f1960b5`) fired repeatedly during the crawl — including on a PDP's **"Pausar video"** control, exactly the wedged-desktop-video-renderer suspect from the 29th — each time skipping the candidate non-fatally and moving on. The heartbeat + phase-boundary logs (`c58fce7`/`8ada575`) bracketed every phase; no silent window existed.

**Map verified directly against the JSON (B17 precedent, not log prose):** schema 1.7, 140 pages / 140 flows (138 multi-step). Page types: **42 PDP / 53 PLP / 2 Cart / 43 Other — the best PDP population in the map's history** (mobile crawls ranged 0–19 PDPs; the desktop layout exposes the catalog to link-following far better). B17 guard: **4,291/4,291 unique element ids, zero duplicates**. Must-capture satisfied: **1 "Añadir a la cesta" → `overlay`** (Tallas) with `revealedBy`-tagged elements (87 total). Component provenance: 1,369 elements; `count > 1`: 466. **Desktop fingerprint confirmed in the map itself: 0 elements named "Categorías y productos"** — the mobile nav drawer (§17/§24) does not exist in this map, as expected on desktop.

**Systematic desktop-specific observation (recorded, not chased):** on PLPs, the filter/sort controls ("Filtrar", "Precio ascendente/descendente", "Color", "Talla", "Con descuento", "Novedad", "Limpiar") consistently failed interaction clicks with **"Element is outside of the viewport"** or the 5s timeout — on desktop these controls appear to live inside a closed dropdown/off-screen container. Consequence: overlay captures on PLPs are thinner than mobile's; each failed candidate costs its 5s bound, which is the main reason the crawl paced ~15-20s/page on PLPs (PDPs were much faster). A future refinement (viewport pre-check before clicking, or desktop-aware candidate filtering) is a backlog candidate, only worth it if the missing PLP-filter knowledge is actually needed.

**Downstream validation, all green:**
- `pnpm test` — **7/7 PASS** (1 flaky: `checkout-reach` passed on retry #1, the documented Tallas-dialog-close noise §14/§16/§18; 9.3m, DES slower than usual).
- `pnpm plan --update` — **10/140 flows covered, the best coverage number in project history** (prior best: 5/155, F18 §20). Evidence→map matching fully alive on the desktop map.
- `pnpm build-tests --top 3` — pruned 8 stale mobile-era drafts (F10), generated 3 navigation specs + 1 interaction spec; `pnpm test:generated` — **5/5 PASS live** including the interaction spec (Tallas overlay opened/verified/closed on a desktop PLP).

**Honest regression, decision pending (Jorge):** the crawl ran **without `EXPLORER_SEED_CHECKOUT=on`** (opt-in, default OFF), so the desktop map has **0 Checkout pages/flows** — the D15-phase-2 checkout knowledge (§23) present in the mobile map is not in this one, and `pnpm ask "checkout"` will answer no-match until a seeded re-crawl runs. Options: a full seeded re-crawl (~40 min) whenever convenient, or accept the gap until checkout knowledge is next needed. The checkout *specs* (`checkout-reach`, `checkout-structure`) are unaffected — they walk the UI path and stay green. **RESOLVED same day — see the seeded re-crawl note below.**

### Seeded desktop re-crawl (2026-07-30, later) — checkout flow restored to the desktop map, closes backlog P0

Ran the P0 recipe as written (PowerShell env vars `EXPLORER_TIME_BUDGET_MS=1200000` / `EXPLORER_MAX_PAGES=150` / `EXPLORER_SEED_CHECKOUT=on`, launched **detached** via `Start-Process` per the harness-kill lesson above). DES healthy going in (HTTP 200 probe). **One attempt, clean:** `primeCart` succeeded on the first try (no failure line; the seed's short-circuit-or-add contract held) and `/es/checkout.html` was the auth session's first visited page. **139 pages (52 anon + 87 auth), ~40 min wall-clock; the auth session logged 2 page errors** (the prior desktop crawl had 0 — ordinary crawl-to-crawl variability, both pages' knowledge simply absent, nothing corrupted). Map committed as `3b901bf`.

**All P0 gates verified directly against the JSON (B17 precedent):** schema 1.7, `/es/checkout.html` present (auth, `pageType: Checkout`, 6 elements), **1 Checkout flow** (single-step, the branch-C seed shape), **3,781/3,781 unique element ids** (zero duplicates), must-capture Tallas satisfied (**1 "Añadir a la cesta" → `overlay`**, 70 `revealedBy`-tagged elements), desktop fingerprint intact (0 mobile-drawer elements). `pnpm ask "checkout"` **resolves again** (score 65, token + type match); generation still exits 1 by the Builder's deliberate `CHECKOUT_ROUTE` guard — expected per Jorge's 2026-07-21 decision, not a bug.

**⚠ New observation — the desktop checkout element inventory does NOT match §23's mobile capture.** Mobile (§23 Q2) captured the shipping-method chooser: `Cerrar` + the 3 shipping-method buttons + the cost-summary disclosure. This desktop capture instead holds: `Volver a la página de inicio`, `Continuar`, an unnamed `dialog`, `Cerrar`, `Sí, cerrar proceso`, `Continuar con la compra` — the shape of an **abandon-checkout confirmation dialog** (or a different desktop entry state), with **no shipping-method buttons and no cost-summary element anywhere in the checkout page's inventory**. Not chased this session (recorded, not guessed at): plausible causes include the M8 interaction pass clicking `Cerrar` and capturing the resulting confirm dialog, a desktop-specific entry state, or checkout settle timing (`CHECKOUT_SETTLE` §23 was profiled on mobile). Consequence: the map's checkout knowledge proves *presence and reachability* (what `pnpm ask` needs) but its element inventory should not be trusted as the desktop shipping-method structure until a dedicated probe looks at it. `checkout-structure.spec` still asserts the real shipping-method UI directly and stays green — it, not the map, remains the source of truth for checkout's inner structure.

### ⚠ Correction (2026-08-01/02) — the §24 migration was INCOMPLETE: the suite kept testing MOBILE after "migration complete"

Stated plainly (RIGOR Regla 7): **§24's "single navigation chokepoint" assumption was wrong.** `BasePage.goto()` appending `device=desktop` only covers *explicit* `goto()` navigations — but a test performs only ~2 server document loads, and the second one is the **gender-gate CLICK inside `acceptConsent()`**, which reloads `/es/h-woman.html` WITHOUT the param. Since the layout is decided per document render and nothing persists (§24's own mechanism finding), **every `acceptConsent()`-based spec kept testing MOBILE from its second navigation onward** — including the 2026-07-29 "migration complete" 7/7 run. Most specs were green precisely *because* they had not really changed layout; the one spec that genuinely rendered desktop (`bombacho-barrel`, no consent walk in its chain) was exactly the one that broke. Evidence: trace document-load lists (2 loads/test, second param-less), failure snapshots showing the mobile drawer + `Acceder` (mobile header) vs 0 drawer elements in the desktop map, and a discriminator run (unmodified master passed search on mobile while the interceptor branch failed it — proving the branch renders true desktop).

**The real fix (branch `desktop-layout-interceptor`, design/plan 2026-08-01): a context-level route interceptor.** `src/support/layout.ts` — `forceDesktopLayout(context)` rewrites every same-origin DOCUMENT request via `context.route()` to carry `device=desktop` (server-side rewrite: `page.url()`/route-evidence keep the ORIGINAL URL — the DOM guard is the only live-observable proof of desktop); `assertDesktopLayout(page)` throws if the mobile drawer `#category-menu-modal` exists, auto-run on every PASSING test by the fixtures (never on failures — diagnosis must not be polluted) and in `auth.setup`. `BasePage.goto()` no longer appends the param.

### Desktop dual-layout divergences (2026-08-02, task 6 of the interceptor plan) — every selector confirmed live on TRUE desktop

The first true-desktop suite runs surfaced a systematic layer of layout divergences, each root-caused with probes before fixing (all fixes dual-layout — mobile names kept):

| Surface | Mobile (validated §5/§7/§23) | Desktop (validated 2026-08-02) |
|---|---|---|
| Search trigger | `button "Buscar"` | `button "Buscar aquí"` — regex `/^buscar( aquí)?$/i` |
| Search input | `getByPlaceholder('Escribe aquí')` | `searchbox "Buscar"` inside a dialog overlay — composed `.or()` |
| Search submit | Enter → `/q/{term}` | **Enter reaches `/q/` but the SPA router BOUNCES home ~1s later, purely client-side** (0 same-origin document requests; reproduced single-shot and WITHOUT the interceptor — genuine desktop behavior, not our retry loop). Supported flow: **click the typed term's suggestion `option "Ir a {term}"`** (list "Búsquedas recientes y sugerencias de búsqueda") — lands and STAYS on `/q/`. `SearchBar` phase 2 prefers suggestion-click, Enter fallback, verify re-checks URL after 2s settle. |
| `/q/` results grid | `listitem` cards + `-c0p` links | **IDENTICAL** — the round-1 "desktop cards are `article`" suspicion was an artifact of snapshots taken on the already-bounced home page. `SearchResultsPage` unchanged. |
| Filters | `button "Filtrar"` inside main → `role=dialog` drawer | "Filtrar" button OUTSIDE main; sidebar is `role=complementary`, **present-but-off-canvas until opened — its controls count as *visible* to Playwright while closed** (clicks fail intercepted/outside-viewport; same phenomenon as the crawler's §24 PLP-filter gap). Open verified by TRIAL click on the label text (clickability is the only reliable open/closed discriminator). Raw `bds-checkbox` input rejects `check()` → label-text click fallback. Apply lands `?discount=1`. |
| PDP add-to-cart | `button "Añadir a cesta"` → Tallas dialog → size click = add | **Inline** `group "Selecciona talla"` (plain size buttons XXS…XL exposing `aria-pressed`) + separate `button "Añadir a la cesta"` (with "la"). Add confirmed by a NEW dialog appearing (baseline-count diff, M9 §17 idiom — desktop has no permanent drawer): the **add-cart-success drawer** ("Ver cesta (N)"/"Cerrar"), which **intercepts subsequent header clicks** and must be closed. Layout discriminated by size-group presence (`ProductPage.detectAddFlow()`). |
| Header cart link | `link "Ir a la cesta"` | `link "Ver cesta"` — regex `/^(ir a la|ver) cesta$/i` |
| Cart tab "Cesta (N)" | `tab "Cesta (N)"` | **same** — unchanged |
| Checkout entry | "Tramitar pedido" navigates directly (authed session) | **Gates on a LIVE session**: DES single-sessions the shared account, so `login.spec`'s mid-suite re-auth invalidates the setup-minted storageState session and "Tramitar pedido" opens `dialog "Inicia sesión o crea tu cuenta"` instead of navigating (mobile never gated here — why the suite passed for months). Handled by `src/support/loginGate.ts` (in-dialog login, both §19/§23 variants, one fix point). Also: stored `.auth/state.json` sessions expire across hours — an "Iniciar sesión" header on a supposedly-authed run is the tell. |
| Checkout entry state | §23 Q2: `button` shipping methods + cost-summary disclosure | **Same shipping-method chooser, different shape**: `heading "Elige un método de envío"`, stepper `navigation "Pasos del checkout"` (Método de envío / Método de pago / Resumen), 5 options as visually-hidden `radio`s (signal on the visible option TEXT), `button "Continuar" [disabled]`, **no cost-summary disclosure**. The stepper's "Método de pago" entry is the in-lieu payment signal on desktop. **This RESOLVES the seeded-note doubt above**: the desktop entry state IS the shipping chooser — the map's abandon-dialog inventory was a capture artifact, not the real entry state. |

**Suite state after task 6 (2026-08-02): 7/7 PASS on TRUE desktop** (guard active on every passing test), `pnpm test:generated` 5/5 (3 navigation + 1 Tallas interaction), unit 421/421, typecheck/lint clean.

**Watch item — ✅ CLOSED 2026-08-04, and it was never a DES problem: see §28.** The drawer *did* appear every time; `addToCart`'s baseline dialog-COUNT diff could not tell which dialog it was seeing, so it missed a drawer that was on screen announcing "Producto añadido". Refuted the hypothesis this paragraph originally proposed. Original text kept below for the record. ~~the desktop add-confirmation intermittently does not appear after "Añadir a la cesta"~~ (`ProductPage: no confirmation dialog appeared` — observed 4× on 2026-08-02, plus 3 more across the three full-suite runs on 2026-08-04 = **7 occurrences**; always recovered on retry; once with a bounce-to-search snapshot). §27 established it is **not spec-specific** — it moves between whichever spec adds to cart, so it lives in the shared `ProductPage.addToCart` desktop branch. Same environment-noise family as the mobile Tallas-dialog-close (§14/§16/§18); if it hardens into a pattern, probe whether the drawer is suppressed when the product is already in the cart.

---

## 25. PDP wishlist button — confirmed live on desktop; repeated-element strict-mode bug found and fixed (2026-08-04)

**Context:** onboarding Fase 5 repeat (Automatización), run fully interactively — Jorge executing every command and reading the real console output, per the standing agreement after the two invalidated prior attempts (see `docs/onboarding/manual-del-alumno.md`, "🔖 Dónde retomar"). Exercise: hand-write a wishlist spec, POM pattern, on the now-stabilized true-desktop base (§24).

**Confirmed selector (desktop) — no divergence from historical mobile knowledge.** On the PDP, `getByRole('button', { name: 'Añadir a la lista de deseos' })` toggles, on click, to `getByRole('button', { name: 'Eliminar de la lista de deseos' })` — same element, same accessible name flip as the confirmation signal. No dialog, no login gate, no separate confirm step (probed live via `codegen` against `?device=desktop`). Shipped: `ProductPage.addToWishlist()` / `ProductPage.isInWishlist()` (`src/pages/ProductPage.ts`), `tests/wishlist/add-to-wishlist.spec.ts`.

**A real bug found and fixed (systematic-debugging, not blind-retried).** The first live run failed — `ProductPage: wishlist button did not confirm the add within the deadline` — despite the failure's own captured aria snapshot showing the main product's button had already toggled correctly to "Eliminar de la lista de deseos". Root-caused directly from that snapshot, not guessed: the PDP's own "También te puede gustar" recommendations carousel repeats the **exact same accessible name** (`"Añadir a la lista de deseos"` / `"Eliminar de la lista de deseos"`) once per recommended product card — the same repeated-element family already documented for testIds in B16/M8b, here hitting a bare role-based locator instead. Once the carousel had rendered (observed as arriving after the main click, mid-poll), a bare `getByRole(...).isVisible()` resolved to 3 elements (the main button + 2 recommendation cards, one of them a self-referencing recommendation of the exact same product) and threw a strict-mode violation — which `isInWishlist()`'s `.catch(() => false)` (written to mean "button not found yet") silently swallowed, masking an already-successful state change and starving `actUntil`'s `verify()` forever.

**Fix:** `.first()` on both the query locator and the add-button locator — the main product's own button always renders before the recommendations carousel in DOM order (confirmed directly in the failure snapshot), so `.first()` always resolves to the main product, never a recommendation card. Same "any exemplar via `.first()`" precedent M9 (§17) already established for a different repeated-trigger hazard.

**Live validation:** 2 consecutive standalone runs of the new spec after the fix, 2/2 passed, zero retries (23-72s each — ordinary DES-speed variance, not flakiness). Full manual reference suite: **8/8 PASSED, zero retries** (`pnpm test`, 5.5m) — the first fully green full-suite run since the interceptor merge that also includes the newly promoted wishlist spec, confirming no regression in the shared `ProductPage.ts` file.

**Decision on the prior mobile-era attempt:** the stash `fase5-solo-attempt-2026-07-29` (the invalidated solo attempt from the first try at this exercise — mobile-only knowledge, MMBRS promo-modal auto-dismiss + a bounded `ProductCard.open()` click + an old wishlist spec) was discarded (`git stash drop`) rather than reused — this session's implementation was built fresh from live desktop probes, per the onboarding manual's rule (c).

**Closes the onboarding Fase 5 repeat.**

---

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

**Watch-item escalation.** The desktop add-confirmation drawer (§24's watch item, 4× on 2026-08-02) failed the first attempt in **both** full-suite runs today — 6 occurrences now, always recovered on retry. It has hardened into a pattern; §24's own suggested probe (is the drawer suppressed when the product is already in the cart?) is now worth running when someone has the window.

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
