# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-07-25 (Phase 2 cookbook completed)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `apps/api/src`, `apps/web/src`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Authenticated user A can read or mutate user B's parcel (IDOR — login succeeds, ownership fails) | High | Medium | PRD Access Control; interview Q1, Q4; abuse lens (authorization) |
| 2 | A stored or returned tracking URL is unsafe (e.g. `javascript:`, non-http) and surfaces as a clickable link | High | Medium | PRD FR-015, FR-014; archive `2026-07-05-manual-parcel-crud` (override safety); interview Q1; abuse lens (untrusted input) |
| 3 | Merge or tracking-number dedupe joins the wrong parcels, drops linked emails, or leaves duplicate rows | High | Medium | interview Q3; PRD FR-020 + tracking-number dedupe rule; hot-spot dir `apps/api/src/parcels` (43 file touches/30d) |
| 4 | Gmail sync enrichment overwrites non-empty fields the user already set manually | Medium | Medium | PRD business rule 4 (carrier-before-store enrichment fills null/empty only) |
| 5 | Generated carrier tracking link (no override) points at the wrong domain or pattern for a known carrier | Medium | Low | PRD FR-014 |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | User B gets 404 on GET/PATCH/deliver/remove/merge of A's parcel; B's list never includes A's id | "JwtAuthGuard alone is enough" | Session shape for two users without live Google OAuth; ownership filter on list + every mutation; `remove` is a status-transition route, not HTTP DELETE | HTTP e2e with two user fixtures | Unit-only Prisma mock happy path |
| #2 | Unsafe URL rejected on create/update; safe http(s) accepted; clickable `trackingUrl` never returns a non-http(s) scheme, including for legacy stored junk | "Write-time validation is enough"; or "every response field is sanitized" even though raw `trackingUrlOverride` has a separate editing contract | Write vs read path for URL override; resolved link vs raw override response fields; independent oracle (http/https only) | Existing URL-helper units + focused HTTP e2e at update and legacy-read boundaries | Assertion copied from production validator |
| #3 | Merge survivor is oldest; all linked emails move to survivor; losers deleted; field conflicts follow PRD precedence | "Two happy-path merges prove the rule" | Survivor selection; email reparent; conflict precedence | Unit (rules) + service/e2e for side effects | Expected values mirrored from production sort |
| #4 | Sync fills only null/empty fields; user-set non-empty values remain | "Upsert always overwrites every field" | Enrichment merge semantics vs full replace | Unit/integration on merge-from-extraction | Full Gmail mailbox e2e |
| #5 | Known carrier + tracking number → URL on the expected carrier domain (pattern contract) | "One InPost case covers all carriers" | Per-carrier URL template contract | Table-driven unit | Snapshot of entire parcel DTO |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Critical-path ownership & URL safety | Prove IDOR denial and unsafe tracking-URL rejection at the cheapest strong layer | #1, #2 | unit gaps + HTTP e2e | researched | testing-critical-path-ownership-url-safety |
| 2 | Merge & dedupe confidence | Prove merge/dedupe side effects and sync enrichment non-overwrite | #3, #4 | unit + service/integration | researched | merge-and-dedupe-confidence |
| 3 | Carrier URL contract lock | Table-driven contract for generated carrier links | #5 | unit | planned | carrier-url-contract-lock |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit (API) | Jest | ^30 | `*.spec.ts` under `apps/api/src/` |
| HTTP e2e (API) | Jest e2e | via `apps/api/test/jest-e2e.json` | `*.e2e-spec.ts` in `apps/api/test/` |
| unit (web) | Vitest | ^4.0.8 | via `ng test`; co-located `*.spec.ts` |
| e2e (browser) | none yet | — | Not required for §3 Phase 1–3; logic lives in API |
| AI-native | none for this rollout | n/a | Deterministic unit/e2e cover named risks; checked: 2026-07-24 |

