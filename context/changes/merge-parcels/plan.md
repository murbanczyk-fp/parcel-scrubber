# Merge Parcels Implementation Plan

## Overview

Let users multi-select two or more parcels on the Active or Archive list, resolve conflicting field values in a merge dialog (including freeform “Other…”), and merge them into one survivor that keeps all linked Gmail messages, recomputes order date from the oldest linked message, and hard-deletes the other parcel rows (US-05 / FR-020 / S-08).

## Current State Analysis

- No merge API, no table multi-select, no bulk actions. Active/archive lists are per-row actions + expandable Gmail rows only.
- Sync already dedupes by normalized tracking number and fill-null-enriches fields (`mergeParcelFieldsFromExtraction`); S-06 deferred “merchant wins” corrections to edit/merge.
- Prisma partial unique `(user_id, tracking_number) WHERE tracking_number IS NOT NULL` constrains merge when the chosen tracking collides with a parcel outside the selection.
- `ParcelEmail` uses composite PK `(parcelId, gmailMessageId)`; deleting a parcel cascades its links. Reparent must create missing links on the survivor before deleting losers.
- Order date is recomputed from min linked `GmailMessage.internalDate` in sync after linking — merge must do the same after reparent.

### Key Discoveries:

- Controllers today: `apps/api/src/parcels/parcels.controller.ts` — JWT-scoped CRUD + deliver/remove/reactivate; validation via `ParcelValidationError` → `400 { errors }`.
- Sync transaction pattern for links + orderDate: `apps/api/src/sync/sync.service.ts` (~221–242).
- Web client mutations: `apps/web/src/app/core/parcels/parcels.service.ts` — `Promise` + `firstValueFrom`, relative `/api/...`.
- ConfirmDialog exists for Remove only; no form-in-dialog yet — merge field pickers need `p-dialog` (ConfirmationService cannot host radios + Other inputs).

## Desired End State

- From Active or Archive, user selects ≥2 parcels, opens Merge, picks a value per conflicting mutable field (or Leave empty / Other…), confirms, and sees one remaining row with all messages and the oldest message order date.
- API `POST /api/parcels/merge` accepts selected ids + resolved fields, enforces per-user scope, applies merge in one transaction, returns the survivor `ParcelDto`.
- Automated unit + e2e coverage for happy path and rejection cases; manual smoke on both lists.

## What We're NOT Doing

- Automatic store-wins / fill-null field resolution on merge (user decides every conflicting field).
- Cross-list selection (active + archive in one merge).
- Soft-delete / archive of losers (hard-delete duplicate rows per PRD).
- Changing sync dedupe or enrichment rules.
- Carrier status APIs, bulk edit of non-merge fields, or undo-merge.
- Order-date picker (always recomputed; no user override during merge).

## Implementation Approach

Client owns conflict UX: build option lists from selected `ParcelDto`s, collect resolved field values, POST them with `parcelIds`. Server owns integrity: ownership, ≥2 ids, membership class consistency, tracking uniqueness outside selection, implicit survivor (oldest `createdAt`), reparent emails, recompute `orderDate`, archive status preference (`DELIVERED` if any selected is Delivered else keep Removed), delete losers, return mapped DTO.

Shared merge dialog component used by both lists. Multi-select is greenfield on existing PrimeNG `p-table`s.

## Critical Implementation Details

**Route registration:** Prefer declaring `@Post('merge')` before any bare `@Post(':id')` so Nest never treats `merge` as an id. Current `@Post(':id/deliver'|':id/remove'|':id/reactivate')` routes need two path segments and do not conflict with `POST …/merge`; early registration remains good hygiene.

**Reparent + cascade:** For each distinct `gmailMessageId` across the selection, ensure a `ParcelEmail` row exists for the survivor (`create` if missing). Then `delete` loser parcels — cascade removes leftover links and status events. Do not `UPDATE parcelId` on the composite PK when the survivor already has that message.

**Client vs server field authority:** The dialog’s submitted `fields` object is authoritative for mutable columns. Server does not apply US-05 “store-wins” automatically; that AC is satisfied by the user choosing among store-bearing and carrier-only options in the UI. Server still validates carrier/custom label / tracking normalization the same way as create/update.

