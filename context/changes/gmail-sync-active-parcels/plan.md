# Gmail sync active parcels Implementation Plan

## Overview

Ship roadmap **S-02**: replace the `/active` placeholder with a working Gmail import loop and active parcel list. A signed-in user clicks Sync on the Active page; the API runs an asynchronous sync job that lists Gmail message ids (scoped by settings), skips ledgered ids, fetches new messages, filters merchant senders, extracts parcel fields via OpenRouter, creates or updates parcels (by normalized tracking number), and links processed mail. The UI polls job status for an inline progress bar, then shows parcels in a table with server-resolved tracking URLs. FR-006 and FR-007 are enforced in orchestration — no age-based archive and no auto-restore of archived parcels.

## Current State Analysis

**Ready foundations:**

- `GmailService.listMatchingEmailIds` + `getMessage` — `apps/api/src/gmail/gmail.service.ts`
- `ExtractionService.extractParcelFields` — `apps/api/src/extraction/extraction.service.ts`
- Merchant allowlist + `detectStoreFromSender` — `apps/api/src/extraction/detect-store-from-sender.ts`
- `Parcel` model + helpers (`normalizeTrackingNumber`, `resolveTrackingUrl`, `isArchivedStatus`) — `apps/api/prisma/schema.prisma`, `apps/api/src/parcels/`
- Settings effective resolution — `SettingsService.getEffectiveSettings` — `apps/api/src/settings/settings.service.ts`
- OAuth + `GmailAuthError` mapping pattern — `apps/api/src/gmail/gmail-test.controller.ts`
- Settings page Angular patterns (signals, PrimeNG, toast) — `apps/web/src/app/features/settings/`

**Missing:**

- Prisma `GmailMessage` / `ParcelEmail` models
- Sync orchestration, job registry, production sync routes
- `GET /api/parcels` read API
- Active list component, `ParcelService`, sync/progress UI
- E2E truncate list does not include future Gmail tables — `apps/api/test/truncate-app-tables.ts`

### Key Discoveries

- F-05 returns header `date` as RFC 2822 string — S-02 must parse to `internalDate` for `orderDate` min logic (`apps/api/src/gmail/extract-message-headers.ts`).
- F-06 does not normalize tracking numbers or set `orderDate` — S-02 owns both on persist.
- Test routes document caller-supplied settings pattern; sync orchestrator reads settings, not `GmailService` directly.
- Active route still points to `ActivePlaceholderComponent` — `apps/web/src/app/app.routes.ts`.

## Desired End State

1. `POST /api/sync` returns `{ jobId }` and starts background work; concurrent request for same user returns `409`.
2. `GET /api/sync/:jobId` returns job status with `processed`, `total`, `imported`, `skipped`, `failed`, `phase`, and terminal `error` / `errorCode` when applicable.
3. `GET /api/parcels?status=active` returns parcels where status is not archived (`DELIVERED` / `REMOVED`), sorted by `orderDate` desc, each with `trackingUrl` resolved server-side.
4. Active page shows table (store, description, order date, carrier, tracking link), Sync button, inline progress bar during job, empty state with Sync CTA, completion toast with counts, and Gmail re-auth toast on `GMAIL_AUTH_REQUIRED`.
5. Ledger prevents re-processing Gmail ids; archived parcels update metadata only on tracking match.

**Verify manually:** sign in, label mail `ParcelScrubber` (or configured label), Sync, observe progress, confirm parcels appear with links; mark one archived in DB (or after S-03), re-sync same tracking — stays archived.

## What We're NOT Doing

- Deliver / remove / archive UI and status transitions (S-03)
- Manual parcel CRUD (S-04)
- Restore / undeliver (S-05)
- Archive list page implementation (placeholder remains)
- Background / scheduled sync
- Configurable merchant sender list in settings UI
- Persistent job store (Redis/DB) or SSE progress stream
- Angular component tests for Active page (API unit/e2e only per decision)
- Production changes to `/api/test/*` routes
- `ParcelStatusEvent` writes on import

