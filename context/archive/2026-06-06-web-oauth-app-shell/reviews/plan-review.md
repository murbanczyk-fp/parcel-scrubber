<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Web OAuth and App Shell

- **Plan**: context/changes/web-oauth-app-shell/plan.md
- **Mode**: Deep
- **Date**: 2026-06-06
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 2 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict (pre-triage) | Verdict (after triage) |
|-----------|----------------------|------------------------|
| End-State Alignment | WARNING | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | WARNING | PASS |
| Plan Completeness | FAIL | PASS |

## Grounding

Grounding: 5/5 paths ✓, 3/3 symbols ✓, brief↔plan ✓

## Findings

### F1 — Phase 2 deletes stubs before tests are updated

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — step 5 vs Success Criteria 2.2
- **Detail**: Phase 2 step 5 deleted `stub-auth.service.ts` and stub spec files, noting specs are "replaced in Phase 3." Phase 2 also rewires `AppShellComponent` to `AuthService` while `app-shell.component.spec.ts` still imports `StubAuthService` until Phase 3. Phase 2 criterion 2.2 requires `npm run test:web` to pass — that cannot succeed with this ordering.
- **Fix A ⭐ Recommended**: Move `app-shell.component.spec.ts` update into Phase 2 step 3 (before stub deletion). Delete only stub service/guard files in step 5; defer stub spec deletion to Phase 3 when replacements land.
  - Strength: Phase 2 can pass automated verification; shell spec matches rewired component immediately.
  - Tradeoff: Guard/service specs still deleted in Phase 2 unless also deferred.
  - Confidence: HIGH — shell spec imports StubAuthService at lines 5, 28, 40, 52.
  - Blind spot: Deleting guard specs in Phase 2 still reduces coverage until Phase 3.
- **Fix B**: Defer all stub file deletion (service + specs) to Phase 3
  - Strength: Zero test churn mid-Phase 2; stubs become dead code briefly but harmless.
  - Tradeoff: Two auth implementations coexist through all of Phase 2 manual testing.
  - Confidence: HIGH — simplest path to green tests.
  - Blind spot: Implementer must not accidentally import stubs after rewiring.
- **Decision**: FIXED via Fix B — stub deletion moved to Phase 3 step 5; Phase 2 note added.

### F2 — Checkboxes in phase Success Criteria break Progress parser

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phases 1–3 — `#### Automated Verification` / `#### Manual Verification` blocks
- **Detail**: Each phase Success Criteria section used `- [ ]` checkboxes, but `/10x-implement` requires checkboxes only in the canonical `## Progress` block at the bottom. Phase bodies should use plain `-` bullets.
- **Fix**: Replace `- [ ]` items in phase Success Criteria with plain `-` bullets. Keep `- [ ]` / `- [x]` only under `## Progress`.
- **Decision**: FIXED — checkboxes removed from all phase Success Criteria sections.

### F3 — displayName null leaves blank header username

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — App shell auth actions
- **Detail**: API `SessionUser.displayName` is `string | null`. Shell template rendered `{{ auth.user()?.displayName }}` only. Manual criterion 2.7 expects "display name (or email fallback)" but plan marked email fallback as optional.
- **Fix**: Add to Phase 2 shell contract — template shows `displayName ?? email` in the username span.
- **Decision**: FIXED — Phase 2 shell contract requires `auth.user()?.displayName ?? auth.user()?.email`.

### F4 — OAuth callback redirect change has no API test coverage

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — API OAuth callback redirect; criterion 2.3
- **Detail**: Phase 2 changes `res.redirect('/')` to `res.redirect('/active')` and requires `npm run test:api`, but no `auth.controller` spec exists. Criterion 2.3 passes vacuously.
- **Fix**: Document that callback redirect is manual-only in F-02.
- **Decision**: FIXED — testing note added under Phase 2 API step.

### F5 — Guard contract allows createUrlTree but stubs use navigate+false

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 — Guards contract
- **Detail**: Plan allowed `createUrlTree` OR navigate + `false`. Existing stubs and specs use `void router.navigate([...]); return false` exclusively.
- **Fix**: Narrow guard contract to match stub pattern: `void router.navigate([...]); return false`.
- **Decision**: FIXED — guard contract narrowed to navigate + return false for both guards.

## Triage Summary

- **Fixed**: F1 (Fix B), F2, F3, F4, F5 (5)
- **Skipped**: 0
- **Accepted**: 0
- **Dismissed**: 0
- **Overall after triage**: SOUND — safe to implement
