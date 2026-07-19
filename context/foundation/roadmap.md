---
project: ParcelScrubber
version: 1
status: draft
created: 2026-06-04
updated: 2026-07-19
prd_version: 5
main_goal: speed
top_blocker: time
---

# Roadmap: ParcelScrubber

> Derived from `context/foundation/prd.md` (v5) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Frequent Allegro and AliExpress buyers scatter shipment facts across Gmail; ParcelScrubber aggregates parcel identity from known merchant senders, keeps an **active** list of in-flight parcels, and surfaces carrier tracking links without live status APIs in v1. Parcels move to archive only when the user marks Delivered or removes them — never by age. Sync scans only messages under a **user-configurable Gmail label** (default `ParcelScrubber`) and within a **configurable scan period** (default last 30 days) — not the whole mailbox — for security and performance. The product bet is that **aggregation plus link surfacing** delivers most of the value before polling carriers.

## North star

**S-02: Gmail sync and active parcels** — Trigger Sync and see imported active parcels with order dates and carrier tracking links; this is the validation milestone for the PRD’s primary success criteria (≥75% of real parcels in scan scope, working links for supported carriers).

> **North star** here means the smallest end-to-end slice placed as early as prerequisites allow that proves the core product hypothesis — for ParcelScrubber that is label- and period-scoped Gmail import plus a populated active list. **F-01** through **F-04**, **F-05** (Gmail retrieval), **F-06** (AI extraction), and **S-01** (settings) ship first because S-02 depends on UI shell, sign-in, parcel persistence, Gmail/AI services, and sync scope settings (Gmail label + scan period).

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | prime-layout-scaffold | (foundation) PrimeNG and base app layout with routing stubs landed in Angular | — | NFR (desktop browsers) | done |
| F-02 | web-oauth-app-shell | (foundation) sign in with Google; JWT session works in dev; lands on layout placeholder (not a parcel list) | F-01 | FR-001, FR-008, US-01, NFR (local session) | done |
| F-03 | parcel-prisma-model | (foundation) Parcel records with active/archive membership persisted in PostgreSQL | — | FR-008, FR-009 | done |
| F-04 | user-settings-model | (foundation) extensible per-user settings persisted (Gmail scan label default `ParcelScrubber`, scan period default 30 days; room for more) | — | FR-017, FR-003, FR-006, NFR (local session) | done |
| S-01 | user-settings-page | open settings and configure Gmail scan label (default `ParcelScrubber`) and scan period (default last 30 days) | F-01, F-02, F-04 | FR-017, FR-003, FR-006, NFR (local session) | done |
| F-05 | gmail-message-retrieval | (foundation) list matching Gmail message ids by label + scan period; fetch full message (headers + body) by id (separate methods) | F-02 | FR-003, FR-017 | done |
| F-06 | ai-email-parcel-extraction | (foundation) extract tracking number, carrier, and description from email body via OpenRouter | F-05 | FR-003, FR-004, FR-005 | done |
| S-02 | gmail-sync-active-parcels | trigger Sync and see imported active parcels with order dates and carrier tracking links (no age-based auto-archive) | S-01, F-03, F-05, F-06 | US-01, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-014, FR-017 | done |
| S-03 | deliver-remove-archive | mark Delivered or remove from active list and browse the parcel in archive | S-02 | US-02, FR-009, FR-012, FR-013 | done |
| S-04 | manual-parcel-crud | manually add or edit parcels (including order date and tracking URL override) | S-02 | FR-010, FR-011, FR-015 | done |
| S-05 | restore-undeliver-parcel | restore or undeliver any archived parcel back to the active list regardless of order date | S-03 | US-03, FR-016 | done |
| S-06 | carrier-email-parcel-linking | carrier shipment emails import or enrich parcels by tracking number even without a known store sender | S-02 | US-06, FR-018 | done |
| S-07 | parcel-email-expandable-rows | expand a parcel row to list linked Gmail messages with external links back to Gmail | S-02 | US-04, FR-019 | done |
| S-08 | merge-parcels | select multiple parcels and merge them into one when dedupe split the same shipment | S-02 | US-05, FR-020 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | UI, auth & settings | `F-01` → `F-02` → `S-01` → `S-02` → `S-03` / `S-04` | North star **S-02** after settings + Gmail/AI foundations; S-03 and S-04 branch after sync. |
| B | Parcel persistence & Gmail pipeline | `F-03` + `F-05` → `F-06` → joins Stream A at `S-02` | F-05/F-06 parallel with Stream A until S-02; F-05 after F-02. |
| C | User settings data | `F-04` → joins Stream A at `S-01` | Extensible settings schema before settings UI and sync. |
| D | Restore | `S-05` | Continues Stream A after archive actions in `S-03`. |
| E | Post-MVP parcel intelligence | `S-06` → `S-07` / `S-08` | Carrier import improves dedupe at sync time; expandable rows and merge are parallel UI corrections after S-02. |

