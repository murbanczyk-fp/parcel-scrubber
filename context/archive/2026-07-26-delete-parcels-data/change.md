---
change_id: delete-parcels-data
title: Delete a user's parcel data from Settings
status: archived
created: 2026-07-26
updated: 2026-07-26
archived_at: 2026-07-26T18:59:23Z
---

## Notes

I will need a new feature which would remove the parcels in the app . SQL would be sth like:
TRUNCATE TABLE "parcel_emails", "gmail_messages", "parcel_status_events", "parcels" CASCADE;
with a WHERE clause for user. The button to execute it, shouiild be placed in Settings, and should require some "hard" confirmation, like a requirement to fill a input with "DELETE" text.
