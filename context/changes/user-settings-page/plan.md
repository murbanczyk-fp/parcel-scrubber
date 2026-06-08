# User Settings Page Implementation Plan

## Overview

Ship roadmap **S-01**: replace the `/settings` placeholder with a working form for Gmail scan label and scan period, backed by authenticated `GET`/`PATCH /api/settings` routes that consume the F-04 domain helpers (`resolveEffectiveSettings`, validation, upsert). This is the security/performance gate before north-star **S-02** — sync scope must be user-configurable with PRD defaults before any Gmail import runs.

## Current State Analysis

**API:** F-04 is complete. `UserSetting` Prisma model, helpers under `apps/api/src/user-settings/`, and `user-settings-schema.e2e-spec.ts` exist. No Nest settings module, no REST routes, no `BadRequestException` usage anywhere in the API yet.

**Web:** `/settings` route is wired in `app.routes.ts` behind `authGuard` with `SettingsPlaceholderComponent` (PrimeNG `p-card` stub). `AuthService` establishes the HTTP + signals pattern. No settings service, no data-entry forms, no Toast/MessageService infrastructure.

### Key Discoveries:

- F-04 handoff contract: `GET` loads rows → `resolveEffectiveSettings`; `PATCH` validates via helpers → `serializeSettingValue` → upsert per changed key; reset-to-default upserts the default value (no row delete) — `context/archive/2026-06-06-user-settings-model/plan.md`
- Auth pattern: `@UseGuards(JwtAuthGuard)` + `@CurrentUser()` on `GET /api/auth/me` — `apps/api/src/auth/auth.controller.ts`
- `AuthModule` exports `JwtAuthGuard` — new settings module imports `AuthModule`
- `app.e2e-spec.ts` mocks `PrismaService` for HTTP tests — controller unit tests follow same mock pattern (user chose unit over dedicated HTTP e2e)
- Validation bounds are settled: label non-empty ≤100 chars; period integer 1–365 — must match helpers, not re-litigate
- Merchant sender addresses are **not** settings fields (Gmail filter responsibility)

## Desired End State

A signed-in user opens `/settings`, sees current effective values (PRD defaults when no DB rows exist), edits Gmail scan label and scan period with live client validation, clicks Save, and receives a success toast. Values persist per user via `PATCH /api/settings` (partial body — only dirty fields). Invalid input shows field-level errors from both client validators and structured API 400 responses. `npm run lint && npm run test` pass. S-02 can call the same read path without retrofitting scope.

### Verification checklist:

1. New user (zero `user_settings` rows): `GET /api/settings` returns `{ gmailScanLabel: 'ParcelScrubber', scanPeriodDays: 30 }`.
2. User changes label only: PATCH sends `{ gmailScanLabel }` only; period unchanged in DB and response.
3. Invalid label (empty or >100 chars) or period (non-integer, <1, >365): 400 with field-keyed errors; form shows under matching input.
4. Settings page loads behind auth; logged-out user redirected to landing.
5. Scan period help text clarifies search depth only (not auto-archive per FR-006).

## What We're NOT Doing

- Gmail sync consuming settings — **S-02**
- Merchant sender address configuration — Gmail filters, not app settings
- Reset-to-default UI controls — user retypes defaults manually if needed
- Dedicated HTTP e2e for settings API — controller unit tests with mocked Prisma (per plan session decision)
- Additional settings beyond label + period — parked; F-04 schema supports future keys
- Shared TypeScript package for `EffectiveUserSettings` — duplicate a slim type alias in web for now
- Auto-save — explicit Save button only
- Schema or migration changes — F-04 model is final for this slice

## Implementation Approach

Three phases: API REST layer first (testable in isolation), then Angular form replacing the placeholder, then Toast infrastructure and cross-workspace verification. PATCH accepts a partial body; service validates and upserts only keys present in the request. Angular sends dirty fields only on Save. Client validators mirror F-04 bounds; server remains source of truth via helper throws mapped to structured 400 errors.

## Critical Implementation Details

**Partial PATCH merge:** Service loads `findMany({ where: { userId } })`, resolves effective settings, applies only keys present in the request body, validates those keys, upserts them, then re-fetches and returns the new effective document. Omitted keys are untouched.

**Structured 400 errors:** Introduce a consistent shape for validation failures, e.g. `{ errors: [{ field: 'gmailScanLabel' | 'scanPeriodDays', message: string }] }`. Map `normalizeGmailScanLabel` / `validateScanPeriodDays` throws to field + message. Unknown keys in body → 400 with a generic or field-less error.

**Live validation + Save:** Reactive form validators run on value changes (status `INVALID` disables Save). On Save, PATCH only keys whose values differ from the loaded snapshot. After success, update the saved snapshot (form pristine) and show toast.

