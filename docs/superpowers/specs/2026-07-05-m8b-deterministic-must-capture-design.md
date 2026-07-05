# M8b — Deterministic Must-Capture Interactions (Design)

**Date:** 2026-07-05
**Status:** Approved design, pending implementation plan
**Predecessors:** `2026-07-05-m8-interaction-aware-crawl-design.md` (the mechanism this hardens), findings doc §15 (the gap this closes), M8 final review Recommendations (the two minor findings this absorbs).
**Milestone:** M8b — prerequisite for M9 (Builder interaction-spec generation).

---

## 1. Problem

M8 proved the interaction-discovery mechanism live ("Añadir a la cesta" → Tallas dialog, captured twice across three crawls) but **the committed canonical map contains zero such captures** — the crawl chosen for the canonical artifact happened to be the run where it didn't land. M9 cannot consume knowledge the canonical map doesn't have.

Root cause of the nondeterminism (confirmed by code inspection, not the dedupe ledger as first suspected): `selectCandidates` picks the **first `maxPerPage` (3) eligible candidates per page in extraction order**. Whether an "Añadir a la cesta {product}" button lands in that top-3 depends on which elements precede it and what the ledger has already claimed — both vary with crawl discovery order. The ledger never blocks these buttons (each label embeds a product name, so every one is a distinct key); they simply lose the top-3 race on some runs.

Two adjacent minor findings from M8's final review live in the same code and are absorbed here:

- **(a)** the chrome dedupe is per-*session*, not per-*crawl-global* as M8's design spec states (`crawlSession` creates its own `InteractionLedger`, and the CLI runs two sessions).
- **(b)** `routePattern` doesn't collapse distinct category PLPs (`/es/mujer/ropa/camisetas-n4365.html` vs `...vestidos-n...html` are distinct scopes), so identical per-card candidates are re-claimed and re-clicked on every category page — per-crawl interaction cost is ~10x the design's original estimate (M8's 172–181 `none` outcomes are mostly this repetition).

## 2. Goals / non-goals

**Goals:**

1. Any crawl that visits **any** page carrying an "Añadir a la cesta" button (Cart related-products carousel, PLP quick-add, PDP) deterministically captures the Tallas-dialog interaction in its output map.
2. The canonical map (`coverage/functional-map.json`) is regenerated and committed containing ≥1 such interaction with its `revealedBy` elements — the literal M9 prerequisite.
3. Chrome triggers are deduped once per crawl (fix a).
4. Category-PLP candidates are deduped across all category PLPs (fix b), returning per-crawl interaction cost to the intended order of magnitude.

**Non-goals:**

- No schema change — `interactions[]`/`revealedBy` shapes are untouched; the map stays schema 1.5. This milestone changes *what gets captured*, not *how it is represented*.
- No new interaction outcomes, no changes to the act→verify→retry protocol in `discoverInteractions`.
- Not chasing the header nav-menu ("Categorías y productos") capture gap noted in §15 — the mechanism built here (a config list) makes adding such a pattern later a one-line config change, but validating it is out of scope.
- Not fixing PDP discovery (crawl-order variability, §9/§12/§13) — the guarantee deliberately doesn't depend on reaching a PDP.

## 3. Design

### 3.1 Must-capture patterns: one config, two roles

New config option `interactions.mustCapture: RegExp[]`, default `[/^añadir a la cesta/i]`. Env override `EXPLORER_MUST_CAPTURE` (optional): semicolon-separated regex sources, compiled case-insensitive (semicolon, not comma or pipe, to avoid colliding with regex syntax). When set, it **replaces** the default list (standard defaults+env-override semantics of `loadExplorerConfig`); an empty string disables must-capture entirely.

Each pattern plays two roles:

1. **Label equivalence class.** `labelClass(label, patterns)` returns the source of the first matching pattern as the canonical class; non-matching labels return the label itself. The ledger key becomes `scope|role|labelClass(label)` — "Añadir a la cesta Short denim mini" and "Añadir a la cesta Vestido corsé" collapse into one class.
2. **Priority trigger.** In `selectCandidates`, candidates whose class is an **unsatisfied** must-capture class are picked first (pass 1), before ordinary candidates (pass 2). Both passes count within `maxPerPage`, so per-page cost doesn't grow. At most one candidate per must-capture class per page.

Must-capture candidates keep the existing safety gates: `CLICKABLE_TYPES` only, never `destructive`.

### 3.2 Satisfaction bookkeeping (the determinism guarantee)

A must-capture candidate does **not** use the ordinary claim: its class is retried (once per page, with priority) until the class yields an `overlay` outcome on any page of the crawl; from then on it is globally satisfied and never picked again. This is what makes the guarantee real: a hydration-lost click (`none` outcome) on one page doesn't burn the class — it retries on the next page carrying the trigger. Worst case cost: one click per visited page per unsatisfied pattern, bounded and small.

Mechanics: `InteractionLedger` is constructed with the patterns and gains `isSatisfied(class)` / `markSatisfied(class)`. After `discoverInteractions` returns, `crawlSession` marks satisfied every must-capture class whose result outcome is `overlay`. (`navigated` and `none` do not satisfy — only an overlay capture is the knowledge M9 needs.)

If any pattern ends the crawl unsatisfied, the CLI emits an explicit `console.warn` naming it — observability, not a failure (a hard failure would block map updates on ordinary DES flakiness).

### 3.3 `interactionScope(path)` — PLP collapse, ledger-only (fix b)

New function used **only** by the ledger — the global `routePattern` feeds the map schema and the differ and is not touched (changing it would silently rewrite `routePattern` fields across the committed map and pollute diffs). `interactionScope` applies `routePattern`, then collapses any path ending in `-n{digits}.html` (DES category-PLP pattern) into the single shared scope `-n{id}.html`. Ordinary candidates on category PLPs are thereby claimed once per crawl instead of once per category. Lives next to the ledger in `explorer/crawl/interact.ts` (not `explorer/url.ts`, which holds map-semantics URL logic).

### 3.4 Per-crawl-global ledger (fix a)

`InteractionLedger` is no longer created inside `crawlSession` — it is created once in `explorer/cli.ts` and passed in via `CrawlDeps`. Both sessions (anon + auth) share it: chrome is clicked once per crawl, matching M8's design-spec intent, and must-capture satisfaction is shared across sessions (correct — the Tallas knowledge doesn't need capturing twice).

