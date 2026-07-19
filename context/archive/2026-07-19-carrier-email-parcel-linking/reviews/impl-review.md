<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Carrier Email Parcel Linking

- **Plan**: context/changes/carrier-email-parcel-linking/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-07-19
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Manual Progress items stamped without separate evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/carrier-email-parcel-linking/plan.md:277-294
- **Detail**: Manual checks 1.5, 2.4–2.5, and 3.5–3.7 are marked `[x]` with the same SHA (`dab7dcb`) as the feature commit. That commit only contains code/tests/docs — no notes, screenshots, or other observable evidence of real-mailbox Sync for FEATURES_TO_COME A/B/C, manual description no-clobber, or tracking-link after CUSTOM→known enrichment. Automated unit + e2e coverage for create/enrich/no-tracking/failed paths is strong (`npm run test:api` 235 passed; lint clean), which may have been treated as a stand-in for manual QA.
- **Fix A ⭐ Recommended**: Re-run the three Manual steps against a real or fixture mailbox, then re-stamp Progress with a distinct note/SHA (or leave checked and add a one-line Notes entry under change.md confirming live Sync).
  - Strength: Matches the plan’s Manual vs Automated split and closes the rubber-stamp gap before archive.
  - Tradeoff: Requires a short Sync session against Gmail/fixtures.
  - Confidence: HIGH — plan explicitly lists these manual steps as human confirmation.
  - Blind spot: Whether the implementer already ran them offline and only omitted documentation.
- **Fix B**: Accept e2e coverage as sufficient for this slice; document that decision in change.md Notes.
  - Strength: Avoids blocking archive when HTTP/job e2e already covers A/B/C and no-clobber.
  - Tradeoff: Tracking-link UI after carrier enrichment (3.7) is not asserted by API e2e.
  - Confidence: MEDIUM — depends how much UI read-path confidence you want before S-07.
  - Blind spot: Haven’t verified live OpenRouter carrier extraction quality.
- **Decision**: SKIPPED

### F2 — Unrelated `.gitignore` entry in feature commit

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .gitignore:60
- **Detail**: Commit `dab7dcb` adds `.cursor/prompts/` — not described in the plan. Benign local-tooling ignore; no product behavior impact.
- **Fix**: Keep as-is (or note in a future chore commit if you prefer stricter commit hygiene).
- **Decision**: SKIPPED

## Automated verification (re-run 2026-07-19)

| Command | Result |
|---------|--------|
| `npm run test:api` | PASS — 35 suites, 235 tests |
| `npm run lint -w @parcel-scrubber/api` | PASS |

## Plan vs diff summary

| Area | Verdict |
|------|---------|
| Merge helper + CUSTOM/whitespace rules | MATCH |
| Upsert fill-null; no trackingUrl writes | MATCH |
| Sender gate removed; detectStoreFromSender only in ExtractionService | MATCH |
| Unit + e2e coverage rewrite | MATCH |
| NOT-DOING boundaries (UI, schema, allowlists, validation) | MATCH |
| `.gitignore` | EXTRA (benign) |
