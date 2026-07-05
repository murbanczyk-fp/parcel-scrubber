<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Delivered/Remove Actions and Archive View

- **Plan**: context/changes/deliver-remove-archive/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-06-27
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING (F6 deferred) |

## Findings

### F1 — Cross-archived transition tests missing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: apps/api/src/parcels/parcels.service.spec.ts
- **Detail**: Plan allows REMOVED→DELIVERED with event write; no test asserted cross-archive flip.
- **Fix**: Add service spec for REMOVED → markDelivered with USER event.
- **Decision**: FIXED

### F2 — Concurrent deliver/remove can duplicate status events

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/parcels/parcels.service.ts
- **Detail**: Idempotency check ran outside `$transaction`; parallel POSTs could duplicate events.
- **Fix**: Conditional `updateMany` + event write inside one transaction.
- **Decision**: FIXED (Fix A)

### F3 — Sync reload can fight optimistic parcel removal

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/features/active/active-list.component.ts
- **Detail**: Sync completion reload could re-insert optimistically removed rows.
- **Fix**: `reloadActiveParcelsRespectingInFlight()` excludes in-flight IDs from server reload.
- **Decision**: FIXED

### F4 — Parcel action errors lack auth-specific handling

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/app/features/active/active-list.component.ts
- **Detail**: Generic catch on deliver/remove; no 401/404 branches.
- **Fix**: `handleParcelActionError` — 401 → re-login banner; 404 → no restore.
- **Decision**: FIXED

### F5 — Optimistic rollback uses stale index

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/features/active/active-list.component.ts
- **Detail**: Rollback spliced at stale index after concurrent list changes.
- **Fix**: Refetch `listActive()` on failure; append fallback if refetch fails.
- **Decision**: FIXED

### F6 — Production build budget still fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: apps/web/angular.json
- **Detail**: Pre-existing 1.13 MB vs 1 MB budget; not introduced by S-03.
- **Fix**: Raise budget or trim bundle in follow-up.
- **Decision**: ACCEPTED — defer to separate change

### F7 — Remove idempotency not covered in e2e

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: apps/api/test/parcels.e2e-spec.ts
- **Detail**: Deliver idempotency covered; remove was not.
- **Fix**: E2e for second POST remove with unchanged event count.
- **Decision**: FIXED

### F8 — List filters duplicate archived status literals

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: apps/api/src/parcels/parcels.service.ts
- **Detail**: Filters hardcoded DELIVERED/REMOVED instead of shared helper.
- **Fix**: `ARCHIVED_PARCEL_STATUSES` exported from `is-archived-status.ts`.
- **Decision**: FIXED

## Triage summary

- **Fixed**: F1, F2, F3, F4, F5, F7, F8 (7)
- **Accepted**: F6 (1)
