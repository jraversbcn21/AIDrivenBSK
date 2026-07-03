# DES Live-Validation Findings

**Date:** 2026-06-17 (created), last updated 2026-07-03.
**Status:** Foundation fully validated live — login, search, PLP/PDP, filters, and cart all pass reliably (in isolation and as a serialized full suite). All known interaction-reliability bugs found live have been fixed (§7). The Explorer Agent is DES-ready with a first live crawl committed (§8). The Coverage Planner is live-validated with a first evidence-annotated map committed (§9). Residual, non-blocking environment noise and forward-looking leads remain open — see the "Open leads" callouts in §7/§8 and the map-completeness consequence in §9.
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
- Some DES elements carry test-id-like attributes (e.g. `data-qa-anchor="filterButton"`) — relevant to foundation Risk #1 and the future Selector Healing agent.

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

**Residual gap found, not fixed (tracked for a future Explorer milestone):** PLP/category pages (e.g. `/es/mujer/ropa/camisetas-n4365.html`) never triggered `ProductCard`/grid detection in this first crawl — every non-landing page classified as `Other`, 0 `-c0p` route patterns found among 152 pages. Live probing during this session found two compounding causes:
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
