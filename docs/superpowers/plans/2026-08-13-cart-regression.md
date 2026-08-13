# Cart Regression Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the four cart operations (remove, quantity, empty state, totals) with one lifecycle journey spec, plus a `cleanCart` fixture that closes the §7/§29 cart-cleanup backlog item.

**Architecture:** A live probe (§18 lifecycle) first establishes the cart page's inner structure — the map holds **0 elements** for `/es/shop-cart.html` and no remove/quantity selector has ever been confirmed. Then: a new `CartPage` Page Object, a pure `parseEuroAmount` helper (unit-tested), an `ensureEmptyCart` support function exposed as an explicit `cleanCart` fixture, and a single journey spec asserting the transition chain 0→1→2→1→0. Design: `docs/superpowers/specs/2026-08-13-cart-regression-design.md`.

**Tech Stack:** Playwright + TypeScript (e2e), Vitest (unit), pnpm. Live runs need VPN to DES.

## Global Constraints

- `@typescript-eslint/no-explicit-any` is an **error**; `import/no-cycle` is an **error** (maxDepth Infinity).
- Selector priority: `getByTestId` → `getByRole` → `getByLabel` → `getByPlaceholder`. A CSS class is allowed only as a documented deviation (§31 precedent: `mainWishlistPanel()`).
- Every state-changing interaction is act→verify→retry via `actUntil` (`src/support/retry.ts`); every `.click()` carries an explicit `timeout` (§26).
- A verify must identify WHAT it sees (§28 — never bare counts of unidentified things) and must distinguish "my action worked" from "it was already true" (§29 — assert transitions from guaranteed states).
- Locators anchored, never disambiguated with page-wide `.first()` over a repeated name (§31).
- Never `waitForLoadState('networkidle')` against DES. Specs import `test`/`expect` from `src/fixtures/test.ts`, never raw `@playwright/test`.
- Suite runs `workers: 1`, `retries: 1`. Commit style: Conventional Commits.
- ⚠ The cart page renders from a **slow skeleton** (~6-10s measured, §5) and has a documented "content never renders" outage mode (§23 item 4). Budgets below are sized to that, not blind.

---

## Probe Results (filled by Task 1 — every later task reads THIS table, not the provisional guesses)

| # | Question | Answer (from probe output) |
|---|---|---|
| P1 | Line-item container (role/structure, anchoring ancestor) | *(fill in Task 1)* |
| P2 | Remove button: accessible name, one per line? confirm dialog after click? | *(fill in Task 1)* |
| P3 | Quantity control: exists? shape (buttons +/− / spinbutton / combobox) + accessible names | *(fill in Task 1)* |
| P4 | Where the per-line quantity is READ from (element + format) | *(fill in Task 1)* |
| P5 | Empty-state signal (exact text/CTA) | *(fill in Task 1)* |
| P6 | Total element (locator + text format, e.g. "Total 119,95 €") | *(fill in Task 1)* |
| P7 | Tab "Cesta (N)": counts units or lines? | *(fill in Task 1)* |
| P8 | Mid-load skeleton: what does it expose? (proves `isEmpty()` is false on it) | *(fill in Task 1)* |

**If P3 = "no quantity control exists":** Task 3 omits `increaseQuantity`/`decreaseQuantity`/`lineQuantity`, Task 5 omits the two quantity blocks (marked below), and findings §32 records the absence as the reason that scope item died. Do NOT simulate quantity by re-adding the product.

---

### Task 1: Live probe of the cart's inside (two rounds, §18 lifecycle)

**Files:**
- Create: `tests/_probe/cart-inner-probe.spec.ts` (temporary — deleted in step 6)
- Modify: `docs/superpowers/plans/2026-08-13-cart-regression.md` (the Probe Results table above)
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (append §32)

**Interfaces:**
- Consumes: the proven prime recipe (`homePage.header.searchBar.search` → `searchResultsPage.firstProduct().open()` → `productPage.selectFirstSize()`/`addToCart()` → `header.goToCart()`).
- Produces: the Probe Results table P1–P8 and findings §32 — the selector source of truth for Tasks 3–6.

- [ ] **Step 1: Write the probe (round-1 shape: observe only)**

