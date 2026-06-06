# Parcel Prisma Model Implementation Plan

## Overview

Land the PostgreSQL persistence layer for parcels: Prisma enums (`ParcelSource`, `Carrier`, `ParcelStatus`, `StatusEventSource`), `Parcel` and `ParcelStatusEvent` models with `User` relation, a migration including a partial unique index on `(userId, trackingNumber)`, pure domain helpers for archive/URL/normalization contracts, and an integration smoke test proving constraints behave correctly. Roadmap **F-03** — schema + migration foundation only; no Gmail sync, API routes, or UI.

## Current State Analysis

**Database:** `apps/api/prisma/schema.prisma` contains only `User`. Two migrations exist (`init`, `add_user_avatar_url`). Prisma 6.19 is wired via `PrismaModule` / `PrismaService`; auth uses `prisma.user` only.

**Gap:** No parcel tables, no enums, no shared domain logic for archive derivation or tracking URL resolution. S-02 (Gmail sync), S-03 (deliver/remove), and S-04 (manual CRUD) are blocked until F-03 lands.

### Key Discoveries:

- Research settled schema shape, partial unique index, and `ParcelStatusEvent` inclusion — see `context/changes/parcel-prisma-model/research.md` §Decided.
- Archive list membership is **derived** from status (`DELIVERED` | `REMOVED` = archive); no separate `active | archive` column.
- `GmailMessage` / `ParcelEmail` models are **S-02 scope** — do not add forward relations on `Parcel` in F-03.
- Existing API e2e (`apps/api/test/app.e2e-spec.ts`) mocks Prisma; parcel schema verification needs a **real** DB connection.
- CI (`lint-and-test.yml`) runs `npm run test:api` only — not `test:e2e`; postgres service must be added for integration tests.

## Desired End State

After F-03, a developer can run `npm run prisma:migrate:dev -w @parcel-scrubber/api` against a local Postgres instance and get `parcels` + `parcel_status_events` tables with all enums. `npx prisma validate` passes. Domain helpers in `apps/api/src/parcels/` encode PRD contracts (archive predicate, tracking URL resolution, tracking number normalization). Integration e2e proves partial unique index, FK cascade, and enum persistence. `npm run lint:api`, `npm run test:api`, and `npm run test:e2e -w @parcel-scrubber/api` pass in CI with Postgres available.

### Verification checklist:

1. `Parcel` row persists with `userId` FK, `@db.Date` `orderDate`, optional `trackingNumber`, defaults `status = NEW`, `source = GMAIL`, `carrier = CUSTOM`.
2. Two parcels with `trackingNumber = null` for the same user succeed; duplicate non-null `(userId, trackingNumber)` fails.
3. Deleting a user cascades to parcels and status events.
4. `isArchivedStatus(DELIVERED)` and `isArchivedStatus(REMOVED)` return true; transit states return false.
5. `resolveTrackingUrl` returns override when set, null for CUSTOM without override, generated URL for known carriers.

## What We're NOT Doing

- `GmailMessage`, `ParcelEmail`, or sync/parser logic (S-02)
- Nest `ParcelsModule`, controllers, or REST routes (S-03/S-04)
- Writing `ParcelStatusEvent` rows from application code (S-03)
- Angular types or list UI (S-02+)
- Carrier URL template research beyond v1 PRD carriers (InPost, Poczta Polska, DPD, DHL)
- User settings model (F-04)
- Seed data or production backfill (greenfield tables)

## Implementation Approach

Extend `schema.prisma` following existing conventions (camelCase fields, `@map` snake_case columns, `cuid()` IDs, `@@map` table names). Generate migration via `prisma migrate dev`; append partial unique index SQL manually if Prisma does not emit it. Add colocated pure functions under `apps/api/src/parcels/` with unit specs. Add `parcel-schema.e2e-spec.ts` using real `PrismaClient` + `prisma migrate deploy`. Extend CI api job with a Postgres service container and `test:e2e` step.

## Critical Implementation Details

**Partial unique index:** Prisma may not express `WHERE tracking_number IS NOT NULL` in the schema DSL. After `migrate dev`, verify the generated SQL; if missing, add raw SQL to the migration file per research recommendation. Do **not** use `@@unique([userId, trackingNumber])` without partial filter — that would block multiple manual parcels with null tracking.

**No `ParcelEmail` relation on `Parcel`:** Omit `messages ParcelEmail[]` until S-02 creates the junction model; avoids orphan relation errors.

**Integration test isolation:** E2e spec should use a dedicated test database (`parcel_scrubber_test`), run `migrate deploy` in `beforeAll`, and truncate/delete test rows in `afterEach` or `afterAll`. Never point at production `DATABASE_URL`.

