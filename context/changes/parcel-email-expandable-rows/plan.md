# Parcel Email Expandable Rows Implementation Plan

## Overview

Let users expand a parcel row on the Active and Archive tables to see every linked Gmail message, each with an outbound link to Gmail (`FR-019` / `US-04` / roadmap `S-07`). Persist `subject` and `from` on new sync ledger writes so expanded rows can show recognizable labels, embed linked messages on list/detail `ParcelDto`, and add PrimeNG row expansion on both parcel tables.

## Current State Analysis

- Sync already creates `GmailMessage` + `ParcelEmail` links when a message imports/enriches a parcel (`apps/api/src/sync/sync.service.ts`). Already-ledgered Gmail ids are skipped on later syncs — there is no update path for metadata.
- `GmailMessage` stores `gmailMessageId` and `internalDate` only. `FetchedGmailMessage` exposes `from`, `subject`, `date`, and `body` at fetch time, but subject/from are discarded after extraction.
- `GET /api/parcels?status=…` and `GET /api/parcels/:id` return a flat `ParcelDto` via `mapParcelToDto` — no `messages` relation is loaded or mapped.
- Active and Archive lists use PrimeNG `p-table` with flat body rows. No `expandedRowKeys` / row-expansion pattern exists in the web app.
- Manual parcels and Gmail parcels with zero `ParcelEmail` links exist; expand should not show a toggler when `messages.length === 0`.

## Desired End State

- New `GmailMessage` rows written by sync include nullable `subject` and `from`.
- Every parcel API response that returns `ParcelDto` includes `messages[]` (oldest-first) with `gmailMessageId`, `internalDate`, `subject`, and `from`.
- Active and Archive tables support multi-row PrimeNG expansion when a parcel has at least one linked message. Each expanded entry shows subject and from when present; when subject is missing, show date + link only (no truncated id label). Each entry links to `https://mail.google.com/mail/u/0/#all/{gmailMessageId}` with `pi-external-link`, `target="_blank"`, and `rel="noopener noreferrer"`.

### Key Discoveries:

- Linked mail already exists in Prisma (`Parcel.messages` → `ParcelEmail` → `GmailMessage`); S-07 is primarily a read-path + UI slice plus metadata persistence for new syncs (`apps/api/prisma/schema.prisma`).
- `mapParcelToDto` is shared by list, get-by-id, create, update, and lifecycle mutations — extending it keeps the DTO consistent for the edit page even though the form ignores `messages` (`apps/api/src/parcels/map-parcel-to-dto.ts`).
- No `active-list` / `archive-list` component specs exist yet; this change adds them.
- Skip/fail ledger rows are never parcel-linked; writing subject/from on those creates is consistency-only and does not affect expand UI.

## What We're NOT Doing

- Backfilling subject/from for already-ledgered `GmailMessage` rows (no live Gmail enrich on expand, no bulk backfill job).
- Lazy `GET /parcels/:id/emails` — messages are embedded on `ParcelDto`.
- Expanding rows with zero linked messages (toggler hidden when `messages.length === 0`).
- Merge parcels (`S-08`), carrier-linking changes (`S-06` already archived), or settings/allowlist work.
- Showing truncated `gmailMessageId` as a label fallback when subject is null.
- Browser e2e for the expand click path.
- Shared abstracted expandable-table component across Active/Archive (update both lists in place).

## Implementation Approach

1. Add nullable `subject` and `from` on `GmailMessage` via Prisma migration; write them whenever sync creates a ledger row (success path and skip/fail path) while `FetchedGmailMessage` is in hand.
2. Load `messages.gmailMessage` (or equivalent include) in parcel list/get/mutation return paths that map through `mapParcelToDto`; extend the DTO with sorted `messages[]`.
3. Mirror the DTO on the web client; add PrimeNG row expansion to Active and Archive tables with multi-expand, gated toggler, and Gmail outbound links.
4. Cover with API unit tests (mapper/service/sync write fields) and new Active/Archive component specs.

## Critical Implementation Details