## Implementation Approach

Four vertical phases: schema → sync backend → read API → web UI. Sync job runs in-process async (Promise chain after HTTP response) with an in-memory `SyncJobRegistry` keyed by `userId` (one active job) and `jobId` for polling. Orchestration lives in `SyncService`; HTTP thin in `SyncController`. Parcel list mapping in `ParcelsService` with `resolveTrackingUrl`. Web polls job status every ~1s while `running`, refreshes parcel list on `completed`.

## Critical Implementation Details

**Merchant filter (post-fetch):** For each ledger-new Gmail id, always call `getMessage` first. If `detectStoreFromSender(message.from)` is `null`, create `GmailMessage` ledger row and increment `skipped` — do not call extraction. User chose post-fetch over metadata-only pre-filter.

**F-05 DTO rename (before Prisma `GmailMessage` lands):** Rename `type GmailMessage` in `apps/api/src/gmail/types.ts` to `FetchedGmailMessage` and update gmail + extraction imports (`gmail.service.ts`, `extraction.service.ts`, `extraction-prompt.ts`, fixtures, specs). Prisma ledger model keeps the name `GmailMessage` per F-03 research — avoids `@prisma/client` vs fetch-DTO import clash in `SyncService`.

**Ledger semantics:** Create `GmailMessage` for skipped paths (unknown sender, null tracking, extraction skip after ledger creation timing) so ids are not re-fetched. On extraction error after message fetch, ledger the message before continuing so retries do not re-spend OpenRouter on the same id unless you explicitly want retry — decision: ledger on extraction failure too (count `failed`, continue).

**Archived parcel update:** When `findFirst` matches existing parcel by `(userId, trackingNumber)` and `isArchivedStatus(parcel.status)`, update `store`, `description`, `carrier`, `customCarrierLabel` (and links via fields) but **never** change `status`. Still link `ParcelEmail` and recompute `orderDate` from min linked `internalDate`. Do not increment `imported` for archived-only metadata refresh.

**Job loss on restart:** In-memory jobs disappear on API restart; UI should treat missing job as failed/stale and allow new Sync — acceptable for local MVP.

## Phase 1: Gmail ledger schema

### Overview

Add Prisma models for processed-mail ledger and parcel–email junction so sync can skip known Gmail ids and support multi-email parcels with `orderDate = min(internalDate)`.

### Changes Required

#### 1. Prisma schema

**File**: `apps/api/prisma/schema.prisma`

**Intent**: Define immutable processed-mail records and M2M links between parcels and processed messages; add `messages` relation on `Parcel`.

**Contract**:

- `GmailMessage`: `id` (cuid), `userId`, `gmailMessageId` (Gmail API id string), `internalDate` (`DateTime`), optional `threadId`, `createdAt`; `@@unique([userId, gmailMessageId])`; `@@map("gmail_messages")`.
- `ParcelEmail`: composite `@@id([parcelId, gmailMessageId])` where `gmailMessageId` references `GmailMessage.gmailMessageId` with composite FK `@@unique` parent — use `GmailMessage` relation fields `[userId, gmailMessageId]` on both sides OR reference `GmailMessage.id` as `gmailMessageRecordId` if composite FK is awkward in Prisma. Prefer composite FK on `(userId, gmailMessageId)` matching F-03 research dedupe key.
- `Parcel.messages ParcelEmail[]` relation.
- `User` relation to `GmailMessage[]` if needed for cascade.

#### 2. Migration

**File**: `apps/api/prisma/migrations/<timestamp>_add_gmail_message_models/migration.sql`

**Intent**: Apply table creation via `npm run prisma:migrate:dev -w @parcel-scrubber/api`.

**Contract**: Migration applies cleanly against dev and test DBs; indexes on `gmail_messages(user_id, gmail_message_id)` unique and `parcel_emails` composite PK.

#### 3. Date parsing helper

**File**: `apps/api/src/gmail/parse-gmail-date-header.ts` (+ `*.spec.ts`)

