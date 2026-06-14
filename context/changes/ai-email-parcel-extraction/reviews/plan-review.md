<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Email Parcel Extraction Implementation Plan

- **Plan**: context/changes/ai-email-parcel-extraction/plan.md
- **Mode**: Deep
- **Date**: 2026-06-09
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 6/6 paths ✓, 3/3 symbols ✓, brief↔plan ✓

## Findings

### F1 — Null-on-miss runs after strict carrier validation

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment / Blind Spots
- **Location**: Phase 2 — ExtractionService contract
- **Detail**: Plan flow was OpenRouter JSON → validateExtractedFields → null-on-miss override. Model returning `{ trackingNumber: null, carrier: CUSTOM, customCarrierLabel: null }` on non-shipment emails would throw before override, breaking Desired End State #2.
- **Fix A ⭐ Recommended**: In ExtractionService, after parsing OpenRouter JSON, if trackingNumber is null/empty after trim → return null contract immediately, skipping validateExtractedFields.
  - Strength: Keeps validator strict for real extractions.
  - Tradeoff: Two code paths in the service.
  - Confidence: HIGH
  - Blind spot: None significant
- **Fix B**: Relax validateExtractedFields — skip CUSTOM label rule when trackingNumber is null/empty.
  - Strength: Single validation function.
  - Tradeoff: Validator becomes context-sensitive.
  - Confidence: HIGH
  - Blind spot: None significant
- **Decision**: FIXED via Fix A

### F2 — ExtractionModule missing AuthModule import

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 — ExtractionModule contract
- **Detail**: Plan listed `imports: [GmailModule]` only; JwtAuthGuard requires direct AuthModule import (Nest does not re-export transitive imports).
- **Fix**: Set `imports: [AuthModule, GmailModule]` in ExtractionModule.
- **Decision**: FIXED

### F3 — Progress 1.3 title mismatches Phase 1 manual criterion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress section — Phase 1 manual
- **Detail**: Progress 1.3 title did not match Phase 1 Manual Verification success criteria bullet.
- **Fix**: Rename Progress 1.3 to match success criteria title.
- **Decision**: FIXED

### F4 — validateExtractedFields return type includes store

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — validate-extracted-fields.ts contract
- **Detail**: Validator declared to return ExtractedParcelFields (includes store) but store is set in service, not validator.
- **Fix**: Add AiExtractedFields = Omit<ExtractedParcelFields, 'store'>; validator returns AiExtractedFields.
- **Decision**: FIXED

### F5 — OPENROUTER_MODEL not documented in README

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — README env note
- **Detail**: README mentions OPENROUTER_API_KEY but not OPENROUTER_MODEL; Phase 4 step was optional/skip-if-sufficient.
- **Fix**: Make Phase 4 README step required — add OPENROUTER_MODEL default line.
- **Decision**: FIXED