**Order date:** After reparent, set survivor `orderDate` to min linked message `internalDate` (date portion consistent with existing mapping). If no messages remain, fall back to `min(orderDate)` among the selected parcels.

**trackingUrl:** Persist the override column (`trackingUrl` in DB / `trackingUrlOverride` in DTO). Dialog options should use override values (and “Leave empty”), not the resolved display URL.

**Status events on merge:** When archive status preference changes the survivor’s status (e.g. Removed → Delivered), create a `ParcelStatusEvent` in the same transaction with `fromStatus` / `toStatus` and `source: USER` — same shape as `transitionStatus` in `parcels.service.ts`. Skip the event when status is unchanged. Do not call `transitionStatus` itself (it opens its own transaction); inline the event write inside the merge `$transaction`.

---

## Phase 1: API merge transaction

### Overview

Add `POST /api/parcels/merge` with a transactional merge service, validation errors in the existing `{ errors }` shape, and unit tests.

### Changes Required:

#### 1. Merge request DTO

**File**: `apps/api/src/parcels/parcel.dto.ts`

**Intent**: Define the merge request body so the client can send selected ids plus fully resolved field values (including nulls for Leave empty).

**Contract**: `MergeParcelsBody` with `parcelIds: string[]` (≥2 enforced in service) and `fields` covering `store`, `description`, `carrier`, `customCarrierLabel`, `trackingNumber`, `trackingUrl` — each nullable where the Prisma column allows. Reuse `Carrier` enum. Do not include `orderDate` or `status` in client fields (server-owned).

#### 2. Merge domain helper(s)

**File**: `apps/api/src/parcels/merge-parcels.ts` (new; name may match repo conventions)

**Intent**: Keep pure, testable logic for survivor selection, archive status preference, and order-date fallback out of the Nest service.

**Contract**:
- Survivor = parcel with oldest `createdAt` among the loaded set (stable tie-break on `id` if needed).
- Archive status: if any selected has `DELIVERED`, result status `DELIVERED`; else if all archived, `REMOVED`; active merges leave status unchanged on the survivor (still not Delivered/Removed).
- `orderDateFallback(parcels)` = min `orderDate` among selection.
- Optional: small helper listing validation preconditions (distinct ids, count ≥ 2).

#### 3. ParcelsService.mergeForUser

**File**: `apps/api/src/parcels/parcels.service.ts`

**Intent**: Load all selected parcels for the user, validate, apply client fields onto the survivor inside `prisma.$transaction`, reparent emails, recompute order date, delete losers, return `ParcelDto`.

**Contract**:
- Missing / other-user ids → `NotFoundException` (“Parcel not found”) consistent with other mutations.
- `< 2` distinct ids, empty body, or invalid carrier → `ParcelValidationError` with `field: 'parcelIds'` or field-specific errors.
- Mixed membership class (any selected parcel archived via `DELIVERED`/`REMOVED` while any other is not) → `ParcelValidationError` with `field: 'parcelIds'` (reuse `isArchivedStatus` / `ARCHIVED_PARCEL_STATUSES`).
- Chosen normalized tracking number must not exist on another parcel **outside** the selection → `ParcelValidationError` with `field: 'trackingNumber'`.
- Normalize tracking via existing `normalizeTrackingNumber`.
- Transaction steps: update survivor (fields + status when archive) → if status changed, `parcelStatusEvent.create` (`fromStatus` → preferred status, `source: USER`) → create missing `ParcelEmail` rows for survivor → recompute `orderDate` from linked messages (else fallback) → delete losers.
- Map result with existing `mapParcelToDto` / messages include.

#### 4. Controller route

**File**: `apps/api/src/parcels/parcels.controller.ts`

**Intent**: Expose merge behind JWT with the same validation wrapper as create/update.

**Contract**: `@Post('merge')` `@HttpCode(OK)` → `handleValidation(() => parcels.mergeForUser(user.id, body))`. Place before `:id` POST routes.

#### 5. Unit tests

**File**: `apps/api/src/parcels/parcels.service.spec.ts` (and helper spec if extracted)

**Intent**: Cover survivor choice, email reparent + loser delete, order-date recompute, Delivered preference (and a `ParcelStatusEvent` when status changes), tracking collision outside selection, mixed active+archived rejection, ownership 404, `<2` ids.

