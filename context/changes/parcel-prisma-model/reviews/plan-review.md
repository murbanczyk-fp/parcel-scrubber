<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Parcel Prisma Model Implementation Plan

- **Plan**: context/changes/parcel-prisma-model/plan.md
- **Mode**: Deep
- **Date**: 2026-06-06
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 5/5 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — Self-hosted CI Postgres service containers unverified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 3 — CI workflow
- **Detail**: Plan adds `services: postgres:` to lint-and-test.yml, but the api job runs on a self-hosted runner commonly deployed as a Docker container. Service containers require Linux + Docker on the runner; documented for deploy but never validated for CI.
- **Fix A ⭐ Recommended**: Extend Phase 3 CI contract with explicit Postgres service env and fallback note for runner-in-Docker setups.
- **Decision**: FIXED via Fix A

### F2 — Test database provisioning underspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Integration e2e spec; Critical Implementation Details
- **Detail**: Plan specifies `parcel_scrubber_test` but docker-compose defaults to `parcel_scrubber`; `.env.example` has no test DB.
- **Fix**: Add local test DB provisioning note to Critical Implementation Details and Phase 3 README contract.
- **Decision**: FIXED

### F3 — Phase 1 Parcel schema contract is implicit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Prisma schema
- **Detail**: Phase 1 deferred field list to research; bullets omitted `store`, `description`, `customCarrierLabel`, and `onDelete: Cascade` on Parcel.userId.
- **Fix**: Replace implicit pointer with explicit Parcel field list in Phase 1 contract.
- **Decision**: FIXED

### F4 — Carrier URL templates undefined in PRD

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Carrier URL templates
- **Detail**: FR-014 requires generated URLs but PRD specifies no concrete patterns.
- **Fix**: Document v1 URL patterns inline in `carrier-url-templates.ts` with reference tracking numbers.
- **Decision**: FIXED

### F5 — resolveTrackingUrl normalization contract unclear

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — resolve-tracking-url.ts
- **Detail**: Plan defines `normalizeTrackingNumber` separately but did not state whether `resolveTrackingUrl` calls it internally.
- **Fix**: Add internal normalization to `resolveTrackingUrl` contract.
- **Decision**: FIXED
