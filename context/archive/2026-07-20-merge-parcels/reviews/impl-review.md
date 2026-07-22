<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Merge Parcels

- **Plan**: context/changes/merge-parcels/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-07-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unanimous CUSTOM carrier with empty label blocks merge

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/features/parcels/merge-field-options.ts:110-118; apps/api/src/parcels/parcels.service.ts:748-754
- **Detail**: When every selected parcel has `carrier: CUSTOM` and the same empty/null `customCarrierLabel`, `buildCarrierConflict` returns null (treated as unanimous). The dialog submits `customCarrierLabel: null`, but `validateCustomCarrierLabel` rejects CUSTOM without a label. Sync can persist CUSTOM + null label, so Confirm appears enabled and fails with a 400. No conflict UI prompts the user to supply a label.
- **Fix A ⭐ Recommended**: Treat “all CUSTOM, all empty label” as a carrier conflict so the dialog forces Other… / an explicit label before confirm
  - Strength: Keeps API validation strict; matches create/update rules; fixes the stuck UX at the source of option-building.
  - Tradeoff: Small dialog/helper change + unit test for this unanimous-empty case.
  - Confidence: HIGH — sync already creates CUSTOM+null; conflict builder is the natural choke point.
  - Blind spot: Haven’t verified how often real Gmail sync leaves CUSTOM without a label in production data.
- **Fix B**: Relax merge-only API validation to allow CUSTOM with null label when all selected parcels already share that state
  - Strength: One-line server change; preserves existing synced data without forcing a label.
  - Tradeoff: Diverges merge validation from create/update; can leave unlabeled CUSTOM survivors.
  - Confidence: MEDIUM — product may still want a label eventually.
  - Blind spot: Downstream UI that assumes CUSTOM always has a display label.
- **Decision**: Fixed via Fix A

### F2 — Survivor parcel updates omit userId in where clause

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/parcels/parcels.service.ts:334-345, 384-387
- **Detail**: Inside the merge transaction, both `tx.parcel.update` calls use `where: { id: survivor.id }` without `userId`. Peer mutations (`updateForUser`, `transitionStatus`, loser `deleteMany`, final `findFirstOrThrow`) consistently include `userId`. Practical risk is low because the survivor was loaded with a user-scoped `findMany`, but this breaks defense-in-depth.
- **Fix**: Add `userId` to both survivor `update` `where` clauses to match `updateForUser` / `deleteMany`.
- **Decision**: FIXED

### F3 — Tracking uniqueness check runs outside the merge transaction

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/parcels/parcels.service.ts:292-306
- **Detail**: Duplicate tracking is checked with `findFirst` before `$transaction`. A concurrent create/update/merge can claim the same tracking between check and commit. Mitigated by the partial unique index plus `rethrowDuplicateTrackingError` (P2002), so data integrity holds; the race mainly affects error timing/UX under concurrency.
- **Fix**: Move the outside-selection duplicate check inside the transaction (or rely solely on P2002 with the existing remapper and drop the pre-check).
- **Decision**: FIXED

### F4 — Missing selectionMode="multiple" on Active and Archive tables

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/web/src/app/features/active/active-list.component.html; archive-list.component.html
- **Detail**: Plan required `p-table` `selectionMode="multiple"` + checkbox column. Checkbox multi-select and `[(selection)]` are implemented; the explicit `selectionMode="multiple"` attribute is absent. Functionally works with PrimeNG 21 checkbox selection, but diverges from the written contract.
- **Fix**: Add `selectionMode="multiple"` to both Active and Archive `p-table`s.
- **Decision**: FIXED

### F5 — Web specs omit Active 400-toast and Archive dialog-open coverage

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/web/src/app/features/active/active-list.component.spec.ts; archive-list.component.spec.ts
- **Detail**: Plan asked Active specs to cover Merge disabled / dialog receive selection / successful merge; 400 toast behavior is implemented (`handleMergeError`) but not asserted. Archive specs mirror enablement + success but omit Active’s dialog-open case. Not a missing feature — incomplete test mirror.
- **Fix**: Add an Active 400-error toast spec and an Archive “opens merge dialog” spec mirroring Active.
- **Decision**: FIXED

### F6 — Non-null tracking that normalizes to null is accepted silently

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/parcels/parcels.service.ts:462-478
- **Detail**: `validateNullableTrackingNumber` returns `normalizeTrackingNumber(value)` for any string. Whitespace/garbage becomes `null` without a field error, which can clear tracking when the user thought they kept a value (e.g. Other… with spaces). Explicit null/Leave empty is intentional; silent normalize-to-null is not.
- **Fix**: If the input string is non-null and normalization yields null, push a `trackingNumber` validation error instead of returning null.
- **Decision**: FIXED

### F7 — Merge error handler lacks 404 branch used by other parcel actions

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/app/features/active/active-list.component.ts:206-234 (and archive twin)
- **Detail**: `handleMergeError` handles 400/401 but not 404. Deliver/remove/restore handlers show “Parcel not found” and reload. A stale multi-select after another tab deletes a parcel yields a generic merge failure toast.
- **Fix**: Add a 404 branch consistent with `handleParcelActionError` / restore handlers (toast + reload list).
- **Decision**: FIXED

## Verification notes

### Automated (this review)

| Check | Result |
|-------|--------|
| `npm run test:api` | PASS — 36 suites / 255 tests |
| `npm run lint -w @parcel-scrubber/api` | PASS |
| `npm run test:web` | PASS — 11 files / 46 tests |
| `npm run lint -w @parcel-scrubber/web` | PASS |
| `npm run test:e2e -w @parcel-scrubber/api` (full) | FAIL — `sync.e2e-spec.ts` beforeAll timeout (unrelated to merge) |
| `jest --testPathPatterns=parcels.e2e` | PASS — 27 tests including merge scenarios |

### Manual (from Progress)

All Phase 3–4 manual checkboxes are `[x]`. Smoke items (3.3, 3.4, 4.3, 4.4) have no commit SHAs (expected for human smoke). This review did not re-run browser smoke; Progress marks them complete with Phase 3.5 / 4 human confirmation via `92c4bfe`.

### Scope extras (benign)

`merge-field-options.ts` (+spec), `merge-parcels.spec.ts`, and controller merge tests were not named in the plan but are sensible extractions helpers / additive coverage — not scope creep.