```typescript
// tests/_probe/cart-inner-probe.spec.ts
// TEMPORARY probe (§18 lifecycle — delete after findings §32 is written).
// Round 1: REMOVE_NAME = null → observe and dump only.
// Round 2: set REMOVE_NAME to the name found in round 1's output → re-run to
//          validate removal live and capture the EMPTY state.
import { test } from '../../src/fixtures/test';

// Round 2: replace null with the remove-button name from round 1 (e.g. /eliminar/i).
const REMOVE_NAME: RegExp | null = null;

test('PROBE: cart inner structure, desktop (findings §32)', async ({ homePage, searchResultsPage, productPage, page }) => {
  test.setTimeout(300_000);

  // 1. Prime one item (proven recipe — checkout-reach.spec's own path).
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();
  await productPage.selectFirstSize();
  await productPage.addToCart();

  // 2. Enter the cart and capture the MID-LOAD skeleton immediately (P8).
  await productPage.header.goToCart();
  console.log('[P8 SKELETON, t0] ====================================');
  console.log(await page.locator('main').ariaSnapshot().catch(() => '(main not present)'));

  // 3. Wait out the skeleton (measured 6-10s §5; 12s here), dump the real content.
  await page.waitForTimeout(12_000);
  console.log('[CART CONTENT, t+12s] ================================');
  console.log(await page.locator('main').ariaSnapshot());

  // 4. Structured queries: P1/P2/P3/P4/P6/P7.
  console.log('[P7 TAB]', await productPage.header.cartTab().itemCount());
  for (const name of [/eliminar/i, /borrar/i, /quitar/i, /cantidad/i, /unidad/i, /\+/, /-/]) {
    const btns = page.locator('main').getByRole('button', { name });
    const n = await btns.count();
    if (n === 0) continue;
    console.log(`[P2/P3 BUTTONS ${name}] count=${n}`);
    for (let i = 0; i < Math.min(n, 4); i++) {
      const b = btns.nth(i);
      console.log('  name=', JSON.stringify((await b.getAttribute('aria-label')) ?? (await b.textContent())));
      // Ancestor chain → the anchoring container (same method as the §31 probe).
      console.log('  ancestors=', await b.evaluate((el) => {
        const chain: string[] = [];
        let n2: Element | null = el;
        while (n2 && chain.length < 8) { chain.push(`${n2.tagName}.${(n2 as HTMLElement).className || ''}`); n2 = n2.parentElement; }
        return chain.join(' < ');
      }));
    }
  }
  console.log('[P3 SPINBUTTONS]', await page.locator('main').getByRole('spinbutton').count());
  console.log('[P3 COMBOBOXES]', await page.locator('main').getByRole('combobox').count());
  console.log('[P1 MAIN LISTITEMS]', await page.locator('main').getByRole('listitem').count());
  console.log('[P1 MAIN ARTICLES]', await page.locator('main').locator('article').count());
  console.log('[P6 TOTAL-ish]', JSON.stringify(await page.locator('main').getByText(/total/i).allTextContents()));

  // 5. Round 2 only: remove EVERY line (also cleans the shared account) and
  //    capture the empty state (P5).
  if (REMOVE_NAME !== null) {
    const removeButtons = page.locator('main').getByRole('button', { name: REMOVE_NAME });
    for (let guard = 0; guard < 15; guard++) {
      const before = await removeButtons.count();
      if (before === 0) break;
      await removeButtons.first().click({ timeout: 5_000 });
      // Bounded settle: wait for the count to actually drop (fire-once clicks get lost, §7).
      const deadline = Date.now() + 20_000;
      while ((await removeButtons.count()) >= before && Date.now() < deadline) {
        await page.waitForTimeout(500);
      }
      console.log(`[P2 REMOVE] ${before} -> ${await removeButtons.count()}`);
    }
    await page.waitForTimeout(5_000);
    console.log('[P5 EMPTY STATE] ===================================');
    console.log(await page.locator('main').ariaSnapshot());
  }
});
```

- [ ] **Step 2: Run round 1 (VPN required)**

Run: `pnpm exec playwright test tests/_probe/cart-inner-probe.spec.ts`
Expected: PASS; console output contains the `[P…]` blocks. If the cart content never renders (§23 outage mode), re-try later — do not conclude structure from an outage.

- [ ] **Step 3: Fill P1–P4 and P6–P8 in the Probe Results table** from round 1's real output. Quote exact accessible names.

- [ ] **Step 4: Set `REMOVE_NAME` to the discovered name and run round 2**

