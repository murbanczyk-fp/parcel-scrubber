---
project: ParcelScrubber
version: 1
status: draft
created: 2026-06-04
updated: 2026-06-06
prd_version: 3
main_goal: speed
top_blocker: time
---

# Roadmap: ParcelScrubber

> Derived from `context/foundation/prd.md` (v3) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Frequent Allegro and AliExpress buyers scatter shipment facts across Gmail; ParcelScrubber aggregates parcel identity from known merchant senders, keeps an **active** list of in-flight parcels, and surfaces carrier tracking links without live status APIs in v1. Parcels move to archive only when the user marks Delivered or removes them — never by age. Sync scans only messages under a **user-configurable Gmail label** (default `ParcelScrubber`) and within a **configurable scan period** (default last 30 days) — not the whole mailbox — for security and performance. The product bet is that **aggregation plus link surfacing** delivers most of the value before polling carriers.

## North star

**S-02: Gmail sync and active parcels** — Trigger Sync and see imported active parcels with order dates and carrier tracking links; this is the validation milestone for the PRD’s primary success criteria (≥75% of real parcels in scan scope, working links for supported carriers).

> **North star** here means the smallest end-to-end slice placed as early as prerequisites allow that proves the core product hypothesis — for ParcelScrubber that is label- and period-scoped Gmail import plus a populated active list. **F-01** through **F-04** and **S-01** (settings) ship first because S-02 depends on UI shell, sign-in, parcel persistence, and sync scope settings (Gmail label + scan period).

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | prime-layout-scaffold | (foundation) PrimeNG and base app layout with routing stubs landed in Angular | — | NFR (desktop browsers) | done |
| F-02 | web-oauth-app-shell | (foundation) sign in with Google; JWT session works in dev; lands on layout placeholder (not a parcel list) | F-01 | FR-001, FR-008, US-01, NFR (local session) | done |
| F-03 | parcel-prisma-model | (foundation) Parcel records with active/archive membership persisted in PostgreSQL | — | FR-008, FR-009 | done |
| F-04 | user-settings-model | (foundation) extensible per-user settings persisted (Gmail scan label default `ParcelScrubber`, scan period default 30 days; room for more) | — | FR-017, FR-003, FR-006, NFR (local session) | done |
| S-01 | user-settings-page | open settings and configure Gmail scan label (default `ParcelScrubber`) and scan period (default last 30 days) | F-01, F-02, F-04 | FR-017, FR-003, FR-006, NFR (local session) | proposed |
| S-02 | gmail-sync-active-parcels | trigger Sync and see imported active parcels with order dates and carrier tracking links (no age-based auto-archive) | S-01, F-03 | US-01, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-014, FR-017 | proposed |
| S-03 | deliver-remove-archive | mark Delivered or remove from active list and browse the parcel in archive | S-02 | US-02, FR-009, FR-012, FR-013 | proposed |
| S-04 | manual-parcel-crud | manually add or edit parcels (including order date and tracking URL override) | S-02 | FR-010, FR-011, FR-015 | proposed |
| S-05 | restore-undeliver-parcel | restore or undeliver any archived parcel back to the active list regardless of order date | S-03 | US-03, FR-016 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | UI, auth & settings | `F-01` → `F-02` → `S-01` → `S-02` → `S-03` / `S-04` | North star **S-02** after settings; S-03 and S-04 branch after sync. |
| B | Parcel persistence | `F-03` → joins Stream A at `S-02` | Parallel with F-01/F-02/F-04 until sync slice. |
| C | User settings data | `F-04` → joins Stream A at `S-01` | Extensible settings schema before settings UI and sync. |
| D | Restore | `S-05` | Continues Stream A after archive actions in `S-03`. |

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
- **Unlocks:** S-01
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
- **Status:** proposed

### S-02: Gmail sync and active parcels

- **Outcome:** user can click Sync, see progress for long runs, and view imported parcels on the active list with order dates and generated tracking links for supported carriers; sync queries only messages with the configured Gmail label (default `ParcelScrubber`) within the configured scan period (default last 30 days), plus existing merchant-sender rules; imported parcels are not auto-archived by age (FR-006).
- **Change ID:** gmail-sync-active-parcels
- **PRD refs:** US-01, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-014, FR-017
- **Prerequisites:** S-01, F-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Exact Allegro/AliExpress sender addresses and template heuristics for ≥75% recall — Owner: user. Block: no.
- **Risk:** North star — extraction quality and sync progress NFR concentrate here; label and scan-period filters from S-01 bound Gmail scope before parsers run; FR-006 ensures sync never auto-archives by age.
- **Status:** proposed

### S-03: Delivered, remove, and archive view