## Baseline

What's already in place in the codebase as of `2026-06-04` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Angular 21 + CLI (`apps/web/package.json`); routing partial (`app.routes.ts` empty); no PrimeNG or Tailwind yet.
- **Backend / API:** partial — NestJS 11, `/api` prefix, health + auth routes; no parcel/sync/settings handlers (`apps/api/src/`).
- **Data:** partial — Prisma + PostgreSQL, `User` model + init migration (`apps/api/prisma/schema.prisma`); no `Parcel` or user-settings models or seeds.
- **Auth:** partial — Google OAuth + JWT cookie on API (`auth.controller.ts`, `google.strategy.ts`); web app has no auth UI.
- **Deploy / infra:** present — `docker-compose.yml`, Dockerfiles, GHA lint/test + manual deploy (`docs/deploy-unraid.md`).
- **Observability:** partial — `/api/health` and Docker healthchecks only; no structured logging or error tracking.

## Foundations

### F-01: PrimeNG UI layout scaffold

- **Outcome:** (foundation) PrimeNG installed and configured; base app layout (header, main content region, optional nav) and routing stubs landed so feature slices plug into a consistent shell.
- **Change ID:** prime-layout-scaffold
- **PRD refs:** NFR (desktop browsers)
- **Unlocks:** F-02, S-01
- **Prerequisites:** —
- **Parallel with:** F-03, F-04
- **Blockers:** —
- **Unknowns:**
  - Tailwind for layout utilities vs PrimeNG theming/layout alone — Owner: user. Block: no.
- **Risk:** First UI foundation — default to PrimeNG-first (components + layout primitives); add Tailwind only if `/10x-plan` confirms gaps PrimeNG does not cover.
- **Status:** done

### F-02: Web OAuth and session shell

- **Outcome:** (foundation) user can sign in with Google (Gmail read scope granted); JWT session cookie works via dev proxy; authenticated session lands on a placeholder inside the F-01 layout — not a real active parcel list yet.
- **Change ID:** web-oauth-app-shell
- **PRD refs:** FR-001, FR-008, US-01, NFR (local session boundary)
- **Unlocks:** S-01, F-05
- **Prerequisites:** F-01
- **Parallel with:** F-03, F-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Absorbs the former standalone sign-in slice — keeps OAuth and layout integration out of the north-star sync work; placeholder is intentional under **speed** pressure.
- **Status:** done

### F-03: Parcel data model

- **Outcome:** (foundation) Prisma `Parcel` (and related fields) migrated; API can persist active vs archive membership per authenticated user.
- **Change ID:** parcel-prisma-model
- **PRD refs:** FR-008, FR-009
- **Unlocks:** S-02, S-03, S-04, S-05
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, F-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schema introduced before sync to avoid bolting persistence onto extraction mid-slice; scope is model + migration only, not Gmail logic.
- **Status:** done

### F-04: User settings persistence

- **Outcome:** (foundation) extensible per-user settings storage landed (e.g. dedicated settings row or structured fields on `User`); v1 fields are Gmail scan label (default `ParcelScrubber`) and scan period in days (default 30); schema/API contract allows adding more settings without redesign.
- **Change ID:** user-settings-model
- **PRD refs:** FR-017, FR-003, FR-006, NFR (local session boundary)
- **Unlocks:** S-01, S-02
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, F-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Introduced before settings UI and sync so scoped import is not retrofitted; v1 ships two known settings but avoids one-off columns that block future settings.
- **Status:** done

### F-05: Gmail message retrieval service

- **Outcome:** (foundation) Nest Gmail service exposes two methods for the authenticated user: **list matching message ids** filtered by label name and scan period (method params — not read from settings), and **get full message** by message id. Id list returns `string[]` only; body fetch is a separate call (so sync can skip messages already scanned) and returns `from`, `date`, `subject` from `payload.headers` plus decoded body text.
- **Change ID:** gmail-message-retrieval
- **PRD refs:** FR-003, FR-017
- **Unlocks:** F-06, S-02
- **Prerequisites:** F-02
- **Parallel with:** F-03, S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Gmail API pagination and token refresh — scope is retrieval only; no extraction, parcel writes, or UI. If the configured label does not exist in the user's mailbox, list returns **zero results** (no auto-create, no error). Label and scan period are caller-supplied params.
- **Status:** done

