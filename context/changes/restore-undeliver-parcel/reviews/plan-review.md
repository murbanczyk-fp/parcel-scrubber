<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Restore Archived Parcel

- **Plan**: context/changes/restore-undeliver-parcel/plan.md
- **Mode**: Deep
- **Date**: 2026-07-05
- **Verdict**: SOUND (after triage)
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS (fixed F3) |
| Blind Spots | PASS (fixed F2) |
| Plan Completeness | PASS (fixed F1, F4) |

## Grounding

Grounding: 8/8 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — Progress missing Phase 1 typecheck criterion

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria / ## Progress
- **Detail**: Phase 1 lists three Automated Verification bullets (unit tests, lint, "Type checking passes via test compile") but Progress only has 1.1 and 1.2 under #### Automated. Item 1.3 is assigned to Manual ("N/A") instead.
- **Fix**: Add `- [ ] 1.3 Type checking passes via test compile` under Phase 1 #### Automated; renumber Manual to 1.4.
- **Decision**: FIXED

### F2 — Archive 404 handling contradicts Active list pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — ArchiveListComponent contract
- **Detail**: Phase 3 says "mirror active list error handling" but also "reload archived list" on 404. Active list does toast only on 404, no reload. After optimistic row removal, reload on 404 is the right Archive behavior.
- **Fix A ⭐ Recommended**: Replace "mirror active list error handling" with explicit Archive rules: 404/400/5xx → toast + reload via listArchived(); 401 → session-expired toast.
- **Decision**: FIXED via Fix A

### F3 — Plan claims reuse of private runParcelAction

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Implementation Approach / Phase 3
- **Detail**: Plan references reusing `runParcelAction`, but that method is `private` in ActiveListComponent. Archive must duplicate the pattern.
- **Fix**: Change wording to "duplicate the Active list optimistic-action pattern" and note `listArchived()` for rollback reload.
- **Decision**: FIXED

### F4 — IN_TRANSIT 400 e2e marked optional but trivial

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — e2e contract
- **Detail**: Scenario 5 is optional but `createParcel` already accepts `{ status: ParcelStatus.IN_TRANSIT }`.
- **Fix**: Make IN_TRANSIT → 400 a required e2e scenario (drop "Optional").
- **Decision**: FIXED

### F5 — PRD Restore/Undeliver label divergence documented

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: plan-brief Open Risks
- **Detail**: PRD US-03 names separate Restore and Undeliver actions; plan uses unified "Restore". Already noted in plan-brief Open Risks.
- **Fix**: No plan change required unless product wants label parity.
- **Decision**: ACCEPTED

## Triage Summary

- **Fixed:** F1, F2 (Fix A), F3, F4 (4)
- **Accepted:** F5 (1)
- **Verdict after fixes:** SOUND
