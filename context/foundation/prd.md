---
project: ParcelScrubber
version: 5
status: draft
created: 2026-05-18
updated: 2026-07-05
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

The product treats Gmail as the source of truth for order notifications: it extracts parcel identity (tracking number, carrier, optional description, order date) from merchant and carrier senders within the scan scope, builds an **active** list of in-flight parcels, and generates carrier tracking URLs without calling carrier status APIs in v1. Sync queries only messages under a **user-configurable Gmail label** and within a **configurable scan period** (defaults: label `ParcelScrubber`, last 30 days) — not the whole mailbox — for security and performance. Parcels move to **archive** only when the user marks them Delivered or removes them — never automatically by age. Users can inspect linked source emails, correct bad dedupe by merging parcels, and rely on tracking-number matching to unify carrier-only notifications with later store order mail. The insight is that **aggregation + link surfacing** delivers most of the value before live status polling.

## User & Persona

**Primary persona — solo buyer (self)**

- **Name/role:** The project owner — orders regularly from Allegro and AliExpress.
- **Context:** Desktop user; app runs locally, not exposed publicly.
- **Moment of need:** After ordering or while waiting — wants a single screen of in-flight parcels, with finished ones tucked away in archive only when they choose.
- **Success signal:** Recent parcels appear automatically after Gmail sync with correct order dates; tracking links work; delivered or dismissed parcels leave the active list but remain findable in archive.

## Success Criteria

### Primary

- After an on-demand Gmail sync, at least **75%** of the user's real parcels (from Allegro/AliExpress order mail) appear in the app with correct enough fields to identify them.
- Generated **tracking links** open the correct carrier tracking page for InPost, Poczta Polska, DPD, and DHL when the carrier is known.

### Secondary

- User can **manually add and edit** parcels (including order date); data persists alongside Gmail imports.
- User can **browse archive** for parcels removed or marked Delivered.
- User can **restore** any archived parcel back to the active list, or **undeliver** (reverse Delivered) regardless of order date.
- **Archived** parcels are not promoted back to the active list automatically on Gmail sync (manual restore/undeliver only).
- User can **expand a parcel row** to see every Gmail message scanned for that shipment, each with a one-click link back to the message in Gmail.
- User can **merge** incorrectly split parcels into one record when dedupe fails.
- **Carrier-only** shipment emails (no known store sender) still create or enrich parcels when a tracking number is extracted.

### Guardrails

- **No carrier status APIs** in MVP — status is link-out only, not live polling inside the app.
- Gmail import runs **only on explicit Sync** — no scheduled/background mailbox polling.
- **Desktop web only** — no mobile-optimized experience required in MVP.
- **Local deployment** — not publicly hosted on the internet.
- v1 extraction uses **OpenRouter** (models `gpt-5.4-mini` or `gpt-5.4-nano`) to parse email body text for tracking number, carrier, and optional description; API key stays in local env only.
- **No age-based auto-archive:** parcels stay on the active list until the user marks Delivered or removes them; sync does not archive by order date.
- **Gmail scan scope:** sync searches only the configured Gmail label within the configured scan period; it does not scan the entire mailbox.

## User Stories

### US-01: First sync shows active parcels

- **Given** a signed-in user who has granted Gmail read access and has Allegro/AliExpress order emails under the configured Gmail scan label (default `ParcelScrubber`) within the configured scan period
- **When** they click Sync and the scan completes
- **Then** they see an **active** list of imported parcels, each with order date, tracking number, and working tracking links for supported carriers

#### Acceptance Criteria

- At least 75% of real parcels from order mail in the scan scope appear on the active list without manual entry
- Each active parcel shows an **order date** equal to the oldest relevant Gmail message date for that order
- Newly imported parcels land on the **active** list regardless of order date; sync does not auto-archive by age
- Each listed parcel has a tracking link that opens the carrier site when the carrier is InPost, Poczta Polska, DPD, or DHL
- Parcels in **archive** do not return to the active list on a later sync unless the user **restores** or **undelivers** them
- Sync does not run until the user clicks Sync

### US-02: Delivered or removed parcel leaves active list

- **Given** a parcel on the active list
- **When** the user marks it **Delivered** or **removes** it
- **Then** it disappears from the active list and appears in **archive**

#### Acceptance Criteria

- Delivered and remove are distinct actions in the UI but produce the same archival outcome
- Archived parcel is still viewable in the archive view with its order date and tracking link

### US-03: Restore or undeliver any archived parcel

- **Given** an archived parcel (removed or marked Delivered)
- **When** the user chooses **Restore** or **Undeliver** (reverse Delivered)
- **Then** the parcel returns to the active list

#### Acceptance Criteria

- Restore and undeliver are available for **any** archived parcel regardless of order date
- After restore or undeliver, the parcel behaves like any other active parcel until the user marks Delivered or removes it again