**State sequencing:** Sync never updates an existing `GmailMessage`. Subject/from only appear for messages ledgered after this change. Pre-existing links will expand with date + link only until/unless a future backfill ships — that is intentional.

**User experience spec:** Multi-expand via `expandedRowKeys`. Toggler column only when `parcel.messages.length > 0`. Expanded row content: subject (if present), from (if present), message date, external-link icon/control. When subject is null, omit subject text — show date and the Gmail link only. Do not invent a truncated-id label.

## Phase 1: Schema + sync metadata

### Overview

Persist `subject` and `from` on every new `GmailMessage` create during sync so future expandable rows can show recognizable labels.

### Changes Required:

#### 1. Prisma GmailMessage metadata

**File**: `apps/api/prisma/schema.prisma`

**Intent**: Add nullable string columns for email subject and sender so sync can store display metadata without breaking existing rows.

**Contract**: `GmailMessage` gains optional `subject` and `from` (DB column for `from` must be quoted or mapped — `from` is reserved in SQL; use `@map("from_address")` or equivalent safe column name). Follow with a new migration under `apps/api/prisma/migrations/`.

#### 2. Sync ledger writes

**File**: `apps/api/src/sync/sync.service.ts`

**Intent**: When creating a `GmailMessage` on the success path (`upsertParcelFromExtraction` transaction) and on skip/fail (`createLedgerEntry`), persist `message.subject` and `message.from` alongside `internalDate`.

**Contract**: Both create call sites write `subject` and `from` from the fetched message. No update/upsert for already-ledgered ids. Signature changes required on both helpers:
1. Extend `createLedgerEntry` so all three callers (bad-date skip, ExtractionError, empty-tracking skip) pass `subject`/`from` from the in-scope `FetchedGmailMessage` — `processMessage` always fetches before those branches; only the date header may be unusable, not the message itself.
2. Extend `upsertParcelFromExtraction` to accept `subject`/`from` (or the whole `FetchedGmailMessage`) and write them on the success-path `gmailMessage.create` — today that method only receives `gmailMessageId` + `internalDate`, so metadata will not appear on linked parcels unless this signature is widened.

#### 3. Sync unit tests

**File**: `apps/api/src/sync/sync.service.spec.ts`

**Intent**: Assert success and ledger create payloads include subject/from when the fetched message provides them.

**Contract**: Existing create expectations gain `subject` / `from` fields matching the fixture `FetchedGmailMessage`.

### Success Criteria:

#### Automated Verification:

- Prisma migration applies cleanly (`npm run prisma:migrate:dev -w @parcel-scrubber/api` or project-equivalent migrate command for this workspace)
- API unit tests pass for sync: `npm run test:api -- sync.service.spec`
- Lint passes for touched API files: `npm run lint -w @parcel-scrubber/api`

#### Manual Verification:

- After a fresh sync of a never-before-seen Gmail message, the corresponding `gmail_messages` row has non-null `subject`/`from` when Gmail returned them

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before Phase 2.

---

## Phase 2: API embed messages on ParcelDto

### Overview

Expose linked Gmail messages on every `ParcelDto` returned by list and get-by-id (and other mapper consumers), sorted oldest-first, so the web lists can expand without a second request.

### Changes Required:

#### 1. Parcel message DTO shape

**File**: `apps/api/src/parcels/parcel.dto.ts`

**Intent**: Extend the public parcel contract with an embedded messages array used by expandable rows.

**Contract**: Add a nested type (e.g. `ParcelMessageDto`) with `gmailMessageId: string`, `internalDate: string` (ISO), `subject: string | null`, `from: string | null`. `ParcelDto` gains `messages: ParcelMessageDto[]`.

#### 2. Mapper + Prisma include type

**File**: `apps/api/src/parcels/map-parcel-to-dto.ts`

**Intent**: Map included `ParcelEmail` → `GmailMessage` relations into the DTO array, sorted by `internalDate` ascending (oldest first).

