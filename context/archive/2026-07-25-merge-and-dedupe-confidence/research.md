---
date: 2026-07-25T11:34:03+02:00
researcher: GPT-5.6 Sol
git_commit: 6e8f72258048cf5340c2cf14517c37b752c0c304
branch: main
repository: parcel-scrubber
topic: "Merge and dedupe confidence: side effects and sync enrichment non-overwrite"
tags: [research, codebase, parcels, merge, dedupe, sync]
status: complete
last_updated: 2026-07-25
last_updated_by: GPT-5.6 Sol
---

# Research: Merge and dedupe confidence

**Date**: 2026-07-25T11:34:03+02:00
**Researcher**: GPT-5.6 Sol
**Git Commit**: 6e8f72258048cf5340c2cf14517c37b752c0c304
**Branch**: main
**Repository**: parcel-scrubber

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`: determine where and how to prove that merge/dedupe preserves the correct parcel and linked emails without duplicate rows, and that Gmail sync enrichment fills only empty fields without overwriting non-empty stored values.

## Summary

Phase 2 has two distinct production paths:

1. Manual merge is an API transaction. The server chooses the oldest parcel as survivor, attaches every missing Gmail-message link to it, recomputes order date, and deletes the losers. Field values are not automatically resolved by PRD precedence; the server validates and applies the fields explicitly chosen by the user in the merge dialog.
2. Sync dedupe normalizes the extracted tracking number and looks up an existing parcel for the same user. Its pure merge helper preserves non-empty stored metadata, fills null/blank values, upgrades `CUSTOM` to a known carrier, and never downgrades a known carrier.

The most important missing real-database proof is a sync with two distinct Gmail messages carrying the same normalized tracking number: it should leave one parcel, two `ParcelEmail` links, both Gmail ledger rows, and the oldest linked-message date. Merge already has broad HTTP e2e coverage, but it lacks focused proof for three-or-more parcels, overlapping email links, retained Gmail rows after loser deletion, and exact join-table state.

There is one product-contract discrepancy to resolve during planning. [US-05 says automatic known-store and survivor-user-edit precedence](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/context/foundation/prd.md#L112-L126), while the shipped merge design intentionally makes conflict resolution user-controlled. Tests should preserve the current explicit-choice contract unless the product decision is changed; sync enrichment precedence is separate and already implemented.

## Detailed Findings

### Manual merge rules and side effects

- `POST /api/parcels/merge` delegates to `mergeForUser` ([controller](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/parcels/parcels.controller.ts#L62-L70)).
- Selection is scoped by `userId`; a missing or foreign parcel makes the loaded count differ and returns 404 ([service](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/parcels/parcels.service.ts#L242-L288)).
- The survivor is the oldest `createdAt`, with ascending ID as deterministic tie-break ([helper](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/parcels/merge-parcels.ts#L13-L26)).
- Active and archived parcels cannot be mixed. For an all-archived merge, `DELIVERED` wins over `REMOVED`; an active merge leaves the survivor status unchanged ([helper](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/parcels/merge-parcels.ts#L29-L45)).
- The transaction rejects a chosen tracking number that belongs to a parcel outside the selection, updates the survivor, creates only missing message links, calculates order date from the oldest linked Gmail message (falling back to the earliest selected parcel date), then deletes loser rows ([service](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/parcels/parcels.service.ts#L301-L400)).
- Loser `ParcelEmail` rows disappear through cascade deletion, while `GmailMessage` rows remain independent ([schema](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/prisma/schema.prisma#L93-L120)).

The current merge unit and e2e suites prove survivor selection, ordinary reparenting, loser deletion, tracking collision, ownership denial, archive preference, and mixed-status rejection. The remaining confidence gap is not another two-parcel happy path; it is exact relational state under overlapping and larger selections.

Recommended independent assertions:

- Seed explicit fixture dates and assert the known oldest fixture ID; do not import `selectSurvivor` into the e2e expectation.
- Assert survivor/loser IDs and literal row counts in `Parcel`, `ParcelEmail`, and `GmailMessage`.
- Seed message dates and assert the literal earliest expected ISO date; do not reuse production order-date helpers.
- Include three parcels and an email already shared with the survivor to prove no missing or duplicate link.

### Tracking-number dedupe during sync

- Extraction output is normalized by trimming, removing whitespace, and uppercasing before lookup ([normalizer](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/parcels/normalize-tracking-number.ts#L1-L9)).
- Sync looks up by `(userId, normalizedTrackingNumber)` and then creates or enriches inside the same orchestration path ([sync service](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/sync/sync.service.ts#L130-L176)).
- PostgreSQL independently enforces uniqueness for non-null `(user_id, tracking_number)` values ([migration](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/prisma/migrations/20260606130352_add_parcel_models/migration.sql#L55-L59)).
- Parcel creation/update, Gmail ledger insertion, `ParcelEmail` insertion, and order-date recomputation occur in one Prisma transaction ([sync service](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/sync/sync.service.ts#L176-L246)).

The unit suites exercise normalization and orchestration, but the real-database sync suite does not currently run two different Gmail IDs with the same tracking number and assert one parcel plus two links. That is the cheapest strong integration scenario for the dedupe failure in Risk #3. A normalization variant (for example spaced/lowercase first, compact/uppercase second) would prove that the lookup boundary, not only the pure helper, uses canonical identity.

### Enrichment non-overwrite

The pure merge contract is concentrated in `mergeParcelFieldsFromExtraction` ([implementation](https://github.com/murbanczyk-fp/parcel-scrubber/blob/6e8f72258048cf5340c2cf14517c37b752c0c304/apps/api/src/sync/merge-parcel-fields-from-extraction.ts#L14-L100)):

- Existing non-blank `store` and `description` win.
- Null, empty, and whitespace-only stored strings may be filled.
- Existing `CUSTOM` carrier may upgrade to a known incoming carrier.
- A known existing carrier never downgrades to `CUSTOM`.
- `customCarrierLabel` is retained/filled only while the resulting carrier is `CUSTOM`; it is cleared for known carriers.
- `parcelFieldsChanged` determines whether an existing active parcel contributes to the imported count.

This is value-based preservation. The schema has parcel-level `source`, but no field-level provenance indicating whether a value came from a user or a prior sync. Therefore “does not overwrite values the user set manually” is implemented as “does not overwrite any non-empty stored value.”

The existing pure-helper suite already covers the principal null/empty and carrier matrix. Existing mocked service tests cover empty-field enrichment, non-clobbering, and archived metadata updates. Existing sync e2e covers archived preservation and carrier-first/store-later enrichment. Focused additions should be:

- a real-database user edit (preferably through PATCH) followed by sync, asserting user literals remain and empty fields fill;
- the two-message same-tracking scenario, combining dedupe, link retention, and enrichment;
- direct table-driven coverage for `parcelFieldsChanged`, which currently lacks its own test;
- an explicit decision/test for user-selected `CUSTOM` plus a label receiving a known carrier, because current code upgrades and clears the label.

Sync does not update `trackingNumber`, tracking URL override, status, or source on an existing row. It always recomputes `orderDate` from linked message dates, which is required by the separate order-date rule and is not an enrichment overwrite defect.

### Test-layer recommendation

Use a small layered set:

1. Pure unit tests for survivor/archive helper rules and enrichment field matrices.
2. Service tests only where they efficiently prove error gates or transaction orchestration.
3. Real-Postgres integration/e2e for relational side effects: one survivor, loser deletion, exact email links, Gmail ledger retention, normalized tracking dedupe, and persisted non-overwrite.

Avoid exact mocked Prisma call-shape tests as the primary proof. They are useful wiring checks but cannot prove foreign keys, cascades, unique indexes, or final row state.

## Code References

- `apps/api/src/parcels/parcels.service.ts:242-407` — manual merge validation and transaction.
- `apps/api/src/parcels/merge-parcels.ts:13-70` — survivor, archive status, order-date fallback, and ID dedupe helpers.
- `apps/api/src/sync/sync.service.ts:91-264` — message processing, tracking lookup, transactional upsert/linking.
- `apps/api/src/sync/merge-parcel-fields-from-extraction.ts:14-100` — null/empty and carrier enrichment rules.
- `apps/api/prisma/schema.prisma:93-120` — Gmail message and parcel-email relationships.
- `apps/api/test/parcels.e2e-spec.ts:736-986` — existing merge HTTP coverage.
- `apps/api/test/sync.e2e-spec.ts:119-277` — existing real-database sync coverage.
- `apps/api/src/sync/merge-parcel-fields-from-extraction.spec.ts:18-192` — existing pure enrichment matrix.
- `apps/api/src/sync/sync.service.spec.ts:216-405` — existing mocked enrichment orchestration.

## Architecture Insights

- Manual merge and automatic sync dedupe share a business goal but intentionally use different conflict mechanisms: user-selected merge fields versus automatic fill-empty enrichment.
- Tracking uniqueness is defense in depth: application normalization and lookup establish semantic identity, while a partial database unique index protects storage integrity.
- Email provenance is modeled explicitly through `GmailMessage` and `ParcelEmail`, so confidence requires assertions on relations, not only the returned parcel DTO.
- Both merge and sync recalculate order date from linked messages, making linked-email correctness part of the order-date contract.
- “User-set” is not represented at field level. Future requirements that distinguish user edits from previous imports would need provenance data, not just more tests.

## Historical Context (from prior changes)

- `context/archive/2026-07-20-merge-parcels/plan.md` records the decision to resolve merge conflicts explicitly in the UI and send final fields to the API, rather than apply automatic store precedence.
- `context/archive/2026-07-19-carrier-email-parcel-linking/plan.md` introduced carrier-first parcel creation, later merchant enrichment, and preservation of tracking URL overrides.
- `context/archive/2026-06-14-gmail-sync-active-parcels/plan.md` contains the earlier merchant-focused sync scope; its sender-gating assumptions are superseded by carrier-email linking.
- `context/foundation/prd.md:120-126` still describes automatic field precedence for manual merge and should be reconciled with the shipped explicit-choice contract.

## Related Research

- `context/archive/2026-07-20-merge-parcels/research.md`
- `context/archive/2026-07-19-carrier-email-parcel-linking/research.md`
- `context/archive/2026-06-14-gmail-sync-active-parcels/research.md`

## Open Questions

1. Should Phase 2 lock the shipped explicit user-choice merge contract, or should production change to implement the PRD’s automatic known-store/survivor precedence?
2. Is a user-selected `CUSTOM` carrier with a non-empty label considered protected from later automatic upgrade to a known carrier? Current behavior says no.
3. Should Phase 2 add transaction-failure injection tests, or is final-state real-database coverage sufficient for this local MVP?
