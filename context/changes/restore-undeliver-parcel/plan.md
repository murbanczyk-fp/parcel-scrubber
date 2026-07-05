# Restore Archived Parcel Implementation Plan

## Overview

Roadmap **S-05** completes the parcel lifecycle started in S-03: users can move any archived parcel (`DELIVERED` or `REMOVED`) back to the active list with a single **Restore** action, regardless of order date (US-03, FR-016). The API exposes one `POST .../reactivate` mutation; the Archive list gains a one-click Restore button with optimistic row removal, mirroring Active list deliver/remove UX.

## Current State Analysis

S-03 shipped archive membership via `isArchivedStatus` (`DELIVERED` | `REMOVED`), `POST .../deliver` and `POST .../remove`, the Archive table (read-only except Edit), and Active list action buttons with optimistic UI. `transitionStatus` in `ParcelsService` already handles transactional status updates plus `ParcelStatusEvent` rows with idempotent no-op when already at target status. Sync keeps archived parcels archived on re-import (FR-007). No restore/reactivate route, web client method, or Archive action exists yet.

### Key Discoveries:

- `apps/api/src/parcels/parcels.service.ts` — `transitionStatus` (lines 541–595) is the shared mutation primitive; deliver/remove are thin wrappers.
- `apps/api/src/parcels/is-archived-status.ts` — archive guard for eligibility checks.
- `apps/web/src/app/features/archive/archive-list.component.html` — Actions column has Edit only; no lifecycle buttons.
- F-03 research suggested `DELIVERED → NEW` and `REMOVED → NEW`; v1 sync never sets transit statuses, so `NEW` is the correct target.
- S-03 explicitly deferred restore/undeliver to this slice (`context/archive/2026-06-22-deliver-remove-archive/plan.md`).

## Desired End State

User on **Archive** clicks **Restore** on any archived row (Delivered or Removed); the row disappears immediately with a success toast. The parcel appears on **Active** on next load with status `NEW`. API writes a `ParcelStatusEvent` (`source: USER`) for real transitions; repeat calls while already `NEW` return 200 without a duplicate event. Calls on non-archived active statuses (`IN_TRANSIT`, `IN_DELIVERY`) return **400**. Re-sync does not auto-promote archived parcels (unchanged FR-007).

### Key Discoveries:

- No schema migration required — `ParcelStatus.NEW` and event table already exist.
- Order date is not validated on restore — any archived parcel qualifies per PRD.

## What We're NOT Doing

- Separate Restore vs Undeliver API routes or UI labels (unified **Restore** for both archived statuses)
- Restoring to prior transit status from event log (always `NEW`)
- Order-date or age-based eligibility gates
- Gmail sync changes (FR-007 guard stays as-is)
- Angular component specs (same precedent as S-03)
- Bulk restore actions
- Confirmation dialog before restore

## Implementation Approach

Add `reactivateParcel` to `ParcelsService` with an archived-only guard (plus idempotent path when already `NEW`), expose `POST /api/parcels/:id/reactivate`, extend unit/controller/e2e tests symmetrically with deliver/remove, then wire web `reactivateParcel()` and Archive list actions by duplicating the Active list optimistic-action pattern (`actionInFlight`, optimistic row removal, toast, error rollback via `listArchived()` reload).

## Phase 1: API reactivate mutation

### Overview

Add the reactivate service method and controller route with unit tests proving eligibility, transitions, idempotency, and event writes.

### Changes Required:

#### 1. ParcelsService — reactivate method

**File**: `apps/api/src/parcels/parcels.service.ts`

**Intent**: Add `reactivateParcel(userId, parcelId)` that moves archived parcels to `NEW`, rejects non-archived active statuses with 400, and idempotently returns 200 when already `NEW`.

**Contract**: Public method delegating to `transitionStatus` only when `isArchivedStatus(parcel.status)` or `parcel.status === ParcelStatus.NEW`. Throw `BadRequestException` with message `'Parcel is not archived'` when status is `IN_TRANSIT` or `IN_DELIVERY`. Real transitions from `DELIVERED` or `REMOVED` → `NEW` write a `ParcelStatusEvent` with `source: USER` via existing transaction logic.

#### 2. ParcelsController — reactivate route

**File**: `apps/api/src/parcels/parcels.controller.ts`

**Intent**: Expose the mutation over HTTP, symmetric with deliver/remove.

**Contract**: `POST :id/reactivate` with `@HttpCode(HttpStatus.OK)` → `parcels.reactivateParcel(user.id, id)`.

#### 3. Unit tests — service and controller

**Files**: `apps/api/src/parcels/parcels.service.spec.ts`, `apps/api/src/parcels/parcels.controller.spec.ts`

**Intent**: Lock reactivate behavior at the unit layer before e2e.

