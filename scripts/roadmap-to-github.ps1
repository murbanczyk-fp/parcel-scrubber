# roadmap-to-github.ps1
# One-shot seed script: creates GitHub Issues + Project v2 from context/foundation/roadmap.md
# Reflects roadmap v3 (9 items: F-01..F-04, S-01..S-05, Streams A/B/C/D)
#
# Prerequisites:
#   gh auth refresh -h github.com -s project
#
# Run from repo root:
#   pwsh scripts/roadmap-to-github.ps1

$Repo      = "murbanczyk-fp/parcel-scrubber"
$Owner     = "murbanczyk-fp"
$ProjectTitle = "ParcelScrubber Roadmap"

# ---------------------------------------------------------------------------
# 1. Labels
# ---------------------------------------------------------------------------
Write-Host "Creating labels..."
gh label create foundation --repo $Repo --color "5319e7" --description "Prerequisite infrastructure slice" 2>&1 | Out-Null
gh label create slice      --repo $Repo --color "0075ca" --description "User-visible vertical slice"         2>&1 | Out-Null

# ---------------------------------------------------------------------------
# 2. Issues (in dependency order so #N cross-references resolve correctly)
# ---------------------------------------------------------------------------

# F-01 — no prereqs
Write-Host "Creating F-01..."
$f01Url = gh issue create --repo $Repo `
  --title "[F-01] Bootstrap PrimeNG and base app layout" `
  --label "foundation,enhancement" `
  --body @"
## Outcome
PrimeNG installed and configured; base app layout (header, main content region, optional nav) and routing stubs landed so feature slices plug into a consistent shell.

## Change ID
``prime-layout-scaffold``

## PRD refs
NFR (desktop browsers)

## Prerequisites
_None — can start immediately._

## Parallel with
F-03, F-04

## Unknowns
- Tailwind for layout utilities vs PrimeNG theming/layout alone — Owner: user. Block: no.

## Risk
First UI foundation — default to PrimeNG-first (components + layout primitives); add Tailwind only if confirmed gaps exist.

## Status
``proposed``

## Unlocks
F-02, S-01
"@ 2>&1
Write-Host "F-01: $f01Url"
$f01Num = ($f01Url -split "/")[-1]

# F-02 — prereq: F-01
Write-Host "Creating F-02..."
$f02Url = gh issue create --repo $Repo `
  --title "[F-02] Google sign-in and session placeholder shell" `
  --label "foundation,enhancement" `
  --body @"
## Outcome
User can sign in with Google (Gmail read scope granted); JWT session cookie works via dev proxy; authenticated session lands on a placeholder inside the F-01 layout — not a real active parcel list yet.

## Change ID
``web-oauth-app-shell``

## PRD refs
FR-001, FR-008, US-01, NFR (local session boundary)

## Prerequisites
- #$f01Num (F-01: Bootstrap PrimeNG and base app layout)

## Parallel with
F-03, F-04

## Risk
Absorbs the former standalone sign-in slice — keeps OAuth and layout integration out of the north-star sync work; placeholder is intentional under **speed** pressure.

## Status
``proposed``

## Unlocks
S-01
"@ 2>&1
Write-Host "F-02: $f02Url"
$f02Num = ($f02Url -split "/")[-1]

# F-03 — no prereqs
Write-Host "Creating F-03..."
$f03Url = gh issue create --repo $Repo `
  --title "[F-03] Add Parcel model and migration" `
  --label "foundation,enhancement" `
  --body @"
## Outcome
Prisma ``Parcel`` (and related fields) migrated; API can persist active vs archive membership per authenticated user.

## Change ID
``parcel-prisma-model``

## PRD refs
FR-008, FR-009

## Prerequisites
_None — can start immediately._

## Parallel with
F-01, F-02, F-04

## Risk
Schema introduced before sync to avoid bolting persistence onto extraction mid-slice; scope is model + migration only, not Gmail logic.

## Status
``proposed``

## Unlocks
S-02, S-03, S-04, S-05
"@ 2>&1
Write-Host "F-03: $f03Url"
$f03Num = ($f03Url -split "/")[-1]

# F-04 — no prereqs
Write-Host "Creating F-04..."
$f04Url = gh issue create --repo $Repo `
  --title "[F-04] Extensible user settings persistence" `
  --label "foundation,enhancement" `
  --body @"
## Outcome
Extensible per-user settings storage landed; v1 fields are Gmail scan label (default ``ParcelScrubber``) and scan period in days (default 30); schema/API contract allows adding more settings without redesign.

## Change ID
``user-settings-model``

## PRD refs
FR-017, FR-003, FR-006, NFR (local session boundary)

## Prerequisites
_None — can start immediately._

## Parallel with
F-01, F-02, F-03

## Risk
Introduced before settings UI and sync so scoped import is not retrofitted; v1 ships two known settings but avoids one-off columns that block future settings.

## Status
``proposed``

