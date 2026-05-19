---
project: ParcelScrubber
version: 1
status: draft
created: 2026-05-18
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Frequent Allegro and AliExpress buyers accumulate shipment information across many order emails in Gmail. There is no single place to see “all my packages” with tracking links — finding a parcel means searching mail again and copying tracking numbers by hand.

The product treats Gmail as the source of truth for order notifications: it extracts parcel identity (tracking number, carrier, optional description, order date) from known merchant senders, builds an active list scoped to recent orders, and generates carrier tracking URLs without calling carrier status APIs in v1. Older or finished parcels live in archive so the active view stays focused on what still matters. The insight is that **aggregation + link surfacing** delivers most of the value before live status polling.

## User & Persona

**Primary persona — solo buyer (self)**

- **Name/role:** The project owner — orders regularly from Allegro and AliExpress.
- **Context:** Desktop user; app runs locally, not exposed publicly.
- **Moment of need:** After ordering or while waiting — wants a single screen of in-flight parcels from roughly the last month, not a graveyard of old shipments.
- **Success signal:** Recent parcels appear automatically after Gmail sync with correct order dates; tracking links work; delivered or dismissed parcels leave the active list but remain findable in archive.

## Success Criteria

### Primary

- After an on-demand Gmail sync, at least **75%** of the user's real parcels (from Allegro/AliExpress order mail) appear in the app with correct enough fields to identify them.
- Generated **tracking links** open the correct carrier tracking page for InPost, Poczta Polska, DPD, and DHL when the carrier is known.

### Secondary

- User can **manually add and edit** parcels (including order date); data persists alongside Gmail imports.
- User can **browse archive** for parcels removed, marked Delivered, or auto-archived after one month.
- User can **restore** a recent archived parcel back to the active list when its order date is still within the last month.
- **Archived** parcels are not promoted back to the active list automatically on Gmail sync (manual restore only, when eligible).

### Guardrails

- **No carrier status APIs** in MVP — status is link-out only, not live polling inside the app.
- Gmail import runs **only on explicit Sync** — no scheduled/background mailbox polling.
- **Desktop web only** — no mobile-optimized experience required in MVP.
- **Local deployment** — not publicly hosted on the internet.
- v1 extraction uses pattern/heuristic rules on known merchant email templates; AI-assisted extraction is deferred to reduce MVP risk while keeping the same user flow.
- **Active list window:** only parcels with order date within the **last calendar month** stay active; older parcels are archived automatically — the product does not maintain an unbounded active inbox.

## User Stories

### US-01: First sync shows recent active parcels

- **Given** a signed-in user who has granted Gmail read access and has Allegro/AliExpress order emails in the mailbox
- **When** they click Sync and the scan completes
- **Then** they see an **active** list of parcels from roughly the last month, each with order date, tracking number, and working tracking links for supported carriers

#### Acceptance Criteria

- At least 75% of real parcels from **recent** (last-month) order mail appear on the active list without manual entry
- Each active parcel shows an **order date** equal to the oldest relevant Gmail message date for that order
- Parcels with order date older than one month appear only in **archive**, not on the active list
- Each listed parcel has a tracking link that opens the carrier site when the carrier is InPost, Poczta Polska, DPD, or DHL
- Parcels in **archive** do not return to the active list on a later sync unless the user **restores** them and the order date is still within the last month
- Sync does not run until the user clicks Sync

### US-02: Delivered or removed parcel leaves active list

- **Given** a parcel on the active list
- **When** the user marks it **Delivered** or **removes** it
- **Then** it disappears from the active list and appears in **archive**

#### Acceptance Criteria

- Delivered and remove are distinct actions in the UI but produce the same archival outcome
- Archived parcel is still viewable in the archive view with its order date and tracking link

### US-03: Restore a recent archived parcel

- **Given** an archived parcel whose order date is within the last calendar month
- **When** the user chooses **Restore**
- **Then** the parcel returns to the active list

#### Acceptance Criteria

- Restore is offered only when order date is within the last month; parcels older than that stay archive-only (no restore action, or disabled with clear reason)
- After restore, the parcel behaves like any other active parcel (subject to auto-archive on sync if it ages out)

## Functional Requirements

### Authentication & Gmail

- FR-001: User can sign in with Google OAuth and grant Gmail read access in one flow. Priority: must-have
- FR-002: User can disconnect or sign out and revoke continued Gmail access through the app. Priority: nice-to-have

### Import & sync

