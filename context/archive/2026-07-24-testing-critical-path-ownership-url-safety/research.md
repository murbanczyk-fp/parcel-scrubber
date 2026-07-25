---
date: 2026-07-24T18:21:57+02:00
researcher: GPT-5.6 Sol
git_commit: 5a2116e99fd93f7347c7cff5abcc65535f675714
branch: main
repository: murbanczyk-fp/parcel-scrubber
topic: "Ground rollout Phase 1: critical-path ownership and URL safety"
tags: [research, codebase, parcels, authorization, url-safety, testing]
status: complete
last_updated: 2026-07-24
last_updated_by: GPT-5.6 Sol
---

# Research: Critical-path ownership and URL safety

**Date**: 2026-07-24T18:21:57+02:00  
**Researcher**: GPT-5.6 Sol  
**Git Commit**: `5a2116e99fd93f7347c7cff5abcc65535f675714`  
**Branch**: `main`  
**Repository**: `murbanczyk-fp/parcel-scrubber`

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`: trace the real failure paths for Risk #1 (cross-user parcel access) and Risk #2 (unsafe tracking URL), verify the proposed responses, locate existing coverage, and identify the cheapest tests that add real signal.

## Summary

Risk #1 is an implemented authorization boundary with incomplete regression coverage, not a missing safeguard. `JwtAuthGuard` only authenticates a session. Every parcel controller method passes `user.id` to `ParcelsService`, and list/read/update/status-transition/merge queries independently constrain Prisma operations by `userId`. Ownership denial is deliberately indistinguishable from absence and returns **404**, never 403. Existing real-Postgres HTTP e2e tests already cover cross-user GET, deliver, remove, reactivate, and merge. The useful gaps are cross-user PATCH and explicit list isolation; unit-only Prisma mocks would add little signal.

Risk #2 also has both write- and read-time controls. Create, update, and merge validate the stored override against an `http:`/`https:` allowlist. On reads, `resolveTrackingUrl` ignores an unsafe stored override before producing the clickable `trackingUrl`. However, `mapParcelToDto` also returns the raw database value as `trackingUrlOverride`. Therefore the test-plan statement “responses never return `javascript:`” is too broad: the clickable `trackingUrl` is filtered, but legacy junk can still appear in `trackingUrlOverride`, feed the edit form, and appear as a merge-field option. Planning needs a product decision: narrow the contract to clickable `trackingUrl`, or sanitize the raw override field too.

The hot-spot scopes were directionally useful but not anchors. Both failure paths are API-owned under `apps/api/src/parcels`; the web app only consumes the two URL fields. No browser test or live Google OAuth flow is needed.

## Detailed Findings

### Risk #1 — Cross-user parcel access

#### Authentication is not ownership authorization

The controller-level guard authenticates all parcel routes, but each handler must still forward the authenticated user id:

> `@UseGuards(JwtAuthGuard)` applies to the controller, while `listParcels`, `mergeParcels`, `getParcel`, `updateParcel`, `deliverParcel`, and `removeParcel` pass `user.id` into the service.

- [`apps/api/src/parcels/parcels.controller.ts:37-48`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.controller.ts#L37-L48)
- [`apps/api/src/parcels/parcels.controller.ts:62-107`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.controller.ts#L62-L107)

`JwtCookieStrategy` only reads and verifies the session cookie and returns the session user. It performs no parcel-specific check:

- [`apps/api/src/auth/strategies/jwt.strategy.ts:18-29`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/auth/strategies/jwt.strategy.ts#L18-L29)

The “JwtAuthGuard alone is enough” assumption is therefore false. Removing any service-level `userId` predicate would create an IDOR even while the guard continued to pass.

#### Ownership predicates by operation

- **List**: `findMany` uses `where: { userId, status: ... }`, so another user's id cannot enter either active or archived results ([`parcels.service.ts:78-94`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L78-L94)).
- **GET**: `findFirst({ where: { id: parcelId, userId } })`; no match throws `NotFoundException` ([`parcels.service.ts:135-145`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L135-L145)).
- **PATCH**: the initial read is owner-scoped, and the write uses `updateMany({ where: { id, userId } })` with a zero-count 404, preserving the boundary across a race ([`parcels.service.ts:148-209`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L148-L209)).
- **Deliver/remove/reactivate**: the shared transition first reads by `{ id, userId }`, then updates by `{ id, userId, status }` inside a transaction ([`parcels.service.ts:877-934`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L877-L934)).
- **Merge**: all selected rows are loaded with `{ userId, id: { in: parcelIds } }`; a missing foreign row makes the count differ and returns 404. Survivor updates, loser deletes, and the final read are also owner-scoped ([`parcels.service.ts:242-272`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L242-L272), [`parcels.service.ts:333-400`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L333-L400)).

The API has no `DELETE /parcels/:id`. “Remove” is `POST /api/parcels/:id/remove` and changes status to `REMOVED`; physical deletion only removes merge losers. The response guidance should name the actual route rather than “delete.”

#### Existing tests and gaps

The main parcel e2e suite uses real Prisma/Postgres rows and creates authenticated agents by signing session cookies for seeded users, so it exercises the actual guard, strategy, controller, service, and ownership queries without Google OAuth ([`apps/api/test/parcels.e2e-spec.ts:87-109`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/test/parcels.e2e-spec.ts#L87-L109)). The e2e runner is serial, avoiding shared-database races ([`apps/api/test/jest-e2e.json:1-11`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/test/jest-e2e.json#L1-L11)).

Already covered:

- cross-user deliver and remove return 404 ([`parcels.e2e-spec.ts:246-257`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/test/parcels.e2e-spec.ts#L246-L257));
- cross-user GET returns 404 ([`parcels.e2e-spec.ts:489-507`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/test/parcels.e2e-spec.ts#L489-L507));
- merge containing another user's id returns 404 ([`parcels.e2e-spec.ts:735-751`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/test/parcels.e2e-spec.ts#L735-L751));
- cross-user reactivate is also covered.

Missing:

1. User B's active and archived lists explicitly exclude User A's parcel ids.
2. User B's PATCH of User A's parcel returns 404 and leaves the row unchanged.

Service and controller unit tests verify query shapes and delegation, but their Prisma/service mocks cannot prove cross-user database behavior. They are supporting coverage, not the Risk #1 oracle.

#### Cheapest useful layer

Add two focused cases to `apps/api/test/parcels.e2e-spec.ts`, reusing its existing two-user helpers:

1. Seed active and archived parcels for A; request both lists as B; assert neither response contains A's ids.
2. PATCH A's parcel as B; assert 404 and query Prisma to prove the stored row is unchanged.

Do not duplicate GET/deliver/remove/merge cases that already provide the requested signal.

### Risk #2 — Unsafe tracking URL

#### Write boundary

The production allowlist parses the trimmed URL and accepts only `http:` or `https:`:

- [`apps/api/src/parcels/is-safe-http-url.ts:1-8`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/is-safe-http-url.ts#L1-L8)

Create calls `validateTrackingUrlForWrite`; PATCH and merge call `validateTrackingUrlForClear` ([`parcels.service.ts:535-559`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L535-L559), [`parcels.service.ts:640-655`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L640-L655), [`parcels.service.ts:442-450`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L442-L450)). Both validators reject other schemes with the same field error ([`parcels.service.ts:783-822`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.ts#L783-L822)). `ParcelValidationError` is translated to HTTP 400 by the controller ([`parcels.controller.ts:119-130`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.controller.ts#L119-L130)).

The write-time guidance is correct: unsafe values should be rejected on both create and update, and safe HTTP(S) overrides should be accepted. Merge uses the same update-style validator and is worth a unit or e2e case only if Phase 1 intends to lock every write path; it is not needed to satisfy the stated create/update contract.

#### Read boundary and legacy values

Read-time resolution does not trust the database value:

> `if (parcel.trackingUrl && isSafeHttpUrl(parcel.trackingUrl)) { return parcel.trackingUrl; }`

Otherwise it returns `null` for a custom carrier or generates a carrier URL from the tracking number ([`apps/api/src/parcels/resolve-tracking-url.ts:7-23`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/resolve-tracking-url.ts#L7-L23)).

The DTO mapper creates two distinct response fields:

> `trackingUrlOverride: parcel.trackingUrl`  
> `trackingUrl: resolveTrackingUrl(parcel)`

([`apps/api/src/parcels/map-parcel-to-dto.ts:19-34`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/map-parcel-to-dto.ts#L19-L34))

Consequences for a legacy row containing `javascript:alert(1)`:

- resolved `trackingUrl` is a generated HTTPS carrier URL or `null`, so it cannot expose that unsafe scheme;
- raw `trackingUrlOverride` still equals `javascript:alert(1)`.

The web list and archive render links from resolved `trackingUrl`, not the raw override ([`apps/web/src/app/features/active/active-list.component.html:137-145`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/web/src/app/features/active/active-list.component.html#L137-L145), [`apps/web/src/app/features/archive/archive-list.component.html:86-94`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/web/src/app/features/archive/archive-list.component.html#L86-L94)). The edit form does consume `trackingUrlOverride` as input text, and merge option construction also consumes it ([`parcel-form.component.ts:298-302`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/web/src/app/features/parcels/parcel-form.component.ts#L298-L302), [`merge-field-options.ts:87-91`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/web/src/app/features/parcels/merge-field-options.ts#L87-L91)). Those are not current clickable-link sinks, but they disprove the broad claim that no response can contain `javascript:`.

This is a response-guidance correction, not evidence that the current clickable link is exploitable.

#### Existing tests and gaps

Already covered:

- unit allowlist accepts HTTP(S) and rejects `javascript:`, `data:`, `file:`, relative, and malformed URLs;
- resolver unit test proves an unsafe stored override falls back to a generated URL ([`resolve-tracking-url.spec.ts:58-67`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/resolve-tracking-url.spec.ts#L58-L67));
- service unit and HTTP e2e prove create rejects `javascript:` ([`parcels.service.spec.ts:461-475`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/src/parcels/parcels.service.spec.ts#L461-L475), [`parcels.e2e-spec.ts:471-487`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/test/parcels.e2e-spec.ts#L471-L487));
- PATCH clearing a safe override is covered, including a direct Prisma seed that demonstrates the harness can create legacy-style rows ([`parcels.e2e-spec.ts:527-561`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/apps/api/test/parcels.e2e-spec.ts#L527-L561)).

Missing:

1. PATCH rejects `javascript:` at the real HTTP boundary.
2. HTTP create/update accepts a safe explicit HTTP(S) override and returns it as resolved `trackingUrl`.
3. A Prisma-seeded unsafe legacy value cannot emerge from GET/list as clickable `trackingUrl`.
4. The intended contract for raw `trackingUrlOverride` is not settled.

#### Cheapest useful layer and oracle

Use the existing HTTP e2e suite:

1. PATCH an owned parcel with `javascript:alert(1)` and expect 400 with a `trackingUrl` field error.
2. PATCH (or create) with a known `https://example.test/track` override and expect 200 with an HTTP(S) `trackingUrl`.
3. Seed `trackingUrl: 'javascript:alert(1)'` directly through Prisma, then GET the parcel and list it. Assert the response's clickable `trackingUrl` is either `null` or parses to protocol `http:`/`https:` and never starts with `javascript:`.

