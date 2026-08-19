# DES Live-Validation Findings

**Created:** 2026-06-17. **Last updated:** 2026-08-19.
**Environment:** DES (`https://des-ecombknj-test-webecom.bk.apps.axdesecocp1.ecommerce.inditex.grp/es/`)
**Test account:** `jorge@esqa.com` (in local `.env`, gitignored).

## Status

*A STATUS block: what is true now, not how it got here. The numbered sections are the changelog — do not grow one here (audited 2026-08-18: this block had accumulated six sessions of narrative and was rewritten to state).*

**Suite:** 26 tests, TRUE DESKTOP layout. Latest full run 2026-08-18: **23 passed / 3 flaky / 0 failed** (18.9m, degraded window); the same day's healthy-window run was **26/26, 0 flaky, 13.0m**. All flakes are read from their own `error-context.md` before being attributed — the standing classes are §28's add-drawer noise (now `environment-noise` since §34) and §32's `setQuantity` overshoot.

**Map:** **374 desktop pages / 374 flows**, 0 crawl errors, 13977/13977 unique element ids, checkout present (2026-08-18, §38). Coverage **19/374**. The crawler REPLACES the map rather than accumulating, so breadth is a function of the bounds you pass — the widened recipe (300 pages / 2400000 ms per session) is what produced this one, in ~1h20m.

**Closed and not to be re-opened without new evidence:** backlog P5 (session-invalidation recovery, §32) and P6 (the cold-navigation "defect" that was our own detector believing DES's pre-hydration logged-out header, §33). §34's five bugs are all live-validated, and §35/§38 proved `9a9aade` and `01dd927` in real crawls.

**Open, with evidence in their own sections:** the PLP filter/sort clicks never resolve (§38 — a hydration-budget problem, NOT the missing overlay role it was filed as for three crawls; `c8b5544` is untestable-by-crawling, not refuted); the `addToCart` residual multi-add under §37's `MAX_ADD_CLICKS = 3` cap; six PLP page objects gating `isLoaded()` on a `filterButton` that takes ~16s to hydrate under a 20s budget (§36); the 150s fixture budget collision (§33, more pressured since §34's evidence pass); a `/ic/` locale leak in the crawler frontier (§38); and one unexplained 1-unit jeans line in §37's failing cart that no spec adds.

- **Desktop enforcement** is a context-level route interceptor — `src/support/layout.ts`, `forceDesktopLayout(context)` — plus `assertDesktopLayout(page)` on every passing test. ⚠ **Every suite claim dated before 2026-08-02 was measured on the MOBILE layout**: the 2026-07-29 "migration" was incomplete and the correction is §24. Read §24 before touching any selector — its closing table is the mobile↔desktop divergence catalogue, and selectors are dual-layout (mobile names deliberately kept).
- **Login is dual-variant** (§23): DES switches the `/es/logon.html` shape server-side between an e-mail+password form and a "Continuar con e-mail" interstitial. `LoginPage.login()` handles both — do not "simplify" it back to one.
- **Interaction reliability** is the standing rule (§7): every state-changing interaction must act→verify→retry, every click must be bounded, and every verify must identify *what* it is looking at rather than counting (§28 is the cautionary tale) — and must distinguish "my action worked" from "it was already true" (§29). **Locators must be ANCHORED, not merely disambiguated:** `.first()` switches off strict mode, the only ambiguity detector there is (§31).
- **Session gate:** DES single-sessions the shared test account, so `login.spec`'s mid-suite re-auth invalidates the `auth.setup`-minted session for the rest of that invocation (§24). `checkout-reach.spec` recovers via `src/support/loginGate.ts` (in-dialog re-login); **`CartPage`/`cleanCart` now recovers too** — `CartPage.waitForLoaded()` detects the header's logged-out tell (`Header.isUserLoggedIn()`) and re-authenticates, bounded to one attempt (§32 completion, Task 8, 2026-08-13, closes backlog P5). ⚠ **That tell must PERSIST before it is believed (§33, 2026-08-16, closes backlog P6):** DES serves its server-rendered LOGGED-OUT header for the first ~5-8s of a cold navigation on a perfectly VALID session, so a single-instant read fires a re-login that then bounces the already-authenticated user to member-hub. "Not found ≠ seen-and-false" does not protect you here — the pre-hydration DOM is not empty, it is the logged-out page.
- **Environment noise is real and documented** (§7): dead `/q/` loads, degraded app shells, DES maintenance pages. Read §7 before blaming the framework for a red run.
- **Retry doctrine must cover a THROWING act, not just a no-op one** (§34): a hand-rolled act→verify→retry loop that only retries "the click worked but nothing changed" silently drops the "click never even resolved" failure mode — exactly the one hydration-lag produces most often. Checked `discoverInteractions()`; worth checking any other hand-rolled retry loop the same way. **Corollary (§35):** when such a fix converts a crash into a recorded outcome, check the REASON survives the conversion — `01dd927`'s catch was silent, and the crawl it was meant to fix could no longer tell "the locator never resolved" from "the click landed and revealed nothing."

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

