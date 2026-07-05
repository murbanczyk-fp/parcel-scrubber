<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Manual Add and Edit Parcels

- **Plan**: context/changes/manual-parcel-crud/plan.md
- **Mode**: Deep
- **Date**: 2026-07-05
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 0 critical pending, 0 warnings pending, 0 observations pending (5 fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS (after F2 fix) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS (after F4 fix) |
| Plan Completeness | PASS (after F1, F3, F5 fixes) |

## Grounding

Grounding: 5/5 paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — Phase 4 Progress missing lint criterion

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 Success Criteria vs ## Progress
- **Detail**: Phase 4 Automated Verification lists both lint and test; Progress only had test item 4.1.
- **Fix**: Add lint Progress item; renumber 4.1–4.4 → 4.1–4.5.
- **Decision**: FIXED — renumbered Phase 4 Progress items

### F2 — Edit form cannot detect null URL override from GET response

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 1 (mapParcelToDto) + Phase 3 (edit init)
- **Detail**: `mapParcelToDto` conflates stored override with resolved URL; edit form cannot show empty override field when DB column is null.
- **Fix A ⭐ Recommended**: Add `trackingUrlOverride` to ParcelDto; form binds to raw override.
- **Decision**: FIXED via Fix A — plan updated in Phase 1, 3, and unit test contract

### F3 — RouterLink imports not specified for list components

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Active/Archive list wiring
- **Detail**: List components do not currently import RouterLink.
- **Fix**: Specify RouterLink import in Phase 4 contracts.
- **Decision**: FIXED — Phase 4 contracts updated

### F4 — parseOrderDate timezone convention underspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — ParcelsService parseOrderDate
- **Detail**: Plan did not specify UTC date-only parsing for YYYY-MM-DD.
- **Fix**: Document UTC parsing via `${value}T00:00:00.000Z`.
- **Decision**: FIXED — parseOrderDate contract updated

### F5 — Dual ParcelDto definitions require manual sync

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 + Phase 3 types
- **Detail**: API and web maintain separate ParcelDto types.
- **Fix**: Explicit same-commit sync note in Phase 3.
- **Decision**: FIXED — Phase 3 web types contract updated
