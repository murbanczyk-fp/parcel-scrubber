<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: User Settings Model

- **Plan**: context/changes/user-settings-model/plan.md
- **Scope**: All 3 phases (complete)
- **Date**: 2026-06-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — parseInt accepts partial numeric strings on read path

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/user-settings/parse-setting-value.ts:22-33
- **Detail**: `parseScanPeriodDays` uses `Number.parseInt(raw, 10)`, which accepts partial numeric strings (`"90abc"` → 90) and truncates decimals (`"30.5"` → 30). Plan intent is fallback for non-integer / corrupt stored values; lax parsing lets corrupt DB values through defense-in-depth read path.
- **Fix**: Use strict parsing — e.g. `/^\d+$/` test before `parseInt`, or `Number(raw)` + `Number.isInteger`. Add unit tests for `"90abc"`, `"30.5"`.
- **Decision**: FIXED (Fix now — strict `/^\d+$/` parsing + unit tests)

### F2 — e2e defaults test queries all settings rows

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/api/test/user-settings-schema.e2e-spec.ts:64-72
- **Detail**: First test calls `prisma.userSetting.findMany()` without `userId` filter. Safe only because of per-test truncate; other tests filter by `userId`.
- **Fix**: Filter `where: { userId: user.id }` to match other tests and prove per-user isolation.
- **Decision**: FIXED (Fix now — userId filter on findMany)

### F3 — serializeSettingValue has no save-path validation

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/user-settings/parse-setting-value.ts:48-57
- **Detail**: `serializeSettingValue` is blind `String(value)` with no validation. Plan delegates validation to S-01 callers (`normalizeGmailScanLabel` / `validateScanPeriodDays`); a missed call site would persist corrupt data.
- **Fix**: Document in JSDoc that callers must validate first; optional `prepareSettingForSave` wrapper in S-01.
- **Decision**: FIXED (Fix now — JSDoc on serializeSettingValue)
