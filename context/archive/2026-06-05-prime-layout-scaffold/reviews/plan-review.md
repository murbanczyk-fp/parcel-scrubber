<!-- PLAN-REVIEW-REPORT -->
# Plan Review: PrimeNG UI Layout Scaffold

- **Plan**: `context/changes/prime-layout-scaffold/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-05
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 1 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | WARNING |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding

Grounding: 5/5 paths ✓, 3/3 symbols ✓ (provideRouter, bootstrapApplication, RouterOutlet), brief↔plan ✓

## Findings

### F1 — Phase 2 manual criteria require routes defined in Phase 3

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Manual Verification (2.5) vs Phase 3 Route configuration
- **Detail**: Progress item 2.5 requires "SelectButton switches routes when logged in", but `app.routes.ts` shell wiring and lazy-loaded children are Phase 3 only. With empty routes today, Phase 2 cannot satisfy its own manual gate without premature route work or a partial route stub.
- **Fix A ⭐ Recommended**: Move manual criterion 2.5 to Phase 3 (renumber Progress 3.7); limit Phase 2 manual to header chrome toggling (2.3, 2.4, 2.6) and optional shell unit test with mocked Router.
  - Strength: Matches dependency order; Phase 2 gate is achievable without duplicating Phase 3.
  - Tradeoff: Phase 2 pause confirms less navigation behavior.
  - Confidence: HIGH — routes are explicitly Phase 3 in the plan body.
  - Blind spot: None significant.
- **Fix B**: Add a minimal Phase 2 route stub (`'' → AppShell`, one child) so SelectButton navigation is testable early.
  - Strength: Earlier end-to-end feedback on router sync.
  - Tradeoff: Splits route work across two phases; implementer may ship incomplete tree.
  - Confidence: MED — works but adds coordination overhead.
  - Blind spot: Placeholder components still needed for meaningful navigation.
- **Decision**: FIXED via Fix A — moved 2.5 to Phase 3 Progress 3.7

### F2 — Desired End State #3 promises refresh sync stub auth cannot deliver

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State #3 vs Phase 3 Manual Verification (3.5 footnote)
- **Detail**: End state says SelectButton "stay in sync on refresh", but stub auth resets `isLoggedIn` on reload and Phase 3 explicitly expects "Page refresh resets to logged out". After refresh on `/archive`, user lands logged out at `/` — not synced SelectButton state.
- **Fix**: Reword Desired End State #3 to "URL and selection stay in sync during in-session navigation and browser back; refresh persistence deferred to F-02 session cookies."
- **Decision**: FIXED — reworded Desired End State #3

### F3 — F-02 plan duplicates shell, routes, and scaffold work F-01 now owns

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Migration Notes vs `context/changes/web-oauth-app-shell/plan.md`
- **Detail**: F-01 migration note says trim F-02 plan, but F-02 plan still builds `AppShellComponent`, rewrites `app.routes.ts` (`/login` + `/active` only), strips CLI scaffold, and adds `features/parcels/active-list` — conflicting with F-01 landing-at-`/`, four route stubs, and PrimeNG shell. F-02 overview still labels itself "roadmap F-01".
- **Fix A ⭐ Recommended**: Add explicit F-01 prerequisite to F-02 plan header: "Requires merged F-01; do not recreate shell/routes/scaffold." Schedule F-02 plan rewrite before `/10x-implement web-oauth-app-shell`.
  - Strength: Prevents double implementation and route-map fork (`/` vs `/login`).
  - Tradeoff: Extra doc work before F-02 starts.
  - Confidence: HIGH — F-02 plan text contradicts current roadmap sequencing.
  - Blind spot: OAuth callback redirect target must align with F-01 route map (`/` not `/login`).
- **Fix B**: Merge F-02 auth into F-01 plan now.
  - Strength: Single plan, no handoff ambiguity.
  - Tradeoff: Violates agreed slice boundary and OAuth env prerequisite deferral.
  - Confidence: LOW — scope creep against user decisions.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — F-01 Migration Notes + F-02 stale banner

### F4 — SelectButton contract omits FormsModule dependency

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — App shell component contract
- **Detail**: Plan lists `SelectButtonModule` for `p-selectButton` but PrimeNG SelectButton requires `FormsModule` (for `ngModel` or reactive binding) in standalone `imports`. Missing it causes a common first-build failure.
- **Fix**: Add `FormsModule` from `@angular/forms` to shell component `imports` in the contract (already a workspace dependency).
- **Decision**: FIXED — added FormsModule to shell contract

### F5 — Phase 1 may over-specify @angular/animations

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 — dependencies and app.config.ts contract
- **Detail**: Plan requires `@angular/animations` and `provideAnimationsAsync()`. Current PrimeNG v21 installation docs show only `providePrimeNG()` with `@primeuix/themes` — no animations provider. Adding unused animation infrastructure is extra dependency surface.
- **Fix**: Change Phase 1 contract to "follow primeng.org/installation at implement time"; include `@angular/animations` only if a chosen component errors without it.
- **Decision**: FIXED — animations optional per install docs

### F6 — Guard unit tests listed in Testing Strategy but optional in Phase 3

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Testing Strategy vs Phase 3 item 7
- **Detail**: Testing Strategy names `stubAuthGuard` / `stubGuestGuard` unit tests; Phase 3 contract marks route/guard specs as "optional". Implementer may skip guards and lose coverage of redirect behavior promised in success criteria.
- **Fix**: Make guard unit specs required in Phase 3 automated criteria (add Progress items 3.7–3.8 or fold into 3.2 scope).
- **Decision**: FIXED — guard specs required in Phase 3 contract