**Stack grounding tools (current session):**
- Docs: Context7 — available for Nest/Jest/Vitest APIs if needed; checked: 2026-07-24
- Search: not available in current session; checked: 2026-07-24
- Runtime/browser: cursor-ide-browser available — not used for these risks (API e2e cheaper); checked: 2026-07-24
- Provider/platform: GitHub Actions lint+test already wired (`.github/workflows/lint-and-test.yml`); checked: 2026-07-24

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase \<N\>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift |
| unit + API e2e | local + CI | required; Phase 1–3 add cases under existing runners | ownership, URL safety, merge/dedupe, carrier URL regressions |
| full browser e2e / live Google OAuth | — | not planned | excluded — see §7 |
| PrimeNG UI path coverage | — | not planned | excluded — see §7 |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase \<N\>."

### 6.1 Adding a unit test (API)

- Co-locate API unit tests as `*.spec.ts` under `apps/api/src/`. URL
  allowlist and resolver rules may call the helper directly; see
  `is-safe-http-url.spec.ts` and `resolve-tracking-url.spec.ts`.
- At an HTTP boundary, use an independent oracle instead of importing the
  production URL validator. Parse the response with `new URL(...)` and
  compare its protocol with the literal `http:` / `https:` contract.
- Controller or service tests backed by mocked Prisma calls do not prove
  ownership isolation. Use real-database HTTP e2e for IDOR boundaries.
- Carrier-template table-driven coverage remains deferred to §3 Phase 3 /
  Risk #5.

### 6.2 Adding an HTTP e2e test (API)

- Put suites in `apps/api/test/*.e2e-spec.ts`. The parcel reference suite
  checks that `E2E_DATABASE_URL` (or its default) names a database ending
  in `_test`, deploys migrations during bootstrap, truncates application
  tables before each test, and runs serially through
  `apps/api/test/jest-e2e.json`.
- Seed users through Prisma, sign each user's `SessionUser` with
  `AuthService`, and attach the resulting JWT cookie to separate Supertest
  agents. Live Google OAuth is not part of this setup.
- Seed through the public HTTP write API when possible. Use Prisma directly
  only for states that the public API should reject, such as a legacy unsafe
  tracking-URL override.
- Run one parcel suite with
  `npm run test:e2e -w @parcel-scrubber/api -- parcels.e2e-spec`; run all API
  e2e suites with `npm run test:e2e -w @parcel-scrubber/api`. These are
  separate from API unit Jest, which runs through `npm run test:api`.

### 6.3 Adding a web unit test

- TBD — not a focus of Phase 1–3; prefer API signal for ownership and URL safety (interview Q5).

### 6.4 Adding a test for parcel ownership / IDOR

- Create two users and a real parcel owned by User A, then issue requests
  with User B's signed-cookie agent. Cross-user resource requests must
  return 404, and User B's active and archived lists must exclude User A's
  parcel id.
- Prove the fixture exists through User A's list or a direct database read.
  After a denied mutation, re-read the row and assert the attempted fields
  did not change.
- Exercise the real JWT, controller, service, and Postgres path; a mocked
  Prisma `null` result is not IDOR proof. Parcel removal is
  `POST /api/parcels/:id/remove`, a status transition, not HTTP DELETE.

### 6.5 Adding a test for tracking URL safety or carrier URL generation

- At the write boundary, cover create/update rejection of non-HTTP(S)
  values and acceptance of a known-safe HTTP(S) override. Assert the error
  identifies `trackingUrl`; for an accepted override, assert both response
  URL fields equal it.
- To test read-time safety, seed a legacy unsafe override directly with
  Prisma, then retrieve that parcel through both GET and list HTTP paths.
  Find the list row by id rather than making assertions about unrelated
  rows.
- `trackingUrlOverride` is raw editing data and may preserve the unsafe
  legacy value. The clickable `trackingUrl` is the safety boundary: if
  non-null, parse it and independently require `http:` or `https:`.
- Merge URL validation remains deferred to merge-focused work. Generated
  carrier-template contracts remain deferred to §3 Phase 3 / Risk #5.

### 6.6 Per-rollout-phase notes

