# User Settings Page — Plan Brief

> Full plan: `context/changes/user-settings-page/plan.md`

## What & Why

Users must configure Gmail sync scope — scan label and scan period — before north-star sync (S-02) runs. FR-017 requires a settings page with PRD defaults (`ParcelScrubber`, 30 days). S-01 wires the F-04 persistence layer to REST + Angular UI so the first Sync never scans the full mailbox.

## Starting Point

F-04 landed `UserSetting` Prisma model and pure helpers (`resolveEffectiveSettings`, validation, serialization) with schema e2e — but no REST routes or form. The web app has `/settings` behind `authGuard` with a PrimeNG card placeholder. `AuthService` defines the HTTP + signals pattern; this slice adds the app's first data-entry form.

## Desired End State

A signed-in user opens Settings, sees effective values (defaults when unset), edits label and period with live validation, clicks Save, gets a success toast, and sees values persist across refresh. Invalid input shows field-level errors from client validators and structured API 400 responses. S-02 can read the same settings without retrofit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Save UX | Explicit Save button | Clear intent for a 2-field form; one PATCH per action | Plan |
| Reset UI | None — manual retype | Simplest markup; defaults shown on first load | Plan |
| PATCH semantics | Partial body (dirty keys only) | Matches REST convention and F-04 per-key upsert | Plan |
| Scan period help | Clarify search depth only | Prevents FR-006 confusion (period ≠ auto-archive) | Plan |
| Client validation | Live as user types | Immediate feedback; Save disabled when invalid | Plan |
| Success feedback | PrimeNG Toast | Visible confirmation; first toast in app | Plan |
| API errors | Field-level structured 400 | Actionable errors under matching inputs | Plan |
| API testing | Controller unit tests + mocked Prisma | Fast; proves service/controller logic without new HTTP e2e | Plan |

## Scope

**In scope:**
- Nest `SettingsModule`: `GET`/`PATCH /api/settings` with `JwtAuthGuard`
- Structured validation errors mapped from F-04 helpers
- Angular `SettingsService` + settings page component (replaces placeholder)
- Reactive form: `gmailScanLabel`, `scanPeriodDays`, live validators, explicit Save
- Toast infrastructure (shell host + save success)
- Unit tests (API service/controller, web service/component)

**Out of scope:**
- Gmail sync (S-02), merchant sender settings, reset-to-default controls
- Schema/migration changes, dedicated HTTP e2e, auto-save
- Additional settings keys beyond label + period

## Architecture / Approach

```
Browser (/settings) → SettingsService → PATCH/GET /api/settings
                              ↓
                    SettingsController (JwtAuthGuard)
                              ↓
                    SettingsService → Prisma userSetting upsert/findMany
                              ↓
                    F-04 helpers (validate, serialize, resolveEffectiveSettings)
```

Angular sends only dirty fields on Save. API validates present keys, upserts rows, returns full effective document. Zero DB rows → PRD defaults on read.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Settings API | GET/PATCH routes, structured 400s, unit tests | First `BadRequestException` pattern — must match Angular error mapping |
| 2. Settings Page UI | Form, service, route swap, field errors | First reactive form — validator bounds must mirror F-04 exactly |
| 3. Toast & Verification | MessageService, shell toast host, full lint/test | Toast provider wiring in tests |

**Prerequisites:** F-01 (layout), F-02 (auth), F-04 (settings model) — all done  
**Estimated effort:** ~2–3 focused sessions across 3 phases

## Open Risks & Assumptions

- F-04 validation bounds (label ≤100, period 1–365) are authoritative — UI must not diverge
- No HTTP e2e for settings REST — manual authenticated check required in phase 1
- Toast is new infrastructure; shell test bed may need `MessageService` provider
- User without prior settings rows is the common case until first Save

## Success Criteria (Summary)

- Signed-in user configures and persists Gmail scan label and scan period from `/settings`
- PRD defaults apply when no rows exist; partial PATCH updates only changed keys
- Invalid input blocked client-side and rejected server-side with field-level errors
- `npm run lint && npm run test` pass; S-02 can consume `GET /api/settings`
