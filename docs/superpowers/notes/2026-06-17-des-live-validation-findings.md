# DES Live-Validation Findings & Search/Cart Follow-up

**Date:** 2026-06-17
**Status:** Login validated live & merged; search/cart pending (this doc is the handoff).
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
4. **driver.js onboarding tour** — `.driver-overlay` coach-marks that intercept clicks on a first session (see §5; not yet handled).

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

**Known flakiness (unresolved):** `search-plp-pdp.spec` and `add-to-cart.spec` pass reliably alone but fail intermittently in the full `pnpm exec playwright test` run (search never leaves the home page). Confirmed via failure screenshots that the onboarding popover is still covering the page at the moment of failure, despite the defensive dismissal calls. Isolated repro scripts using the exact same browser config (`devices['Desktop Chrome']` + `storageState`) could **not** reproduce the failure — dismissal worked every time there. The one untested lead: the real `setup` project re-authenticates fresh before every suite run (rewriting `.auth/state.json`), while repro scripts reused an older session; a brand-new login session may trigger more persistent/repeating tour behavior than a reused one. Next step: test that hypothesis directly (run `--project=setup` immediately before probing, or instrument the real `auth.setup.ts` → first-test handoff) before trying further timeout/retry tuning — 3 timeout-budget fixes were already tried (5×1s → 15×1.5s → 40s deadline, plus bumping `defaultTimeoutMs` to 90s) without resolving it, which points at a different root cause than raw hydration speed.

---

## 7. Onboarding-tour root cause found & fixed; search/cart flakiness re-diagnosed (2026-06-22)

The §5 hypothesis ("fresh `auth.setup` session triggers the tour more persistently") was **wrong**. Live investigation found the real mechanism and two further, distinct bugs underneath it.

**driver.js tour — root cause confirmed and fixed:**
The tour is gated by a `bsk_onboarding` cookie (JSON array of tour ids already seen). Confirmed live: pre-setting it **before any navigation** suppresses the tour everywhere — home, logon, member-hub, search, PLP/PDP, cart — with no new ids appearing anywhere in the flow:
```
bsk_onboarding = ["mmbrs","mmbrs_hub_mobile"]
```
(`mmbrs` covers home/logon/search/PDP/cart; `mmbrs_hub_mobile` covers `/es/member-hub.html` specifically.) Implemented as `suppressOnboardingTour(page)` in `src/support/consent.ts`, called from the single navigation chokepoint `BasePage.goto()` — every page object gets it for free, including `LoginPage`/`auth.setup`. This replaces reactive Escape-key dismissal as the primary defense; `dismissOnboardingTour` stays in call sites as a fallback in case a new tour id ships. Verified live across the full home→login→member-hub→search→PDP→cart flow: `.driver-overlay` never appeared in any of several repeat runs.

**Real, deterministic bug found in `firstProduct()` — fixed:**
On `/es/q/{term}` results, the grid's first `listitem` is **always** a promo/sale banner tile (e.g. `href=/es/mujer/sale/bershka-...html`, no PDP link) — confirmed reproducible 100% of the time, not flaky. `SearchResultsPage.firstProduct()` filtered on "any listitem containing a link," which matches this banner. Fixed by filtering on the confirmed PDP href pattern instead: `a[href*="-c0p"]`.

**Residual flakiness — NOT fixed, root cause now narrowed (open follow-up):**
Even with both fixes above, `search-plp-pdp.spec`/`add-to-cart.spec` still failed in repeat live runs, but with new, different symptoms each time (not the tour):
- The results grid measurably takes ~5s to hydrate after `/es/q/{term}` loads (`listitem` count: 0 at +2s/+3s → 66 at +5s). Several `expect.poll(...)` calls in the specs rely on Playwright's **default 5000ms** expect-timeout, which races against this — explains the "passes alone, fails under load" pattern from §5 (timing varies with machine/network load, not with session freshness).
- One repeat run hit a genuine DES error page ("OH NO... ESTO ES UN ERROR — La página no está disponible temporalmente") after a card click — likely pre-prod backend/stock instability, not a selector bug.
- **Next step (not yet done):** give the relevant `expect.poll`/`expect(...).toHaveURL(...)` calls an explicit timeout sized to the measured ~5s+ hydration (e.g. 15-20s), matching the existing deadline-retry pattern already used in `SearchBar.search()`. Treat occasional real DES error pages as expected pre-prod noise (consider a retry-on-navigation-failure wrapper), not something to chase with more timeout tuning.