Run: `pnpm exec playwright test tests/_probe/cart-inner-probe.spec.ts`
Expected: PASS; `[P2 REMOVE]` lines show the count dropping; `[P5 EMPTY STATE]` shows the real empty-state content. Fill P5 (and correct P2 if removal revealed a confirm dialog). Side effect (deliberate): the shared account's cart is now empty.

- [ ] **Step 5: Append findings §32** to `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md`: the P1–P8 answers, verbatim key snapshots (content state + empty state), and any surprises — same structure as §23's Q2 write-up. Do not renumber anything.

- [ ] **Step 6: Delete the probe and commit**

```bash
rm tests/_probe/cart-inner-probe.spec.ts
git add -A docs/superpowers/notes/2026-06-17-des-live-validation-findings.md docs/superpowers/plans/2026-08-13-cart-regression.md
git commit -m "docs(findings): §32 - cart inner structure probed live on desktop"
```

---

### Task 2: `parseEuroAmount` — pure, unit-tested (TDD)

**Files:**
- Create: `src/support/price.ts`
- Test: `src/support/price.unit.test.ts`

**Interfaces:**
- Produces: `parseEuroAmount(text: string): number | null` — parses the FIRST es-ES euro amount in a text blob; `null` when none. Consumed by `CartPage.totalAmount()` (Task 3).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/support/price.unit.test.ts
import { describe, it, expect } from 'vitest';
import { parseEuroAmount } from './price';

