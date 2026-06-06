<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Parcel Prisma Model

- **Plan**: context/changes/parcel-prisma-model/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-06-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Missing e2e database URL guard before TRUNCATE

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/test/parcel-schema.e2e-spec.ts:15-21
- **Detail**: E2e uses `E2E_DATABASE_URL` (default `parcel_scrubber_test`) but has no runtime guard before `TRUNCATE` and `migrate deploy`. A misconfigured `.env.local` pointing at dev or production DB will wipe `users`, `parcels`, and `parcel_status_events`.
- **Fix**: Add `assertE2eDatabaseUrl(url)` in `beforeAll` that parses the URL and throws unless the database name ends with `_test` (or matches an explicit allowlist). Fail fast before any destructive SQL.
- **Decision**: FIXED

### F2 — CI Postgres provisioning differs from plan contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .github/workflows/lint-and-test.yml:49-66
- **Detail**: Plan specified GHA `services.postgres` on `localhost:5432`. Implementation uses `docker run` on port 5433 with Docker host gateway IP — a self-hosted runner workaround explicitly anticipated in the plan fallback note. CI is green on PR #21.
- **Fix**: Add a short plan addendum documenting the self-hosted docker-run approach as the adopted CI pattern for e2e Postgres.
- **Decision**: FIXED

### F3 — Case-sensitive partial unique index without write-path enforcement

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/api/prisma/migrations/20260606130352_add_parcel_models/migration.sql:57-59
- **Detail**: Partial unique index on `(user_id, tracking_number)` is case-sensitive. `normalizeTrackingNumber` exists but F-03 has no persistence layer enforcing it. Until S-02/S-04 apply normalization on write, `abc123` and `ABC123` can coexist for the same user.
- **Fix A ⭐ Recommended**: Document in schema comment that app layer must call `normalizeTrackingNumber` before insert/update; track enforcement in S-02/S-04 plans.
  - Strength: Matches research §5 intent; no migration churn.
  - Tradeoff: Relies on application discipline until S-02/S-04 land.
  - Confidence: HIGH — helper already exists and plan defers writes to downstream slices.
  - Blind spot: Direct DB access bypasses app layer.
- **Fix B**: Add follow-up migration with `CREATE UNIQUE INDEX ... ON (user_id, UPPER(tracking_number)) WHERE tracking_number IS NOT NULL`.
  - Strength: DB-level enforcement regardless of app code.
  - Tradeoff: Extra migration; must drop/replace existing index; Prisma still won't surface in schema DSL.
  - Confidence: MED — works but adds complexity for greenfield tables with no data yet.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F4 — trackingUrl override lacks scheme validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/parcels/resolve-tracking-url.ts:9-10
- **Detail**: `trackingUrl` override is returned without scheme validation. When S-04 persists user-supplied overrides and the web UI renders `resolveTrackingUrl()` in an `<a href>`, values like `javascript:...` become an XSS vector. Carrier-generated URLs are safe (`encodeURIComponent` in templates).
- **Fix A ⭐ Recommended**: Defer to S-04 — add `isSafeHttpUrl` at API write boundary when manual CRUD lands.
  - Strength: F-03 has no write path; fixing now adds dead code until S-04.
  - Tradeoff: Must remember to enforce at S-04 implementation.
  - Confidence: HIGH — plan explicitly defers CRUD to S-04.
  - Blind spot: S-04 plan must include this requirement.
- **Fix B**: Add scheme check in `resolveTrackingUrl` now (allow `http:`/`https:` only; null out unsafe overrides).
  - Strength: Defense-in-depth at read/render time regardless of how bad data got in.
  - Tradeoff: Slightly changes helper contract before any data exists.
  - Confidence: HIGH — small, self-contained change.
  - Blind spot: Doesn't prevent storing bad URLs, only rendering them safe.
- **Decision**: FIXED (Fix A — deferred to S-04 with code comment)

### F5 — Partial unique index exists only in migration SQL

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/api/prisma/schema.prisma (Parcel model)
- **Detail**: Partial unique index is manual SQL in migration only; Prisma schema DSL cannot express it. Prisma Client won't surface the constraint in types. Matches plan expectation but creates schema drift if someone runs `prisma db pull`.
- **Fix**: Add a comment above `Parcel` model documenting the partial unique index and referencing the migration file.
- **Decision**: FIXED (addressed with F3 schema comment)

### F6 — Progress 3.4 unchecked despite CI green

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/parcel-prisma-model/plan.md:338
- **Detail**: Manual item 3.4 ("CI api job green with Postgres service and e2e step") remains `- [ ]` but PR #21 api job passed with e2e on 2026-06-06.
- **Fix**: Mark 3.4 as `- [x]` with commit SHA from the CI-green commit.
- **Decision**: FIXED
