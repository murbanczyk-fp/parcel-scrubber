# Gmail Message Retrieval — Plan Brief

> Full plan: `context/changes/gmail-message-retrieval/plan.md`

## What & Why

Roadmap **F-05** adds a Nest foundation service that calls the Gmail API for the authenticated user: list message metadata scoped by Gmail label and scan period, and fetch full message body by id. S-02 sync and F-06 extraction depend on this layer; F-05 does not write parcels, run AI, or read user settings inside the service itself.

## Starting Point

Google OAuth (F-02) already requests `gmail.readonly` and persists `User.refreshToken` on sign-in. Access tokens are discarded at callback; no `googleapis` dependency or Gmail module exists yet. User settings (F-04/S-01) define default scan label and period but are consumed by callers, not by `GmailService` directly.

## Desired End State

`GmailService` exposes `listMetadata(userId, labelName, scanPeriodDays)` and `getMessageBody(userId, messageId)`. Metadata listing resolves the label, queries `label:{name} newer_than:{days}d`, paginates up to 500 messages, and returns id, threadId, internalDate, from, subject, snippet. Missing label returns `[]`. Body fetch returns plain text (HTML stripped as fallback). Missing or revoked refresh tokens throw `GmailAuthError` (invalid_grant clears the DB token). Authenticated test routes `GET /api/test/emails-metadata` and `GET /api/test/email?id=` wire through for local smoke tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Metadata fields | id, threadId, internalDate, from, subject, snippet | S-02 can filter senders and show progress without body fetch | Plan |
| Body format | Plain text preferred; strip HTML fallback | Covers HTML-only merchant templates for F-06 | Plan |
| Missing refresh token | Throw `GmailAuthError` | S-02 can prompt re-auth instead of silent empty sync | Plan |
| invalid_grant | Clear `User.refreshToken`, then throw | Avoids retry loops on dead tokens | Plan |
| Pagination | Hard cap 500 messages | Safety valve for large labeled mailboxes | Plan |
| Token rotation | Persist new refresh_token when Google returns one | Reduces surprise auth failures | Plan |
| Transient API errors | Retry 429/5xx up to 3× with backoff | Handles quota blips without S-02 custom logic | Plan |
| HTTP surface | Test routes under `/api/test/*` only | Manual verification; production sync HTTP stays in S-02 | Plan |
| Missing label | Return `[]`, no error | Roadmap/PRD contract | Roadmap |
| Settings in service | Caller-supplied params only | F-05 stays decoupled from settings module | Roadmap |

## Scope

**In scope:** `googleapis` dependency; `GmailModule` + `GmailService`; OAuth2 client factory from env + DB refresh token; metadata list + body fetch; `GmailAuthError`; unit tests with mocked Gmail client; `GET /api/test/emails-metadata` and `GET /api/test/email` (JWT-protected).

**Out of scope:** OpenRouter extraction (F-06); sync orchestration, dedupe, parcel writes (S-02); `GmailMessage` Prisma tables (S-02); merchant sender filtering inside F-05; reading settings inside `GmailService`; production sync REST routes; real Gmail e2e against live API.

## Architecture / Approach

```
TestController / S-02 (future)
        │  userId + label/period or messageId
        ▼
   GmailService
        │  load User.refreshToken (Prisma)
        ▼
   OAuth2Client → Gmail API v1
        │  labels.list → resolve label id
        │  messages.list (paginated, cap 500)
        │  messages.get format=full → MIME decode
        ▼
   DTOs: GmailMessageMetadata[] | string (body)
```

Test controller optionally reads effective settings when query params omitted, then passes explicit values to the service.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Auth plumbing | OAuth client factory, `GmailAuthError`, token load/rotation/clear on invalid_grant | Clearing token on non-auth errors |
| 2. Metadata listing | Label resolution, query, pagination cap, metadata DTO | Label name case/spelling mismatch |
| 3. Body retrieval | MIME decode, plain/HTML fallback, retries | Complex multipart MIME edge cases |
| 4. Wiring & test routes | Module registration, `/api/test/*`, unit tests | Test routes leaking to unintended environments |

**Prerequisites:** F-02 OAuth with refresh token stored; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in env.

**Estimated effort:** ~2–3 focused sessions across 4 phases.

## Open Risks & Assumptions

- Users who signed in before `prompt: 'consent'` may lack a refresh token until they re-authenticate.
- HTML-to-text stripping is best-effort; F-06 may still miss fields on exotic templates.
- 500-message cap may truncate very active label mailboxes within the scan period.

## Success Criteria (Summary)

- Authenticated `GET /api/test/emails-metadata` returns metadata for labeled mail in scope (or `[]` when label missing).
- `GET /api/test/email?id=<gmailMessageId>` returns decodable body text for a known message.
- `npm run lint:api && npm run test:api` pass with mocked Gmail client tests.
