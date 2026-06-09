# AI Email Parcel Extraction Implementation Plan

## Overview

Ship roadmap **F-06**: a Nest foundation `ExtractionService` that accepts a `GmailMessage` from F-05 and returns structured parcel fields — **store** (from hardcoded `From` address matching), tracking number, carrier, optional description — with AI fields via **OpenRouter** using **`openai/gpt-5.4-nano`** (configurable). Includes a non-production **test HTTP route** that chains Gmail fetch + extraction for local smoke verification. No parcel persistence, dedupe, sync orchestration, or settings reads inside the service layer.

## Current State Analysis

**Gmail (F-05):** Complete. `GmailService.getMessage(userId, messageId)` returns `GmailMessage` `{ from, date, subject, body }` with decoded plain text (HTML stripped as fallback). Exported from `GmailModule`.

**OpenRouter:** Not implemented. `.env.example` reserves `OPENROUTER_API_KEY`; no code reads it. This is the first non-Google external HTTP integration in the API.

**Parcel model:** Prisma `Carrier` enum and `Parcel.store String?` exist for S-02 downstream. F-06 sets `store` deterministically from the Gmail `From` header (hardcoded merchant addresses — not AI). F-06 asks the model to pick a `Carrier` value directly (prompt lists allowed options); the app validates enum membership and CUSTOM label rules.

**Nest patterns:** Feature folders under `apps/api/src/<feature>/` with module, service, co-located `*.spec.ts`, barrel `index.ts`, registration in `AppModule`. Non-prod test controllers gated by `NODE_ENV !== 'production'` (see `gmail.module.ts`).

### Key Discoveries:

- Input contract: `apps/api/src/gmail/types.ts` — `GmailMessage` is the sole F-06 input type
- Retry pattern: `apps/api/src/gmail/retry-transient-gmail-api-call.ts` — 3 attempts, 429/5xx, exponential backoff
- Test route pattern: `apps/api/src/gmail/gmail-test.controller.ts` — JWT-protected `/api/test/*`, maps `GmailAuthError` → 401
- FR-005 split: `orderDate` comes from Gmail `date` in S-02, not from F-06 extraction
- PRD extraction quality target (≥75% recall) is validated manually via test route + fixtures before S-02

## Desired End State

After F-06, a signed-in user with valid Gmail credentials and `OPENROUTER_API_KEY` configured can:

1. Call `GET /api/test/extract?id=<gmailMessageId>` and receive `{ message, result }` — the exact `GmailMessage` from `getMessage` plus the extracted parcel fields.
2. Receive `{ store, trackingNumber: null, carrier: CUSTOM, customCarrierLabel: null, description: null }` when the email contains no extractable shipment (no exception thrown); `store` is still set when `From` matches a known merchant address.
3. Receive a distinguishable error when OpenRouter fails after retries (`ExtractionError` → HTTP 502 or 503 from test route).

`ExtractionService.extractParcelFields(message: GmailMessage)` is exported from `ExtractionModule` for S-02 orchestration. `npm run lint:api && npm run test:api` pass with mocked OpenRouter HTTP.

### Verification checklist:

1. Allegro shipping notification email (`From` contains `powiadomienia@allegro.pl` or `powiadomienia@allegromail.pl`): returns `store: "Allegro"`, tracking number, and carrier (e.g. `INPOST`).
2. AliExpress email (`From` contains `transaction@notice.aliexpress.com`): returns `store: "AliExpress"` and extracted fields.
3. Non-shipment email in label: returns null tracking fields without throwing; `store` set if `From` matches a known merchant.
4. Unknown `From` address: returns `store: null` (S-02 may skip before or after extraction).
5. Missing `OPENROUTER_API_KEY`: service throws at startup or first call with clear config error.
6. Simulated OpenRouter 429/5xx: retries up to 3×, then throws `ExtractionError`.
7. Unknown carrier in email: model returns `CUSTOM` with non-empty `customCarrierLabel`.
8. Invalid model output (e.g. `CUSTOM` without label, or carrier not in enum): throws `ExtractionError`.

## What We're NOT Doing

