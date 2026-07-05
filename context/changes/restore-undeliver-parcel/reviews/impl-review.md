<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Restore Archived Parcel

- **Plan**: context/changes/restore-undeliver-parcel/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-07-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Archive error rollback missing local fallback

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: apps/web/src/app/features/archive/archive-list.component.ts:134-139
- **Detail**: On restore failure, `handleRestoreError` reloads via `listArchived()`. If that reload also fails, the catch block keeps optimistic removal with no local rollback. `active-list.component.ts` (218–225) re-inserts the parcel into the signal when reload fails. User sees error toast but row stays gone until manual refresh—even though the parcel is still archived on the server.
- **Fix**: Mirror active-list fallback: if reload fails and the parcel id is missing from `parcels()`, re-insert the `parcel` argument.
- **Decision**: FIXED

### F2 — E2E remove scenario missing archived-list exclusion

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/api/test/parcels.e2e-spec.ts:303-338
- **Detail**: Deliver→reactivate test (282–286) asserts archived list excludes the parcel. Remove→reactivate test (303–338) omits the same assertion. Plan scenario 2 says "same pattern with fromStatus: REMOVED". Implementation is correct; test parity gap only.
- **Fix**: Add archived-list exclusion assertion to the remove→reactivate e2e test, mirroring lines 282–286.
- **Decision**: FIXED

### F3 — Missing IN_DELIVERY 400 test coverage

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: apps/api/src/parcels/parcels.service.spec.ts:261-269, apps/api/test/parcels.e2e-spec.ts:370-383
- **Detail**: Plan contract mentions both IN_TRANSIT and IN_DELIVERY for 400. Only IN_TRANSIT is tested at unit and e2e layers. Implementation handles both via the same guard.
- **Fix**: Add symmetric IN_DELIVERY → 400 tests in service spec and/or e2e.
- **Decision**: FIXED

### F4 — Service spec doesn't assert error message

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/api/src/parcels/parcels.service.spec.ts:261-269
- **Detail**: Plan specifies BadRequestException with message 'Parcel is not archived'. Test asserts exception type only, not message string.
- **Fix**: Assert `rejects.toThrow('Parcel is not archived')` or equivalent message check.
- **Decision**: FIXED
