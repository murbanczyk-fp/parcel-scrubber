# Gmail Message Retrieval Implementation Plan

## Overview

Ship roadmap **F-05**: a Nest foundation `GmailService` with two methods — **list matching Gmail message ids** by label name and scan period, and **get full message body** by Gmail message id — backed by the user's stored Google refresh token. Includes authenticated **test HTTP routes** for local smoke verification. No parcel persistence, AI extraction, sync orchestration, or settings reads inside the service layer.

## Current State Analysis

**Auth:** F-02 complete. `google.strategy.ts` requests `gmail.readonly` with `accessType: 'offline'` and `prompt: 'consent'`. Refresh token is written to `User.refreshToken` on OAuth callback via `AuthService.upsertGoogleUser()`. Access token is discarded in the strategy `validate()` callback. App session uses JWT cookie (`SessionUser` with `id` only — no Google credentials on the request).

**Gmail API:** No `googleapis` package in `apps/api/package.json`. No Gmail module, service, or types. No code reads `User.refreshToken` after OAuth.

**Settings:** F-04/S-01 provide `gmailScanLabel` and `scanPeriodDays` via `SettingsService.getEffectiveSettings()`. Roadmap requires F-05 methods accept label and period as **parameters**; test routes may delegate to settings for convenience when query params are omitted.

### Key Discoveries:

- Refresh token column: `apps/api/prisma/schema.prisma` — `User.refreshToken String? @map("refresh_token") @db.Text`
- OAuth env vars already used: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `google.strategy.ts`
- Nest feature pattern: `apps/api/src/settings/` — module + service + controller + co-located `*.spec.ts`; `AuthModule` exports `JwtAuthGuard`
- Gmail query shape from F-04 archive: `label:{gmailScanLabel} newer_than:{scanPeriodDays}d`
- Roadmap F-05: missing label → **zero results**, not an error; pagination and token refresh are primary risks
- Parcel research defers `GmailMessage` ledger tables to S-02 — **no Prisma changes in F-05**

## Desired End State

After F-05, a signed-in user with a valid Gmail refresh token can:

1. Call `GET /api/test/matching-email-ids` (optional `?label=&scanPeriodDays=`) and receive a `string[]` of Gmail message ids for messages under that label within the scan period (max 500).
2. Call `GET /api/test/email?id=<messageId>` and receive `{ body: string }` (plain text, HTML stripped when plain is absent).
3. Hit an empty array when the configured label does not exist in the mailbox.
4. Receive a distinguishable auth error when refresh token is missing or revoked (`invalid_grant` clears DB token).

`GmailService` is exported from `GmailModule` for S-02 orchestration. `npm run lint:api && npm run test:api` pass.

### Verification checklist:

1. User with labeled mail: matching-email-ids list returns expected Gmail message ids.
2. User with nonexistent label name: matching-email-ids list returns `[]`.
3. Known message id from the id list: body returns non-empty text for a typical Allegro/AliExpress order email.
4. User with `refreshToken = null`: both test routes return auth error (mapped to 401 or 403 with clear message).
5. Simulated `invalid_grant`: DB `refreshToken` cleared; subsequent calls fail until re-login.

## What We're NOT Doing

- OpenRouter / AI parcel extraction — **F-06**
- Sync orchestration, dedupe, parcel upsert, progress UI — **S-02**
- `GmailMessage` / `ParcelEmail` Prisma models — **S-02**
- Merchant sender allowlist filtering — **S-02** (hardcoded Allegro/AliExpress addresses)
- Reading user settings inside `GmailService` — caller or test controller supplies params
- Production sync REST routes (`POST /api/sync`, etc.) — **S-02**
- Real Gmail API e2e tests against live Google — mock client in unit tests only
- Refresh token encryption at rest
- FR-002 disconnect / Google token revocation on logout

## Implementation Approach

Four phases: OAuth plumbing and error types first, then matching id listing, then body retrieval with MIME decoding, then module wiring with test controller and unit tests. `GmailService` owns all Google API interaction; test controller is a thin JWT-protected adapter that resolves label/period (from query or `SettingsService`) and maps `GmailAuthError` to HTTP responses. Test HTTP routes register only when `NODE_ENV !== 'production'`.

## Critical Implementation Details

**invalid_grant vs transient errors:** Only clear `User.refreshToken` when Google's token endpoint returns `invalid_grant`. Do not clear on network errors, 429, or 5xx — those should trigger retry (listing/body) or propagate after retries exhausted.

**Label resolution:** Gmail user labels are matched by **exact name** (case-sensitive per Gmail API). If `users.labels.list` finds no matching `name`, return `[]` without calling `messages.list`.

