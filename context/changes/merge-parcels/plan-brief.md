# Merge Parcels — Plan Brief

> Full plan: `context/changes/merge-parcels/plan.md`

## What & Why

Users sometimes get two or more parcel rows for the same physical shipment when dedupe fails. This change lets them multi-select those rows on Active or Archive, choose the winning value for each conflicting field, and merge into one survivor that keeps every linked Gmail message and the oldest message order date (US-05 / FR-020).

## Starting Point

Parcel CRUD, sync dedupe-by-tracking, fill-null enrichment, and expandable Gmail rows already exist. There is no merge API, no table multi-select, and no form-in-dialog pattern yet.

## Desired End State

From either list, select ≥2 parcels → Merge dialog with per-field radios (distinct values + Leave empty + Other…) → one remaining parcel with combined messages and recomputed order date; duplicate rows hard-deleted.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Conflict UX | Inline `p-dialog` with field pickers | User must decide when values differ (e.g. two descriptions); ConfirmDialog cannot host radios/Other |
| Picker fields | All mutable fields + Other… (not order date) | Avoid silent loss of overrides; order date stays automatic |
| Tracking conflict | User picks value; reject if chosen number exists outside selection | Handles null/differing trackings without violating unique index |
| Survivor row | Implicit (oldest `createdAt`) | User cares about field values, not which id survives |
| List scope | Current list only (Active **or** Archive) | Selection is page-local; mixed active+archive cannot happen |
| Archive status | Prefer `DELIVERED` if any selected is Delivered | Rare Delivered+Removed case without extra dialog control |
| Order date | Recompute from oldest linked message after reparent | Matches Business Logic #2 / sync |
| Empty options | Distinct non-empty + Leave empty + Other… | Covers A/B/C description case and intentional clears |

## Scope

**In scope:** `POST /api/parcels/merge`, transactional reparent + delete, Active + Archive multi-select and shared merge dialog, unit + e2e tests.

**Out of scope:** Auto store-wins merge, cross-list selection, soft-delete losers, sync rule changes, order-date picker, undo-merge.

## Architecture / Approach

Client resolves field values in a dialog and POSTs `{ parcelIds, fields }`. Server validates ownership and tracking uniqueness, picks survivor, applies fields, creates missing `ParcelEmail` links, recomputes `orderDate`, sets archive status preference, deletes losers, returns `ParcelDto`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. API merge transaction | Endpoint + domain rules + unit tests | Unique index / reparent edge cases |
| 2. API e2e | Postgres proof of merge + rejections | Test DB setup parity with CI |
| 3. Active merge UI | Multi-select + dialog + client call | First form-in-dialog; option-building UX |
| 4. Archive parity | Same UX on archive list | Delivered preference visible in UI |

**Prerequisites:** S-02 done (parcels + ParcelEmail); S-06/S-07 done useful but not blocking.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- PRD “store-wins” AC is met by offering store-bearing values in the dialog, not by server auto-merge.
- Carrier + custom label treated as a paired choice when CUSTOM / Other is selected.
- Preview order date in the dialog may differ slightly from post-merge if message sets are empty (fallback path).

## Success Criteria (Summary)

- User can merge ≥2 parcels on Active or Archive with explicit field choices.
- Survivor retains all Gmail links; losers are gone; order date matches oldest linked message.
- Invalid tracking / foreign ids fail cleanly without partial deletes.
