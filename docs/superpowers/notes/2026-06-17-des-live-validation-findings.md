# DES Live-Validation Findings

**Created:** 2026-06-17. **Last updated:** 2026-08-13.
**Environment:** DES (`https://des-ecombknj-test-webecom.bk.apps.axdesecocp1.ecommerce.inditex.grp/es/`)
**Test account:** `jorge@esqa.com` (in local `.env`, gitignored).

## Status

**The suite tests DES's TRUE DESKTOP layout. Suite is 26 tests; latest full run (2026-08-13) 24 passed / 2 failed — `cart/add-to-cart.spec` and `cart/cart-lifecycle.spec`, both attempts, a newly-found `CartPage` session-invalidation gap (§32 completion), not one of the general §7/§28 noise classes and NOT YET FIXED (out of scope for the task that found it). Three real production defects (`CartPage.setQuantity` overshoot, `CartPage.removeFirstItem` stray re-click, `ProductPage.addToCart`'s unanchored add button — §29's "false green invisible to the stack" thesis a third time) were found live and fixed the same session, also §32.**

- **Desktop enforcement** is a context-level route interceptor — `src/support/layout.ts`, `forceDesktopLayout(context)` — plus `assertDesktopLayout(page)` on every passing test. ⚠ **Every suite claim dated before 2026-08-02 was measured on the MOBILE layout**: the 2026-07-29 "migration" was incomplete and the correction is §24. Read §24 before touching any selector — its closing table is the mobile↔desktop divergence catalogue, and selectors are dual-layout (mobile names deliberately kept).
- **Login is dual-variant** (§23): DES switches the `/es/logon.html` shape server-side between an e-mail+password form and a "Continuar con e-mail" interstitial. `LoginPage.login()` handles both — do not "simplify" it back to one.
- **Interaction reliability** is the standing rule (§7): every state-changing interaction must act→verify→retry, every click must be bounded, and every verify must identify *what* it is looking at rather than counting (§28 is the cautionary tale) — and must distinguish "my action worked" from "it was already true" (§29). **Locators must be ANCHORED, not merely disambiguated:** `.first()` switches off strict mode, the only ambiguity detector there is (§31).
- **Session gate:** DES single-sessions the shared test account, so `login.spec`'s mid-suite re-auth invalidates the `auth.setup`-minted session for the rest of that invocation (§24). `checkout-reach.spec` recovers via `src/support/loginGate.ts` (in-dialog re-login); **`CartPage`/`cleanCart` has no equivalent and fails deterministically when it runs after `login.spec` with a dead session** (§32 completion, 2026-08-13) — open, unfixed.
- **Open watch item:** the Builder's interaction template emits an unbounded click, so a generated interaction spec hangs to the test timeout instead of failing fast (root-caused §26, not fixed).
- **Environment noise is real and documented** (§7): dead `/q/` loads, degraded app shells, DES maintenance pages. Read §7 before blaming the framework for a red run.

## How this doc is organised — read before appending

One section per session, appended at the end, numbered. **Section numbers are load-bearing**: ~480 `§N` citations live across the codebase (`src/`, `explorer/`, `tests/`, specs, plans), so never renumber, never delete a `§N` anchor. Keep the header a *status* block — do not grow a changelog in it; the sections are the changelog.

Closed milestone reports are moved to **`2026-06-17-des-live-validation-findings-archive.md`** once they stop describing current behaviour, leaving a one-line row in "Archived sections" below so the anchor survives. This doc is `@`-imported by `CLAUDE.md`, so it has a hard 150k-char budget; the archive is not imported and has none. When this file approaches the budget again, archive the next tranche of closed reports rather than deleting anything.

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

Confirmed header selectors (store, role-based — Playwright pierces shadow DOM). ⚠ *Mobile-layout capture (2026-06-17) — the suite tests desktop since §24; desktop equivalents are in §24's divergence table (e.g. the cart link is `"Ver cesta"` there).*
- **Search** → `button "Buscar en tienda"` (icon button; opens an overlay).
- **Cart** → `link "Ir a la cesta"` → `/es/shop-cart.html`.
- **Login** → `button "Iniciar sesión"` (text "Acceder").

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
- Nothing empties the test account's cart between runs — repeated same-day runs accumulate items. A cart-cleanup fixture is missing. ⚠ **Re-rated 2026-08-06 (§29): NOT cosmetic.** Shared-account state carryover (cart *and* wishlist) is a proven source of **false greens** — a test that asserts a state rather than a transition can be blessed by state a previous run left behind. Original rating, now wrong: ~~cosmetic/observability only; doesn't affect correctness~~.
- DES service quality visibly varies within a day (morning runs cleaner than afternoon in observed sessions) — treat a sustained red streak as environment noise, cross-check with a quick manual probe before touching framework code.

