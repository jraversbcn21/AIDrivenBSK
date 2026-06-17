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

## 5. Search/Cart — open blockers (the follow-up work)

`SearchBar`, `SearchResultsPage`, `ProductCard`, `ProductPage`, `MiniCart` still carry `CONFIRM` placeholder selectors. Live probing surfaced these obstacles:

1. **driver.js onboarding overlay** (`.driver-overlay`, animated SVG mask) intercepts clicks on the store. Needs an auto-dismiss/skip (e.g. a "Saltar"/"Cerrar" affordance, or `addLocatorHandler` on the overlay's close control) before the search icon is clickable.
2. **Search icon starts hidden** (`top-bar-search-icon--hidden`) and reveals on interaction/scroll.
3. **Search input is a `bds-` web component in shadow DOM with no standard ARIA role** — `getByRole('searchbox'|'textbox'|'combobox')` all return 0. Once the overlay is reliably open, identify the input via a shadow-piercing CSS/text selector (Playwright CSS pierces open shadow roots) and confirm it.
4. **No direct search-results URL** — `searchResult.html?q=`, `search?q=`, `buscar?q=` all redirect to `/es/`. Search must go through the UI overlay (no `logon.html`-style shortcut).
5. PLP/PDP/cart selectors are then unverified: product grid items, filters panel, size selector, add-to-cart button, and whether the cart is a mini-cart drawer or the `/es/shop-cart.html` page.

### Suggested approach for the follow-up
- Add a `dismissOnboardingTour(page)` helper (auto-dismiss `.driver-overlay`) alongside `installCookieAutoDismiss`, and call it in `HomePage.open()`.
- Probe the search overlay with a screenshot + shadow-piercing selector to pin the input; update `SearchBar.search` to: dismiss tour → click "Buscar en tienda" → fill the (shadow-DOM) input → submit.
- Then probe PLP→PDP→add-to-cart and update the respective Page/Component Objects, decoupling search→PLP→PDP to run **anonymously** (login is only needed for account/checkout flows).
- Keep the no-`networkidle` rule and the 60s DES timeout.

---

## 6. Structural finding for the Explorer Agent (important)

DES is built with **`bds-` web components (Shadow DOM)**. Playwright locators pierce shadow DOM (so the foundation works), **but the Explorer's analyzer uses `page.content()` (light DOM only)** — it will miss most interactive content on this site. Before running the Explorer live against DES, revisit its extraction strategy (e.g. drive extraction from the accessibility tree / `ariaSnapshot`, or Playwright-locator-based enumeration, instead of `page.content()`). Tracked as a follow-up to the Explorer sub-project.