#### Phase 1 — Critical-path ownership & URL safety

- Change: `testing-critical-path-ownership-url-safety`; risks covered:
  #1 (cross-user parcel access) and #2 (unsafe tracking URL).
- Reference suite: `apps/api/test/parcels.e2e-spec.ts`.
- Shipped five scenarios: cross-user active/archive list exclusion;
  cross-user PATCH denial with persisted-state non-mutation; unsafe PATCH
  rejection; safe HTTPS PATCH acceptance; and legacy unsafe override
  protection across GET/list.
- Prerequisite: a reachable Postgres test database whose name ends in
  `_test`. Verify with the focused and full e2e commands in §6.2, then run
  `npm run lint:api && npm run test:api`, `npm run lint`, and
  `npm run test`.
- No production or web behavior changed. Merge URL validation,
  carrier-template contracts, and raw `trackingUrlOverride` sanitization
  remain outside this rollout.

#### Phase 2 — Merge & dedupe confidence

- Change: `merge-and-dedupe-confidence`; risks covered: #3 (incorrect
  merge/dedupe relations) and #4 (sync enrichment overwrites non-empty
  values). Reference suites:
  `apps/api/test/parcels.e2e-spec.ts`,
  `apps/api/test/sync.e2e-spec.ts`, and
  `apps/api/src/sync/merge-parcel-fields-from-extraction.spec.ts`.
- For manual merge, seed at least three parcels with literal `createdAt`
  values and submit their IDs out of age order. Create an overlapping
  Gmail message once, then add separate `ParcelEmail` links to the
  survivor and a loser. After merging, assert the literal oldest survivor
  ID and message date, one remaining parcel, no loser rows or links,
  exactly one survivor link per Gmail ID, and retention of every
  `GmailMessage` ledger row.
- Manual merge fields are explicit client choices. Include a literal value
  absent from every source parcel and assert it persists; do not claim
  automatic source-field precedence.
- For sync dedupe, return two literal Gmail IDs with different message
  dates and tracking strings that differ in whitespace/case but have one
  canonical identity. Assert one parcel with the literal canonical number,
  the earlier message date, two ledger rows, and two links. Combine a
  carrier-first extraction with a merchant extraction to prove that the
  first non-empty values remain while empty metadata fills.
- For enrichment preservation, establish non-empty values through
  `ParcelsService.updateForUser`, leave one field empty, then sync a
  conflicting extraction. Assert the edited literals remain, the empty
  field fills, and status, source, tracking URL override, tracking
  identity, parcel count, and new message link remain correct.
- Treat `parcelFieldsChanged` as a pure unit seam: table-drive equality
  and one change in each of store, description, carrier, and custom
  carrier label. The current `CUSTOM`-to-known carrier upgrade, including
  clearing `customCarrierLabel`, is intentional.
- E2e expected values must be literal fixture values. Do not import
  survivor selection, tracking normalization, order-date fallback, or
  enrichment helpers to calculate expectations. Exact mocked Prisma call
  shapes are wiring checks, not proof of constraints, cascades, or final
  relational state.
- Prerequisite: `E2E_DATABASE_URL` (or the local default) must point to a
  disposable database whose name ends in `_test`. Focused commands:
  `npm run test:e2e -w @parcel-scrubber/api -- parcels.e2e-spec`,
  `npm run test:e2e -w @parcel-scrubber/api -- sync.e2e-spec`, and
  `npm run test -w @parcel-scrubber/api -- merge-parcel-fields-from-extraction.spec`.
  Generated carrier tracking-link templates remain deferred to §3
  Phase 3 / Risk #5.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Live Google OAuth e2e** — too expensive locally; use fixture/session doubles for multi-user API e2e. Re-evaluate if auth transport changes. (Source: interview Q5.)
- **Exhaustive PrimeNG UI path coverage** — product logic and ownership live in the API; UI smoke is optional. Re-evaluate if critical flows become client-only. (Source: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-07-24
- Stack versions last verified: 2026-07-24
- AI-native tool references last verified: 2026-07-24

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