---

## Archived sections (§1, §8–§22)

These are **closed milestone reports** — the work shipped, the bug is fixed, the backlog item is closed. Their full text lives verbatim in **[`2026-06-17-des-live-validation-findings-archive.md`](./2026-06-17-des-live-validation-findings-archive.md)**; only the durable takeaway is kept here. The `§N` anchors are preserved because the codebase cites them.

| § | Topic (date) | What survives — the durable fact |
|---|---|---|
| **§1** | First live pass, merged (2026-06-17) | Historical only: the original login fixes landing on `master`. Superseded by §4/§19/§23. |
| **§8** | Explorer DES-readiness + first live crawl (2026-07-02) | DES is built from `bds-` **Shadow DOM** web components, so `page.content()` (light DOM) sees almost nothing — extraction runs off `locator('body').ariaSnapshot()` (`EXPLORER_EXTRACTION=aria`; the `dom` path is offline-only). `pnpm explore --update` refuses to write a 0-page map (a VPN drop once overwrote a good one). Frontier dedupes on the **resolved** path, not the requested one — DES redirects the gender gate server-side. |
| **§9** | Coverage Planner first live run, M5b (2026-07-03) | Low coverage numbers are usually **map-completeness gaps, not planner bugs** — the planner can only match flows the crawler actually discovered. |
| **§10** | PLP-grid extraction gap, root-caused (2026-07-03) | The aria tree **does** faithfully expose the hydrated product grid — but only after a **false-stable plateau**: the shell sits unchanged ~2-3s before content arrives, so a naive "two identical reads" poll locks onto it. Hence `waitForSettle`'s `minWaitMs` floor (`DEFAULT_SETTLE = { minWaitMs: 3500, pollIntervalMs: 500, maxWaitMs: 10000 }`) — **this is why crawls are slow by design; do not "optimise" the floor away.** Also: the classifier must check the PLP signal **before** PDP (grid cards carry their own per-card quick-add). |
| **§11** | Builder M6b, testId/`locate()` mismatch (2026-07-03) | Diagnosis only; the fix is §12. A testId hint sourced from `data-qa-anchor`/`data-qa` silently resolved to **zero** elements through `getByTestId()`. |
| **§12** | TestId attribute-provenance fix, M7, closes B15 (2026-07-03) | `TestIdHint { attr, value }` records **which** attribute matched; `locate()` resolves `data-testid` via `getByTestId()` and `data-qa-anchor`/`data-qa` via a raw CSS attribute locator. Confirmed live: the PDP's add-to-cart testId is `data-qa-anchor="addToCartSizeBtn"`, **not** `data-testid`. |
| **§13** | Checkout/PDP classifier fix, B13 (2026-07-04) | The classifier evaluates **deterministic path rules first** — `-c0p{id}.html` → PDP, `shop-cart.html`/`/cart`/`/cesta` → Cart — because the Checkout *text* regex (`pago\|checkout\|envío…`) matches ordinary PDP boilerplate ("Envíos y devoluciones"). Checkout additionally requires a path hint. Path regexes are segment-anchored ("carteras"/"cartagena" were matching `/cart`). |
| **§14** | Shared-element deprioritization, B14 (2026-07-04) | Elements are tagged `component: 'Header' \| 'Footer' \| 'MiniCart'` by **landmark ancestry**, and the Builder deprioritizes shared chrome when picking a loaded-signal (deprioritize, not exclude). The cart-name check is scoped to inside the header only — unscoped, it would also tag the PDP's own "Añadir a la cesta". |
| **§15** | Interaction-aware crawl, M8, closes B9 (2026-07-05) | The crawler opens a bounded, deduped set of non-destructive candidates per page, diffs the before/after aria snapshot, extracts any revealed overlay, and closes via Escape. Schema 1.5: top-level `interactions[]` + `revealedBy` on revealed elements. Revealed elements are excluded from loaded-signal selection (they are not visible on load). |
| **§16** | Deterministic must-capture interactions, M8b (2026-07-05) | `interactions.mustCapture` regexes (default `/^añadir a (la )?cesta/i`, override via `EXPLORER_MUST_CAPTURE`) retry a labelled interaction class on every page until it yields one `overlay` outcome. ⚠ **Guarantee is one exemplar per class per crawl, not per-page coverage** — never assume every PDP-shaped page carries its own capture. |
| **§17** | Builder interaction-spec generation, M9, closes B16 (2026-07-06) | **DES keeps a permanently-mounted `dialog` in the DOM even when visually closed** — the *mobile* nav drawer `#category-menu-modal` — so a bare `getByRole('dialog')` hits strict-mode violations. (Desktop has no such drawer, §24; and the count-diff idiom this section introduced was **refuted** in §28 — identify a dialog by its content, never by counting.) `.first()` is the standing "any exemplar" policy for a repeated *trigger*. |
| **§18** | A5 — Personalizable-product probe (2026-07-12) | The Personalizable card exposes the **identical** `"Añadir a la cesta {producto}"` quick-add as a standard card, so a positive capability filter cannot exclude it; the only signal is a plain, role-less `text: "Personalizable"` node inside the card. A third shape exists: out-of-stock cards read `"Temporalmente sin stock, ¡Avísame!"` with no quick-add. `SearchResultsPage.firstProduct()` therefore filters positively (has quick-add) **and** negatively (`hasNotText: 'Personalizable'`). |
| **§19** | A6 — login-flow drift fix (2026-07-12) | Superseded: this section removed the "Continuar con e-mail" step after observing it gone. The interstitial **came back** (§23) and `LoginPage.login()` is now dual-variant. Kept as the reason that dual-variant handling exists. |
| **§20** | F18 — coverage matching restored (2026-07-13) | The crawler seeds `['/es/', '/es/search']` — **not** bare `/`, which the specs never visit and which structurally emptied `coveredBy` for seven consecutive sessions. A discovered child's `discoveredVia` must be the parent's **resolved** path, or redirect-rooted chains collapse to single steps. |
| **§21** | B17 — `MapElement.id` deduplication (2026-07-13) | Extraction collapses content-identical elements into one row carrying `count` (dedup runs **before** the 60-element cap); ids fold in a per-page occurrence index so every `MapElement.id` is unique. Schema 1.7. The Builder's testId-uniqueness check **sums `count`**, not rows. |
| **§22** | D15 phase 1 — the real checkout, reached (2026-07-14) | The real checkout URL is **`/es/checkout.html`** (title "Checkout \| Bershka"); the entry affordance is **"Tramitar pedido"** on `/es/shop-cart.html`. The crawler can never reach it by link-following — checkout sits behind a cart with items. Inner structure and routability are §23/§24. |

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
- The stash `fase5-solo-attempt-2026-07-29` (promo-modal auto-dismiss, wishlist spec) was validated against mobile — its selectors would have needed desktop re-probing before reuse. Notably the MMBRS promo modal container carried `class="mobile"`; its desktop behavior was never established. **(✅ MOOT since 2026-08-04 — the stash was discarded rather than reused, §25; the wishlist work was redone from fresh live desktop probes. `git stash list` is empty: there is nothing left to re-probe, and the MMBRS promo modal's desktop behavior simply remains unknown, which has cost nothing so far.)**

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
| PDP add-to-cart | `button "Añadir a cesta"` → Tallas dialog → size click = add | **Inline** `group "Selecciona talla"` (plain size buttons XXS…XL exposing `aria-pressed`) + separate `button "Añadir a la cesta"` (with "la"). Add confirmed by the drawer's **CONTENT** (`getByRole('dialog').filter({ hasText: /producto añadido|ver cesta/i })` — §28; the original baseline-count diff recorded here was **refuted and deleted**, it could not tell WHICH dialog it was seeing): the **add-cart-success drawer** ("Ver cesta (N)"/"Cerrar"), which **intercepts subsequent header clicks** and must be closed. Layout discriminated by size-group presence (`ProductPage.detectAddFlow()`). |
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

**Fix: ⚠ SUPERSEDED by §31 (2026-08-10) — the reasoning below was REFUTED and the `.first()` is gone.** Order only breaks ties among elements that *match*, and this button renames itself by state: the moment the main product leaves the wishlist its button stops matching the remove-name and `.first()` slides to a cross-selling card. The locators are now scoped to `div.product-detail-info__labels-wishlist` with no `.first()`. Original text kept for the record, because §31 reasons about it: ~~`.first()` on both the query locator and the add-button locator — the main product's own button always renders before the recommendations carousel in DOM order (confirmed directly in the failure snapshot), so `.first()` always resolves to the main product, never a recommendation card. Same "any exemplar via `.first()`" precedent M9 (§17) already established for a different repeated-trigger hazard.~~

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

## 31. §29's lead 2 confirmed: the wishlist `.first()` was never anchored to the main product (2026-08-10)

**Context.** Onboarding Fase 7 (Nivel intermedio — locator anchoring), run fully interactively; Jorge executed every live command and pre-registered every prediction before seeing results. The exercise was §29's open lead 2, taken from suspicion to proven defect to validated fix in one session. Closes that lead.

**The defect, proven — not suspected.** `isInWishlist()` answered **"is ANY product on this page in the wishlist"**, not "is *this* product". Mechanism: the wishlist button renames itself by state (`Añadir…` ↔ `Eliminar…`), so when the main product is NOT in the wishlist its button stops matching the remove-locator's name and **leaves the match set entirely** — and a page-wide `.first()` then silently takes the first cross-selling card that IS in the wishlist. §25's justifying premise ("the main product's button renders before the carousel, so `.first()` is always the main product") held as a statement about DOM order but was irrelevant: order only breaks ties among elements that *match*, and the defect fires exactly when the main product doesn't.

**Scale, measured live (desktop PDP, `camiseta-ajustada-spider-man-c0p228480491`):** the page renders **43** buttons named `Añadir/Eliminar de la lista de deseos` — 1 main-product button inside `div.product-detail-info__labels-wishlist`, plus **42** cross-selling cards (`article.cross-selling-grid__product`, 8 rows of ~5, hydrating only on scroll). §25 said "carousel cards"; the real population is an order of magnitude larger. Irony recorded: the 42 cross-selling buttons each carry `data-qa-anchor="productItemWishlist"`; the main product's button carries **no test-id attribute at all** — its only distinguishing feature is its BEM container class.

**Method — the four-row table.** Two binary variables (main product in wishlist? any cross-selling card in wishlist?) give four states; H0 (anchored) and H1 (unanchored) predict identical results in three of them, including the default state of the page. Only **row D** (main OUT, one card IN) discriminates. A two-round probe (`tests/_probe/wishlist-anchor-probe.spec.ts`, deleted after this section, §18 lifecycle): round 1 reconnaissance (count + ancestor chains for both names, no clicks, measured fresh AND after scroll because the match set is a function of time); round 2 built row D **using explicitly-scoped locators only** — never the instrument under test — verified the state (`ROW D BUILT? true`), then measured. Result: main product provably out, the page's only "Eliminar" button on a cross-selling card, and `isInWishlist() === true`. H1 confirmed. Consequence one layer up: `addToWishlist()`'s idempotency guard read that same lie, so it could return successfully having added nothing — §29's blessed no-op, now with the mechanism identified.

**Second fact established offline** (`tests/_probe/strict-mode-semantics.spec.ts`, setContent, no DES, seconds): `isVisible()` on **zero** matches returns `false` WITHOUT throwing; the only error it can throw is a strict-mode violation on 2+. Therefore `isInWishlist()`'s `.catch(() => false)` never protected against "not rendered yet" (that case self-protects) — its only possible effect was to **hide ambiguity**. The Fase-5 docstring had described its own mechanism wrongly since 2026-08-04. Also confirmed by reading `retry.ts:41` rather than assuming: `actUntil` catches verify throws by deliberate doctrine, so ambiguity surfaces immediately via direct callers (`expect.poll`) but only as a generic timeout inside `actUntil` — accepted trade-off, the shared primitive was NOT touched.

**Fix (`src/pages/ProductPage.ts`), validated as a controlled experiment.** New `mainWishlistPanel()` = `div.product-detail-info__labels-wishlist` (1 match, verified live; a semantic BEM class, documented in-code as a deliberate deviation from the selector priority since no test-id exists on that button); both wishlist locators scoped to it, **`.first()` removed** (strict mode re-armed as the ambiguity detector); `isInWishlist()`'s catch removed; `waitForWishlistControl()`'s redundant per-call catches removed. Validation: the SAME row-D probe, one variable changed (the fix) — `ROW D BUILT? true`, `isInWishlist() === false`. Full suite stated plainly: **22/25 passed, 2 flaky, 1 failed** — the failure is `search-plp-pdp` (both attempts, §7/§24 environment class in a degraded 15.1m window; analyzer `timeout/persistent`), NOT a regression from this fix; `add-to-wishlist.spec` was green on the first attempt. Unit 421/421, typecheck/lint clean.

**Rules this session earned, worth keeping:**
- **`.first()` fixes ambiguity, never anchoring** — it's legitimate when "any exemplar" is genuinely meant (M9/§17), never as a response to an unexpected strict-mode violation: there, the error IS the information and `.first()` switches the detector off.
- **A name-matched locator's match set is a function of STATE and TIME**, not of the page: state-toggling names move elements in and out of the set, lazy hydration grows it mid-poll. Positional selection over such a set is unanchored by construction.
- **Never build the experiment with the instrument you're measuring** — probe setups use explicit, unambiguous locators; the suspect appears only in the measurement.
- **Only a state where the hypotheses predict DIFFERENT outcomes is evidence** — the page's default state (row C here) confirms both hypotheses at once, i.e. nothing; enumerate the combinations and go build the discriminating one.

**Open lead handed forward — one more `.first()` of the same shape, NOT probed (2026-08-10).** A doc audit the same day found `tests/mujer/pages/VestidosTallasOverlayPage.ts:89`: `isOverlayOpen()` returns `locate(page, { role: { type: 'button', name: 'Talla XS' } }).first().isVisible()`. Its own comment concedes the name repeats ("once the overlay renders alongside the grid behind it") — which is precisely this section's defect shape: **a `verify` whose locator is not anchored to the thing it claims to be checking.** If a grid card behind the overlay can expose a `"Talla XS"` button on its own, `isOverlayOpen()` would answer *"is any size button visible anywhere"*, and the spec could pass with the overlay shut. **Stated as a lead, not a finding: this was NOT probed** — unlike the wishlist case there is no live evidence either way, and the spec passes consistently (19-30s, §26). Confirming it needs the same method used here: build the discriminating state (a PLP with the overlay closed but a card's size buttons rendered) and see what `isOverlayOpen()` says. The trigger's own `.first()` at line 75 is a *different* and legitimate case — "any exemplar of a repeated trigger", §17's policy.

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

