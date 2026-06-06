# User Settings Model Implementation Plan

## Overview

Land extensible per-user settings persistence in PostgreSQL for roadmap **F-04**: Prisma `UserSetting` key–value model (`userId` + `settingKey` + `settingValue`), pure domain helpers for known keys, PRD defaults, validation, and effective-value resolution, and schema integration e2e. Defaults live in the app layer only — **no DB row until the user changes a setting** (S-01 write path). No REST routes, auth changes, Nest settings module, or Angular UI — those ship in **S-01**.

## Current State Analysis

**Database:** `apps/api/prisma/schema.prisma` has `User` with a `parcels` relation only. Three migrations exist (`init`, `add_user_avatar_url`, `add_parcel_models`). No settings table.

**Gap:** S-01 (settings page) and S-02 (Gmail sync) need persisted scan label and scan period with PRD defaults (`ParcelScrubber`, 30 days). Without F-04, sync scope would be hardcoded or retrofitted later.

**Web:** `/settings` route exists with `SettingsPlaceholderComponent` — no API calls.

### Key Discoveries:

- F-03 (`parcel-prisma-model`) established the foundation pattern: schema → pure helpers under `apps/api/src/<domain>/` → dedicated schema e2e with real Postgres — no Nest module.
- Roadmap F-04 requires extensibility without per-setting migrations — key–value schema satisfies this.
- `parcel-schema.e2e-spec.ts` provides the e2e template (`E2E_DATABASE_URL`, `_test` DB guard, `migrate deploy`, truncate).
- CI already provisions Postgres for e2e (`.github/workflows/lint-and-test.yml` lines 47–71); new e2e spec runs automatically via `test:e2e` glob.
- Merchant sender filtering is **not** a settings field — Allegro/AliExpress filtering lives in Gmail filters; app trusts the scan label (see archived parcel research).

## Desired End State

After F-04, a developer runs `npm run prisma:migrate:dev -w @parcel-scrubber/api` and gets a `user_settings` table storing key–value rows per user. Domain helpers in `apps/api/src/user-settings/` define known keys, PRD defaults, serialization, validation, and `resolveEffectiveSettings(rows)` — empty rows array yields defaults. Integration e2e proves unique `(userId, settingKey)`, cascade delete, and zero-row default resolution. `npm run lint:api`, `npm run test:api`, and `npm run test:e2e -w @parcel-scrubber/api` pass.

### Verification checklist:

1. User with **no** settings rows: `resolveEffectiveSettings([])` returns `{ gmailScanLabel: 'ParcelScrubber', scanPeriodDays: 30 }`.
2. User with one overridden key: effective settings merge stored value over defaults for that key only.
3. Duplicate `(userId, settingKey)` insert fails (unique constraint).
4. Deleting a user cascades to all their settings rows.
5. Helpers validate on save path: empty label, label > 100 chars, period outside 1–365.

## What We're NOT Doing

- Nest `SettingsModule`, controllers, or REST routes (`GET`/`PATCH /api/settings`) — **S-01**
- Angular settings form, types, or HTTP client — **S-01**
- Gmail sync consuming settings — **S-02**
- Auth service changes (no settings row creation on OAuth login)
- Deleting rows when user resets to default — S-01 upserts the default value and keeps the row
- Merchant sender address configuration (Gmail filter responsibility, not app settings)
- DB-level validation of setting values (app layer owns bounds per known key)

## Implementation Approach

Add `UserSetting` as a 1:N relation on `User` following F-03 conventions (camelCase Prisma fields, `@map` snake_case columns, `cuid()` IDs, `onDelete: Cascade`). All values stored as strings; known keys and types enforced in helpers. `@@unique([userId, settingKey])` prevents duplicate keys per user. Dedicated `user-settings-schema.e2e-spec.ts`; extract shared table truncation to a test helper used by both parcel and settings e2e specs.

## Critical Implementation Details

**Defaults are app-only:** There are no Prisma `@default` values on setting keys. `DEFAULT_USER_SETTINGS` in helpers is the single source of truth for PRD defaults. S-02 reads via `resolveEffectiveSettings(await prisma.userSetting.findMany({ where: { userId } }))` — zero rows is normal and expected.