- Parcel persistence, dedupe, upsert — **S-02**
- Sync orchestration, progress UI — **S-02**
- Pre-sync sender filtering logic — **S-02** may reuse exported merchant address constants from F-06 but orchestration stays in S-02
- `orderDate` extraction or parsing — **S-02** uses Gmail `date` per FR-005
- `normalizeTrackingNumber()` — **S-02** applies on persist
- Tracking URL generation — **S-02** / read-time via `resolveTrackingUrl()`
- Real OpenRouter calls in CI unit tests — mock `fetch` only
- Body truncation — full decoded body sent to model
- Heuristic/regex fallback parser — OpenRouter JSON schema only in v1
- Model fallback chain (nano → mini on miss) — single model per call; override via env only

## Implementation Approach

Four phases: foundation types, store detection, and carrier validation first, then OpenRouter HTTP client and extraction service, then module wiring with chained test route, then unit tests with realistic fixtures. `ExtractionService` combines deterministic `store` from `message.from` with OpenRouter AI fields — no Gmail API calls inside the service (test controller chains `GmailService` + `ExtractionService`). Test HTTP routes register only when `NODE_ENV !== 'production'`.

## Critical Implementation Details

**OpenRouter request shape:** Use the OpenAI-compatible chat completions endpoint (`https://openrouter.ai/api/v1/chat/completions`) with `response_format: { type: 'json_schema', json_schema: { ... } }`. The JSON schema constrains `carrier` to the Prisma `Carrier` enum values (`INPOST`, `POCZTA_POLSKA`, `DPD`, `DHL`, `CUSTOM`). The system prompt lists each allowed carrier with common Polish variants (e.g. InPost / Paczkomaty → `INPOST`; In-Post misspellings normalized by the model, not app code). Fields: `trackingNumber`, `carrier`, `customCarrierLabel`, `description`. Include `from` and `subject` in the user message for disambiguation; send full `body` without truncation.

**Store detection (app-side, not AI):** Parse the email address from `GmailMessage.from` (handles `Name <addr@domain>` and bare addresses; compare case-insensitively). Hardcoded map:

| Email address | `store` value |
| --- | --- |
| `powiadomienia@allegro.pl` | `"Allegro"` |
| `powiadomienia@allegromail.pl` | `"Allegro"` |
| `transaction@notice.aliexpress.com` | `"AliExpress"` |

Unmatched → `store: null`. Export constants (`MERCHANT_SENDER_EMAILS` or per-store lists) so S-02 can reuse the same allowlist for pre-filtering if desired. **S-02** should persist `result.store` from F-06 rather than re-detecting from `From`.

**Carrier validation (app-side):** After parsing LLM JSON, validate — do not alias-map. `carrier` must be a known enum member (schema should enforce this; validator is defense-in-depth). When `carrier === CUSTOM`, `customCarrierLabel` must be non-empty after trim. When `carrier !== CUSTOM`, `customCarrierLabel` must be `null` (clear if model sent one). Violations throw `ExtractionError`.

**Null-result contract:** When the model returns empty/null tracking number, return structured nulls — do not throw. Check tracking number **before** `validateExtractedFields` so non-shipment responses that include invalid carrier noise (e.g. `CUSTOM` without label) still succeed. S-02 treats null tracking as skip. Apply `trim` on string fields; empty strings become `null`.

**Config:** `OPENROUTER_API_KEY` required via `ConfigService.getOrThrow`. Optional `OPENROUTER_MODEL` defaults to `openai/gpt-5.4-nano`. Missing key should fail clearly before silent empty syncs in S-02.

## Phase 1: Foundation — types, store detection, carrier validation, retry

### Overview

Scaffold the extraction feature folder with public types, error class, hardcoded store detection from `From`, post-LLM validation helper, transient HTTP retry helper, and env config accessors.

### Changes Required:

#### 1. Extraction types and errors

**File**: `apps/api/src/extraction/types.ts` (new)

**Intent**: Define the stable output contract for S-02 and a typed failure for OpenRouter errors.

