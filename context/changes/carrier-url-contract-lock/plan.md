# Carrier URL Contract Lock Implementation Plan

## Overview

Complete Phase 3 of the phased test rollout by locking the generated tracking-link contract for InPost, Poczta Polska, DPD, and DHL. The change adds table-driven unit evidence at the authoritative API builder and resolver layers, plus parity coverage for the web form's duplicated URL preview, without changing production URL behavior.

## Current State Analysis

The API already generates carrier links at read time. `resolveTrackingUrl` accepts a safe stored override first, returns `null` for `CUSTOM`, normalizes the tracking number, and delegates known carriers to `buildCarrierUrl`. Exact builder URLs for all four known carriers are covered today, but as independent tests; resolver generation is asserted only for InPost.

The web form independently duplicates the four templates in `previewGeneratedTrackingUrl` and currently has no direct unit coverage. This duplication is intentionally left in place for this test rollout, but its observable output needs an independent parity lock.

## Desired End State

A single API-owned table of literal reference cases drives exact-URL assertions through both `buildCarrierUrl` and the no-override `resolveTrackingUrl` path. A web Vitest table independently asserts the same literal contracts for the preview helper. Tests continue to cover URL encoding, normalization, override precedence, empty input, unsafe override fallback, and `CUSTOM` behavior.

After focused and repository-wide verification plus a manual live-link spot check, `context/foundation/test-plan.md` documents the reusable pattern and records rollout Phase 3 as `complete`.

### Key Discoveries:

- `apps/api/src/parcels/carrier-url-templates.ts:12-39` owns the four authoritative API templates and returns `null` when no builder exists.
- `apps/api/src/parcels/resolve-tracking-url.ts:7-24` is the clickable API path: safe override, `CUSTOM` rejection, normalization, then template generation.
- `apps/api/src/parcels/carrier-url-templates.spec.ts:5-43` already holds exact literal expectations for all supported carriers, but not in a table.
- `apps/api/src/parcels/resolve-tracking-url.spec.ts:35-46` proves generated output only for InPost.
- `apps/web/src/app/core/parcels/preview-generated-tracking-url.ts:3-31` duplicates API templates for form preview and has no co-located spec.
- `context/foundation/test-plan.md:46-56` defines Risk #5 and requires per-carrier pattern evidence at the table-driven unit layer.

## What We're NOT Doing

- Changing carrier URL templates, normalization, override precedence, or production behavior.
- Moving URL generation into a new shared workspace package.
- Adding service, HTTP e2e, browser automation, snapshots, or carrier status API calls.
- Expanding supported carriers beyond InPost, Poczta Polska, DPD, and DHL.
- Sanitizing raw `trackingUrlOverride` responses or changing merge URL handling.
- Treating live carrier sites as stable automated-test dependencies.

## Implementation Approach

Create a test-only API fixture module under `apps/api/test/fixtures/` containing carrier, representative tracking number, and literal expected URL rows. Import it into both API specs so the builder and resolved clickable path are checked against the same independent oracle. Keep edge contracts that do not belong in the four-carrier matrix—`CUSTOM`, blank values, safe/unsafe overrides, normalization, and special-character encoding—in focused tests.

Add a co-located web spec with its own literal case table. The web test deliberately mirrors expected values rather than importing API test data: this respects workspace boundaries and ensures a coordinated production-template mistake cannot make both implementations and their oracle change together unnoticed.

## Critical Implementation Details

Expected URLs must remain literal test data and must not be assembled with production builders or copied from a runtime template map. The API fixture is test-only; production source must not import it. The test-plan Phase 3 row reaches `complete` only after automated gates and the manual carrier-site spot check succeed.

## Phase 1: API Carrier Contract Table

### Overview

Replace separate per-carrier examples with one reusable contract table and exercise each row through both API generation layers.

### Changes Required:

#### 1. API contract fixtures

**File**: `apps/api/test/fixtures/carrier-url-contract-cases.ts`

**Intent**: Define the independent reference cases once for API tests, keeping expected values outside production URL-builder code.

**Contract**: Export a readonly table covering `INPOST`, `POCZTA_POLSKA`, `DPD`, and `DHL`; every row contains the Prisma carrier enum value, representative tracking number, and exact expected HTTPS URL.

#### 2. Builder contract coverage

**File**: `apps/api/src/parcels/carrier-url-templates.spec.ts`

**Intent**: Convert the four separate happy-path tests into a named `it.each` contract while retaining focused boundary coverage.

**Contract**: Every fixture row must produce its exact expected URL through `buildCarrierUrl`; `CUSTOM` remains `null`, and special characters remain percent-encoded.

#### 3. Resolved clickable-link coverage

**File**: `apps/api/src/parcels/resolve-tracking-url.spec.ts`

**Intent**: Prove every known carrier reaches the expected generated URL through the same resolver used by parcel DTOs, not only through the lower-level builder.

**Contract**: With `trackingUrl: null`, every fixture row resolves to its exact URL. Existing tests continue to lock safe override precedence, unsafe override fallback, `CUSTOM`, blank tracking numbers, and normalization without duplicating a standalone InPost-only happy path.

### Success Criteria:

#### Automated Verification:

- The API contract table contains exactly the four FR-014 known carriers with literal expected URLs.
- Builder tests pass for every contract row, `CUSTOM`, and encoded special characters.
- Resolver tests pass for every contract row and preserve override, normalization, unsafe fallback, blank, and `CUSTOM` behavior.
- Focused API tests pass: `npm run test -w @parcel-scrubber/api -- carrier-url-templates.spec resolve-tracking-url.spec`
- API lint passes: `npm run lint:api`

