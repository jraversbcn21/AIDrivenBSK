# B13 Checkout/PDP Classifier Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `RuleClassifier` so real PDP pages (`-c0p{id}.html`) stop classifying as `Checkout`, the real DES cart path classifies as `Cart`, and text-only checkout boilerplate stops producing false `Checkout` labels — then regenerate and re-annotate the canonical map live.

**Architecture:** Deterministic path rules (confirmed-live URL patterns) are evaluated before text-signal rules in `explorer/classify/RuleClassifier.ts`; the `Checkout` signal rule additionally requires a path hint. Pure-function change, no schema bump, no new files. Spec: `docs/superpowers/specs/2026-07-03-b13-checkout-classifier-fix-design.md`.

**Tech Stack:** TypeScript, Vitest (unit), Playwright (live crawl via `pnpm explore`), pnpm.

## Global Constraints

- `@typescript-eslint/no-explicit-any` is an error — no `any`, ever.
- `import/no-cycle` is an error at any depth.
- Package manager is **pnpm**. Unit tests: `pnpm test:unit`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.
- Live steps require VPN access to DES (`BASE_URL` in local `.env`, gitignored). Never use `waitForLoadState('networkidle')` against DES.
- Conventional Commits: `type(scope): description`; scope here is `explorer`.
- The e2e suite runs `workers: 1` on purpose — do not parallelize.
- Commit trailers required on every commit:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016aFvKBriBjSQ8iKfFwMuGo
  ```

---

### Task 1: RuleClassifier path rules + unit tests (TDD, offline)

**Files:**
- Modify: `explorer/classify/RuleClassifier.ts` (whole file shown below — it is 23 lines)
- Test: `explorer/classify/RuleClassifier.unit.test.ts`

**Interfaces:**
- Consumes: `PageContext`/`Classification` from `explorer/classify/Classifier.ts` (unchanged).
- Produces: same `Classifier` interface — no signature changes; only label outcomes change. Downstream (map builder, planner, builder) consume `pageType` strings and need no changes.

- [ ] **Step 1: Add the five failing tests**

Append inside the existing `describe('RuleClassifier', ...)` block in `explorer/classify/RuleClassifier.unit.test.ts` (the file's `ctx` helper already accepts a `path` second argument):

```ts
  it('classifies PDP from the -c0p path pattern even when checkout-ish text fires and no size signal exists', async () => {
    // Live-confirmed B13 (2026-07-03): every DES PDP carries an "Envíos y devoluciones"
    // accordion (hasCheckoutSteps fires), while the real size selector lives inside the
    // "Tallas" dialog the crawler never opens (hasSizeSelector is a hydration-timing
    // accident). 16/18 -c0p pages in the canonical map were mislabeled Checkout this way.
    const r = await c.classifyPage(ctx(
      { hasAddToCart: true, hasCheckoutSteps: true },
      '/es/top-bandeau-fruncido-c0p229723039.html',
    ));
    expect(r.pageType).toBe('PDP');
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
  });
  it('PDP path pattern beats the PLP grid signal (recommendations carousel on a PDP)', async () => {
    expect((await c.classifyPage(ctx(
      { hasProductGrid: true, hasFilters: true, hasAddToCart: true },
      '/es/camiseta-manga-corta-c0p207356814.html',
    ))).pageType).toBe('PDP');
  });
  it('classifies the real DES cart path shop-cart.html as Cart even with checkout-ish text', async () => {
    // The old Cart rule regex (/\/cart|\/cesta/) never matched shop-cart.html, and the
    // Checkout text rule fired first — the map's auth cart page was labeled Checkout.
    expect((await c.classifyPage(ctx(
      { hasCheckoutSteps: true, hasAddToCart: true },
      '/es/shop-cart.html',
    ))).pageType).toBe('Cart');
  });
  it('does not classify Checkout from text alone (shopping-guide shape)', async () => {
    expect((await c.classifyPage(ctx(
      { hasCheckoutSteps: true },
      '/es/shopping-guide.html',
    ))).pageType).toBe('Other');
  });
  it('still classifies Checkout when the text signal and a checkout-like path agree', async () => {
    expect((await c.classifyPage(ctx(
      { hasCheckoutSteps: true },
      '/es/checkout/payment',
    ))).pageType).toBe('Checkout');
  });