**2026-07-02 — explicit-timeout fix applied; narrowed further, not fully eliminated:**
Applied the next step above: `search-plp-pdp.spec.ts` and `add-to-cart.spec.ts` now give `expect.poll`/`toHaveURL`/`toBeVisible` an explicit 20s timeout (`HYDRATION_TIMEOUT_MS`) instead of relying on Playwright's default 5s. Verified live:
- `pnpm typecheck && pnpm lint && pnpm test:unit` — all green (76 unit tests).
- Both specs run **in isolation** (each 2×, including a rerun after a full-suite failure) — **100% pass**, confirming the fix resolves the original race (default-5s-vs-~5s-hydration) it targeted.
- A live probe of `/es/shop-cart.html` (direct nav, authenticated session) measured the `tab` role ("Cesta (N)") appearing between +4s and +6s and stable afterward — comfortably inside the new 20s budget.
- **Full-suite repeat runs (3×) still showed one intermittent failure per run, each a *different* symptom** — exactly the "residual flakiness, new symptom each time" pattern this section already documented, not a regression from this change:
  1. `login.spec.ts` hit the real DES maintenance page ("We're making some improvements right now / We'll be back soon!") — unrelated to any code touched here; did not reproduce on retry. Confirms this doc's existing "genuine DES error page" category.
  2. `add-to-cart.spec.ts`: cart tab was visible but `itemCount()` read 0 for the full 20s window, even though the live probe (above) shows the same tab settling on a real count within ~6s outside the full-suite run. Did not reproduce running the spec alone. Root cause not yet isolated — candidate is full-suite resource contention (4 tests sharing one DES session/runner), not the hydration timing this fix targeted.
  3. `add-to-cart.spec.ts` (separate run): landed on a `Buscador`-titled URL after `SearchBar.search()`, but the rendered body was still home/category carousel content — the results grid never populated within the 20s budget. This points at `SearchBar.search()`'s own hover-reveal/retry-click mechanism occasionally not actually submitting the search under full-suite load, rather than the results-grid hydration speed measured above.
- **Conclusion:** the explicit-timeout fix is a real, verified improvement (eliminates the exact race it targeted; both specs are now reliably green in isolation) but does **not** fully eliminate intermittent failures when the full suite runs under contention — consistent with, not worse than, the pre-existing documented pattern. Further work here is `SearchBar.search()`'s submission reliability and/or full-suite contention, not more `expect` timeout tuning (four separate timeout-focused fixes — three global, one now targeted — have each narrowed but not closed this).

**2026-07-02 (later) — A3 investigation closed: three real interaction bugs found & fixed; environment noise characterized:**

Root causes found live (each probe-confirmed, all the same class — *fire-once interactions silently lost to Vue hydration lag*: an element can be visible/clickable before its handler is attached):
1. **Search `Enter` lost** — probe showed the first Enter press ignored (~1.5s dead window after the input turns visible), the second press navigating. Fixed in `SearchBar.search()`: re-fill + re-press until the URL is `/q/…` (act→verify→retry).
2. **Size-click lost (add-to-cart)** — a "successful" `force: true` click on a size left the cart genuinely `"Cesta vacía"` (the c0p links in the failure snapshot were "Te puede interesar" recommendations, not cart items). Fixed in `ProductPage`: `selectFirstSize` retries until the "Tallas" dialog is open; `addToCart` retries until the dialog *closes* (the only confirmation the add happened).
3. **Card-open unverified** — `ProductCard.open()` now retries until the `-c0p<id>.html` PDP URL is reached.

Environment facts established (clean independent probes, not framework code):
- **`/es/q/{term}` is NOT server-routable** — direct navigation/reload lands on the home page ("REBAJAS" title, 0 products, 3/3 attempts) while the full UI search at the same moment works perfectly (32 products in ~5.4s, 2/2). ⇒ **never reload the results page as a recovery**; a first version of `waitForResults()` did and was counterproductive (stranded tests on home). The correct recovery for a dead `/q/` load is re-running the whole search through the UI — which the test-level retry does; `waitForResults()` just fails fast with a diagnostic error.
- **Dead `/q/` loads are real**: some loads never leave the pre-results state (editorial content, no grid) even with a 45s budget — waiting longer does not help.
- **Degraded app shells are real**: DES occasionally serves an untranslated shell ("Skip to main content"), or a broken one (empty `<main>`, raw `/ItxHomePage?genderUrlName=…` hrefs) where the header search pill never exists. `SearchBar.search()` reloads the (routable) current page once mid-deadline for these.
- **Parallel full-suite runs failed 6/6** before serialization (two concurrent search flows + `login.spec` re-authenticating the same account mid-run); isolation runs pass essentially always. `playwright.config.ts` now runs `workers: 1` and `retries: 1` (trace-on-first-retry captures evidence); `des`/`local` test budget raised to 150s so composed act→verify→retry deadlines can finish.
- Also confirmed in passing: some DES elements DO carry test-id-like attributes (`data-qa-anchor="filterButton"` on the Filtrar button) — relevant to foundation Risk #1 and the future Selector Healing agent.

**Open lead (next time this is touched):** in every late-afternoon failure snapshot the mobile-nav dialog ("Categorías y productos") was open, blocking clicks on the page behind it. Suspicion: aggressive retry force-clicks get *queued* during hydration lag and fire later against shifted UI (opening the menu). Follow-up: make retry loops state-aware (inspect what is on screen before re-clicking; close stray overlays first), and note that repeated same-day runs from one account accumulate cart items (nothing empties the cart — a cart-cleanup fixture is missing). DES service quality also visibly varies within a day (morning: all isolation probes green; afternoon: repeated dead `/q/` loads) — treat sustained red streaks as environment, checking with the UI-search probe before touching framework code.

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

**First canonical map committed:** `coverage/functional-map.json`, environment `des`, both sessions, generated from the 152-page bounded crawl above.