**Toast host:** Add `p-toast` to `AppShellComponent` and register `MessageService` in `app.config.ts` providers — first toast usage in the app; settings page injects `MessageService` for save success.

## Phase 1: Settings API

### Overview

Add Nest `SettingsModule` with service and controller exposing authenticated `GET`/`PATCH /api/settings`, structured validation errors, and controller/service unit tests with mocked Prisma.

### Changes Required:

#### 1. Settings service

**File**: `apps/api/src/settings/settings.service.ts` (new)

**Intent**: Load and persist per-user settings using F-04 helpers; keep HTTP layer thin.

**Contract**:
- `getEffectiveSettings(userId: string): Promise<EffectiveUserSettings>` — `prisma.userSetting.findMany({ where: { userId }, select: { settingKey, settingValue } })` → `resolveEffectiveSettings(rows)`.
- `updateSettings(userId: string, patch: Partial<EffectiveUserSettings>): Promise<EffectiveUserSettings>` — for each key in `patch`, validate (`normalizeGmailScanLabel` / `validateScanPeriodDays`); coerce `scanPeriodDays` with `Number(raw)` before validate and reject `NaN`; `serializeSettingValue`, `prisma.userSetting.upsert` with `where: { userId_settingKey: { userId, settingKey } }`; re-fetch and return effective settings.
- Reject empty patch body with 400.
- Reject unknown body keys (only `gmailScanLabel` and `scanPeriodDays` allowed).

#### 2. Validation error helper

**File**: `apps/api/src/settings/settings-validation.error.ts` (new)

**Intent**: Map domain helper throws to structured field errors consumable by the Angular form.

**Contract**: Export `SettingsValidationError` (or similar) carrying `errors: { field: keyof EffectiveUserSettings; message: string }[]`. Service catches helper throws and wraps into this type; controller maps to `BadRequestException` with the errors array in the response body.

#### 3. Settings controller

**File**: `apps/api/src/settings/settings.controller.ts` (new)

**Intent**: Expose REST endpoints scoped to the authenticated user.

**Contract**:
- `@Controller('settings')` — resolves to `/api/settings` via global prefix.
- `GET` — `@UseGuards(JwtAuthGuard)`, `@CurrentUser() user`, returns `EffectiveUserSettings`.
- `PATCH` — same guard; body type `Partial<EffectiveUserSettings>` (plain object, no class-validator yet); delegates to service; `SettingsValidationError` → 400 with `{ errors: [...] }`.

#### 4. Settings module

**Files**: `apps/api/src/settings/settings.module.ts`, `apps/api/src/settings/index.ts` (new)

**Intent**: Wire module into the app following `AuthModule` / `HealthModule` conventions.

**Contract**: Import `AuthModule` (for `JwtAuthGuard`). Register controller + service. Export service if S-02 needs it later (optional — can omit export until S-02).

#### 5. App module registration

**File**: `apps/api/src/app.module.ts`

**Intent**: Activate settings routes.

**Contract**: Add `SettingsModule` to `imports` array.

#### 6. Controller/service unit tests

**Files**: `apps/api/src/settings/settings.service.spec.ts`, `apps/api/src/settings/settings.controller.spec.ts` (new)

**Intent**: Prove GET default resolution, PATCH upsert, partial update, and 400 mapping without real Postgres.

**Contract**:
- Mock `PrismaService.userSetting.findMany` and `.upsert`.
- GET with empty `findMany` → PRD defaults.
- PATCH `{ gmailScanLabel: 'MyLabel' }` → upsert called once for that key; response reflects change.
- PATCH invalid label / period → structured 400 errors with correct `field`.
- PATCH empty body → 400.
- Controller spec: verify guard decorators present; unauthorized request returns 401 (mock guard or integration-style with `JwtAuthGuard` overridden).

### Success Criteria:

#### Automated Verification:

- API unit tests pass: `npm run test:api`
- API lint passes: `npm run lint:api`
- API build passes: `npm run build:api`
- Existing e2e suite still passes: `npm run test:e2e -w @parcel-scrubber/api`

#### Manual Verification:

- `curl` or browser devtools: authenticated `GET /api/settings` returns defaults for new user
- `PATCH` with invalid period returns `{ errors: [{ field: 'scanPeriodDays', ... }] }`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Settings Page UI

### Overview

Replace `SettingsPlaceholderComponent` with a real settings page: `SettingsService` for HTTP, reactive form with live validation, explicit Save with partial PATCH, field-level error display, and scan-period help text.

### Changes Required:

#### 1. Settings types

**File**: `apps/web/src/app/core/settings/settings.types.ts` (new)

**Intent**: Type the API contract on the web side without a shared package.