### F-06: AI parcel extraction from email

- **Outcome:** (foundation) given email headers and body text (from F-05 `getMessage`), a service returns structured parcel fields — tracking number, carrier, optional description — via **OpenRouter** using `gpt-5.4-mini` or `gpt-5.4-nano`.
- **Change ID:** ai-email-parcel-extraction
- **PRD refs:** FR-003, FR-004, FR-005
- **Unlocks:** S-02
- **Prerequisites:** F-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Extraction quality spike — validates ≥75% recall hypothesis before north-star UI work; no dedupe, parcel persistence, tracking-link builder, or sync orchestration. Requires `OPENROUTER_API_KEY` in local env.
- **Status:** done

## Slices

### S-01: User settings page

- **Outcome:** user can open a settings page and configure Gmail scan label and scan period (how far back sync searches); defaults are label `ParcelScrubber` and last 30 days when unset.
- **Change ID:** user-settings-page
- **PRD refs:** FR-017, FR-003, FR-006, NFR (local session boundary)
- **Prerequisites:** F-01, F-02, F-04
- **Parallel with:** F-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Security/performance gate for sync — ships before north star S-02 so first Sync never scans the full mailbox; defaults let Sync run without prior configuration if the user already labels mail `ParcelScrubber`.
- **Status:** done

### S-02: Gmail sync and active parcels

- **Outcome:** user can click Sync, see progress for long runs, and view imported parcels on the active list with order dates and generated tracking links for supported carriers. Sync reads label and scan period from user settings, calls F-05 to list matching ids, fetches full message via F-05 only for **new** message ids (already-scanned ids are skipped), runs F-06 extraction, dedupes, and upserts parcels. Merchant sender filter uses **hardcoded** Allegro/AliExpress addresses for v1. Imported parcels are not auto-archived by age (FR-006).
- **Change ID:** gmail-sync-active-parcels
- **PRD refs:** US-01, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-014, FR-017
- **Prerequisites:** S-01, F-03, F-05, F-06
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** North star — orchestration, dedupe, tracking-link generation, and sync progress UI concentrate here; Gmail retrieval and AI extraction are delegated to F-05/F-06. Missing Gmail label yields zero imports (F-05 returns empty list). FR-006 ensures sync never auto-archives by age.
- **Status:** done

### S-03: Delivered, remove, and archive view

- **Outcome:** user can mark a parcel Delivered or remove it from the active list and find it in archive with order date and tracking link intact.
- **Change ID:** deliver-remove-archive
- **PRD refs:** US-02, FR-009, FR-012, FR-013
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends on real parcels from sync — intentionally after S-02 so archive semantics are testable against imported data.
- **Status:** done

### S-04: Manual add and edit parcels

- **Outcome:** user can manually add a parcel not found by sync and edit fields including order date and tracking URL.
- **Change ID:** manual-parcel-crud
- **PRD refs:** FR-010, FR-011, FR-015
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Secondary success criterion — parallel with S-03 after sync to fill gaps without blocking core import path.
- **Status:** done

### S-05: Restore or undeliver archived parcel

- **Outcome:** user can restore any archived parcel to the active list regardless of order date, and can undeliver (reverse Delivered) the same way.
- **Change ID:** restore-undeliver-parcel
- **PRD refs:** US-03, FR-016
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Requires archive flow from S-03 — restore/undeliver must not reintroduce age-based eligibility dropped in PRD v3.
- **Status:** done

### S-06: Carrier email parcel linking

- **Outcome:** user sees carrier-only shipment notifications appear as parcels (or enrich existing ones) after Sync, even when the sender is not Allegro/AliExpress. Sync no longer skips non-merchant messages when extraction yields a tracking number; it links by normalized tracking number, creates when new, and enriches null/empty fields when a later merchant email shares the same tracking number.
- **Change ID:** carrier-email-parcel-linking
- **PRD refs:** US-06, FR-018
- **Prerequisites:** S-02
- **Parallel with:** S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Carrier sender allowlist vs AI-only detection for carrier emails — Owner: user. Block: no (default: attempt extraction on all labeled messages in scan period; merchant filter removed for messages with extractable tracking).
- **Risk:** Broadens sync scope beyond hardcoded merchant senders — may increase OpenRouter calls and import noise; enrichment must not clobber user-edited parcel fields.
- **Status:** done

