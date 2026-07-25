# Critical-Path Ownership and URL Safety Test Implementation Plan

## Overview

Complete Phase 1 of the phased test rollout by adding focused HTTP e2e regression coverage for parcel ownership isolation and tracking-URL safety. The implementation extends the existing real-Postgres parcel suite; it does not change production behavior.

## Current State Analysis

Parcel routes authenticate with a JWT cookie, then pass the authenticated user id into service methods that scope Prisma reads and mutations by `userId`. Existing HTTP e2e tests already prove cross-user denial for GET, deliver, remove, reactivate, and merge, but do not prove list isolation or PATCH denial.

Tracking URL overrides are constrained to HTTP(S) on create, update, and merge. Read mapping deliberately exposes two fields: raw `trackingUrlOverride` for editing and resolved `trackingUrl` for clickable links. Existing tests cover unsafe create rejection and resolver fallback, but not PATCH validation or the full HTTP read path for legacy unsafe database values.

### Key Discoveries

- The existing suite already provides real two-user JWT fixtures without Google OAuth (`apps/api/test/parcels.e2e-spec.ts:87-109`).
- List and PATCH ownership are enforced by `userId` predicates in `ParcelsService` (`apps/api/src/parcels/parcels.service.ts:78-94,148-209`).
- Cross-user denial is consistently 404, not 403 (`apps/api/src/parcels/parcels.service.ts:135-145,877-890`).
- Unsafe stored overrides are filtered when producing clickable `trackingUrl`, but remain visible in raw `trackingUrlOverride` (`apps/api/src/parcels/map-parcel-to-dto.ts:19-34`, `apps/api/src/parcels/resolve-tracking-url.ts:7-23`).
- API unit Jest and HTTP e2e Jest use separate configurations; e2e must run through `npm run test:e2e -w @parcel-scrubber/api` (`apps/api/package.json:20-24,70-85`).

## Desired End State

The parcel HTTP suite fails if:

- another authenticated user can see an owner's parcel in either list;
- another authenticated user can PATCH an owner's parcel or alter its stored data;
- PATCH accepts a non-HTTP(S) tracking URL;
- PATCH rejects a safe HTTPS tracking URL;
- a legacy unsafe stored override reaches API consumers as clickable `trackingUrl`.

The suite continues to document that `trackingUrlOverride` is raw editing data and may echo a legacy unsafe value, while only `trackingUrl` carries the clickable-link safety contract. `context/foundation/test-plan.md` §6 records reusable recipes for reproducing these high-signal tests.

## What We're NOT Doing

- Changing parcel authorization, URL validation, DTO mapping, or any other production code.
- Sanitizing or suppressing raw `trackingUrlOverride`.
- Adding merge tracking-URL validation coverage; Phase 1 locks create/update, and merge belongs with later merge work.
- Duplicating existing cross-user GET, deliver, remove, reactivate, or merge tests.
- Adding browser tests, Angular tests, or live Google OAuth tests.
- Adding carrier-template contract tests; those remain Phase 3 / Risk #5.
- Adding schema changes, migrations, new test endpoints, or shared test infrastructure.

## Implementation Approach

Add five risk-focused cases to `apps/api/test/parcels.e2e-spec.ts`, reusing its application bootstrap, Prisma lifecycle, user creation, signed-session agents, and parcel factory. Keep ownership and URL scenarios separate so failures identify the broken boundary. Use direct Prisma writes only to model legacy data that the current HTTP write boundary correctly rejects.

After the tests land, replace the relevant §6 placeholders in `context/foundation/test-plan.md` with recipes grounded in the shipped suite. Preserve explicit deferrals for web tests, merge URL validation, and carrier URL templates.

## Critical Implementation Details

`trackingUrlOverride` and `trackingUrl` have intentionally different contracts: the legacy-row test must assert that the raw override remains unchanged while independently proving the resolved clickable field is null or HTTP(S). Multi-parcel fixtures for one user must use distinct tracking numbers because the database enforces per-user tracking-number uniqueness.

## Phase 1: Prove Cross-User Ownership Isolation

### Overview

Close the two uncovered Risk #1 paths using the real HTTP, JWT, service, and Postgres stack. These tests must prove tenant isolation through observable responses and persisted state rather than mocked Prisma calls.

### Changes Required

#### 1. Parcel HTTP ownership scenarios

**File**: `apps/api/test/parcels.e2e-spec.ts`

**Intent**: Add separate list-isolation and PATCH-denial tests using the existing `createTestUser`, `createAuthenticatedAgent`, and `createParcel` helpers.

**Contract**:

- Seed active and archived parcels for User A with distinct tracking numbers.
- Request both `status=active` and `status=archived` lists as User B.
- Assert neither response contains either User A parcel id.
- PATCH User A's parcel as User B and expect 404.
- Re-read the parcel through Prisma and assert the attempted fields are unchanged.
- Keep the owner-scoped seed visible through the owner's list or direct database read so an empty fixture cannot produce a false-positive isolation result.

