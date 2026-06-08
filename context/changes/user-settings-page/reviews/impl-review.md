<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: User Settings Page

- **Plan**: context/changes/user-settings-page/plan.md
- **Scope**: All 3 phases (complete)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  3 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Placeholder component files not deleted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/web/src/app/features/settings/settings-placeholder.component.*
- **Detail**: Phase 2 §6 requires deleting all three placeholder files. Files were orphaned dead code at review time.
- **Fix**: Delete settings-placeholder.component.ts, .html, and .scss.
- **Decision**: FIXED — files already absent from disk at triage time

### F2 — Multi-field PATCH upserts lack transaction

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/settings/settings.service.ts:103-113
- **Detail**: Sequential upserts without prisma.$transaction can leave partial settings on DB failure.
- **Fix**: Wrap upsert loop in prisma.$transaction([...]).
  - Strength: Eliminates partial-write risk for multi-key PATCH.
  - Tradeoff: Slightly more complex service code.
  - Confidence: HIGH — standard Prisma pattern.
  - Blind spot: None significant.
- **Decision**: SKIPPED

### F3 — Save failures with no user feedback

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/features/settings/settings-page.component.ts:143-146
- **Detail**: Non-field errors (network, 401/500, empty-body 400) produced no user feedback on save.
- **Fix**: Show generic error toast when applyServerErrors() applies no field errors.
  - Strength: Covers all non-field failure modes; MessageService already injected.
  - Tradeoff: Toast vs inline banner.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED

### F4 — Non-Error throws skip validation silently

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/settings/settings.service.ts:70-74, 90-94
- **Detail**: Catch blocks only handle err instanceof Error.
- **Fix**: Add else branch for non-Error throws.
- **Decision**: SKIPPED

### F5 — PATCH 401 test missing

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/api/src/settings/settings.controller.spec.ts:141-160
- **Detail**: HTTP 401 test covered GET only, not PATCH.
- **Fix**: Add PATCH supertest expecting 401.
- **Decision**: FIXED

### F6 — Web error type requires field but API omits it

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/app/core/settings/settings.types.ts:7-9
- **Detail**: SettingsValidationErrorResponse required field; API returns field-less errors for empty/unknown keys.
- **Fix**: Make field optional in type.
- **Decision**: FIXED