### US-04: Expand parcel row to source Gmail messages

- **Given** a parcel on the active or archive list with one or more linked Gmail messages from sync
- **When** the user expands that parcel's table row
- **Then** they see each scanned message listed with a link that opens the message in Gmail

#### Acceptance Criteria

- Expand/collapse is available per parcel row in active and archive parcel tables
- Each linked message shows enough context to identify it (at minimum the Gmail message id used in the link; date/subject when available from stored metadata)
- Each message link uses `https://mail.google.com/mail/u/0/#all/{gmailMessageId}` and opens in a new tab
- The link is indicated with a `pi-external-link` icon (PrimeIcons)
- Parcels with no linked messages show an empty expanded state (not an error)

### US-05: Merge incorrectly split parcels

- **Given** two or more active or archived parcels that represent the same physical shipment
- **When** the user selects them and chooses **Merge**
- **Then** they become a single parcel that retains all linked Gmail messages and the earliest order date among the merged set

#### Acceptance Criteria

- User can select multiple parcels and merge them in one action from active or archive views
- The surviving parcel keeps the earliest **order date** from the merged set
- All **ParcelEmail** links from merged parcels move to the surviving parcel; merged parcel records are removed (not left as duplicates)
- When merged parcels share the same tracking number, the result is one parcel with that tracking number
- When field values conflict (store, description, carrier), non-null values from parcels that had a known store take precedence over carrier-only/null fields; user-edited values on the surviving parcel are not overwritten by merge
- Merge is rejected when selected parcels belong to different users (API enforces per-user scope)

### US-06: Carrier email links to store parcel by tracking number

- **Given** a Gmail message from a carrier sender (not Allegro/AliExpress) under the configured scan label
- **When** sync extracts a tracking number from that message
- **Then** the shipment is linked to an existing parcel with the same tracking number, or a new parcel is created when the tracking number is new

#### Acceptance Criteria

- Carrier messages are no longer skipped solely because the sender is not a known merchant address
- When a matching tracking number already exists, the carrier message is linked to that parcel and does not create a duplicate
- When the tracking number is new, sync creates a parcel (store may be null until a merchant email arrives)
- When a carrier-only parcel exists first and a later merchant email shares the same tracking number, sync enriches missing fields (store, description, and related extraction fields) on the existing parcel instead of creating a second parcel
- Enrichment fills only **null or empty** parcel fields; it does not overwrite values the user already set manually

## Functional Requirements

### Authentication & Gmail

- FR-001: User can sign in with Google OAuth and grant Gmail read access in one flow. Priority: must-have
- FR-002: User can disconnect or sign out and revoke continued Gmail access through the app. Priority: nice-to-have

### Settings

- FR-017: User can open a settings page and configure Gmail sync scope: **scan label** (which Gmail label to query) and **scan period** (how many days back to search). Defaults: label `ParcelScrubber`, scan period 30 days. Priority: must-have

### Import & sync

- FR-003: User can trigger an on-demand Gmail sync that scans messages matching the configured Gmail scan label within the configured scan period; v1 processes known Allegro and AliExpress merchant senders plus carrier senders when extraction yields a tracking number (see FR-018). Priority: must-have
- FR-004: System can extract tracking number, carrier, optional description, and order date from matching emails using OpenRouter AI parsing (`gpt-5.4-mini` or `gpt-5.4-nano`) in v1. Priority: must-have
- FR-005: System sets each parcel's order date to the oldest Gmail message date associated with that order (first appearance in the mailbox). Priority: must-have
- FR-006: System does not move parcels to archive automatically based on order date or age during sync; only explicit user actions (remove, mark Delivered) change list membership. Priority: must-have
- FR-007: System does not promote archived parcels back to the active list on later Gmail syncs (manual restore is separate; see FR-016). Priority: must-have
- FR-018: System processes Gmail messages from carrier senders (not only known merchant senders) when extraction yields a tracking number: link to an existing parcel by tracking number, create a new parcel when the tracking number is new, and enrich null/empty fields on an existing parcel when a later merchant email shares the same tracking number. Priority: must-have

### Active list, archive & editing

- FR-008: User can view parcels on the active list (in-flight). Priority: must-have
- FR-009: User can view archived parcels in a separate archive view. Priority: must-have
- FR-010: User can edit parcel fields (tracking number, carrier, description, tracking URL, order date). Priority: must-have
- FR-011: User can manually add a parcel not found by sync (including order date). Priority: must-have
- FR-012: User can remove a parcel from the active list, which moves it to archive (not a hard delete). Priority: must-have
- FR-013: User can mark a parcel as Delivered, which moves it to archive (same outcome as remove). Priority: must-have
- FR-016: User can restore (unarchive) any archived parcel to the active list regardless of order date, and can undeliver (reverse Delivered) to return a Delivered parcel to the active list. Priority: must-have
- FR-019: User can expand a parcel row in the active or archive list to view all Gmail messages linked to that parcel; each message provides a link to `https://mail.google.com/mail/u/0/#all/{gmailMessageId}` with a `pi-external-link` icon. Priority: must-have
- FR-020: User can merge two or more parcels into one; the result retains all linked Gmail messages, uses the earliest order date among merged parcels, and removes the merged duplicate parcel records. Priority: must-have

