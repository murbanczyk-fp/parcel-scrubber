# Manual Add and Edit Parcels — Implementation Plan

## Overview

Roadmap **S-04**: a signed-in user manually adds parcels Gmail sync did not import and edits parcel metadata — store, carrier, tracking number, description, order date, and tracking URL override — on both the active and archive lists. Builds on S-02 list/sync, S-03 deliver/remove, and F-03 parcel model helpers. No schema migrations.

## Current State Analysis

**Exists (S-02 / S-03 / F-03):**

- Prisma `Parcel` with `source: GMAIL | MANUAL`, `trackingUrl` override column, partial unique index on `(userId, trackingNumber) WHERE tracking_number IS NOT NULL`.
- Helpers: `normalizeTrackingNumber`, `resolveTrackingUrl`, `buildCarrierUrl`, `isArchivedStatus`, `mapParcelToDto`.
- `GET /api/parcels?status=active|archived`, `POST /api/parcels/:id/deliver`, `POST /api/parcels/:id/remove`.
- Active and archive PrimeNG tables; settings page form/validation/toast patterns.
- Web `ParcelsService`: list, deliver, remove, sync only.

**Missing for S-04:**

- `POST /api/parcels`, `GET /api/parcels/:id`, `PATCH /api/parcels/:id`
- `ParcelsService.createForUser`, `getByIdForUser`, `updateForUser`
- Field validation (`isSafeHttpUrl`, required fields, CUSTOM carrier label)
- Duplicate tracking → structured 400
- Web form component, routes, Add/Edit entry points

### Key Discoveries:

- `resolve-tracking-url.ts:9` documents S-04 must validate override scheme at write boundary.
- Gmail sync never writes `trackingUrl` — generation is read-time only (`sync.service.ts` fieldData omits it).
- Settings uses manual service validation + `SettingsValidationError` → `BadRequestException({ errors })` — no `class-validator`.
- Web app has no `DialogModule`, `SelectModule`, or `DatePicker` yet; settings uses `InputText` + `InputNumber` only.
- F-03 research: manual parcels may omit tracking in schema, but planning session requires tracking number on create.

## Desired End State

After S-04:

1. User on **Active** clicks **Add parcel** → navigates to `/active/new` → fills store, carrier (with custom label when CUSTOM), tracking number, order date (default today), optional description and tracking URL → saves → returns to Active with success toast; new row has `source: MANUAL`, `status: NEW`.
2. User clicks **Edit** on any row in **Active** or **Archive** → navigates to `/active/:id/edit` or `/archive/:id/edit` → same form pre-filled → saves → returns to originating list with toast.
3. API: create/update normalize tracking number, validate fields, persist override in `trackingUrl` column; responses expose **resolved** URL via `mapParcelToDto`. Empty/cleared override → `null` in DB → generated URL when carrier + number support it.
4. Duplicate `(userId, trackingNumber)` on create or update (different parcel id) → `400` with `{ errors: [{ field: 'trackingNumber', message: '...' }] }`.
5. Cross-user or missing parcel on get/update → `404 Parcel not found`.

**Verify manually:** add manual parcel with InPost number → tracking link works → edit description and order date → override tracking URL → clear override → link reverts to InPost template → attempt duplicate tracking on another parcel → see validation error → edit archived parcel store field → persists in archive list.

## What We're NOT Doing

- Restore / undeliver (S-05, FR-016)
- Editing `status` or `source` via CRUD form (status via S-03/S-05 actions)
- Schema migrations or new Prisma models
- Angular component specs (S-02/S-03 precedent)
- Bulk add/edit
- Auto-inferring transit status from carriers
- Changing Gmail sync upsert semantics beyond existing FR-007 archived refresh

## Implementation Approach

Extend `ParcelsModule` in place following S-03 phasing: API + unit tests → HTTP e2e → web shared form with new routes → list Add/Edit wiring. Validation lives in the service layer with a parcels-specific validation error type mirroring settings. Create always sets `source: MANUAL` and default `status: NEW`. Update accepts partial body for editable scalar fields only.

## Phase 1: API — create, get, update, and validation

### Overview

Add service methods and controller routes for manual parcel CRUD with field validation, tracking normalization, safe URL checks, and duplicate tracking handling.

### Changes Required:

#### 1. Validation helpers and error type

**File**: `apps/api/src/parcels/parcel-validation.error.ts` (new)