### S-07: Expandable parcel rows with Gmail links

- **Outcome:** user can expand a parcel row on the active or archive table to see every Gmail message scanned for that parcel; each entry links to `https://mail.google.com/mail/u/0/#all/{gmailMessageId}` with a `pi-external-link` icon.
- **Change ID:** parcel-email-expandable-rows
- **PRD refs:** US-04, FR-019
- **Prerequisites:** S-02
- **Parallel with:** S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Requires API to return linked `gmailMessageId` values (and optional date/subject metadata) per parcel; `ParcelEmail` / `GmailMessage` models already exist from S-02.
- **Status:** done

### S-08: Merge parcels

- **Outcome:** user can select two or more parcels (active or archived) and merge them into one record that keeps all linked Gmail messages, the earliest order date, and a single tracking number when duplicates agree.
- **Change ID:** merge-parcels
- **PRD refs:** US-05, FR-020
- **Prerequisites:** S-02
- **Parallel with:** S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Merge conflict rules for store/description/carrier must match PRD enrichment precedence; recompute order date after relinking messages.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | prime-layout-scaffold | Bootstrap PrimeNG and base app layout | no | First move — unlocks F-02 and S-01 |
| F-02 | web-oauth-app-shell | Google sign-in and session placeholder shell | no | After F-01; unlocks S-01 |
| F-03 | parcel-prisma-model | Add Parcel model and migration | no | Parallel; required before north star S-02 |
| F-04 | user-settings-model | Extensible user settings persistence | no | Parallel; required before S-01 and S-02 |
| S-01 | user-settings-page | Settings — Gmail label and scan period | no | Defaults: label `ParcelScrubber`, period 30 days |
| F-05 | gmail-message-retrieval | Gmail id list + full message fetch (headers + body) by id | yes | After F-02; missing label → 0 results |
| F-06 | ai-email-parcel-extraction | OpenRouter parcel extraction from email body | yes | After F-05; models: gpt-5.4-mini or gpt-5.4-nano |
| S-02 | gmail-sync-active-parcels | Sync orchestration, dedupe, and active parcel list UI | no | North star; after S-01 + F-03 + F-05 + F-06 |
| S-03 | deliver-remove-archive | Delivered/remove and archive view | no | After S-02 |
| S-04 | manual-parcel-crud | Manual add/edit parcels and URL override | no | After S-02 |
| S-05 | restore-undeliver-parcel | Restore or undeliver any archived parcel | no | After S-03; no order-date limit |
| S-06 | carrier-email-parcel-linking | Import/enrich parcels from carrier emails by tracking number | yes | After S-02; extends sync beyond merchant senders |
| S-07 | parcel-email-expandable-rows | Expandable parcel rows with Gmail message links | yes | After S-02; uses existing ParcelEmail links |
| S-08 | merge-parcels | Merge mis-split parcels into one | yes | After S-02; parallel with S-07 |

## Open Roadmap Questions

1. **target_scale ballparks (qps, data_volume)** — Owner: user. Block: roadmap-wide (informational only; does not gate slices). From PRD Open Questions.
2. **Tailwind for layout utilities vs PrimeNG-only styling** — Owner: user. Block: no (resolves during `/10x-plan prime-layout-scaffold`; PrimeNG-first is the default assumption).

**Decided defaults (v1):** Gmail scan label `ParcelScrubber`; scan period 30 days (FR-017). **Decided lifecycle (PRD v4):** no age-based auto-archive; restore/undeliver any archived parcel. **Decided Gmail retrieval (F-05):** separate `listMatchingEmailIds` and `getMessage` methods; label + scan period are method params; missing label → zero results; `getMessage` returns `from`, `date`, `subject`, and decoded `body`. **Decided extraction (F-06):** OpenRouter with `gpt-5.4-mini` or `gpt-5.4-nano` (replaces deferred heuristic-only path). **Decided sync filter (S-02):** hardcoded Allegro/AliExpress sender addresses; skip body fetch for already-scanned message ids. **Post-MVP (PRD v5):** carrier emails import by tracking number (S-06); expandable Gmail source rows (S-07); manual merge (S-08).

## Parked