```

- [ ] **Step 2: Run the test file — verify the five new tests fail, the five old ones pass**

Run: `pnpm test:unit explorer/classify/RuleClassifier.unit.test.ts`
Expected: **4 failed / 6 passed** (10 total). The four failures with the current code: the first `-c0p` test gets `Checkout`, the second gets `PLP`, the shop-cart test gets `Checkout`, the shopping-guide test gets `Checkout`. The fifth new test ("text and path agree") already passes — it pins down behavior that must survive the change, not new behavior. The five pre-existing tests keep passing.

- [ ] **Step 3: Replace `RuleClassifier.ts` with the new rule order**

Full new content of `explorer/classify/RuleClassifier.ts`:

```ts
import type { Classifier, PageContext, Classification } from './Classifier';

export class RuleClassifier implements Classifier {
  async classifyPage(ctx: PageContext): Promise<Classification> {
    const s = ctx.signals;
    const p = ctx.path;

    // Deterministic path rules first — confirmed-live URL patterns beat text signals on
    // this site (B13, 2026-07-03). `-c0p{id}.html` is THE DES PDP pattern (findings §5;
    // already trusted by explorer/url.ts routePattern and analyzeAria's ProductCard
    // detection). A -c0p page is a PDP even when it shows a recommendations carousel with
    // per-card quick-add buttons, so this wins over the PLP signal rule too.
    if (/-c0p\d+\.html$/i.test(p)) return { pageType: 'PDP', confidence: 0.95 };
    if (/\/shop-cart\.html$|\/cart|\/cesta/.test(p)) return { pageType: 'Cart', confidence: 0.9 };
    if (/\/wishlist|\/favoritos/.test(p)) return { pageType: 'Wishlist', confidence: 0.8 };

    // PLP checked first among signal rules: DES's grid cards each carry their own "Añadir
    // a la cesta" quick-add button, and category pages often mention "talla" somewhere
    // (e.g. a size-guide link) without being a genuine PDP — hasProductGrid+hasFilters is
    // the more specific signal and must win when both fire together (live-confirmed
    // 2026-07-03, findings doc §8).
    if (s.hasProductGrid && s.hasFilters) return { pageType: 'PLP', confidence: 0.85 };
    if (s.hasAddToCart && s.hasSizeSelector) return { pageType: 'PDP', confidence: 0.9 };
    // Checkout needs a path hint besides the text signal: the text regex alone matches
    // ordinary PDP/help boilerplate ("Envíos y devoluciones" — B13). The hint list is a
    // best guess to confirm against the real DES checkout URL when one is first reached
    // (backlog D15).
    if (s.hasCheckoutSteps && /checkout|order|pago|payment/i.test(p)) {
      return { pageType: 'Checkout', confidence: 0.8 };
    }
    if (s.hasLoginForm) return { pageType: 'Account', confidence: 0.75 };
    if (s.hasSearchResults) return { pageType: 'Search', confidence: 0.75 };
    if (p === '/' || /^\/[a-z]{2}$/.test(p)) return { pageType: 'Home', confidence: 0.7 };

    return { pageType: 'Other', confidence: 0.3 };
  }
}
```

- [ ] **Step 4: Run the test file — all 10 pass**

Run: `pnpm test:unit explorer/classify/RuleClassifier.unit.test.ts`
Expected: 10 passed, 0 failed.

- [ ] **Step 5: Full offline gates**

Run: `pnpm test:unit` → all unit tests pass (no other suite asserts on classifier priority; if one fails, read it — it is asserting stale behavior and should be updated to the new expected label, not deleted).
Run: `pnpm typecheck` → clean.
Run: `pnpm lint` → clean.

- [ ] **Step 6: Commit**

```powershell
git add explorer/classify/RuleClassifier.ts explorer/classify/RuleClassifier.unit.test.ts
git commit -m @'
fix(explorer): classify PDP/Cart by confirmed URL patterns; Checkout needs a path hint (B13)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016aFvKBriBjSQ8iKfFwMuGo
'@
```

---

### Task 2: Live full re-crawl and map verification (VPN required)

**Files:**
- Modify (generated): `coverage/functional-map.json` — **do not commit in this task**; committed in Task 3 after `pnpm plan --update` re-annotates it.

**Interfaces:**
- Consumes: Task 1's classifier (via `pnpm explore`).
- Produces: a regenerated `coverage/functional-map.json` whose `pageType` labels Task 3 re-annotates and commits.

- [ ] **Step 1: Regenerate the auth session**

Run: `pnpm exec playwright test --project=setup`
Expected: 1 passed (~30-40s), `.auth/state.json` rewritten. If it fails with a navigation/TLS error, VPN is down — stop and report; do not retry in a loop.

- [ ] **Step 2: Full re-crawl, both sessions (long-running: ~20-25 min)**

```powershell
$env:EXPLORER_MAX_PAGES = '80'
$env:EXPLORER_TIME_BUDGET_MS = '1200000'
pnpm explore --update
Remove-Item Env:EXPLORER_MAX_PAGES, Env:EXPLORER_TIME_BUDGET_MS
```

Run in background (exceeds the 10-min tool timeout). Expected: exits 0, ~150±5 pages both sessions combined (crawl-to-crawl variability is documented and expected — findings §7/§12), 0 errors, and the CLI's 0-page overwrite guard not triggered.

- [ ] **Step 3: Verify the corrected labels on the regenerated map**

```powershell
$map = Get-Content coverage/functional-map.json -Raw | ConvertFrom-Json
"pages: $($map.pages.Count)  schema: $($map.schemaVersion)"
"-c0p por tipo:"; $map.pages | Where-Object { $_.path -match '-c0p\d+' } | Group-Object pageType | ForEach-Object { "  $($_.Name): $($_.Count)" }
"Checkout total: $((@($map.pages | Where-Object pageType -eq 'Checkout')).Count)"
$map.pages | Where-Object { $_.path -like '*shop-cart*' -or $_.path -like '*shopping-guide*' } | ForEach-Object { "$($_.pageType) [$($_.session)] $($_.path)" }
```

Expected:
- Every `-c0p` page → `PDP` (count may differ from 18 — crawl variability — but the `PDP` group must be the only group).
- `Checkout total: 0` (no real checkout page is reachable by link-following).
- `shop-cart.html` → `Cart` (whichever sessions reached it); `shopping-guide.html` → `Other`.

- [ ] **Step 4: Diff against the previous map — no label regressions**

```powershell
git show HEAD:coverage/functional-map.json | Out-File -Encoding utf8 $env:TEMP\old-map.json
$old = Get-Content $env:TEMP\old-map.json -Raw | ConvertFrom-Json
$new = Get-Content coverage/functional-map.json -Raw | ConvertFrom-Json
$oldByKey = @{}; $old.pages | ForEach-Object { $oldByKey["$($_.session)|$($_.path)"] = $_.pageType }
$new.pages | ForEach-Object {
  $k = "$($_.session)|$($_.path)"
  if ($oldByKey.ContainsKey($k) -and $oldByKey[$k] -ne $_.pageType) { "$k : $($oldByKey[$k]) -> $($_.pageType)" }
}
```

Expected: every listed transition is one of `Checkout -> PDP` (the 16), `Checkout -> Cart` (shop-cart), `Checkout -> Other` (shopping-guide). Any transition **away from** a previously-correct label (e.g. `PLP -> ...`, `PDP -> Checkout`) is a regression — stop and investigate before proceeding (systematic-debugging skill).

---

### Task 3: Coverage re-annotation + map commit (VPN required)

**Files:**
- Modify (generated): `coverage/functional-map.json`, `reports/route-evidence.json` (gitignored input), commit only the map.

**Interfaces:**
- Consumes: Task 2's regenerated map; the e2e suite's route evidence.
- Produces: the committed, annotated canonical map (schema 1.3, `coveredBy` populated).

- [ ] **Step 1: Run the reference e2e suite (evidence source)**

Run: `pnpm test`
Expected: 4/4 pass (setup + login + search-plp-pdp + add-to-cart), ~2 min, `reports/route-evidence.json` written with 3 entries. One retry-then-pass is acceptable (documented environment noise); a hard failure is not — stop and report.

- [ ] **Step 2: Re-annotate coverage**

Run: `pnpm plan --update`
Expected: exits 0; prints covered/uncovered counts. Covered-flow count in the same ballpark as M7's 8/152 (exact number varies with the fresh crawl — variability is documented, findings §12).

- [ ] **Step 3: Verify annotation integrity**

```powershell
$map = Get-Content coverage/functional-map.json -Raw | ConvertFrom-Json
"schema: $($map.schemaVersion)"
"flows sin coveredBy: $((@($map.flows | Where-Object { $null -eq $_.coveredBy })).Count)"
"flows Checkout: $((@($map.flows | Where-Object type -eq 'Checkout')).Count)"
```

Expected: `schema: 1.3`; `flows sin coveredBy: 0` (every flow evaluated, empty array = uncovered); `flows Checkout: 0`.

- [ ] **Step 4: Commit the map**

```powershell
git add coverage/functional-map.json
git commit -m @'
feat(explorer): refresh canonical map with corrected page types (B13)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016aFvKBriBjSQ8iKfFwMuGo
'@
```

---

### Task 4: Documentation closure

**Files:**
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (new §13; update the §10 open-lead line and the header **Status** line)
- Modify: `docs/roadmap/2026-07-02-backlog.md` (B13 status; "Where a fresh session resumes")
- Modify: `docs/roadmap/2026-07-02-platform-roadmap.md` ("Where a fresh session resumes"; milestone table row)

**Interfaces:** none (docs only). Fill in the real numbers observed in Tasks 2-3 where the templates below say `<N>`.

- [ ] **Step 1: Findings doc — append §13**

Append to `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md`:

```markdown
## 13. Checkout/PDP classifier fix (B13) — closes §10's third classifier bug and the shop-cart open lead (2026-07-03)