## Archived sections (§1, §5, §8–§23, §25, §30, §32)

These are **closed milestone reports** — the work shipped, the bug is fixed, the backlog item is closed. Their full text lives verbatim in **[`2026-06-17-des-live-validation-findings-archive.md`](./2026-06-17-des-live-validation-findings-archive.md)**; only the durable takeaway is kept here. The `§N` anchors are preserved because the codebase cites them.

| § | Topic (date) | What survives — the durable fact |
|---|---|---|
| **§1** | First live pass, merged (2026-06-17) | Historical only: the original login fixes landing on `master`. Superseded by §4/§19/§23. |
| **§5** | Search/Cart selectors, first live pass (2026-06-17) | ⚠ **MOBILE-layout capture** — every selector in it is superseded by §24's divergence table. Durable: the PDP URL pattern is **`-c0p<digits>.html`**; add-to-cart is a **two-step size dialog** (clicking a size both selects it *and* completes the add); there is **no mini-cart drawer** — the header cart link navigates to the full `/es/shop-cart.html`, whose content renders as a slow skeleton, so the `tab "Cesta (N)"` label is the fast, reliable item-count signal. |
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
| **§23** | D15 phase 2 — checkout inner structure, settle profile, routability (2026-07-18/21) | **`/es/checkout.html` IS server-routable** with a non-empty cart and an authenticated session (branch C). Checkout exhibits §10's false-stable plateau, hence **`CHECKOUT_SETTLE = { minWaitMs: 13_000, maxWaitMs: 26_000, pollIntervalMs: 500 }`**. The read-only entry state exposes **only the shipping-method step** — the payment inventory is NOT obtainable without a click. The cost-summary disclosure's name is state-dependent ("Ver"/"Ocultar detalle de costes"). ⚠ Mobile capture — the DESKTOP entry state is §24's table. `CartPage`'s "cart content service degraded? (findings §23)" wording cites this section's failure mode: a bare, childless `<main>` skeleton that never resolves. |
| **§25** | PDP wishlist button, repeated-element strict-mode bug (2026-08-04) | ⚠ Its `.first()` fix was **REFUTED and replaced by §31** — read that instead. Durable: the PDP wishlist control is ONE button that **renames itself** ("Añadir a la lista de deseos" ↔ "Eliminar de la lista de deseos"), and that same accessible name repeats on every cross-selling card — the repeated-element hazard §31 then root-caused and anchored properly. |
| **§30** | Coverage expansion round 2 (2026-08-06) | Suite 15 → 25 tests, coverage 26 → 38/139 flows. Durable rule (now a CLAUDE.md standing rule): **`pnpm plan --update` reflects ONLY the most recent `pnpm test` invocation's route evidence, never accumulated history** — always run the FULL suite immediately before updating the plan. Also: the map's own `title` field hardens a Builder loaded-signal with zero live probing, but campaign titles collide ("COMBO WINS %" is 6 map entries). |
| **§32** | Cart inner structure + the whole cart-regression effort (2026-08-13) | The **only** live record of `/es/shop-cart.html`'s insides — the map holds 0 elements for it and the effort's own task reports are gitignored, so read the archive before touching cart code. Durable structure: the cart line is a plain **`div.product-list-card.product-card-full-screen`** with **no ARIA role** (NOT a `listitem` — `getByRole('listitem')` matches only recommendation cards), scoped under `div.shop-cart__products`; the remove control **renames itself by quantity** ("Eliminar producto" only at 1, "Restar unidad" at ≥2) and no confirm dialog ever intervenes; quantity is a 2-button stepper + a `status` readout, no spinbutton/input; empty state is `getByText(/cesta vacía/i)`; the total's label and its € amount are **separate sibling nodes** sharing `div.total-amount-module` (a bare `/total/i` also matches a "Subtotal" that appears past the free-shipping threshold); the header tab counts **units, not lines**; the mid-load skeleton is a childless `main`, indistinguishable from "0 lines" by count alone. Re-adding the same product+size **merges into the existing line** rather than creating a second one. Also durable: the **`setQuantity` residual overshoot** noise class (1-2 extra units on a single click, retry-recovered, a probability-reducing fix not a categorical one — don't re-diagnose it), and `ProductPage.addToCart()`'s fifth, spec-less consumer `explorer/crawl/primeCart.ts`. Backlog **P5** (session-invalidation recovery) closed here; its Task 8 subsection's account of the *cold-navigation* failure is **superseded by §33** — read that instead. |

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