### Test Contract

- **Behavior asserted**: authenticated users see and mutate only their own parcels.
- **Regression caught**: removal of a list `userId` predicate, PATCH lookup scoping, or PATCH write scoping.
- **Research source**: `research.md` Risk #1 findings and `apps/api/src/parcels/parcels.service.ts:78-94,148-209`.
- **Boundary case**: valid User B session targeting a real User A parcel; this is authorization failure after authentication succeeds.
- **Anti-pattern avoided**: treating `JwtAuthGuard` metadata or a mocked Prisma `null` result as proof of ownership isolation.

### Success Criteria

#### Automated Verification

- The focused parcel e2e suite passes with new list-isolation and cross-user PATCH cases: `npm run test:e2e -w @parcel-scrubber/api -- parcels.e2e-spec`.
- The PATCH denial case proves the database row remains unchanged after the 404 response.

---

## Phase 2: Lock Tracking-URL Write and Read Boundaries

### Overview

Close Risk #2 at the HTTP boundary while preserving the accepted dual-field DTO contract. Cover unsafe and safe PATCH writes separately, then bypass write validation to prove legacy data cannot become a clickable unsafe URL on GET or list.

### Changes Required

#### 1. Test-local clickable URL oracle

**File**: `apps/api/test/parcels.e2e-spec.ts`

**Intent**: Add a small test-only assertion helper for the public clickable URL contract.

**Contract**: For non-null values, parse the returned string with the platform `URL` constructor and assert its protocol is one of the literal independent expectations `http:` or `https:`. Do not import or call production `isSafeHttpUrl`; the expected behavior must not mirror the implementation under test.

#### 2. PATCH tracking-URL write scenarios

**File**: `apps/api/test/parcels.e2e-spec.ts`

**Intent**: Prove update requests apply the same URL safety boundary already covered for create.

**Contract**:

- PATCH an owned parcel with `javascript:alert(1)` and expect 400 with `errors` identifying `trackingUrl`.
- In a separate case, PATCH an owned parcel with a safe HTTPS override and expect 200.
- Assert both `trackingUrlOverride` and resolved `trackingUrl` equal the accepted safe override.
- Keep existing POST unsafe-URL coverage as the create-side proof; do not duplicate it.

#### 3. Legacy unsafe override read scenario

**File**: `apps/api/test/parcels.e2e-spec.ts`

**Intent**: Prove read-time protection independently of current HTTP write validation.

**Contract**:

- Create an owned InPost parcel through the existing fixture, then use Prisma to set its stored override to `javascript:alert(1)`.
- GET the parcel and retrieve the active list through HTTP.
- Find the seeded parcel by id in the list rather than asserting every unrelated row.
- Assert `trackingUrlOverride` still contains the raw legacy value, documenting the accepted editing contract.
- Apply the independent clickable URL oracle to `trackingUrl` in both GET and list responses; for the InPost fixture it should resolve to a safe generated HTTPS link.

### Test Contract

- **Behavior asserted**: update writes reject unsafe schemes and accept HTTPS; legacy database junk cannot reach clickable `trackingUrl`.
- **Regression caught**: PATCH bypassing the validator, safe URL rejection, removal of read-time resolution, or accidentally binding raw override into the resolved response field.
- **Research source**: `research.md` Risk #2 findings; `apps/api/src/parcels/parcels.service.ts:640-655,783-822`; `apps/api/src/parcels/map-parcel-to-dto.ts:19-34`.
- **Boundary case**: data that cannot be created through the current API but may exist through legacy rows or database tampering.
- **Anti-pattern avoided**: importing the production URL validator as the test oracle or asserting that every response field is sanitized.

### Success Criteria

#### Automated Verification

- The focused parcel e2e suite passes with separate unsafe PATCH, safe PATCH, and legacy-read cases: `npm run test:e2e -w @parcel-scrubber/api -- parcels.e2e-spec`.
- The full API e2e suite passes against the test database: `npm run test:e2e -w @parcel-scrubber/api`.

---

## Phase 3: Publish Reusable Test Recipes and Verify the Rollout

### Overview

Turn the shipped cases into durable project guidance, preserve later rollout boundaries, and run the complete quality gates.

### Changes Required

#### 1. API unit-test cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the Phase 1 placeholder in §6.1 with guidance on when URL helper units are useful and when mocked units are insufficient.

**Contract**:

- Point to co-located API `*.spec.ts` tests for URL allowlist and resolver rules.
- State that helper units may test the helper directly, but an HTTP/e2e assertion must use an independent oracle.
- Warn that service/controller tests with mocked Prisma are not sufficient IDOR proof.
- Keep carrier-template table-driven guidance explicitly deferred to Phase 3 / Risk #5.