**Known keys registry:** Export `USER_SETTING_KEYS` constant object (e.g. `GMAIL_SCAN_LABEL: 'gmailScanLabel'`, `SCAN_PERIOD_DAYS: 'scanPeriodDays'`). Future settings add a key constant + validation/parser in helpers — no migration.

**Reset-to-default:** S-01 upserts the default value into the row — no delete-on-reset. New users still have zero rows until first save.

**Validation bounds:** Label ≤100 chars and scan period 1–365 days are app-layer defaults for F-04 (not spelled out in PRD FR-017). S-01 form validation and API PATCH must match helper contracts — do not re-litigate bounds in the UI slice.

## Phase 1: Prisma Schema & Migration

### Overview

Add `UserSetting` key–value model with unique `(userId, settingKey)` and forward migration.

### Changes Required:

#### 1. Prisma schema — UserSetting model

**File**: `apps/api/prisma/schema.prisma`

**Intent**: Versatile per-user settings storage — one row per changed setting key.

**Contract**:
- `UserSetting`: `id`, `userId`, `settingKey String`, `settingValue String @db.Text`, `createdAt`, `updatedAt`.
- All columns `@map` snake_case; `@@map("user_settings")`.
- `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`.
- `@@unique([userId, settingKey])`.
- `User`: add `settings UserSetting[]` relation field.

#### 2. Migration SQL

**File**: `apps/api/prisma/migrations/<timestamp>_add_user_settings/migration.sql` (generated)

**Intent**: Create `user_settings` table with FK to `users` and composite unique on `(user_id, setting_key)`.

**Contract**: Migration creates table with no default-value columns for specific keys — table is generic key–value storage only.

#### 3. Regenerate client

**Intent**: Ensure `@prisma/client` types include `UserSetting` for helpers and e2e.

**Contract**: `npm run prisma:generate -w @parcel-scrubber/api` succeeds; TypeScript sees `UserSetting` model.

### Success Criteria:

#### Automated Verification:

- Schema validates: `npx prisma validate --schema apps/api/prisma/schema.prisma`
- Migration applies on dev DB: `npm run prisma:migrate:dev -w @parcel-scrubber/api -- --name add_user_settings`
- Client generates: `npm run prisma:generate -w @parcel-scrubber/api`
- API lint passes: `npm run lint:api`
- Existing unit tests pass: `npm run test:api`

#### Manual Verification:

- Inspect migration SQL — composite unique on `(user_id, setting_key)`, FK cascades on user delete
- Optional psql: `\d user_settings` confirms column types

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Domain Helpers

### Overview

Add pure TypeScript helpers encoding known setting keys, PRD defaults, effective-value resolution, serialization, and validation — no Nest module wiring.

### Changes Required:

#### 1. Known keys and defaults

**File**: `apps/api/src/user-settings/user-setting-keys.ts`

**Intent**: Registry of supported setting keys — add new settings here without DB migration.

**Contract**:
- Export `USER_SETTING_KEYS` const object with at least `GMAIL_SCAN_LABEL: 'gmailScanLabel'` and `SCAN_PERIOD_DAYS: 'scanPeriodDays'`.
- Export `UserSettingKey` type derived from values.
- Export `DEFAULT_USER_SETTINGS`: `{ gmailScanLabel: 'ParcelScrubber', scanPeriodDays: 30 }`.

#### 2. Effective settings resolver

**File**: `apps/api/src/user-settings/resolve-effective-settings.ts`

**Intent**: Merge stored key–value rows over PRD defaults for S-01 reads and S-02 sync.

**Contract**:
- Export `EffectiveUserSettings` type: `{ gmailScanLabel: string; scanPeriodDays: number }`.
- Export `resolveEffectiveSettings(rows: ReadonlyArray<Pick<UserSetting, 'settingKey' | 'settingValue'>>): EffectiveUserSettings` — start from `DEFAULT_USER_SETTINGS`; for each known key present in rows, parse via `parseSettingValue` and apply; invalid stored values fall back to the default for that key only; ignore unknown keys (forward-compatible storage).