**Contract**:
- `type MerchantStore = 'Allegro' | 'AliExpress'`
- `ExtractedParcelFields = { store: MerchantStore | null; trackingNumber: string | null; carrier: Carrier; customCarrierLabel: string | null; description: string | null }` — import `Carrier` from `@prisma/client`
- `AiExtractedFields = Omit<ExtractedParcelFields, 'store'>` — AI-only fields before store merge
- `ExtractTestResponse = { message: GmailMessage; result: ExtractedParcelFields }` — test-route response only; import `GmailMessage` from `../gmail/types`
- `class ExtractionError extends Error` with optional `cause` — thrown when OpenRouter fails after retries or LLM response cannot be parsed/validated

#### 2. Store detection from sender

**File**: `apps/api/src/extraction/detect-store-from-sender.ts` (new)

**Intent**: Deterministically set `store` from the Gmail `From` header — no AI, no network.

**Contract**:
- `detectStoreFromSender(fromHeader: string): MerchantStore | null`
- `parseEmailAddressFromHeader(fromHeader: string): string | null` — extract bare email from RFC5322 `From` (angle-bracket form, quoted display name, or bare address); lowercase for comparison
- Hardcoded address lists (export for S-02 reuse):
  - Allegro: `powiadomienia@allegro.pl`, `powiadomienia@allegromail.pl`
  - AliExpress: `transaction@notice.aliexpress.com`
- Exact email match after parse + lowercase; no subdomain wildcards

#### 3. Carrier validation helper

**File**: `apps/api/src/extraction/validate-extracted-fields.ts` (new)

**Intent**: Validate and normalize LLM output — no alias mapping; the model picks the enum value, the app checks structural rules.

**Contract**:
- `validateExtractedFields(raw: { trackingNumber?: unknown; carrier?: unknown; customCarrierLabel?: unknown; description?: unknown }): AiExtractedFields`
- `carrier` must be one of `Carrier` enum values; otherwise throw `ExtractionError`
- When `carrier === CUSTOM`: `customCarrierLabel` required (non-empty after trim); otherwise throw `ExtractionError`
- When `carrier !== CUSTOM`: force `customCarrierLabel` to `null` (ignore model-provided label)
- Trim string fields; empty strings → `null` for optional fields
- Export `CARRIER_PROMPT_OPTIONS` — constant array of `{ value: Carrier; label: string; hints: string[] }` used by both prompt text and JSON schema enum (single source of truth for allowed carriers)

#### 4. Transient retry helper

**File**: `apps/api/src/extraction/retry-transient-openrouter-call.ts` (new)

**Intent**: Mirror F-05 retry semantics for OpenRouter HTTP failures.

**Contract**:
- `retryTransientOpenRouterCall<T>(operation: () => Promise<T>): Promise<T>` — max 3 attempts, retry on HTTP 429 and ≥500, exponential backoff from 250ms base
- Do not retry 4xx except 429; do not retry JSON parse / schema validation failures

#### 5. Store detection, validation, and retry unit tests

**Files**: `apps/api/src/extraction/detect-store-from-sender.spec.ts`, `apps/api/src/extraction/validate-extracted-fields.spec.ts`, `apps/api/src/extraction/retry-transient-openrouter-call.spec.ts` (new)

**Intent**: Lock store detection, validation rules, and retry behavior without OpenRouter calls.

**Contract**: Cover each merchant address (including `Display Name <email>` forms); unknown sender → `null`; each enum carrier accepted; `CUSTOM` with/without label; invalid carrier → `ExtractionError`; retry exhaustion.

### Success Criteria:

#### Automated Verification:

- API lint passes: `npm run lint:api`
- Unit tests pass: `npm run test:api -- --testPathPattern=extraction`

#### Manual Verification:

- Hardcoded merchant addresses match PRD v1 Allegro/AliExpress senders
- `CARRIER_PROMPT_OPTIONS` lists all five enum values with human-readable hints for the prompt

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: OpenRouter client and extraction service

### Overview

Implement the HTTP client for OpenRouter chat completions with JSON-schema structured output and the core `ExtractionService.extractParcelFields` method.

### Changes Required:

#### 1. OpenRouter client

**File**: `apps/api/src/extraction/openrouter-client.ts` (new)

**Intent**: Encapsulate authenticated HTTP calls to OpenRouter with structured JSON response.

