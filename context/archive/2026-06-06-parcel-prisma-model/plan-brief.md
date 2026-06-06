# Parcel Prisma Model — Plan Brief

> Full plan: `context/changes/parcel-prisma-model/plan.md`
> Research: `context/changes/parcel-prisma-model/research.md`

## What & Why

Parcel Scrubber needs a PostgreSQL home for shipment records before Gmail sync or list UI can ship. F-03 lands the Prisma `Parcel` model, status/archive enums, audit event table, and shared domain helpers so S-02+ can persist and query parcels per authenticated user with correct active vs archive semantics.

## Starting Point

The API has Prisma wired with a `User`-only schema (`apps/api/prisma/schema.prisma`), OAuth with Gmail refresh token ready, but no parcel tables or domain logic. Research defined the full model shape, partial unique index on tracking numbers, and explicit boundaries vs S-02 Gmail tables.

## Desired End State

Developers run migrations and get `parcels` + `parcel_status_events` tables with enums. Pure helpers encode archive derivation (`DELIVERED`/`REMOVED` = archive), tracking URL resolution (FR-014/FR-015), and tracking number normalization. Integration e2e against real Postgres proves constraints; CI runs the e2e on every PR. No REST routes or sync logic yet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Gmail / email tables | Deferred to S-02 | Keeps F-03 focused; manual parcels stay clean | Research |
| Archive membership | Derived from `ParcelStatus` | PRD active/archive without redundant column | Research |
| `customCarrierLabel` | Separate from `description` | Carrier display name vs product/shipment text | Research |
| `ParcelStatusEvent` in F-03 | Yes — table only | Audit schema ready; writes start in S-03 | Research |
| Partial unique on tracking | `(userId, trackingNumber) WHERE NOT NULL` | Allows multiple manual parcels without tracking | Research |
| Initial status on import | Always `NEW`; no status event | Transit inference deferred; no `NEW→NEW` noise | Research |
| Domain helpers in F-03 | Pure functions, no Nest module | Locks PRD contracts early for S-02/S-03 | Plan |
| `StatusEventSource` typing | Prisma enum (`USER`, `SYNC`, `SYSTEM`) | DB-enforced values; matches other enums | Plan |
| `orderDate` column type | `@db.Date` | Matches PRD “order date” display semantics | Plan |
| Verification depth | Integration e2e + CI Postgres | Catches partial-index and FK mistakes pre-S-02 | Plan |

## Scope

**In scope:**
- Prisma enums: `ParcelSource`, `Carrier`, `ParcelStatus`, `StatusEventSource`
- Models: `Parcel`, `ParcelStatusEvent`, `User.parcels` relation
- Migration with partial unique index
- Domain helpers: `isArchivedStatus`, `normalizeTrackingNumber`, `resolveTrackingUrl`
- Unit tests for helpers; schema integration e2e; CI Postgres service

**Out of scope:**
- `GmailMessage`, `ParcelEmail`, sync/parsers (S-02)
- Nest routes, `ParcelsService`, status transition writes (S-03)
- Manual CRUD UI/API (S-04)
- User settings model (F-04)

## Architecture / Approach

```
User 1──* Parcel 1──* ParcelStatusEvent
              │
              ├── status → active list (NEW, IN_TRANSIT, IN_DELIVERY)
              │            archive list (DELIVERED, REMOVED)
              ├── trackingUrl? → override (FR-015)
              └── carrier + trackingNumber → resolveTrackingUrl() (FR-014)
```

Schema-first: extend `schema.prisma`, migrate, generate client. Helpers are framework-agnostic TypeScript imported by future services. E2e uses raw `PrismaClient` against a test database — not the mocked HTTP e2e pattern.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Prisma Schema & Migration | Enums, tables, partial unique index, client gen | Prisma may omit partial index — manual SQL needed |
| 2. Domain Helpers | Archive/URL/normalize pure functions + unit tests | Carrier URL templates must match real carrier sites |
| 3. Schema Integration E2e & CI | DB constraint smoke test + workflow Postgres | Self-hosted runner must support service containers |

**Prerequisites:** Local or CI Postgres; `DATABASE_URL` configured  
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- Self-hosted CI runner supports Postgres service containers (standard GitHub Actions syntax).
- Carrier URL templates may need adjustment when tested against live sites — helpers are easy to patch.
- S-02 will add `ParcelEmail` relation to `Parcel`; F-03 intentionally omits it to avoid orphan schema.

## Success Criteria (Summary)

- Migration creates parcel tables with correct enums, `@db.Date` order date, and partial unique index
- Helpers correctly derive archive status and resolve tracking URLs per PRD
- Integration e2e proves duplicate tracking rejection and cascade delete; CI runs it on every PR