**Intent**: Provide structured field errors for parcel create/update, matching the settings API error shape the web form already handles.

**Contract**: Export `ParcelFieldError` (`field?: string`, `message: string`) and `ParcelValidationError` with readonly `errors: ParcelFieldError[]`.

**File**: `apps/api/src/parcels/is-safe-http-url.ts` (new)

**Intent**: Reject unsafe tracking URL overrides before persist (F-03 impl-review deferral).

**Contract**: Export `isSafeHttpUrl(value: string): boolean` — returns true only for `http:` or `https:` URLs parseable by `URL` constructor; reject `javascript:`, relative paths, and malformed strings.

**File**: `apps/api/src/parcels/index.ts`

**Intent**: Export new helpers if other modules need them (optional — at minimum export from parcels folder for tests).

**Contract**: Add exports for `isSafeHttpUrl` when used outside service.

#### 2. Request body types

**File**: `apps/api/src/parcels/parcel.dto.ts`

**Intent**: Define write contracts separate from response DTO.

**Contract**:

- `CreateParcelBody`: `store`, `carrier`, `trackingNumber`, `orderDate` (ISO date string `YYYY-MM-DD`), optional `description`, optional `trackingUrl`, optional `customCarrierLabel` (required in validation when `carrier === CUSTOM`).
- `UpdateParcelBody`: partial pick of writable fields — `store`, `description`, `carrier`, `customCarrierLabel`, `trackingNumber`, `trackingUrl`, `orderDate`. No `status`, `source`, or `id`.

#### 3. ParcelsService — create, get, update

**File**: `apps/api/src/parcels/parcels.service.ts`

**Intent**: Persist manual parcels and user edits with validation, normalization, and user scoping.

**Contract**:

- `createForUser(userId: string, body: CreateParcelBody): Promise<ParcelDto>`
  - Validate required fields: non-empty trimmed `store`, `carrier` enum, non-null normalized `trackingNumber`, parseable `orderDate`.
  - When `carrier === CUSTOM`: require non-empty trimmed `customCarrierLabel`.
  - When `trackingUrl` provided and non-empty: must pass `isSafeHttpUrl`; persist trimmed string. Omit or empty → store `null`.
  - Call `normalizeTrackingNumber` before persist; reject if result is `null` (tracking required on create per plan decision).
  - Check duplicate: `findFirst({ userId, trackingNumber })` → throw `ParcelValidationError` on conflict (prefer explicit check; also catch Prisma `P2002` as fallback → same 400).
  - `prisma.parcel.create` with `userId`, `source: MANUAL`, `status: NEW`, normalized fields, `orderDate` as `Date` (date-only semantics per `@db.Date`).
  - Return `mapParcelToDto(created)`.
- `getByIdForUser(userId: string, parcelId: string): Promise<ParcelDto>`
  - `findFirst({ id: parcelId, userId })`; missing → `NotFoundException('Parcel not found')`.
  - Return mapped DTO.
- `updateForUser(userId: string, parcelId: string, body: UpdateParcelBody): Promise<ParcelDto>`
  - Load parcel by `{ id, userId }`; missing → `NotFoundException`.
  - Reject empty patch (no keys) → `ParcelValidationError`.
  - Validate each present field (same rules as create for carrier/custom label/trackingUrl/orderDate/store).
  - For `trackingUrl`: explicit `null`, empty string, or whitespace-only → persist `null` (clear override).
  - For `trackingNumber`: normalize; if changed, duplicate check excluding current parcel id.
  - `prisma.parcel.update` with only provided fields; never update `source` or `status`.
  - Return `mapParcelToDto(updated)`.
- Private `validateCreateBody` / `validateUpdateBody` helpers collecting field errors then throw `ParcelValidationError` if any.
- Private `parseOrderDate(value: string): Date` — accept `YYYY-MM-DD`; reject invalid dates with field error.

#### 4. ParcelsController — routes

**File**: `apps/api/src/parcels/parcels.controller.ts`

**Intent**: Expose HTTP CRUD endpoints with auth and validation error mapping.

**Contract**:

- `POST /api/parcels` → `createForUser`; default Nest 201 (no `@HttpCode` override).
- `GET /api/parcels/:id` → `getByIdForUser`.
- `PATCH /api/parcels/:id` → `updateForUser`; 200 default for PATCH.
- Wrap service calls: `ParcelValidationError` → `BadRequestException({ errors: err.errors })`.
- Register `GET :id` route without conflicting with `POST :id/deliver` — Nest matches static segments (`deliver`, `remove`) before param routes; verify ordering in controller (deliver/remove handlers can stay as-is; `GET :id` is a new GET verb).
- Import `Body`, `Patch` from `@nestjs/common`.

#### 5. Unit tests — validation and service

**Files**:

- `apps/api/src/parcels/is-safe-http-url.spec.ts` (new)
- `apps/api/src/parcels/parcels.service.spec.ts` (extend)

**Intent**: Lock validation and persistence semantics without HTTP.

**Contract**: Cover:

- Create success with `MANUAL` source and `NEW` status.
- Create rejects missing store, tracking, order date, CUSTOM without label.
- Create rejects unsafe `trackingUrl`.
- Create rejects duplicate tracking number.
- Update partial fields; clear `trackingUrl` override.
- Update duplicate tracking on another parcel → validation error.
- Get/update NotFound for wrong user.
- Normalized tracking number stored uppercase trimmed.

#### 6. Controller unit tests

**File**: `apps/api/src/parcels/parcels.controller.spec.ts` (extend)

**Intent**: Verify route wiring and validation error mapping.