**Contract**:
- Injectable or plain factory accepting `ConfigService`
- `completeStructuredJson(systemPrompt: string, userContent: string, schema: object): Promise<Record<string, unknown>>`
- Headers: `Authorization: Bearer ${OPENROUTER_API_KEY}`, `Content-Type: application/json`, optional `HTTP-Referer` / `X-Title` per OpenRouter docs
- Wrap fetch in `retryTransientOpenRouterCall`
- On non-2xx after retries, throw `ExtractionError` with status and body snippet
- Parse `choices[0].message.content` as JSON; on parse failure throw `ExtractionError`

#### 2. Extraction prompt and schema

**File**: `apps/api/src/extraction/extraction-prompt.ts` (new)

**Intent**: Centralize system prompt and JSON schema so prompt tuning does not scatter across the service.

**Contract**:
- System prompt instructs: extract Polish e-commerce shipment emails (Allegro, AliExpress); return null/empty tracking when no shipment; pick `carrier` from the allowed list (rendered from `CARRIER_PROMPT_OPTIONS` with hints like "InPost, Paczkomaty, In-Post → INPOST"); use `CUSTOM` + `customCarrierLabel` only for carriers outside the list; `description` only when clearly present
- JSON schema fields: `trackingNumber` (string|null), `carrier` (enum of `Carrier` values), `customCarrierLabel` (string|null), `description` (string|null)
- Schema `carrier` enum built from `CARRIER_PROMPT_OPTIONS` so prompt and schema stay in sync

#### 3. Extraction service

**File**: `apps/api/src/extraction/extraction.service.ts` (new)

**Intent**: Public API for S-02 — given email content, return store + validated AI parcel fields.

**Contract**:
- `@Injectable()` class with constructor injecting OpenRouter client (or ConfigService)
- `extractParcelFields(message: GmailMessage): Promise<ExtractedParcelFields>`
- **First** call `detectStoreFromSender(message.from)` — always included in result
- Build OpenRouter user content from `message.subject`, `message.body` (and `message.from` only if useful for disambiguation in prompt — store is not AI-derived)
- Parse OpenRouter JSON; if `trackingNumber` is null/empty after trim → return `{ store, trackingNumber: null, carrier: CUSTOM, customCarrierLabel: null, description: null }` immediately (preserve detected `store`; skip validation so model noise like `CUSTOM` without label on non-shipment emails does not throw)
- Otherwise pass JSON through `validateExtractedFields`; merge with `{ store }`

#### 4. OpenRouter client and service unit tests

**Files**: `apps/api/src/extraction/openrouter-client.spec.ts`, `apps/api/src/extraction/extraction.service.spec.ts` (new)

**Intent**: Verify HTTP handling, schema parsing, null-on-miss, and carrier mapping with mocked `fetch`.

**Contract**: Fixtures with realistic Allegro InPost and AliExpress DHL body snippets and matching `from` headers; mock OpenRouter returning enum `carrier` values; assert `store` + validated AI fields; assert null tracking contract preserves `store`; assert `ExtractionError` on invalid CUSTOM and on 500 after retries.

### Success Criteria:

#### Automated Verification:

- API lint passes: `npm run lint:api`
- Unit tests pass: `npm run test:api -- --testPathPattern=extraction`

#### Manual Verification:

- With real `OPENROUTER_API_KEY` in `.env.local`, a one-off script or Phase 3 test route returns sensible fields for a saved Allegro fixture body

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Module wiring and dev test route

### Overview

Register `ExtractionModule` in the app and add a JWT-protected test route that chains Gmail message fetch with extraction.

### Changes Required:

#### 1. Extraction module

**File**: `apps/api/src/extraction/extraction.module.ts` (new)

**Intent**: Wire providers and conditionally register test controller.

**Contract**:
- `imports: [AuthModule, GmailModule]` — `AuthModule` for `JwtAuthGuard` on test controller; `GmailModule` for `GmailService` in test controller only; neither injected into `ExtractionService`
- `providers: [ExtractionService, OpenRouterClient]` (or equivalent)
- `exports: [ExtractionService]`
- Test controllers array empty when `NODE_ENV === 'production'` (same pattern as `GmailModule`)