`RuleClassifier` now evaluates deterministic path rules before text-signal rules: `-c0p{id}.html` → PDP (0.95), `shop-cart.html`/`/cart`/`/cesta` → Cart (0.9), wishlist paths unchanged. The Checkout rule additionally requires a path hint (`/checkout|order|pago|payment/i`) besides the text signal — the text regex alone matches ordinary PDP/help boilerplate ("Envíos y devoluciones"), which is exactly how 16 real PDPs became `Checkout` (§10). The path-hint list is a best guess to confirm against the real DES checkout URL when one is first reached (D15).

**Root-cause detail confirmed during design (2026-07-03):** comparing a correctly-classified PDP against a mislabeled one in the committed map showed near-identical elements — the PDP rule's `hasSizeSelector` fired on the lucky two only because "talla" happened to appear in their `textSummary` (hydration timing), while `hasCheckoutSteps` fires on every PDP. Two adjacent bugs in the same family: the old Cart path regex (`/\/cart|\/cesta/`) never matched the real DES cart path `shop-cart.html`, and `shopping-guide.html` classified Checkout from help text alone.

**Live validation:** full re-crawl (80 pages/session, both sessions, settle wait active): <N> pages, all `-c0p` pages → `PDP`, `shop-cart` → `Cart`, `shopping-guide` → `Other`, zero `Checkout` pages (none genuinely reachable by link-following), no label regressions in the old-vs-new map diff. `pnpm test` 4/4 + `pnpm plan --update`: <N>/<N> flows covered; the 16 fake `Checkout` flows are gone from the planner's ranking (D15 relevance).

