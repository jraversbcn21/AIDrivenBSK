import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';
import { LoginPage } from './LoginPage';
import { actUntil } from '../support/retry';
import { parseEuroAmount } from '../support/price';
import { primaryUser } from '../data/users';

const CART_PATH = '/es/shop-cart.html';
// The cart renders from a slow skeleton (~6-10s measured, findings §5) and has a
// documented "content never renders" outage mode (§23 item 4) — 30s covers the
// skeleton with headroom; past it, failing IS the correct outcome. Confirmed still
// accurate by the §32 probe (real content settled well inside this budget).
const SKELETON_DEADLINE_MS = 30_000;
// One session-recovery cycle's budget (the closed session-invalidation item, backlog P5
// / findings §32 "Task 7 completion", confirmed live again in this task's own
// reproduction, 2026-08-13): DES single-sessions the shared test account, so `login.spec`'s
// mid-suite re-auth invalidates the session every other test relies on for the rest of the
// run. RAISED to 120_000 (task-review fix, 2026-08-13; the original 90_000 was sized only
// against `login.spec`'s own OBSERVED wall clock, ~1.0m — not against `LoginPage.login()`'s
// own BOUNDED WORST CASE, which composes higher: up to 30s variant-detection deadline +
// up to 45s interstitial-click deadline + up to 30s post-login `waitForURL`, ≈105s, plus
// `LoginPage.open()`'s un-timed navigation+consent walk on top). A slow-but-successful
// recovery near that ~105s worst case could otherwise starve the remaining budget for the
// post-recovery skeleton settle and throw "recovery failed" on a recovery that actually
// worked, just slowly. A CEILING, not a cost: §26's precedent ("only to fit one recovery
// cycle, happy path pays nothing") applies identically here — waitForLoaded() never reaches
// it when the session is already live.
const RECOVERY_DEADLINE_MS = 120_000;
// The logged-out header tell must PERSIST this long before it counts as a dead session.
// MEASURED LIVE 2026-08-16 (findings §33, backlog P6): on a cold cart navigation with a
// perfectly VALID session, DES serves its server-rendered header in the LOGGED-OUT state —
// a real, visible "Iniciar sesión" button — for the first ~5-8s, and only then does
// hydration swap it for "Mi cuenta" and render the cart. Sampled every 250ms from t=0:
// loginBtn=true through t+5000ms, false from t+8000ms (cart content arrived in the same
// tick). 15s is ~2x that observed window — sized against the measurement with margin, not
// against a single sample's exact value.
const SESSION_TELL_CONFIRM_MS = 15_000;

export class CartPage extends BasePage {
  readonly header: Header;
  constructor(page: Page) {
    super(page);
    this.header = new Header(page);
  }

  /** Direct navigation is confirmed-routable for this page (unlike /es/q/, §7). */
  async open(): Promise<void> {
    await this.goto(CART_PATH);
  }

  /**
   * The cart's own product lines. CONFIRMED live NOT an ARIA `listitem` (findings §32,
   * P1) — `main`'s `listitem`s/`article`s belong exclusively to the "Podría gustarte"/
   * "Te puede interesar" recommendations carousel plus the gift-ticket/promo-code list
   * items; a `getByRole('listitem')` scoped anywhere in `main` would silently match ZERO
   * real cart lines. The real container is a plain CSS-classed div with no wrapping role
   * (ancestor chain confirmed live): `div.product-list-card.product-card-full-screen
   * .product-list-card--desktop` → `.__wrapper` → `.__content`, inside
   * `div.shop-cart__grid` < `div.shop-cart__products` < `div.shop-cart`. A CSS-class
   * anchor is a documented deviation from the selector priority — there is no role or
   * testid to anchor on instead (§31 `mainWishlistPanel()` precedent).
   *
   * Scoped through `div.shop-cart__products` (task-review fix, 2026-08-13), not just
   * `main`: §32/P1's own ancestor chain names it as the real cart-lines container, and a
   * bare `main` scope would count product TILES on a wrong-page render too — both the
   * Mujer home page and the member-hub page (the two documented wrong-page renders, §32
   * Task 7/8 completion) show tiles/cards under `main` that could otherwise coincidentally
   * match this same CSS-class combination, and `main` alone also leaves the cart's own
   * recommendation-carousel scope unexcluded structurally rather than by luck.
   */
  private lineItems(): Locator {
    return this.page.locator('main')
      .locator('div.shop-cart__products')
      .locator('div.product-list-card.product-card-full-screen.product-list-card--desktop');
  }