#### 2. Barrel export

**File**: `apps/api/src/extraction/index.ts` (new)

**Intent**: Public exports for other modules.

**Contract**: Export `ExtractionModule`, `ExtractionService`, `ExtractionError`, `ExtractedParcelFields`, `ExtractTestResponse`

#### 3. Test-only response type

**File**: `apps/api/src/extraction/types.ts`

**Intent**: Document that `ExtractTestResponse` (defined in Phase 1 types) is the test-route return shape — no additional fields beyond `{ message, result }`.

**Contract**: `ExtractTestResponse` re-exported if needed; test controller return type annotated as `Promise<ExtractTestResponse>`.

#### 4. Test controller

**File**: `apps/api/src/extraction/extraction-test.controller.ts` (new)

**Intent**: Local smoke test — fetch Gmail message by id, run extraction, return both the fetched message and extraction result.

**Contract**:
- `@Controller('test')`, `@UseGuards(JwtAuthGuard)`
- `GET extract?id=<gmailMessageId>` — require non-empty `id`; call `gmail.getMessage(user.id, id)` then `extraction.extractParcelFields(message)`; return `ExtractTestResponse`:

```typescript
{
  message: gmailMessage,  // exact GmailService.getMessage result
  result: extractedFields // ExtractedParcelFields
}
```

- Map `GmailAuthError` → `UnauthorizedException` (same as `GmailTestController`)
- Map `ExtractionError` → `ServiceUnavailableException` or `BadGatewayException` with safe message

#### 5. App module registration

**File**: `apps/api/src/app.module.ts`

**Intent**: Make extraction service available application-wide.

**Contract**: Add `ExtractionModule` to `imports` array.

#### 6. Test controller spec

**File**: `apps/api/src/extraction/extraction-test.controller.spec.ts` (new)

**Intent**: Verify route wiring, auth guard, required `id` param, combined response shape, and error mapping with mocked services.

**Contract**: Mock `GmailService` and `ExtractionService`; assert chain call order; assert response `{ message, result }` echoes mocked `GmailMessage` and `ExtractedParcelFields`; assert 401 on `GmailAuthError`.

### Success Criteria:

#### Automated Verification:

- API lint passes: `npm run lint:api`
- Unit tests pass: `npm run test:api`

#### Manual Verification:

- Signed in locally with `OPENROUTER_API_KEY` set: `GET /api/test/extract?id=<known-allegro-message-id>` returns `{ message: { from, date, subject, body }, result: { trackingNumber, carrier, ... } }`
- Same route with non-shipment message id returns full `message` plus `result` with null tracking fields

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Fixture hardening and regression tests

### Overview

Add committed email body fixtures from real merchant templates (sanitized) and expand test coverage for edge cases called out in the PRD quality target.

### Changes Required:

#### 1. Test fixtures

**File**: `apps/api/src/extraction/fixtures/` (new directory)

**Intent**: Reusable sanitized email bodies for unit tests and manual spot checks.

**Contract**: At least 3 fixtures — Allegro/InPost shipment, AliExpress/DHL shipment, non-shipment marketing email — as `{ from, subject, body }` matching `GmailMessage` (include realistic `from` values for store detection).

#### 2. Expanded service tests

**File**: `apps/api/src/extraction/extraction.service.spec.ts`

**Intent**: Regression coverage for fixture set and HTML-stripped-body edge cases.

**Contract**: Each fixture asserts expected `trackingNumber` prefix/format and `carrier`; non-shipment asserts full null contract.

#### 3. README env note

**File**: `README.md`

**Intent**: Document `OPENROUTER_MODEL` override — README already mentions `OPENROUTER_API_KEY` but not the model default.

**Contract**: Add one line noting default model `openai/gpt-5.4-nano` and optional `OPENROUTER_MODEL` env var.

### Success Criteria:

#### Automated Verification:

- Full API test suite passes: `npm run test:api`
- Full monorepo lint passes: `npm run lint`

#### Manual Verification:

