# Frame Brief: Delete parcels data from Settings

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Need a Settings action that clears all parcel-related app data for the logged-in user, with hard confirmation (type `DELETE`).

## Initial Framing (preserved)

- **User's stated cause or approach**: Wipe with SQL like `TRUNCATE TABLE "parcel_emails", "gmail_messages", "parcel_status_events", "parcels" CASCADE` scoped to a user via a `WHERE` clause
- **User's proposed direction**: Place the control in Settings; require typing `DELETE` before execution
- **Pre-dispatch narrowing**: Leading concern is option 2 — all parcel-related app data for the user, including linked Gmail messages / ingest artifacts (the four tables listed); not parcels-only, not a full nuclear wipe of `users` / `user_settings`

## Dimension Map

The observation could originate at any of these dimensions:

1. **SQL mechanism (TRUNCATE + WHERE)** — assumes Postgres can truncate selected rows for one user  ← initial framing (mechanism)
2. **Wipe boundary (which tables / what “parcel-related” means)** — which persisted rows must go so the app is empty of parcels and can re-import cleanly
3. **UI surface + confirmation** — Settings placement and type-`DELETE` as the hard-confirm pattern
4. **Post-wipe coherence (sync ledger / re-import)** — whether leaving any of those tables behind (especially `gmail_messages`) leaves Sync as a silent no-op
5. **Product-scope tension** — PRD parks “hard delete” for normal parcel lifecycle vs deliberate bulk reset / ops clear

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Dim 1: `TRUNCATE … WHERE user` is viable | Postgres `TRUNCATE` has no `WHERE`; in-repo `TRUNCATE` is full-table only (`apps/api/test/truncate-app-tables.ts:3-6`, `docs/deploy-unraid.md:137-143`); per-user wipe already uses `deleteMany` (`apps/api/src/sync/sync-test.controller.ts:20-36`) | STRONG against stated mechanism |
| Dim 2: Four-table set is the right parcel-related boundary | Prisma has only those four parcel/Gmail models besides `users` / `user_settings` (`apps/api/prisma/schema.prisma:37-135`); ops “keep login” clear lists the same four (`docs/deploy-unraid.md:137-143`); `parcel_status_events` has no `userId` — scope via `parcel.userId` (`sync-test.controller.ts:31-33`) | STRONG for table set (with ownership nuance) |
| Dim 3: Settings + type-DELETE fit | `/settings` route + shell nav exist (`apps/web/src/app/app.routes.ts:52-54`); Settings today is prefs only (`settings-page.component.html`); no type-DELETE anywhere; soft confirm on Active remove (`active-list.component.ts:193-203`); merge uses `p-dialog` with inputs (ConfirmDialog cannot host complex inputs — archive merge plan) | STRONG for Settings surface; type-DELETE is new but intentional |
| Dim 4: Full four-table wipe keeps Sync coherent | No persisted Gmail historyId/cursor; ledger is `gmail_messages` (`sync.service.ts:38-43`); wipe including ledger → next Sync re-lists and re-imports; parcels-only wipe → empty UI + silent skip | STRONG — must include `gmail_messages` |
| Dim 5: Conflicts with PRD “no hard delete” | PRD Non-Goals / roadmap Parked: per-parcel hard delete out of MVP (`prd.md:226`, `roadmap.md:287`); Rule 6 is archive-not-delete for remove/delivered (`prd.md:203`); this request matches ops bulk “clear sync data keep login”, not per-row erase | WEAK conflict if treated as lifecycle; STRONG distinction as intentional bulk reset |

## Narrowing Signals

Decisive observations that narrowed the hypothesis space:

- User locked scope to **all parcel-related data including Gmail ledger** (pre-dispatch option 2) — rules out parcels-only and nuclear `users`/`user_settings` wipe
- Independent cross-check landed on the same three pieces: `SyncTestController.reset-sync`, production gating in `sync.module.ts`, Settings page with no delete path
- Inverse check: omitting `gmail_messages` predicts Sync no-op — confirmed by unit/e2e skip-when-ledgered behavior (`sync.service.spec.ts:128-142`)

Step 3 evidence was conclusive across dimensions; Step 4 Socratic questioning was skipped.

## Cross-System Convention

This class of need is already handled three ways in-repo, none of which is Settings:

1. **Dev/test API** — `POST /api/test/reset-sync` user-scoped `deleteMany` (not registered when `NODE_ENV === 'production'`) — `sync-test.controller.ts`, `sync.module.ts:11-16`
2. **Ops SQL** — global `TRUNCATE` of the four tables (keeps login/settings) — `docs/deploy-unraid.md:137-143`
3. **E2E helper** — full-table `TRUNCATE` including users/settings — `truncate-app-tables.ts`

Convention for a product Settings action: promote the **per-user `deleteMany` sequence** (not ops TRUNCATE) onto a **production** authenticated endpoint, hosted on Settings with a harder confirm than Active’s one-click dialog.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: Expose a production, authenticated, user-scoped wipe of the four parcel/Gmail tables (matching existing `reset-sync` and the deploy “keep login” table set) from Settings, gated by a type-`DELETE` confirmation — not invent `TRUNCATE … WHERE`, and not treat this as the parked per-parcel hard-delete lifecycle change.

The observation (Settings + hard confirm + clear parcel-related data) holds. The initial SQL framing does not: user-scoped wipe cannot be `TRUNCATE` with `WHERE`. The closest correct behavior already exists behind a non-production test route; the gap is a production Settings surface that reuses that boundary while preserving OAuth and `user_settings`. Product docs park “hard delete” for everyday remove/delivered flows; this slice is a deliberate bulk reset (ops clear as a first-class UI), which `/10x-plan` should name explicitly so it does not reopen per-parcel hard delete.

## Confidence

- **HIGH** — strong evidence against TRUNCATE+WHERE; strong evidence for the four-table / `deleteMany` boundary; Settings surface confirmed; sync ledger side effect verified; independent search converged on the same reuse path

## What Changes for /10x-plan

Plan a Settings “danger zone” that calls a new production API implementing the same user-scoped four-table wipe as `SyncTestController` (not e2e/ops TRUNCATE), with type-`DELETE` UI (dialog-with-input, not bare ConfirmDialog). Call out PRD tension: this is bulk sync-data reset, not un-parking per-parcel hard delete. Expect next Sync to re-import within label + scan period; manual parcels are included in the wipe.

## References

- Source files: `apps/api/src/sync/sync-test.controller.ts:20-36`, `apps/api/src/sync/sync.module.ts:11-16`, `apps/api/prisma/schema.prisma:37-135`, `apps/api/src/sync/sync.service.ts:38-43`, `docs/deploy-unraid.md:137-143`, `apps/web/src/app/features/settings/settings-page.component.html`, `context/foundation/prd.md:203,226`, `context/foundation/roadmap.md:287`
- Related research: none yet (`research.md` not written)
- Investigation tasks: dim-delete-semantics, dim-data-graph, dim-settings-ux, dim-side-effects; cross-check independent wipe search