  /** The first line's container — used to scope every per-line control so a repeated
   *  accessible name (the remove/quantity buttons repeat once per line) can never
   *  resolve to the wrong line (§31 anchoring doctrine). `.first()` here is a deliberate
   *  POSITIONAL choice matching the interface's own "first item" contract, not a
   *  disambiguation reflex over an unexpected strict-mode violation — the distinction
   *  §31 draws explicitly. */
  private firstLine(): Locator {
    return this.lineItems().first();
  }

  /** The empty state, identified by its own CONTENT (§28 doctrine) — a bare zero from
   *  `lineItemCount()` is indistinguishable from the mid-load skeleton (findings §32,
   *  P8: the skeleton is a bare `main` with zero children). Exact copy confirmed live:
   *  "Cesta vacía Aún no tienes ningún artículo en la cesta, descubre todo lo que
   *  tenemos para ti" (probe P5, findings §32 — the empty-state probe question, NOT
   *  backlog item P5/P6; disambiguated 2026-08-13, task review). */
  private emptyState(): Locator {
    return this.page.locator('main').getByText(/cesta vacía/i);
  }

  async isEmpty(): Promise<boolean> {
    return this.emptyState().isVisible();
  }

  async lineItemCount(): Promise<number> {
    return this.lineItems().count();
  }

  /**
   * Re-authenticates and retries the cart navigation. Only called once the session-
   * invalidation tell (below) has been positively observed.
   *
   * CONFIRMED live 2026-08-13 (task-7-report.md; reproduced again identically in this
   * task's own reproduction run): a direct navigation to `/es/shop-cart.html` with a dead
   * session does NOT open an in-dialog gate the way clicking checkout's "Tramitar pedido"
   * does (`src/support/loginGate.ts`) — it silently renders the Mujer HOME page instead, so
   * there is no dialog to complete here. Recovery is therefore a full re-authentication via
   * the same `LoginPage` flow `auth.setup`/`login.spec` already use (both login variants,
   * §19/§23 — reused as-is, not reimplemented), followed by retrying the cart navigation.
   *
   * ⚠ RESOLVED 2026-08-16 (findings §33, closes backlog P6) — this block used to warn of an
   * "interaction risk" with a suspected DES cold-navigation defect, and to note that the
   * observed failures could not be told apart from a genuinely broken re-login. There is no
   * such DES defect. The failures were THIS method being called when it never should have
   * been: the caller's session tell misfired on a valid session (see waitForLoaded() below),
   * so `login.open()` navigated an ALREADY-AUTHENTICATED user to `/es/logon.html`, which DES
   * bounces to `/es/member-hub.html`. No login form ever rendered, `login()` threw at its
   * own 30s variant-detection deadline, and the final `this.open()` below never ran — a
   * failing run's trace showed exactly three navigations, not four. So the danger is not
   * that this method races into something; it is that **calling it unnecessarily is
   * destructive**, because the re-login it performs cannot succeed against a live session.
   * That is why the caller now requires its tell to persist before calling here at all.
   * When the session really IS dead, this path works: 3/3 legitimate recoveries in the
   * 2026-08-16 full suite completed and landed on `/es/shop-cart.html`.
   */
  private async recoverInvalidSession(): Promise<void> {
    // Observability (task-review finding 1, 2026-08-13): every validation of this path so
    // far inferred it worked from the OLD failure signature's absence across a run, never
    // from directly watching it engage — the honest gap this line and the one below close.
    // Plain console.log is deliberate: Playwright's own reporters (list included) surface
    // test-process stdout live, no testInfo plumbing needed for a page-object method.
    console.log('[CartPage] session-invalidation tell observed ("Iniciar sesión" in header) — attempting recovery: re-authenticating and retrying the cart navigation');
    const login = new LoginPage(this.page);
    await login.open();
    await login.login(primaryUser());
    await this.open(); // retry the cart navigation now that the session is live again
    console.log(`[CartPage] recovery re-authentication completed, cart navigation retried (current URL: ${this.page.url()})`);
  }

