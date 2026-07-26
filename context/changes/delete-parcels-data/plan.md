# Delete Parcel Data from Settings Implementation Plan

## Overview

Add a production Settings “danger zone” that permanently clears all parcel and
Gmail-ingest data owned by the authenticated user. The action is guarded in the
web UI by requiring the user to type `DELETE`, while the API remains an
authenticated, bodyless command that reuses the existing dev reset semantics.

## Current State Analysis

The application already has the required database operation in the dev-only
`POST /api/test/reset-sync` controller. It deletes `parcel_emails`,
`parcel_status_events`, `parcels`, and `gmail_messages` for the authenticated
user in one Prisma transaction and returns deleted-row counts. That controller
is excluded from production.

The production Settings API currently exposes only authenticated GET and PATCH
operations for Gmail scan preferences. The Settings page contains one
preferences card and has no destructive-action UI. PrimeNG `p-dialog` is
already used when a confirmation requires form input; the simpler global
ConfirmDialog supports only yes/no actions.

The frame investigation established that the four-table boundary is correct:
deleting the Gmail message ledger is required so a later Sync can process those
messages again. `users` and `user_settings` must remain intact.

## Desired End State

An authenticated user can open Settings, enter a clearly separated danger
zone, and open a modal explaining the permanent wipe. The destructive button
is enabled only when the user has typed the exact text `DELETE`. Confirming
calls a production Settings endpoint, closes the dialog on success, clears its
input, and shows a success toast while keeping the user on Settings.

The endpoint deletes only the requesting user’s rows from all four
parcel/Gmail-ingest tables in one transaction and returns the existing
deleted-count response. It preserves login and user settings. Direct
authenticated API calls are intentionally not required to send `DELETE`; the
typed phrase is a client-side safety gate selected during planning.

### Key Discoveries:

- The existing wipe transaction and response contract live in
  `apps/api/src/sync/sync-test.controller.ts:8-43`.
- The test reset route is excluded from production by
  `apps/api/src/sync/sync.module.ts:11-16`.
- Settings handlers use per-method `JwtAuthGuard` and delegate to
  `SettingsService` in `apps/api/src/settings/settings.controller.ts:16-43`.
- `SettingsService` already owns a `PrismaService` dependency, so the
  production endpoint can remain thin without a module dependency change
  (`apps/api/src/settings/settings.service.ts:24-28`).
- Settings web calls use relative `/api/settings` URLs and Promise-returning
  methods (`apps/web/src/app/core/settings/settings.service.ts:10-24`).
- Rich confirmation UI follows the `p-dialog` input/output/loading pattern in
  `apps/web/src/app/features/parcels/merge-parcels-dialog.component.ts:35-152`.
- The current Settings page toast and async-state conventions are in
  `apps/web/src/app/features/settings/settings-page.component.ts:48-155`.

## What We're NOT Doing

- Adding per-parcel hard delete to active or archive lists.
- Deleting the authenticated `users` row, OAuth token, session, or
  `user_settings`.
- Using `TRUNCATE`, raw SQL, or any unscoped database operation.
- Requiring the confirmation phrase in the HTTP request body or validating it
  server-side; authenticated direct API clients can invoke the command.
- Blocking, cancelling, or inspecting an in-progress sync job before wiping.
- Navigating away from Settings or displaying individual deleted-row counts in
  the UI.
- Automatically starting Sync after the wipe.
- Adding a database migration or schema change.
- Adding a new HTTP/database e2e test; this slice uses API and web unit tests.
- Changing the existing deploy-time global clear command.

## Implementation Approach

Extract the existing per-user Prisma transaction and count mapping into a
single shared API helper. Keep the dev test route operational by delegating it
to that helper, and expose the same behavior through an authenticated
production Settings POST via `SettingsService`.

On the web, extend the Settings client with a bodyless POST method and add a
dedicated typed-confirmation dialog component. The Settings page owns dialog
visibility and request state, renders a separate danger-zone card, and handles
success/error toasts. This keeps the existing preferences form independent
from the destructive action.

## Critical Implementation Details

### State sequencing

The helper must keep all four scoped deletes in a single Prisma transaction.
`parcel_status_events` has no direct `userId`, so its delete remains filtered
through `parcel.userId`. On successful UI completion, close and reset the
dialog before showing the success state; on failure, keep it open so the user
can retry.

### User experience spec

The exact, case-sensitive confirmation phrase is `DELETE`. While the request is
pending, the dialog cannot be dismissed and both actions are disabled as
appropriate. The danger-zone copy must state that manual parcels, imported
parcels, status history, and scanned Gmail-message records are removed, while
login and Settings are preserved and a later Sync may re-import messages
within the configured label and scan period.