#### 2. HTTP e2e cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.2's placeholder with the real database and authentication recipe used by the parcel suite.

**Contract**:

- Document `apps/api/test/*.e2e-spec.ts`, `_test` database protection, migration/bootstrap, per-test truncation, and serial execution.
- Document the seeded-user plus signed JWT-cookie agent pattern; live Google OAuth is not part of e2e setup.
- Document direct Prisma seeding only for states the public write API should reject, such as legacy unsafe overrides.
- Record the focused and full e2e commands and explicitly distinguish them from API unit Jest.

#### 3. Ownership and URL-safety recipes

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.4 and the Phase 1 portion of §6.5 with behavior-specific recipes from Phases 1 and 2.

**Contract**:

- §6.4: two users, real owner row, cross-user 404, list exclusion, and persisted-state non-mutation; clarify that remove is a POST status transition rather than HTTP DELETE.
- §6.5: create/update write rejection, safe acceptance, legacy-row GET/list, independent HTTP(S) protocol oracle, and the raw-override versus resolved-link distinction.
- Keep merge URL validation and generated carrier-template contracts explicitly deferred.
- Correct any remaining `404/403` Phase 1 placeholder language to the grounded 404 contract.

#### 4. Phase 1 rollout note

**File**: `context/foundation/test-plan.md`

**Intent**: Add a concise §6.6 record of the risks covered, scenarios shipped, non-goals, prerequisites, and verification commands.

**Contract**:

- Name change `testing-critical-path-ownership-url-safety` and Risks #1/#2.
- Record the five new scenarios and their reference suite.
- Record that no production, web, merge URL, or raw-override sanitization changes landed.
- Update the document's last-updated/freshness note to reflect the completed Phase 1 cookbook.
- Leave §3 rollout completion to the test-plan orchestrator after implementation Progress is fully complete.

### Success Criteria

#### Automated Verification

- `context/foundation/test-plan.md` §6.1, §6.2, §6.4, §6.5, and §6.6 contain reusable Phase 1 recipes while later-phase items remain explicitly deferred.
- API lint and unit tests pass: `npm run lint:api && npm run test:api`.
- All API e2e tests pass: `npm run test:e2e -w @parcel-scrubber/api`.
- Root lint and unit suites pass: `npm run lint && npm run test`.

---

## Testing Strategy

### Unit Tests

- Add no new unit tests in this rollout; existing helper units already cover scheme classification and resolver fallback.
- Run the full API unit suite to detect collateral regressions.

### Integration Tests

- Two risk-focused ownership cases through Nest HTTP, JWT-cookie authentication, service authorization, and real Postgres.
- Two risk-focused PATCH URL write cases through controller error translation and persistence.
- One legacy-row read case covering both GET and list mapping with an independent clickable URL oracle.

### Manual Testing Steps

No manual or browser verification is required. All named risks and accepted contracts are deterministic at the API boundary.

## Performance Considerations

The five cases reuse the existing serial e2e application and database lifecycle. Keep each case narrowly seeded and avoid introducing additional application bootstraps or browser layers. The expected runtime increase is limited to a handful of HTTP requests and test-database operations.

## Migration Notes

No schema or data migration is required. The direct unsafe-row seed exists only inside the test database to model legacy data.

## References

- Related research: `context/changes/testing-critical-path-ownership-url-safety/research.md`
- Rollout strategy: `context/foundation/test-plan.md`
- Reference HTTP suite: `apps/api/test/parcels.e2e-spec.ts:23-128,413-600`
- E2e runner: `apps/api/test/jest-e2e.json`
- API scripts: `apps/api/package.json:8-24,70-85`
- CI parity: `.github/workflows/lint-and-test.yml:30-75`
- Prior command correction: `context/archive/2026-06-14-gmail-sync-active-parcels/reviews/impl-review.md:21-30`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.cursor/skills/10x-plan/references/progress-format.md`.

### Phase 1: Prove Cross-User Ownership Isolation

#### Automated

- [ ] 1.1 Focused parcel e2e suite passes with list-isolation and cross-user PATCH cases
- [ ] 1.2 Cross-user PATCH test proves the persisted owner row remains unchanged

### Phase 2: Lock Tracking-URL Write and Read Boundaries

#### Automated

- [ ] 2.1 Focused parcel e2e suite passes with unsafe PATCH, safe PATCH, and legacy-read cases
- [ ] 2.2 Full API e2e suite passes

### Phase 3: Publish Reusable Test Recipes and Verify the Rollout

#### Automated

- [ ] 3.1 Test-plan cookbook contains reusable Phase 1 recipes and explicit later-phase deferrals
- [ ] 3.2 API lint and unit tests pass
- [ ] 3.3 Full API e2e suite passes
- [ ] 3.4 Root lint and unit suites pass
