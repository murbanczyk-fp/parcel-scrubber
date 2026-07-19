<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Parcel Email Expandable Rows

- **Plan**: `context/changes/parcel-email-expandable-rows/plan.md`
- **Mode**: Deep
- **Date**: 2026-07-19
- **Verdict**: SOUND (after triage fixes; was REVISE)
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → PASS after F1 fix |
| Plan Completeness | WARNING → PASS after F2/F3 fixes |

## Grounding

15/15 paths ✓, symbols ✓ (`mapParcelToDto`, `createLedgerEntry`, `FetchedGmailMessage`, GmailMessage/ParcelEmail schema), brief↔plan ✓

## Findings

### F1 — Bad-date skip already has FetchedGmailMessage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Sync ledger writes
- **Detail**: Plan said the bad-date skip path "may lack a usable message" and that null subject/from is acceptable. Code always fetches first; only the date header fails. Subject/from are available at all three `createLedgerEntry` call sites.
- **Fix**: Correct Phase 1 so all three callers pass subject/from; drop the "may lack a usable message" caveat.
- **Decision**: Fixed via Fix in plan

### F2 — Success-path create needs explicit subject/from threading

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Sync ledger writes / upsertParcelFromExtraction
- **Detail**: Contract only mentioned extending `createLedgerEntry`. Success create in `upsertParcelFromExtraction` today receives only `gmailMessageId` + `internalDate`. Missing that thread leaves linked parcels without subject/from.
- **Fix A ⭐ Recommended**: Explicitly require threading subject/from (or the whole `FetchedGmailMessage`) into `upsertParcelFromExtraction` as well as `createLedgerEntry`.
  - Strength: Matches the two real create sites; hard to miss in implement.
  - Tradeoff: Slightly longer Phase 1 wording.
  - Confidence: HIGH — verified against sync.service.ts create sites.
  - Blind spot: None significant.
- **Fix B**: Shared private helper both paths use for `gmailMessage.create` payloads.
  - Strength: One write shape; less drift between success and ledger.
  - Tradeoff: Small refactor beyond the minimal two-site edit.
  - Confidence: MEDIUM — works, but more than this slice needs.
  - Blind spot: Spec expectations may need one shared fixture helper.
- **Decision**: Fixed via Fix A

### F3 — dataKey already set; create maps bare create result

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2–3
- **Detail**: Active/Archive already have `dataKey="id"` and `TableModule`. `createForUser` returns the Prisma create result (no include); mapper must treat missing `messages` as `[]`.
- **Fix**: One-liners in Phase 2/3: reuse existing `dataKey`; mapper coerces undefined `messages` → `[]`.
- **Decision**: Fixed via Fix in plan
