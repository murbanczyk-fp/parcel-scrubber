# Merge and Dedupe Confidence Test Implementation Plan

## Overview

Complete Phase 2 of the phased test rollout by adding focused regression coverage for manual-merge relational side effects, normalized tracking-number dedupe, and sync enrichment non-overwrite. The implementation extends existing API unit and real-Postgres e2e suites and documents the resulting test patterns; it does not change production behavior.

## Current State Analysis

Manual merge already runs as a user-scoped Prisma transaction. It chooses the oldest parcel as survivor, applies fields explicitly selected by the client, links missing Gmail messages to the survivor, recomputes the order date, and deletes loser parcels. Existing tests cover a two-parcel merge, collision rejection, ownership, archive precedence, and active/archive mixing, but they do not prove the exact join-table state for three or more parcels with overlapping links.

Sync already normalizes extracted tracking numbers, finds a same-user parcel, preserves non-empty metadata, fills empty metadata, links the Gmail message, and recomputes order date in one transaction. Existing unit tests cover the field-merge matrix, and existing e2e tests cover one-message import and carrier-first enrichment. They do not prove that two distinct Gmail messages with equivalent normalized tracking values produce one parcel and two links, or that values established through the user-edit path survive later enrichment.

The PRD's automatic merge-precedence wording conflicts with the shipped merge design. This plan follows the approved decision to lock the shipped contract: manual merge fields are explicitly chosen by the client, while automatic null/empty precedence belongs only to sync enrichment.

## Desired End State

The API test suite fails if:

- a three-or-more parcel merge keeps the wrong survivor, loses a distinct Gmail link, leaves a duplicate link or loser row, deletes a Gmail ledger row, ignores client-selected fields, or computes the wrong oldest-message order date;
- two different Gmail messages with equivalent normalized tracking numbers create more than one parcel or fail to retain both ledger/link records;
- later sync enrichment overwrites a non-empty user-edited value or fails to fill an empty field;
- `parcelFieldsChanged` reports the wrong import-change state;
- a `CUSTOM` carrier with a label no longer upgrades to a known extracted carrier and clears the label.

`context/foundation/test-plan.md` then records reusable Phase 2 recipes for relational assertions, independent oracles, focused commands, and deliberate exclusions.

### Key Discoveries

- The merge HTTP suite already provides authenticated agents and a `linkMessage` fixture (`apps/api/test/parcels.e2e-spec.ts:47-137,736-985`).
- Merge writes and deletes occur in one transaction, and loser `ParcelEmail` rows cascade while `GmailMessage` rows remain independent (`apps/api/src/parcels/parcels.service.ts:301-400`; `apps/api/prisma/schema.prisma:93-120`).
- Sync e2e uses real Postgres with mocked Gmail and extraction providers, so it can exercise dedupe and enrichment without live Gmail or OpenRouter (`apps/api/test/sync.e2e-spec.ts:39-117`).
- `mergeParcelFieldsFromExtraction` already locks the approved `CUSTOM`-to-known upgrade; only `parcelFieldsChanged` lacks direct unit coverage (`apps/api/src/sync/merge-parcel-fields-from-extraction.spec.ts:18-192`).
- API unit Jest and API e2e Jest are separate runners; e2e suites must use `npm run test:e2e -w @parcel-scrubber/api` (`apps/api/package.json:19-24`; `apps/api/test/jest-e2e.json:1-11`).

## What We're NOT Doing

- Changing merge, dedupe, enrichment, normalization, or transaction production code.
- Implementing the PRD's automatic known-store/manual-edit precedence for manual merge.
- Adding field-level edit provenance or changing the Prisma schema/migrations.
- Protecting an intentional `CUSTOM` carrier from a later known-carrier upgrade; current upgrade-and-clear behavior is the locked contract.
- Adding transaction-failure injection, exhaustive carrier-matrix e2e, browser tests, or live Gmail/OpenRouter tests.
- Duplicating existing two-parcel merge, collision, ownership, archive-status, or one-message import scenarios.
- Adding carrier tracking-link template contracts; those remain Phase 3 / Risk #5.

## Implementation Approach

