---
change_id: testing-critical-path-ownership-url-safety
title: Critical-path ownership and URL safety tests
status: impl_reviewed
created: 2026-07-24
updated: 2026-07-25
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path ownership & URL safety".
Risks covered: #1 (IDOR / cross-user parcel access), #2 (unsafe tracking URL). Test types planned: unit gaps + HTTP e2e.
Risk response intent:
- #1: prove User B gets 404/403 on mutate/read of A's parcel and B's list excludes A's id; challenge "JwtAuthGuard alone is enough"; avoid unit-only Prisma happy path.
- #2: prove unsafe URLs rejected on write and never returned as javascript:; challenge write-only validation; avoid assertions copied from production validator.
After creating the folder, follow the downstream continuation rule.