## 4. Files touched

- `explorer/config.ts` — `interactions.mustCapture` + `EXPLORER_MUST_CAPTURE` parsing/validation.
- `explorer/crawl/interact.ts` — `labelClass`, `interactionScope`, ledger constructor/`isSatisfied`/`markSatisfied`, two-pass `selectCandidates`.
- `explorer/crawl/crawler.ts` — ledger from `CrawlDeps`; post-`discoverInteractions` satisfaction marking.
- `explorer/cli.ts` — ledger construction, end-of-crawl unsatisfied-pattern warning.
- `.env.example`, README Explorer section — document the new variable.
- Unit tests alongside each touched module.

No changes to `src/`, `tests/`, `planner/`, `builder/`, or the map schema.

## 5. Testing

**Unit (Vitest, offline, existing fake-driver patterns):**

- `labelClass`: matching label → pattern class; non-matching → identity; first-match-wins with multiple patterns.
- `selectCandidates`: unsatisfied must-capture class beats ordinary candidates regardless of element order; satisfied class is not picked; one candidate per class per page; `maxPerPage` still respected; destructive/non-clickable must-capture matches are still excluded.
- Satisfaction: `none`/`navigated` outcomes leave the class retryable on a later page; `overlay` satisfies it globally.
- `interactionScope`: `-n{digits}.html` paths collapse to one scope; PDP/`-c0p` and other paths keep `routePattern` behavior.
- Shared ledger: chrome claimed in session A is not re-claimed in session B.
- Config: `EXPLORER_MUST_CAPTURE` parsing (defaults, semicolons, invalid regex fails fast).

**Live validation (in order):**

1. Bounded probe crawl (~20 pages/session) — must capture ≥1 "Añadir a la cesta" → Tallas `overlay` interaction. If it doesn't, the mechanism is wrong: investigate before spending a full crawl.
2. Full re-crawl via `pnpm explore --update` → **milestone success criterion: the committed `coverage/functional-map.json` contains ≥1 "Añadir a la cesta" interaction with outcome `overlay` and `revealedBy`-tagged Talla elements.**
3. Standard closure: `pnpm test` 4/4, `pnpm plan --update`, `pnpm build-tests --top 3` + `pnpm test:generated` (no regression — generated specs must keep excluding revealed elements), `pnpm typecheck`/`lint`/`test:unit`.
4. Docs: findings doc §16, roadmap/backlog/CLAUDE.md resume-pointer updates.

## 6. Risks and honest limits

- **The guarantee is conditional:** "if the crawl visits a page carrying the trigger, it captures it." A crawl that visits *no* page with an "Añadir a la cesta" button has nothing to capture. Improbable in practice (the Cart is always reached from the header on every page, and PLPs dominate every observed crawl: 75–84 of ~105 pages), and the CLI warning makes the condition visible when it happens.
- **Interaction cost shifts, slightly:** pass-1 clicks add up to one click per page while a pattern is unsatisfied (typically satisfied within the first few pages), while fix (b) removes the ~10x PLP repetition — net cost goes down substantially.
- **Shared ledger across sessions** means the auth session no longer re-probes chrome the anon session already claimed. That is the M8 design's stated intent, but it does mean auth-only chrome behavior differences would go unobserved — accepted; nothing today consumes per-session chrome interactions.
- The `-n{digits}.html` category-PLP pattern is asserted from observed DES URLs (consistent across all committed crawls); if DES ships category routes outside this shape, they simply keep per-route scoping (safe degradation, no capture loss).
