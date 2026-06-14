# Gmail sync active parcels — Plan Brief

> Full plan: `context/changes/gmail-sync-active-parcels/plan.md`

## What & Why

Roadmap **S-02** is the north-star slice: a signed-in user clicks **Sync**, sees progress for long runs, and views imported parcels on the **active** list with order dates and carrier tracking links. Sync reads Gmail scan label and period from settings, lists matching message ids (F-05), fetches bodies only for ids not yet in the processed-mail ledger, runs AI extraction (F-06), dedupes by tracking number, and upserts parcels — without age-based auto-archive (FR-006) or auto-restore of archived parcels (FR-007).

## Starting Point

F-05 (`GmailService`), F-06 (`ExtractionService`), F-03 (`Parcel` model + helpers), F-04/S-01 (settings API + UI), and F-02 (OAuth + `gmail.readonly`) are complete. `/active` is still a placeholder; `/api/test/*` routes smoke-test list → fetch → extract but do not persist. Prisma has no `GmailMessage` / `ParcelEmail` tables yet.

## Desired End State

User opens **Active**, sees an empty state with a Sync CTA or a table of active parcels (store, description, order date, carrier, tracking link). Clicking Sync starts a background job (`POST /api/sync`), shows an inline progress bar with counts while polling job status, then refreshes the list. Completion toast summarizes imported / skipped / failed counts. Re-sync respects the ledger — widening scan period only processes new Gmail ids. Archived parcels matched by tracking number get metadata refresh only, never promotion to active.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Sync API shape | POST starts job; poll `GET /api/sync/:jobId` | Supports PRD progress NFR without blocking HTTP for long OpenRouter runs | Plan |
| Progress UI | Inline progress bar + counts on Active page | Continuous visible progress; matches table layout on same page | Plan |
| Sync button placement | Active page header only | Sync context is parcel import, not global shell action | Plan |
| Concurrent sync | Reject second sync (409) | Solo local app; avoids duplicate OpenRouter spend and race on upsert | Plan |
| Merchant filter timing | After `getMessage` (post-fetch) | Simpler pipeline: fetch then filter by `From` header | Plan |
| Unknown sender | Ledger as processed; skip parcel | Avoids re-fetching non-merchant mail every sync | Plan |
| Null tracking | Ledger as processed; skip parcel | Same ledger semantics; extraction already returns null without throw | Plan |
| ExtractionError | Skip message; continue sync; count failed | One bad email should not abort entire mailbox import | Plan |
| Archived parcel upsert | Refresh metadata/links; keep archived status | FR-007 without silent data loss on tracking/carrier updates | Plan |
| Active list API | `GET /api/parcels?status=active` | Clear contract; archive list deferred to S-03 | Plan |
| List sort | `orderDate` descending | Most recent orders first for daily check-in UX | Plan |
| Tracking URL | Server resolves in list DTO | Centralizes carrier templates; matches F-03 read-time pattern | Plan |
| OpenRouter concurrency | Sequential per message | Predictable quota use; simplest error/progress accounting | Plan |
| List UI | PrimeNG table (full columns) | Matches settings-page table patterns; scannable for many parcels | Plan |
| Empty state | Empty state + prominent Sync CTA | US-01 first-sync path | Plan |
| GmailAuthError UX | Toast + re-login prompt | Reuses existing sign-in flow; no auto-redirect | Plan |
| Sync completion | Toast with imported/skipped/failed counts | Quick validation without reading logs | Plan |
| Widen scan period | Ledger prevents re-processing old ids | Widened window only adds newly discovered Gmail ids | Plan |
| Test scope | Sync unit + controller + Prisma e2e | Covers orchestration and persistence without full Angular E2E | Plan |

## Scope

**In scope:** Prisma `GmailMessage` + `ParcelEmail`; sync orchestration service; in-memory per-user job registry; `POST /api/sync`, `GET /api/sync/:jobId`, `GET /api/parcels?status=active`; `ParcelsModule` + `SyncModule`; Active page (table, sync, progress, empty state); web `ParcelService`; unit/controller/e2e tests.

**Out of scope:** Deliver/remove/archive actions (S-03); manual add/edit (S-04); restore/undeliver (S-05); archive list UI; background/scheduled sync; configurable merchant list in settings; Gmail filter setup docs; Angular component tests for list/progress; persistent job store across API restarts.

## Architecture / Approach

```
Active page → POST /api/sync → SyncJobRegistry (in-memory, one job/user)
                    ↓ async
              SyncService.runJob:
                settings → list ids → skip ledger ids
                → for each new id: getMessage → merchant filter
                → extract (sequential) → upsert parcel + link ParcelEmail
                → update job progress counters
                    ↓ poll
Active page → GET /api/sync/:jobId → progress bar
             → GET /api/parcels?status=active → table (trackingUrl resolved server-side)
```

Ledger (`GmailMessage`) is separate from parcel identity (`Parcel` upsert by normalized tracking number). Three dedupe layers: skip known Gmail ids, upsert by tracking, respect archived status on match.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Gmail ledger schema | `GmailMessage` + `ParcelEmail` migration and relations | Composite FK / junction naming must match upsert flow |
| 2. Sync orchestration + API | Job-based sync, orchestration, progress counters | Post-fetch merchant filter increases Gmail API calls for mislabeled mail |
| 3. Active parcels API | `GET /api/parcels?status=active` with resolved tracking URLs | Active vs archived filter must align with `isArchivedStatus` |
| 4. Active page UI | Table, sync button, progress bar, empty state, toasts | Polling interval vs perceived progress; re-login on auth errors |

**Prerequisites:** S-01, F-03, F-05, F-06 done; `OPENROUTER_API_KEY` set in prod; user Gmail label configured (defaults apply).

**Estimated effort:** ~3–4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- In-memory job registry loses in-flight jobs on API restart (acceptable for local solo MVP).
- Post-fetch merchant filter fetches bodies for non-merchant mail in the label before skipping — user accepted this tradeoff.
- RFC 2822 `Date` header parsing may mis-handle exotic formats; fallback to `new Date()` or skip with ledger entry if unparseable (plan specifies explicit helper + test).
- 500-id Gmail cap (F-05) may truncate very large labeled mailboxes within scan period.

## Success Criteria (Summary)

- User triggers Sync from Active, sees progress for runs >2s, and lands on a populated active table with order dates and working tracking links for supported carriers.
- Re-sync does not re-fetch ledgered messages or restore archived parcels to active.
- `npm run lint` and `npm run test` pass including new sync e2e coverage.
