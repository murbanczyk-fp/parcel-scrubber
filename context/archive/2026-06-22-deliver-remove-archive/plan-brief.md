# Delivered/Remove Actions and Archive View — Plan Brief

> Full plan: `context/changes/deliver-remove-archive/plan.md`

## What & Why

Roadmap **S-03**: parcels leave the active list only when the user marks them **Delivered** or **Remove** — both move to archive (not deleted), with distinct statuses for later restore/undeliver (S-05). Users need a separate **Archive** view to browse completed/removed shipments with order dates and tracking links intact (US-02, FR-009, FR-012, FR-013).

## Starting Point

S-02 shipped `GET /api/parcels?status=active`, the active PrimeNG table with sync, and `/archive` as a placeholder. F-03 defined archive membership via `isArchivedStatus` (`DELIVERED` | `REMOVED`) and the `ParcelStatusEvent` table — but no application code writes events yet. Sync already keeps archived parcels archived on re-import (FR-007).

## Desired End State

User on **Active** clicks **Delivered** (instant) or **Remove** (confirm dialog); the row disappears with a toast. On **Archive**, a table lists all archived parcels with a **Status** column (Delivered vs Removed), same tracking columns as active. API transitions write audit events; idempotent retries are safe.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Mutation API shape | `POST .../deliver` + `POST .../remove` | Explicit intent per PRD action; easy to test and authorize | Plan |
| Archive list query | `GET /api/parcels?status=archived` | Symmetric with existing `?status=active` contract | Plan |
| Archive statuses | `DELIVERED` vs `REMOVED` distinct | Same list outcome; preserves meaning for S-05 restore/undeliver | Research |
| Idempotency | 200 if already at target status, no duplicate event | Safe for double-clicks and retries | Plan |
| Remove UX | ConfirmDialog; Deliver one-click | Friction matches action severity | Plan |
| Archive table | Active columns + Status column | Surfaces Delivered vs Removed without extra navigation | Plan |
| Active row actions | Actions column with two text buttons | Clear labels; testable via data-testid | Plan |
| Post-action UI | Optimistic row removal + toast | Feels instant; rollback on API error | Plan |
| Status events | Write on every real transition (`USER` source) | F-03 schema finally used; no events on idempotent no-op | Research |
| Test scope | Unit + controller + parcels HTTP e2e | Proves DB events without Angular component specs | Plan |

## Scope

**In scope:** Extend `ParcelsService`/`ParcelsController` (archived list, deliver, remove); `parcels.e2e-spec.ts`; replace archive placeholder with `ArchiveListComponent`; active list Actions column; web `ParcelsService` mutations; `ConfirmationService` provider.

**Out of scope:** Restore/undeliver (S-05); manual CRUD (S-04); schema migrations; bulk actions; expandable message rows; Angular component specs.

## Architecture / Approach

```
Active page ──POST /api/parcels/:id/deliver|remove──► ParcelsService
       │         ($transaction: update status + insert ParcelStatusEvent)
       │ optimistic UI + toast
       └──GET /api/parcels?status=active

Archive page ──GET /api/parcels?status=archived──► table + Status column
```

Archive membership remains derived from status — no new columns. Sync path unchanged; `isArchivedStatus` guards import upserts.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API transitions | Archived list + deliver/remove + unit tests | Transaction must pair update + event atomically |
| 2. Parcels e2e | HTTP tests with JWT cookie + event assertions | E2e auth cookie setup must match production guard |
| 3. Archive UI | Real archive table replaces placeholder | Status labels must map both enum values |
| 4. Active actions | Buttons, confirm, optimistic UX | Rollback path on failed mutation |

**Prerequisites:** S-02 complete; local Postgres for e2e.

**Estimated effort:** ~2–3 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Deliver on a `REMOVED` parcel transitions to `DELIVERED` (cross-archived) — rare; allowed since user explicitly chose Delivered.
- No Angular component tests — manual QA covers action wiring (same as S-02 list).
- `change.md` notes creating a branch and moving GH project card — do before `/10x-implement`.

## Success Criteria (Summary)

- User marks parcels Delivered or Remove on Active; they appear in Archive with correct status, order date, and tracking link.
- API writes `ParcelStatusEvent` rows; idempotent repeat calls do not duplicate events.
- Re-sync does not restore archived parcels to active.
- `npm run lint` and `npm run test` pass including new parcels e2e.
