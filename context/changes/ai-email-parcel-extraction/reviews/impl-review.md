<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Email Parcel Extraction

- **Plan**: context/changes/ai-email-parcel-extraction/plan.md
- **Scope**: All 4 phases (complete)
- **Date**: 2026-06-14
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING (1 skipped) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Verification

| Command | Result |
|---------|--------|
| `npm run lint:api` | PASS |
| `npm run test:api` | PASS (143 tests) |
| `npm run lint` | PASS |

## Findings

### F1 — Raw fetch failures bypass ExtractionError mapping

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/extraction/openrouter-client.ts:81-87
- **Detail**: Network-level fetch failures propagated raw; test route only maps ExtractionError → 502.
- **Fix**: Wrap non-OpenRouterHttpError failures in ExtractionError with cause; add fetch-rejection spec.
- **Decision**: FIXED

### F2 — No fetch timeout on OpenRouter calls

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/extraction/openrouter-client.ts:45-68
- **Detail**: fetch had no AbortSignal; hung connections could block indefinitely.
- **Fix**: Add AbortSignal.timeout(60_000).
- **Decision**: FIXED

### F3 — Empty OPENROUTER_API_KEY passes validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/extraction/openrouter-client.ts:33
- **Detail**: getOrThrow accepts empty string; sends Bearer with no key.
- **Fix**: Validate non-empty after getOrThrow.
- **Decision**: SKIPPED

### F4 — E2E bootstrap missing OPENROUTER_API_KEY

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: apps/api/test/app.e2e-spec.ts:24-31
- **Detail**: app.e2e bootstraps AppModule without OPENROUTER_API_KEY when no .env.local.
- **Fix**: Set process.env.OPENROUTER_API_KEY in beforeEach.
- **Decision**: FIXED

### F5 — Hardcoded HTTP-Referer for production deploys

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/api/src/extraction/openrouter-client.ts:16
- **Detail**: HTTP-Referer hardcoded to localhost:4200.
- **Fix**: User chose to remove optional HTTP-Referer header entirely.
- **Decision**: FIXED (removed header)

### F6 — bodySnippet on error cause could leak in future logging

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/extraction/openrouter-client.ts:70-75
- **Detail**: bodySnippet stored on OpenRouterHttpError cause.
- **Fix**: Remove bodySnippet from OpenRouterHttpError.
- **Decision**: FIXED

## Triage Summary

- **Fixed**: F1, F2, F4, F5 (removed HTTP-Referer), F6
- **Skipped**: F3
