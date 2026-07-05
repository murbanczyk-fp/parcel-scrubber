<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Add and Edit Parcels

- **Plan**: context/changes/manual-parcel-crud/plan.md
- **Scope**: All 4 phases (complete)
- **Date**: 2026-07-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Stale custom carrier label after carrier change

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/parcels/parcels.service.ts:248-267; apps/web/src/app/features/parcels/parcel-form.component.ts:361-371
- **Detail**: `updateForUser` does not null `customCarrierLabel` when `carrier` changes away from `CUSTOM`. The web form clears validators but not the control value, and `buildPatch()` omits unchanged fields — so a carrier-only patch leaves the old label in the DB. It can reappear if the user switches back to CUSTOM without entering a new label.
- **Fix**: API: when effective carrier ≠ `CUSTOM`, set `data.customCarrierLabel = null`. Web: on carrier change away from CUSTOM, clear the control and include `customCarrierLabel: ''` in the patch when the saved snapshot had a label.
- **Decision**: FIXED

### F2 — Stale tracking URL preview during edit

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/features/parcels/parcel-form.component.ts:96,275
- **Detail**: `resolvedTrackingUrl` is set only in `applySnapshot()` on load. Changing carrier or tracking number in edit mode does not refresh the “Current generated link” help text; it reflects saved values until reload.
- **Fix**: Derive preview from current form values (client-side template helper) or clarify in UI copy that the preview reflects saved data until save.
- **Decision**: FIXED

### F3 — orderDate DatePipe UTC skew in list tables

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Reliability / Pattern Consistency
- **Location**: apps/web/src/app/features/active/active-list.component.html:89; apps/web/src/app/features/archive/archive-list.component.html:38
- **Detail**: `parcel.orderDate | date: 'mediumDate'` pipes a `YYYY-MM-DD` string. Angular treats date-only ISO strings as UTC midnight, which can display the previous calendar day in timezones west of UTC. Manual CRUD makes user-entered dates more visible.
- **Fix**: Parse as local date-only before piping (split `YYYY-MM-DD` into local `Date`) or display the string with a fixed format and no timezone conversion.
- **Decision**: FIXED

### F4 — No max-length validation on parcel text fields

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: apps/api/src/parcels/parcels.service.ts:301-310
- **Detail**: No max-length validation on `store`, `description`, or `customCarrierLabel`. Settings enforces bounds client- and server-side; Prisma columns are unbounded `TEXT`.
- **Fix**: Add reasonable max lengths in service validators (and optional client validators), aligned with product limits.
- **Decision**: FIXED

### F5 — Update uses id-only where clause

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/api/src/parcels/parcels.service.ts:154-156
- **Detail**: `prisma.parcel.update` uses `where: { id: parcelId }` only. Ownership is checked via prior `findFirst({ id, userId })`, but `transitionStatus` scopes updates with `userId` in the `where` clause.
- **Fix**: Prefer `updateMany({ where: { id, userId }, data })` and treat `count === 0` as not found.
- **Decision**: FIXED

### F6 — No read-time URL validation on stored override

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/parcels/resolve-tracking-url.ts:10-11
- **Detail**: Stored `trackingUrl` override is returned without read-time `isSafeHttpUrl` check. Write path validates; residual risk is DB tampering or legacy rows.
- **Fix**: Re-validate on read in `resolveTrackingUrl` and treat unsafe stored values as `null` (fall back to generated URL).
- **Decision**: FIXED
