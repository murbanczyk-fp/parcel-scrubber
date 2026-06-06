---
change_id: user-settings-model
title: User settings model
status: implementing
created: 2026-06-06
updated: 2026-06-06

## Notes

Revised plan (2026-06-06): switched from typed 1:1 `UserSettings` table to key–value EAV (`settingKey` + `settingValue`). Defaults app-only; no auth upsert hook; no row until first S-01 save; reset-to-default keeps row (upsert, no delete).
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->