  /** Waits out the skeleton: real content is EITHER line items OR the empty state.
   *  Same either-state shape as waitForWishlistControl (§29): only after one of the two
   *  states rendered is any answer information rather than a guess. Necessity confirmed
   *  live, not assumed: P8 showed the mid-load skeleton renders as `main` with literally
   *  zero children — indistinguishable from "0 lines" by count alone.
   *
   * Session-invalidation recovery (the closed session-invalidation item, backlog P5,
   * closed 2026-08-13, findings §32 "Task 7 completion"): every poll cycle's act checks
   * the header's own logged-out tell — `Header.isUserLoggedIn()`, the SAME primitive
   * `auth.setup`/`login.spec` already trust for this exact question — before doing
   * anything else. It identifies WHAT it sees (a positively-rendered "Iniciar sesión"
   * button) rather than inferring invalidity from a timeout (§28 doctrine).
   *
   * ⚠ CORRECTED 2026-08-16 (findings §33, closes backlog P6). This comment used to claim:
   * "the button check defaults to 'logged in' on absence (not found ≠ seen-and-false), so a
   * not-yet-hydrated header CANNOT misfire this into an unnecessary re-login — only an
   * actually-rendered logged-out header can." The premise was measured and is FALSE: a
   * not-yet-hydrated header on this site is not an ABSENT header, it is DES's server-rendered
   * LOGGED-OUT header, button and all, for the first ~5-8s of a cold cart navigation on a
   * perfectly valid session. So "an actually-rendered logged-out header" was satisfied by a
   * page that was not logged out, and this act — which runs at t≈0 — fired a full, useless
   * re-login every time. That re-login then navigated to /es/logon.html, which DES redirects
   * to /es/member-hub.html for an already-authenticated user, so LoginPage.login() sat
   * waiting for a form that would never render until the test timeout killed it, leaving the
   * page on member-hub with a valid session — the entire "cold-navigation wrong-page defect"
   * (backlog P6) was this misfire and its cascade, not anything DES does wrong. The tell is
   * now required to PERSIST across SESSION_TELL_CONFIRM_MS before it is believed (see the
   * act below). A "non-cart main content" tell was considered
   * and rejected as the primary signal: both live failures (task-7-report.md, this task's
   * own reproduction) show `main` fully rendered with real, if wrong, content — a home
   * page, not a skeleton or an error shell — so a content-shape check would need its own
   * positive definition of "not cart content" with no natural anchor, where the header tell
   * is already a single proven boolean.
   *
   * KNOWN, MEASURED AS HARMLESS HERE (was "confounder", task-review finding 6, 2026-08-13;
   * settled 2026-08-16, findings §33): `Header.isUserLoggedIn()` short-circuits to `true` on
   * `member-hub`/`/account` URLs (`src/components/Header.ts`) BEFORE looking at the header
   * button at all. That was suspected of blinding this detector, since member-hub is where
   * the failures ended up. It does not: on the real cold cart navigation the URL stays on
   * `/es/shop-cart.html` (200, no redirect — measured 2/2), so the short-circuit never
   * evaluates. The page only ever reached member-hub as a CONSEQUENCE of the misfire below,
   * never as its cause.
   *
   * Recovery is bounded to exactly ONE attempt per call (the `recovered` flag) — DES's
   * session death is a one-time event per suite invocation (§32 Task 7: once any test
   * recovers it, the rest of the suite runs clean), so a second attempt within the same
   * call would only mask a genuinely broken login rather than a transient timing race.
   * The deadline widens by RECOVERY_DEADLINE_MS to fit exactly one such cycle — the same
   * "ceiling, not a cost" reasoning as `VestidosTallasOverlayPage.openOverlay()` (§26): the
   * happy path (session already live) never pays it, since `recovered` only ever flips to
   * true when the tell is genuinely observed.
   *
   * isEmpty()/lineItemCount() are unaffected: DES never renders the "Cesta vacía" copy on
   * the bounced home page (confirmed in both failure snapshots above) or on the home page's
   * own content, so the verify below cannot bless a logged-out page as an empty cart (§29).
   */
  async waitForLoaded(): Promise<void> {
    let recovered = false;
    await actUntil({
      act: async () => {
        if (recovered) return; // one-shot — see recoverInvalidSession()'s doc above
        if (await this.header.isUserLoggedIn()) return; // session fine, nothing to recover
        // The tell must PERSIST before it is believed (findings §33, closes backlog P6). A
        // SINGLE read cannot tell "the session is dead" from "the header has not hydrated
        // yet" — DES serves the logged-out header for ~5-8s on a VALID session — and this
        // act runs at t≈0 (immediateFirstCheck makes verify fail on the skeleton, so the
        // act fires straight away), i.e. squarely inside that window. Re-reading after a
        // settle discriminates them: a hydrating header flips to "Mi cuenta", a genuinely
        // dead one stays logged-out. This is §29's rule applied to the detector itself —
        // a verify that cannot distinguish its target state from a transient that looks
        // identical will act on the transient.
        await this.page.waitForTimeout(SESSION_TELL_CONFIRM_MS);
        if (await this.header.isUserLoggedIn()) return; // it was pre-hydration, not a dead session
        recovered = true;
        await this.recoverInvalidSession();
      },
      verify: async () => (await this.lineItemCount()) > 0 || (await this.isEmpty()),
      immediateFirstCheck: true,
      deadlineMs: SKELETON_DEADLINE_MS + RECOVERY_DEADLINE_MS,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => {
        // Distinguish the two failure classes the deadline can now mean (§28: a diagnostic
        // must say what it saw, never a generic timeout). Branches on `recovered` — NOT a
        // fresh `isUserLoggedIn()` re-check (task-review finding 3, 2026-08-13): a fresh
        // check would misreport a recovery that ran but still failed as the generic §23
        // message whenever the page happens to read "logged in" at timeout (e.g. re-login
        // itself failed partway, mid-navigation, or the retried navigation raced into the
        // cold-nav defect the doc comment above flags — `isUserLoggedIn()` could read either
        // way in those cases). `recovered` is ground truth for "did this call attempt
        // recovery at all," which is exactly what the diagnostic needs to report.
        if (recovered) {
          throw new Error(
            `CartPage: session invalid and recovery failed — a recovery attempt (re-authentication + retried navigation) ran but cart content still did not render within the deadline (current URL: ${this.page.url()}; backlog P5 [closed] / P6, findings §32 Task 7/8 completion)`,
          );
        }
        throw new Error('CartPage: neither line items nor the empty state rendered within the deadline — cart content service degraded? (findings §23)');
      },
    });
  }