**Contract**: Mock Prisma `$transaction` the same way existing parcel specs do; assert calls and returned DTO shape.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:api` (or workspace-equivalent covering new specs)
- Lint passes for API workspace: `npm run lint -w @parcel-scrubber/api`

#### Manual Verification:

- None for this phase (API-only); smoke via e2e in Phase 2

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase. Phase blocks use plain bullets — checkboxes live in `## Progress`.

---

## Phase 2: API e2e coverage

### Overview

Add real-Postgres e2e coverage for merge happy path and key rejection cases, following `parcels.e2e-spec.ts`.

### Changes Required:

#### 1. Merge e2e cases

**File**: `apps/api/test/parcels.e2e-spec.ts` (or sibling `parcels-merge.e2e-spec.ts` if preferred for size)

**Intent**: Prove merge against real constraints (partial unique index, cascades) with cookie JWT auth.

**Contract** (minimum scenarios):
- Merge two active parcels with differing descriptions → one survivor, both messages linked, losers gone, orderDate = oldest message date.
- Tracking collision with a third parcel outside selection → 400 with `errors` including `trackingNumber`.
- Other user’s parcel id in `parcelIds` → 404.
- Single id → 400.
- Two archived parcels (DELIVERED + REMOVED) → survivor status `DELIVERED`.
- One active + one archived id in `parcelIds` → 400 with `errors` including `parcelIds`.

### Success Criteria:

#### Automated Verification:

- E2e passes: `npm run test:e2e -w @parcel-scrubber/api` (with local/CI Postgres as existing suite requires)
- Lint still clean for touched API test files

#### Manual Verification:

- None required beyond CI/local e2e green

**Implementation Note**: Pause for human confirmation before Phase 3.

---

## Phase 3: Active list merge UI

### Overview

Add multi-select and a merge dialog on the Active list that builds field options from selection, posts resolved fields, and updates the table.

### Changes Required:

#### 1. Client API method + types

**File**: `apps/web/src/app/core/parcels/parcels.service.ts`, `parcels.types.ts`

**Intent**: Mirror the API contract for the web app.

**Contract**: `mergeParcels(body: MergeParcelsPayload): Promise<ParcelDto>` → `POST /api/parcels/merge`. Types match `MergeParcelsBody` / fields nullability.

#### 2. Shared merge dialog component

**File**: `apps/web/src/app/features/parcels/merge-parcels-dialog.component.ts` (and template/styles as needed; path may sit under `shared` or `features/parcels` per existing layout)

**Intent**: Present one dialog that, for each mutable field with differing values among selection, shows radios for distinct non-empty options, Leave empty (nullable fields), and Other… with a text/select input; unanimous fields are shown read-only or omitted from prompts and submitted as that value.

**Contract**:
- Inputs: selected `ParcelDto[]`; outputs: confirmed `MergeParcelsPayload` or cancel.
- Fields: store, description, carrier (+ custom label when CUSTOM / Other), trackingNumber, trackingUrl override.
- Order date displayed as informational (computed preview: min message date across selection, else min parcel orderDate) — not editable.
- Carrier “Other…” maps to `CUSTOM` + `customCarrierLabel`.
- Primary action disabled until every conflicting field has a choice (including Other text when selected).
- Use PrimeNG `p-dialog` + form controls consistent with PrimeNG usage elsewhere; do not use `ConfirmationService` as the field picker host.

#### 3. Active list selection + Merge entry

**File**: `apps/web/src/app/features/active/active-list.component.ts`, `.html`, `.scss`, `.spec.ts`

**Intent**: Enable multi-select and open the merge dialog from a header Merge button when ≥2 rows are selected.

**Contract**:
- `p-table` `selectionMode="multiple"` + checkbox column; keep expand + row actions.
- Header **Merge** enabled iff `selection.length >= 2` and no merge in flight.
- On success: remove all selected ids from the local list except the survivor (or reload `listActive()`); toast success; clear selection.
- On 400: toast first `errors[].message` (same spirit as form server errors).
- Specs cover: Merge disabled with &lt;2 selected; dialog receive selection; successful merge updates list.

### Success Criteria:

#### Automated Verification:

- Web unit tests pass: `npm run test:web` (or targeted `ng test` for touched specs)
- Lint passes for web workspace: `npm run lint -w @parcel-scrubber/web`