Add one high-signal merge scenario to the existing parcel HTTP e2e suite and two high-signal sync scenarios to the existing real-Postgres sync suite. Use fixture IDs, literal dates, and direct database counts as independent oracles rather than production survivor, normalization, or field-merge helpers. Add a compact table-driven unit block for `parcelFieldsChanged`; retain the existing `CUSTOM` carrier upgrade test as the explicit contract rather than duplicating it.

For the user-edit scenario, establish edited values through `ParcelsService.updateForUser`, the production service method used by PATCH, inside the sync integration harness. The parcel HTTP suite already covers PATCH transport and persistence; rehosting the full HTTP/auth stack in `sync.e2e-spec.ts` would add setup without strengthening the sync non-overwrite signal.

After all tests pass, update the test-plan cookbook with the exact fixture and assertion patterns that shipped.

## Critical Implementation Details

An overlapping Gmail message must be created once in `GmailMessage` and linked to multiple selected parcels through separate `ParcelEmail` rows; the existing `linkMessage` helper currently creates both records and therefore cannot be called twice for the same Gmail ID unchanged. The merge test must inspect post-transaction tables before cleanup and distinguish retained Gmail ledger rows from deduplicated survivor links.

## Phase 1: Prove Manual-Merge Relational Side Effects

### Overview

Add one real-Postgres HTTP scenario that stresses the merge transaction with three parcels, non-input-order survivor selection, overlapping message links, and client-selected field values.

### Changes Required

#### 1. Multi-parcel merge relational scenario

**File**: `apps/api/test/parcels.e2e-spec.ts`

**Intent**: Extend the merge describe block with a scenario whose final database state proves survivor selection, link deduplication/reparenting, ledger retention, loser deletion, order-date recomputation, and explicit client field choice together.

**Contract**:

- Seed three same-user active parcels with distinct tracking numbers and explicit `createdAt` values; send IDs in an order that does not reveal the oldest survivor.
- Seed distinct Gmail ledger rows with fixed `internalDate` values, including one Gmail message linked to both the survivor and a loser before merge.
- Submit merge fields containing at least one literal value different from every source parcel, proving that the current API applies the client's explicit choice rather than automatic precedence.
- Assert the response and persisted survivor ID equal the fixture with the earliest `createdAt`.
- Assert the persisted order date equals the literal oldest linked-message date.
- Assert exactly one parcel remains for the user and every loser ID is absent.
- Assert survivor `ParcelEmail` rows contain each unique Gmail ID exactly once.
- Assert loser `ParcelEmail` rows are gone while all seeded `GmailMessage` rows remain.
- Do not import or reproduce `selectSurvivor`, `orderDateFallback`, or production set-difference logic in the expected-value calculation.

### Success Criteria

#### Automated Verification

- Focused parcel e2e suite passes: `npm run test:e2e -w @parcel-scrubber/api -- parcels.e2e-spec`
- The new scenario proves exact `Parcel`, `ParcelEmail`, and `GmailMessage` final state with literal fixture expectations.
- Existing merge e2e scenarios continue to pass unchanged.

#### Manual Verification

- Review the scenario and confirm its expected survivor, order date, and unique Gmail IDs are readable directly from fixtures without consulting production helper logic.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the independent-oracle review succeeded before proceeding.

---

## Phase 2: Prove Sync Dedupe and Enrichment Non-Overwrite

### Overview

Add real-database sync scenarios for canonical tracking identity and post-edit enrichment, then directly test the change-detection helper used by the imported counter.

### Changes Required

#### 1. Same-tracking multi-message dedupe scenario

**File**: `apps/api/test/sync.e2e-spec.ts`

**Intent**: Prove that two distinct Gmail messages whose extracted tracking strings normalize to the same identity enrich and link one parcel instead of creating duplicates.

**Contract**:

- Return two distinct Gmail IDs in one job and provide sequential mocked messages with fixed, different internal dates.
- Return tracking strings that differ in whitespace/case but represent the same canonical tracking number.
- Make the first extraction carrier-oriented and the second merchant-oriented so the existing parcel also receives missing metadata.
- Assert one parcel exists with the expected canonical tracking number, preserved first non-empty values, and filled previously empty values.
- Assert exactly two user Gmail ledger rows and exactly two survivor `ParcelEmail` rows, each containing the expected literal Gmail IDs.
- Assert the parcel order date equals the literal earlier message date.
- Do not call `normalizeTrackingNumber` or `mergeParcelFieldsFromExtraction` to compute expected values.