## 36. Two degraded-window suite runs, no code defect found — but a real lead: the PLP `filterButton` signal's 20s budget vs its own ~16s healthy hydration (2026-08-17, later)

**Context.** Jorge wanted `pnpm plan --update` re-run against the new 140-flow map (`0144363`), which per the §30 rule requires a full `pnpm test` immediately before. Two attempts, both red, both fully evidence-read before any conclusion; **the plan update was deliberately NOT run** — coverage must not be committed from a red run (the §32 session-close lesson, second time it has protected us).

**Run 1 (18.2m vs ~7m healthy baseline): 23 passed / 2 flaky / 1 failed.** The hard failure (`hombre/lo-mas-vendido`, both attempts) plus both PLP flakes shared one signature, read from each `error-context.md`: the page was the **Mujer home** (`Categorías destacadas`, `Get the look`, no grid, no Filtrar) — §26's documented SPA-bounce shape. Desktop layout confirmed intact in every snapshot (0 mobile-drawer elements). Analyzer: `assertion/persistent` for lo-mas-vendido, and — **first production sighting of §34's `368d334` fix working** — the `checkout-structure` drawer flake classified `environment-noise`, not `unknown`.

**Run 2 (31.7m — worse): 20 passed / 2 flaky / 4 failed.** Different failure set, different mechanism: `lo-mas-vendido`'s retry had the **correct title** (`"Lo más vendido para hombre | Bershka"`) but `filterButton` never became visible within the 20s poll; `search-plp-pdp`'s snapshots show a fully-rendered 24-product grid (its failure was elsewhere in the flow). Failures **moved between specs across the two runs** — §7's definition of environment noise, not a defect. Per §7's own doctrine (sustained red streak → cross-check, don't keep re-running), no third run was launched.

**Two honest corrections to run 1's initial read, before they fossilize:**
- The header's `"Iniciar sesión"` was presented as part of the failure signature. It is not discriminating: run 2 shows it in snapshots of *successfully rendered* pages too — it is simply the anonymous header after `login.spec`'s mid-suite re-auth (§24), co-occurring with everything.
- A "maintenance page" grep counted the word `Error` in `error-context.md`'s own template. Instrument error; discard.

**The lead worth keeping — a structural budget collision, measured, not guessed:**

`isLoaded()` for **six** PLP page objects (`HombreCamisasPage`, `HombreComboWinsPage`, `HombreLoMasVendidoPage`, `PantalonesCapriPlpPage`, `PantalonesComboWinsPlpPage`, `VestidosTallasOverlayPage`) is `title-prefix && filterButton visible`, polled under `HYDRATION_TIMEOUT_MS = 20_000`. But `filterButton` is the **same desktop PLP filter toolbar §34 measured at ~16.1s to even exist in the accessibility tree on a HEALTHY page** — the identical element behind the crawler's still-open `complementary` item (CLAUDE.md pending item 5). 20s budget − 16s healthy hydration = **~4s of margin**, which any degraded window erases. The four PLP specs that failed across these two runs are **all** on that six-object list; the specs that don't use `filterButton` (PDPs, footer, wishlist) stayed green through both runs.

**Not acted on, deliberately.** A blind timeout raise is forbidden doctrine; the correct fix — if evidence keeps accumulating — is a better *signal*, not a bigger number: the PLP grid's own cards (`-c0p` links) hydrate well before the filter toolbar (run 2's snapshots show 18–24 card grids on pages whose toolbar checks failed). Filed as a pending item with a *start when*; the discriminating evidence would be a PLP spec failing on `filterButton` in a **fast, healthy** run.