#### Manual Verification:

- On Active list, select two parcels with different descriptions → Merge dialog offers both + Leave empty + Other → after confirm, one row remains with chosen description and combined Gmail expand rows
- Select three parcels (A desc, B desc, C empty) → description options are A and B only (plus Leave empty / Other), not a blank third radio duplicate
- Cancel leaves selection and data unchanged

**Implementation Note**: Pause for human confirmation before Phase 4.

---

## Phase 4: Archive list parity

### Overview

Reuse the same selection + dialog on Archive; rely on API Delivered-preference for status. No cross-list selection.

### Changes Required:

#### 1. Archive list selection + Merge

**File**: `apps/web/src/app/features/archive/archive-list.component.ts`, `.html`, `.scss`, `.spec.ts`

**Intent**: Same multi-select and Merge affordance as Active, wired to the shared dialog and `mergeParcels`.

**Contract**: Mirror Active selection UX; on success refresh/filter archived list; survivor may disappear from archive only if API somehow returned active (should not happen for archive-only merges). Specs mirror Active selection/merge enablement.

### Success Criteria:

#### Automated Verification:

- Web unit tests pass including archive specs
- Full lint: `npm run lint` from repo root (or both workspaces)

#### Manual Verification:

- On Archive, merge Delivered + Removed parcels → survivor shows Delivered and retains all messages
- Active and Archive merges do not share selection state across navigation

**Implementation Note**: After this phase, the change is feature-complete pending final review / PR.

---

## Testing Strategy

### Unit Tests:

- Survivor selection (oldest `createdAt`)
- Status preference (Delivered wins among archived)
- Order-date recompute vs fallback when no messages
- Tracking collision outside selection
- Ownership / `<2` ids validation
- Dialog option-building: distinct non-empty values; empty sources omitted from radios

### Integration Tests:

- E2e merge happy path + 400/404 cases against Postgres (Phase 2)

### Manual Testing Steps:

1. Active: merge two mis-split parcels with different store/description; verify expand shows all messages; order date is oldest message.
2. Active: choose Other… for description; verify persisted text.
3. Active: choose a tracking number that belongs to a third parcel → error toast; no deletes.
4. Archive: merge Delivered + Removed → Delivered survivor.
5. Cancel dialog / deselect — no API call.

## Performance Considerations

Merge sets are small (handful of rows). One transaction per merge is enough; no batching or background jobs.

## Migration Notes

No Prisma schema migration. Existing partial unique index and cascades are sufficient. No data backfill.

## References

- PRD: US-05, FR-020, Business Logic #2 / #9 — `context/foundation/prd.md`
- Roadmap S-08 — `context/foundation/roadmap.md`
- Sync orderDate + ParcelEmail create — `apps/api/src/sync/sync.service.ts`
- Prior UI action patterns — `apps/web/src/app/features/active/active-list.component.ts`
- Issue: https://github.com/murbanczyk-fp/parcel-scrubber/issues/35

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API merge transaction

#### Automated

- [ ] 1.1 Unit tests pass for merge service / helpers
- [ ] 1.2 API workspace lint passes

#### Manual

- [ ] 1.3 Human confirmation to proceed to Phase 2

### Phase 2: API e2e coverage

#### Automated

- [ ] 2.1 Parcel merge e2e scenarios pass against Postgres
- [ ] 2.2 API lint clean for e2e touches

#### Manual

- [ ] 2.3 Human confirmation to proceed to Phase 3

### Phase 3: Active list merge UI

#### Automated

- [ ] 3.1 Web unit tests pass for active list + merge dialog
- [ ] 3.2 Web workspace lint passes

#### Manual

- [ ] 3.3 Active merge dialog resolves conflicts and updates the list
- [ ] 3.4 Three-parcel description options omit empty; cancel is a no-op
- [ ] 3.5 Human confirmation to proceed to Phase 4

### Phase 4: Archive list parity

#### Automated

- [ ] 4.1 Archive list merge specs + web tests pass
- [ ] 4.2 Repo lint passes

#### Manual

- [ ] 4.3 Archive Delivered+Removed merge yields Delivered survivor with all messages
- [ ] 4.4 Selection does not leak across Active/Archive navigation
