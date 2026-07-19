<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Parcel Email Expandable Rows

- **Plan**: context/changes/parcel-email-expandable-rows/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-07-19
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned gmail-message-url helper

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: apps/web/src/app/core/parcels/gmail-message-url.ts
- **Detail**: Plan listed inline FR-019 Gmail URLs in Active/Archive templates; implementation extracted a 3-line `gmailMessageUrl()` helper shared by both lists and their specs. Not a forbidden shared expandable-table abstraction; supports the planned link contract without expanding API surface.
- **Fix A ⭐ Recommended**: Document the helper as a plan addendum under Phase 3
  - Strength: Keeps plan as source of truth; preserves a sensible DRY choice already covered by specs.
  - Tradeoff: Plan becomes slightly retrospective.
  - Confidence: HIGH — helper matches FR-019 URL exactly; used only for planned links.
  - Blind spot: None significant.
- **Fix B**: Inline the URL string in both components and specs; delete the helper
  - Strength: Strict plan-file match.
  - Tradeoff: Duplicates the URL in four places; worse for future FR-019 tweaks.
  - Confidence: HIGH — mechanical change.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F2 — List responses embed unbounded messages[]

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/api/src/parcels/parcels.service.ts:47-86
- **Detail**: `listForUser` includes all linked Gmail messages per parcel with no per-parcel cap. Plan Performance section explicitly accepts this for personal mailbox volumes. Amplifies payload vs pre-S-07 flat list.
- **Fix**: No change for this slice — track pagination / message limit only if volumes grow.
- **Decision**: ACCEPTED — intentional for personal-scale MVP per plan Performance section; no code change

### F3 — Templates assume messages is always defined

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/app/features/active/active-list.component.html:94
- **Detail**: `parcel.messages.length` (and Archive equivalent) with no optional chaining. API mapper always returns `messages: []` and web types require the field — safe when API and web ship together. A stale API omitting `messages` would throw at render.
- **Fix**: Optional `parcel.messages?.length` / normalize `?? []` at the list boundary if rolling deploys matter; otherwise leave as-is.
- **Decision**: SKIPPED

### F4 — gmailMessageUrl does not encodeURIComponent the id

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/app/core/parcels/gmail-message-url.ts:1-3
- **Detail**: Sibling `preview-generated-tracking-url.ts` encodes query values; Gmail id is interpolated raw into a hash fragment. Fixed `https://mail.google.com` host — no open-redirect/XSS. Encoding might alter Gmail hash routing; FR-019 specifies this exact shape.
- **Fix**: Leave as-is unless opaque ids with reserved hash characters appear in production.
- **Decision**: ACCEPTED — leave as-is; FR-019 hash URL shape; encoding may break Gmail routing
