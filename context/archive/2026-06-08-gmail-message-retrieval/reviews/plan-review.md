<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Gmail Message Retrieval Implementation Plan

- **Plan**: context/changes/gmail-message-retrieval/plan.md
- **Mode**: Deep
- **Date**: 2026-06-08
- **Verdict**: REVISE → SOUND (after triage fixes)
- **Findings**: 2 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL → PASS (after F1) |
| Lean Execution | PASS |
| Architectural Fitness | WARNING → PASS (after F2) |
| Blind Spots | WARNING → PASS (after F3, F5) |
| Plan Completeness | WARNING → PASS (after F4, F6) |

## Grounding

Grounding: 6/6 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — messages.list does not support format/metadataHeaders

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — GmailService.listMetadata; Performance Considerations
- **Detail**: Gmail API users.messages.list returns only id and threadId. format and metadataHeaders exist on messages.get only.
- **Decision**: FIXED — User chose IDs-only listing: rename route to `/api/test/matching-email-ids`, service returns `string[]` of Gmail message ids; no per-message metadata fetch.

### F2 — SettingsModule does not export SettingsService

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 4 — GmailModule imports SettingsModule
- **Detail**: settings.module.ts has no exports array; Nest DI fails for GmailTestController.
- **Fix**: Add exports: [SettingsService] to settings.module.ts in Phase 4.
- **Decision**: FIXED

### F3 — Performance section assumes metadata on messages.list

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Performance Considerations
- **Detail**: Incorrect claim about format: 'metadata' on list.
- **Fix**: Rewrite for paginated messages.list only; body via messages.get format=full on demand.
- **Decision**: FIXED

### F4 — Test controller omits @CurrentUser() and query validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — GmailTestController contract
- **Detail**: Existing controllers use @CurrentUser(); no ValidationPipe in API.
- **Fix**: Specify @CurrentUser() SessionUser; BadRequestException for missing/invalid query params.
- **Decision**: FIXED

### F5 — Test routes ship in all environments

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4
- **Detail**: Brief flags test route leakage; routes are JWT-protected but register in prod.
- **Fix A ⭐ Recommended**: Register GmailTestController only when NODE_ENV !== 'production'.
- **Decision**: FIXED via Fix A

### F6 — invalid_grant detection mechanism underspecified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — OAuth client factory
- **Detail**: Plan vague on Gaxios error shape for invalid_grant.
- **Fix**: Document response?.data?.error === 'invalid_grant' check before clearing token.
- **Decision**: FIXED