**Intent**: Parse RFC 2822 `Date` header from F-05 `GmailMessage.date` into `Date` for `internalDate` storage.

**Contract**: Export `parseGmailDateHeader(raw: string): Date | null`. Invalid/empty → `null`. Unit tests cover typical Allegro/AliExpress-style headers and empty string.

#### 4. E2E truncate helper

**File**: `apps/api/test/truncate-app-tables.ts`

**Intent**: Include `parcel_emails` and `gmail_messages` in `TRUNCATE` order (child tables before parents).

**Contract**: Truncate list: `parcel_emails`, `gmail_messages`, then existing tables.

#### 5. F-05 DTO rename (prerequisite for Prisma model name)

**File**: `apps/api/src/gmail/types.ts` (+ gmail/extraction import sites)

**Intent**: Rename fetch DTO `GmailMessage` → `FetchedGmailMessage` so Prisma `GmailMessage` ledger model can coexist without type clashes.

**Contract**: All F-05 consumers updated; `getMessage` return type is `FetchedGmailMessage`; no remaining `GmailMessage` type export from `gmail/types.ts`.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npm run prisma:migrate:dev -w @parcel-scrubber/api`
- Unit tests pass: `npm run test:api -- parse-gmail-date-header`
- F-05 DTO rename: `npm run test:api -- gmail extraction` (existing suites green after `FetchedGmailMessage` rename)
- Linting passes: `npm run lint:api`

#### Manual Verification

- Prisma client exposes `GmailMessage` and `ParcelEmail` types after generate
- No changes to existing `Parcel` migration constraints

**Implementation Note**: Pause for manual confirmation after automated checks before Phase 2.

---

## Phase 2: Sync orchestration and job API

### Overview

Implement sync pipeline, in-memory job registry, and authenticated HTTP routes to start sync and poll progress.

### Changes Required

#### 1. Sync job types and registry

**File**: `apps/api/src/sync/sync-job.types.ts`, `apps/api/src/sync/sync-job.registry.ts` (+ `sync-job.registry.spec.ts`)

**Intent**: Track per-user sync jobs in memory with statuses `pending | running | completed | failed`; enforce one running job per user.

**Contract**:

- `SyncJob`: `id`, `userId`, `status`, `phase` (`listing | processing | done`), `total`, `processed`, `imported`, `skipped`, `failed`, `error?`, `errorCode?` (e.g. `GMAIL_AUTH_REQUIRED`), `startedAt`, `finishedAt?`.
- `SyncJobRegistry.start(userId): { jobId } | null` returns null if user already has `running` job.
- `get(jobId, userId)` for poll authorization (job must belong to user).

#### 2. Sync orchestration service

**File**: `apps/api/src/sync/sync.service.ts` (+ `sync.service.spec.ts`)

**Intent**: Run full import loop; update job counters after each message; map service errors to job failure codes.

**Contract**: `runJob(userId, jobId): Promise<void>` (invoked async from controller). Pipeline:

1. `settings.getEffectiveSettings(userId)`
2. `gmail.listMatchingEmailIds` → load ledger ids into Set; `workIds = allIds.filter(id => !ledgerSet.has(id))`; set `total = workIds.length`
3. For each id in `workIds`:
   - `getMessage`
   - If unparseable date → create `GmailMessage` ledger row, `skipped++`, continue (never create `Parcel` — `orderDate` is required)
   - If not merchant sender → create `GmailMessage`, `skipped++`
   - Else `extractParcelFields` (sequential)
   - On `ExtractionError` → ledger message, `failed++`, continue
   - If null tracking → ledger, `skipped++`
   - Else normalize tracking; **find existing parcel** via `findFirst({ where: { userId, trackingNumber: normalized } })` (partial unique index — do **not** use `prisma.parcel.upsert`); create or update respecting archived rule; link `ParcelEmail`; recompute `orderDate` as min `internalDate` across links
   - `imported++` when new parcel row created OR existing non-archived parcel had at least one field change; never increment for archived-only metadata refresh
   - `processed++`, update registry progress

6. On `GmailAuthError` → mark job `failed`, `errorCode = GMAIL_AUTH_REQUIRED`
7. On completion → `status = completed`, `phase = done`

OpenRouter availability is enforced at DI via `OpenRouterClient` constructor `getOrThrow('OPENROUTER_API_KEY')` — no separate sync-time env check in S-02.

Use `detectStoreFromSender` for merchant gate; use `result.store` from extraction for persist (should match). Import `normalizeTrackingNumber`, `isArchivedStatus` from parcels helpers. New parcels: `status = NEW`, `source = GMAIL`. No `ParcelStatusEvent` rows.

#### 3. Sync controller

**File**: `apps/api/src/sync/sync.controller.ts` (+ `sync.controller.spec.ts`)

**Intent**: HTTP surface for start + poll; map `GmailAuthError` on start if listing fails synchronously.

**Contract**:

- `POST /api/sync` — `@UseGuards(JwtAuthGuard)` — starts job, returns `202` `{ jobId }`; `409` if sync already running for user; fire `runJob` without awaiting in request handler.
- `GET /api/sync/:jobId` — returns `SyncJob` DTO for current user; `404` if not found or wrong user.

Mirror `rethrowGmailAuthError` pattern from `gmail-test.controller.ts` for any synchronous errors on POST.

#### 4. Sync module wiring

**File**: `apps/api/src/sync/sync.module.ts`, `apps/api/src/app.module.ts`

**Intent**: Register module importing `GmailModule`, `ExtractionModule`, `SettingsModule`, `PrismaModule`; export `SyncService` if needed.

**Contract**: `SyncModule` imported in `AppModule` after dependencies.

#### 5. Merchant sender helper (optional thin export)

**File**: `apps/api/src/extraction/detect-store-from-sender.ts` (or `sync/is-merchant-sender.ts`)

**Intent**: Optional `isMerchantSender(fromHeader: string): boolean` wrapping `detectStoreFromSender !== null` for readable orchestration — inline acceptable if no new file.

**Contract**: Reuse existing constants; no duplicate email lists.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test:api -- sync`
- Linting passes: `npm run lint:api`

