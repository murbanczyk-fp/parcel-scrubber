# Carrier Email Parcel Linking Implementation Plan

## Overview

Extend Gmail sync so messages under the configured scan label are no longer skipped solely because the sender is not Allegro/AliExpress. When extraction yields a usable tracking number, sync links to an existing parcel or creates one (with `store` null for carrier-only mail). On match, sync fills only null/empty parcel fields so later merchant mail can enrich carrier-first parcels without clobbering user edits or prior non-empty values (US-06 / FR-018 / FEATURES_TO_COME item 3).

## Current State Analysis

Sync orchestration in `apps/api/src/sync/sync.service.ts` already lists labeled messages, skips ledgered Gmail ids, extracts via OpenRouter, dedupes by normalized tracking number, creates/updates parcels, links `ParcelEmail`, and recomputes `orderDate` as the min linked `internalDate`.

Today it **hard-skips** unknown senders before extraction (`detectStoreFromSender === null` → ledger + skip). On match it **blindly overwrites** `store`, `description`, `carrier`, and `customCarrierLabel`. Tracking URLs are **not** written by sync — list DTOs resolve them at read time via `resolveTrackingUrl` (DB override if set, else template from carrier + tracking).

`ExtractionService` already returns `store: null` for unknown senders and still calls OpenRouter. Prisma `Parcel.store` is nullable; the active list UI shows `store ?? '—'`. Manual create still requires store (out of scope).

## Desired End State

After Sync:

- A labeled carrier (or other non-merchant) email with an extractable tracking number creates a parcel when the tracking number is new (`store` may be null), or links to the existing parcel when it matches.
- When a merchant email later shares that tracking number, sync fills only **null or empty** fields (e.g. `store`, `description`) and links the message — no second parcel.
- Non-empty parcel fields (including user edits) are never overwritten by sync.
- Messages with no usable tracking still ledger + skip (no repeat OpenRouter on re-sync).
- `ExtractionError` (including tracking present but `CUSTOM` without `customCarrierLabel`) still ledger + **failed** — validation unchanged; those Gmail ids do not retry until ledger cleanup.
- Displayed tracking links update when `carrier` is enriched from `CUSTOM` to a known carrier, without sync writing `trackingUrl` (existing read-time resolution).

### Key Discoveries:

- Merchant gate: `apps/api/src/sync/sync.service.ts` (unknown sender ledger + skip before extract)
- Blind overwrite upsert: same file, `upsertParcelFromExtraction` / `parcelFieldsChanged`
- Store from sender only: `apps/api/src/extraction/extraction.service.ts` + `detect-store-from-sender.ts`
- Tracking URL read-time: `apps/api/src/parcels/resolve-tracking-url.ts` — sync must not persist generated URLs
- Carrier default `CUSTOM` (`schema.prisma`) — treat `CUSTOM` as empty for merge so a real carrier can fill in
- Tests to replace: `sync.service.spec.ts` and `sync.e2e-spec.ts` “unknown sender” skip cases
- Prior pattern: `context/archive/2026-06-14-gmail-sync-active-parcels/` (ledger-first, findFirst + create/update, archived status unchanged)

## What We're NOT Doing

- UI changes (list copy, forms, expandable rows — S-07)
- Manual parcel merge (S-08)
- Configurable merchant/carrier allowlists in settings
- Carrier sender allowlist (all labeled messages are extraction candidates)
- Persisting generated tracking URLs from sync
- Changing Manual CRUD store-required validation (edit form still requires store — carrier-created null-store parcels need store filled before a manual save succeeds; list `—` display is unchanged)
- “Merchant wins over non-empty carrier description” special cases (strict fill-null only)
- Sentinel store values (`Other` / `Carrier`) — carrier-only keeps `store` null
- Schema migrations (nullable store and linking tables already exist)

## Implementation Approach

Keep the S-02 pipeline intact. Change two behaviors in `SyncService`:

1. **Merge semantics** — before every update (active and archived), compute field data with fill-null/empty merge against the existing parcel; `imported` only when the merged result differs from existing on non-archived parcels.
2. **Sender gate** — remove the pre-extraction merchant allowlist check so non-merchant messages reach extraction; keep ledger + skip when tracking is missing.

Extraction, Gmail ledger, `ParcelEmail` linking, and `orderDate` recompute stay as they are.

## Critical Implementation Details

### Carrier “empty” for merge

`Parcel.carrier` is non-null with default `CUSTOM`. For fill-null merge, treat `carrier === CUSTOM` as empty when the incoming extraction has a non-`CUSTOM` carrier so carrier-first (or incomplete) parcels can gain InPost/DPD/etc. later. If both sides are `CUSTOM`, still fill `customCarrierLabel` only when existing label is null/empty. Do not “downgrade” a known carrier to `CUSTOM`. When the merged carrier is non-`CUSTOM`, always persist `customCarrierLabel: null` (mirror `ParcelsService` clear-on-leave-CUSTOM) so upgrades never leave a stale label beside InPost/DPD/etc.

### Tracking URL (decision 6A)

Do **not** write `trackingUrl` in sync. When merge fills `carrier` and DB `trackingUrl` is null/empty, `resolveTrackingUrl` already returns the template URL on the next list read. Manual overrides in `trackingUrl` remain untouched because sync never writes that column.

### String emptiness

Treat `null` and whitespace-only strings as empty for `store`, `description`, and `customCarrierLabel`.

### ExtractionError vs no-tracking (counters)

Keep existing sync counters: no usable tracking after a successful extract → ledger + `skipped`; `ExtractionError` (invalid carrier, `CUSTOM` without label when tracking is present, etc.) → ledger + `failed`. Do not soften `validateExtractedFields` in this change. Gate removal makes the failed path more visible for misc labeled mail — document it; retry only via ledger cleanup (same as pre-change unknown-sender skips).

---

## Phase 1: Fill-null sync merge

### Overview

Replace blind field overwrite on parcel update with a null/empty merge used for all sync upserts (active and archived). Creates still apply extraction fields as-is (including `store: null`).

### Changes Required:

#### 1. Merge helper

**File**: `apps/api/src/sync/` (new small helper next to sync service, e.g. `merge-parcel-fields-from-extraction.ts`, or a private function in `sync.service.ts` if the team prefers co-location)

**Intent**: Given an existing parcel (or null) and extracted fields, produce the `store` / `description` / `carrier` / `customCarrierLabel` payload to persist — identity on create; fill-null/empty on update, with `CUSTOM`-as-empty carrier rules above.

**Contract**: Pure function returning `ParcelFieldData`. Unit-testable without Prisma. `parcelFieldsChanged` compares existing vs **merged** payload only.

#### 2. Upsert path

**File**: `apps/api/src/sync/sync.service.ts`

**Intent**: On update paths (active and archived), persist merged fields instead of raw extraction. Keep archived status unchanged and `imported === false` for archived. For active, set `imported` only when merged fields differ from existing.

**Contract**: `upsertParcelFromExtraction` still creates ledger + `ParcelEmail` + min `orderDate` recompute unchanged. Create path spreads extraction field data (null store allowed).

### Success Criteria:

#### Automated Verification:

- Unit tests for merge helper: empty fills; non-empty preserved; `CUSTOM` upgraded by known carrier (and `customCarrierLabel` cleared); known carrier not downgraded; whitespace-only treated as empty
- Existing sync unit tests still pass where behavior is unchanged (new parcel import, ledger skip, extraction failure)
- `npm run test:api` (or workspace equivalent) passes for sync-related suites after Phase 1 test updates if any overwrite assumptions break
- Lint passes for touched API files: `npm run lint -w @parcel-scrubber/api`

#### Manual Verification:

- Not required in isolation if Phase 2 is implemented in the same session; otherwise verify a second merchant email for an existing parcel no longer overwrites a non-empty description

**Implementation Note**: After completing this phase and automated verification passes, pause for human confirmation before Phase 2 if shipping phases separately.

