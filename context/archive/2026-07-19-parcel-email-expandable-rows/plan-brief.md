# Parcel Email Expandable Rows — Plan Brief

> Full plan: `context/changes/parcel-email-expandable-rows/plan.md`
> Research: _(none — planned from roadmap/PRD + codebase)_

## What & Why

Users need to expand a parcel row on Active or Archive and see every linked Gmail message, each opening in Gmail via `https://mail.google.com/mail/u/0/#all/{gmailMessageId}` with a `pi-external-link` icon (US-04 / FR-019 / S-07). That provenance surface was deferred from earlier slices once `ParcelEmail` linking existed.

## Starting Point

Sync already creates `GmailMessage` + `ParcelEmail` links, but list/detail APIs return a flat `ParcelDto` with no messages, and both tables are non-expandable PrimeNG `p-table`s. Subject/from are fetched at sync time and discarded.

## Desired End State

Active and Archive rows with linked mail expand to a message list (subject + from when present; date + link when subject is missing). New syncs persist subject/from. Parcel APIs embed `messages[]` so expand needs no second request.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Message metadata | Persist subject **and** from on new ledger creates | Recognition without opening Gmail | Plan |
| Legacy null subject | Date + link only (no truncated id label) | Avoid noisy ids; accept mixed label quality | Plan |
| API shape | Embed `messages[]` on list/detail `ParcelDto` | One round-trip; fits personal volumes | Plan |
| Expand gating | Toggler only when `messages.length > 0` | Cheap with embed; cleaner manual rows | Plan |
| Expand UX | Multi-row PrimeNG `expandedRowKeys` | Compare sources across parcels | Plan |
| Scope | Active + Archive, full FR-019 | Matches roadmap acceptance | Plan |
| Testing | API unit + new Active/Archive component specs | Matches repo style; no browser e2e | Plan |
| Backfill | Out of scope | Sync never updates ledgered ids | Plan |

## Scope

**In scope:**
- Nullable `subject`/`from` on `GmailMessage` + sync writes
- Embed sorted `messages[]` on `ParcelDto`
- PrimeNG expandable rows on Active + Archive with Gmail outbound links
- API + web component automated tests

**Out of scope:**
- Subject/from backfill or live Gmail enrich on expand
- Lazy emails endpoint
- Merge (`S-08`), shared expandable-table abstraction, browser e2e

## Architecture / Approach

```text
Sync getMessage → persist GmailMessage(subject, from, internalDate)
                 → ParcelEmail link (existing)

GET /api/parcels → include messages.gmailMessage → ParcelDto.messages[]

p-table expandedRowKeys → list messages → Gmail URL + pi-external-link
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + sync metadata | `subject`/`from` on new ledger rows | SQL reserved `from` column naming |
| 2. API embed messages | `messages[]` on all mapped `ParcelDto`s | Missing include on a mutation return path |
| 3. Expandable rows UI | Active + Archive expand + specs | Dual-list drift; legacy null-subject UX |

**Prerequisites:** S-02 linking live (already shipped); local DB migrateable  
**Estimated effort:** ~2–3 sessions across 3 phases

## Open Risks & Assumptions

- Pre-S-07 linked messages stay subject/from null forever in this slice — UI must look intentional, not broken
- Embedding messages on every list payload assumes low parcel/message counts (personal app)
- Edit form ignores `messages` but shares the DTO — mapper must always supply the array

## Success Criteria (Summary)

- Expand works on Active and Archive when links exist; no toggler when empty
- Each message opens the FR-019 Gmail URL in a new tab with `pi-external-link`
- New syncs store subject/from; null-subject legacy rows show date + link only
