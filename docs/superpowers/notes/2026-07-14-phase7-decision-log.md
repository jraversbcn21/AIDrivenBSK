# Phase 7 — Decision Log (Selector Healing Agent)

**Date:** 2026-07-14
**Mode:** autonomous execution mirroring the Phase 6 pattern (Jorge: "arrancamos con estos tres defaults"), every non-trivial decision recorded with question / choice / reason / discarded alternatives.
**Companion design:** `docs/superpowers/specs/2026-07-14-phase7-selector-healing-design.md`
**Model:** full cycle on Fable 5 (the neutralized routing policy, CLAUDE.md 2026-07-14 — in force until Phase 9 completes).

---

## D1. Scope set interactively with Jorge, not by /goal

- **Question:** Phase 6 ran under a formal /goal; Phase 7 starts from Jorge's explicit "arrancamos" after a 3-question scope Q&A. Is that a sufficient brainstorm/approval gate?
- **Chosen:** yes — the Q&A (propose-vs-apply, reactive-vs-proactive, live validation) *was* the scope brainstorm, and his confirmation of the three defaults is the design approval for exactly those boundaries. Everything else follows repo-consistency, logged here.
- **Reason:** the three questions were chosen because they are the only decisions that change what gets built; Jorge answered all three explicitly.
- **Discarded:** re-asking via a formal questionnaire — re-litigates decisions already made.

## D2. New top-level `healer/`, importing src + explorer + analyzer

- **Question:** where does the healing agent live and what may it import?
- **Chosen:** new top-level `healer/` (sixth agent directory), importing `Strategy`/`locate`/`TestIdHint`/`TESTID_ATTRS` from `src/support/locators.ts`, the map schema from `explorer/`, and `FailureReport` types from `analyzer/types`. Chain: `src ← explorer ← analyzer ← healer`; nothing imports `healer/`.
- **Reason:** one-dir-per-agent is the repo's architecture (audit §1.1); `src/support/locators.ts` is the *designed* healing seam (roadmap §2 names it verbatim); consuming `analyzer`'s output type keeps producer/consumer vocabulary shared (the M7 lesson).
- **Discarded:** folding into `analyzer/` — healing *consumes* analysis but is its own Phase-7 agent with its own lifecycle; duplicating the FailureReport type — exactly the drift the shared-vocabulary rule exists to prevent.

## D3. Live validation probes the proposed locator, not a spec re-run

- **Question:** the conversationally-approved wording was "se verifica ejecutando el spec afectado contra DES". With propose-don't-apply, the spec on disk still contains the broken selector — re-running it can never validate the *fix*. What does "mandatory live validation" concretely mean?
- **Chosen:** probe the **proposed Strategy** live: navigate to the candidate's page (consent + tour suppression + settle, the crawler's exact pattern), resolve via the framework's own `locate()`, require `count() === 1` + visible. The full spec re-run is the human's acceptance step *after applying* a confirmed proposal. Stated plainly in design §2 rather than silently reinterpreted.
- **Reason:** it is the strongest validation that is logically possible pre-application, and it uses the very resolver (`locate()`) the healed spec would use — if the probe passes, the applied fix resolves identically.
- **Discarded:** (a) applying to a temp worktree and re-running the spec — contradicts propose-don't-apply's risk posture in v1 and triples the machinery; (b) validating with raw Playwright locators instead of `locate()` — would validate something other than what the framework will actually run.

## D4. Broken-locator identity comes from error-message parsing

- **Question:** the failure report doesn't carry the broken selector as structured data — it lives only inside Playwright's error message. Parse it, or extend Phase 6's schema to capture it?
- **Chosen:** parse it in `healer/parse.ts` from the message shapes Playwright actually emits (action-timeout "waiting for …", strict-mode "resolved to N elements"), all grounded in messages this project has really seen (A6 §19, M9 §17, M8b §16, F18 §20). Unparseable ⇒ explicit `unparseable` proposal status, never a guess.
- **Reason:** keeps Phase 6's contract untouched (it shipped yesterday; widening it now would churn a just-validated schema) and the shapes are few and stable. If parsing proves brittle later, enriching `FailureAttempt` with structured locator data is the natural v2 — noted, not done.
- **Discarded:** schema extension now — modifies a freshly-closed milestone for a consumer that can self-serve; scraping Playwright traces — far heavier input for the same string.