---

## Phase 2: Open non-merchant processing

### Overview

Remove the merchant-only gate so carrier and other labeled senders are extracted and can create/link parcels when tracking is present.

### Changes Required:

#### 1. Remove sender skip gate

**File**: `apps/api/src/sync/sync.service.ts`

**Intent**: Stop ledger-skipping solely because `detectStoreFromSender` returns null. Flow becomes: get message → bad date skip → extract → no tracking skip → upsert/link.

**Contract**: `detectStoreFromSender` remains used inside `ExtractionService` for `store`. Sync should not import it solely for gating (remove unused import if applicable). Keep date / `ExtractionError` / no-tracking ledger paths.

#### 2. No ExtractionService / schema / UI changes

**File**: n/a

**Intent**: Rely on existing null-store extraction and nullable `Parcel.store`. Extraction prompt may stay merchant-framed; do not retune it in this slice — if carrier QA shows weak carrier/label quality, note for a follow-up.

**Contract**: Unchanged public APIs; Sync job counters semantics unchanged (`imported` / `skipped` / `failed`).

### Success Criteria:

#### Automated Verification:

- Unit: non-merchant sender with tracking creates parcel with `store: null` and calls extraction
- Unit: non-merchant sender without tracking → ledger + skip (extraction may run; no parcel)
- Lint + sync unit suite green

#### Manual Verification:

- With a test Gmail labeled InPost (or similar) shipment mail: Sync creates or links a parcel; store may be blank/`—` until merchant mail
- With merchant mail sharing that tracking later: store/description fill in without duplicating the parcel

**Implementation Note**: Pause for manual confirmation after automated checks before Phase 3 if desired; Phase 3 can land in the same PR.

---

## Phase 3: Tests and verification

### Overview

Replace obsolete “unknown sender → skip without extraction” expectations and add coverage for FEATURES_TO_COME scenarios A/B/C plus no-clobber and no-tracking ledger.

### Changes Required:

#### 1. Sync unit tests

**File**: `apps/api/src/sync/sync.service.spec.ts`

**Intent**: Rewrite `ledgers unknown sender without creating a parcel` into carrier/non-merchant create and enrich cases; add fill-null / no-clobber / no-tracking cases.

**Contract**: Cover at least:

- Non-merchant + tracking → create (`store` null), extraction called, `imported` incremented
- Existing parcel + later extraction with store/description → fills only empty fields; preserves non-empty
- Non-merchant + no tracking → ledger, no parcel, `skipped`
- Non-merchant + tracking but `ExtractionError` (e.g. `CUSTOM` without label) → ledger, no parcel, `failed` (not `skipped`)
- Archived match still does not change status; metadata fill-null only; `imported` stays 0

#### 2. Sync e2e tests

**File**: `apps/api/test/sync.e2e-spec.ts`

**Intent**: Same behavioral flip at HTTP/job level for unknown sender; add enrich path if fixtures allow.

**Contract**: Replace unknown-sender skip assertion; keep ledger-on-skip for no-tracking / already-processed ids.

#### 3. Merge helper unit tests

**File**: colocated `*.spec.ts` next to the helper (if extracted)

**Intent**: Lock carrier/`CUSTOM` and string-empty rules.

**Contract**: Fast pure tests; no DB.

### Success Criteria:

#### Automated Verification:

- `npm run test:api` passes
- `npm run lint -w @parcel-scrubber/api` passes
- No remaining assertions that unknown sender skips without calling extraction (unless no tracking)
- Unit coverage distinguishes no-tracking → `skipped` vs `ExtractionError` → `failed`

#### Manual Verification:

- End-to-end Sync against real or fixture mailbox covering: (A) carrier links to existing store parcel by tracking; (B) carrier creates new parcel; (C) merchant after carrier fills store/description
- Confirm a manually edited description is not overwritten on re-sync of another message for the same tracking
- Confirm tracking link appears in the active list after carrier is enriched from `CUSTOM` to a known carrier (no manual URL)

