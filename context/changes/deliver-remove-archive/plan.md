# Delivered/Remove Actions and Archive View — Implementation Plan

## Overview

Roadmap **S-03**: a signed-in user marks parcels **Delivered** or **Remove** on the active list, each action archives the parcel with a distinct status (`DELIVERED` vs `REMOVED`), writes a `ParcelStatusEvent` with `StatusEventSource.USER`, and browses archived parcels in a real archive view with order date, tracking link, and status column. Builds on S-02 active list and F-03 archive derivation via `isArchivedStatus`.

## Current State Analysis

**Exists (S-02 / F-03):**

- Prisma `ParcelStatus` includes `DELIVERED` and `REMOVED`; `ParcelStatusEvent` table with `fromStatus`, `toStatus`, `source`.
- `isArchivedStatus()` — single source of truth for list membership (`apps/api/src/parcels/is-archived-status.ts`).
- `GET /api/parcels?status=active` — filters `status NOT IN (DELIVERED, REMOVED)`; sorted `orderDate desc`, `createdAt desc`.
- Active list UI — PrimeNG table with sync flow (`apps/web/src/app/features/active/`).
- `/archive` route + shell Active/Archive toggle — placeholder component only.
- Sync respects FR-007 — archived parcels get metadata refresh only, never promoted to active.

**Missing for S-03:**

- `GET /api/parcels?status=archived`
- `POST /api/parcels/:id/deliver` and `POST /api/parcels/:id/remove`
- `ParcelsService` transition methods + event writes
- Archive list UI; active row actions; web mutation methods
- Parcels HTTP e2e tests

### Key Discoveries:

- Controller rejects `?status=archived` today (`apps/api/src/parcels/parcels.controller.ts:25-28`); spec asserts 400 (`parcels.controller.spec.ts:70-77`).
- `ListForUserOptions` is typed `'active'` only — archive branch in service ternary is unreachable (`parcels.service.ts:8-26`).
- No `ConfirmationService` / ConfirmDialog in web app yet (`apps/web/src/app/app.config.ts`).
- Restore / undeliver intentionally deferred to **S-05** (FR-016).

## Desired End State

After S-03:

1. User on **Active** sees an **Actions** column with **Delivered** (one-click) and **Remove** (ConfirmDialog). Successful action optimistically removes the row and shows a toast; API failure restores the row.
2. User on **Archive** sees a table of archived parcels (store, description, order date, carrier, tracking link, **Status** showing Delivered or Removed).
3. API: `GET /api/parcels?status=archived` returns archived parcels; `POST .../deliver` sets `DELIVERED`; `POST .../remove` sets `REMOVED`; each transition writes one `ParcelStatusEvent` (`source: USER`). Idempotent when already at target status (200, no duplicate event).
4. Re-sync of an archived parcel still refreshes metadata only (FR-007 regression guard intact).

**Verify manually:** sync parcels → mark one Delivered → disappears from Active, appears in Archive with status Delivered → mark another Remove (confirm dialog) → same → re-sync → both stay archived.

## What We're NOT Doing

- Restore / undeliver (S-05, FR-016)
- Manual parcel add/edit (S-04, FR-010/FR-011)
- Schema migrations or new Prisma models
- Angular component specs for list pages (S-02 precedent)
- Bulk deliver/remove or row selection
- Status auto-inference from Gmail (`IN_TRANSIT` / `IN_DELIVERY` user-edit only in v1)
- Expandable message rows (`FEATURES_TO_COME.md` item 1)

## Implementation Approach

Extend `ParcelsModule` in place: symmetric list filters (active vs archived), dedicated POST mutation routes per PRD action, transactional status update + event insert in service layer, then replace archive placeholder and add active row actions mirroring existing PrimeNG/table patterns. HTTP e2e against test Postgres proves event persistence and list filtering.

## Phase 1: API — archive list and status transitions

### Overview

Extend `ParcelsService` and `ParcelsController` with archived listing and idempotent deliver/remove mutations that write `ParcelStatusEvent` rows.

### Changes Required:

#### 1. ParcelsService — list and transitions

**File**: `apps/api/src/parcels/parcels.service.ts`

**Intent**: Support archived list queries and user-driven archival with audit events in a single transaction.

**Contract**:

- Widen `ListForUserOptions.status` to `'active' | 'archived'`.
- Active filter: `{ notIn: [DELIVERED, REMOVED] }` (unchanged).
- Archived filter: `{ in: [DELIVERED, REMOVED] }`.
- Same `orderBy`: `[{ orderDate: 'desc' }, { createdAt: 'desc' }]`.
- Add `markDelivered(userId: string, parcelId: string): Promise<ParcelDto>` and `markRemoved(userId: string, parcelId: string): Promise<ParcelDto>`.
- Shared private transition helper:
  - Load parcel by `{ id: parcelId, userId }`; missing → `NotFoundException`.
  - If `parcel.status === targetStatus` → return `mapParcelToDto(parcel)` (no DB write, no event).
  - Else `$transaction`: `parcel.update({ status: targetStatus })` + `parcelStatusEvent.create({ fromStatus, toStatus, source: StatusEventSource.USER })`.
  - Return mapped DTO.
