<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Gmail sync active parcels

- **Plan**: context/changes/gmail-sync-active-parcels/plan.md
- **Scope**: All 4 phases (complete)
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Plan e2e verification command does not run e2e tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/gmail-sync-active-parcels/plan.md (Phase 3 automated)
- **Detail**: Progress marks 3.2 complete with `npm run test:api -- sync.e2e-spec`, but that invokes unit-test Jest (`rootDir: src`, `testRegex: .*\.spec\.ts$`) and exits with "No tests found". E2e lives under `test/` and passes via `npm run test:e2e -w @parcel-scrubber/api -- sync.e2e-spec` (4/4 green) and CI step `npm run test:e2e -w @parcel-scrubber/api`.
- **Fix**: Update plan Phase 3 automated command to `npm run test:e2e -w @parcel-scrubber/api -- sync.e2e-spec`.
- **Decision**: FIXED — updated plan Phase 3 e2e command

### F2 — Unplanned dev-only POST /api/test/reset-sync

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Scope Discipline
- **Location**: apps/api/src/sync/sync-test.controller.ts:20
- **Detail**: Plan "What We're NOT Doing" lists no production changes to `/api/test/*`. Implementation adds `SyncTestController` with `POST /api/test/reset-sync` (wipes user parcels, ledger, status events). Gated by `NODE_ENV !== 'production'` in sync.module.ts — not exposed in prod, but expands test API surface beyond plan.
- **Fix A ⭐ Recommended**: Document in plan addendum as dev/E2E helper; keep gated registration.
  - Strength: Preserves useful reset tooling for manual and e2e workflows.
  - Tradeoff: Plan scope grows slightly.
  - Confidence: HIGH — matches GmailTestController pattern.
  - Blind spot: None significant.
- **Fix B**: Remove controller and rely on DB truncate in e2e only.
  - Strength: Strict scope alignment.
  - Tradeoff: Loses convenient dev reset; e2e may need alternate setup.
  - Confidence: MEDIUM — check e2e for reset-sync usage.
  - Blind spot: Manual dev workflows may depend on it.
- **Decision**: FIXED via Fix A — documented in plan addendum

### F3 — Success-path ledger write before parcel upsert

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/sync/sync.service.ts:121
- **Detail**: On successful extraction, `createLedgerEntry` runs at line 121 before `upsertParcelFromExtraction` (127–134). If parcel create/update, ParcelEmail link, or orderDate recompute fails, the Gmail id is already ledgered and will not be retried — potential silent data loss. Skip/failure paths ledger early by design; success path should not.
- **Fix**: Move `createLedgerEntry` to after full upsert success, or wrap ledger + parcel + link + orderDate in a single Prisma `$transaction` with ledger write last.
  - Strength: Matches ledger intent (processed = fully handled); prevents stuck skipped messages.
  - Tradeoff: Slightly larger transaction; must handle partial failure explicitly.
  - Confidence: HIGH — standard idempotency pattern.
  - Blind spot: None significant.
- **Decision**: FIXED — success path wrapped in Prisma $transaction with ledger after parcel upsert

### F4 — Non-ExtractionError per message aborts entire job

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/sync/sync.service.ts:109
- **Detail**: Only `ExtractionError` is caught per message. Other throws (Gmail fetch failure, DB error) propagate from `processMessage`, aborting `runJob` and leaving remaining workIds unprocessed. Job may end `failed` after partial progress.
- **Fix**: Wrap per-message body in try/catch: increment `failed`, optionally ledger, continue loop.
  - Strength: Resilient batch sync; one bad message does not block the rest.
  - Tradeoff: Transient Gmail errors may be ledgered/skipped instead of retried unless retry logic added.
  - Confidence: HIGH — aligns with extraction-error continue behavior.
  - Blind spot: Whether to ledger on unknown errors vs leave for retry.
- **Decision**: FIXED — per-message try/catch in runJob; GmailAuthError still fails job

### F5 — Overlapping sync job poll requests

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/features/active/active-list.component.ts:185
- **Detail**: `pollUntilDone` calls `poll()` immediately and again every 1s via `setInterval` with no in-flight guard. Slow API responses can overlap, causing duplicate requests and racy `syncJob` updates.
- **Fix**: Use sequential `setTimeout` chain or a `polling` flag to skip if prior request still pending.
- **Decision**: FIXED — sequential setTimeout polling after each response

### F6 — Unparseable-date skip ledgers with sync time

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/api/src/sync/sync.service.ts:88
- **Detail**: When `parseGmailDateHeader` returns null, ledger row uses `new Date()` (sync time) instead of message date. No parcel is created (correct). Minor semantic drift; no orderDate impact.
- **Fix**: Accept as-is or document; optional use of epoch sentinel if querying by date matters.
- **Decision**: SKIPPED

### F7 — Poll error does not handle stale job (404)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/web/src/app/features/active/active-list.component.ts:174
- **Detail**: Plan says UI should treat missing job (API restart) as stale/failed and allow new Sync. Poll catch shows generic "Failed to check sync status" without distinguishing 404 or clearing `syncing` explicitly for retry UX.
- **Fix**: Detect 404 in poll catch; toast "Sync session expired", clear syncing state, allow new Sync.
- **Decision**: FIXED — 404 poll errors show "Sync session expired" toast