**Implementation Note**: After Phase 3 automated verification, human confirms the three FEATURES_TO_COME scenarios before calling the change done.

---

## Testing Strategy

### Unit Tests:

- Merge helper emptiness and carrier upgrade/downgrade rules
- SyncService: carrier create, enrich fill, no-clobber, no-tracking skip, ExtractionError → failed, archived status preserved

### Integration Tests:

- `sync.e2e-spec.ts`: non-merchant import; enrich; ledger behavior

### Manual Testing Steps:

1. Label a carrier shipment email; Sync → new parcel, store empty, tracking present
2. Label matching Allegro/AliExpress order email with same tracking; Sync → one parcel, store/description filled
3. Edit description manually; Sync another message for same tracking → description unchanged
4. Confirm list tracking link after carrier enrichment
5. Optional: open edit on a carrier-created null-store parcel — form still requires store before save (expected; UI out of scope)

## Performance Considerations

All labeled messages now hit OpenRouter once (then ledger). Cost is bounded by label + scan period (user-controlled). Sequential extraction remains; no concurrency change.

## Migration Notes

No Prisma migration. Existing parcels and ledger rows are fine. Re-sync will not reprocess ledgered unknown-sender ids that were skipped under the old gate — those Gmail ids stay skipped forever unless ledger rows are deleted. Call this out: users who labeled carrier mail **before** this change may need a one-time ledger cleanup for those message ids, or to remove/re-add the Gmail label and clear corresponding `GmailMessage` rows. Prefer documenting this over auto-deleting ledger data. The same forever-ledger applies to post-change `ExtractionError` / `failed` rows (e.g. tracking + `CUSTOM` without label) — cleanup is the only retry path; validation is intentionally unchanged.

## References

- PRD: US-06, FR-018, business rule 4 — `context/foundation/prd.md`
- Roadmap S-06: `context/foundation/roadmap.md`
- Source note: `FEATURES_TO_COME.md` item 3
- Prior sync plan: `context/archive/2026-06-14-gmail-sync-active-parcels/`
- Code: `apps/api/src/sync/sync.service.ts`, `apps/api/src/extraction/extraction.service.ts`, `apps/api/src/parcels/resolve-tracking-url.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fill-null sync merge

#### Automated

- [ ] 1.1 Unit tests for merge helper: empty fills; non-empty preserved; CUSTOM upgraded (label cleared); known carrier not downgraded; whitespace-only empty
- [ ] 1.2 Sync unit tests still pass where behavior is unchanged
- [ ] 1.3 `npm run test:api` passes for sync-related suites after Phase 1 updates
- [ ] 1.4 Lint passes for touched API files: `npm run lint -w @parcel-scrubber/api`

#### Manual

- [ ] 1.5 Second merchant email for an existing parcel no longer overwrites a non-empty description (if Phase 1 shipped alone)

### Phase 2: Open non-merchant processing

#### Automated

- [ ] 2.1 Unit: non-merchant sender with tracking creates parcel with store null and calls extraction
- [ ] 2.2 Unit: non-merchant sender without tracking → ledger + skip
- [ ] 2.3 Lint + sync unit suite green

#### Manual

- [ ] 2.4 Labeled carrier mail: Sync creates or links parcel; store blank until merchant mail
- [ ] 2.5 Later merchant mail same tracking: fields fill without duplicate parcel

### Phase 3: Tests and verification

#### Automated

- [ ] 3.1 `npm run test:api` passes
- [ ] 3.2 `npm run lint -w @parcel-scrubber/api` passes
- [ ] 3.3 No remaining assertions that unknown sender skips without extraction (unless no tracking)
- [ ] 3.4 Unit: ExtractionError (e.g. CUSTOM without label with tracking) → ledger + failed, not skipped

#### Manual

- [ ] 3.5 FEATURES_TO_COME A/B/C verified end-to-end
- [ ] 3.6 Manually edited description not overwritten on re-sync
- [ ] 3.7 Tracking link appears after carrier enrichment from CUSTOM
