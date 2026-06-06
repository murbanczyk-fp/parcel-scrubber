<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Web OAuth and App Shell

- **Plan**: context/changes/web-oauth-app-shell/plan.md
- **Scope**: All 3 phases (complete)
- **Date**: 2026-06-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned avatarUrl cross-stack feature

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Scope Discipline
- **Location**: apps/api/prisma/schema.prisma, apps/api/src/auth/types.ts, apps/api/src/auth/auth.service.ts, apps/api/src/auth/strategies/google.strategy.ts, apps/web/src/app/core/auth/session-user.ts, apps/web/src/app/layout/app-shell/app-shell.component.html
- **Detail**: Plan specified `SessionUser` as `{ id, email, displayName }`. Implementation adds `avatarUrl` end-to-end: Prisma migration, API types/service/strategy, web types, and shell template (`p-avatar [image]`). Coherent and low-risk, but not in plan or "What We're NOT Doing" guardrails — source of truth drift.
- **Fix A ⭐ Recommended**: Document in plan as addendum (avatar support for header UX)
  - Strength: Preserves working feature; updates plan before future reviews.
  - Tradeoff: Plan becomes a slightly moving target.
  - Confidence: HIGH — additive profile field, all layers in sync.
  - Blind spot: Stakeholders who reviewed original scope aren't notified.
- **Fix B**: Revert avatarUrl (migration rollback + type/template cleanup)
  - Strength: Strict scope discipline; plan matches code exactly.
  - Tradeoff: Loses header avatar UX; another migration needed.
  - Confidence: MEDIUM — no downstream consumers beyond shell header.
  - Blind spot: Manual OAuth testing may have validated avatar display.
- **Decision**: FIXED via Fix A (plan addendum)

### F2 — Logout POST failure leaves session and blocks navigation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/core/auth/auth.service.ts:33-38, apps/web/src/app/layout/app-shell/app-shell.component.ts:61-64
- **Detail**: `loadSession()` clears session on network error (`.catch`), but `logout()` has no error handler. Failed POST leaves `session` set; `onLogout()` throws before `router.navigate(['/'])`, so user stays on protected route with stale UI state. No spec covers failure path.
- **Fix**: Add `.catch(() => this.session.set(null))` in `AuthService.logout()` (optimistic clear — cookie may already be cleared client-side intent) and wrap `onLogout()` in try/finally so navigation to `/` always runs. Add spec case for failed logout POST.
  - Strength: Matches defensive pattern already used in `loadSession()`; user never stuck in limbo.
  - Tradeoff: Client may show logged-out while server cookie still valid until retry — acceptable for MVP.
  - Confidence: HIGH — same optimistic-clear pattern common for cookie auth.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — Guards assume initializer has resolved loadSession()

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/core/auth/auth.guard.ts, apps/web/src/app/core/auth/guest.guard.ts
- **Detail**: Guards read `auth.isLoggedIn()` synchronously without checking `auth.loading()`. Safe today because `provideAppInitializer(() => inject(AuthService).loadSession())` blocks routing until probe completes. Dependency is implicit — reordering bootstrap could flash-deny authenticated users.
- **Fix**: Add a one-line comment in each guard: `// Assumes provideAppInitializer has resolved loadSession() before routing.`
- **Decision**: SKIPPED

### F4 — isAuthenticatedStatus uses structural 'id' in check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/core/auth/session-user.ts:10-12
- **Detail**: Type guard discriminates via `'id' in status` rather than explicit `authenticated` flag on both branches. Works with current API contract; fragile if unauthenticated response ever gains an `id` field.
- **Fix**: Defer — low priority for MVP. Revisit if API status shape changes.
- **Decision**: SKIPPED (deferred for MVP)

## Automated Verification (re-run 2026-06-06)

| Command | Result |
|---------|--------|
| `npm run lint:web` | PASS |
| `npm run test:web` | PASS (19 tests) |
| `npm run lint` | PASS |
| `npm run test:api` | PASS (1 test) |
| `npm run build` | PASS (Sass @import deprecation warnings pre-existing) |
| `npm run test` | PASS |

## Manual Verification

All Phase 2 and Phase 3 manual items marked `[x]` in plan Progress with commit SHAs. No evidence of rubber-stamping — OAuth round-trip and cookie checks align with implemented callback redirect and session probe.