- Transition from any **active** status (`NEW`, `IN_TRANSIT`, `IN_DELIVERY`) to target is allowed.
- Transition from one archived status to the other (e.g. `REMOVED` → `DELIVERED` via deliver) is allowed — user explicitly chose the action; write event.
- Import `NotFoundException` from `@nestjs/common`; `StatusEventSource` from `@prisma/client`.

#### 2. ParcelsController — routes

**File**: `apps/api/src/parcels/parcels.controller.ts`

**Intent**: Expose list + mutation HTTP contract for S-03.

**Contract**:

- `GET /api/parcels?status=` accepts `'active'` or `'archived'`; any other value (including omitted) → `400 BadRequestException` with message naming both allowed values.
- `POST /api/parcels/:id/deliver` → `markDelivered`.
- `POST /api/parcels/:id/remove` → `markRemoved`.
- Both POST handlers use `@HttpCode(HttpStatus.OK)` — Nest defaults `@Post()` to 201; plan and e2e expect 200 (matches explicit `@HttpCode` pattern in `SyncController`).
- All routes remain `@UseGuards(JwtAuthGuard)` at controller level; pass `@CurrentUser().id` and `:id` param to service.
- Use `@Param('id')` for parcel id (string).

#### 3. ParcelsService unit tests

**File**: `apps/api/src/parcels/parcels.service.spec.ts`

**Intent**: Lock list filters and transition semantics without HTTP.

**Contract**: Mock `prisma.parcel.findMany`, `findFirst`, `$transaction` (or update/create mocks). Cover:

- Archived list uses `{ in: [DELIVERED, REMOVED] }`.
- Deliver from `NEW` → updates status + creates event with `USER` source.
- Remove idempotent when already `REMOVED` → no transaction/event.
- Deliver idempotent when already `DELIVERED` → no transaction/event.
- Unknown parcel / wrong user → `NotFoundException`.

#### 4. ParcelsController unit + HTTP tests

**File**: `apps/api/src/parcels/parcels.controller.spec.ts`

**Intent**: Extend existing supertest patterns for new routes.

**Contract**:

- `GET ?status=archived` delegates to service with `{ status: 'archived' }`.
- Update existing test that expects `'archived'` to throw — now expects success.
- `POST /parcels/:id/deliver` and `POST /parcels/:id/remove` return 200 with parcel body; 404 when service throws `NotFoundException`.
- Unauthenticated routes still guarded (existing metadata test unchanged).

### Success Criteria:

#### Automated Verification:

- `npm run lint:api` passes
- `npm run test:api` passes (updated parcels unit specs)

#### Manual Verification:

- N/A for Phase 1 (no UI yet)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: API — parcels HTTP e2e

### Overview

Add integration tests proving deliver/remove/archive list behavior against real Postgres, including event row persistence.

### Changes Required:

#### 1. Parcels HTTP e2e spec

**File**: `apps/api/test/parcels.e2e-spec.ts` (new)

**Intent**: End-to-end verification of S-03 HTTP contract with auth and persistence.

**Contract**:

- Follow `sync.e2e-spec.ts` / `parcel-schema.e2e-spec.ts` setup: assert test DB URL, `prisma migrate deploy`, `truncateAppTables` in hooks.
- Bootstrap `AppModule` with real `PrismaService` (not mocked).
- **E2e bootstrap checklist** (first authenticated HTTP e2e in this repo — no copy-paste fixture exists):
  1. `assertE2eDatabaseUrl` + set `process.env.DATABASE_URL`, `JWT_SECRET`, `GOOGLE_*`, `OPENROUTER_*` (see `app.e2e-spec.ts` env block).
  2. `Test.createTestingModule({ imports: [AppModule] })` — do **not** override `PrismaService`.
  3. `app.setGlobalPrefix('api')` and `app.use(cookieParser())` before `init()` (matches `main.ts`).
  4. Helper `createAuthenticatedAgent(app, userRow)`: build `SessionUser` from DB user → `AuthService.signSession` → return supertest agent with `.set('Cookie', \`${getCookieName()}=${token}\`)`.
  5. Prisma mock in `app.e2e-spec.ts` breaks guarded routes — `JwtCookieStrategy` calls `verifySession` which requires a real DB user row.
