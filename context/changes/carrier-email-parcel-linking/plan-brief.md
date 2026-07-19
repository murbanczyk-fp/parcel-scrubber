# Carrier Email Parcel Linking — Plan Brief

> Full plan: `context/changes/carrier-email-parcel-linking/plan.md`

## What & Why

Sync should treat carrier (and other non-merchant) Gmail under the scan label as first-class parcel sources: link or create by tracking number, then fill missing fields when store mail arrives later. That closes US-06 / FR-018 and FEATURES_TO_COME scenarios A/B/C without a separate UI slice.

## Starting Point

S-02 sync already lists labeled mail, ledgers Gmail ids, extracts via OpenRouter, and upserts by normalized tracking with `ParcelEmail` links. It still **skips unknown senders** before extraction and **overwrites** store/description/carrier on match. Tracking URLs are resolved at read time, not written by sync.

## Desired End State

After Sync, carrier-only messages appear as parcels (or attach to an existing tracking match). Later Allegro/AliExpress mail with the same tracking fills null/empty fields (e.g. store) without creating a duplicate or clobbering user edits. Blank store shows as `—` in the existing list until enriched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Which messages to extract | All under scan label; skip only if no usable tracking | Label already scopes mailbox; matches roadmap default / FR-018 |
| Enrichment rule | Fill null/empty only on all sync upserts | Protects user edits; one merge rule |
| Carrier-only store | Leave `store` null | Matches PRD AC; list already handles null |
| Better-later values | Strict fill-null; no merchant-wins special case | Keeps S-06 small; edit/merge cover corrections |
| Tracking URL | Rely on read-time `resolveTrackingUrl`; sync does not write URL | Enriching `carrier` from `CUSTOM` is enough; preserves manual overrides |
| UI scope | Sync/API only | S-06 is a sync behavior slice |
| No tracking after extract | Ledger + skip | Avoids repeat OpenRouter on junk labeled mail |
| Carrier empty for merge | Treat `CUSTOM` as empty when incoming has a known carrier; clear `customCarrierLabel` when merged carrier is non-`CUSTOM` | Default carrier would otherwise block enrichment; stale labels must not survive upgrades (mirror manual PATCH) |

## Scope

**In scope:** Sync merge helper; remove merchant gate; unit + e2e test updates for A/B/C and no-clobber.

**Out of scope:** UI polish; S-07 expandable rows; S-08 merge; settings allowlists; schema migrations; auto-clearing old ledger rows for previously skipped carrier mail.

## Architecture / Approach

```
SyncService.processMessage:
  getMessage → date ok?
  extract (no merchant gate)
  tracking usable? else ledger + skip
  find parcel by normalized tracking
  create (store may be null) OR update via fill-null merge
  ledger + ParcelEmail + orderDate = min(linked dates)
```

Displayed tracking link updates when `carrier` is enriched; DB `trackingUrl` override remains untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Fill-null sync merge | Upserts no longer clobber non-empty fields | `CUSTOM`-as-empty carrier rules must be precise |
| 2. Open non-merchant processing | Carrier mail creates/links parcels | More OpenRouter calls for misc labeled mail |
| 3. Tests & verification | A/B/C + no-clobber coverage | Pre-S-06 ledgered carrier ids stay skipped until cleaned |

**Prerequisites:** S-02 done; Gmail label + `OPENROUTER_API_KEY` for manual checks.

**Estimated effort:** ~1–2 sessions across 3 phases (same PR is fine).

## Open Risks & Assumptions

- Gmail ids ledgered under the old unknown-sender skip will not reprocess without manual ledger cleanup.
- `ExtractionError` (e.g. tracking + CUSTOM without label) ledgers as `failed` forever until cleanup — validation unchanged.
- Extraction prompt remains merchant-framed (`extraction-prompt.ts`); accepted for S-06 — revisit if carrier extraction quality is poor in manual QA.
- Weak carrier descriptions can block better later merchant text until edit/merge (accepted).
- Manual create/edit still requires store; only sync may create null-store parcels (list shows `—`; filling store in the form before save is expected).

## Success Criteria (Summary)

- Carrier mail with tracking imports or links; no duplicate when merchant mail shares tracking
- Missing store/description fill in; non-empty and user-edited values stay put
- Active list shows a working tracking link once carrier is a known enum value