**Contract**: `mapParcelToDto` accepts a parcel that includes messages (widen the Prisma payload type). Missing or empty `messages` (including `undefined` when Prisma returns a bare create/update result without include) → `messages: []`. Sort stable by `internalDate` ascending. Serialize dates as ISO strings consistent with other DTO date fields.

#### 3. ParcelsService load paths

**File**: `apps/api/src/parcels/parcels.service.ts`

**Intent**: Every query that returns a mapped `ParcelDto` must include linked messages so the DTO is complete.

**Contract**: `listForUser`, `getByIdForUser`, and any create/update/lifecycle methods that call `mapParcelToDto` include `messages: { include: { gmailMessage: true } }` (or equivalent). `createForUser` today maps the Prisma `create` result directly (no relation include) — rely on the mapper's undefined→`[]` coercion so manual creates still return `messages: []` without a post-create re-fetch.

#### 4. API unit tests

**Files**: `apps/api/src/parcels/map-parcel-to-dto.spec.ts`, `apps/api/src/parcels/parcels.service.spec.ts` (and controller specs if they assert DTO shape)

**Intent**: Lock embed + sort + empty-array behavior.

**Contract**: Mapper tests cover multiple messages sorted oldest-first, null subject/from, and empty messages. Service list/get tests assert include/mapping of messages when prisma returns them.

### Success Criteria:

#### Automated Verification:

- API unit tests pass: `npm run test:api -- map-parcel-to-dto.spec` and `npm run test:api -- parcels.service.spec`
- Lint passes for touched API files: `npm run lint -w @parcel-scrubber/api`

#### Manual Verification:

- `GET /api/parcels?status=active` for a synced parcel returns `messages` with `gmailMessageId` and `internalDate`; new syncs also include `subject`/`from` when available

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before Phase 3.

---

## Phase 3: Expandable rows UI on Active + Archive

### Overview

Add PrimeNG multi-row expansion to Active and Archive parcel tables, gated on linked messages, with outbound Gmail links matching FR-019.

### Changes Required:

#### 1. Web ParcelDto mirror

**File**: `apps/web/src/app/core/parcels/parcels.types.ts`

**Intent**: Keep the Angular client types aligned with the API embed contract.

**Contract**: Add `ParcelMessageDto` (or equivalent) and `messages: ParcelMessageDto[]` on `ParcelDto`, matching API field names/nullability.

#### 2. Active list row expansion

**Files**: `apps/web/src/app/features/active/active-list.component.{ts,html,scss}`

**Intent**: Let users expand parcels that have linked mail and open each message in Gmail.

**Contract**:
- Use PrimeNG `p-table` row expansion with `expandedRowKeys` (multi-expand allowed). Reuse the existing `dataKey="id"` (already set on Active and Archive tables) — required for `expandedRowKeys`; do not omit or rename it.
- Show row toggler only when `parcel.messages.length > 0`.
- Expanded content lists each message: subject when non-null; from when non-null; date; link to `https://mail.google.com/mail/u/0/#all/{gmailMessageId}` with `pi-external-link`, `target="_blank"`, and `rel="noopener noreferrer"`.
- When subject is null: date + link only (no truncated id label).

#### 3. Archive list row expansion

**Files**: `apps/web/src/app/features/archive/archive-list.component.{ts,html,scss}`

**Intent**: Same expand behavior on the archive table so provenance is available for delivered/removed parcels.

**Contract**: Same expansion rules as Active (multi-expand, gated toggler, subject/from/date/link presentation, Gmail URL + icon). Preserve existing Status column and Restore/Edit actions.

#### 4. Web component specs

**Files**: `apps/web/src/app/features/active/active-list.component.spec.ts`, `apps/web/src/app/features/archive/archive-list.component.spec.ts` (create)

**Intent**: Lock toggler visibility, Gmail href/target/icon, and subject-missing presentation without browser e2e.

**Contract**: Specs assert (1) no toggler when `messages` is empty, (2) toggler present when messages exist, (3) expanded link `href` matches the FR-019 URL pattern and opens in a new tab, (4) `pi-external-link` is present, (5) when subject is null the truncated message id is not shown as a label.

### Success Criteria:

#### Automated Verification:

