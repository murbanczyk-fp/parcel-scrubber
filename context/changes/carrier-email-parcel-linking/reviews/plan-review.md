<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Carrier Email Parcel Linking

- **Plan**: context/changes/carrier-email-parcel-linking/plan.md
- **Mode**: Deep
- **Date**: 2026-07-19
- **Verdict**: REVISE → SOUND (after triage fixes)
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → addressed |
| Plan Completeness | WARNING → addressed |

## Grounding

Grounding: 8/8 paths ✓, symbols ✓ (detectStoreFromSender / upsertParcelFromExtraction / parcelFieldsChanged / resolveTrackingUrl / CUSTOM default), brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Merge omits clear of customCarrierLabel on CUSTOM→known

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details — Carrier “empty” for merge / Phase 1
- **Detail**: Plan upgraded CUSTOM→known carrier but did not clear customCarrierLabel. Manual PATCH already clears the label when leaving CUSTOM.
- **Fix A ⭐ Recommended**: Document merge rule — when merged carrier is non-CUSTOM, always persist customCarrierLabel: null (mirror manual update).
  - Strength: Matches parcels.service; consistent rows.
  - Tradeoff: Slightly more merge-helper unit cases.
  - Confidence: HIGH — clear-on-upgrade already shipped in CRUD.
  - Blind spot: None significant.
- **Fix B**: Leave label uncleared; rely on UI ignoring it when carrier ≠ CUSTOM.
  - Strength: Smaller helper.
  - Tradeoff: Inconsistent DB vs manual path.
  - Confidence: MED.
  - Blind spot: Whether any UI surfaces custom label for non-CUSTOM.
- **Decision**: FIXED via Fix A

### F2 — Tracking + CUSTOM without label → permanent failed, not skip

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Desired End State / Phase 2–3 success criteria
- **Detail**: After merchant gate removal, tracking + CUSTOM without customCarrierLabel throws ExtractionError → ledger + failed (never retries). Plan only covered no-tracking → skip.
- **Fix A ⭐ Recommended**: Document ExtractionError → failed; add Phase 3 unit case; keep validation as-is.
  - Strength: Honest ops behavior; tiny delta.
  - Tradeoff: Some carrier mail still needs ledger cleanup to retry.
  - Confidence: HIGH — matches current sync.service error handling.
  - Blind spot: How often real carrier mail hits CUSTOM-without-label.
- **Fix B**: Soften validation/extraction for carrier senders.
  - Strength: More first-try imports.
  - Tradeoff: Expands S-06 into extraction contract changes.
  - Confidence: LOW.
  - Blind spot: Downstream CUSTOM-without-label invariants.
- **Decision**: FIXED via Fix A

### F3 — Null-store parcels still require store to save in the form

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing / Manual Verification
- **Detail**: List shows store ?? '—', but parcel form keeps Validators.required on store. Manual QA that edits a carrier-created parcel must fill store before save.
- **Fix**: Add note under Manual Verification / out-of-scope that edit-form still requires store (UI out of scope).
- **Decision**: FIXED

### F4 — Extraction prompt still merchant-framed (accepted out of scope)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — No ExtractionService changes
- **Detail**: extraction-prompt.ts still Allegro/AliExpress-centric; may bias carrier-mail quality without blocking S-06.
- **Fix**: One-liner in Open Risks / Phase 2: prompt bias accepted; revisit if carrier extraction quality is poor in manual QA.
- **Decision**: FIXED