**Contract**: `EffectiveUserSettings` type `{ gmailScanLabel: string; scanPeriodDays: number }`. `SettingsValidationErrorResponse` type `{ errors: { field: keyof EffectiveUserSettings; message: string }[] }`. `PatchUserSettings` as `Partial<EffectiveUserSettings>`. Comment that validation bounds must stay aligned with API constants (`GMAIL_SCAN_LABEL_MAX_LENGTH`, `SCAN_PERIOD_DAYS_MIN`/`MAX` in `apps/api/src/user-settings/`).

#### 2. Settings service

**File**: `apps/web/src/app/core/settings/settings.service.ts` (new)

**Intent**: HTTP client for settings following `AuthService` patterns.

**Contract**:
- `providedIn: 'root'`, `inject(HttpClient)`.
- `load(): Promise<EffectiveUserSettings>` — `GET /api/settings` via `firstValueFrom`.
- `save(patch: PatchUserSettings): Promise<EffectiveUserSettings>` — `PATCH /api/settings`.
- Optional signals: `loading`, `saving`, `error` — or keep state in the component; prefer minimal service surface matching `AuthService` simplicity.

#### 3. Settings service unit test

**File**: `apps/web/src/app/core/settings/settings.service.spec.ts` (new)

**Intent**: Verify GET/PATCH URLs and response typing.

**Contract**: `HttpTestingController.expectOne('/api/settings')` for GET and PATCH; mirror `auth.service.spec.ts` setup.

#### 4. Settings page component

**Files**:
- `apps/web/src/app/features/settings/settings-page.component.ts` (new)
- `apps/web/src/app/features/settings/settings-page.component.html` (new)
- `apps/web/src/app/features/settings/settings-page.component.scss` (new)

**Intent**: Replace placeholder with the first data-entry form in the app.

**Contract**:
- Standalone component; imports `ReactiveFormsModule`, `CardModule`, `InputTextModule`, `InputNumberModule`, `ButtonModule`, `MessageModule` (field errors).
- On init: load settings via `SettingsService`, patch form values, store `savedSnapshot` for dirty detection.
- Form controls:
  - `gmailScanLabel`: `Validators.required`, `Validators.maxLength(100)` (trim on save).
  - `scanPeriodDays`: `Validators.required`, `Validators.min(1)`, `Validators.max(365)`, integer check (custom validator or `Validators.pattern` for whole numbers).
- Live validation: validators evaluate on value changes; show inline error under each field when invalid and touched/dirty.
- Help text under scan period: *"How far back Gmail is searched on sync — does not remove parcels from your lists."*
- Save button: disabled when form invalid, pristine, computed patch is empty (user reverted edits — dirty form but values match `savedSnapshot`), or save in flight.
- On Save: build partial patch from fields that differ from `savedSnapshot`; if patch is empty, do not call API (button should already be disabled); call `save(patch)`; on success update snapshot + `markAsPristine()`; on failure catch `HttpErrorResponse` — if `error.error?.errors` is an array, map each `{ field, message }` to the matching control via `setErrors({ server: message })` (NestJS 11 returns `{ errors: [...] }` at the top level of the 400 body).
- Loading state while initial GET runs (simple message or disabled form).

#### 5. Route wiring

**File**: `apps/web/src/app/app.routes.ts`

**Intent**: Point `/settings` at the new component.

**Contract**: Replace `SettingsPlaceholderComponent` import with `SettingsPageComponent`; keep `canActivate: [authGuard]`.

#### 6. Remove placeholder

**Files**: `apps/web/src/app/features/settings/settings-placeholder.component.*` (delete)

**Intent**: Avoid dead code once the real page ships.

**Contract**: Delete placeholder TS/HTML/SCSS; update any spec references (shell spec only links to `/settings` route — should still pass).

#### 7. Settings page component test

**File**: `apps/web/src/app/features/settings/settings-page.component.spec.ts` (new)

**Intent**: Smoke-test form render, Save disabled when pristine, Save calls service with dirty patch.

**Contract**: Mock `SettingsService`; verify validators reject out-of-range period; assert client bounds match API (`maxLength(100)`, `min(1)`, `max(365)`).

### Success Criteria:

#### Automated Verification:

- Web unit tests pass: `npm run test:web`
- Web lint passes: `npm run lint:web`
- Web build passes: `npm run build:web`

#### Manual Verification:

- Logged-in user opens `/settings` — sees defaults `ParcelScrubber` / `30` for new user
- Edit label, Save — reload page shows persisted value
- Invalid period shows inline error before Save; API 400 also maps to field error
- Save disabled when form pristine or invalid

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Toast & Verification

### Overview

Add PrimeNG Toast infrastructure for save-success feedback and run full monorepo verification.

### Changes Required:

#### 1. MessageService provider

**File**: `apps/web/src/app/app.config.ts`

**Intent**: Enable toast notifications app-wide.

**Contract**: Add `MessageService` from `primeng/api` to `providers` array.

#### 2. Toast host in shell

