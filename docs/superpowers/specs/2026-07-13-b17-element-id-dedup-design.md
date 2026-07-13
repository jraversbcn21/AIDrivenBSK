# B17 — Deduplicate MapElement.id (design)

**Date:** 2026-07-13
**Model:** Claude Opus 4.8 (spec/design phase — CLAUDE.md "Model routing policy")
**Backlog:** `docs/roadmap/2026-07-02-backlog.md` §B, item B17 (= audit finding F1, plus F7's B16-uniqueness residual folded in per Jorge's decision below).
**Status:** Design, pending Jorge's review. Implementation runs on Claude Sonnet 5.
**Baseline:** `master` @ `16c5462` (F18 merged). Canonical map: `coverage/functional-map.json`, schema 1.6, 155 pages / 155 flows.

---

## 1. Problem

`explorer/map/builder.ts:56`'s element-id generation, `makeId('elem', pageId, el.role, el.label, el.type)`, has no occurrence discriminator, and both extraction paths (`analyzeAria.ts`, `analyze.ts`) push every matching element without dedup. Measured against the committed map (2026-07-06 audit): **830 duplicate ids, 1,968 excess element rows — 32% of the 6,116-element table redundant.** Worst offenders are per-card grid buttons repeated 20-27× on a single PLP page. **127 of the duplicate instances are not byte-identical** to their first occurrence — 78 diverge in `selectorHints.testId`, 49 in `component` — so a consumer resolving "the element with this id" can silently get the wrong instance.

**Consequences, confirmed by reading the actual consumers:**
1. **Silent data loss on lookup.** `builder/select.ts:179,206`'s `.find()` for interaction triggers/revealed elements is documented first-match-tolerant ("the canonical map has duplicate element ids... recorded as a finding") — with 127 divergent duplicates, first-match can return an instance whose hints don't match the element that actually produced the interaction.
2. **The differ is blind to duplicate-count changes.** `explorer/diff/differ.ts`'s `diffCollection` keys `Map`s by id (line 13-14) — duplicates collapse to the last instance, so a page going from 27 to 24 identical buttons produces no diff signal.
3. **Duplicates burn the 60-element extraction cap** (`analyzeAria.ts:7,65`) — confirmed the cap check happens *after* every match is pushed, so repeated elements consume slots before any unique content later in the page's tree is reached (8/155 pages saturate the cap per the audit).
4. **`builder/select.ts:73-81`'s B16 testId-uniqueness check (`loadedSignalFor`) undercounts** — it counts *rows* sharing a testId value, but rows are already an artifact of the duplication bug, not real DOM occurrence counts; genuinely non-unique testIds can pass the `=== 1` check by accident of extraction-cap timing (audit finding F7, folded into this spec per §2 below).

## 2. Decision

