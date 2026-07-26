# Delete Parcel Data from Settings — Plan Brief

> Full plan: `context/changes/delete-parcels-data/plan.md`
> Frame brief: `context/changes/delete-parcels-data/frame.md`

## What & Why

Expose a production, authenticated, user-scoped wipe of the four parcel/Gmail
tables from Settings, gated in the UI by type-`DELETE` confirmation. This
promotes the existing dev reset into a deliberate bulk reset without invalid
`TRUNCATE … WHERE` SQL or per-parcel hard delete.

## Starting Point

`POST /api/test/reset-sync` already performs the correct four-table,
user-scoped Prisma transaction, but it is disabled in production. Settings
currently supports only Gmail preferences, and the web page has no destructive
action or typed-confirmation pattern.

## Desired End State

Settings gains a separate danger zone. Exact `DELETE` permanently removes
manual/imported parcels and related ingest data, while preserving login and
Settings. Success stays on the page; a later Sync can re-import matching mail.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Data boundary | Four parcel/Gmail tables for current user | Matches Prisma domain, ops clear, and sync ledger behavior | Frame |
| Database operation | Scoped Prisma `deleteMany` transaction | `TRUNCATE` cannot filter by user | Frame |
| Shared behavior | Extract helper used by Settings and dev reset | Prevents table/filter/count drift | Plan |
| Production route | `POST /api/settings/clear-parcel-data` | Fits authenticated Settings surface | Plan |
| Confirmation enforcement | UI only; bodyless authenticated API | Explicit user choice; preserves reset-like API simplicity | Plan |
| Confirmation UI | Dedicated `p-dialog` with exact `DELETE` input | Existing rich-dialog pattern supports inputs and pending state | Frame / Plan |
| Completion UX | Close/reset dialog, success toast, stay on Settings | Matches existing Settings feedback and avoids forced navigation | Plan |
| Testing depth | API + web unit tests; manual real-data check | Matches Settings precedent and selected scope | Plan |

## Scope

**In scope:** shared four-table helper; dev reset delegation; production
Settings POST; Angular client; danger-zone card and dialog; request feedback;
API/web unit tests and manual real-data verification.

**Out of scope:** per-parcel delete; deleting identity/settings; server-side
phrase validation; sync-job coordination; automatic Sync/navigation; deleted
count UI; migrations; new e2e coverage; deploy SQL changes.

## Architecture / Approach

The existing transaction moves into a helper called by `SyncTestController`
and `SettingsService`; `SettingsController` publishes the production command.
Angular’s Settings service sends the bodyless POST and the page coordinates a
dedicated dialog, request state, and toasts.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared wipe + production API | Single-sourced transaction and authenticated Settings route | Preserving exact user filters and dev reset compatibility |
| 2. Settings danger zone | Typed confirmation, POST integration, and feedback UX | Preventing accidental or duplicate submission |

**Prerequisites:** Existing Prisma schema and authenticated Settings page.
**Estimated effort:** About 2 focused sessions across 2 phases.

## Open Risks & Assumptions

- Client-side confirmation does not protect against authenticated direct API calls.
- A wipe can race with Sync because no SyncJobRegistry check is planned.
- Rollback cannot restore rows; recovery depends on backups.
- Mail outside the configured label/period will not automatically return.

## Success Criteria (Summary)

- Only the requesting user’s four parcel/Gmail data sets are removed in one
  transaction; login and saved settings remain.
- Exact `DELETE` is required in the dialog, pending requests cannot duplicate,
  and success/failure states behave as specified.
- API/web unit suites, lint, and builds pass; manual verification confirms a
  later Sync can re-import matching Gmail messages.