## Unlocks
S-01, S-02
"@ 2>&1
Write-Host "F-04: $f04Url"
$f04Num = ($f04Url -split "/")[-1]

# S-01 — prereqs: F-01, F-02, F-04
Write-Host "Creating S-01..."
$s01Url = gh issue create --repo $Repo `
  --title "[S-01] Settings — Gmail label and scan period" `
  --label "slice,enhancement" `
  --body @"
## Outcome
User can open a settings page and configure Gmail scan label and scan period (how far back sync searches); defaults are label ``ParcelScrubber`` and last 30 days when unset.

## Change ID
``user-settings-page``

## PRD refs
FR-017, FR-003, FR-006, NFR (local session boundary)

## Prerequisites
- #$f01Num (F-01: Bootstrap PrimeNG and base app layout)
- #$f02Num (F-02: Google sign-in and session placeholder shell)
- #$f04Num (F-04: Extensible user settings persistence)

## Parallel with
F-03

## Risk
Security/performance gate for sync — ships before north star S-02 so first Sync never scans the full mailbox; defaults let Sync run without prior configuration if the user already labels mail ``ParcelScrubber``.

## Status
``proposed``
"@ 2>&1
Write-Host "S-01: $s01Url"
$s01Num = ($s01Url -split "/")[-1]

# S-02 — prereqs: S-01, F-03
Write-Host "Creating S-02..."
$s02Url = gh issue create --repo $Repo `
  --title "[S-02] Scoped Gmail sync and active parcel list" `
  --label "slice,enhancement" `
  --body @"
## Outcome
User can click Sync, see progress for long runs, and view imported parcels on the active list with order dates and generated tracking links for supported carriers. Sync queries only messages with the configured Gmail label (default ``ParcelScrubber``) within the configured scan period (default last 30 days), plus existing merchant-sender rules. Imported parcels are **not** auto-archived by age (FR-006).

## Change ID
``gmail-sync-active-parcels``

## PRD refs
US-01, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-014, FR-017

## Prerequisites
- #$s01Num (S-01: Settings — Gmail label and scan period)
- #$f03Num (F-03: Add Parcel model and migration)

## Parallel with
_None_

## Unknowns
- Exact Allegro/AliExpress sender addresses and template heuristics for ≥75% recall — Owner: user. Block: no.

## Risk
North star — extraction quality and sync progress NFR concentrate here; label and scan-period filters from S-01 bound Gmail scope before parsers run; FR-006 ensures sync never auto-archives by age.

## Status
``proposed``

> **North star milestone** — validates the PRD's primary success criteria (≥75% of real parcels in scan scope, working links for supported carriers).
"@ 2>&1
Write-Host "S-02: $s02Url"
$s02Num = ($s02Url -split "/")[-1]

# S-03 — prereq: S-02
Write-Host "Creating S-03..."
$s03Url = gh issue create --repo $Repo `
  --title "[S-03] Delivered/remove and archive view" `
  --label "slice,enhancement" `
  --body @"
## Outcome
User can mark a parcel Delivered or remove it from the active list and find it in archive with order date and tracking link intact.

## Change ID
``deliver-remove-archive``

## PRD refs
US-02, FR-009, FR-012, FR-013

## Prerequisites
- #$s02Num (S-02: Scoped Gmail sync and active parcel list)

## Parallel with
S-04

## Risk
Depends on real parcels from sync — intentionally after S-02 so archive semantics are testable against imported data.

## Status
``proposed``
"@ 2>&1
Write-Host "S-03: $s03Url"
$s03Num = ($s03Url -split "/")[-1]

# S-04 — prereq: S-02
Write-Host "Creating S-04..."
$s04Url = gh issue create --repo $Repo `
  --title "[S-04] Manual add/edit parcels and URL override" `
  --label "slice,enhancement" `
  --body @"
## Outcome
User can manually add a parcel not found by sync and edit fields including order date and tracking URL.

## Change ID
``manual-parcel-crud``

## PRD refs
FR-010, FR-011, FR-015

## Prerequisites
- #$s02Num (S-02: Scoped Gmail sync and active parcel list)

## Parallel with
S-03

## Risk
Secondary success criterion — parallel with S-03 after sync to fill gaps without blocking core import path.

## Status
``proposed``
"@ 2>&1
Write-Host "S-04: $s04Url"
$s04Num = ($s04Url -split "/")[-1]