**Contract**: Mock service; assert POST/GET/PATCH delegate with user id; `ParcelValidationError` maps to 400 body shape.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:api -- --testPathPattern=parcels`
- Lint passes: `npm run lint`
- Typecheck/build passes: `npm run build`

#### Manual Verification:

- Not required before Phase 2 — HTTP e2e proves endpoints.

**Implementation Note**: Pause after Phase 1 automated verification passes before starting Phase 2.

---

## Phase 2: Parcels HTTP e2e

### Overview

Extend `parcels.e2e-spec.ts` with authenticated create, get, update, validation, and authorization cases against test Postgres.

### Changes Required:

#### 1. Parcels e2e tests

**File**: `apps/api/test/parcels.e2e-spec.ts`

**Intent**: Prove CRUD HTTP contract end-to-end with JWT cookie auth (same harness as existing list/deliver tests).

**Contract**: Add cases:

- `POST /api/parcels` creates manual parcel; response includes resolved `trackingUrl` for known carrier + number.
- `POST` with duplicate tracking → 400 + field error.
- `POST` with `javascript:` trackingUrl → 400.
- `GET /api/parcels/:id` returns parcel for owner; other user → 404.
- `PATCH /api/parcels/:id` updates fields; response reflects changes.
- `PATCH` clearing `trackingUrl` (`""` or `null`) → response URL generated from carrier template.
- `PATCH` duplicate tracking → 400.
- Created parcel appears in `GET ?status=active`; archived parcel still patchable (seed `DELIVERED`, patch store, assert 200).

### Success Criteria:

#### Automated Verification:

- E2e passes: `npm run test:api -- --testPathPattern=parcels.e2e`
- Full API test suite passes: `npm run test:api`

#### Manual Verification:

- Optional smoke via curl/Postman if e2e green.

**Implementation Note**: Pause after Phase 2 before web work.

---

## Phase 3: Web — shared parcel form and routes

### Overview

Add `ParcelFormComponent` with reactive form, PrimeNG inputs (including Select and DatePicker), HTTP client methods, and routes for add/edit.

### Changes Required:

#### 1. Web types

**File**: `apps/web/src/app/core/parcels/parcels.types.ts`

**Intent**: Mirror API write contracts on the client.

**Contract**:

- `CreateParcelPayload` and `UpdateParcelPayload` type aliases aligned with API bodies.
- Reuse existing `ParcelCarrier` union for carrier dropdown values.

#### 2. ParcelsService HTTP methods

**File**: `apps/web/src/app/core/parcels/parcels.service.ts`

**Intent**: Client facade for CRUD endpoints.

**Contract**:

- `getParcel(id: string): Promise<ParcelDto>` → `GET /api/parcels/:id`
- `createParcel(body: CreateParcelPayload): Promise<ParcelDto>` → `POST /api/parcels`
- `updateParcel(id: string, body: UpdateParcelPayload): Promise<ParcelDto>` → `PATCH /api/parcels/:id`
- Continue using `firstValueFrom` and relative `/api/...` URLs.

#### 3. ParcelFormComponent

**Files** (new under `apps/web/src/app/features/parcels/`):

- `parcel-form.component.ts`
- `parcel-form.component.html`
- `parcel-form.component.scss`

**Intent**: Single form for create and edit modes; follow settings page patterns (signals, reactive form, field errors, server error mapping).

**Contract**:

- Inputs: `mode: 'create' | 'edit'`, `parcelId?: string`, `returnPath: '/active' | '/archive'`.
- Form fields: store (text), carrier (`p-select` or equivalent), customCarrierLabel (visible when CUSTOM), trackingNumber, orderDate (`p-datepicker`, default today on create), description (optional textarea or text), trackingUrl (optional — help text: “Leave empty to use carrier link; clear to revert”).
- Client validators mirror API required rules: store, carrier, tracking number, order date; CUSTOM requires label.
- On create init: `orderDate` defaults to today (local date, submit as `YYYY-MM-DD`).
- On edit init: load via `getParcel(id)`; populate form including empty trackingUrl field when no override (display hint that clearing saves revert — edit mode sends `trackingUrl: ''` only when user clears the field).
- Submit: create → `createParcel`; edit → `updateParcel` with dirty fields only (settings `buildPatch` pattern).
- Cancel navigates to `returnPath` without save.
- Save success: toast + navigate to `returnPath`.
- Handle `HttpErrorResponse` 400 `{ errors: [{ field, message }] }` → apply to form fields (settings pattern).
- 401 → surface re-login message consistent with active list.
- `data-testid` on form, submit, cancel, key fields.

**PrimeNG imports**: `SelectModule`, `DatePickerModule` (or project-equivalent), `InputTextModule`, `ButtonModule`, `MessageModule`, `TextareaModule` if used — match package versions already in `apps/web/package.json`.

#### 4. Route wrapper components (thin)

**Files** (new):

- `apps/web/src/app/features/parcels/parcel-create-page.component.ts` — hosts form `mode=create`, `returnPath='/active'`
- `apps/web/src/app/features/parcels/parcel-edit-page.component.ts` — reads `:id` from route, `returnPath` from route data or URL prefix (`active` vs `archive`)

**Intent**: Keep routing declarative; form stays reusable.

**Contract**: Edit page sets `returnPath` to `/active` when route is under `active/:id/edit`, `/archive` when under `archive/:id/edit`.

#### 5. App routes

**File**: `apps/web/src/app/app.routes.ts`

**Intent**: Register add/edit routes behind `authGuard`.

**Contract**:

- `{ path: 'active/new', component: ParcelCreatePageComponent, canActivate: [authGuard] }`
- `{ path: 'active/:id/edit', component: ParcelEditPageComponent, canActivate: [authGuard], data: { returnPath: '/active' } }`
- `{ path: 'archive/:id/edit', component: ParcelEditPageComponent, canActivate: [authGuard], data: { returnPath: '/archive' } }`
- Place `:id/edit` routes after `active` list route and before catch-all; `active/new` before `active/:id/edit` to avoid param capture of `new`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Web build passes: `npm run build`

#### Manual Verification:

- Navigate to `/active/new` while signed in → form renders with today’s date.
- Submit valid manual parcel → lands on Active with new row (after Phase 4 wiring) or verify via API if list button not yet added.
- Direct `/active/:id/edit` loads existing parcel fields.

**Implementation Note**: Pause for manual form QA before Phase 4.

---

## Phase 4: List integration — Add and Edit entry points

### Overview

Wire Add button on Active header and Edit actions on Active and Archive tables; connect navigation and post-save list refresh.

### Changes Required:

#### 1. Active list — Add button

**Files**:

- `apps/web/src/app/features/active/active-list.component.html`
- `apps/web/src/app/features/active/active-list.component.ts`

**Intent**: Primary entry for manual add per PRD flow.

**Contract**:

- Header actions: add **Add parcel** button (outline/secondary styling to complement Sync) linking to `/active/new` via `RouterLink` or `router.navigate`.
- `data-testid="add-parcel"`.

#### 2. Active list — Edit action

**Files**: same as above

**Intent**: Row-level edit entry.

**Contract**:

- Actions column: add **Edit** button/link → `/active/{{ parcel.id }}/edit`.
- `data-testid="'edit-parcel-' + parcel.id"`.
- Coexist with Deliver/Remove buttons; no confirm dialog for edit navigation.

#### 3. Archive list — Edit action

**Files**:

- `apps/web/src/app/features/archive/archive-list.component.html`
- `apps/web/src/app/features/archive/archive-list.component.ts`

**Intent**: Allow metadata fixes on archived parcels.

**Contract**:

- Add Actions column (or link in row) with **Edit** → `/archive/{{ parcel.id }}/edit`.
- Archive remains read-only for deliver/remove; edit only.

#### 4. Post-save list refresh

**File**: `apps/web/src/app/features/parcels/parcel-form.component.ts`

**Intent**: Ensure lists show fresh data after save.

**Contract**: Navigate to `returnPath` after success; target list components already reload on `ngOnInit` — verify returning to Active/Archive triggers fresh `listActive`/`listArchived`. If route reuse prevents reload, call list refresh via navigation `onSameUrlNavigation: 'reload'` in router config or re-run load in list `ngOnInit` (default on component recreate is sufficient when navigating away and back).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Full monorepo tests pass: `npm run test`

#### Manual Verification:

- Active: Add parcel → fill form → save → row appears with store, date, tracking link.
- Active: Edit row → change description → save → table shows update.
- Archive: Edit archived parcel → change store → save → archive table updates.
- Override URL then clear → tracking column shows generated link.
- Duplicate tracking on create shows inline field error.

**Implementation Note**: Final manual sign-off completes S-04.

---

## Testing Strategy

### Unit Tests:

- `isSafeHttpUrl` — accept http/https, reject javascript/malformed
- `ParcelsService` — create/update validation, normalization, duplicate detection, NotFound
- `ParcelsController` — delegation and 400 mapping

### Integration Tests:

- `parcels.e2e-spec.ts` — full CRUD HTTP with JWT cookie and Postgres

### Manual Testing Steps:

1. Sign in → Active → Add parcel with InPost tracking → verify link opens carrier URL.
2. Edit parcel: change order date and description → verify persistence.
3. Set custom tracking URL override → verify override used → clear field → verify generated URL returns.
4. Attempt create with tracking number matching existing parcel → verify error message.
5. Archive a parcel → Edit from archive → change store → verify archive table.
6. Edit Gmail-synced parcel tracking number → save → verify no regression on list display.

## Performance Considerations

Negligible — single-row create/update. Duplicate check is indexed lookup on `(userId, trackingNumber)`. No list pagination changes.

## Migration Notes

No schema migrations. Deploy is code-only API + web. Rollback reverts routes and endpoints; existing parcels unchanged.

## References

- PRD FR-010, FR-011, FR-015: `context/foundation/prd.md`
- Roadmap S-04: `context/foundation/roadmap.md`
- F-03 parcel model research: `context/archive/2026-06-06-parcel-prisma-model/research.md`
- S-03 slice pattern: `context/archive/2026-06-22-deliver-remove-archive/plan.md`
- Settings validation pattern: `apps/api/src/settings/settings.service.ts`, `apps/web/src/app/features/settings/settings-page.component.ts`
- Tracking URL resolution: `apps/api/src/parcels/resolve-tracking-url.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: API create/update + validation

#### Automated

- [ ] 1.1 Unit tests pass: `npm run test:api -- --testPathPattern=parcels`
- [ ] 1.2 Lint passes: `npm run lint`
- [ ] 1.3 Typecheck/build passes: `npm run build`

#### Manual

- [ ] 1.4 (none — defer to Phase 2 e2e)

### Phase 2: Parcels HTTP e2e

#### Automated

- [ ] 2.1 E2e passes: `npm run test:api -- --testPathPattern=parcels.e2e`
- [ ] 2.2 Full API test suite passes: `npm run test:api`

#### Manual

- [ ] 2.3 Optional smoke via curl/Postman if e2e green

### Phase 3: Web form + routes

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Web build passes: `npm run build`

#### Manual

- [ ] 3.3 `/active/new` renders form with today’s date while signed in
- [ ] 3.4 Direct `/active/:id/edit` loads existing parcel fields

### Phase 4: List integration

#### Automated

- [ ] 4.1 Full monorepo tests pass: `npm run test`

#### Manual

- [ ] 4.2 Add parcel from Active → appears in table with correct link
- [ ] 4.3 Edit from Active and Archive → changes persist
- [ ] 4.4 URL override clear reverts to generated link; duplicate tracking shows field error