- Web unit tests pass: `npm run test:web`
- Web lint passes: `npm run lint -w @parcel-scrubber/web`
- Full workspace lint + test: `npm run lint` and `npm run test`

#### Manual Verification:

- On Active: expand a synced parcel with links — see subject/from when present; open Gmail in a new tab via the external-link control
- On Active: a manual parcel with no messages has no expand toggler
- On Archive: same expand behavior for an archived parcel with links
- A parcel whose linked messages predate subject persistence shows date + link only (no truncated id label)

**Implementation Note**: After completing this phase and all automated verification passes, pause for final manual confirmation that FR-019 is satisfied on both lists.

---

## Testing Strategy

### Unit Tests:

- Sync: `gmailMessage.create` payloads include `subject`/`from` on success and ledger paths when available
- Mapper: empty messages → `[]`; multiple messages sorted oldest-first; null subject/from pass through
- ParcelsService list/get: returned DTOs include mapped messages from included relations
- Active/Archive components: toggler gating, Gmail URL/icon/target, subject-null presentation

### Integration Tests:

- Optional: extend `apps/api/test/parcels.e2e-spec.ts` only if list assertions already lock DTO shape and a small messages fixture is cheap — not required for slice completion if unit coverage is solid

### Manual Testing Steps:

1. Sync Gmail so at least one parcel has linked messages with subject/from populated
2. On `/active`, confirm toggler only on parcels with messages; expand and open a Gmail link in a new tab
3. Confirm a zero-message parcel (e.g. manual) has no toggler
4. Mark a parcel delivered/archived; on `/archive`, expand and verify the same message list/links
5. If any pre-S-07 linked messages remain, confirm expand shows date + link without a truncated id label

## Performance Considerations

Personal mailbox volumes are small; embedding `messages[]` on list responses is acceptable. Include only the junction + `GmailMessage` fields needed for the DTO (no body). No pagination of messages per parcel in v1.

## Migration Notes

- Additive nullable columns only — existing rows remain valid with null subject/from.
- No data backfill. UI deliberately degrades to date + link for legacy rows.
- Column name for sender must avoid SQL reserved-word pitfalls (`from` → mapped column such as `from_address`).

## References

- Roadmap: `context/foundation/roadmap.md` (S-07)
- PRD: `context/foundation/prd.md` (US-04, FR-019)
- Product note: `FEATURES_TO_COME.md` item 1
- Prior deferral: `context/archive/2026-07-19-carrier-email-parcel-linking/plan.md` (S-07 out of scope)
- Schema: `apps/api/prisma/schema.prisma` (`GmailMessage`, `ParcelEmail`)
- Sync writes: `apps/api/src/sync/sync.service.ts`
- DTO/mapper: `apps/api/src/parcels/parcel.dto.ts`, `apps/api/src/parcels/map-parcel-to-dto.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + sync metadata

#### Automated

- [x] 1.1 Prisma migration applies cleanly — 1a9a893
- [x] 1.2 API sync unit tests pass — 1a9a893
- [x] 1.3 API lint passes for touched files — 1a9a893

#### Manual

- [x] 1.4 Fresh-sync GmailMessage row has subject/from when Gmail returned them — 1a9a893

### Phase 2: API embed messages on ParcelDto

#### Automated

- [x] 2.1 API mapper and parcels.service unit tests pass — ad189a5
- [x] 2.2 API lint passes for touched files — ad189a5

#### Manual

- [x] 2.3 GET /api/parcels?status=active returns messages for a synced parcel

### Phase 3: Expandable rows UI on Active + Archive

#### Automated

- [x] 3.1 Web unit tests pass
- [x] 3.2 Web lint passes
- [x] 3.3 Full workspace lint and test pass

#### Manual

- [x] 3.4 Active: expand synced parcel; Gmail link opens in new tab with subject/from when present
- [x] 3.5 Active: zero-message parcel has no expand toggler
- [x] 3.6 Archive: expand works for archived parcel with links
- [x] 3.7 Legacy null-subject messages show date + link only (no truncated id label)