#### 3. Serialize and parse helpers

**File**: `apps/api/src/user-settings/parse-setting-value.ts`

**Intent**: Convert between string storage and typed values per known key.

**Contract**:
- Export `parseSettingValue(key: UserSettingKey, raw: string): string | number` — e.g. `scanPeriodDays` → integer via `parseInt`; `gmailScanLabel` → trimmed string.
- **Read path (defense in depth):** if a stored value fails validation (empty label, label > 100 chars, non-integer period, period outside 1–365), return the PRD default for that key from `DEFAULT_USER_SETTINGS` — do not throw. Callers (`resolveEffectiveSettings`) never see corrupt values.
- Export `serializeSettingValue(key: UserSettingKey, value: string | number): string` — inverse for S-01 upsert; caller must validate before serialize (save path throws).

#### 4. Validation helpers (save path)

**Files**:
- `apps/api/src/user-settings/normalize-gmail-scan-label.ts`
- `apps/api/src/user-settings/validate-scan-period-days.ts`

**Intent**: Enforce bounds on the **save path** (S-01 PATCH); read-path validation lives in `parseSettingValue` (invalid stored value → default per key, no throw).

**Contract**:
- `normalizeGmailScanLabel(raw: string): string` — trim; throw on empty; max 100 characters (save path).
- `validateScanPeriodDays(raw: number): number` — integer 1–365; throw on out-of-range (reject, do not clamp — save path only).

#### 5. Barrel export

**File**: `apps/api/src/user-settings/index.ts`

**Intent**: Convenient import path for downstream slices.

**Contract**: Re-export all public helpers, keys, and types; no side effects.

#### 6. Unit tests

**Files**: `apps/api/src/user-settings/*.spec.ts` (co-located)

**Intent**: Lock helper behavior without database.

