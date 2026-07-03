# TestId Attribute-Provenance Fix Design (M7)

**Date:** 2026-07-03
**Status:** Approved (design)
**Scope:** Milestone M7 — close backlog B15, the `enrichTestIds`/`locate()` testId mismatch that M6b's live validation exposed (findings doc §11). After this fix, a `testId` selector hint carries *which* attribute it came from, `locate()` resolves it with that attribute, and the Builder Engine's M6b workaround (testId excluded from its loaded-signal priority) is reverted. **Selector healing itself (Phase 7) is out of scope** — this fix only makes testId hints trustworthy and records the provenance that agent will later need.

---

## Context

DES carries test-id-like attributes under three names: `data-testid`, `data-qa-anchor` (confirmed live, findings §7), and `data-qa`. The Explorer's extraction records a `selectorHints.testId` from whichever it finds first — without recording which one matched — while `locate()` always resolves via Playwright's `getByTestId()`, which by default only matches `data-testid`. A hint sourced from the other two attributes silently resolves to zero elements. M6b's generated specs demonstrated this live: 3/3 timed out on a `testId`-based `isLoaded()` against pages that had in fact loaded correctly (findings §11); the workaround was to exclude testId from the Builder's own signal selection, leaving all three generated specs asserting on a weak, generic header element (backlog B14).

### Decision locked during brainstorming

**One composite field, breaking type change** (approach A): `testId` becomes `{ attr, value }` everywhere. The alternative (an additive second field beside a legacy `testId: string`) was rejected: the committed map's existing string testIds are exactly the provenance-less data this fix exists to eliminate, the map is regenerated live as part of this milestone anyway, and two near-identical fields would complicate the selector priority permanently for zero real compatibility benefit.

## 1. The type — single source, no cycles

```ts
// src/support/locators.ts (the base layer — explorer/builder already depend on src, never the reverse)
export const TESTID_ATTRS = ['data-testid', 'data-qa-anchor', 'data-qa'] as const;
export type TestIdAttr = (typeof TESTID_ATTRS)[number];
export interface TestIdHint {
  attr: TestIdAttr;
  value: string;
}
```

- `Strategy.testId?: TestIdHint` (was `string`).
- `explorer/types.ts` imports `TestIdHint` from `src/support/locators.ts`; `SelectorHints.testId?: TestIdHint` (was `string`).
- `explorer/extract/enrichTestIds.ts`'s local `TESTID_ATTRS` list is replaced by the shared exported one (same values, same probe order — `data-testid` first).

## 2. Resolution in `locate()`

- `attr === 'data-testid'` → `scope.getByTestId(value)` — behavior unchanged for the genuine case (and stays aligned with any future `testIdAttribute` Playwright config).
- Other attrs → `scope.locator(`[${attr}="${escaped}"]`)`, with `value` escaped for a double-quoted CSS attribute string (backslashes and double quotes). Playwright CSS selectors pierce open shadow roots, so this works identically on DES's `bds-` components.
- `pickStrategyKey` and the testId → role → label → placeholder priority are unchanged.

## 3. Producers

- `explorer/extract/enrichTestIds.ts` (aria/live path): already probes the three attributes in order; now records `{ attr, value }` instead of the bare value.
- `explorer/extract/hints.ts` (dom/offline path): same change for its two attributes (`data-testid`, `data-qa`).

## 4. Schema & map migration

- `SCHEMA_VERSION` `1.2 → 1.3` (shape change inside `MapElement.selectorHints.testId`). `explorer/map/builder.unit.test.ts`'s version assertion updated.
- **No migration code.** The map is regenerated live as part of this milestone; schema-1.2 testId strings are precisely the untrustworthy data being replaced.
- **One legacy tolerance, in exactly one place:** `builder/select.ts` type-guards the hint shape (`typeof hint.testId === 'object'`) and silently ignores string-shaped legacy values, falling through to role/label — running the Builder against a stale 1.2 map degrades gracefully instead of crashing or emitting broken code. No other consumer reads `selectorHints` from JSON.

## 5. Builder: revert the M6b workaround

- `builder/select.ts`: testId restored as priority #1 (testId → role → label). The M6b exclusion comment is removed, replaced by a short pointer to this spec and the legacy-shape guard's rationale.
- `builder/generate/TemplateGenerator.ts`: `strategyLiteral` emits the nested literal — `{ testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } }` — with the existing single-quote escaping applied to both fields. Determinism guarantees unchanged.
- `builder/select.unit.test.ts`'s M6b regression test ("never picks a testId hint") is inverted: a testId hint (object-shaped) must now win the priority again; a NEW test locks the legacy guard (string-shaped testId in a fixture map → ignored, falls through to role/label/null).

## 6. Testing

- **Offline (vitest):**
  - `locate()`: resolves each of the three attrs correctly (getByTestId vs raw attribute locator); CSS escaping for values containing quotes/backslashes.
  - Producers: aria path records the correct `attr` for each of the three attributes (first match wins, probe order preserved); dom path records its two.
  - `select.ts`: testId-first priority restored; destructive exclusion unchanged; legacy string-shaped testId ignored (guard test).
  - `TemplateGenerator`: nested testId literal emitted and escaped; byte-identical determinism test still holds.
  - Schema version assertion bump.
- **DEFERRED-live (VPN):**
  1. Short probe: confirm which attribute `addToCartSizeBtn` actually comes from on a real PDP (expected `data-qa-anchor` per findings §7, but verify — evidence before assumptions).
  2. Full re-crawl `pnpm explore --update` (map becomes schema 1.3, testId hints now carry attrs) + `pnpm plan --update` to re-annotate `coveredBy`.
  3. `pnpm build-tests --top 3`: generated loaded-signals must now be page-specific testIds, not the generic header button — a verifiable partial closure of B14.
  4. `pnpm test:generated`: 3/3 pass as generated.
  5. Full `pnpm test`: the manual suite stays green (`locate()` is shared framework code — verify no regression even though no manual POM builds a testId `Strategy` today).
  6. Docs: findings §12, backlog B15 closed / B14 updated, roadmap M7 ✅.

## 7. Non-goals

- Selector Healing (Phase 7) — this fix records the provenance that agent will need; it does not heal anything.
- Touching classification (B13) or interaction-based discovery (B9).
- Supporting test-id attributes beyond the three confirmed on DES.
- Configuring Playwright's global `testIdAttribute` (DES mixes attributes; a single global can't represent that).

## 8. Risks

- **`locate()` is shared framework code.** No manual page object constructs a testId `Strategy` today (verified by grep), so the type change compiles cleanly across the repo — but the full e2e suite runs live in validation anyway, as the real check.
- **Attribute reality drift:** if the live probe (step 1) finds testId-like values under other attribute names, extend `TESTID_ATTRS` deliberately then — do not pre-add speculative attributes now.
- **Generated-signal quality is only partially fixed:** pages whose elements carry no testId attribute at all still fall back to role/label and can still pick a generic header element (B14 stays open for that subset; the fix is expected to cover the PDP cases that motivated it).
