# Critical-Path Ownership and URL Safety Tests — Plan Brief

> Full plan: `context/changes/testing-critical-path-ownership-url-safety/plan.md`  
> Research: `context/changes/testing-critical-path-ownership-url-safety/research.md`

## What & Why

Complete Phase 1 of the test rollout by locking the two highest-priority security boundaries: one authenticated user must not access another user's parcels, and unsafe stored tracking URLs must not become clickable links. The safeguards already exist; this change adds focused regression tests where current coverage is weakest.

## Starting Point

The API already scopes parcel operations by `userId`, validates URL overrides on write, and resolves safe clickable URLs on read. The existing real-Postgres HTTP suite covers cross-user GET and most actions plus unsafe create, but it lacks list isolation, cross-user PATCH, PATCH URL validation, and an HTTP legacy-row read check.

## Desired End State

Five focused e2e cases prove list and PATCH ownership isolation, unsafe and safe PATCH URL behavior, and safe clickable output for a legacy unsafe database value. The project test plan then documents these fixtures, assertions, commands, and anti-patterns as reusable recipes.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Legacy response contract | Protect clickable `trackingUrl`; preserve raw `trackingUrlOverride` | Matches the current editing contract without introducing a product change | Research + Plan |
| URL write scope | Create/update only | Existing POST covers create rejection; new PATCH cases close the update gap without overlapping merge work | Research + Plan |
| Case structure | Separate risk-focused cases | A failing test identifies the exact broken boundary | Plan |
| Test layer | Existing HTTP e2e with real Postgres and signed JWT fixtures | Cheapest layer that proves ownership and HTTP wiring without live OAuth | Research |
| URL oracle | Test-local `URL` protocol allowlist | Avoids copying or calling the production validator | Research |
| Cookbook depth | Reusable recipes | Prevents future tests from reverting to mocks, wrong runners, or mirrored assertions | Plan |

## Scope

**In scope:**

- User B's active/archive lists exclude User A's parcel ids.
- User B's PATCH of User A's parcel returns 404 and leaves the row unchanged.
- PATCH rejects `javascript:` and accepts a safe HTTPS override.
- Prisma-seeded legacy junk remains raw in `trackingUrlOverride` but cannot emerge as clickable `trackingUrl`.
- `test-plan.md` §6 recipes for API units, HTTP e2e, ownership, URL safety, and Phase 1 verification.

**Out of scope:**

- Production code, schema, migrations, browser/web tests, or live Google OAuth.
- Raw override sanitization.
- Merge URL validation and carrier-template contracts.
- Duplicating already-covered cross-user GET, deliver, remove, reactivate, or merge scenarios.

## Architecture / Approach

Extend `apps/api/test/parcels.e2e-spec.ts` using its current Nest application, Prisma lifecycle, seeded users, JWT-cookie agents, and parcel factory. Use Prisma directly only to model a legacy unsafe row, then verify GET/list responses through HTTP. Finish by grounding `context/foundation/test-plan.md` §6 in the shipped patterns.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Ownership isolation | Cross-user list exclusion and PATCH non-mutation | A valid login bypasses parcel ownership |
| 2. URL boundaries | Unsafe/safe PATCH and legacy-row clickable-link checks | Unsafe URL is accepted or returned as a link |
| 3. Cookbook and verification | Reusable recipes plus full quality gates | Coverage lands but future tests repeat weak patterns |

**Prerequisites:** Local Postgres test database ending in `_test`, or `E2E_DATABASE_URL` pointing to one.  
**Estimated effort:** One implementation session across three small phases.

## Open Risks & Assumptions

- Raw `trackingUrlOverride` intentionally remains unsanitized editing data; only `trackingUrl` is safe for clickable use.
- The existing serial e2e database lifecycle remains stable; no new shared helper module is needed.
- Distinct tracking numbers are required when one test seeds multiple parcels for the same user.

## Success Criteria

- Cross-user list and PATCH regressions fail deterministically against real Postgres.
- Unsafe PATCH and legacy read regressions fail using an independent HTTP(S) oracle.
- API lint, unit, and e2e suites plus root lint/unit suites pass.
- The test-plan cookbook explains how to reproduce these patterns and which later risks remain deferred.