# S-05 — prereq: S-03
Write-Host "Creating S-05..."
$s05Url = gh issue create --repo $Repo `
  --title "[S-05] Restore or undeliver any archived parcel" `
  --label "slice,enhancement" `
  --body @"
## Outcome
User can restore any archived parcel to the active list regardless of order date, and can undeliver (reverse Delivered) the same way.

## Change ID
``restore-undeliver-parcel``

## PRD refs
US-03, FR-016

## Prerequisites
- #$s03Num (S-03: Delivered/remove and archive view)

## Parallel with
_None_

## Risk
Requires archive flow from S-03 — restore/undeliver must not reintroduce age-based eligibility dropped in PRD v3.

## Status
``proposed``
"@ 2>&1
Write-Host "S-05: $s05Url"
$s05Num = ($s05Url -split "/")[-1]

Write-Host ""
Write-Host "All issues created:"
Write-Host "  F-01 #$f01Num  $f01Url"
Write-Host "  F-02 #$f02Num  $f02Url"
Write-Host "  F-03 #$f03Num  $f03Url"
Write-Host "  F-04 #$f04Num  $f04Url"
Write-Host "  S-01 #$s01Num  $s01Url"
Write-Host "  S-02 #$s02Num  $s02Url"
Write-Host "  S-03 #$s03Num  $s03Url"
Write-Host "  S-04 #$s04Num  $s04Url"
Write-Host "  S-05 #$s05Num  $s05Url"

# ---------------------------------------------------------------------------
# 3. Create GitHub Project v2
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Creating GitHub Project v2..."
gh project create --owner $Owner --title $ProjectTitle 2>&1 | Out-Null
$projectNum = (gh project list --owner $Owner --format json 2>&1 | ConvertFrom-Json).projects |
  Where-Object { $_.title -eq $ProjectTitle } | Select-Object -ExpandProperty number

Write-Host "Project number: $projectNum"
$projectId = (gh project list --owner $Owner --format json 2>&1 | ConvertFrom-Json).projects |
  Where-Object { $_.title -eq $ProjectTitle } | Select-Object -ExpandProperty id

# Link project to repo
Write-Host "Linking project to repo..."
gh project link $projectNum --owner $Owner --repo $Repo 2>&1 | Out-Null

# ---------------------------------------------------------------------------
# 4. Add custom fields (Stream A/B/C/D, Change ID)
# ---------------------------------------------------------------------------
Write-Host "Adding Stream field (A/B/C/D)..."
gh project field-create $projectNum --owner $Owner --name "Stream" --data-type "SINGLE_SELECT" --single-select-options "A,B,C,D" 2>&1 | Out-Null

Write-Host "Adding Change ID field..."
gh project field-create $projectNum --owner $Owner --name "Change ID" --data-type "TEXT" 2>&1 | Out-Null

# ---------------------------------------------------------------------------
# 5. Add issues to project and set field values
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Adding issues to project and setting fields..."

$fieldsJson      = gh project field-list $projectNum --owner $Owner --format json 2>&1 | ConvertFrom-Json
$statusField     = $fieldsJson.fields | Where-Object { $_.name -eq "Status" }
$streamField     = $fieldsJson.fields | Where-Object { $_.name -eq "Stream" }
$changeIdField   = $fieldsJson.fields | Where-Object { $_.name -eq "Change ID" }

$statusFieldId   = $statusField.id
$streamFieldId   = $streamField.id
$changeIdFieldId = $changeIdField.id
$todoOptionId    = ($statusField.options | Where-Object { $_.name -eq "Todo" }).id
$streamA         = ($streamField.options | Where-Object { $_.name -eq "A" }).id
$streamB         = ($streamField.options | Where-Object { $_.name -eq "B" }).id
$streamC         = ($streamField.options | Where-Object { $_.name -eq "C" }).id
$streamD         = ($streamField.options | Where-Object { $_.name -eq "D" }).id

$items = @(
  @{ url=$f01Url; stream=$streamA; changeId="prime-layout-scaffold" },
  @{ url=$f02Url; stream=$streamA; changeId="web-oauth-app-shell" },
  @{ url=$f03Url; stream=$streamB; changeId="parcel-prisma-model" },
  @{ url=$f04Url; stream=$streamC; changeId="user-settings-model" },
  @{ url=$s01Url; stream=$streamA; changeId="user-settings-page" },
  @{ url=$s02Url; stream=$streamA; changeId="gmail-sync-active-parcels" },
  @{ url=$s03Url; stream=$streamA; changeId="deliver-remove-archive" },
  @{ url=$s04Url; stream=$streamA; changeId="manual-parcel-crud" },
  @{ url=$s05Url; stream=$streamD; changeId="restore-undeliver-parcel" }
)

foreach ($item in $items) {
  Write-Host "  Adding $($item.changeId)..."
  $itemId = (gh project item-add $projectNum --owner $Owner --url $item.url --format json 2>&1 | ConvertFrom-Json).id

  gh project item-edit --project-id $projectId --id $itemId --field-id $statusFieldId   --single-select-option-id $todoOptionId  2>&1 | Out-Null
  gh project item-edit --project-id $projectId --id $itemId --field-id $streamFieldId   --single-select-option-id $item.stream    2>&1 | Out-Null
  gh project item-edit --project-id $projectId --id $itemId --field-id $changeIdFieldId --text $item.changeId                     2>&1 | Out-Null
  Write-Host "    OK — item $itemId"
}

Write-Host ""
Write-Host "Done! View the project at:"
Write-Host "  https://github.com/users/$Owner/projects/$projectNum"