- Helper: create user in DB; sign JWT via `AuthService.signSession` (inject from module); attach `Cookie: session=<token>` on requests (cookie name from `auth.getCookieName()`).
- Seed parcels with at minimum `userId`, `orderDate` (required field), and optional `trackingNumber` / `status` (default `NEW`) — follow `sync.e2e-spec.ts` parcel create pattern.
- Scenarios:
  1. Create active parcel → `GET /api/parcels?status=active` includes it; `?status=archived` excludes it.
  2. `POST /api/parcels/:id/deliver` → 200, status `DELIVERED`; active list excludes; archived list includes; one `parcel_status_events` row with `fromStatus: NEW`, `toStatus: DELIVERED`, `source: user`.
  3. Second `POST deliver` on same parcel → 200 idempotent; event count unchanged.
  4. New active parcel → `POST remove` → status `REMOVED`; archived with status column value `REMOVED`.
  5. Wrong user / unknown id → 404.
  6. `GET /api/parcels` without status → 400.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e -w @parcel-scrubber/api` passes (includes new spec)
- `npm run lint:api` passes

#### Manual Verification:

- N/A

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Web — archive list page

### Overview

Replace archive placeholder with a real archived parcels table and wire `listArchived()` on web `ParcelsService`.

### Changes Required:

#### 1. Web ParcelsService — listArchived

**File**: `apps/web/src/app/core/parcels/parcels.service.ts`

**Intent**: Fetch archived parcels from API.

**Contract**: Add `listArchived(): Promise<ParcelDto[]>` → `GET /api/parcels` with `params: { status: 'archived' }`.

#### 2. Archive list component

**Files**:

- `apps/web/src/app/features/archive/archive-list.component.ts` (new)
- `apps/web/src/app/features/archive/archive-list.component.html` (new)
- `apps/web/src/app/features/archive/archive-list.component.scss` (new)

**Intent**: Display archived parcels with status column; mirror active list loading/error/empty patterns without sync UI.

**Contract**:

- Standalone component; PrimeNG `CardModule`, `TableModule`, `MessageModule`.
- Signals: `loading`, `loadError`, `parcels` (same pattern as `ActiveListComponent`).
- `ngOnInit` → `listArchived()`.
- Table columns: Store, Description, Order date, Carrier, Tracking, **Status**.
- Status cell: human labels **Delivered** for `DELIVERED`, **Removed** for `REMOVED`.
- Reuse carrier label map pattern from active list (duplicate `CARRIER_LABELS` constant is acceptable).
- Tracking link: same `<a target="_blank" rel="noopener noreferrer">` pattern as active list.
- Empty state copy: e.g. "No archived parcels yet. Mark parcels Delivered or Remove them from the active list."
- `data-testid="archive-list-table"` on table when populated.

#### 3. Routes — swap placeholder

**File**: `apps/web/src/app/app.routes.ts`

**Intent**: Point `/archive` at real list.

**Contract**: Import `ArchiveListComponent`; replace `ArchivePlaceholderComponent` on `path: 'archive'`.

#### 4. Remove placeholder (optional cleanup)

**Files**: `apps/web/src/app/features/archive/archive-placeholder.component.*`

**Intent**: Remove dead placeholder once route uses `ArchiveListComponent`.

**Contract**: Delete placeholder files; ensure no remaining imports.

### Success Criteria:

#### Automated Verification:

- `npm run lint:web` passes
- `npm run build` passes (web compiles with new component)

#### Manual Verification:

- Sign in, archive a parcel via API or DB seed, open **Archive** — table shows parcel with Status column and working tracking link
- Empty archive shows empty-state message
- Active/Archive shell toggle still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Web — active list deliver/remove actions

### Overview

Add Actions column to active table with Delivered and Remove buttons, ConfirmDialog for Remove, optimistic UI, and web mutation methods.

### Changes Required:

#### 1. Web ParcelsService — mutations

**File**: `apps/web/src/app/core/parcels/parcels.service.ts`

**Intent**: Call deliver/remove API routes.

**Contract**:

- `deliverParcel(id: string): Promise<ParcelDto>` → `POST /api/parcels/${id}/deliver`
- `removeParcel(id: string): Promise<ParcelDto>` → `POST /api/parcels/${id}/remove`

#### 2. App config — ConfirmationService

**File**: `apps/web/src/app/app.config.ts`

**Intent**: Enable PrimeNG confirm dialog globally.

**Contract**: Add `ConfirmationService` from `primeng/api` to `providers` array (alongside existing `MessageService`).

#### 3. Active list — actions UI

**Files**:

- `apps/web/src/app/features/active/active-list.component.ts`
- `apps/web/src/app/features/active/active-list.component.html`
- `apps/web/src/app/features/active/active-list.component.scss` (minor layout for Actions column)

**Intent**: Wire deliver/remove with confirmation and optimistic removal.

**Contract**:

- Import `ConfirmDialogModule`; add `<p-confirmDialog />` to template (or shell — component-level is fine).
- Inject `ConfirmationService`.
- Template: new **Actions** column with:
  - `p-button` label **Delivered**, `data-testid="deliver-parcel-{id}"` or stable pattern, `(onClick)` → deliver handler.
  - `p-button` label **Remove**, severity secondary/outlined, `(onClick)` → `confirmationService.confirm({ message, accept })` then remove handler.
  - Confirm copy: e.g. "Remove this parcel from your active list? It will move to archive."
- **Deliver handler**: optimistic — remove parcel from `parcels` signal immediately; call `deliverParcel`; on error, re-insert parcel at prior index (keep reference before splice) and error toast.
- **Remove handler**: on accept, same optimistic pattern with `removeParcel`.
- Success toasts: "Marked as delivered" / "Removed from active list" (severity success, ~4s life).
- Error toasts: "Could not update parcel" (severity error).
- Disable action buttons on a row while its request is in-flight (optional per-row loading flag) to prevent double-submit.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (root)
- `npm run test` passes (unit tests; API e2e verified in Phase 2)
- `npm run build` passes

#### Manual Verification:

- Active table shows Actions column; Delivered one-click archives parcel and toast appears
- Remove shows confirm dialog; cancel keeps parcel; accept archives parcel
- Archive view shows newly archived parcels with correct Status
- Double-click Delivered does not error (idempotent API)
- Failed API (e.g. stop API mid-request) restores row on active list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `ParcelsService`: active/archived filters, deliver/remove transitions, idempotency, not-found
- `ParcelsController`: query validation, POST routes, HTTP status codes

### Integration Tests:

- `parcels.e2e-spec.ts`: full HTTP + DB + JWT cookie auth + event row assertions

### Manual Testing Steps:

1. `npm run dev` — sign in, sync parcels if needed
2. Mark parcel **Delivered** — verify gone from Active, in Archive with status Delivered
3. Mark another **Remove** — confirm dialog, verify Archive status Removed
4. Trigger sync — archived parcels stay archived; metadata still updates if re-imported
5. Toggle Active ↔ Archive in header — both lists load correctly
6. Empty active list after archiving all — empty state still shows Sync CTA

## Performance Considerations

Negligible — single-row updates by primary key; list queries already indexed on `[userId, status]`. Optimistic UI avoids full list reload on each action.

## Migration Notes

No schema migration. Existing parcels with active statuses work unchanged. Manual DB seeds for testing: any non-`DELIVERED`/`REMOVED` status is valid deliver/remove target.

## References

- PRD US-02, FR-009, FR-012, FR-013: `context/foundation/prd.md`
- Roadmap S-03: `context/foundation/roadmap.md`
- F-03 archive derivation: `context/archive/2026-06-06-parcel-prisma-model/plan.md`
- S-02 active list deferrals: `context/archive/2026-06-14-gmail-sync-active-parcels/plan-brief.md`
- `isArchivedStatus`: `apps/api/src/parcels/is-archived-status.ts`
- Active list patterns: `apps/web/src/app/features/active/active-list.component.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: API — archive list and status transitions