**Local test database:** `docker-compose.yml` defaults to `POSTGRES_DB=parcel_scrubber`. For e2e, create `parcel_scrubber_test` (e.g. `POSTGRES_DB=parcel_scrubber_test docker compose up -d postgres`, or `CREATE DATABASE parcel_scrubber_test` against an existing instance). CI provisions the test DB via the Postgres service container (Phase 3).

## Phase 1: Prisma Schema & Migration

### Overview

Add all F-03 enums and models, wire `User.parcels` relation, and ship a forward migration with partial unique index.

### Changes Required:

#### 1. Prisma schema — enums and models

**File**: `apps/api/prisma/schema.prisma`

**Intent**: Define parcel persistence types matching research decisions and planning-session choices (`StatusEventSource` enum, `@db.Date` on `orderDate`).

**Contract**:
- Enums: `ParcelSource` (`GMAIL`, `MANUAL`), `Carrier` (`INPOST`, `POCZTA_POLSKA`, `DPD`, `DHL`, `CUSTOM`), `ParcelStatus` (`NEW`, `IN_TRANSIT`, `IN_DELIVERY`, `DELIVERED`, `REMOVED`), `StatusEventSource` (`USER`, `SYNC`, `SYSTEM`) — all with `@map` lowercase snake_case values.
- `Parcel`: `id`, `userId`, `store String?`, `description String?`, `customCarrierLabel String?`, `carrier @default(CUSTOM)`, `trackingNumber String?`, `trackingUrl String?`, `orderDate DateTime @map("order_date") @db.Date`, `status @default(NEW)`, `source @default(GMAIL)`, `createdAt`, `updatedAt`; `user User @relation(..., onDelete: Cascade)`; `statusEvents ParcelStatusEvent[]`; **no** `messages ParcelEmail[]` (S-02); `@@index([userId, status])`; `@@map("parcels")`.
- `ParcelStatusEvent`: `fromStatus`, `toStatus`, `source StatusEventSource`, FK to `Parcel` with `onDelete: Cascade`; `@@index([parcelId, createdAt])`; `@@map("parcel_status_events")`.
- `User`: add `parcels Parcel[]` relation field.

#### 2. Migration SQL

**File**: `apps/api/prisma/migrations/<timestamp>_add_parcel_models/migration.sql` (generated + adjusted)

**Intent**: Create enum types, tables, indexes, and FK constraints in PostgreSQL.

**Contract**: Migration creates `parcels` and `parcel_status_events` tables. Partial unique index:

```sql
CREATE UNIQUE INDEX "parcels_user_id_tracking_number_key"
  ON "parcels"("user_id", "tracking_number")
  WHERE "tracking_number" IS NOT NULL;
```

#### 3. Regenerate client

**Intent**: Ensure `@prisma/client` types include new models for helpers and e2e.

**Contract**: `npm run prisma:generate -w @parcel-scrubber/api` succeeds; TypeScript sees `Parcel`, `ParcelStatus`, `Carrier`, etc.

### Success Criteria:

#### Automated Verification:

- Schema validates: `npx prisma validate --schema apps/api/prisma/schema.prisma`
- Migration applies on dev DB: `npm run prisma:migrate:dev -w @parcel-scrubber/api -- --name add_parcel_models` (or apply existing migration if created manually)
- Client generates: `npm run prisma:generate -w @parcel-scrubber/api`
- API lint passes: `npm run lint:api`
- Existing unit tests pass: `npm run test:api`

#### Manual Verification:

- Inspect migration SQL in `apps/api/prisma/migrations/` — partial unique index present, enum `@map` values are lowercase snake_case
- Optional: `\d parcels` in psql confirms column types (`order_date` is `date`, not `timestamp`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Domain Helpers

### Overview

Add pure TypeScript helpers encoding PRD contracts for archive membership, tracking URL resolution, and tracking number normalization — no Nest module wiring.

### Changes Required:

#### 1. Archive status predicate

**File**: `apps/api/src/parcels/is-archived-status.ts`

**Intent**: Single source of truth for active vs archive list filtering (FR-008/FR-009 derivation).

**Contract**: Export `isArchivedStatus(status: ParcelStatus): boolean` — returns `true` for `DELIVERED` and `REMOVED` only.

#### 2. Tracking number normalization

**File**: `apps/api/src/parcels/normalize-tracking-number.ts`

**Intent**: Normalize before unique constraint checks and URL building (research §5).

**Contract**: Export `normalizeTrackingNumber(raw: string | null | undefined): string | null` — trim, remove internal whitespace, uppercase; empty string → `null`.

#### 3. Carrier URL templates + resolver

**Files**:
- `apps/api/src/parcels/carrier-url-templates.ts`
- `apps/api/src/parcels/resolve-tracking-url.ts`

**Intent**: Implement FR-014 URL generation for known carriers; honor FR-015 overrides stored in `trackingUrl`.

**Contract**:
- `buildCarrierUrl(carrier: Carrier, trackingNumber: string): string | null` — templates for `INPOST`, `POCZTA_POLSKA`, `DPD`, `DHL`; returns `null` for `CUSTOM`.
- `resolveTrackingUrl(parcel: Pick<Parcel, 'trackingUrl' | 'carrier' | 'trackingNumber'>): string | null` — override first, then `null` for CUSTOM without override, else `buildCarrierUrl` with `normalizeTrackingNumber(trackingNumber)` applied internally (return `null` if normalization yields `null`).
- URL patterns should encode the tracking number (URL-encoded where needed). **`carrier-url-templates.ts` must document the chosen v1 URL pattern per carrier inline** (comment + reference tracking number used in unit tests). PRD does not specify concrete patterns — templates are expected to need adjustment after live-site verification (Phase 2 manual check).

#### 4. Barrel export (optional)

**File**: `apps/api/src/parcels/index.ts`

**Intent**: Convenient import path for downstream slices.

**Contract**: Re-export public helpers; no side effects.

#### 5. Unit tests

**Files**: `apps/api/src/parcels/*.spec.ts` (co-located)

**Intent**: Lock helper behavior without database.

**Contract**: Cover `isArchivedStatus` for all enum values; normalization edge cases (spaces, case, empty); `resolveTrackingUrl` override vs generated vs CUSTOM-null paths; at least one URL per known carrier contains the normalized tracking number.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:api`
- Lint passes: `npm run lint:api`
- API build passes: `npm run build:api`

#### Manual Verification:

- Spot-check one generated carrier URL in browser (or curl HEAD) opens a valid tracking page format

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Schema Integration E2e & CI

### Overview

Prove database constraints and relations with a real Postgres instance; wire CI so the test runs on every PR.

### Changes Required:

#### 1. Integration e2e spec

**File**: `apps/api/test/parcel-schema.e2e-spec.ts`

**Intent**: Smoke-test migration output and DB constraints — not HTTP routes.

**Contract**:
- Use `PrismaClient` directly (not mocked `PrismaService`).
- `beforeAll`: set `DATABASE_URL` to test DB, run `prisma migrate deploy`.
- Tests:
  - Create user + parcel with tracking number; read back enums and `@db.Date` `orderDate`.
  - Insert second parcel with `trackingNumber: null` for same user — succeeds.
  - Insert duplicate `(userId, trackingNumber)` — throws unique violation.
  - Insert `ParcelStatusEvent` with `StatusEventSource.USER`; verify FK.
  - Delete user — parcels and events cascade away.
- `afterEach`/`afterAll`: clean up test data.

#### 2. E2e npm script documentation

**File**: `apps/api/README.md` (short addition if missing)

**Intent**: Document local prerequisite: Postgres running, `DATABASE_URL` for test DB.

**Contract**: Note that `npm run test:e2e -w @parcel-scrubber/api` requires reachable Postgres with database `parcel_scrubber_test` (not the default `parcel_scrubber` dev DB); suggest docker or local instance and how to create the test database.

#### 3. CI workflow — Postgres + e2e

**File**: `.github/workflows/lint-and-test.yml`

**Intent**: Run parcel schema e2e in CI so partial index regressions are caught.

**Contract**: In `api` job, add Postgres service container with explicit env aligned to e2e:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: parcel
      POSTGRES_PASSWORD: parcel
      POSTGRES_DB: parcel_scrubber_test
```

Set job env `DATABASE_URL=postgresql://parcel:parcel@localhost:5432/parcel_scrubber_test` (same credentials as `app.e2e-spec.ts`). Run `npm run test:e2e -w @parcel-scrubber/api` after unit tests. Existing `npm run test:api` step unchanged.

**Runner validation:** Self-hosted runner must support GHA service containers (Linux + Docker). If service containers fail on a runner-in-Docker setup, fallback: `docker compose up -d postgres` with `POSTGRES_DB=parcel_scrubber_test` before the e2e step (document outcome in PR).

### Success Criteria:

#### Automated Verification:

- E2e passes locally with Postgres: `npm run test:e2e -w @parcel-scrubber/api`
- Full API suite: `npm run lint:api && npm run test:api && npm run test:e2e -w @parcel-scrubber/api`
- Monorepo lint/test: `npm run lint && npm run test`

#### Manual Verification:

- CI green on PR branch (api job runs e2e against service container)
- Confirm e2e fails if partial unique index is removed (sanity check during development — optional)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `isArchivedStatus`: all five `ParcelStatus` values
- `normalizeTrackingNumber`: trim, strip spaces, uppercase, null/empty handling
- `resolveTrackingUrl` / `buildCarrierUrl`: override precedence, CUSTOM behavior, known carrier templates

### Integration Tests:

- `parcel-schema.e2e-spec.ts`: partial unique index, null tracking duplicates, FK cascade, enum persistence, `@db.Date` round-trip

### Manual Testing Steps:

1. Start local Postgres (docker-compose or native); set `DATABASE_URL` in `.env.local`
2. Run `npm run prisma:migrate:dev -w @parcel-scrubber/api`
3. Optional psql: `\d parcels`, `\d parcel_status_events` — confirm types and indexes
4. Run `npm run test:e2e -w @parcel-scrubber/api` with test DB URL
5. Open one generated tracking URL from unit test output in browser

## Performance Considerations

Schema indexes: `@@index([userId, status])` supports active/archive list queries per user. Partial unique index avoids full-table uniqueness overhead on null tracking numbers. No runtime hot paths in F-03 — helpers are O(1).

## Migration Notes

Greenfield tables — no data backfill. Deploy path: `npm run prisma:migrate:deploy -w @parcel-scrubber/api` on Unraid/Docker api container before new code that references `Parcel`. Rollback: revert migration in dev; production rollback requires manual down migration (standard Prisma practice — document in PR if needed).

Downstream slices consume this schema as-is:
- **S-02:** adds `GmailMessage`, `ParcelEmail`, upsert by `(userId, trackingNumber)`, `orderDate` from min email date
- **S-03:** status transitions + `ParcelStatusEvent` writes with `StatusEventSource.USER`
- **S-04:** manual CRUD, `source = MANUAL`, `trackingUrl` overrides

## References

- Research: `context/changes/parcel-prisma-model/research.md`
- Roadmap F-03: `context/foundation/roadmap.md`
- PRD FR-008, FR-009, FR-014, FR-015: `context/foundation/prd.md`
- Current schema: `apps/api/prisma/schema.prisma`
- Prisma service: `apps/api/src/prisma/prisma.service.ts`

## Addendum: CI Postgres (self-hosted runner)

Phase 3 originally specified GHA `services.postgres` on `localhost:5432` with job env `DATABASE_URL`. On the project's self-hosted runner (job steps run inside a container while `docker run` publishes ports on the Docker host), service containers were replaced with:

- `docker run` provisioning `postgres:16-alpine` on host port **5433** with `POSTGRES_DB=parcel_scrubber_test`
- Host gateway IP via `docker run --rm alpine ip route` (not `127.0.0.1`)
- E2e step env **`E2E_DATABASE_URL`** (preserves dev `DATABASE_URL` in `.env.local`; spec sets `DATABASE_URL` only in `beforeAll`)

Validated green on PR #21 (`7eded2a`, `fa44513`).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Prisma Schema & Migration

#### Automated

- [x] 1.1 Schema validates: `npx prisma validate --schema apps/api/prisma/schema.prisma` — f7b4553
- [x] 1.2 Migration applies: `npm run prisma:migrate:dev -w @parcel-scrubber/api` — f7b4553
- [x] 1.3 Client generates: `npm run prisma:generate -w @parcel-scrubber/api` — f7b4553
- [x] 1.4 API lint passes: `npm run lint:api` — f7b4553
- [x] 1.5 Existing unit tests pass: `npm run test:api` — f7b4553

#### Manual

- [x] 1.6 Migration SQL includes partial unique index; `order_date` is `date` type — f7b4553

### Phase 2: Domain Helpers

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:api` — b27418b
- [x] 2.2 Lint passes: `npm run lint:api` — b27418b
- [x] 2.3 API build passes: `npm run build:api` — b27418b

#### Manual

- [x] 2.4 Spot-check one generated carrier tracking URL format — b27418b

### Phase 3: Schema Integration E2e & CI

#### Automated

- [x] 3.1 E2e passes locally: `npm run test:e2e -w @parcel-scrubber/api` — 9fb677e
- [x] 3.2 Full API suite passes: lint + unit + e2e — 9fb677e
- [x] 3.3 Monorepo lint and unit tests pass: `npm run lint && npm run test` — 9fb677e

#### Manual

- [x] 3.4 CI api job green with Postgres service and e2e step — 7eded2a