#### 2. User-edit-then-sync non-overwrite scenario

**File**: `apps/api/test/sync.e2e-spec.ts`

**Intent**: Prove through persisted state that later sync fills empty metadata without overwriting values established through the production user-edit service path.

**Contract**:

- Make `ParcelsService` available in the existing integration module and use `updateForUser` to establish non-empty user values before processing a new Gmail message with conflicting extraction values.
- Leave at least one enrichable field empty so the test proves both preservation and fill behavior, not merely a no-op update.
- Assert user-selected non-empty values remain literal, the empty field is filled, parcel count remains one, and the new message is linked.
- Assert fields outside sync enrichment—status, source, tracking URL override, and tracking identity—remain unchanged where represented by the fixture.
- Keep HTTP PATCH transport out of this suite; its contract remains covered by `parcels.e2e-spec.ts`.

#### 3. Change-detection unit matrix

**File**: `apps/api/src/sync/merge-parcel-fields-from-extraction.spec.ts`

**Intent**: Add direct table-driven coverage for `parcelFieldsChanged`, which controls whether enrichment increments the imported count.

**Contract**:

- Import `parcelFieldsChanged`.
- Cover identical field data returning false.
- Cover a change in each tracked field—store, description, carrier, and custom carrier label—returning true.
- Keep the existing `CUSTOM` carrier plus non-empty label upgrade test as the locked approved behavior: known carrier wins and the label clears.

### Success Criteria

#### Automated Verification

- Focused enrichment unit suite passes: `npm run test -w @parcel-scrubber/api -- merge-parcel-fields-from-extraction.spec`
- Focused sync e2e suite passes: `npm run test:e2e -w @parcel-scrubber/api -- sync.e2e-spec`
- Same-tracking sync leaves one parcel, two Gmail rows, two parcel-email links, and the literal oldest message date.
- User-edit-then-sync preserves non-empty user values while filling an empty field.
- Existing sync and enrichment tests continue to pass.

#### Manual Verification

- Review both integration scenarios and confirm their expected normalized identity and preserved/filled values are literal test data, not outputs from production helpers.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the sync assertions remain independent before proceeding.

---

## Phase 3: Document Phase 2 Patterns and Run Quality Gates

### Overview

Turn the shipped tests into reusable cookbook guidance and verify the complete API and repository test gates.

### Changes Required

#### 1. Merge and sync cookbook recipes

**File**: `context/foundation/test-plan.md`

**Intent**: Extend §6 with Phase 2-specific guidance grounded in the final test cases so future work uses real relational state and independent expectations.

**Contract**:

- Document the three-or-more merge fixture, overlapping-link setup, and separate assertions for survivor parcel, unique survivor links, retained Gmail ledger rows, deleted losers, and oldest-message date.
- Document the two-message normalized-tracking sync fixture and the user-edit-then-sync preservation/fill pattern.
- Record `parcelFieldsChanged` as a pure unit seam and the current `CUSTOM`-to-known carrier upgrade as an intentional contract.
- Warn against importing survivor, normalization, or enrichment helpers into e2e expectations and against relying only on exact mocked Prisma call shapes.
- Record focused parcel/sync e2e and unit commands plus the test-database `_test` prerequisite.
- Update the Phase 2 cookbook note and top-level last-updated annotation without changing Phase 3 scope.

### Success Criteria

#### Automated Verification

- Full API e2e suite passes: `npm run test:e2e -w @parcel-scrubber/api`
- API lint passes: `npm run lint:api`
- API unit suite passes: `npm run test:api`
- Root lint passes: `npm run lint`
- Root unit suites pass: `npm run test`
- `git diff --check` reports no whitespace errors.

#### Manual Verification

