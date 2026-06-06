<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: PrimeNG UI Layout Scaffold

- **Plan**: context/changes/prime-layout-scaffold/plan.md
- **Scope**: All 3 phases (complete)
- **Date**: 2026-06-06
- **Verdict**: NEEDS ATTENTION → triaged
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Verification (re-run 2026-06-06)

| Command | Result |
|---------|--------|
| `npm run lint:web` | PASS |
| `npm run test:web` | PASS (12/12) |
| `npm run build -w @parcel-scrubber/web` | PASS (522.80 kB, +22.80 kB budget warning) |
| `npm run test` | PASS |

## Findings

### F1 — Custom theme preset instead of plain Aura

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: apps/web/src/app/app.config.ts:12
- **Detail**: Plan specified `Aura` preset; implementation uses `ParcelScrubberPreset` (Aura derivative with Soho surface palette).
- **Fix A ⭐ Recommended**: Document in plan as addendum.
- **Decision**: FIXED via Fix A — Implementation Addendum added to plan.md

### F2 — Unplanned branding scope (Google Fonts, extended global styles)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: apps/web/src/index.html:9-14, apps/web/src/styles.scss
- **Detail**: External Google Fonts and extended typography/surface tokens beyond minimal Phase 1 contract.
- **Fix**: Covered by F1 Implementation Addendum.
- **Decision**: FIXED via Fix A (same addendum)

### F3 — Header height hardcoded in landing layout

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/features/landing/landing.component.scss:5
- **Detail**: Landing `min-height` duplicated magic `3.25rem` instead of shared token with shell header.
- **Fix**: Promote `--app-header-height` to `styles.scss` `:root` and reference from shell + landing.
- **Decision**: FIXED — shared token in styles.scss

### F4 — Initial bundle exceeds 500 kB budget

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/web/angular.json (budget config)
- **Detail**: Production initial bundle 522.80 kB (+22.80 kB over warning). Build succeeds; plan anticipated monitoring.
- **Fix A ⭐ Recommended**: Accept for F-01; document measured size in plan Performance section.
- **Decision**: FIXED via Fix A — measured size documented in plan.md

### F5 — URL substring matching for SelectButton sync

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/layout/app-shell/app-shell.component.ts
- **Detail**: `url.includes('/archive')` fragile for nested routes.
- **Fix**: Use `ActivatedRoute` child snapshot for path matching.
- **Decision**: FIXED — `syncSelectionFromRoute()` via `ActivatedRoute.firstChild` snapshot

### F6 — Login navigation test bypasses DOM event path

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/app/layout/app-shell/app-shell.component.spec.ts:64
- **Detail**: Test called `onLogin()` directly instead of triggering template `onClick`.
- **Fix**: `triggerEventHandler('onClick', null)` on rendered `p-button`.
- **Decision**: FIXED

### F7 — Duplicated placeholder SCSS across feature stubs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/app/features/active|archive|settings/*.scss
- **Detail**: Identical placeholder styles copy-pasted three times.
- **Fix**: Extract to shared partial `features/placeholder-page.scss`.
- **Decision**: FIXED — shared partial with `@import` in each stub
