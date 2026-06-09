---
id: gmail-message-retrieval
roadmap: F-05
title: Gmail id list and full message fetch by id
status: archived
created: 2026-06-08
updated: 2026-06-09
archived_at: 2026-06-08T17:10:55Z
---

## Notes

Foundation Gmail service for S-02 sync and F-06 extraction. Two service methods plus authenticated test HTTP routes for manual verification.

**2026-06-09 amendment:** `getMessage` / `GmailMessage` now include `from`, `date`, and `subject` from `payload.headers` alongside decoded `body` text — one `messages.get` call supplies metadata F-06 and S-02 need without a separate metadata fetch per message.