## Phase 1: Shared Wipe Operation and Production API

### Overview

Single-source the user-scoped delete transaction, preserve the dev reset route,
and expose it as an authenticated production Settings command.

### Changes Required:

#### 1. Shared parcel-data wipe helper

**File**: `apps/api/src/sync/delete-user-parcel-data.ts`

**Intent**: Extract the existing four-table transaction from
`SyncTestController` so production and dev endpoints cannot drift in table
scope, ownership filters, ordering, or response counts.

**Contract**: Export a `DeleteUserParcelDataResponse` type containing
`deletedParcelEmails`, `deletedStatusEvents`, `deletedParcels`, and
`deletedGmailMessages`, plus an async function accepting `PrismaService` and
`userId`. It performs one `$transaction` with user-scoped `deleteMany`
operations. Status events are scoped by `{ parcel: { userId } }`; all other
models use their direct `userId`.

#### 2. Existing dev reset route

**File**: `apps/api/src/sync/sync-test.controller.ts`

**Intent**: Preserve `POST /api/test/reset-sync` and its response while making
the controller delegate to the shared operation.

**Contract**: `resetSync()` continues accepting only the authenticated
`SessionUser` and returns the same four count fields. Remove the duplicated
transaction and local response type in favor of the shared helper contract.
The route remains non-production through existing module registration.

#### 3. Shared operation unit coverage

**File**: `apps/api/src/sync/delete-user-parcel-data.spec.ts`

**Intent**: Move the database-boundary assertions out of the controller spec
and verify the shared operation directly.

**Contract**: Mock all four Prisma delegates and `$transaction`; assert one
user’s direct and relational filters, all four response counts, and transaction
participation. This becomes the canonical test of the wipe boundary.

#### 4. Dev reset controller unit coverage

**File**: `apps/api/src/sync/sync-test.controller.spec.ts`

**Intent**: Keep focused coverage that the dev route delegates for the
authenticated user and preserves its response contract.

**Contract**: Update mocks/assertions to fit the extracted helper without
duplicating every Prisma ownership assertion already covered by the helper
spec.

#### 5. Production Settings service command

**File**: `apps/api/src/settings/settings.service.ts`

**Intent**: Add the production application operation while retaining the
existing Settings controller/service delegation pattern.

**Contract**: Add `clearParcelData(userId)` returning
`DeleteUserParcelDataResponse` and delegating to the shared helper with the
service’s `PrismaService`. Do not alter settings rows or existing GET/PATCH
validation.

#### 6. Authenticated Settings endpoint

**File**: `apps/api/src/settings/settings.controller.ts`

**Intent**: Expose the wipe through a production route scoped to the current
session user.

**Contract**: Add `POST /api/settings/clear-parcel-data`, guarded with
`JwtAuthGuard`, returning HTTP 200 and the four deleted counts. The endpoint
accepts no request body and calls `SettingsService.clearParcelData(user.id)`.

#### 7. Settings API unit coverage

**File**: `apps/api/src/settings/settings.controller.spec.ts`

**Intent**: Verify endpoint authorization, authenticated-user delegation, and
response forwarding using the existing Settings controller test style.

**Contract**: Include the POST handler in guard metadata assertions, test its
success path, and include the route in the unauthorized mini-app assertions.

**File**: `apps/api/src/settings/settings.service.spec.ts`

**Intent**: Verify `clearParcelData` passes the correct user identity into the
shared operation while existing preference behavior stays unchanged.

**Contract**: Extend the Prisma mock only as required by the shared operation
and assert the returned count response. Avoid re-testing all helper internals
in this spec.

### Success Criteria:

#### Automated Verification:

- Shared wipe/helper and affected API unit specs pass:
  `npm run test -w @parcel-scrubber/api -- delete-user-parcel-data.spec.ts sync-test.controller.spec.ts settings.service.spec.ts settings.controller.spec.ts`
- Full API unit suite passes: `npm run test:api`
- API lint passes: `npm run lint:api`
- API production build succeeds: `npm run build:api`

#### Manual Verification:

- In a local authenticated session, POSTing
  `/api/settings/clear-parcel-data` returns HTTP 200 with all four count fields.
- The same request leaves authentication and saved Gmail scan settings intact.
- The dev-only `/api/test/reset-sync` route continues to return its existing
  response outside production.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding to
Phase 2.

---

## Phase 2: Settings Danger Zone and Typed Confirmation

### Overview