- FR-003: User can trigger an on-demand Gmail sync that scans messages from configured Allegro and AliExpress sender addresses. Priority: must-have
- FR-004: System can extract tracking number, carrier, optional description, and order date from matching emails using template/heuristic rules in v1. Priority: must-have
- FR-005: System sets each parcel's order date to the oldest Gmail message date associated with that order (first appearance in the mailbox). Priority: must-have
- FR-006: System keeps only parcels whose order date falls within the last calendar month on the active list; parcels older than that are moved to archive automatically during sync. Priority: must-have
- FR-007: System does not promote archived parcels back to the active list on later Gmail syncs (manual restore is separate; see FR-016). Priority: must-have

### Active list, archive & editing

- FR-008: User can view parcels on the active list (in-flight / last month). Priority: must-have
- FR-009: User can view archived parcels in a separate archive view. Priority: must-have
- FR-010: User can edit parcel fields (tracking number, carrier, description, tracking URL, order date). Priority: must-have
- FR-011: User can manually add a parcel not found by sync (including order date). Priority: must-have
- FR-012: User can remove a parcel from the active list, which moves it to archive (not a hard delete). Priority: must-have
- FR-013: User can mark a parcel as Delivered, which moves it to archive (same outcome as remove). Priority: must-have
- FR-016: User can restore (unarchive) an archived parcel to the active list when its order date is within the last calendar month; restore is not available when the order date is older than one month. Priority: must-have

### Tracking links

- FR-014: System can generate a tracking URL from carrier + tracking number for InPost, Poczta Polska, DPD, and DHL using known URL patterns. Priority: must-have
- FR-015: User can override or manually set the tracking URL for any parcel. Priority: must-have

## Non-Functional Requirements

- On-demand Gmail sync shows continuous visible progress for any operation longer than two seconds until completion or failure.
- Imported parcel list remains usable on the latest two major versions of mainstream desktop browsers (Chrome, Firefox, Edge).
- Sign-in credentials and parcel data for a session are confined to the user's local deployment; no third-party analytics or public multi-tenant hosting in MVP.
- Extraction quality target aligns with Primary success: ≥75% of real parcels from supported merchants appear correctly after sync under typical mailbox conditions.

## Business Logic

The application classifies order emails from known Allegro and AliExpress senders, extracts trackable shipments with an order date (oldest mailbox appearance), and routes each parcel to active or archive based on age and user intent.

**Inputs (user-facing):** mailbox messages from configured merchant senders; user edits and manual additions; user actions: remove, mark Delivered, restore (unarchive).

**Output:** a parcel record per shipment (tracking number, carrier, optional description, tracking URL, order date, list membership: active | archive).

**Rules:**

1. **Order date** — for each parcel, the order date is the date of the first (oldest) mailbox message that established that order.
2. **Active window** — the active list includes only parcels whose order date is within the last calendar month; on sync, older active parcels are auto-archived.
3. **Archive, not delete** — remove and mark Delivered both move to archive; parcels are retained for lookup, not permanently erased in MVP.
4. **Sync idempotency** — archived parcels are not restored to the active list automatically on a later Gmail sync.
5. **Manual restore** — user may restore an archived parcel to the active list only if its order date is still within the last calendar month; parcels older than that remain archive-only.

**Encounter in flow:** user triggers Sync → extraction assigns order dates → recent parcels land on active list, stale ones archive → user may edit, remove, mark Delivered, or restore eligible archived parcels → ineligible archived parcels stay in archive only.

## Access Control

- **Sign-in:** Google OAuth — one flow grants app identity and Gmail read access for parcel import.
- **Roles:** Flat user model — one Google account maps to one user record; no role hierarchy (no admin/member/guest) in MVP.
- **Data boundary:** Parcel data is owned by the authenticated Google account; another login must not see another account's parcels (relevant if multi-account is added later).
- **Exposure:** App is intended for local use only, not public internet exposure.

## Non-Goals

- **Carrier status APIs** — no live in-app delivery status; tracking is via external carrier pages only.
- **Background/scheduled Gmail polling** — sync is explicit user action only.
- **Mobile support** — desktop web experience only for MVP.
- **Public internet hosting** — local deployment; not exposed as a public SaaS.
- **AI-assisted extraction in v1** — heuristics/template parsing first; AI enrichment deferred.
- **Multi-user collaboration** — no shared household views or team workspaces.
- **Hard delete** — parcels are archived, not permanently erased, in MVP.
- **Unbounded active history** — active list is capped at roughly one month by order date.

## Open Questions

1. **target_scale ballparks (qps, data_volume)** — Not specified in shape-notes. Owner: user. Tech stack chosen 2026-05-19 (`context/foundation/tech-stack.md`); ballparks still optional for solo/local MVP. Block: no.