**Test route query params:** `GET /api/test/matching-email-ids` accepts optional `label` and `scanPeriodDays`. When omitted, test controller loads effective settings via `SettingsService.getEffectiveSettings(user.id)` and passes values to `listMatchingEmailIds`. `GET /api/test/email` requires query param `id` (Gmail message id).

**Gmail list API shape:** `users.messages.list` returns only `id` and `threadId` per message — no headers or snippet on the list endpoint. F-05 listing returns ids only (enough for S-02 dedupe); full content comes from `messages.get` format `full` via `getMessageBody`.

## Phase 1: Dependencies and OAuth plumbing

### Overview

Add `googleapis`, core types, `GmailAuthError`, and a per-user OAuth2 client factory that loads refresh token from Prisma, persists rotated refresh tokens, and clears token on `invalid_grant`.

### Changes Required:

#### 1. Add googleapis dependency

**File**: `apps/api/package.json`

**Intent**: Enable Gmail API client from Node.

**Contract**: Add `googleapis` to `dependencies`; run install from repo root.

#### 2. Gmail types and errors

**File**: `apps/api/src/gmail/types.ts` (new)

**Intent**: Define stable DTOs for S-02/F-06 consumers and a typed auth failure.

**Contract**:
- `type GmailMessageBody = { body: string }`
- `class GmailAuthError extends Error` with optional `cause` — thrown when refresh token missing or Google auth fails permanently.

#### 3. OAuth client factory

**File**: `apps/api/src/gmail/google-oauth-client.factory.ts` (new)

**Intent**: Build a configured `OAuth2Client` for a userId with token lifecycle handling.

**Contract**:
- `createOAuth2ClientForUser(userId: string): Promise<OAuth2Client>` — load `User.refreshToken` via Prisma; if null/empty, throw `GmailAuthError`.
- Set credentials `{ refresh_token }` from env `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` via `ConfigService`.
- Subscribe to `tokens` event: when `refresh_token` present, `prisma.user.update({ where: { id: userId }, data: { refreshToken } })`.
- Wrap token refresh / first API call to catch permanent auth failure: on Gaxios errors where `response?.data?.error === 'invalid_grant'` (or equivalent message), set `refreshToken: null` on user, throw `GmailAuthError`. Do not clear token on other errors.

#### 4. Factory unit tests

**File**: `apps/api/src/gmail/google-oauth-client.factory.spec.ts` (new)

**Intent**: Verify missing token, rotation persistence, and invalid_grant clearing without real Google calls.

**Contract**: Mock `PrismaService` and OAuth2Client / google-auth-library as needed.

### Success Criteria:

#### Automated Verification:

- API lint passes: `npm run lint:api`
- Unit tests pass: `npm run test:api`
- API build passes: `npm run build:api`

#### Manual Verification:

- Factory throws `GmailAuthError` when user has no refresh token in DB

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: Matching email id listing

### Overview

Implement `GmailService.listMatchingEmailIds(userId, labelName, scanPeriodDays)` with label resolution, Gmail search query, paginated `messages.list` (500 cap), and id extraction.

### Changes Required:

#### 1. Gmail list query helper

**File**: `apps/api/src/gmail/build-gmail-list-query.ts` (new)

**Intent**: Pure function for Gmail `q` parameter — testable without API.

**Contract**: `buildGmailListQuery(labelName: string, scanPeriodDays: number): string` returns `label:{labelName} newer_than:{scanPeriodDays}d` (no URL encoding in helper; caller encodes if needed).

#### 2. Label resolution helper

**File**: `apps/api/src/gmail/resolve-gmail-label-id.ts` (new)

**Intent**: Map user-visible label name to Gmail label id for early empty return.

**Contract**: Given `gmail.users.labels.list`, find label where `label.name === labelName` (exact match); return `label.id` or `null` if not found.

#### 3. GmailService.listMatchingEmailIds

**File**: `apps/api/src/gmail/gmail.service.ts` (new)

**Intent**: Paginated Gmail message id listing scoped by label and scan period.

**Contract**:
- Signature: `listMatchingEmailIds(userId: string, labelName: string, scanPeriodDays: number): Promise<string[]>`
- Obtain OAuth client via factory; construct `google.gmail({ version: 'v1', auth })`.
- Resolve label id; if null, return `[]`.
- Call `users.messages.list` with `userId: 'me'`, `q` from helper, `maxResults: 100`, follow `nextPageToken` until no more pages or **500 ids** collected.
- Map each list item to `message.id` (list response includes only `id` and `threadId` per Gmail API — ids are sufficient for S-02 dedupe).
- Retry wrapper: up to 3 attempts with exponential backoff on HTTP 429 and 5xx only.

#### 4. Query helper and service tests