Add the web client contract and a dedicated destructive confirmation dialog,
then integrate it into Settings with clear pending, success, and failure
behavior.

### Changes Required:

#### 1. Settings clear-data client contract

**File**: `apps/web/src/app/core/settings/settings.types.ts`

**Intent**: Represent the API count response even though the Settings page does
not surface individual counts.

**Contract**: Add a `DeleteUserParcelDataResponse` type aligned with the four
API count fields. Do not add a confirmation request type because the endpoint
has no body.

**File**: `apps/web/src/app/core/settings/settings.service.ts`

**Intent**: Provide the Settings feature with a typed production API call.

**Contract**: Add `clearParcelData()` that sends a bodyless POST to the relative
URL `/api/settings/clear-parcel-data` and resolves to
`DeleteUserParcelDataResponse`.

**File**: `apps/web/src/app/core/settings/settings.service.spec.ts`

**Intent**: Lock the HTTP method, relative URL, bodyless contract, and response
mapping.

**Contract**: Add an `HttpTestingController` case for the clear method and its
four count fields.

#### 2. Typed destructive confirmation dialog

**Files**:

- `apps/web/src/app/features/settings/clear-parcel-data-dialog.component.ts`
- `apps/web/src/app/features/settings/clear-parcel-data-dialog.component.html`
- `apps/web/src/app/features/settings/clear-parcel-data-dialog.component.scss`
- `apps/web/src/app/features/settings/clear-parcel-data-dialog.component.spec.ts`

**Intent**: Isolate the hard-confirm interaction from the preference form and
make its exact-match, reset, and pending-state behavior directly testable.

**Contract**: Create a standalone `p-dialog` component with `visible` and
`submitting` inputs, `visibleChange` and `confirmed` outputs, an input bound to
the confirmation phrase, and Cancel/Delete actions. Confirm is enabled only
for exact `DELETE` while not submitting. Opening a fresh dialog resets prior
input. While submitting, dismissal and cancellation are blocked and the
destructive action displays loading. Include stable `data-testid` hooks for
the phrase input and both actions.

#### 3. Settings danger-zone integration

**File**: `apps/web/src/app/features/settings/settings-page.component.ts`

**Intent**: Own the danger-zone workflow without coupling it to preference
form dirty/saving state.

**Contract**: Import the dialog component; add independent visibility and
clearing signals. Opening the danger zone shows the dialog. Confirmation calls
`SettingsService.clearParcelData()`. On success, close/reset the dialog and
show a success toast; on failure, retain the dialog and show an error toast.
No sync-job lookup, navigation, automatic Sync, or deleted-count display is
added.

**File**: `apps/web/src/app/features/settings/settings-page.component.html`

**Intent**: Make the destructive feature discoverable but visually separate
from ordinary preferences.

**Contract**: Render a second card/section after the preferences card with a
“Danger zone” heading, irreversible-action warning, and destructive “Delete
parcel data” button. Wire the typed dialog outside the settings `<form>` so it
cannot trigger `onSave()`.

**File**: `apps/web/src/app/features/settings/settings-page.component.scss`

**Intent**: Style the danger zone and warning hierarchy consistently with
PrimeNG tokens and existing Settings BEM conventions.

**Contract**: Add spacing between cards, destructive border/text treatment,
and responsive dialog/page layout without introducing new global styles.

#### 4. Settings page workflow unit coverage

**File**: `apps/web/src/app/features/settings/settings-page.component.spec.ts`

**Intent**: Verify the page coordinates the service and user feedback without
regressing preference editing.

**Contract**: Extend the `SettingsService` mock with `clearParcelData`. Test
that the danger action opens the dialog, a confirmed action invokes the service
once, success closes the dialog, and failure keeps it available for retry.
Preserve all existing load/save/validation tests.

### Success Criteria:

#### Automated Verification:

- Settings client, dialog, and page unit specs pass:
  `npm run test -w @parcel-scrubber/web -- --include="**/{settings.service,clear-parcel-data-dialog,settings-page.component}.spec.ts"`
- Full web unit suite passes: `npm run test:web`
- Web lint passes: `npm run lint:web`
- Web production build succeeds: `npm run build:web`
- Full repository unit suite passes: `npm run test`
- Full repository lint passes: `npm run lint`
- Full repository build succeeds: `npm run build`

#### Manual Verification:

- Settings shows a visually separate danger zone without changing the
  preference form’s Save behavior.
- The dialog clearly describes what is and is not deleted; Delete remains
  disabled for empty, partial, and case-mismatched phrases and enables only for
  exact `DELETE`.
