<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Merge Parcels Implementation Plan

- **Plan**: context/changes/merge-parcels/plan.md
- **Mode**: Deep
- **Date**: 2026-07-20
- **Verdict**: REVISE → SOUND (after triage fixes)
- **Findings**: 0 critical  2 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → PASS (F1 fixed) |
| Plan Completeness | WARNING → PASS (F2, F3 fixed) |

## Grounding

Grounding: 10/10 paths ✓, symbols ✓, brief↔plan ✓

## Findings

### F1 — Archive status change skips ParcelStatusEvent ledger

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — ParcelsService.mergeForUser / archive status preference
- **Detail**: Deliver/remove/reactivate write ParcelStatusEvent via transitionStatus. Merge plan applied archive status preference with a plain survivor update and never mentioned events.
- **Fix A ⭐ Recommended**: When merge changes survivor status, create a ParcelStatusEvent in the same transaction (reuse transitionStatus semantics or inline the same write).
  - Strength: Keeps one audit model for all status changes.
  - Tradeoff: Slightly more transaction work; must define from→to for merge.
  - Confidence: HIGH — pattern already exists in the same service.
  - Blind spot: Whether UI/history surfaces events today is unverified.
- **Fix B**: Explicitly document merge does not emit ParcelStatusEvent as intentional out-of-scope.
- **Decision**: FIXED (Fix A)

### F2 — Membership-class consistency promised but unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach vs Phase 1 / Phase 2 contracts
- **Detail**: Approach promised membership class consistency but Phase 1 validation and Phase 2 e2e did not specify mixed active/archived rejection or error shape.
- **Fix**: In Phase 1, reject selections that mix archived (DELIVERED/REMOVED) and non-archived statuses with ParcelValidationError on parcelIds; add a Phase 2 e2e for it.
- **Decision**: FIXED

### F3 — Route-order risk is overstated for current controller

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details — Route registration
- **Detail**: Current :id/action POST routes cannot capture POST …/merge as an id; early registration is hygiene, not required for correctness today.
- **Fix**: Soften the note to register before any bare :id POST; current :id/action routes do not conflict.
- **Decision**: FIXED