**Files**: `apps/api/src/gmail/build-gmail-list-query.spec.ts`, `apps/api/src/gmail/gmail.service.spec.ts` (new)

**Intent**: Cover query string, empty label, pagination cap, and id mapping with mocked Gmail client.

**Contract**: Mock factory to return stub gmail client; assert cap at 500, `[]` for missing label, ids extracted from list pages.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:api`
- Lint passes: `npm run lint:api`

#### Manual Verification:

- With test route (Phase 4), matching-email-ids returns ids for a mailbox with default `ParcelScrubber` label and recent mail

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Body retrieval

### Overview

Implement `GmailService.getMessageBody(userId, messageId)` with full MIME fetch, plain-text preference, HTML fallback, and transient retries.

### Changes Required:

#### 1. MIME body decoder

**File**: `apps/api/src/gmail/decode-message-body.ts` (new)

**Intent**: Extract readable text from Gmail `messages.get` payload.

**Contract**:
- Walk MIME `parts` recursively; prefer first `text/plain` (base64url decode).
- If no plain part, use first `text/html` and strip tags to plain string (simple regex or lightweight strip — no external HTML parser required for v1).
- If single-part message with `body.data`, decode directly.
- Return empty string only when no decodable content exists (do not throw).

#### 2. Decoder unit tests

**File**: `apps/api/src/gmail/decode-message-body.spec.ts` (new)

**Intent**: Cover plain-only, html-only, multipart nested, and empty payload cases with fixture payloads.

#### 3. GmailService.getMessageBody

**File**: `apps/api/src/gmail/gmail.service.ts`

**Intent**: Fetch one message and return decoded body text.

**Contract**:
- Signature: `getMessageBody(userId: string, messageId: string): Promise<GmailMessageBody>`
- `users.messages.get({ userId: 'me', id: messageId, format: 'full' })`
- Pass `payload` to decoder; return `{ body }`.
- Same retry policy as list (429/5xx, 3× backoff).
- Propagate `GmailAuthError` from factory; 404 from Gmail may map to Nest `NotFoundException` at controller layer only.

#### 4. Service body tests

**File**: `apps/api/src/gmail/gmail.service.spec.ts`

**Intent**: Mock `messages.get` with sample payloads; assert plain preference and HTML fallback.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:api`
- Lint passes: `npm run lint:api`

#### Manual Verification:

- `GET /api/test/email?id=` returns readable text for a known order email in the test mailbox

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Module wiring and test routes

### Overview

Register `GmailModule`, expose test HTTP routes under `/api/test` (non-production only), and complete controller unit tests.

### Changes Required:

#### 1. Gmail module

**File**: `apps/api/src/gmail/gmail.module.ts` (new)

**Intent**: Wire service, factory, and test controller; export service for S-02.

**Contract**:
- Imports: `AuthModule`, `SettingsModule` (test controller reads effective settings when query params omitted).
- Providers: `GmailService`, OAuth factory (or inline in service if kept single file — prefer separate factory per Phase 1).
- Controllers: `GmailTestController` only when `NODE_ENV !== 'production'` (no production sync controller; no test routes in prod builds).
- Exports: `GmailService`.

#### 2. Export SettingsService

**File**: `apps/api/src/settings/settings.module.ts`

**Intent**: Allow `GmailTestController` to inject `SettingsService` when query params are omitted.

**Contract**: Add `exports: [SettingsService]` to `SettingsModule`.

#### 3. Barrel export

**File**: `apps/api/src/gmail/index.ts` (new)

**Intent**: Public API surface for other modules.

**Contract**: Export `GmailModule`, `GmailService`, `GmailMessageBody`, `GmailAuthError`.

#### 4. Test controller

**File**: `apps/api/src/gmail/gmail-test.controller.ts` (new)

**Intent**: Authenticated smoke-test routes for local development.

**Contract**:
- `@Controller('test')` → routes under global prefix `/api/test` (non-production only).
- `@UseGuards(JwtAuthGuard)` on class or each handler.
- Handlers take `@CurrentUser() user: SessionUser` (same pattern as `settings.controller.ts`).
- `GET matching-email-ids`:
  - Query: optional `label` (string), optional `scanPeriodDays` (parse int via `validateScanPeriodDays()` when provided; invalid → `BadRequestException`).
  - If omitted, load from `SettingsService.getEffectiveSettings(user.id)`.
  - Call `gmail.listMatchingEmailIds(user.id, label, scanPeriodDays)`.
  - On `GmailAuthError`, throw `UnauthorizedException` with message indicating Gmail re-auth required.
  - Response: `string[]` of Gmail message ids.
- `GET email`:
  - Query: required `id` (Gmail message id); `BadRequestException` if missing.
  - Call `gmail.getMessageBody(user.id, id)`.
  - Same `GmailAuthError` mapping.
  - Response: `GmailMessageBody`.

