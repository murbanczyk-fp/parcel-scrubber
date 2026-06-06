---
date: 2026-06-06T12:00:00+02:00
researcher: Cursor Agent
git_commit: b44f0db0abe7ba8355dd53a1c0899c70bec27895
branch: parcel-prisma-model
repository: parcel-scrubber
topic: "Parcel Prisma model — fields, relations, email dedup, status lifecycle"
tags: [research, codebase, prisma, parcel, gmail, status]
status: complete
last_updated: 2026-06-06
last_updated_by: Cursor Agent
last_updated_note: "Store detection via label-scoped sync + S-02 From-header logic (hardcoded list or AI); deferred to S-02"
---

# Research: Parcel Prisma model — fields, relations, email dedup, status lifecycle

**Date**: 2026-06-06T12:00:00+02:00  
**Researcher**: Cursor Agent  
**Git Commit**: [b44f0db0abe7ba8355dd53a1c0899c70bec27895](https://github.com/murbanczyk-fp/parcel-scrubber/commit/b44f0db0abe7ba8355dd53a1c0899c70bec27895)  
**Branch**: parcel-prisma-model  
**Repository**: parcel-scrubber

## Research Question

Design the proper Prisma model for a single parcel, considering:

0. Parcel tied to user  
1. Store/source as a free-form string (Allegro, AliExpress, manual, etc.)  
2. Same parcel in multiple emails; track already-read mails for sync performance  
3. Description field (AI or user)  
4. Carrier: InPost, Poczta Polska, DPD, DHL, Custom (`customCarrierLabel` when Custom)  
5. Tracking number  
6. Dates: first email appearance + last update  
7. Tracking URL generated for known carriers; manual entry for Custom  
8. Status enum (New, In transit, In delivery, Delivered, Removed) with optional status-change log  

## Summary

**Recommended approach:** treat **Parcel** (shipment identity), **GmailMessage** (processed-mail ledger), and **ParcelEmail** (many-emails-one-parcel) as separate models. F-03 lands **Parcel**, **ParcelStatusEvent**, and enums; Gmail tables belong in **S-02** (`gmail-sync-active-parcels`).

For the parcel itself:

| Your requirement | Recommendation |
|---|---|
| User ownership | `userId` FK → `User`, unique constraints scoped per user |
| Store | `store String?` — set in S-02 from `From` header (Allegro / AliExpress / Other) or manually in S-04 |
| Multi-email + read dedup | `GmailMessage` + `ParcelEmail` junction (S-02); parcel keyed by `(userId, trackingNumber)` |
| Description | `description String?` — optional; AI-filled or user-edited product/shipment text |
| Custom carrier | `customCarrierLabel String?` — display name when `carrier = CUSTOM`; keeps description independent |
| Carrier | Prisma enum `Carrier` with `INPOST`, `POCZTA_POLSKA`, `DPD`, `DHL`, `CUSTOM` |
| Tracking number | `trackingNumber String?` with `@@unique([userId, trackingNumber])` (partial index when non-null) |
| Dates | `orderDate DateTime` (oldest linked email); `updatedAt` for last change (sync or user edit) |
| Tracking URL | `trackingUrl String?` — null means “generate from carrier + number”; set for Custom or overrides |
| Status | Single `ParcelStatus` enum; **Delivered** and **Removed** imply archive; `ParcelStatusEvent` in F-03 for audit |

**PRD alignment note:** the PRD models **list membership** (`active` \| `archive`), not carrier-reported transit states. Values **In transit** and **In delivery** are valid for UX and manual/future use, but **v1 will not auto-update them** (no carrier APIs). Gmail import always sets status **NEW**; user actions drive transitions to **Delivered/Removed**; transit states are user-editable only.

## Detailed Findings

### 0. User ownership

Every parcel belongs to exactly one authenticated user. The existing `User` model has no relations yet:

```10:21:apps/api/prisma/schema.prisma
model User {
  id           String   @id @default(cuid())
  googleSub    String   @unique @map("google_sub")
  email        String
  displayName  String?  @map("display_name")
  avatarUrl    String?  @map("avatar_url")
  refreshToken String?  @map("refresh_token") @db.Text
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

Add `userId` + `@@index([userId, status])` on `Parcel`. PRD requires per-account isolation ([prd.md:159](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/prd.md#L159)).

### 1. Store (merchant / source)

PRD does not require a store field on the model; **`store String?`** is output metadata populated during sync or manual add (FR-011):

- `store String?` — e.g. `"Allegro"`, `"AliExpress"`, `"Other"`, `"Manual"`  
- **Not** used to filter Gmail — the user configures Gmail filters so only relevant merchant mail lands in the scan label (default `ParcelScrubber`)  
- S-02 logic sets `store` per message from the `From` header (see §Merchant store detection below)

Also add `source` enum `GMAIL | MANUAL` to distinguish origin (helps sync idempotency for manual parcels).

### 2. Multiple emails per parcel + processed-mail dedup

These are **two different concerns**:

1. **Email read dedup** — “have we already fetched/parsed this Gmail message?”  
2. **Parcel identity** — “which shipment does this message belong to?”

**Do not put message IDs on `Parcel`.** One parcel spans many emails (order confirmation → shipped → updates). FR-005 requires order date = **oldest** associated message ([prd.md:110](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/prd.md#L110)).

**Recommended tables (S-02 scope):**

| Model | Purpose | Dedup key |
|---|---|---|
| `GmailMessage` | Immutable processed-mail ledger | `@@unique([userId, gmailMessageId])` |
| `ParcelEmail` | M2M link | `@@id([parcelId, gmailMessageId])` |

Gmail `messageId` is stable and immutable — ideal skip key. `threadId` is stored for grouping hints but is **not** a dedup or parcel primary key.

**Sync flow:** list message IDs under configured **label + scan period** → skip existing `GmailMessage` rows → fetch/parse only new → classify store (Allegro / AliExpress / Other) from `From` header in S-02 → upsert `Parcel` by `(userId, trackingNumber)` → link via `ParcelEmail` → recompute `orderDate = min(linked internalDate)`.

**Archived parcel rule (FR-007):** if upsert matches an archived parcel, refresh links/metadata but **never** promote back to active ([prd.md:112](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/prd.md#L112)). Same for user-removed parcels ([idea-notes.md:11](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/idea-notes.md#L11)).

Gmail OAuth is already wired (`gmail.readonly`, refresh token on `User`) — [google.strategy.ts](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/apps/api/src/auth/strategies/google.strategy.ts).

### 3. Description

PRD field **description** (optional) ([prd.md:142](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/prd.md#L142)):

- `description String? @map("description")`  
- AI-filled or user-edited (FR-010); v1 heuristics may leave it empty ([roadmap.md:212](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/roadmap.md#L212) — AI extraction parked)

Separate from carrier labeling — see §4.

### 4. Carrier enum

Supported URL templates in v1: InPost, Poczta Polska, DPD, DHL ([prd.md:126](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/prd.md#L126)).

```prisma
enum Carrier {
  INPOST         @map("inpost")
  POCZTA_POLSKA  @map("poczta_polska")
  DPD            @map("dpd")
  DHL            @map("dhl")
  CUSTOM         @map("custom")
}
```

Use `@map` on enum values for lowercase snake_case DB values (matches existing `@map` convention).

When `carrier = CUSTOM`, store the display name in **`customCarrierLabel String? @map("custom_carrier_label")`**. Nullable for known carriers; required in UI validation when user selects Custom (app layer, not DB constraint). Keeps `description` free for product/shipment text and future AI enrichment.

Extraction may yield unknown carriers → default to `CUSTOM` + populate `customCarrierLabel` from parsed text if available, else leave null for user edit (FR-010).

### 5. Tracking number

Required for identity and link generation. Normalize on write (strip spaces, uppercase) before unique check.

`@@unique([userId, trackingNumber])` — use a **partial unique index** in raw SQL migration when `trackingNumber IS NOT NULL` (decided). Manual parcels without a tracking number are allowed (FR-011); multiple nulls per user are fine.

### 6. Dates

| Field | Meaning | Source |
|---|---|---|
| `orderDate` | First appearance in email | FR-005: min of linked `GmailMessage.internalDate` |
| `createdAt` | Row created | Prisma default |
| `updatedAt` | Last update (edit, sync touch, status change) | Prisma `@updatedAt` |

No separate `lastUpdateDate` column needed unless you want sync-only timestamps; `updatedAt` covers user edits and sync metadata updates.

### 7. Tracking URL

- **Known carriers:** generate at read time from `carrier + trackingNumber` (FR-014); **do not store** unless user overrides  
- **Custom / override:** persist in `trackingUrl String?` (FR-015)  

API/display rule:

```typescript
function resolveTrackingUrl(parcel: Parcel): string | null {
  if (parcel.trackingUrl) return parcel.trackingUrl;
  if (parcel.carrier === 'CUSTOM') return null;
  return buildCarrierUrl(parcel.carrier, parcel.trackingNumber);
}
```

### 8. Status enum and change log

Your proposed lifecycle:

| Status | Active list? | Set by |
|---|---|---|
| `NEW` | Yes | **Gmail import default (decided)**; manual add default |
| `IN_TRANSIT` | Yes | User edit only (v1) |
| `IN_DELIVERY` | Yes | User edit only (v1) |
| `DELIVERED` | No (archive) | User “Mark Delivered” (FR-013) |
| `REMOVED` | No (archive) | User “Remove” (FR-012) |

**Archive derivation:** `status IN (DELIVERED, REMOVED)` ⇔ archive view. This replaces a separate `active | archive` enum while staying PRD-compatible.

**Undeliver (FR-016):** only valid from `DELIVERED` → back to `NEW` (or last active status). **Restore** from `REMOVED` → `NEW`. Store previous active status in event log if you want smarter restore.

**Status change log** — included in **F-03** migration (decided). Schema lands now; `ParcelsService` writes events starting in S-03 when deliver/remove/restore ships.

```prisma
model ParcelStatusEvent {
  id         String       @id @default(cuid())
  parcelId   String       @map("parcel_id")
  fromStatus ParcelStatus @map("from_status")
  toStatus   ParcelStatus @map("to_status")
  source     String       // "user" | "sync" | "system"
  createdAt  DateTime     @default(now()) @map("created_at")

  parcel Parcel @relation(fields: [parcelId], references: [id], onDelete: Cascade)

  @@index([parcelId, createdAt])
  @@map("parcel_status_events")
}
```

On Gmail import (S-02), create parcel with `status = NEW` only — do not infer transit states from email templates in v1. **Do not write a status event on import** — events are recorded only on real transitions (decided); a `NEW → NEW` row would be meaningless and must not occur.

## Recommended Prisma schema (F-03 core)

```prisma
enum ParcelSource {
  GMAIL  @map("gmail")
  MANUAL @map("manual")
}

enum Carrier {
  INPOST        @map("inpost")
  POCZTA_POLSKA @map("poczta_polska")
  DPD           @map("dpd")
  DHL           @map("dhl")
  CUSTOM        @map("custom")
}

enum ParcelStatus {
  NEW         @map("new")
  IN_TRANSIT  @map("in_transit")
  IN_DELIVERY @map("in_delivery")
  DELIVERED   @map("delivered")
  REMOVED     @map("removed")
}

model Parcel {
  id             String       @id @default(cuid())
  userId         String       @map("user_id")
  store          String?
  description         String?
  customCarrierLabel  String?      @map("custom_carrier_label")
  carrier             Carrier      @default(CUSTOM)
  trackingNumber String?      @map("tracking_number")
  trackingUrl    String?      @map("tracking_url")
  orderDate      DateTime     @map("order_date") @db.Date
  status         ParcelStatus @default(NEW)
  source         ParcelSource @default(GMAIL)
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  user         User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  statusEvents ParcelStatusEvent[]
  messages     ParcelEmail[]        // S-02

  @@index([userId, status])
  @@map("parcels")
}

model ParcelStatusEvent {
  id         String       @id @default(cuid())
  parcelId   String       @map("parcel_id")
  fromStatus ParcelStatus @map("from_status")
  toStatus   ParcelStatus @map("to_status")
  source     String
  createdAt  DateTime     @default(now()) @map("created_at")

  parcel Parcel @relation(fields: [parcelId], references: [id], onDelete: Cascade)

  @@index([parcelId, createdAt])
  @@map("parcel_status_events")
}
```

Add partial unique index via migration SQL:

```sql
CREATE UNIQUE INDEX "parcels_user_id_tracking_number_key"
  ON "parcels"("user_id", "tracking_number")
  WHERE "tracking_number" IS NOT NULL;
```

## F-03 vs later slices

| Slice | Models / behavior |
|---|---|
| **F-03** (this change) | `Parcel`, enums, `ParcelStatusEvent`, `customCarrierLabel`, `User` relation, migration |
| **S-02** | `GmailMessage`, `ParcelEmail`, sync service, parsers; import always `status = NEW` |
| **S-03** | Status transitions (Delivered/Remove), write `ParcelStatusEvent` rows, archive UI |
| **S-04** | Manual CRUD, `source = MANUAL`, `trackingUrl` override |
| **S-05** | Restore / undeliver via status transitions + events |

## Code References

- [`apps/api/prisma/schema.prisma`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/apps/api/prisma/schema.prisma) — current schema (User only)
- [`apps/api/src/auth/strategies/google.strategy.ts`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/apps/api/src/auth/strategies/google.strategy.ts) — Gmail OAuth scope + refresh token
- [`context/foundation/prd.md`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/prd.md) — FR-005–FR-016 parcel requirements
- [`context/foundation/roadmap.md`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/roadmap.md) — F-03 scope definition
- [`idea-notes.md`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/idea-notes.md) — removed parcels must not reappear on rescan

## Architecture Insights

1. **Separate aggregates:** shipment (`Parcel`) vs mail ingestion (`GmailMessage`) keeps F-03 focused and avoids nullable mail columns on manual parcels.  
2. **Convention match:** camelCase fields, `@map` snake_case columns, `cuid()` IDs, `createdAt`/`updatedAt` — mirror `User`.  
3. **Two dedup layers:** skip processed Gmail IDs (performance) vs upsert by tracking number (parcel identity) vs respect archived status (FR-007).  
4. **Status vs PRD:** unified `ParcelStatus` enum satisfies your UX; archive is derived, not a separate column. Transit states are forward-compatible but inert in v1 without carrier APIs.  
5. **Generated URLs:** store only overrides; keeps carrier template changes centralized in app code.

## Historical Context (from prior changes)

- [`context/foundation/roadmap.md`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/roadmap.md) — F-03 explicitly scoped to “model + migration only, not Gmail logic”  
- [`context/foundation/shape-notes.md`](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/shape-notes.md) — stale age-based archive text superseded by PRD v3  
- [`context/archive/2026-06-06-web-oauth-app-shell/`](https://github.com/murbanczyk-fp/parcel-scrubber/tree/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/archive/2026-06-06-web-oauth-app-shell) — OAuth foundation complete; refresh token ready for Gmail sync

## Related Research

- None yet for this change-id.

## Decided

| # | Question | Decision |
|---|---|---|
| 1 | Custom carrier name storage | **`customCarrierLabel String?`** — separate from `description` |
| 2 | `ParcelStatusEvent` in F-03? | **Yes** — include table in F-03 migration; event writes start in S-03 |
| 3 | Default status on Gmail import | **Always `NEW`** — no template-based transit inference in v1 |
| 4 | Partial unique on tracking number | **Yes** — partial unique index on `(userId, trackingNumber)` where tracking number is not null; manual parcels may omit tracking |
| 5 | Initial status event on import | **No** — log only real transitions; never insert `NEW → NEW` |

## Merchant store detection (S-02 — not F-03 schema)

**Product model (decided):** Gmail filtering is the user's job; ParcelScrubber only queries mail already under the configured scan label.

### Gmail query scope

Sync does **not** append Allegro/AliExpress `from:` clauses in app code. The user:

1. Creates a Gmail label (default `ParcelScrubber`, user-configurable in settings — F-04/S-01)  
2. Sets Gmail filters so **only** Allegro, AliExpress, and other parcel-related mail receives that label  

ParcelScrubber then queries:

```
label:{userScanLabel} newer_than:{scanPeriod}d
```

Already-processed dedup still uses `GmailMessage` keyed by `(userId, gmailMessageId)`.

> **PRD note:** FR-003 mentions “configured Allegro and AliExpress sender addresses” ([prd.md:108](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/prd.md#L108)). In practice that configuration lives in **Gmail filters**, not in ParcelScrubber's query string. S-02 `/10x-plan` may document recommended Gmail filter recipes for users; the app trusts the label.

### Setting `parcel.store` (S-02 parser concern)

After fetch, S-02 inspects each message's **`From` header** and sets `store` on the linked parcel:

| Detected store | Typical values |
|---|---|
| Allegro | `"Allegro"` |
| AliExpress | `"AliExpress"` |
| Neither / unknown | `"Other"` |
| Manual add (S-04) | User-entered string |

Two implementation options — **decide in S-02**, not F-03:

| Option | Approach | Pros | Cons |
|---|---|---|---|
| **A — Hardcoded From list** | Config map of known Allegro/AliExpress sender addresses/domains; match `From` against allowlists | Deterministic, fast, no API cost, easy to test | Must maintain list as merchants add senders; `"Other"` for unmatched |
| **B — AI guess** | LLM reads `From` + subject/snippet → returns store label | Handles novel senders, less maintenance | Cost, latency, non-determinism; PRD parks AI for v1 extraction ([roadmap.md:212](https://github.com/murbanczyk-fp/parcel-scrubber/blob/b44f0db0abe7ba8355dd53a1c0899c70bec27895/context/foundation/roadmap.md#L212)) |

**Recommendation for S-02 planning:** start with **Option A** (hardcoded list) — aligns with v1 heuristic parsing and your note that it “might work very well”. Option B can be a follow-up slice if recall gaps appear. Unmatched senders → `store = "Other"`; user can edit (FR-010).

Example shape (S-02 only):

```typescript
// apps/api/src/gmail/store-from-sender.ts
const ALLEGRO_FROM = ['noreply@allegro.pl', /* …seed from your mailbox */];
const ALIEXPRESS_FROM = ['notice@notice.aliexpress.com', /* … */];

export function detectStore(fromHeader: string): 'Allegro' | 'AliExpress' | 'Other' {
  // normalize + match against lists
}
```

Template parsers (tracking number, carrier, description) remain a **separate** S-02 concern from store detection.

### F-03 impact

None. `store String?` on `Parcel` is sufficient — any string value, set by S-02 sync or S-04 manual CRUD. No sender tables or enums in the schema.

## Open Questions

- None blocking F-03. Store detection strategy (hardcoded list vs AI) and template parsers defer to S-02 (`gmail-sync-active-parcels`) planning.
