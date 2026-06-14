# AI Email Parcel Extraction — Plan Brief

> Full plan: `context/changes/ai-email-parcel-extraction/plan.md`

## What & Why

Roadmap **F-06** adds a Nest foundation service that parses Gmail order/shipment emails into structured parcel fields — tracking number, carrier, optional description — using **OpenRouter** (`openai/gpt-5.4-nano`). S-02 sync depends on this layer to populate parcels after F-05 fetches message content; F-06 does not persist data or orchestrate sync.

## Starting Point

F-05 is complete: `GmailService.getMessage()` returns `GmailMessage` with decoded `from`, `date`, `subject`, and `body`. The Prisma `Carrier` enum and parcel helpers exist for downstream mapping. No OpenRouter code, env consumption, or extraction module exists yet — only `OPENROUTER_API_KEY` in `.env.example`.

## Desired End State

`ExtractionService.extractParcelFields(message)` returns `{ store, trackingNumber, carrier, customCarrierLabel, description }`. **`store`** is set deterministically from `message.from` via hardcoded merchant addresses (Allegro / AliExpress — not AI). AI fields come from OpenRouter JSON-schema output. Missing tracking returns null AI fields without throwing; `store` is still set when `From` matches. Non-prod route `GET /api/test/extract?id=` returns `{ message, result }`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| No tracking found | Return null fields, no throw | S-02 skips cleanly without per-message try/catch | Plan |
| Store detection | Hardcoded `From` addresses | Deterministic, no AI cost; matches PRD v1 merchants | Plan |
| Allegro senders | `powiadomienia@allegro.pl`, `powiadomienia@allegromail.pl` | User-specified v1 addresses | Plan |
| AliExpress sender | `transaction@notice.aliexpress.com` | User-specified v1 address | Plan |
| Carrier selection | Model picks `Carrier` enum from prompt list | AI normalizes variants (In-Post, InPost); app only validates | Plan |
| Default model | `openai/gpt-5.4-nano` | User choice; cost/latency friendly for sync batches | Plan |
| Model override | Optional `OPENROUTER_MODEL` env | Switch to mini without code change if recall misses target | Plan |
| API failures | Retry 429/5xx (3×), then `ExtractionError` | Matches F-05 transient retry pattern | Plan |
| Dev verification | `GET /api/test/extract?id=` returns `{ message, result }` | Shows raw Gmail input and extraction side by side for debugging | Plan |
| Body size | Full decoded body, no truncation | Avoid losing footer tracking info in merchant templates | Plan |
| LLM output | JSON schema structured output | Reliable parsing vs freeform JSON | Plan |
| Description | Optional; null when unclear | Matches PRD without forcing filler text | Plan |
| orderDate | Out of F-06 | FR-005 — S-02 uses Gmail `date` | Roadmap |

## Scope

**In scope:** `ExtractionModule` + `ExtractionService`; hardcoded store detection from `From`; OpenRouter HTTP client; `CARRIER_PROMPT_OPTIONS` + carrier validation; `ExtractionError`; retry helper; JSON-schema prompt; non-prod `GET /api/test/extract`; unit tests with mocked fetch and merchant fixtures.

**Out of scope:** Parcel writes, dedupe, sync UI (S-02); `orderDate`; tracking URL building; `normalizeTrackingNumber` on output; heuristic body parser; live OpenRouter in CI; body truncation.

## Architecture / Approach

```
S-02 (future) / TestController
        │  GmailMessage (from F-05)
        ▼
   ExtractionService
        │  detectStoreFromSender(from) → store
        │  OpenRouter (subject + body) → AI fields
        ▼
   validateExtractedFields + merge store
        ▼
   ExtractedParcelFields
```

Test route: `GET /api/test/extract?id=` → `GmailService.getMessage` → `ExtractionService.extractParcelFields` → `{ message: GmailMessage, result: ExtractedParcelFields }`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation | Types, store detection, carrier validation, retry | `From` header parse misses angle-bracket form |
| 2. OpenRouter & service | HTTP client, prompt/schema, `extractParcelFields` | Model returns invalid JSON despite schema |
| 3. Wiring & dev route | Module registration, chained test endpoint | Test route leaking to production |
| 4. Fixtures & regression | Sanitized merchant fixtures, expanded tests | Fixture drift vs live email templates |

**Prerequisites:** F-05 done; `OPENROUTER_API_KEY` in `.env.local`; signed-in user with Gmail refresh token for manual route testing.

**Estimated effort:** ~2–3 focused sessions across 4 phases.

## Open Risks & Assumptions

- HTML-stripped bodies from F-05 may lose table layout; recall depends on model reading plain text well enough for ≥75% target.
- `openai/gpt-5.4-nano` model id must exist on OpenRouter at implement time — verify against OpenRouter model list; override via env if renamed.
- JSON schema constrains `carrier` to enum values; if model still returns invalid structure after schema, validator throws `ExtractionError` (distinct from null-tracking miss).
- JSON schema enum support varies by model; if nano rejects strict enum schema, relax to string + validator-only (not planned unless hit during Phase 2 manual check).

## Success Criteria (Summary)

- `/api/test/extract?id=` returns `{ message, result }` with correct `store`, tracking, and carrier for Allegro and AliExpress emails.
- Non-shipment emails return null tracking without error.
- `npm run lint:api && npm run test:api` pass with mocked OpenRouter.
- S-02 can inject `ExtractionService` and call `extractParcelFields(gmailMessage)` without Gmail or settings coupling inside F-06.