### Tracking links

- FR-014: System can generate a tracking URL from carrier + tracking number for InPost, Poczta Polska, DPD, and DHL using known URL patterns. Priority: must-have
- FR-015: User can override or manually set the tracking URL for any parcel. Priority: must-have

## Non-Functional Requirements

- On-demand Gmail sync shows continuous visible progress for any operation longer than two seconds until completion or failure.
- Imported parcel list remains usable on the latest two major versions of mainstream desktop browsers (Chrome, Firefox, Edge).
- Sign-in credentials, parcel data, and OpenRouter API calls for a session are confined to the user's local deployment; no third-party analytics or public multi-tenant hosting in MVP.
- Extraction quality target aligns with Primary success: ≥75% of real parcels from supported merchants appear correctly after sync under typical mailbox conditions.
- Gmail sync fetches full messages (headers + body) only for message ids not yet processed; id listing and full message retrieval are separate operations.

## Business Logic

The application ingests order and carrier shipment emails within the user's configured Gmail label and scan period, extracts trackable shipments with an order date (oldest linked mailbox appearance) via OpenRouter AI parsing, dedupes primarily by normalized tracking number, and routes each parcel to active or archive based on user intent only.

**Inputs (user-facing):** mailbox messages from merchant senders (hardcoded Allegro/AliExpress allowlist in v1) and carrier senders when a tracking number is extracted (filtered by Gmail scan label and scan period); user settings (scan label, scan period); user edits and manual additions; user actions: remove, mark Delivered, restore (unarchive), undeliver, merge parcels.

**Gmail ingestion (implementation):** sync lists message metadata by label + scan period; if the label does not exist in the mailbox, the list is empty. Full bodies are fetched only for message ids not yet processed. Extraction runs on fetched body text.

**Output:** a parcel record per shipment (tracking number, carrier, optional description, tracking URL, order date, list membership: active | archive) plus linked Gmail message ids for provenance.

**Rules:**

1. **Sync scope** — Gmail sync queries only messages with the configured scan label within the configured scan period (defaults: `ParcelScrubber`, 30 days); scan period controls how far back Gmail is searched, not which active parcels are kept.
2. **Order date** — for each parcel, the order date is the date of the **oldest linked Gmail message** for that parcel (recomputed when messages are linked or merged).
3. **Tracking-number dedupe** — when extraction yields a tracking number, sync links the message to the existing parcel with that normalized tracking number or creates a new parcel when none exists.
4. **Carrier-before-store enrichment** — when a carrier-only message created or updated a parcel first and a later merchant message shares the same tracking number, sync links the merchant message and fills **null or empty** parcel fields from merchant extraction; non-empty values already on the parcel are preserved.
5. **No age-based auto-archive** — parcels remain on the active list until the user marks Delivered or removes them; sync never archives by order date or age.
6. **Archive, not delete** — remove and mark Delivered both move to archive; parcels are retained for lookup, not permanently erased in MVP.
7. **Sync idempotency** — archived parcels are not restored to the active list automatically on a later Gmail sync.
8. **Manual restore / undeliver** — user may restore any archived parcel to the active list regardless of order date, and may undeliver (reverse Delivered) the same way.
9. **Manual merge** — user may merge multiple parcels into one; all linked messages move to the survivor, earliest order date wins, duplicate parcel rows are removed.
10. **Source mail surfacing** — each parcel row can expand to list linked Gmail messages with outbound links to Gmail.

**Encounter in flow:** user may configure sync scope in settings (defaults apply) → user triggers Sync → merchant and carrier messages extract and dedupe by tracking number → imported parcels land on active list → user may expand rows to inspect source mail, edit, merge mis-split parcels, remove, mark Delivered, restore, or undeliver → archive holds only user-dismissed parcels until restored.

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
- **Configurable merchant sender list in app settings** — v1 uses a hardcoded Allegro/AliExpress sender allowlist in sync orchestration; Gmail filters + scan label remain the primary scope gate.
- **Multi-user collaboration** — no shared household views or team workspaces.
- **Hard delete** — parcels are archived, not permanently erased, in MVP.
- **Age-based auto-archive** — sync does not move parcels to archive by order date or age.

## Open Questions

1. **target_scale ballparks (qps, data_volume)** — Not specified in shape-notes. Owner: user. Tech stack chosen 2026-05-19 (`context/foundation/tech-stack.md`); ballparks still optional for solo/local MVP. Block: no.