**Files**:
- `apps/web/src/app/layout/app-shell/app-shell.component.ts`
- `apps/web/src/app/layout/app-shell/app-shell.component.html`

**Intent**: Render toast container for any feature to use.

**Contract**: Import `ToastModule`; add `<p-toast />` to shell template (typically top-right). No change to existing nav behavior on `/settings`.

#### 3. Save success toast

**File**: `apps/web/src/app/features/settings/settings-page.component.ts`

**Intent**: Confirm successful save per plan session decision.

**Contract**: Inject `MessageService`; on successful `save()`, `add({ severity: 'success', summary: 'Settings saved', life: 3000 })` (wording can be tuned). Do not toast on validation failure — field errors suffice.

#### 4. Shell spec update

**File**: `apps/web/src/app/layout/app-shell/app-shell.component.spec.ts`

**Intent**: Keep shell tests green after ToastModule import.

**Contract**: Provide `MessageService` in test bed if required by ToastModule.

### Success Criteria:

#### Automated Verification:

- Full monorepo lint passes: `npm run lint`
- Full monorepo unit tests pass: `npm run test`
- API e2e still passes: `npm run test:e2e -w @parcel-scrubber/api`

#### Manual Verification:

- Save settings → success toast appears
- Header Settings cog still navigates to `/settings`; Active/Archive SelectButton deselected on settings route (existing F-01 behavior)
- Logged-out user cannot reach `/settings`
- End-to-end happy path: sign in → settings → change period → save → refresh → value persisted

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- **API service:** GET defaults, PATCH partial upsert, validation error mapping, empty patch rejection
- **API controller:** Guard wiring, 400/401 response shapes
- **Web service:** GET/PATCH HTTP contract
- **Web component:** Form validators (live), Save dirty-only patch, API error mapping

### Integration Tests:

- Rely on existing `user-settings-schema.e2e-spec.ts` for DB/helper integration (no new HTTP e2e per decision)
- Manual authenticated GET/PATCH via dev proxy during phase 1 manual check

### Manual Testing Steps:

1. Sign in with Google on `npm run dev`
2. Navigate to Settings — confirm defaults for new account
3. Change scan label to a custom value, Save — toast + persistence on refresh
4. Set period to 0 or 400 — inline validation blocks Save
5. Bypass client validation (devtools PATCH) — API returns field errors
6. Confirm help text visible under scan period field
7. Confirm no reset buttons; user can manually restore defaults by retyping and saving

## Performance Considerations

Settings reads/writes are single-user, at-most-two-row operations — no caching or pagination needed. Partial PATCH minimizes payload. Zero-row default path is the common case until first save.

## Migration Notes

No schema changes. Deploy requires only API + web code; F-04 migration must already be applied (`user_settings` table). Rollback is code-only revert.

## References

- Roadmap S-01: `context/foundation/roadmap.md`
- PRD FR-017, FR-003, FR-006: `context/foundation/prd.md`
- F-04 plan (API contract handoff): `context/archive/2026-06-06-user-settings-model/plan.md`
- Domain helpers: `apps/api/src/user-settings/`
- Auth pattern: `apps/api/src/auth/auth.controller.ts`
- Web auth HTTP pattern: `apps/web/src/app/core/auth/auth.service.ts`
- Settings placeholder: `apps/web/src/app/features/settings/settings-placeholder.component.html`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Settings API

#### Automated

- [x] 1.1 API unit tests pass: `npm run test:api` — 8a9c1be
- [x] 1.2 API lint passes: `npm run lint:api` — 8a9c1be
- [x] 1.3 API build passes: `npm run build:api` — 8a9c1be
- [x] 1.4 Existing e2e suite still passes: `npm run test:e2e -w @parcel-scrubber/api` — 8a9c1be

#### Manual

- [x] 1.5 Authenticated GET returns PRD defaults for user with zero rows — 8a9c1be
- [x] 1.6 PATCH invalid input returns structured field errors — 8a9c1be

### Phase 2: Settings Page UI

#### Automated

- [x] 2.1 Web unit tests pass: `npm run test:web` — 5e89b94
- [x] 2.2 Web lint passes: `npm run lint:web` — 5e89b94
- [x] 2.3 Web build passes: `npm run build:web` — 5e89b94

#### Manual

- [x] 2.4 Settings form loads, validates live, saves dirty fields only — 5e89b94
- [x] 2.5 API 400 errors display under matching fields — 5e89b94

### Phase 3: Toast & Verification

#### Automated

- [x] 3.1 Full monorepo lint passes: `npm run lint`
- [x] 3.2 Full monorepo unit tests pass: `npm run test`
- [x] 3.3 API e2e still passes: `npm run test:e2e -w @parcel-scrubber/api`

#### Manual

- [x] 3.4 Save success shows toast; full sign-in → settings → save → refresh flow works