#### 5. Register module

**File**: `apps/api/src/app.module.ts`

**Intent**: Activate Gmail feature in the app.

**Contract**: Add `GmailModule` to `imports` array.

#### 6. Controller unit tests

**File**: `apps/api/src/gmail/gmail-test.controller.spec.ts` (new)

**Intent**: Verify guard presence, query param wiring, settings fallback, and error mapping.

**Contract**: Mock `GmailService` and `SettingsService`; override `JwtAuthGuard`; use `supertest` or direct handler calls following `settings.controller.spec.ts` pattern. Cover `@CurrentUser()` wiring, settings fallback, missing/invalid query params, and error mapping.

#### 7. Full workspace verification

**Intent**: Ensure no regressions.

**Contract**: Run monorepo lint and test scripts.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:api`
- Lint passes: `npm run lint:api`
- API build passes: `npm run build:api`
- Monorepo checks pass: `npm run lint && npm run test`

#### Manual Verification:

- Signed in via Google, `GET /api/test/matching-email-ids` returns JSON array of ids (browser or curl with session cookie)
- `GET /api/test/email?id=<id from list>` returns `{ body: "..." }`
- Wrong/missing label returns `[]`
- Logged-out request returns 401

**Implementation Note**: Final manual smoke test with real mailbox before marking F-05 complete.

---

## Testing Strategy

### Unit Tests:

- `build-gmail-list-query.spec.ts` — query string for various labels and day counts
- `decode-message-body.spec.ts` — plain, html-only, multipart fixtures
- `google-oauth-client.factory.spec.ts` — missing token, rotation upsert, invalid_grant clear
- `gmail.service.spec.ts` — list pagination cap, missing label, id extraction with mocked API
- `gmail-test.controller.spec.ts` — auth guard, param/settings fallback, error mapping

### Integration Tests:

- No live Gmail e2e (deferred — same precedent as F-02 OAuth e2e skip)
- No new Prisma schema e2e

### Manual Testing Steps:

1. Sign in with Google (`prompt=consent` ensures refresh token).
2. Ensure test mailbox has user label (default `ParcelScrubber`) on recent Allegro/AliExpress mail.
3. `GET /api/test/matching-email-ids` — confirm ids.
4. Pick an `id` from response; `GET /api/test/email?id=` — confirm body text.
5. Temporarily set scan label to nonexistent name in settings; confirm `[]`.
6. (Optional) Revoke app access in Google account settings; confirm auth error and cleared refresh token in DB.

## Performance Considerations

- Id listing caps at 500 messages to bound worst-case Gmail API calls per sync (~5 paginated `messages.list` calls).
- Body fetch uses `messages.get` format `full` only on demand via `getMessageBody` — not during listing.
- Retry backoff adds latency only on transient failures; do not retry auth errors.

## Migration Notes

No database migrations. Existing users without `refreshToken` must re-authenticate once.

## References

- Roadmap F-05: `context/foundation/roadmap.md`
- PRD Gmail ingestion: `context/foundation/prd.md`
- OAuth implementation: `apps/api/src/auth/strategies/google.strategy.ts`
- Settings pattern: `apps/api/src/settings/settings.controller.ts`
- Archived parcel/Gmail research: `context/archive/2026-06-06-parcel-prisma-model/research.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Dependencies and OAuth plumbing

#### Automated

- [ ] 1.1 API lint passes: `npm run lint:api`
- [ ] 1.2 Unit tests pass: `npm run test:api`
- [ ] 1.3 API build passes: `npm run build:api`

#### Manual

- [ ] 1.4 Factory throws `GmailAuthError` when user has no refresh token in DB

### Phase 2: Matching email id listing

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test:api`
- [ ] 2.2 Lint passes: `npm run lint:api`

#### Manual

- [ ] 2.3 Test route returns matching email ids for labeled mail in scope (after Phase 4 wiring, or via direct service call)

### Phase 3: Body retrieval

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test:api`
- [ ] 3.2 Lint passes: `npm run lint:api`

#### Manual

- [ ] 3.3 Test route returns readable body for known message id

### Phase 4: Module wiring and test routes

#### Automated

- [ ] 4.1 Unit tests pass: `npm run test:api`
- [ ] 4.2 Lint passes: `npm run lint:api`
- [ ] 4.3 API build passes: `npm run build:api`
- [ ] 4.4 Monorepo checks pass: `npm run lint && npm run test`

#### Manual

- [ ] 4.5 `GET /api/test/matching-email-ids` works with session cookie
- [ ] 4.6 `GET /api/test/email?id=` returns body for listed message
- [ ] 4.7 Nonexistent label returns `[]`; logged-out returns 401
