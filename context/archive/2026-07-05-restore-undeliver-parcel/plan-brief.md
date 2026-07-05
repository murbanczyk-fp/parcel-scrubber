# Restore Archived Parcel — Plan Brief

> Full plan: `context/changes/restore-undeliver-parcel/plan.md`

## What & Why

Roadmap **S-05**: users need to move archived parcels back to the active list — reversing Delivered or Remove — without order-date limits (US-03, FR-016). Aggregation-only v1 means mistakes happen; restore must be manual, fast, and never blocked by scan period or age rules dropped in PRD v4.

## Starting Point

S-03 shipped deliver/remove APIs, the Archive table (Edit only), and Active list optimistic actions. `transitionStatus` + `ParcelStatusEvent` audit trail exist but only wire to deliver/remove. Sync already keeps archived parcels archived (FR-007). No reactivate route or Archive action button yet.

## Desired End State

User on **Archive** clicks **Restore** on any row (Delivered or Removed status); row disappears with a toast and the parcel lands on **Active** as `NEW`. API exposes `POST /api/parcels/:id/reactivate`; idempotent when already active; 400 for non-archived transit statuses. Re-sync does not undo restore.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Target status | Always `NEW` | Simple; matches F-03 default; sync never sets transit states in v1 | Plan |
| API shape | Single `POST .../reactivate` | One mutation for both archived statuses; minimal surface | Plan |
| Request body | None | UI label conveys intent; server only checks archived eligibility | Plan |
| Non-archived call | 400 Bad Request | Clear contract when parcel isn't archived | Plan |
| UI label | **Restore** for all archived rows | Unified action regardless of Delivered vs Removed | Plan |
| Confirmation | One-click (no dialog) | Low-friction reversible action; mirrors Delivered on Active | Plan |
| Post-action UI | Optimistic row removal + rollback on error | Consistent with S-03 Active list UX | Plan |
| Test scope | API unit + parcels e2e | Matches S-03; no Angular component specs | Plan |

## Scope

**In scope:** `reactivateParcel` in API service/controller; unit + e2e tests; web `reactivateParcel()`; Archive list Restore button with optimistic UX.

**Out of scope:** Separate undeliver route/label; event-log smart restore; order-date gates; sync changes; schema migrations; bulk restore; confirmation dialog; Angular component specs.

## Architecture / Approach

```
Archive page ──POST /api/parcels/:id/reactivate──► ParcelsService.reactivateParcel
       │         (guard: archived or idempotent NEW; transition → NEW + event)
       │ optimistic row removal + toast
       └──GET /api/parcels?status=archived

Active page ◄── parcel appears on next load (status NEW)
```

Archive membership unchanged — still derived from status. Sync path untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API reactivate | Service method + route + unit tests | Guard must reject transit statuses without breaking idempotent NEW |
| 2. Parcels e2e | HTTP scenarios + event assertions | Auth cookie setup must match existing e2e harness |
| 3. Archive UI | Restore button + optimistic UX | Error rollback must reload list like Active list |

**Prerequisites:** S-03 complete; local Postgres for e2e.

**Estimated effort:** ~1–2 implementation sessions across 3 phases.

## Open Risks & Assumptions

- PRD US-03 names "Restore" and "Undeliver" separately; plan uses unified **Restore** label per planning session decision — functionally equivalent (both → `NEW`).
- Idempotent reactivate when already `NEW` returns 200 (S-03 pattern), not 400 — only `IN_TRANSIT`/`IN_DELIVERY` get 400.
- No Angular component tests — manual QA covers button wiring (S-03 precedent).

## Success Criteria (Summary)

- User restores any archived parcel (any order date) to Active with one click.
- API writes `ParcelStatusEvent` on real transitions; idempotent retries safe.
- Re-sync does not move restored parcels back to archive.
- `npm run lint` and `npm run test` pass including new e2e cases.