#### Manual Verification

- `POST /api/sync` + poll returns increasing `processed` against mocked Gmail/extraction in tests
- Second `POST` while running returns 409 in controller spec / manual curl

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Active parcels read API

### Overview

Expose authenticated list endpoint for active parcels with server-resolved tracking URLs and stable sort order.

### Changes Required

#### 1. Parcel DTO and mapper

**File**: `apps/api/src/parcels/parcel.dto.ts`, `apps/api/src/parcels/map-parcel-to-dto.ts` (+ spec)

**Intent**: Shape API response for web table; resolve tracking URL at map time.

**Contract**: `ParcelDto`: `id`, `store`, `description`, `carrier`, `customCarrierLabel`, `trackingNumber`, `trackingUrl` (from `resolveTrackingUrl`), `orderDate` (ISO date string), `status`, `source`, `createdAt`, `updatedAt`.

#### 2. Parcels service

**File**: `apps/api/src/parcels/parcels.service.ts` (+ `parcels.service.spec.ts`)

**Intent**: Query parcels for user with status filter.

**Contract**: `listForUser(userId, { status: 'active' })` — active means `status` not `DELIVERED` and not `REMOVED` (inverse of `isArchivedStatus`). Order by `orderDate` desc, then `createdAt` desc. Map each row to `ParcelDto`.

#### 3. Parcels controller

**File**: `apps/api/src/parcels/parcels.controller.ts` (+ `parcels.controller.spec.ts`)

**Intent**: JWT-protected read route.

**Contract**: `GET /api/parcels?status=active` — validate query enum; return `400 Bad Request` for unknown `status` values. Only `active` is supported in S-02.

#### 4. Parcels module

**File**: `apps/api/src/parcels/parcels.module.ts`, `apps/api/src/app.module.ts`

**Intent**: Register controller + service; keep pure helpers in existing files.