---

## Phase 2: Web Preview Parity

### Overview

Lock the duplicated web form preview against the same user-visible carrier URL contract without coupling the web workspace to API or Prisma modules.

### Changes Required:

#### 1. Preview helper contract coverage

**File**: `apps/web/src/app/core/parcels/preview-generated-tracking-url.spec.ts`

**Intent**: Add a table-driven Vitest suite for all known carriers and the preview-specific boundary behavior.

**Contract**: A local literal table covers the same four carrier/reference-number/exact-URL cases as the API fixture. Additional assertions cover whitespace/case normalization, percent encoding, blank input, and `CUSTOM` returning `null`.

### Success Criteria:

#### Automated Verification:

- Web preview tests assert exact URLs for all four known carriers using literal expectations.
- Web preview tests lock normalization, encoding, blank-input, and `CUSTOM` behavior.
- The complete web unit suite passes: `npm run test:web`
- Web lint passes: `npm run lint:web`

---

## Phase 3: Rollout Documentation and Verification

### Overview

Verify the contract at repository level, spot-check the external destinations, and close Phase 3 in the test rollout documentation.

### Changes Required:

#### 1. Carrier URL cookbook and rollout state

**File**: `context/foundation/test-plan.md`

**Intent**: Replace Phase 3 deferrals with the shipped test pattern and make the rollout table reflect the actual lifecycle.

**Contract**: Record `carrier-url-contract-lock` in the Phase 3 change-folder cell; transition its status through `planned`/`implementing` and finally to `complete` only after all plan verification is complete. Update the last-reviewed note and §6 guidance to name the API contract table, resolver coverage, independent web literals, focused commands, external-site spot check, and the anti-pattern of deriving expectations from production builders.

### Success Criteria:

#### Automated Verification:

- Repository build passes: `npm run build`
- Repository lint passes: `npm run lint`
- All API and web unit tests pass: `npm run test`
- `test-plan.md` §6 documents the shipped API and web carrier-contract pattern and no longer labels Phase 3 coverage as deferred.

#### Manual Verification:

- Open one generated reference URL for each known carrier and confirm it reaches the intended carrier tracking page; verify tracking-number handoff where the carrier supports it and record Poczta Polska's documented best-effort behavior.
- Confirm the Phase 3 rollout row names `carrier-url-contract-lock` and is marked `complete` only after every Progress item is done.

**Implementation Note**: Pause after automated verification for the live-link spot check. Only after human confirmation should the Phase 3 status be finalized as `complete`.

---

## Testing Strategy

### Unit Tests:

- Use named table rows so a failure identifies the carrier.
- Assert exact literal URLs for representative real-format tracking numbers.
- Exercise both `buildCarrierUrl` and `resolveTrackingUrl` on the API.
- Exercise `previewGeneratedTrackingUrl` independently on the web.
- Keep boundary tests for unsupported `CUSTOM`, blank input, normalization, encoding, override precedence, and unsafe override fallback.

### Integration Tests:

- None added. Risk #5 is deterministic pure URL generation, and the test plan identifies unit tests as the cheapest strong layer.

### Manual Testing Steps:

1. Generate or copy each reference URL from the contract table.
2. Open the InPost, Poczta Polska, DPD, and DHL URLs in a browser.
3. Confirm each URL stays on the expected HTTPS carrier domain and reaches the tracking experience.
4. Confirm the tracking number is handed off when supported; note the existing Poczta Polska best-effort limitation rather than weakening the exact application contract silently.

## Performance Considerations

The added tables contain four rows and pure functions only; they introduce no runtime cost and negligible test-suite overhead.

## Migration Notes

No database, API, persisted-data, or deployment migration is required. This change is test and documentation only.

## References

- Product contract: `context/foundation/prd.md:37`, `context/foundation/prd.md:72`, `context/foundation/prd.md:175`
- Rollout risk and response: `context/foundation/test-plan.md:46-56`
- Rollout Phase 3: `context/foundation/test-plan.md:68`
- API templates: `apps/api/src/parcels/carrier-url-templates.ts:12-39`
- API resolver: `apps/api/src/parcels/resolve-tracking-url.ts:7-24`
- Web preview: `apps/web/src/app/core/parcels/preview-generated-tracking-url.ts:3-31`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API Carrier Contract Table

#### Automated

- [ ] 1.1 API contract table contains exactly the four FR-014 known carriers with literal expected URLs
- [ ] 1.2 Builder tests pass for every contract row, CUSTOM, and encoded special characters
- [ ] 1.3 Resolver tests pass for every contract row and preserve all existing edge behavior
- [ ] 1.4 Focused API carrier URL tests pass
- [ ] 1.5 API lint passes

### Phase 2: Web Preview Parity

#### Automated

- [ ] 2.1 Web preview tests assert exact URLs for all four known carriers
- [ ] 2.2 Web preview tests lock normalization, encoding, blank-input, and CUSTOM behavior
- [ ] 2.3 Complete web unit suite passes
- [ ] 2.4 Web lint passes

### Phase 3: Rollout Documentation and Verification

#### Automated

- [ ] 3.1 Repository build passes
- [ ] 3.2 Repository lint passes
- [ ] 3.3 All API and web unit tests pass
- [ ] 3.4 Test-plan cookbook documents the shipped pattern and removes Phase 3 deferrals

#### Manual

- [ ] 3.5 Live reference URLs reach the intended carrier tracking pages
- [ ] 3.6 Phase 3 row names the change folder and reaches complete only after all Progress items are done