**Contract**: Service tests cover: `DELIVERED → NEW` with event, `REMOVED → NEW` with event, idempotent when already `NEW` (no duplicate event), `BadRequestException` for `IN_TRANSIT`, not-found for missing parcel. Controller test delegates to service; HTTP test asserts route wiring.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:api -- --testPathPattern=parcels`
- Lint passes: `npm run lint -w @parcel-scrubber/api`
- Type checking passes via test compile

#### Manual Verification:

- N/A for API-only phase

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Parcels e2e — reactivate scenarios

### Overview

Extend the existing authenticated parcels e2e suite to prove the HTTP contract and database side effects end-to-end.

### Changes Required:

#### 1. parcels.e2e-spec — reactivate cases

**File**: `apps/api/test/parcels.e2e-spec.ts`

**Intent**: Prove reactivate works over HTTP with JWT auth, list filtering, events, idempotency, and error cases.

**Contract**: Add scenarios:
1. Deliver parcel → `POST reactivate` → 200, status `NEW`; active list includes; archived excludes; one event row `fromStatus: DELIVERED`, `toStatus: NEW`, `source: user`.
2. Remove parcel → reactivate → same pattern with `fromStatus: REMOVED`.
3. Second reactivate on same parcel (now active) → 200 idempotent; event count unchanged.
4. Reactivate unknown id / wrong user → 404.
5. Reactivate `IN_TRANSIT` parcel → 400.

### Success Criteria:

#### Automated Verification:

- E2e tests pass: `npm run test:api -- --testPathPattern=parcels.e2e`
- Full API test suite passes: `npm run test:api`

#### Manual Verification:

- N/A for e2e-only phase

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: Archive UI — Restore action

### Overview

Add web client method and Archive list Restore button with optimistic UX matching Active list patterns.

### Changes Required:

#### 1. Web ParcelsService — reactivateParcel

**File**: `apps/web/src/app/core/parcels/parcels.service.ts`

**Intent**: Mirror deliver/remove client methods for reactivate.

**Contract**: `reactivateParcel(id: string): Promise<ParcelDto>` → `POST /api/parcels/${id}/reactivate` with `null` body.

#### 2. ArchiveListComponent — action handler and template

**Files**: `apps/web/src/app/features/archive/archive-list.component.ts`, `apps/web/src/app/features/archive/archive-list.component.html`, `apps/web/src/app/features/archive/archive-list.component.scss`

**Intent**: Add one-click Restore per archived row with optimistic removal, in-flight guard, toast, and error rollback — duplicate the Active list optimistic-action pattern (not shared; `runParcelAction` is private).

**Contract**:
- Inject `MessageService`; add `actionInFlight` signal and `isActionInFlight(id)` helper.
- `onRestore(parcel)` → optimistic filter row → `reactivateParcel(id)` → success toast `'Restored to active list'`.
- Error handling (Archive-specific, not identical to Active): on 404/400/5xx → show appropriate toast and reload via `listArchived()`; on 401 → session-expired toast (no `authRequired` signal unless needed).
- Template: **Restore** button in Actions column beside Edit, `data-testid="restore-parcel-{id}"`, disabled/loading while in-flight.
- SCSS: reuse or extend `.archive-list__actions` gap/layout to match active list button row.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint -w @parcel-scrubber/web`
- Web unit tests pass: `npm run test:web`
- Full monorepo lint + test: `npm run lint` and `npm run test`

#### Manual Verification:

- Archive row with status Delivered → Restore → row gone, toast shown, parcel on Active list
- Archive row with status Removed → Restore → same outcome
- Old order date parcel restores successfully (no date gate)
- Double-click Restore → idempotent, no duplicate toast errors
- After restore, trigger Gmail sync → parcel stays on Active (FR-007)
- Failed restore (simulate API down) → row reappears after rollback reload

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `reactivateParcel` transitions from both archived statuses
- Idempotent when already `NEW`
- 400 for non-archived transit statuses
- 404 for missing parcel
- Controller delegation

### Integration Tests:

- Full HTTP flow: archive → reactivate → active list membership
- Event row assertions
- Idempotent second call
- Auth and ownership 404 cases

### Manual Testing Steps:

1. Mark a parcel Delivered on Active → go to Archive → Restore → verify on Active
2. Mark a parcel Removed → Restore from Archive → verify on Active
3. Restore a parcel with an order date older than 30 days → succeeds
4. Re-sync after restore → parcel remains active
5. Verify Edit still works on Archive rows before restore

## Performance Considerations

Single-row mutation with existing indexed `{ userId, status }` lookup — no performance concerns. Optimistic UI avoids perceived latency.

## Migration Notes

None. No schema changes.

## References

- PRD: `context/foundation/prd.md` — US-03, FR-016
- Roadmap: `context/foundation/roadmap.md` — S-05
- Prior slice: `context/archive/2026-06-22-deliver-remove-archive/plan.md`
- F-03 status semantics: `context/archive/2026-06-06-parcel-prisma-model/research.md`
- Service transition helper: `apps/api/src/parcels/parcels.service.ts`
- Active list action pattern: `apps/web/src/app/features/active/active-list.component.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: API reactivate mutation

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:api -- --testPathPattern=parcels`
- [x] 1.2 Lint passes: `npm run lint -w @parcel-scrubber/api`
- [x] 1.3 Type checking passes via test compile

#### Manual

- [ ] 1.4 N/A — API-only phase (confirm automated green before Phase 2)

### Phase 2: Parcels e2e — reactivate scenarios

#### Automated

- [ ] 2.1 E2e tests pass: `npm run test:api -- --testPathPattern=parcels.e2e`
- [ ] 2.2 Full API test suite passes: `npm run test:api`

#### Manual

- [ ] 2.3 N/A — e2e-only phase (confirm automated green before Phase 3)

### Phase 3: Archive UI — Restore action

#### Automated

- [ ] 3.1 Lint passes: `npm run lint -w @parcel-scrubber/web`
- [ ] 3.2 Web unit tests pass: `npm run test:web`
- [ ] 3.3 Full monorepo lint + test: `npm run lint` and `npm run test`

#### Manual

- [ ] 3.4 Archive Delivered/Removed rows restore to Active with toast; old order dates work
- [ ] 3.5 Double-click idempotent; sync does not re-archive; error rollback reloads row