  /**
   * Removes the first line entirely, from ANY starting quantity. The verify's contract is
   * "the targeted removal took effect — count dropped OR the cart is empty", NOT a
   * guaranteed exact N→N−1: a live two-line drain (task 5 report, Run A attempt 1,
   * 2026-08-13) showed the count can skip straight past the intermediate `before − 1`
   * value while DES re-renders, so the empty-state branch is accepted UNCONDITIONALLY,
   * not gated on `before === 1` (see the note below).
   *
   * The remove control is STATE-DEPENDENT (findings §32, P2, confirmed across 13
   * consecutive live clicks, no confirm dialog on any of them): `button "Eliminar
   * producto"` exists ONLY at line quantity 1; at quantity >=2 only `button "Restar
   * unidad"` exists, and decrementing to 1 restores "Eliminar producto" in its place.
   * The act therefore prefers "Eliminar producto" when present (the terminal click that
   * actually removes the line) and otherwise clicks "Restar unidad" (one decrement) —
   * repeated automatically by actUntil's retry loop until the line-count transition is
   * observed, draining any starting quantity down to zero exactly as the live probe's
   * own drain loop did (13→0, one click per iteration).
   *
   * The act must not blindly re-click every retry cycle either — the SAME root-cause
   * class `setQuantity`'s guard was built to fix (CartPage.ts, task 5 report): once the
   * targeted line-level transition has already happened (count dropped below `before`, or
   * the cart emptied), a further click would land on whatever is now first — a DIFFERENT
   * line. This is exactly what Run A attempt 1 showed live: with `before === 2` (two
   * genuinely different product lines, not one multi-quantity line), the loop clicked past
   * the removal of line A and into line B before its own poll ever observed the
   * intermediate `before − 1 === 1` count — removing BOTH lines from a call meant to
   * remove only one. The act therefore checks state FIRST and returns without clicking
   * once it has already moved; only a still-`before` state is eligible for another click on
   * "the current first line" (repeated same-line "Restar unidad" clicks while draining a
   * single multi-quantity line are unaffected — that IS the intended per-click decrement).
   *
   * The empty-state branch of verify is unconditional (not gated on `before === 1`),
   * fixing a false-negative timeout CONFIRMED live 2026-08-13 (task 5 report, Run A
   * attempt 1): the cart really was empty (confirmed in that failure's own
   * error-context.md — "Cesta vacía") but the old exact-match-only verify never accepted
   * it, so `removeFirstItem` timed out on a removal that had already succeeded.
   * `isEmpty()` is CONTENT-identified (§32/§28 doctrine — not a bare zero count): DES
   * never renders that "Cesta vacía" copy while any line remains, so an empty cart is
   * unconditional proof the targeted line is gone, regardless of what `before` was or
   * whether the count ever equalled `before − 1` along the way.
   */
  async removeFirstItem(): Promise<void> {
    const before = await this.lineItemCount();
    if (before === 0) throw new Error('CartPage.removeFirstItem: no line items to remove');
    const line = this.firstLine();
    await actUntil({
      act: async () => {
        // Already moved past `before` (a click already landed, possibly into a different
        // line once the targeted one is gone) — let the verify decide instead of clicking
        // again on top of it.
        const currentCount = await this.lineItemCount();
        if (currentCount !== before || (await this.isEmpty())) return;
        const eliminar = line.getByRole('button', { name: 'Eliminar producto' });
        if (await eliminar.isVisible().catch(() => false)) {
          await eliminar.click({ timeout: 5_000 });
          return;
        }
        await line.getByRole('button', { name: 'Restar unidad' }).click({ timeout: 5_000 });
      },
      verify: async () =>
        (await this.lineItemCount()) === before - 1 ||
        (await this.isEmpty()),
      // Sized for a worst-case multi-unit drain: the live probe observed a line reach
      // quantity 13 (via §28's confirmation-drawer noise re-triggering the add) and drain
      // cleanly to 0 within its own bound (13 clicks, no confirm dialog on any of them —
      // §32 does not record per-click timestamps, so this is sized as iterations × cadence
      // with margin, not a measured per-click duration). 30s covers ~13 act/verify cycles
      // at the 500ms sleep cadence with real headroom on the common 1-2 unit case.
      deadlineMs: 30_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error(`CartPage: line count did not drop from ${before} after removal attempts`); },
    });
  }

  // ── Quantity ─────────────────────────────────────────────────────────────────────

  /** The first line's quantity readout. CONFIRMED live (findings §32, P3/P4) as a
   *  `status`-role element whose accessible text is the plain integer as a string
   *  ("1", "2", "13" observed) — NOT a spinbutton (0 spinbuttons/comboboxes found at
   *  any observed quantity), so `inputValue()` does not apply; read via `.textContent()`
   *  instead. Null while unreadable — poll-friendly. */
  async lineQuantity(): Promise<number | null> {
    // .textContent() is a WAITING/retrying locator method (unlike .count()/.isVisible()),
    // and the project has no global actionTimeout (ProductPage.ts's own addBtn/eliminar
    // click sites document this). Without an explicit timeout here, an unresolved status
    // element (empty-cart race, partial render) could block for the whole TEST timeout
    // instead of failing within a nominal budget — bounded the same way the file's click
    // sites are (§26). A timeout rejects, which the catch below maps to null.
    const raw = await this.firstLine().getByRole('status').textContent({ timeout: 5_000 }).catch(() => null);
    if (raw === null) return null;
    const trimmed = raw.trim();
    // Guard (task-review fix, 2026-08-13): an empty readout is UNREADABLE, not zero —
    // `Number('')` is `0`, which would silently corrupt `beforeQty` in setQuantity() into a
    // real (wrong) target rather than the "cannot assert a transition from it" throw that
    // method already does for a genuinely null read.
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * The act must not blindly re-click every retry cycle. CONFIRMED live 2026-08-13
   * (`cart-lifecycle.spec.ts`, task 5): a single intended "increase 1→2" click overshot to a
   * server-confirmed quantity of 4 in one run and 19 in another (subtotal matched
   * unit-price × observed-quantity both times — real server-side state, not a display
   * glitch). Root cause: DES's per-click round trip (it also has to recompute the
   * shipping-progress banner, e.g. "Has conseguido tu envío estándar gratis a domicilio")
   * can exceed the loop's 500ms poll cadence, so the old unconditional re-click fired
   * several more times before the readout was ever observed exactly at `target` — the poll
   * skipped straight over it. Same defect FAMILY as `ProductPage.addToCart`'s anti-double-add
   * guard and `Footer.goToStoreLocator` (§27/§28: "a slow confirmation must not trigger a
   * second stray act"), but those guard an idempotent single-shot action ("already there?");
   * this one is cumulative (each click is a further +1/-1), so the guard here checks whether
   * the readout has left `beforeQty` AT ALL — not whether it reached `target` — before
   * allowing another click, and gives a landed click a bounded settle window (up to 3s) to
   * actually leave `beforeQty` before the next retry cycle could otherwise fire again. The
   * retry loop itself is NOT removed — fire-once clicks are still lost on this site (§7) —
   * only the blind unconditional re-click is.
   */
  private async setQuantity(direction: 'up' | 'down'): Promise<void> {
    const beforeQty = await this.lineQuantity();
    if (beforeQty === null) throw new Error('CartPage: line quantity is unreadable — cannot assert a transition from it');
    if (direction === 'down' && beforeQty === 1) {
      // P2 (findings §32): "Restar unidad" does not exist at quantity 1 — only "Eliminar
      // producto" does. Fail fast with a clear diagnostic instead of retrying a click on a
      // locator that will never resolve; removeFirstItem() is the correct call here.
      throw new Error('CartPage.decreaseQuantity: line is already at quantity 1 — use removeFirstItem() to remove it (§32, P2)');
    }
    const target = direction === 'up' ? beforeQty + 1 : beforeQty - 1;
    const line = this.firstLine();
    // Confirmed accessible names (findings §32, P3), scoped to the first line container
    // (§31 anchoring — both names repeat once per line): increase = "Sumar unidad"
    // (always present); decrease = "Restar unidad" (present only at quantity >=2).
    const name = direction === 'up' ? 'Sumar unidad' : 'Restar unidad';
    let observedQty: number | null = beforeQty;
    await actUntil({
      act: async () => {
        observedQty = await this.lineQuantity();
        // Already moved (or unreadable mid-transition) — a click already landed or is in
        // flight; let the verify decide instead of firing another one on top of it.
        if (observedQty === null || observedQty !== beforeQty) return;
        await line.getByRole('button', { name }).click({ timeout: 5_000 });
        // Bounded settle window: give the just-sent click a real chance to leave `beforeQty`
        // before this act could be re-invoked and fire another one on top of it. Widens the
        // effective inter-click gap well past the observed DES lag without abandoning
        // act→verify→retry.
        for (let i = 0; i < 6; i++) {
          await this.page.waitForTimeout(500);
          observedQty = await this.lineQuantity();
          if (observedQty === null || observedQty !== beforeQty) return;
        }
      },
      verify: async () => (await this.lineQuantity()) === target,
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => {
        // Distinguish a dead control (observedQty still beforeQty) from an overshoot/
        // undershoot (observedQty moved but not to target) — both are real diagnostics now.
        throw new Error(`CartPage: quantity did not reach ${target} (was ${beforeQty}, observed ${observedQty} at timeout)`);
      },
    });
  }

  async increaseQuantity(): Promise<void> { await this.setQuantity('up'); }
  async decreaseQuantity(): Promise<void> { await this.setQuantity('down'); }

  // ─────────────────────────────────────────────────────────────────────────────────

  /**
   * The order-total container. CONFIRMED live (findings §32, P6) that "Total" and its €
   * amount render as SEPARATE sibling text nodes, NOT one combined string (unlike the
   * mobile §23 capture) — a bare `getByText(/total/i)` returns only the label
   * (`parseEuroAmount` would see `null`), and once a cost breakdown renders (observed at
   * 13 units) a sibling `paragraph "Subtotal"` ALSO matches `/total/i`. The nearest
   * shared ancestor of both the label and the amount, confirmed via an ancestor-chain
   * walk, is `div.total-amount-module` — it does NOT contain "Subtotal" (that lives in
   * the sibling `div.sub-total-module`), so scoping to it avoids both hazards. A
   * CSS-class anchor is the same documented deviation as `lineItems()` above (§31
   * precedent) — there is no role/testid on this container.
   */
  private totalRegion(): Locator {
    return this.page.locator('main').locator('div.total-amount-module');
  }

  /** Null while not rendered/parseable — poll-friendly on purpose (`expect.poll` aborts
   *  on a throw), never throws itself. */
  async totalAmount(): Promise<number | null> {
    // Bounded for the same reason as lineQuantity() above (§26) — .textContent() waits/
    // retries with no global actionTimeout to fall back on.
    const text = await this.totalRegion().textContent({ timeout: 5_000 }).catch(() => null);
    if (text === null) return null;
    return parseEuroAmount(text);
  }
}