## D5. Candidate scope: flowsAffected pages first, map-wide fallback

- **Question:** where to search for replacement candidates?
- **Chosen:** all step-pages of the failure's `flowsAffected` flows (the broken interaction can be mid-journey, not just at the leaf); if zero candidates, fall back to the whole map with the proposal flagged `scope: 'map-wide'`.
- **Reason:** flowsAffected is the linkage Phase 6 built exactly for this; map-wide fallback keeps a spec that isn't coveredBy-linked (e.g. a generated draft) healable, honestly flagged as lower-confidence.
- **Discarded:** leaf-page-only (A6's broken button lived on `/es/logon.html`, a mid-chain page — leaf-only would have missed it); URL-trail-based scoping via route-evidence (a second input file for marginal precision gain — v2 if needed).

## D6. Ranking signals and penalties

- **Question:** how are candidates ordered?
- **Chosen:** label/name similarity (exact, diacritic/case-insensitive > containment > token overlap; regex names tested against labels when compilable) → role agreement → penalties for shared chrome (`component`, B14) and `revealedBy` overlay elements (M8). Proposed `Strategy` built from the candidate's `selectorHints` in the framework's testId → role → label priority (the Builder's own conversion, same rationale). For strict-mode testId breaks, page-unique alternatives (via B17's `count`) outrank same-value relocations.
- **Reason:** every signal reuses an existing, live-validated map field with a documented lesson behind it — nothing invented.
- **Discarded:** embedding/LLM similarity — rules-first doctrine, and label matching on this map is short-string matching, not semantics.

## D7. Overlay (`revealedBy`) candidates are skipped at probe time, not silently failed

- **Question:** a `revealedBy` element is only visible after an interaction — a load-time probe would report `rejected-not-visible` even when the element is a perfectly good fix.
- **Chosen:** verdict `skipped-overlay` (not probed for visibility), surfaced to the human with that context.
- **Reason:** M8/M9's documented lesson (Builder excludes `revealedBy` from loaded-signals for exactly this reason); a false rejection is worse than an honest "needs human eyes".
- **Discarded:** replaying the revealing interaction during the probe — that's the crawler's interaction machinery imported into the healer, way past v1.

## D8. `--no-probe` offline mode exists, but the default is live

- **Question:** must every `pnpm heal` run reach DES?
- **Chosen:** default probes live (the mandatory-validation decision); `--no-probe` emits the same report with all candidates `not-probed` — for environments without DES reach (CI diff boxes, C11 unresolved). A proposal can only be `confirmed` via a real probe.
- **Reason:** mandatory live validation stays the bar for *confirmation*, while the parsing/ranking half remains usable offline (mirrors `EXPLORER_EXTRACTION=dom`'s offline-path precedent).
- **Discarded:** hard-failing without VPN — makes the pure half of the tool hostage to network state.

## D9. Empty selector-drift input exits clean, without writing a report

- **Question:** what does `pnpm heal` do on a green suite (today's actual state)?
- **Chosen:** "nothing to heal" + exit 0, and it does **not** overwrite an existing healing report with an empty one.
- **Reason:** the explorer's empty-map guard and planner's empty-evidence guard — a no-input run must never clobber real prior knowledge.
- **Discarded:** writing an empty report — destroys the last real healing session's output for zero information.

## D10. Live e2e validation case: the real A6 drift, healed retroactively

- **Question:** the current suite is green — no real selector-drift failure exists to demonstrate the pipeline end-to-end. Synthetic toy, or something better?
- **Chosen:** feed the healer a failure-report whose selector-drift record is the **verbatim A6 failure** (the retired `getByRole('button', { name: /continuar con e-?mail/i })` timeout on the login flow, findings §19) and require it to propose a real, currently-valid `/es/logon.html` selector, live-validated against DES. Success criterion: ≥1 `validated` candidate on the login page.
- **Reason:** it is a *genuine historical* selector drift this project actually suffered and fixed by hand — the healer proving it would have found the fix is the strongest honest demonstration available while green.
- **Discarded:** breaking a real spec on purpose to force a live failure — pollutes a validated suite to manufacture what history already provides.

## D11. Minimum proposal score floor (added during live-demo prediction, before running)

- **Question:** predicting the negative control's behavior against the real map (before executing it) showed a footer contact button ("Enviar e-mail Te responderemos…") would score 15 (one shared token + role − chrome) and could get live-confirmed as a "fix" for the login interstitial — a semantically wrong lookalike.
- **Chosen:** `MIN_PROPOSAL_SCORE = 30`: weak-evidence candidates are not proposed at all. A bare role-agreement match (strict-mode healing, exactly 30) stays in.
- **Reason:** a healer that proposes plausible-but-wrong candidates erodes exactly the trust it exists to build; predicted-in-advance false positives get design fixes, not post-hoc rationalization.
- **Discarded:** keeping score>0 and relying on the human to discard noise — the report's value is its signal-to-noise ratio.

## D12. Live-demo iteration: containment/token length floors (1 iteration of the max-8 loop)

- **What the first live run found:** the A6 negative control surfaced 3 noise candidates at score 65 — size buttons labeled "L"/"M" "containment-matched" because the regex literal `/continuar con e-?mail/i` contains those letters; separately, the 3-char Spanish preposition "con" qualified as a shared token.
- **Root cause (not symptom):** (a) containment matching had no minimum length — a 1-char label is "contained" in almost anything; (b) a regex needle that fails to match degraded to substring-matching its raw `/…/i` source text; (c) the token filter (`length > 2`) admitted 3-char Spanish stopwords ("con", "por", "las").
- **Fix:** `MIN_CONTAINMENT_LENGTH = 4` on both sides; unmatched regex needles degrade to token overlap on their word tokens only (never containment on the literal source); token minimum raised to ≥ 4 chars, aligned with the containment floor. Two new unit tests lock the exact live-observed shapes.
- **Re-validated live:** negative control now yields `no-candidates` (correct: A6's real fix was a flow change — removing the click — which is beyond selector healing and belongs to a human); positive case unchanged (`confirmed`).

## Iteration log (max-8 loop)

**Same-failure iterations consumed: 1 of 8** — the live-demo ranking-noise iteration described in D12 (root-caused, fixed, re-validated live in one pass). All unit modules passed on their first run (parse 9/9, candidates 8/8 then extended, verdict 6/6, args 3/3).

## Verification results (2026-07-14)

- `pnpm test:unit` — **327/327** (297 pre-existing + 30 healer tests). Zero pre-existing tests modified.
- `pnpm typecheck` / `pnpm lint` — clean.
- **Phases 0–6 e2e regression gate, live against DES:** `pnpm test` — **4/4 PASS, no retries, 3.1m**. Zero regressions.
- **Live end-to-end healing demo (design §8), both cases against real DES:**
  - *Positive case* (wording drift `'Inicia sesión'` → real current button): **`confirmed`** — proposed `{role:{type:'button',name:'Iniciar sesión'}}` @ `/es/logon.html`, live probe: unique + visible. The plausible-but-wrong alternative (`loginIcon` testId on h-woman) was probed and honestly **rejected-not-unique** (resolved to 2 live).
  - *Negative control* (the verbatim A6 historical drift, findings §19): **`no-candidates`** — no hallucinated replacement for a button that no longer exists; the healing report states it plainly for the human. This is correct behavior: A6's true fix was removing a flow step, out of any selector healer's scope.

## Exit-gate status

- Suite completa (fases 0–7) en verde: **met** — 327/327 unit + 4/4 e2e live.
- Decision log revisado por el responsable humano: **met — reviewed and approved by Jorge (2026-07-14, same day: "Documento 7 correcto"). Gate closed; Phase 8 is unblocked.**
