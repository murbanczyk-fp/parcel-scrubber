<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Gmail Message Retrieval

- **Plan**: context/changes/gmail-message-retrieval/plan.md
- **Scope**: Phases 1–4 of 4 (all completed)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Unvalidated label query override

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/gmail/gmail-test.controller.ts:32
- **Detail**: Optional `?label=` bypasses `normalizeGmailScanLabel()`. Values like `ParcelScrubber OR in:sent` widen the Gmail search query beyond the intended label. Settings-saved labels are validated; query overrides are not.
- **Fix**: When `label` query param is provided, run `normalizeGmailScanLabel(label)` and map validation errors to `BadRequestException`.
- **Decision**: FIXED

### F2 — Unquoted multi-word label names in Gmail query

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/gmail/build-gmail-list-query.ts:5
- **Detail**: `buildGmailListQuery` emits `label:My Custom Label …` without quoting. Gmail treats space-separated tokens as AND terms, likely breaking multi-word labels.
- **Fix**: Quote label names containing spaces or special characters, e.g. `label:"My Custom Label"`. Add spec for multi-word labels.
- **Decision**: FIXED

### F3 — Silent refresh-token rotation persistence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/gmail/google-oauth-client.factory.ts:39-45
- **Detail**: Rotated refresh tokens are persisted with `void this.prisma.user.update(...)` — DB write failures are swallowed with no logging.
- **Fix**: `await` the update inside an async tokens handler (or log failures on fire-and-forget).
- **Decision**: FIXED

### F4 — Test routes gated only by NODE_ENV

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/gmail/gmail.module.ts:8-9
- **Detail**: `GmailTestController` registers when `NODE_ENV !== 'production'`. A misconfigured prod deploy without `NODE_ENV=production` would expose JWT-protected Gmail read endpoints.
- **Fix**: Add unit test asserting zero controllers when `NODE_ENV=production`; document deploy requirement.
- **Decision**: SKIPPED

### F5 — Retry helper lacks unit tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/api/src/gmail/retry-transient-gmail-api-call.ts
- **Detail**: Extracted retry policy (429/5xx, 3× backoff) has no co-located spec. Plan testing strategy lists retry coverage; service spec does not exercise retry paths.
- **Fix**: Add `retry-transient-gmail-api-call.spec.ts` covering retryable vs non-retryable errors and attempt exhaustion.
- **Decision**: FIXED

### F6 — isInvalidGrantError message substring fallback

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/gmail/google-oauth-client.factory.ts:85-88
- **Detail**: Besides `response.data.error === 'invalid_grant'`, also matches `message.includes('invalid_grant')`. A non-auth error whose message contains that substring could incorrectly clear the stored refresh token.
- **Fix**: Remove message substring fallback; rely on structured `response.data.error` only.
- **Decision**: FIXED

### F7 — Auth offline-OAuth fix outside F-05 plan phases

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: apps/api/src/auth/strategies/offline-google-oauth.strategy.ts (and related auth files)
- **Detail**: Commit 260e358 added `OfflineGoogleOAuthStrategy`, `GoogleAuthGuard`, and strategy changes not listed in plan phases. Required because passport-google-oauth20 ignores constructor `accessType`/`prompt`. Plan progress documents manual verification at this SHA.
- **Fix A ⭐ Recommended**: Add brief addendum to plan Phase 1 or References noting the auth prerequisite fix.
  - Strength: Preserves work; updates source of truth.
  - Tradeoff: Plan becomes slightly moving target.
  - Confidence: HIGH — fix is necessary for F-05 verification checklist.
  - Blind spot: None significant.
- **Fix B**: Leave as-is; progress SHAs already document it.
  - Strength: No plan edit needed.
  - Tradeoff: Future reviewers may flag as unplanned drift again.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A — plan addendum)