**Still true:** the map has no real checkout pages — the Checkout path-hint list is unvalidated against a real DES checkout URL until D15 work reaches one.
```

Also: update the header **Status:** line (add a clause: "the Checkout/PDP classifier gap (§10) is closed (§13, B13)") and edit §10's open-lead sentence about `/es/shop-cart.html` to point at §13 as resolved.

- [ ] **Step 2: Backlog — close B13, refresh resume section**

In `docs/roadmap/2026-07-02-backlog.md`: retitle B13 to `### B13. PDP pages misclassified as Checkout at full crawl scope — **done (2026-07-03)**`, replace its body with a short "Shipped:" summary (path rules before signal rules; Checkout requires path hint; live-validated re-crawl with zero Checkout labels; findings §13), and update the "Where a fresh session resumes" section: B13 done; remaining candidates B14 (narrow) and M8.

- [ ] **Step 3: Roadmap — resume section + milestone row**

In `docs/roadmap/2026-07-02-platform-roadmap.md`: update "Where a fresh session resumes" (B13 done, next candidates B14/M8, confirm with Jorge first) and append an **M8 (o siguiente) candidato** note only if absent; add a milestone table row:

```markdown
| **M7b** ✅ | B13 classifier fix: deterministic path rules (PDP `-c0p{id}.html`, Cart `shop-cart.html`) before text signals; Checkout requires a path hint. Live-validated 2026-07-03: full re-crawl, all `-c0p` → PDP, zero fake Checkout labels, planner ranking decontaminated | Phase 2 knowledge quality | Knowledge |
```

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/notes/2026-06-17-des-live-validation-findings.md docs/roadmap/2026-07-02-backlog.md docs/roadmap/2026-07-02-platform-roadmap.md
git commit -m @'
docs(explorer): B13 closure - findings s13, backlog and roadmap updates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016aFvKBriBjSQ8iKfFwMuGo
'@
```