**Contract**: `ParcelsModule` imported in `AppModule`.

#### 5. Sync e2e tests

**File**: `apps/api/test/sync.e2e-spec.ts`

**Intent**: Prisma-level e2e for orchestration with mocked `GmailService` and `ExtractionService` (Nest testing module overrides) or direct `SyncService` with test DB.

**Contract**: Scenarios: import new parcel from mocked message; ledger skip on second run; archived parcel stays archived on tracking match; unknown sender ledgered without parcel.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test:api -- parcels`
- E2E passes: `npm run test:api -- sync.e2e-spec`
- Linting passes: `npm run lint:api`

#### Manual Verification

- `GET /api/parcels?status=active` returns seeded active parcels with `trackingUrl` populated for InPost/DPD/etc.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Active page UI

### Overview

Replace placeholder with Active list page: table, Sync control, progress bar, polling, empty state, and toasts.

### Changes Required

#### 1. Web parcel types and service

**File**: `apps/web/src/app/core/parcels/parcels.types.ts`, `apps/web/src/app/core/parcels/parcels.service.ts`

**Intent**: HTTP client for list and sync consistent with `SettingsService` pattern.

**Contract**:

- `listActive(): Promise<ParcelDto[]>`
- `startSync(): Promise<{ jobId: string }>` — handle 409
- `getSyncJob(jobId: string): Promise<SyncJobDto>` matching API shape

#### 2. Active list component

**File**: `apps/web/src/app/features/active/active-list.component.ts`, `.html`, `.scss` (replace placeholder)

**Intent**: Main S-02 UI on `/active`.

**Contract**:

- Header row: title + Sync `p-button` (disabled while sync running)
- `p-progressBar` or custom bar showing `processed/total` + text counts when job `running`
- `p-table` columns: store, description, order date (formatted locale), carrier (show `customCarrierLabel` when `CUSTOM`), tracking link (`<a>` when `trackingUrl` present)
- Empty state component/section with Sync CTA
- On init: `loadParcels()`
- On Sync click: `startSync()` → poll `getSyncJob` until `completed | failed`
- On `completed`: refresh list + success toast with imported/skipped/failed
- On `failed` with `GMAIL_AUTH_REQUIRED`: error toast prompting re-login (link/button to OAuth)
- On 409: toast that sync already running

Use signals for `loading`, `parcels`, `syncJob`, `syncing` — mirror settings page patterns.

#### 3. Routes

**File**: `apps/web/src/app/app.routes.ts`

**Intent**: Point `/active` to new component.

**Contract**: Replace `ActivePlaceholderComponent` import with `ActiveListComponent`; keep `authGuard`.

#### 4. Cleanup placeholder

**File**: `apps/web/src/app/features/active/active-placeholder.component.*`

**Intent**: Remove unused placeholder files if fully replaced (or keep file deleted to avoid dead code).

**Contract**: No references to placeholder remain.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint:web`
- Web unit tests pass: `npm run test:web` (existing suite still green)

#### Manual Verification

- Empty Active shows CTA; Sync shows progress bar for multi-message mailbox
- After sync, table populated; tracking links open carrier pages
- Completion toast shows counts
- Revoked Gmail token shows re-login toast
- Second Sync click while running shows already-running feedback

**Implementation Note**: Final manual sign-off on real Gmail mailbox (Allegro/AliExpress labeled mail) for north-star validation.

---

## Testing Strategy

### Unit Tests

- `parseGmailDateHeader` edge cases
- `SyncJobRegistry` one-job-per-user enforcement
- `SyncService` pipeline with mocked Gmail, extraction, Prisma (import, skip, ledger, archived parcel update, extraction error continue)
- `ParcelsService` active filter + sort + `trackingUrl` mapping
- Controllers: auth guard override pattern, 409, 404 job, query validation

### Integration Tests

- `sync.e2e-spec.ts` against test Postgres with truncated gmail tables
- Optional `parcels.e2e-spec.ts` for list endpoint with seeded data

### Manual Testing Steps

