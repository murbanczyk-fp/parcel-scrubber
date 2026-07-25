# Merge and Dedupe Confidence Tests — Plan Brief

> Full plan: `context/changes/merge-and-dedupe-confidence/plan.md`  
> Research: `context/changes/merge-and-dedupe-confidence/research.md`

## What & Why

Complete Phase 2 of the test rollout by locking the relational side effects of manual merge and normalized tracking-number dedupe, plus sync's promise to fill empty metadata without overwriting non-empty stored values. Production behavior already exists; this change adds focused regression evidence at the cheapest strong layers.

## Starting Point

Manual merge and sync enrichment are transactional and already have broad happy-path coverage. The gaps are exact database state for larger merges with overlapping email links, two different Gmail messages deduping to one parcel, persisted user values surviving later sync, and direct coverage of the enrichment change detector.

## Desired End State

Focused unit and real-Postgres tests fail if merge loses or duplicates email links, leaves loser parcels, deletes Gmail ledger rows, selects the wrong survivor, or computes the wrong order date. Sync tests fail if equivalent tracking strings create duplicate parcels or if enrichment clobbers non-empty user values, while the test-plan cookbook makes these patterns reusable.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Manual merge conflicts | Lock explicit client-selected fields | Matches shipped behavior and the archived merge decision; automatic PRD precedence is separate product work | Research + Plan |
| CUSTOM carrier enrichment | Lock current upgrade-and-clear behavior | A known extracted carrier replaces `CUSTOM` and clears its label today | Research + Plan |
| Scenario scope | Focused gap set | Covers 3+ parcel relations, same-tracking sync, user-edit non-overwrite, and `parcelFieldsChanged` without low-value failure injection | Plan |
| Test layers | Pure units plus existing real-Postgres suites | Proves field rules and actual constraints/cascades without live Gmail or browser e2e | Research |
| Oracles | Literal fixture IDs, dates, values, and row counts | Avoids tests mirroring survivor, normalization, or enrichment helpers | Research |
| User-edit setup | Use `ParcelsService.updateForUser` in the sync harness | Exercises the production method behind PATCH without duplicating HTTP/auth bootstrap already covered elsewhere | Plan |
| Documentation | Add Phase 2 cookbook recipes | Preserves the high-signal patterns and anti-patterns for later contributors | Plan |

## Scope

**In scope:**

- Three-or-more parcel HTTP merge with overlapping Gmail links and exact final table state.
- Client-selected merge fields, oldest-created survivor, and oldest-linked-message order date.
- Two Gmail messages with equivalent normalized tracking producing one parcel and two links.
- User-edit-then-sync preservation of non-empty values plus empty-field enrichment.
- Direct table-driven `parcelFieldsChanged` coverage.
- Existing `CUSTOM`-to-known carrier upgrade as an intentional contract.
- Phase 2 cookbook guidance and full API/repository quality gates.

**Out of scope:**

- Production behavior, schema, migrations, or field-level edit provenance.
- Automatic PRD precedence for manual merge.
- Protecting intentional `CUSTOM` from known-carrier enrichment.
- Transaction-failure injection, exhaustive carrier e2e, web/browser tests, and live Gmail/OpenRouter.
- Carrier tracking-link templates reserved for Phase 3 / Risk #5.

## Architecture / Approach

Extend `parcels.e2e-spec.ts` for the merge relational stress case, `sync.e2e-spec.ts` for normalized dedupe and user-edit enrichment, and the existing enrichment spec for `parcelFieldsChanged`. All integration assertions inspect real Postgres state; Gmail and extraction remain mocked only in the sync harness.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Merge relational confidence | 3+ parcel merge with overlapping links and exact final state | Email loss/duplication or loser survival |
| 2. Sync dedupe and enrichment | Same-tracking dedupe, user-edit preservation, helper units | Duplicate parcels or metadata clobbering |
| 3. Cookbook and verification | Reusable recipes and complete quality gates | Tests land but future work repeats weak patterns |

**Prerequisites:** Reachable disposable Postgres database named with `_test`, via `E2E_DATABASE_URL` or the local default.  
**Estimated effort:** One implementation session across three focused phases.

## Open Risks & Assumptions

- The shipped explicit-choice merge contract remains authoritative for this test rollout despite stale automatic-precedence wording in US-05.
- Any non-empty stored enrichment value is treated as protected because field-level user-edit provenance does not exist.
- Existing HTTP tests remain sufficient for PATCH transport; the sync integration uses the same underlying update service.
- The existing serial e2e database lifecycle and mocked Gmail/extraction providers remain stable.

## Success Criteria

- A larger overlapping-link merge proves one oldest survivor, all unique links, retained Gmail rows, deleted losers, and the literal oldest linked date.
- Equivalent tracking strings across two messages produce one parcel, two ledger rows, and two links.
- Later sync preserves non-empty user-edited values while filling an empty field.
- Focused and full API e2e, API/root lint, and unit suites pass; the Phase 2 cookbook records the shipped patterns.