describe('parseEuroAmount', () => {
  it('parses a plain amount', () => { expect(parseEuroAmount('119,95 €')).toBe(119.95); });
  it('parses thousands separators', () => { expect(parseEuroAmount('1.234,56 €')).toBe(1234.56); });
  it('parses an amount embedded in a label', () => { expect(parseEuroAmount('Total 24,99 €')).toBe(24.99); });
  it('takes the FIRST amount when several are present', () => { expect(parseEuroAmount('Antes 3,95 € Gratis 12,00 €')).toBe(3.95); });
  it('returns null when no amount is present', () => { expect(parseEuroAmount('Gratis')).toBeNull(); });
  it('returns null on empty input', () => { expect(parseEuroAmount('')).toBeNull(); });
  it('requires the euro sign', () => { expect(parseEuroAmount('12,34')).toBeNull(); });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:unit -- price`
Expected: FAIL — cannot resolve `./price`.

- [ ] **Step 3: Implement**

```typescript
// src/support/price.ts
/**
 * Parses the FIRST euro amount out of a text blob in es-ES format
 * ('.' thousands, ',' decimals — e.g. "1.234,56 €"). Returns null when none is
 * present (skeleton text, "Gratis", empty string). Pure on purpose: the DOM-facing
 * caller is CartPage.totalAmount(); keeping the parsing here makes it unit-testable
 * without a browser (design 2026-08-13-cart-regression-design.md).
 */
export function parseEuroAmount(text: string): number | null {
  const m = text.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*€/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '')) + Number(m[2]) / 100;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test:unit -- price`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/support/price.ts src/support/price.unit.test.ts
git commit -m "feat(foundation): parseEuroAmount - es-ES price parsing for the cart page"
```

---

### Task 3: `CartPage` Page Object

**Files:**
- Create: `src/pages/CartPage.ts`

**Interfaces:**
- Consumes: `parseEuroAmount` (Task 2), `actUntil` (`src/support/retry.ts`), `BasePage`, `Header`, **the Probe Results table** (P1–P6 override every ⚠ PROVISIONAL literal below).
- Produces (consumed by Tasks 4–6):
  - `open(): Promise<void>` — direct goto `/es/shop-cart.html`
  - `waitForLoaded(): Promise<void>` — resolves when line items OR the empty state rendered; throws the §23 diagnostic on timeout
  - `lineItemCount(): Promise<number>`
  - `removeFirstItem(): Promise<void>` — verify = line-count transition N→N−1 (or empty state when N=1)
  - `lineQuantity(): Promise<number | null>` — first line's quantity; null when unreadable *(omit if P3 = none)*
  - `increaseQuantity(): Promise<void>` / `decreaseQuantity(): Promise<void>` *(omit if P3 = none)*
  - `totalAmount(): Promise<number | null>` — null while not rendered/parseable (poll-friendly, never throws)
  - `isEmpty(): Promise<boolean>` — identifies the empty-state CONTENT (§28)

- [ ] **Step 1: Write `CartPage`**

Every ⚠ PROVISIONAL literal below MUST be replaced with the confirmed value from the Probe Results table before running anything. If a probe answer contradicts a structure below (e.g. removal opens a confirm dialog), adapt the act/verify to the probed reality and document the §32 reference in-code.

```typescript
// src/pages/CartPage.ts
import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';
import { actUntil } from '../support/retry';
import { parseEuroAmount } from '../support/price';

const CART_PATH = '/es/shop-cart.html';
// The cart renders from a slow skeleton (~6-10s measured, findings §5) and has a
// documented "content never renders" outage mode (§23 item 4) — 30s covers the
// skeleton with headroom; past it, failing IS the correct outcome.
const SKELETON_DEADLINE_MS = 30_000;

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

  /** ⚠ PROVISIONAL (P1): line-item containers, identified by carrying their own remove
   *  control — anchoring per §31: per-line locators are scoped to their line container. */
  private lineItems(): Locator {
    return this.page.locator('main').getByRole('listitem')
      .filter({ has: this.page.getByRole('button', { name: /eliminar/i }) });
  }

  /** ⚠ PROVISIONAL (P5): the empty state identified by its own CONTENT (§28) — "0 line
   *  items" is indistinguishable from a not-yet-rendered skeleton, so counting zero here
   *  would be a structural false green. */
  private emptyState(): Locator {
    return this.page.locator('main').getByText(/cesta (está )?vacía/i);
  }

  async isEmpty(): Promise<boolean> {
    return this.emptyState().isVisible();
  }

  async lineItemCount(): Promise<number> {
    return this.lineItems().count();
  }

  /** Waits out the skeleton: real content is EITHER line items OR the empty state.
   *  Pure poll (no act) — same shape as waitForWishlistControl (§29): only after one of
   *  the two states rendered is any answer information rather than a guess. */
  async waitForLoaded(): Promise<void> {
    await actUntil({
      verify: async () => (await this.lineItemCount()) > 0 || (await this.isEmpty()),
      immediateFirstCheck: true,
      deadlineMs: SKELETON_DEADLINE_MS,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error('CartPage: neither line items nor the empty state rendered within the deadline — cart content service degraded? (findings §23)'); },
    });
  }

  /** Removes the first line. Verify is the TRANSITION N→N−1 (§29) over identified line
   *  containers — when N=1 the empty state is accepted too (the list may unmount whole). */
  async removeFirstItem(): Promise<void> {
    const before = await this.lineItemCount();
    if (before === 0) throw new Error('CartPage.removeFirstItem: no line items to remove');
    await actUntil({
      act: async () => {
        // ⚠ PROVISIONAL (P2): remove-button name. Scoped to the FIRST line container —
        // the name repeats once per line (anchoring, §31).
        await this.lineItems().first().getByRole('button', { name: /eliminar/i })
          .click({ timeout: 5_000 });
      },
      verify: async () =>
        (await this.lineItemCount()) === before - 1 ||
        (before === 1 && (await this.isEmpty())),
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error(`CartPage: line count did not drop from ${before} after clicking remove`); },
    });
  }

  // ── Quantity (OMIT this whole block if Probe Results P3 = no control) ──────────

  /** ⚠ PROVISIONAL (P4): where the first line's quantity is read from. Null while
   *  unreadable — poll-friendly. */
  async lineQuantity(): Promise<number | null> {
    const raw = await this.lineItems().first().getByRole('spinbutton').inputValue().catch(() => null);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  private async setQuantity(direction: 'up' | 'down'): Promise<void> {
    const beforeQty = await this.lineQuantity();
    if (beforeQty === null) throw new Error('CartPage: line quantity is unreadable — cannot assert a transition from it');
    const target = direction === 'up' ? beforeQty + 1 : beforeQty - 1;
    // ⚠ PROVISIONAL (P3): control names. Scoped to the first line container (§31).
    const name = direction === 'up' ? /aumentar|más/i : /disminuir|menos/i;
    await actUntil({
      act: async () => {
        await this.lineItems().first().getByRole('button', { name }).click({ timeout: 5_000 });
      },
      verify: async () => (await this.lineQuantity()) === target,
      deadlineMs: 20_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      onTimeout: () => { throw new Error(`CartPage: quantity did not reach ${target} (was ${beforeQty})`); },
    });
  }

  async increaseQuantity(): Promise<void> { await this.setQuantity('up'); }
  async decreaseQuantity(): Promise<void> { await this.setQuantity('down'); }

  // ───────────────────────────────────────────────────────────────────────────────

  /** ⚠ PROVISIONAL (P6): the order-total element. Returns null while not rendered or
   *  not parseable — poll-friendly on purpose (expect.poll aborts on a throw). */
  async totalAmount(): Promise<number | null> {
    const text = await this.totalRegion().textContent().catch(() => null);
    if (text === null) return null;
    return parseEuroAmount(text);
  }

  /** ⚠ PROVISIONAL (P6): replace with the probed container around the total. */
  private totalRegion(): Locator {
    return this.page.locator('main').getByText(/total/i);
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (Live validation comes with the probe-informed spec in Task 5 — there is nothing meaningful to run against yet.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/CartPage.ts
git commit -m "feat(foundation): CartPage page object - probed selectors from findings §32"
```

---

### Task 4: `ensureEmptyCart` + `cleanCart`/`cartPage` fixtures

**Files:**
- Create: `src/support/cartCleanup.ts`
- Modify: `src/fixtures/test.ts`

**Interfaces:**
- Consumes: `CartPage` (Task 3 — `open`, `waitForLoaded`, `isEmpty`, `removeFirstItem`, `lineItemCount`).
- Produces: `ensureEmptyCart(cart: CartPage): Promise<void>`; fixtures `cartPage: CartPage` and `cleanCart: void` (explicit — only cart specs declare it).

- [ ] **Step 1: Write `ensureEmptyCart`**

```typescript
// src/support/cartCleanup.ts
/**
 * Guarantees an EMPTY cart as a test's starting state — the transition anchor the §29
 * doctrine requires (the shared DES account carries cart items across runs, a proven
 * false-green source; closes the §7 cleanup-fixture backlog item).
 *
 * Hard-bounded twice (iterations AND wall clock): on a degraded DES this fails with an
 * explicit diagnostic, it never hangs toward the test timeout (§26).
 */
import type { CartPage } from '../pages/CartPage';

const MAX_REMOVALS = 15;
const DEADLINE_MS = 120_000;

export async function ensureEmptyCart(cart: CartPage): Promise<void> {
  await cart.open();
  await cart.waitForLoaded();
  const deadline = Date.now() + DEADLINE_MS;
  for (let i = 0; i < MAX_REMOVALS; i++) {
    if (await cart.isEmpty()) return;
    if (Date.now() > deadline) break;
    await cart.removeFirstItem();
  }
  if (await cart.isEmpty()) return;
  throw new Error(`ensureEmptyCart: cart still not empty after bounds (${MAX_REMOVALS} removals / ${DEADLINE_MS}ms) — ${await cart.lineItemCount()} lines left. DES degraded, or the remove selector drifted (findings §32).`);
}
```

- [ ] **Step 2: Add the fixtures to `src/fixtures/test.ts`**

Add to the imports: `import { CartPage } from '../pages/CartPage';` and `import { ensureEmptyCart } from '../support/cartCleanup';`. Add to the `Fixtures` interface: `cartPage: CartPage;` and `cleanCart: void;`. Add to `test.extend` (after the `productPage` line):

```typescript
  cartPage: async ({ page }, use) => { await use(new CartPage(page)); },
  // Explicit (NOT auto): only cart specs pay its cost. Depends on desktopLayout so the
  // device=desktop interceptor is active before this fixture's own navigation — cleanup
  // must see the same layout (and selectors) the test will.
  cleanCart: async ({ cartPage, desktopLayout }, use) => {
    void desktopLayout;
    await ensureEmptyCart(cartPage);
    await use();
  },
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Live-validate the fixture in isolation (both paths of §29's controlled-experiment gate)**

The account's cart is empty after Task 1's round 2, so the first run exercises the short-circuit path. Then `add-to-cart.spec` (unmodified) puts an item back, and the second run exercises the removal path.

Run:
```bash
pnpm exec playwright test tests/cart/add-to-cart.spec.ts
```
Expected: PASS (this also primes one item for the next check).

Create a THROWAWAY spec `tests/_probe/cleancart-check.spec.ts` (deleted in this same step):

```typescript
import { test, expect } from '../../src/fixtures/test';

test('cleanCart leaves the cart provably empty', async ({ cleanCart, cartPage }) => {
  void cleanCart;
  await expect.poll(() => cartPage.isEmpty(), { timeout: 30_000 }).toBe(true);
  expect(await cartPage.lineItemCount()).toBe(0);
});
```

Run: `pnpm exec playwright test tests/_probe/cleancart-check.spec.ts`
Expected: PASS — the fixture removed the primed item (removal path exercised). Then:

```bash
pnpm exec playwright test tests/_probe/cleancart-check.spec.ts
```
Expected: PASS again, faster — short-circuit path (already empty). Then delete it:

```bash
rm tests/_probe/cleancart-check.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/support/cartCleanup.ts src/fixtures/test.ts
git commit -m "feat(foundation): cleanCart fixture - guaranteed-empty cart starting state (closes §7 backlog item)"
```

---

### Task 5: `cart-lifecycle.spec.ts` — the journey

**Files:**
- Create: `tests/cart/cart-lifecycle.spec.ts`

**Interfaces:**
- Consumes: fixtures `cleanCart`, `cartPage` (Task 4), plus the standard `homePage`/`searchResultsPage`/`productPage`; `CartPage` API (Task 3).
- Produces: the suite's cart regression coverage (suite goes 25 → 26 tests).

- [ ] **Step 1: Write the spec**

If Probe Results P3 = no quantity control: delete the two blocks marked `[QUANTITY — omit if P3=none]` and keep the rest unchanged.

```typescript
// tests/cart/cart-lifecycle.spec.ts
// The cart lifecycle as ONE journey (design 2026-08-13-cart-regression-design.md,
// option A): a single prime (adding is 30-60s and the suite's #1 flake surface, §28/§30)
// and every assertion a TRANSITION from a guaranteed state (§29) — the chain 0→1→2→1→0
// is anchored by cleanCart's provably-empty start, so residue from previous runs can
// never bless it.
import { test, expect } from '../../src/fixtures/test';

const HYDRATION_TIMEOUT_MS = 20_000;

test('cart lifecycle: add → quantity up/down → remove → empty', async ({ cleanCart, homePage, searchResultsPage, productPage, cartPage }) => {
  void cleanCart; // the fixture already proved the cart is EMPTY — the transition anchor
  // Sized, not blind (§26 doctrine): prime (~60s worst observed) + cart skeleton budget
  // (30s) + 4 cart ops × ~20s deadlines. The default 150s fits a healthy run but not a
  // degraded-window one, and this spec does strictly more than any existing single spec.
  test.setTimeout(240_000);

  // Prime: the proven add recipe (search → PDP → size → add).
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();
  await searchResultsPage.firstProduct().open();
  await productPage.selectFirstSize();
  await productPage.addToCart();
  await productPage.header.goToCart();
  await cartPage.waitForLoaded();

  // 0 → 1 (a transition: cleanCart fixed the 0).
  await expect.poll(() => cartPage.lineItemCount(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(1);
  await expect.poll(() => cartPage.totalAmount(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
  const totalAt1 = await cartPage.totalAmount();
  if (totalAt1 === null) throw new Error('cart-lifecycle: total unreadable right after it polled > 0');

  // [QUANTITY — omit if P3=none] 1 → 2: line quantity AND total react.
  await cartPage.increaseQuantity();
  await expect.poll(() => cartPage.lineQuantity(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(2);
  // Falsifiable on purpose: a 2×1 promo would break the strict increase — documented
  // risk taken over shipping an unfalsifiable >= from day one (design §Totals).
  await expect.poll(() => cartPage.totalAmount(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(totalAt1);

  // [QUANTITY — omit if P3=none] 2 → 1: and the total comes back down.
  const totalAt2 = await cartPage.totalAmount();
  if (totalAt2 === null) throw new Error('cart-lifecycle: total unreadable after the quantity increase');
  await cartPage.decreaseQuantity();
  await expect.poll(() => cartPage.lineQuantity(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(1);
  await expect.poll(() => cartPage.totalAmount(), { timeout: HYDRATION_TIMEOUT_MS }).toBeLessThan(totalAt2);

  // 1 → 0: remove, and verify the REAL empty state (identified by content, §28 —
  // counting zero lines would also match a broken skeleton).
  await cartPage.removeFirstItem();
  await expect.poll(() => cartPage.isEmpty(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
```

- [ ] **Step 2: Run standalone, twice (§25 criterion: two consecutive greens)**

Run: `pnpm exec playwright test tests/cart/cart-lifecycle.spec.ts` — twice.
Expected: PASS ×2. On any failure: read the failure's own `error-context.md`/trace BEFORE re-running (`test-results/` is overwritten by the next run — §28's method note); distinguish selector defects (fix in `CartPage`) from the documented §23 outage class (retry later).

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add tests/cart/cart-lifecycle.spec.ts
git commit -m "feat(cart): cart-lifecycle journey spec - remove/quantity/empty/totals covered"
```

---

### Task 6: `add-to-cart.spec` asserts a transition, not a state

**Files:**
- Modify: `tests/cart/add-to-cart.spec.ts`

**Interfaces:**
- Consumes: `cleanCart` fixture (Task 4); Probe Results P7 (what the tab counts).

- [ ] **Step 1: Adopt `cleanCart` and tighten the assert**

In `tests/cart/add-to-cart.spec.ts`, change the test signature to include the fixture and replace the final open-ended assert. `toBeGreaterThan(0)` is a STATE assert — §29's false-green shape: residue from a previous run blesses it. With a guaranteed-empty start it becomes the transition 0→1:

```typescript
test('adding a product updates the mini cart', async ({ cleanCart, homePage, searchResultsPage, productPage }) => {
  void cleanCart; // guaranteed-empty start: the final assert is the transition 0→1 (§29)
```

and (⚠ P7: this expects the tab to count UNITS of a 1-unit add — if the probe found it counts something else, assert the probed equivalent of "exactly one product"):

```typescript
  await expect.poll(() => cartTab.itemCount(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(1);
```

- [ ] **Step 2: Run standalone**

Run: `pnpm exec playwright test tests/cart/add-to-cart.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/cart/add-to-cart.spec.ts
git commit -m "fix(search/cart): add-to-cart asserts the 0->1 transition via cleanCart (§29 shape)"
```

---

### Task 7: Full validation, docs, coverage update

**Files:**
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (§32 completion + Status header)
- Modify: `CLAUDE.md` (current-state pointer; backlog: cart-cleanup fixture → closed)
- Modify: `coverage/*` / `reports/*` as produced by the tools

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Full suite**

Run: `pnpm test`
Expected: 26 tests; green modulo the documented environment noise (§7 classes, retry-recovered). Any NEW failure shape in the 4 specs sharing `ProductPage.ts` or in the cart specs → systematic-debugging from the run's own artifacts before anything else.

- [ ] **Step 2: Offline gates**

Run: `pnpm test:unit && pnpm typecheck && pnpm lint`
Expected: unit 428/428 (421 + the 7 price tests), typecheck and lint clean.

- [ ] **Step 3: Update the plan's coverage (§30 rule — full suite ran immediately before)**

Run: `pnpm plan --update`
Expected: coverage ≥ 38/139 (the new spec's route evidence may or may not match a map flow — the cart page IS in the map; record the number honestly either way).

- [ ] **Step 4: Close the docs**

- Findings §32: add the validation outcome (suite numbers, both cleanCart paths exercised, quantity verdict per P3).
- Findings Status header: refresh the suite line (26 tests).
- `CLAUDE.md`: replace the current-state pointer block (26 tests, new coverage number); move "cart-cleanup fixture" from the pending list to the closed list; update `docs/roadmap/2026-07-02-backlog.md`'s matching entry.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(cart): cart regression coverage complete - lifecycle journey + cleanCart fixture, suite 25 -> 26"
```

---

## Self-review notes (run after writing, issues fixed inline)

- **Spec coverage:** remove → Task 3/5; quantity → Task 3/5 (P3-conditional, with the explicit drop rule); empty state → Task 3/5 (content-identified); totals → Task 2/3/5 (strict increase, falsifiable); fixture → Task 4; add-to-cart improvement → Task 6; probe/§32 → Task 1; validation plan → Tasks 5-7. No spec section without a task.
- **Type consistency:** `parseEuroAmount(text): number | null` (T2) = usage in `CartPage.totalAmount` (T3); `CartPage` API in T3's Produces = calls in T4 (`open/waitForLoaded/isEmpty/removeFirstItem/lineItemCount`) and T5 (`lineItemCount/totalAmount/lineQuantity/increase/decrease/removeFirstItem/isEmpty/waitForLoaded`); fixture names `cleanCart`/`cartPage` consistent across T4-T6.
- **Provisional-selector policy:** every unknown literal is marked ⚠ PROVISIONAL with the Probe Results row that overrides it — the mechanism (act→verify shapes, bounds, API) is fixed; only the literals await Task 1. This is the honest structure for a page nobody has ever probed, not a placeholder.
