<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Delivered/Remove Actions and Archive View

- **Plan**: `context/changes/deliver-remove-archive/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-22
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS ✅ |
| Lean Execution | PASS ✅ |
| Architectural Fitness | PASS ✅ |
| Blind Spots | WARNING ⚠️ |
| Plan Completeness | WARNING ⚠️ |

## Grounding

Grounding: 10/10 paths ✓ (9 existing + 1 planned new), 4/4 symbols ✓ (`isArchivedStatus`, `listForUser`, `ConfirmationService` absent as expected, `ArchivePlaceholderComponent` present), brief↔plan ✓

## Findings

### F1 — POST routes need explicit @HttpCode(200)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — ParcelsController routes
- **Detail**: Plan and Phase 2 e2e expect `200` from `POST .../deliver` and `POST .../remove`, but NestJS defaults `@Post()` handlers to **201 Created**. Existing `SyncController` already uses `@HttpCode` explicitly (`sync.controller.ts:28-29`). Without `@HttpCode(HttpStatus.OK)`, controller specs and e2e asserting `.expect(200)` will fail.
- **Fix**: Add `@HttpCode(HttpStatus.OK)` on both POST handlers in Phase 1 controller contract; mention in controller spec expectations.
- **Decision**: FIXED — added `@HttpCode(HttpStatus.OK)` to Phase 1 controller contract

### F2 — Phase 2 e2e auth is a greenfield pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — parcels HTTP e2e
- **Detail**: Plan says "Follow sync.e2e-spec.ts / parcel-schema.e2e-spec.ts setup," but neither spec exercises authenticated HTTP. `app.e2e-spec.ts` has HTTP + cookieParser + global prefix but mocks Prisma (breaks `verifySession` DB lookup). `sync.e2e-spec.ts` uses real Postgres but calls `SyncService` directly — no HTTP, no JWT cookie. Phase 2 is the repo's first authenticated HTTP e2e; implementer must compose: full `AppModule` + real `PrismaService` + `cookieParser()` + `setGlobalPrefix('api')` + `AuthService.signSession` + `.set('Cookie', 'session=<token>')`.
- **Fix A ⭐ Recommended**: Add an explicit "E2e bootstrap checklist" subsection to Phase 2 listing the 7 setup steps above and a `createAuthenticatedAgent(app, user)` helper signature.
  - Strength: Removes guesswork; documents reusable pattern for future slices.
  - Tradeoff: ~10 lines added to plan.
  - Confidence: HIGH — verified against `jwt.strategy.ts`, `app.e2e-spec.ts`, `sync.e2e-spec.ts`.
  - Blind spot: None significant.
- **Fix B**: Extract shared `test/authenticated-app.ts` helper in Phase 2 implementation (not in plan) and keep plan reference minimal.
  - Strength: Code is the documentation; DRY for future e2e.
  - Tradeoff: Plan stays vague; implementer may duplicate setup inline first time.
  - Confidence: MEDIUM — helper is good practice but plan won't guide it.
  - Blind spot: Helper API shape not decided upfront.
- **Decision**: FIXED via Fix A — added E2e bootstrap checklist to Phase 2

### F3 — E2e parcel seed omits required fields

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — e2e scenarios
- **Detail**: Scenario 1 says "Create active parcel" but Prisma schema requires `orderDate` (`schema.prisma:80`). Plan doesn't reference the seed shape. Follow `sync.e2e-spec.ts:177-186` pattern or tests fail on create.
- **Fix**: Add one line to Phase 2 contract: seed parcels with at minimum `userId`, `orderDate`, and optional `trackingNumber`/`status` (default `NEW`).
- **Decision**: FIXED — covered by F2 bootstrap checklist seed line

### F4 — FR-007 re-sync not covered by automated S-03 tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Desired End State #4; Phase 2 e2e
- **Detail**: Desired end state requires re-sync keeps archived parcels archived. Manual testing step 4 covers this, and existing `sync.e2e-spec.ts:173-207` tests DELIVERED re-sync. New parcels e2e doesn't include a post-deliver sync assertion. Low risk since sync code is unchanged, but S-03 won't regression-guard FR-007 end-to-end via HTTP.
- **Fix**: Optional — add Phase 2 scenario: deliver via HTTP, invoke sync upsert path (or full sync with mocked Gmail), assert status unchanged. Or accept manual-only per S-02 precedent.
- **Decision**: ACCEPTED — manual step 4 + existing sync.e2e sufficient

### F5 — Phase 4 `npm run test` excludes API e2e

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Automated Verification
- **Detail**: Root `npm run test` runs web + api unit tests only (`package.json:19-21`). API e2e runs separately (`test:e2e` in CI `.github/workflows/lint-and-test.yml:71`). Phase 4 listing `npm run test` as "full suite" may mislead implementer into thinking parcels e2e re-runs; Phase 2 already owns e2e.
- **Fix**: Clarify Phase 4 automated criteria: "`npm run test` passes (unit tests; e2e verified in Phase 2)."
- **Decision**: FIXED — clarified Phase 4 test scope
