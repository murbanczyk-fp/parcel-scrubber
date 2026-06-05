---
project: ParcelScrubber
version: 1
status: draft
created: 2026-06-04
updated: 2026-06-04
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: ParcelScrubber

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Frequent Allegro and AliExpress buyers scatter shipment facts across Gmail; ParcelScrubber aggregates parcel identity from known merchant senders, keeps a rolling one-month **active** list, and surfaces carrier tracking links without live status APIs in v1. The product bet is that **aggregation plus link surfacing** — pulling tracking numbers and order dates into one desktop view — delivers most of the value before polling carriers.

## North star

**S-02: Gmail sync and recent active parcels** — Trigger Sync and see recent active parcels with order dates and carrier tracking links; this is the validation milestone for the PRD’s primary success criteria (≥75% of real parcels from recent order mail, working links for supported carriers).

> **North star** here means the smallest end-to-end slice placed as early as prerequisites allow that proves the core product hypothesis — for ParcelScrubber that is Gmail import plus a populated active list, not an empty shell alone. **F-01**, **F-02**, and **S-01** still ship first because S-02 depends on them.

## At a glance


| ID   | Change ID                  | Outcome (user can …)                                                                       | Prerequisites | PRD refs                                                      | Status   |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------- | -------- |
| F-01 | web-oauth-app-shell        | (foundation) Angular OAuth flow and routed app shell wired to Nest JWT session cookie      | —             | FR-001, NFR (local session)                                   | proposed |
| F-02 | parcel-prisma-model        | (foundation) Parcel records with active/archive membership persisted in PostgreSQL         | —             | FR-008, FR-009                                                | proposed |
| S-01 | google-signin-active-shell | sign in with Google and see an empty active list shell                                     | F-01          | FR-001, FR-008, US-01                                         | proposed |
| S-02 | gmail-sync-recent-parcels  | trigger Sync and see recent active parcels with order dates and carrier tracking links     | S-01, F-02    | US-01, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-014 | proposed |
| S-03 | deliver-remove-archive     | mark Delivered or remove from active list and browse the parcel in archive                 | S-02          | US-02, FR-009, FR-012, FR-013                                 | proposed |
| S-04 | manual-parcel-crud         | manually add or edit parcels (including order date and tracking URL override)              | S-02          | FR-010, FR-011, FR-015                                        | proposed |
| S-05 | restore-recent-archive     | restore an archived parcel to the active list when its order date is within the last month | S-03          | US-03, FR-016                                                 | proposed |


## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.


| Stream | Theme              | Chain                                      | Note                                                                              |
| ------ | ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------- |
| A      | Import path        | `F-01` → `S-01` → `S-02` → `S-03` / `S-04` | North star **S-02** at earliest deps; S-03 and S-04 branch after sync. |
| B      | Parcel persistence | `F-02` → joins Stream A at `S-02`          | Minimal schema only — no sync logic in the foundation.                            |
| C      | Restore            | `S-05`                                     | Continues Stream A after archive actions in `S-03`.                               |


## Baseline

What's already in place in the codebase as of `2026-06-04` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Angular 21 + CLI (`apps/web/package.json`); routing partial (`app.routes.ts` empty).
- **Backend / API:** partial — NestJS 11, `/api` prefix, health + auth routes; no parcel/sync handlers (`apps/api/src/`).
- **Data:** partial — Prisma + PostgreSQL, `User` model + init migration (`apps/api/prisma/schema.prisma`); no `Parcel` model or seeds.
- **Auth:** partial — Google OAuth + JWT cookie on API (`auth.controller.ts`, `google.strategy.ts`); web app has no auth UI.
- **Deploy / infra:** present — `docker-compose.yml`, Dockerfiles, GHA lint/test + manual deploy (`docs/deploy-unraid.md`).
- **Observability:** partial — `/api/health` and Docker healthchecks only; no structured logging or error tracking.

## Foundations

### F-01: Web OAuth and app shell