The test oracle must be local and independent: parse the returned string with `new URL` and compare its protocol to the literal allowlist `['http:', 'https:']`. Do not import or call `isSafeHttpUrl` from production code in the assertion.

An additional `mapParcelToDto` unit test is useful only to document the selected `trackingUrlOverride` contract. It is not required if the e2e legacy-row case asserts both response fields.

## Architecture Insights

- Authentication and resource authorization are deliberately separate: Passport establishes `SessionUser`; parcel service methods own tenant scoping.
- Ownership failures consistently use 404 to avoid disclosing whether another user's parcel exists.
- Mutations use owner-scoped `updateMany`/`deleteMany`, not only a preceding owner-scoped read, providing defense in depth against races and future refactors.
- The database column is an override, while API DTOs expose both raw override state for editing and a resolved URL for navigation. Security assertions must distinguish those contracts.
- Runtime body validation is service-owned rather than decorator/class-validator DTO validation; HTTP tests are needed to prove controller translation and wiring.

## Historical Context

- [`context/archive/2026-06-22-deliver-remove-archive/plan.md:78-80`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/context/archive/2026-06-22-deliver-remove-archive/plan.md#L78-L80) established owner-scoped status transitions and 404 for missing/wrong-user parcels.
- [`context/archive/2026-07-05-manual-parcel-crud/plan.md:107-123`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/context/archive/2026-07-05-manual-parcel-crud/plan.md#L107-L123) established write-time URL validation and the split between raw override and resolved response URL.
- [`context/archive/2026-07-05-manual-parcel-crud/reviews/impl-review.md:67-80`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/context/archive/2026-07-05-manual-parcel-crud/reviews/impl-review.md#L67-L80) found and fixed both an id-only update and missing read-time URL validation. These prior defects justify regression tests for PATCH ownership and legacy URL reads.
- [`context/archive/2026-07-20-merge-parcels/reviews/impl-review.md:42-50`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/5a2116e99fd93f7347c7cff5abcc65535f675714/context/archive/2026-07-20-merge-parcels/reviews/impl-review.md#L42-L50) similarly found and fixed survivor updates that omitted `userId`, reinforcing that owner scoping has regressed during implementation before.

## Code References

- `apps/api/src/parcels/parcels.controller.ts:37-107` — authenticated parcel routes forward `user.id`.
- `apps/api/src/parcels/parcels.service.ts:78-209` — owner-scoped list, get, and update.
- `apps/api/src/parcels/parcels.service.ts:242-400` — owner-scoped merge and delete.
- `apps/api/src/parcels/parcels.service.ts:783-822` — HTTP(S)-only write validation.
- `apps/api/src/parcels/parcels.service.ts:877-934` — owner-scoped status transition.
- `apps/api/src/parcels/map-parcel-to-dto.ts:19-34` — raw override versus resolved URL.
- `apps/api/src/parcels/resolve-tracking-url.ts:7-23` — read-time safety gate.
- `apps/api/test/parcels.e2e-spec.ts:87-109` — real two-user JWT fixture pattern.
- `apps/api/test/parcels.e2e-spec.ts:246-257,489-507,735-751` — existing cross-user HTTP coverage.
- `apps/api/test/parcels.e2e-spec.ts:471-487,527-561` — existing URL write/clear coverage.

## Related Research

No prior `research.md` under `context/changes/**` or `context/archive/**` directly grounds these two risks. The archived plans and implementation reviews above are the relevant historical evidence.

## Open Questions

1. Should the test-plan contract be narrowed to “clickable `trackingUrl` never returns a non-HTTP(S) URL,” preserving raw `trackingUrlOverride` for editing, or should API mapping sanitize legacy override values too?
2. If raw override sanitization is required, should an unsafe legacy override map to `null` or be omitted while resolved `trackingUrl` continues to fall back to a generated carrier link?
3. Is merge-field URL rejection part of Phase 1's desired write-surface lock, or should create/update remain the explicit scope because merge already receives separate Phase 2 coverage?
