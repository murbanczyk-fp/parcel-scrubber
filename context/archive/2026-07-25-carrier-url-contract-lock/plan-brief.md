# Carrier URL Contract Lock — Plan Brief

> Full plan: `context/changes/carrier-url-contract-lock/plan.md`

## What & Why

Complete Phase 3 of the test rollout by locking generated tracking links for InPost, Poczta Polska, DPD, and DHL. The tests must catch a wrong carrier domain, path, query shape, tracking-number handoff, or drift between the API's clickable URL and the web form preview.

## Starting Point

The API already has exact builder tests for all four carriers, but they are separate examples and only InPost is exercised through `resolveTrackingUrl`. The web preview duplicates all templates and has no direct tests.

## Desired End State

One API test fixture table drives exact full-URL assertions through both the builder and resolver. A separate web Vitest table locks the duplicated preview behavior, while focused edge tests preserve normalization, encoding, override, blank-input, unsafe-fallback, and `CUSTOM` contracts.

## Key Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| API test surface | Builder and resolver | Locks both the template and the clickable read path |
| Assertion strength | Exact full URLs | FR-014 requires known URL patterns, not domain-only checks |
| Web scope | Thin parity unit suite | Closes a real duplicated-template drift risk cheaply |
| API fixture ownership | Shared test-only API module | Reuses one independent oracle without production imports |
| Web expectations | Mirrored literals | Preserves workspace boundaries and avoids coupling both tests to one source |
| Test layer | Unit only | Pure deterministic generation needs no service or HTTP e2e |
| Rollout closure | Tests, cookbook, then `complete` | Keeps `test-plan.md` aligned with shipped evidence |

## Scope

**In scope:**

- Table-driven exact URL contracts for the four FR-014 carriers.
- API builder and no-override resolver coverage.
- Web preview parity coverage.
- Existing edge contracts for normalization, encoding, overrides, blanks, unsafe fallback, and `CUSTOM`.
- Repository verification, live-link spot check, and Phase 3 cookbook/status updates.

**Out of scope:**

- Production URL or resolver changes.
- A shared runtime workspace package.
- New carriers, carrier status APIs, service/e2e/browser automation, or snapshots.
- Raw override sanitization and merge URL behavior.

## Architecture / Approach

Store literal carrier/reference-number/expected-URL rows in an API test-only fixture module and consume them from both API specs. Keep an independent literal table beside the web helper spec. This intentionally tests the duplicated observable contracts without making either oracle depend on production builders.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. API carrier contract table | Builder and resolver matrix for all known carriers | A lower-level test passes while the clickable path is wrong |
| 2. Web preview parity | Exact preview URLs plus edge behavior | Form preview silently drifts from API output |
| 3. Documentation and verification | Full gates, live spot check, cookbook, completed rollout | Stale external template gets permanently locked |

**Prerequisites:** Existing npm workspace dependencies installed; internet access for the final manual carrier-site spot check.

**Estimated effort:** One implementation session across three small phases.

## Open Risks & Assumptions

- Carrier websites may change paths or query behavior independently of this repository; the manual spot check prevents blindly locking an already-stale template.
- Poczta Polska's query parameter remains a documented best-effort handoff.
- API and web templates intentionally remain duplicated; the tests detect drift but do not remove its cause.
- Exact URL changes are treated as deliberate contract changes requiring fixture updates and review.

## Success Criteria (Summary)

- Every known carrier produces the exact expected URL through the API builder, API resolver, and web preview.
- Edge behavior remains covered without snapshots or production-derived expected values.
- Build, lint, and API/web unit suites pass; live URLs reach the intended carrier pages.
- The test-plan cookbook records the shipped pattern and Phase 3 is marked `complete`.