#### Automated

- [x] 1.1 `npm run lint:api` passes — 322e022
- [x] 1.2 `npm run test:api` passes (updated parcels unit specs) — 322e022

#### Manual

- [x] 1.3 N/A — no UI in this phase (skip or mark done when proceeding) — 322e022

### Phase 2: API — parcels HTTP e2e

#### Automated

- [x] 2.1 `npm run test:e2e -w @parcel-scrubber/api` passes (includes new spec) — 0054737
- [x] 2.2 `npm run lint:api` passes — 0054737

#### Manual

- [x] 2.3 N/A — 0054737

### Phase 3: Web — archive list page

#### Automated

- [x] 3.1 `npm run lint:web` passes — 5cb2edd
- [x] 3.2 `npm run build` passes (web compiles with new component) — 5cb2edd

#### Manual

- [x] 3.3 Archive page shows seeded/archived parcels with Status column and tracking links — 5cb2edd
- [x] 3.4 Empty archive shows empty-state message; shell toggle works — 5cb2edd

### Phase 4: Web — active list deliver/remove actions

#### Automated

- [x] 4.1 `npm run lint` passes
- [x] 4.2 `npm run test` passes (unit tests; e2e verified in Phase 2)
- [x] 4.3 `npm run build` passes

#### Manual

- [x] 4.4 Delivered one-click archives with toast; Remove uses confirm dialog
- [x] 4.5 Archive reflects actions; optimistic rollback on API failure verified