**State left behind** *(✅ SUPERSEDED 2026-08-18 — the pair ran, twice: §37's opening paragraph and §38; the map is now 374 pages and coverage 19/374. The `filterButton` lead below is the part of this section still live.)*: suite red twice in degraded windows (no code changed this session in `tests/`/`src/`); coverage still reads 38/139 against a 140-flow map — the `pnpm test` → `pnpm plan --update` pair stays queued for a healthy DES window. Evidence from both runs preserved outside `test-results/` (scratchpad `evidence-2026-08-17/`, `evidence-run2/`) — session-local, gone with the scratchpad; the durable facts are this section.

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

## 38. The widened re-crawl: 140 → 374 pages, and the filter-toolbar question finally answered (2026-08-18, later)

**Context.** Jorge asked what would grow the framework's *knowledge* of the site (as opposed to spec coverage over what it already knows). The answer is the crawler — with one non-obvious constraint worth stating, because it dictates the recipe: **`pnpm explore --update` REPLACES the canonical map, it never accumulates** (`explorer/cli.ts` builds a fresh map from the session's own extractions and writes it over `args.out`). So knowledge grows by **one pass with bigger bounds**, never by repeated small passes. Doubled both: `EXPLORER_MAX_PAGES=300`, `EXPLORER_TIME_BUDGET_MS=2400000` (the budget is **per session**, anon and auth each get it), `EXPLORER_SEED_CHECKOUT=on`, launched detached via `Start-Process` per the 2026-07-30 harness-kill lesson. DES probed 200 first.

⚠ **Harness note, cost-free but worth recording:** the *watcher* polling the detached crawl was killed twice at ~40 min — the same limit that killed the 2026-07-29 crawl. The crawl itself, being detached, was unaffected both times; it was simply re-watched. Detaching protects the work; it does not protect anything the harness is running to observe it.

**Result: 374 pages (191 anon + 183 auth), 0 errors in BOTH sessions, ~1h20m.** Map committed `f16803b`, then re-annotated with fresh route evidence as `943a9db`.

| | committed (140p, `0144363`) | this crawl (374p) |
|---|---|---|
| pages / flows | 140 / 140 | **374 / 374** |
| elements | 3896 | **13977** (13977/13977 unique — B17 ✓) |
| interactions | 119 | 220 |
| PDP / PLP | 43 / 36 | **186 / 129** |
| Checkout | 1 | 1 ✓ (`/es/checkout.html`) |
| mobile-drawer elements | 0 | 0 ✓ (desktop fingerprint intact) |
| **`complementary` elements** | **0** | **0 — third crawl running, still 0** |

Coverage re-annotated after a full suite (§30 rule): **19/374**, up from 16 covered flows against 2.7× more known site. The absolute covered count rose; the denominator rose far more, which is the honest reading of "the framework now knows much more than the specs walk".

### The finding: pending item 5 is ANSWERED — it was the hydration branch all along

§35 shipped `d5f9595` specifically so the *next* crawl's log would name which branch the filter-toolbar failure was in, because `outcome: 'none'` alone could not distinguish "every attempt threw (locator never resolved)" from "the click landed and revealed nothing the crawler recognizes" — **and those need opposite fixes**. That instrument paid off on its first real crawl.