- **Outcome:** (foundation) Angular sign-in/logout flow calls Nest OAuth endpoints; JWT session cookie works in dev proxy; routed layout shows an empty active list placeholder.
- **Change ID:** web-oauth-app-shell
- **PRD refs:** FR-001, NFR (local session boundary)
- **Unlocks:** S-01 (prerequisite on path to north star S-02)
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** API auth exists but web is absent — without this foundation S-01 cannot be end-to-end; kept minimal (no parcel UI beyond empty shell).
- **Status:** proposed

### F-02: Parcel data model

- **Outcome:** (foundation) Prisma `Parcel` (and related fields) migrated; API can persist active vs archive membership per authenticated user.
- **Change ID:** parcel-prisma-model
- **PRD refs:** FR-008, FR-009
- **Unlocks:** S-02, S-03, S-04, S-05
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schema introduced before sync to avoid bolting persistence onto extraction mid-slice; scope is model + migration only, not Gmail logic.
- **Status:** proposed

## Slices

### S-01: Google sign-in and empty active shell

- **Outcome:** user can sign in with Google (Gmail read scope granted) and land on an empty active list view ready for parcels.
- **Change ID:** google-signin-active-shell
- **PRD refs:** FR-001, FR-008, US-01
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Prerequisite for north star S-02 — smallest sign-in + list shell so sync debugging is not mixed with first OAuth wiring.
- **Status:** proposed

### S-02: Gmail sync and recent active parcels

- **Outcome:** user can click Sync, see progress for long runs, and view last-month active parcels with order dates and generated tracking links for supported carriers.
- **Change ID:** gmail-sync-recent-parcels
- **PRD refs:** US-01, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-014
- **Prerequisites:** S-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Exact Allegro/AliExpress sender addresses and template heuristics for ≥75% recall — Owner: user. Block: no.
- **Risk:** North star — extraction quality and sync progress NFR concentrate here; placed immediately after F-01, F-02, and S-01 so OAuth and persistence are not debugged alongside parsers.
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

### S-05: Restore recent archived parcel

- **Outcome:** user can restore an archived parcel to the active list when its order date is within the last calendar month.
- **Change ID:** restore-recent-archive
- **PRD refs:** US-03, FR-016
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Requires archive flow from S-03 — restore eligibility rules are easy to get wrong if built before archive exists.
- **Status:** proposed

## Backlog Handoff


| Roadmap ID | Change ID                  | Suggested issue title                          | Ready for `/10x-plan` | Notes                                                |
| ---------- | -------------------------- | ---------------------------------------------- | --------------------- | ---------------------------------------------------- |
| F-01       | web-oauth-app-shell        | Wire Angular OAuth and empty active list shell | no                    | On path to north star S-02 (via S-01)                |
| F-02       | parcel-prisma-model        | Add Parcel model and migration                 | no                    | Can plan in parallel with F-01; required before S-02 |
| S-01       | google-signin-active-shell | Sign in and empty active list                  | no                    | After F-01                                           |
| S-02       | gmail-sync-recent-parcels  | On-demand Gmail sync and active parcel list    | no                    | After S-01 + F-02                                    |
| S-03       | deliver-remove-archive     | Delivered/remove and archive view              | no                    | After S-02                                           |
| S-04       | manual-parcel-crud         | Manual add/edit parcels and URL override       | no                    | After S-02                                           |
| S-05       | restore-recent-archive     | Restore eligible archived parcels              | no                    | After S-03                                           |


## Open Roadmap Questions

1. **target_scale ballparks (qps, data_volume)** — Owner: user. Block: roadmap-wide (informational only; does not gate slices). From PRD Open Questions.

## Parked

- **FR-002: disconnect / sign out flow** — Why parked: nice-to-have; **speed** path defers polish until core import and lifecycle work ship.
- **Carrier status APIs** — Why parked: PRD Non-Goals.
- **Background Gmail polling** — Why parked: PRD Non-Goals.
- **Mobile support** — Why parked: PRD Non-Goals.
- **Public SaaS hosting** — Why parked: PRD Non-Goals (local deployment only).
- **AI-assisted extraction** — Why parked: PRD Non-Goals for v1.
- **Multi-user collaboration** — Why parked: PRD Non-Goals.
- **Hard delete** — Why parked: PRD Non-Goals.
- **Unbounded active history** — Why parked: PRD Non-Goals.

## Done

(Empty on first generation.)