- During deletion, the dialog cannot be dismissed and duplicate submission is
  prevented.
- A successful wipe closes and resets the dialog, keeps the user on Settings,
  and shows a success toast; reopening requires typing `DELETE` again.
- A failed request shows an error toast and leaves the dialog open for retry.
- After success, Active and Archive contain no parcels; login and settings
  remain; a later Sync can re-import matching Gmail messages.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation that the destructive UX and
real-data behavior are correct.

---

## Testing Strategy

### Unit Tests:

- Shared API helper: all four user scopes, relational status-event scope,
  transaction grouping, and count mapping.
- Settings API: JWT guard metadata, current-user delegation, HTTP 200 response,
  and unauthorized rejection.
- Dev reset controller: compatibility after extraction.
- Web Settings client: bodyless POST, relative URL, typed count response.
- Dialog: exact case-sensitive phrase, disabled/loading state, input reset,
  dismissal rules, and confirmation output.
- Settings page: open, submit, success, failure/retry, toast behavior, and
  preservation of existing preference tests.

### Integration Tests:

- No new automated HTTP/database e2e test is planned, per the selected testing
  depth.
- Existing API unit tests exercise the Nest handler boundary; manual
  verification covers a real authenticated request and persisted rows.

### Manual Testing Steps:

1. Sign in and save non-default Gmail label and scan-period settings.
2. Create/import parcels including at least one manual parcel, status history,
   and linked Gmail messages.
3. Open Settings and verify the danger zone is separate from the preferences
   form.
4. Open the dialog and try empty, `delete`, whitespace-padded, and exact
   `DELETE` values.
5. Confirm the exact phrase, observe pending state, success toast, and that the
   dialog closes.
6. Verify Active and Archive are empty, while the session and saved settings
   remain.
7. Run Sync and confirm messages in the configured label/period can be
   reprocessed.
8. Simulate an API failure and confirm the dialog remains open with an error
   toast and no duplicate submission.

## Performance Considerations

The wipe is a single synchronous transaction with four indexed user-scoped
bulk deletes, matching the existing dev reset operation. No additional
performance mechanism is planned for the local single-user target. The UI must
show a loading state and prevent duplicate requests for the duration of the
transaction.

## Migration Notes

No Prisma schema or data migration is required. Deployment adds a production
route and web UI only. Rolling back the code removes access to the action but
cannot restore data already deleted; existing backup/restore procedures remain
the recovery mechanism.

## References

- Frame brief: `context/changes/delete-parcels-data/frame.md`
- Existing wipe: `apps/api/src/sync/sync-test.controller.ts:8-43`
- Production route gate: `apps/api/src/sync/sync.module.ts:11-16`
- Settings API: `apps/api/src/settings/settings.controller.ts:16-43`
- Settings service: `apps/api/src/settings/settings.service.ts:24-117`
- Settings web page: `apps/web/src/app/features/settings/settings-page.component.ts:35-232`
- Rich dialog pattern: `apps/web/src/app/features/parcels/merge-parcels-dialog.component.ts:35-152`
- Ops wipe boundary: `docs/deploy-unraid.md:137-143`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a
> step lands. Do not rename step titles.

### Phase 1: Shared Wipe Operation and Production API

#### Automated

- [ ] 1.1 Shared wipe/helper and affected API unit specs pass
- [ ] 1.2 Full API unit suite passes
- [ ] 1.3 API lint passes
- [ ] 1.4 API production build succeeds

#### Manual

- [ ] 1.5 Production Settings POST returns HTTP 200 with all four counts
- [ ] 1.6 Authentication and Gmail scan settings remain intact
- [ ] 1.7 Dev reset route preserves its existing response

### Phase 2: Settings Danger Zone and Typed Confirmation

#### Automated

- [ ] 2.1 Settings client, dialog, and page unit specs pass
- [ ] 2.2 Full web unit suite passes
- [ ] 2.3 Web lint passes
- [ ] 2.4 Web production build succeeds
- [ ] 2.5 Full repository unit suite passes
- [ ] 2.6 Full repository lint passes
- [ ] 2.7 Full repository build succeeds

#### Manual

- [ ] 2.8 Danger zone is separate from preference Save behavior
- [ ] 2.9 Exact DELETE phrase and pending-state guards work
- [ ] 2.10 Success closes and resets dialog while staying on Settings
- [ ] 2.11 Failure keeps dialog available for retry
- [ ] 2.12 Parcel/Gmail data is cleared while login and settings remain
- [ ] 2.13 Later Sync can re-import matching Gmail messages