- **Outcome:** user can mark a parcel Delivered or remove it from the active list and find it in archive with order date and tracking link intact.
- **Change ID:** deliver-remove-archive
- **PRD refs:** US-02, FR-009, FR-012, FR-013
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends on real parcels from sync — intentionally after S-02 so archive semantics are testable against imported data.
- **Status:** proposed

### S-04: Manual add and edit parcels

- **Outcome:** user can manually add a parcel not found by sync and edit fields including order date and tracking URL.
- **Change ID:** manual-parcel-crud
- **PRD refs:** FR-010, FR-011, FR-015
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Secondary success criterion — parallel with S-03 after sync to fill gaps without blocking core import path.
- **Status:** proposed

### S-05: Restore or undeliver archived parcel

- **Outcome:** user can restore any archived parcel to the active list regardless of order date, and can undeliver (reverse Delivered) the same way.
- **Change ID:** restore-undeliver-parcel
- **PRD refs:** US-03, FR-016
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Requires archive flow from S-03 — restore/undeliver must not reintroduce age-based eligibility dropped in PRD v3.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | prime-layout-scaffold | Bootstrap PrimeNG and base app layout | no | First move — unlocks F-02 and S-01 |
| F-02 | web-oauth-app-shell | Google sign-in and session placeholder shell | no | After F-01; unlocks S-01 |
| F-03 | parcel-prisma-model | Add Parcel model and migration | no | Parallel; required before north star S-02 |
| F-04 | user-settings-model | Extensible user settings persistence | no | Parallel; required before S-01 and S-02 |
| S-01 | user-settings-page | Settings — Gmail label and scan period | no | Defaults: label `ParcelScrubber`, period 30 days |
| S-02 | gmail-sync-active-parcels | Scoped Gmail sync and active parcel list | no | North star; after S-01 + F-03; no age auto-archive |
| S-03 | deliver-remove-archive | Delivered/remove and archive view | no | After S-02 |
| S-04 | manual-parcel-crud | Manual add/edit parcels and URL override | no | After S-02 |
| S-05 | restore-undeliver-parcel | Restore or undeliver any archived parcel | no | After S-03; no order-date limit |

## Open Roadmap Questions

1. **target_scale ballparks (qps, data_volume)** — Owner: user. Block: roadmap-wide (informational only; does not gate slices). From PRD Open Questions.
2. **Tailwind for layout utilities vs PrimeNG-only styling** — Owner: user. Block: no (resolves during `/10x-plan prime-layout-scaffold`; PrimeNG-first is the default assumption).
**Decided defaults (v1):** Gmail scan label `ParcelScrubber`; scan period 30 days (FR-017). **Decided lifecycle (PRD v3):** no age-based auto-archive; restore/undeliver any archived parcel.

## Parked

- **FR-002: disconnect / sign out flow** — Why parked: nice-to-have; **speed** path defers polish until core import and lifecycle work ship.
- **Additional settings beyond Gmail label and scan period** — Why parked: F-04 schema supports more; new settings ship as future slices when needed.
- **Dedicated empty active-list shell** — Why parked: merged into F-02 as a layout placeholder; real list UI ships with north star S-02.
- **Carrier status APIs** — Why parked: PRD Non-Goals.
- **Background Gmail polling** — Why parked: PRD Non-Goals.
- **Mobile support** — Why parked: PRD Non-Goals.
- **Public SaaS hosting** — Why parked: PRD Non-Goals (local deployment only).
- **AI-assisted extraction** — Why parked: PRD Non-Goals for v1.
- **Multi-user collaboration** — Why parked: PRD Non-Goals.
- **Hard delete** — Why parked: PRD Non-Goals.
- **Age-based auto-archive** — Why parked: PRD Non-Goals (PRD v3); archive is user-driven only.

## Done

- **F-01: (foundation) PrimeNG installed and configured; base app layout (header, main content region, optional nav) and routing stubs landed so feature slices plug into a consistent shell.** — Archived 2026-06-06 → `context/archive/2026-06-05-prime-layout-scaffold/`. Lesson: —.
- **F-02: (foundation) user can sign in with Google (Gmail read scope granted); JWT session cookie works via dev proxy; authenticated session lands on a placeholder inside the F-01 layout — not a real active parcel list yet.** — Archived 2026-06-06 → `context/archive/2026-06-06-web-oauth-app-shell/`. Lesson: —.
- **F-03: (foundation) Prisma `Parcel` (and related fields) migrated; API can persist active vs archive membership per authenticated user.** — Archived 2026-06-06 → `context/archive/2026-06-06-parcel-prisma-model/`. Lesson: —.
- **F-04: (foundation) extensible per-user settings storage landed (e.g. dedicated settings row or structured fields on `User`); v1 fields are Gmail scan label (default `ParcelScrubber`) and scan period in days (default 30); schema/API contract allows adding more settings without redesign.** — Archived 2026-06-06 → `context/archive/2026-06-06-user-settings-model/`. Lesson: —.