### Task 7 completion — full validation: three pre-existing defects fixed, one new gap found live (2026-08-13)

**Context.** Same effort, closing task (plan `docs/superpowers/plans/2026-08-13-cart-regression.md`, Task 7). Between this probe and here, Tasks 2–6 built `parseEuroAmount`, `CartPage` (with the P1–P8 probe results above), `cart-lifecycle.spec.ts`, the `cleanCart`/`ensureEmptyCart` fixture, and tightened `add-to-cart.spec.ts` to assert the 0→1 transition — full detail in `.superpowers/sdd/2026-08-13-cart-regression/task-{1,2,3,4,5,6}-report.md`. This section records Task 7's own full-suite validation, the coverage update, and one real defect that validation surfaced for the first time.

**Three pre-existing production defects were found live and fixed during Tasks 3–6** (all in `src/pages/`, all found by the new spec's live validation, none previously known):

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

**Net for the suite: 25 → 26 tests, 22 → 24 tests passing net-new-content aside** (`cart-lifecycle.spec.ts` is new; `add-to-cart.spec.ts` was tightened, not added). The `cleanCart` fixture itself is validated and closes the §7 cart-cleanup backlog lead **for the case it was built for** (a live, valid session) — Task 4's report shows both its remove-path and short-circuit-path working cleanly. What is **not** closed is session resilience under the specific ordering this full-suite run exposed; that is a new, separate, and more specific gap than the general cleanup lead was.
