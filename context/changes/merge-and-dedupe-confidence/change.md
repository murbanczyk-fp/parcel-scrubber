---
change_id: merge-and-dedupe-confidence
title: Merge and dedupe confidence tests
status: implemented
created: 2026-07-25
updated: 2026-07-25
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Merge & dedupe confidence".
Risks covered: #3 (merge/dedupe joins wrong parcels, drops linked emails, or leaves duplicates), #4 (Gmail sync enrichment overwrites user-set non-empty fields). Test types planned: unit + service/integration.
Risk response intent:
- #3: prove merge survivor is oldest; linked emails move to survivor; losers deleted; field conflicts follow PRD precedence; challenge "two happy-path merges prove the rule"; avoid expected values mirrored from production sort.
- #4: prove sync fills only null/empty fields and user-set non-empty values remain; challenge "upsert always overwrites every field"; prefer unit/integration on merge-from-extraction over full Gmail mailbox e2e.