1. Configure settings label `ParcelScrubber` and 30-day period; ensure labeled mail exists.
2. Sign in with Google; open Active; run Sync; confirm progress bar and completion toast.
3. Verify ≥1 parcel with correct order date and working InPost/DPD/DHL link.
4. Run Sync again — no duplicate parcels; skipped count reflects ledger.
5. Insert `DELIVERED` parcel with same tracking in DB; re-sync — status stays `DELIVERED`, metadata may update.
6. Revoke refresh token or simulate `GmailAuthError` — failed job + re-login toast.

## Performance Considerations

- Sequential OpenRouter calls: worst case ~500 messages × latency — progress UI is mandatory; consider logging duration.
- Ledger id query: single `findMany` for user's `gmailMessageId` values before loop (or query per batch).
- Gmail list capped at 500 ids (F-05) — document in UI help later if needed (out of S-02 scope).
- Poll interval ~1s — avoid hammering API faster.

## Migration Notes

- New tables only; no backfill required.
- Existing `parcels` rows unaffected until first sync.
- Deploy order: migration → API with sync routes → web UI.

## References

- Roadmap S-02: `context/foundation/roadmap.md`
- PRD import rules: `context/foundation/prd.md` (FR-003–FR-008, FR-014, FR-017)
- F-03 parcel + dedupe research: `context/archive/2026-06-06-parcel-prisma-model/research.md`
- F-05 Gmail contracts: `context/archive/2026-06-08-gmail-message-retrieval/plan-brief.md`
- F-06 extraction contracts: `context/archive/2026-06-09-ai-email-parcel-extraction/plan.md`
- Gmail test controller settings pattern: `apps/api/src/gmail/gmail-test.controller.ts`
- Settings web patterns: `apps/web/src/app/features/settings/settings-page.component.ts`

## Progress

### Phase 1: Gmail ledger schema

#### Automated

- [x] 1.1 Migration applies cleanly: `npm run prisma:migrate:dev -w @parcel-scrubber/api` — e99ec32
- [x] 1.2 Unit tests pass: `npm run test:api -- parse-gmail-date-header` — e99ec32
- [x] 1.3 F-05 DTO rename: `npm run test:api -- gmail extraction` — e99ec32
- [x] 1.4 Linting passes: `npm run lint:api` — e99ec32

#### Manual

- [x] 1.5 Prisma client exposes `GmailMessage` and `ParcelEmail` types after generate — e99ec32
- [x] 1.6 No changes to existing `Parcel` migration constraints — e99ec32
- [x] 1.7 F-05 DTO renamed to `FetchedGmailMessage`; no `GmailMessage` type export in `gmail/types.ts` — e99ec32

### Phase 2: Sync orchestration and job API

#### Automated

- [x] 2.1 Unit tests pass: `npm run test:api -- sync`
- [x] 2.2 Linting passes: `npm run lint:api`

#### Manual

- [x] 2.3 Second `POST /api/sync` while running returns 409
- [x] 2.4 `POST /api/sync` + poll returns increasing `processed` in controller/service tests

### Phase 3: Active parcels read API

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test:api -- parcels`
- [ ] 3.2 E2E passes: `npm run test:api -- sync.e2e-spec`
- [ ] 3.3 Linting passes: `npm run lint:api`

#### Manual

- [ ] 3.4 `GET /api/parcels?status=active` returns parcels with resolved `trackingUrl`

### Phase 4: Active page UI

#### Automated

- [ ] 4.1 Linting passes: `npm run lint:web`
- [ ] 4.2 Web unit tests pass: `npm run test:web`

#### Manual

- [ ] 4.3 Active page empty state shows Sync CTA; Sync shows progress bar and populates table after completion
- [ ] 4.4 Completion toast shows imported/skipped/failed counts
- [ ] 4.5 Gmail auth failure shows re-login toast
- [ ] 4.6 Second Sync click while running shows already-running feedback
- [ ] 4.7 Real mailbox manual validation (Allegro/AliExpress labeled mail)