- **FR-002: disconnect / sign out flow** — Why parked: nice-to-have; **speed** path defers polish until core import and lifecycle work ship.
- **Additional settings beyond Gmail label and scan period** — Why parked: F-04 schema supports more; new settings ship as future slices when needed.
- **Dedicated empty active-list shell** — Why parked: merged into F-02 as a layout placeholder; real list UI ships with north star S-02.
- **Carrier status APIs** — Why parked: PRD Non-Goals.
- **Background Gmail polling** — Why parked: PRD Non-Goals.
- **Mobile support** — Why parked: PRD Non-Goals.
- **Public SaaS hosting** — Why parked: PRD Non-Goals (local deployment only).
- **Multi-user collaboration** — Why parked: PRD Non-Goals.
- **Hard delete** — Why parked: PRD Non-Goals.
- **Age-based auto-archive** — Why parked: PRD Non-Goals (PRD v3); archive is user-driven only.

## Done

- **F-01: (foundation) PrimeNG installed and configured; base app layout (header, main content region, optional nav) and routing stubs landed so feature slices plug into a consistent shell.** — Archived 2026-06-06 → `context/archive/2026-06-05-prime-layout-scaffold/`. Lesson: —.
- **F-02: (foundation) user can sign in with Google (Gmail read scope granted); JWT session cookie works via dev proxy; authenticated session lands on a placeholder inside the F-01 layout — not a real active parcel list yet.** — Archived 2026-06-06 → `context/archive/2026-06-06-web-oauth-app-shell/`. Lesson: —.
- **F-03: (foundation) Prisma `Parcel` (and related fields) migrated; API can persist active vs archive membership per authenticated user.** — Archived 2026-06-06 → `context/archive/2026-06-06-parcel-prisma-model/`. Lesson: —.
- **F-04: (foundation) extensible per-user settings storage landed (e.g. dedicated settings row or structured fields on `User`); v1 fields are Gmail scan label (default `ParcelScrubber`) and scan period in days (default 30); schema/API contract allows adding more settings without redesign.** — Archived 2026-06-06 → `context/archive/2026-06-06-user-settings-model/`. Lesson: —.
- **S-01: user can open a settings page and configure Gmail scan label and scan period (how far back sync searches); defaults are label `ParcelScrubber` and last 30 days when unset.** — Archived 2026-06-08 → `context/archive/2026-06-08-user-settings-page/`. Lesson: —.
- **F-05: (foundation) Nest Gmail service exposes two methods for the authenticated user: list matching message ids filtered by label name and scan period (method params — not read from settings), and get full message by message id. Id list returns `string[]` only; body fetch is a separate call (so sync can skip messages already scanned) and returns `from`, `date`, `subject`, and decoded body text.** — Archived 2026-06-08 → `context/archive/2026-06-08-gmail-message-retrieval/`. Lesson: —.
- **F-06: (foundation) given email headers and body text (from F-05 `getMessage`), a service returns structured parcel fields — tracking number, carrier, optional description — via OpenRouter using `gpt-5.4-mini` or `gpt-5.4-nano`.** — Archived 2026-06-14 → `context/archive/2026-06-09-ai-email-parcel-extraction/`. Lesson: —.
- **S-02: trigger Sync and see imported active parcels with order dates and carrier tracking links (no age-based auto-archive)** — Archived 2026-06-22 → `context/archive/2026-06-14-gmail-sync-active-parcels/`. Lesson: —.
- **S-03: user can mark a parcel Delivered or remove it from the active list and find it in archive with order date and tracking link intact.** — Archived 2026-07-05 → `context/archive/2026-06-22-deliver-remove-archive/`. Lesson: —.
- **S-04: user can manually add a parcel not found by sync and edit fields including order date and tracking URL.** — Archived 2026-07-05 → `context/archive/2026-07-05-manual-parcel-crud/`. Lesson: —.
- **S-05: user can restore any archived parcel to the active list regardless of order date, and can undeliver (reverse Delivered) the same way.** — Archived 2026-07-05 → `context/archive/2026-07-05-restore-undeliver-parcel/`. Lesson: —.
- **S-06: user sees carrier-only shipment notifications appear as parcels (or enrich existing ones) after Sync, even when the sender is not Allegro/AliExpress. Sync no longer skips non-merchant messages when extraction yields a tracking number; it links by normalized tracking number, creates when new, and enriches null/empty fields when a later merchant email shares the same tracking number.** — Archived 2026-07-19 → `context/archive/2026-07-19-carrier-email-parcel-linking/`. Lesson: —.
- **S-07: user can expand a parcel row on the active or archive table to see every Gmail message scanned for that parcel; each entry links to `https://mail.google.com/mail/u/0/#all/{gmailMessageId}` with a `pi-external-link` icon.** — Archived 2026-07-19 → `context/archive/2026-07-19-parcel-email-expandable-rows/`. Lesson: —.