**Cross-checked 1:1 against the map, not read off the log prose (B17 + §35's corollary):** the map holds **37** filter/sort interactions, all `outcome: 'none'` with **0** revealed elements; the log holds exactly **37** `interaction click never resolved` warnings for those same labels (Filtrar ×12, Precio descendente ×7, Precio ascendente ×7, Color ×7, Talla, Novedad, Limpiar, Con descuento ×1 each). The counts match exactly, and **every "Filtrar" one is `TimeoutError: locator.click: Timeout 5000ms exceeded` — the locator never resolved.**

**Therefore:** the clicks never land, so `c8b5544`'s `complementary` overlay role **never executes** — it is not refuted, it is *untestable by crawling* until the click lands. The open question is closed in the sense that matters: **stop treating this as a missing-overlay-role problem.** §35's own unmeasured hypothesis is now the confirmed mechanism — 3 attempts × (5s bound + 0.5s pause) ≈ 16.5s against §34's measured ~16.1s hydration is ~0.4s of margin, i.e. a coin flip, and it came up tails 37/37 this crawl. The fix direction is the click's *budget or wait*, not `OVERLAY_ROLES`.

### §37's cap, validated in a full suite on the same day it shipped

The suite run feeding the coverage update (23 passed / 3 flaky / 0 failed, 18.9m degraded window) was also the cap's first full-suite exposure, and its instrument earned its keep immediately:
- Two `[ProductPage] addToCart needed 3 clicks before the drawer confirmed` lines — from **checkout-reach and checkout-structure, both of which PASSED**. Neither asserts an exact quantity, so up to 3 units landing cost them nothing.
- Both cart flakes' timeout diagnostics now read `3 add click(s) fired` — where an uncapped run would have fired ~15-25. The residue bound works.
- **Pending item 7's start-when is NOT met:** no `needed N clicks` line co-occurred with a broken exact-quantity assertion. The badge probe stays unbought.

### Honest limits

- **15 of 374 pages are `/ic/`** — a second locale (`/ic/h-man.html`, `/ic/shop-cart.html`, …) the frontier does not exclude. Duplicate knowledge of pages already crawled under `/es/`, ~4% of the map; downstream agents will treat them as distinct routes. Filed as a backlog item rather than hand-edited out of the JSON: post-processing the map would break the "the map is what the crawl produced" property that makes it reproducible. The fix belongs in the frontier's route rules and costs a fresh crawl to prove.
- **The 3 flakes were read, not dismissed by count.** Two are §37's drawer class. The third (`vestidos-tallas-overlay`) failed `isOverlayOpen()` *after* `isLoaded()` had already passed — so it is **not** evidence for pending item 6 (`filterButton` lives in `isLoaded()`, which succeeded). Whether it touches §31's still-unprobed `.first()` lead in that same method is unresolved: a false NEGATIVE is not the false-positive shape §31 predicts, so this run neither confirms nor refutes it.
- **PDP 43 → 186 and PLP 36 → 129 are not verified as all-distinct products** beyond the B17 unique-id gate; breadth this much larger has not been spot-checked for near-duplicate campaign pages.

---

## 39. Pending item 7's trigger fired, and the header cart badge probe answered its two unknowns (2026-08-19)

**Context.** The day's `pnpm qa-cycle` (run #12 in the history; suite 22 passed / 2 failed / 2 flaky, 23.3m — a degraded window) produced, for the first time, the exact evidence pairing pending item 7 was waiting for: `add-to-cart.spec`'s failing attempt logged **`addToCart needed 3 clicks before the drawer confirmed`** and then failed its exact-quantity assertion with **`Expected: 1, Received: 2`** — snapshot confirming a healthy session (`Mi cuenta`), the cart page, `Cesta (2)`. That is §37's cap residue demonstrably breaking a spec, which is what the badge probe's cost was gated on. (The run's two hard failures — `hombre/combo-wins` and `mujer/pantalones-combo-wins`, both attempts each — were read from their own `error-context.md` first: both snapshots are the **Mujer home** with no grid, §26's SPA-bounce shape in a degraded window. NOT pending item 6's trigger, which needs `filterButton` failing on the *correct* page in a *healthy* run. Evidence preserved in the session scratchpad before any re-run.)

**The probe** (`tests/_probe/cart-badge-probe.spec.ts`, deleted after this section, §18 lifecycle; run standalone, `cleanCart` guaranteeing the 0-state; instruments explicit, never `ProductPage.addToCart` itself — §31 method). One discriminating run, 2/2 passed, 2.6m:

| Question | Answer, measured live |
|---|---|
| Badge at 0 (empty cart) | **Empty text** — the `link "Ver cesta"`'s inner text is `""` on the cart page, home, AND a PDP. No `"0"`, no digit. "A digit is present" ⇔ "cart non-empty". |
| Reactive without navigation? | **YES.** After ONE explicit add click on the PDP, with zero navigations, the badge went `""` → `"1"` at **t+1355ms**. |
| Faster than the drawer? | **YES, by ~0.9s in this window** — badge at t+1355ms vs drawer at t+2261ms. |

**What this proves and what it does not, stated plainly.** The *mechanism* is proven: the badge is a live, reactive observable available on the PDP without navigating, and its 0-state is unambiguous (empty text). The *margin* is a single healthy-window measurement — the fix's whole value lies in degraded windows where the drawer lags by seconds-to-never, and this run's drawer arrived in 2.3s. The reasonable prior is that the badge (a header counter) and the drawer (a full dialog render) have independent latencies, and §37's own failing snapshot showed the badge already rendered (`9+`) while the assertion was failing — but the degraded-window margin is unmeasured.

**One structural limit found by reading the evidence, not the probe:** the badge **saturates at `9+`** (§37's snapshot). A guard of the shape "badge text changed from its pre-click baseline" is therefore blind when the cart already holds ≥9 units — baseline `9+` → add → still `9+`. Fine for every `cleanCart`-anchored spec (baseline is always `""`), degraded-but-bounded (the §37 cap still applies) everywhere else.

**Fix direction this enables (not implemented in this section):** in `addToCart`'s act, read the badge's text once before the first click; treat "badge text differs from that baseline" as add-confirmation for the anti-double-add guard (the *verify* stays on the drawer — the drawer is still what must be closed before returning). That converts the guard's observable from the lagging drawer to a ~1.4s counter, which is the class-eliminating fix item 7 named — the cap stays as the backstop.