**Full fix, both mechanisms combined** (chosen over "cheap" id-suffixing alone, which the audit's own comparison shows leaves map bloat, cap-crowding, and differ-blindness unaddressed):

**(A) Extraction-time content dedup.** Both `explorer/extract/analyzeAria.ts` and `explorer/extract/analyze.ts` (kept in sync per the F6 precedent of parallel extraction paths) deduplicate elements **by full content equality** — `type` + `label` + `role` + `destructive` + `component` + deep-equal `selectorHints` — as they're collected, before the 60-element cap check. A repeat increments the retained element's new `count` field instead of being pushed as a new row. This runs *before* the cap, so it genuinely frees slots for unique content the cap currently crowds out.

**Equality is strict, not loose** (Jorge's explicit choice over the alternative of merging on role+label+type alone): the 127 instances that genuinely diverge in `selectorHints`/`component` are **not** merged into one row picking an arbitrary winner — each distinct-content group stays its own row, individually addressable, with its own id (via mechanism B). Nothing is silently discarded; only true repeats collapse.

**(B) Occurrence-discriminated ids in `buildMap`.** Because `makeId('elem', pageId, el.role, el.label, el.type)`'s hash never includes `selectorHints`/`component`, two post-dedup rows that still share `(pageId, role, label, type)` — the residual genuinely-divergent cases — would still collide. `buildMap` tracks a counter keyed by `${pageId}:${role}:${label}:${type}` while iterating `ex.elements` (and separately while iterating each interaction's `revealedElements`, scoped under `interactionId` the same way it is today) and folds the current count into `makeId(...)`'s hash. After (A), the vast majority of elements have a single occurrence (index 0, no visible behavior change beyond the id value itself); the discriminator only produces distinct values for the residual divergent groups.

**(C) F7 folded in** (Jorge's explicit choice, since the audit called it "free" once `count` exists): `builder/select.ts`'s testId-uniqueness check in `loadedSignalFor` (the B16 guard) changes from counting matching *rows* to summing their `count` field — this makes the uniqueness check exact relative to what was actually extracted (still bounded by the 60-element cap itself, which (A) shrinks pressure on but does not remove as a ceiling — that's a separate, not-reopened concern).

## 3. Scope

**Files:**
- `explorer/types.ts` — `ExtractedElement.count?: number` (present only when >1).
- `explorer/extract/analyzeAria.ts` — dedup-before-cap logic in the element-push path.
- `explorer/extract/analyze.ts` — same dedup logic in `pushEl`, for parity (F6 precedent).
- `explorer/map/schema.ts` — `MapElement.count?: number`; `SCHEMA_VERSION` `'1.6' → '1.7'`.
- `explorer/map/builder.ts` — occurrence-counter-fed `makeId(...)` calls for both the passive-element loop and the revealed-element loop; `count` passthrough (copied 1:1 from `ExtractedElement.count`, no recomputation).
- `builder/select.ts` — `loadedSignalFor`'s testId-occurrence tally sums `count` instead of counting matched rows.

**Out of scope, deliberately:**
- `explorer/extract/enrichTestIds.ts` is **not** touched — the reason 78 elements diverge in `testId` (the 40-probe cap + `.first()` resolution) is unchanged; B17 only guarantees those divergent instances no longer collide on id.
- `explorer/diff/differ.ts` — **no code change**. Once ids are unique, `diffCollection`'s existing id-keyed `Map`s work correctly on their own; a changed `count` on an otherwise-identical element will surface as `changed` for free.
- No migration code for the schema bump — the map is regenerated by a live re-crawl, same precedent as every prior schema-affecting change (B14, B15, F18).

## 4. Testing

**Unit — extraction dedup** (`analyzeAria.unit.test.ts`, `analyze.unit.test.ts`):
- Two elements with fully identical content collapse into one `ExtractedElement` with `count: 2`.
- Two elements sharing `role`/`label`/`type` but differing in `selectorHints.testId` (or `component`) remain **two separate rows**, neither carrying a `count` (both are singletons).
- Cap-freeing: construct a page with more matching nodes than `MAX_ELEMENTS_PER_PAGE` where most are exact repeats of one element plus a handful of genuinely unique ones near the end of iteration order; assert the unique ones survive extraction after dedup (would have been truncated away without it).

**Unit — `buildMap`** (`builder.unit.test.ts`):
- Two extracted elements on the same page sharing `role`/`label`/`type` but differing in content (the post-dedup residual case) produce **distinct** `MapElement.id`s.
- `MapElement.count` is copied through unchanged from `ExtractedElement.count` (present only when the source had one).
- The existing "fully deterministic" test (`expect(a).toEqual(b)` for two builds of identical input) continues to pass — iteration order is already deterministic, so the occurrence counter is too.
- Same discriminator behavior extended to `revealedElements` (interaction-revealed elements), scoped under `interactionId` as today.

**Unit — B16/F7 exactness** (`builder/select.unit.test.ts`):
- A single deduplicated row with `count: 38` for a given testId value correctly fails the `loadedSignalFor` uniqueness check (previously a row-count of 1 would have wrongly passed).
- A genuinely-unique testId (`count` absent, i.e. 1) still passes, unchanged.

**Live re-validation (⚠ mandatory, same precedent as F18):**
1. Full re-crawl, both sessions (`pnpm explore --update`).
2. Guardrail: `elements.length === new Set(elements.map(e => e.id)).size` — **zero duplicate ids**, checked directly against the committed map.
3. Guardrail: element-row count measurably lower than the pre-fix baseline (expect a meaningful fraction of the ~1,968 excess rows to have collapsed — exact number will vary with normal crawl-to-crawl variability, so the check is directional, not an exact-match assertion).
4. `pnpm test` → `pnpm plan --update` — confirm F18's restored coverage does **not** regress (coverage matching doesn't touch elements, so this is a pure no-regression check, not a new success criterion for B17).
5. `pnpm build-tests --top N` + `pnpm test:generated` — no regression; specifically re-confirm the historical B16 case (`falda-mini-flecos-...`, a repeated `productItemWishlist` testId) still resolves correctly under the new exact-count check.
6. `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` — green.

## 5. Success criteria

- Zero duplicate `MapElement.id` values in the re-crawled canonical map.
- Element-row count reduced from the ~6,116-row baseline (directional, not exact-number).
- No regression in F18's coverage restoration, generated-spec suite, or any existing test.

## 6. Risks

- **Crawl-to-crawl variability** (well-documented in this project) means the *exact* duplicate/row counts won't reproduce the audit's original 830/1,968 figures — validation checks the structural property (zero collisions), not a specific historical number.
- **Occurrence-discriminated ids reshape every element id in the map wholesale** — a one-time diff-baseline reset, consistent with every prior schema-affecting change in this project (B14, B15, F18). Any external artifact referencing today's element ids (there are none known outside the map/builder/planner pipeline itself) would need regenerating, but none is known to exist.