- Review §6 and confirm each recipe cites a shipped test pattern, states its independent oracle, and preserves the Phase 3 carrier-link deferral.
- Confirm the final diff contains only tests and documentation, with no production, schema, migration, web, or environment-file changes.

**Implementation Note**: After all automated gates pass, pause for final human review of the cookbook and scope before marking the change implemented.

---

## Testing Strategy

### Unit Tests

- Add table-driven `parcelFieldsChanged` cases for equality and each tracked field.
- Retain the existing merge-field matrix, including whitespace-empty semantics, known-carrier preservation, and `CUSTOM`-to-known upgrade with label clearing.
- Do not duplicate survivor/archive helper tests already present in `merge-parcels.spec.ts`.

### Integration Tests

- Extend parcel HTTP e2e with one three-parcel relational stress scenario.
- Extend sync service e2e with one same-normalized-tracking/two-message scenario.
- Extend sync service e2e with one production-user-edit-path then enrichment scenario.
- Use real Postgres for constraints, cascades, join state, and final persisted values; mock only Gmail retrieval and extraction in the existing sync harness.

### Manual Testing Steps

1. Read the merge fixture without production code and identify the expected survivor, oldest message date, and unique Gmail IDs.
2. Read the sync fixtures without production helpers and identify the canonical tracking identity and which metadata must be preserved or filled.
3. Confirm the cookbook describes those same independent oracles and does not claim automatic manual-merge precedence.
4. Inspect the final diff for test/documentation-only scope.

## Performance Considerations

The added scenarios perform only small fixed-size database setups under the existing serial e2e runner. They add no production runtime cost and require no performance optimization. Keep each risk in one focused scenario to avoid unnecessary migration/bootstrap overhead from creating new suites.

## Migration Notes

No schema or data migration is required. The e2e database must remain disposable, reachable through `E2E_DATABASE_URL` or the default local URL, and named with the `_test` suffix.

## References

- Related research: `context/changes/merge-and-dedupe-confidence/research.md`
- Rollout strategy: `context/foundation/test-plan.md:40-68,110-192`
- Merge transaction: `apps/api/src/parcels/parcels.service.ts:242-407`
- Merge helper rules: `apps/api/src/parcels/merge-parcels.ts:13-70`
- Existing merge e2e: `apps/api/test/parcels.e2e-spec.ts:736-985`
- Sync transaction: `apps/api/src/sync/sync.service.ts:91-264`
- Enrichment rules: `apps/api/src/sync/merge-parcel-fields-from-extraction.ts:14-100`
- Existing sync e2e: `apps/api/test/sync.e2e-spec.ts:39-307`
- Existing enrichment units: `apps/api/src/sync/merge-parcel-fields-from-extraction.spec.ts:18-192`
- Historical merge decision: `context/archive/2026-07-20-merge-parcels/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Prove Manual-Merge Relational Side Effects

#### Automated

- [x] 1.1 Focused parcel e2e suite passes — 18d8aa6
- [x] 1.2 Exact merge relational state is proven — 18d8aa6
- [x] 1.3 Existing merge scenarios remain green — 18d8aa6

#### Manual

- [x] 1.4 Independent merge oracle is reviewable from fixtures — 18d8aa6

### Phase 2: Prove Sync Dedupe and Enrichment Non-Overwrite

#### Automated

- [x] 2.1 Focused enrichment unit suite passes
- [x] 2.2 Focused sync e2e suite passes
- [x] 2.3 Same-tracking relational state and oldest date are proven
- [x] 2.4 User-edit non-overwrite and empty-field fill are proven
- [x] 2.5 Existing sync and enrichment tests remain green

#### Manual

- [x] 2.6 Independent sync oracles are reviewable from fixtures

### Phase 3: Document Phase 2 Patterns and Run Quality Gates

#### Automated

- [ ] 3.1 Full API e2e suite passes
- [ ] 3.2 API lint passes
- [ ] 3.3 API unit suite passes
- [ ] 3.4 Root lint passes
- [ ] 3.5 Root unit suites pass
- [ ] 3.6 Diff whitespace check passes

#### Manual

- [ ] 3.7 Phase 2 cookbook is grounded and preserves deferrals
- [ ] 3.8 Final diff remains test-and-documentation only