**Contract**: Cover `resolveEffectiveSettings` with empty rows, single-key override, both keys set, unknown key ignored, corrupt stored values (empty label, non-numeric period, out-of-range period) falling back to defaults per key; parse/serialize round-trip; save-path validation edge cases (trim, empty label, period boundaries 1 and 365, out-of-range throws).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:api`
- Lint passes: `npm run lint:api`
- API build passes: `npm run build:api`

#### Manual Verification:

- Confirm `DEFAULT_USER_SETTINGS` matches PRD (`ParcelScrubber`, 30)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Schema Integration E2e

### Overview

Prove database constraints and relations with a real Postgres instance; DRY truncate helper across schema e2e specs.

### Changes Required:

#### 1. Shared truncate helper

**File**: `apps/api/test/truncate-app-tables.ts` (new)

**Intent**: DRY table cleanup across schema e2e specs as tables grow.

**Contract**: Export `truncateAppTables(client: PrismaClient)` — truncates `parcel_status_events`, `parcels`, `user_settings`, `users` with `CASCADE`.

#### 2. Update parcel schema e2e

**File**: `apps/api/test/parcel-schema.e2e-spec.ts`

**Intent**: Use shared truncate helper instead of inline SQL.

**Contract**: Import `truncateAppTables` from `./truncate-app-tables`; remove local duplicate function.

#### 3. User settings schema e2e

**File**: `apps/api/test/user-settings-schema.e2e-spec.ts` (new)

**Intent**: Smoke-test migration output and DB constraints — not HTTP routes.

**Contract**:
- Use `PrismaClient` directly; same `E2E_DATABASE_URL` / `_test` guard pattern as parcel e2e.
- `beforeAll`: `migrate deploy`; `truncateAppTables`.
- Tests:
  - Create user with no settings rows; `resolveEffectiveSettings([])` returns PRD defaults.
  - Insert `gmailScanLabel` row; read back; effective settings reflect override, `scanPeriodDays` still default.
  - Insert duplicate `(userId, settingKey)` — throws unique violation (`P2002`).
  - Delete user — settings rows cascade away.
- `afterEach`/`afterAll`: `truncateAppTables`.

#### 4. API README note

**File**: `apps/api/README.md`

**Intent**: Document that e2e covers user settings schema in addition to parcel schema.

**Contract**: Short addition to existing e2e section referencing `user-settings-schema.e2e-spec.ts`.

### Success Criteria:

#### Automated Verification:

- E2e passes locally with Postgres: `npm run test:e2e -w @parcel-scrubber/api`
- Full API suite: `npm run lint:api && npm run test:api && npm run test:e2e -w @parcel-scrubber/api`
- Monorepo lint/test: `npm run lint && npm run test`

#### Manual Verification:

- CI green on PR branch (existing Postgres docker step runs all e2e specs)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `resolveEffectiveSettings`: empty rows, partial override, full override, unknown key ignored, corrupt stored value → default per key
- `parseSettingValue` / `serializeSettingValue`: round-trip per known key; invalid raw on read → default for key
- `normalizeGmailScanLabel`: trim, empty rejection (throws), max length boundary (save path)
- `validateScanPeriodDays`: 1, 365, below 1, above 365 (save path throws)

### Integration Tests:

- `user-settings-schema.e2e-spec.ts`: zero-row defaults, key override, unique `(userId, settingKey)`, FK cascade
- `parcel-schema.e2e-spec.ts`: unchanged behavior after shared truncate refactor

### Manual Testing Steps:

1. Start local Postgres; set `DATABASE_URL` in `.env.local`
2. Run `npm run prisma:migrate:dev -w @parcel-scrubber/api`
3. Run `npm run test:e2e -w @parcel-scrubber/api`
4. Optional psql: confirm new user has zero rows in `user_settings` until S-01 saves

## Performance Considerations

Zero rows per user is the common case — no storage or query cost until settings change. S-02 fetches at most a handful of rows per user (`findMany` where `userId`). No caching needed in F-04.

## Migration Notes

Greenfield table — no data backfill. Deploy path: `npm run prisma:migrate:deploy -w @parcel-scrubber/api` before API code referencing `UserSetting`. Rollback: standard Prisma revert in dev; production requires manual down migration.

Downstream slices consume this schema as-is:
- **S-01:** `GET` loads rows + `resolveEffectiveSettings`; `PATCH` validates and upserts rows (including when value equals default — no delete-on-reset); form uses validation helpers
- **S-02:** `findMany({ where: { userId } })` → `resolveEffectiveSettings` → Gmail query `label:{gmailScanLabel} newer_than:{scanPeriodDays}d`

## References

- Roadmap F-04: `context/foundation/roadmap.md`
- PRD FR-017, FR-003, FR-006: `context/foundation/prd.md`
- F-03 precedent: `context/archive/2026-06-06-parcel-prisma-model/plan.md`
- Current schema: `apps/api/prisma/schema.prisma`
- Parcel e2e template: `apps/api/test/parcel-schema.e2e-spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Prisma Schema & Migration

#### Automated

- [ ] 1.1 Schema validates: `npx prisma validate --schema apps/api/prisma/schema.prisma`
- [ ] 1.2 Migration applies: `npm run prisma:migrate:dev -w @parcel-scrubber/api -- --name add_user_settings`
- [ ] 1.3 Client generates: `npm run prisma:generate -w @parcel-scrubber/api`
- [ ] 1.4 API lint passes: `npm run lint:api`
- [ ] 1.5 Existing unit tests pass: `npm run test:api`

#### Manual

- [ ] 1.6 Migration SQL has unique `(user_id, setting_key)` and FK cascade

### Phase 2: Domain Helpers

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test:api`
- [ ] 2.2 Lint passes: `npm run lint:api`
- [ ] 2.3 API build passes: `npm run build:api`

#### Manual

- [ ] 2.4 `DEFAULT_USER_SETTINGS` matches PRD defaults

### Phase 3: Schema Integration E2e

#### Automated

- [ ] 3.1 E2e passes locally: `npm run test:e2e -w @parcel-scrubber/api`
- [ ] 3.2 Full API suite: `npm run lint:api && npm run test:api && npm run test:e2e -w @parcel-scrubber/api`
- [ ] 3.3 Monorepo lint and unit tests pass: `npm run lint && npm run test`

#### Manual

- [ ] 3.4 CI green on PR branch
