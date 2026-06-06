# User Settings Model — Plan Brief

> Full plan: `context/changes/user-settings-model/plan.md`

## What & Why

Parcel Scrubber sync must query Gmail by a user-configurable label and scan period — not the whole mailbox. F-04 lands the PostgreSQL persistence layer for those settings (and future ones) before the settings UI (S-01) and Gmail sync (S-02) ship, so scoped import is never retrofitted.

## Starting Point

The API has Prisma with `User` and `Parcel` models, OAuth sign-in, and a `/settings` placeholder in the web app — but no settings table, helpers, or API routes. F-03 established the foundation pattern this slice follows.

## Desired End State

Developers run migrations and get a `user_settings` key–value table (`userId`, `settingKey`, `settingValue`). Pure helpers define known keys, PRD defaults, validation, and `resolveEffectiveSettings(rows)` — zero rows means defaults apply. No row is stored until the user changes a setting (S-01). Schema integration e2e proves constraints; CI runs it on every PR. No REST or UI yet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Storage shape | Key–value rows (`settingKey` + `settingValue`) | New settings need no migration; versatile and common | Plan |
| Value typing | All values stored as strings | Generic schema; known keys parsed/validated in app layer | Plan |
| Defaults | App layer only via `DEFAULT_USER_SETTINGS` | No DB row until user changes something — lazy storage | Plan |
| Row lifecycle | No row until first save (S-01); reset keeps row | New users have zero rows; after first save, upsert always — reset to default stores default value, no delete | Plan |
| Validation bounds | Label non-empty ≤100 chars; period 1–365 days | Enforced on save in helpers; not in DB | Plan |
| F-04 scope | Schema + helpers + e2e only | Matches F-03 foundation pattern; S-01 owns REST + UI | Plan |
| Domain helpers | Keys registry, resolve, parse/serialize, validate | S-01/S-02 import one module; mirrors `apps/api/src/parcels/` | Plan |
| Integration tests | Dedicated `user-settings-schema.e2e-spec.ts` | Isolated ownership; shared truncate helper with parcel e2e | Plan |

## Scope

**In scope:**
- Prisma `UserSetting` key–value model + migration
- Domain helpers: `USER_SETTING_KEYS`, `DEFAULT_USER_SETTINGS`, `resolveEffectiveSettings`, parse/serialize, validation
- Unit tests for helpers; schema integration e2e; shared truncate helper

**Out of scope:**
- REST routes / Nest `SettingsModule` (S-01)
- Angular settings form (S-01)
- Gmail sync consuming settings (S-02)
- Auth service changes
- Merchant sender configuration (Gmail filters)

## Architecture / Approach

```
User 1──* UserSetting
              ├── settingKey:   'gmailScanLabel'  →  settingValue: 'MyLabel'
              └── settingKey:   'scanPeriodDays' →  settingValue: '60'

(no rows) → resolveEffectiveSettings([]) → { gmailScanLabel: 'ParcelScrubber', scanPeriodDays: 30 }
```

Schema-first following F-03 conventions. Helpers are framework-agnostic TypeScript. E2e uses raw `PrismaClient` against test Postgres.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Prisma Schema & Migration | `user_settings` key–value table, client gen | Composite unique index naming |
| 2. Domain Helpers | Keys registry, resolve, parse, validate + unit tests | Parse errors on corrupt stored values |
| 3. Schema Integration E2e | Shared truncate + integration tests | Truncate order with new table |

**Prerequisites:** Local or CI Postgres; F-03 parcel schema migrated  
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- Corrupt `settingValue` in DB (manual edit) falls back to PRD default per key on read via `parseSettingValue`; save path throws.
- S-01 upserts on every save, including reset-to-default — row stays; no delete-on-reset logic needed.
- Unknown keys in DB are ignored by `resolveEffectiveSettings` until a future slice registers them.

## Success Criteria (Summary)

- Migration creates `user_settings` with unique `(user_id, setting_key)` and cascade delete
- Empty rows → PRD defaults; partial overrides merge correctly
- Integration e2e proves constraints; CI passes
