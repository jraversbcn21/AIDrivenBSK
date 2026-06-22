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

---

## 8. Structural finding for the Explorer Agent (important)

DES is built with **`bds-` web components (Shadow DOM)**. Playwright locators pierce shadow DOM (so the foundation works), **but the Explorer's analyzer uses `page.content()` (light DOM only)** — it will miss most interactive content on this site. Before running the Explorer live against DES, revisit its extraction strategy (e.g. drive extraction from the accessibility tree / `ariaSnapshot`, or Playwright-locator-based enumeration, instead of `page.content()`). Tracked as a follow-up to the Explorer sub-project.