- Spot-check 2–3 real labeled emails via `/api/test/extract` and confirm ≥75% have correct tracking + carrier (informal recall check before S-02)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `detectStoreFromSender` — each hardcoded address, display-name wrapper, unknown → null
- `validateExtractedFields` — enum acceptance, CUSTOM label required, non-CUSTOM clears label, invalid carrier throws
- `retryTransientOpenRouterCall` — retry count, backoff, non-retryable errors
- `OpenRouterClient` — mocked fetch: success JSON, 429 then success, 500 exhaustion, malformed JSON
- `ExtractionService` — fixture-driven extraction; `store` from `from` header; null-on-miss preserves `store`; description present vs absent
- `ExtractionTestController` — param validation, Gmail→extract chain, `{ message, result }` response shape, error HTTP mapping

### Integration Tests:

- None against live OpenRouter in CI — manual only with real API key

### Manual Testing Steps:

1. Set `OPENROUTER_API_KEY` in `.env.local`; restart API.
2. Sign in via Google; label a known Allegro shipment email with `ParcelScrubber`.
3. `GET /api/test/matching-email-ids` → pick a message id.
4. `GET /api/test/extract?id=<id>` → verify `message` matches `GET /api/test/email?id=<id>` and `result` has expected tracking + carrier.
5. Repeat with a non-shipment email in the same label → verify `message` present and `result.trackingNumber` is null.
6. Temporarily set invalid API key → verify clear error (not silent null).

## Performance Considerations

- One OpenRouter call per message; no batching in F-06 (S-02 loops sequentially or with concurrency — out of scope here).
- Full body may be large for HTML-heavy emails; acceptable for v1 given PRD quality target. Monitor token usage during manual recall check.
- Retry adds up to ~1.75s backoff on transient failures — acceptable for background sync context.

## Migration Notes

No database migrations. Add `OPENROUTER_API_KEY` to local `.env.local` and production `.env` before enabling S-02.

Optional: add `OPENROUTER_MODEL=openai/gpt-5.4-mini` to override nano if recall check fails.

## References

- Roadmap F-06: `context/foundation/roadmap.md`
- PRD FR-004, FR-005: `context/foundation/prd.md`
- F-05 plan brief (input contract): `context/archive/2026-06-08-gmail-message-retrieval/plan-brief.md`
- Gmail types: `apps/api/src/gmail/types.ts`
- Carrier enum: `apps/api/prisma/schema.prisma`
- Retry pattern: `apps/api/src/gmail/retry-transient-gmail-api-call.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Foundation — types, store detection, carrier validation, retry

#### Automated

- [ ] 1.1 API lint passes: `npm run lint:api`
- [ ] 1.2 Unit tests pass: `npm run test:api -- --testPathPattern=extraction`

#### Manual

- [ ] 1.3 Hardcoded merchant addresses match PRD v1 Allegro/AliExpress senders
- [ ] 1.4 `CARRIER_PROMPT_OPTIONS` lists all enum values with hints for the OpenRouter prompt

### Phase 2: OpenRouter client and extraction service

#### Automated

- [ ] 2.1 API lint passes: `npm run lint:api`
- [ ] 2.2 Unit tests pass: `npm run test:api -- --testPathPattern=extraction`

#### Manual

- [ ] 2.3 With real `OPENROUTER_API_KEY`, extraction returns sensible fields for a saved Allegro fixture body

### Phase 3: Module wiring and dev test route

#### Automated

- [ ] 3.1 API lint passes: `npm run lint:api`
- [ ] 3.2 Unit tests pass: `npm run test:api`

#### Manual

- [ ] 3.3 `GET /api/test/extract?id=<allegro-id>` returns `{ message, result }` with `result.store: "Allegro"`, tracking number, and carrier
- [ ] 3.4 Non-shipment Allegro message returns `result.store: "Allegro"` and null tracking in `result`

### Phase 4: Fixture hardening and regression tests

#### Automated

- [ ] 4.1 Full API test suite passes: `npm run test:api`
- [ ] 4.2 Full monorepo lint passes: `npm run lint`

#### Manual

- [ ] 4.3 Spot-check 2–3 real labeled emails via `/api/test/extract`; informal ≥75% recall on tracking + carrier
