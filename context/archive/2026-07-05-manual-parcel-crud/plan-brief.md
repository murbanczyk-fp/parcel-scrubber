# Manual Add and Edit Parcels — Plan Brief

> Full plan: `context/changes/manual-parcel-crud/plan.md`

## What & Why

Roadmap **S-04**: user can manually add a parcel Gmail sync missed and edit parcel fields — store, carrier, tracking number, description, order date, and tracking URL override — so the active list stays complete without waiting for the next sync (FR-010, FR-011, FR-015; secondary success criterion in PRD).

## Starting Point

S-02 ships Gmail sync and the active list; S-03 adds deliver/remove and the archive view. F-03 landed the `Parcel` model with `source: GMAIL | MANUAL`, optional `trackingUrl` override, partial unique index on `(userId, trackingNumber)`, and helpers (`normalizeTrackingNumber`, `resolveTrackingUrl`, `buildCarrierUrl`). API today exposes list + deliver/remove only — no create, update, or get-by-id routes. Web `ParcelsService` mirrors that gap; settings page is the form/validation reference.

## Desired End State

User clicks **Add parcel** on Active → full-page form at `/active/new` with store, carrier, tracking number, order date (defaults to today), optional description and tracking URL override → saves as `source: MANUAL`, appears on active list. **Edit** from Active or Archive opens `/active/:id/edit` or `/archive/:id/edit` with the same form pre-filled; all fields editable on Gmail and manual parcels. Clearing tracking URL override reverts to carrier-generated link in API responses. Duplicate tracking numbers return 400 with a field error.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Edit scope | Active and Archive lists | FR-010/FR-015 apply to any parcel; user may fix archived rows before S-05 restore | Plan |
| Add UX | Dedicated route `/active/new` | Full-page form matches settings pattern; room for all fields | Plan |
| Edit UX | Dedicated routes per list context | `/active/:id/edit` and `/archive/:id/edit`; cancel returns to originating list | Plan |
| Required on create | Store, carrier, tracking number, order date | User-specified minimum for useful manual entries | Plan |
| CUSTOM carrier | `customCarrierLabel` required when carrier is CUSTOM | Matches F-03 model; no link without label for custom carriers | Research |
| Order date default | Today (client-side) | Speeds common case; user can change before save | Plan |
| Gmail vs manual edit | All writable fields editable on any parcel | No artificial split; dedupe guarded at API | Plan |
| URL override clear | Empty override → revert to generated URL | Stored `null` + read-time `resolveTrackingUrl` | Plan |
| Duplicate tracking | 400 with `{ errors: [{ field, message }] }` | Matches settings validation shape; partial unique index | Plan |
| Override safety | `isSafeHttpUrl` at write boundary | F-03 impl-review deferred XSS guard to S-04 | Research |
| Status changes | Out of scope — use deliver/remove (S-03) / restore (S-05) | CRUD slice edits metadata only | Plan |
| Test scope | Unit + controller + parcels HTTP e2e | Same as S-03; no Angular component specs | Plan |
| Phasing priority | API + tests before UI | Ship verifiable backend first if time is tight | Plan |

## Scope

**In scope:** `POST /api/parcels`, `GET /api/parcels/:id`, `PATCH /api/parcels/:id`; validation helpers; extend `ParcelsService`/`ParcelsController`; `parcels.e2e-spec.ts` cases; shared `ParcelFormComponent`; routes `active/new`, `active/:id/edit`, `archive/:id/edit`; Add/Edit buttons on both lists; web `ParcelsService` create/update/get.

**Out of scope:** Restore/undeliver (S-05); status field editing; schema migrations; bulk edit; Angular component specs; changing sync dedupe behavior on Gmail re-import.

## Architecture / Approach

```
Active/Archive list ──► Add/Edit routes ──► ParcelFormComponent
                              │
                    POST / PATCH / GET :id
                              │
                    ParcelsService (validate → normalize → persist)
                              │
                    mapParcelToDto → resolveTrackingUrl (read)
```

Create sets `source: MANUAL`, `status: NEW`. Update never changes `source` or `status`. `trackingUrl` column stores override only; responses always expose resolved URL.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API create/update | Service methods, validation, GET by id, unit tests | Duplicate tracking Prisma P2002 must map to 400 |
| 2. Parcels e2e | HTTP tests for create/update/validation/auth | Route order: `GET :id` vs `POST :id/deliver` |
| 3. Web form + routes | Shared form, carrier select, date picker, HTTP client | PrimeNG DatePicker/Select first use in app |
| 4. List integration | Add button, Edit links, post-save navigation + toast | Return URL must respect active vs archive context |

**Prerequisites:** S-02 and S-03 merged; local Postgres for e2e.

**Estimated effort:** ~2–3 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Edit route needs `GET /api/parcels/:id` (not in original PRD wording) so direct URL load works without list prefetch.
- Changing tracking number on a Gmail parcel could affect sync dedupe on next import — acceptable per “all fields editable”; sync upserts by tracking number.
- `description` remains optional on manual add despite store/tracking being required.
- No `lessons.md` in repo yet — patterns taken from S-03 archive and settings validation.

## Success Criteria (Summary)

- User adds a manual parcel from Active; it persists and appears with correct resolved tracking link.
- User edits a parcel from Active or Archive; changes persist; clearing URL override restores generated link when carrier + number allow it.
- Duplicate tracking number on create or update returns 400 with clear field error.
- `npm run lint` and `npm run test` pass including extended parcels e2e.
