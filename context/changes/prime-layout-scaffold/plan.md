# PrimeNG UI Layout Scaffold Implementation Plan

## Overview

Install and configure PrimeNG on the Angular 21 web app, replace the CLI welcome scaffold with an auth-aware app shell, and land lazy-loaded routing stubs with a stub `isLoggedIn` toggle so both logged-in and logged-out header states are testable without OAuth. F-02 replaces the stub auth service with real session management; feature slices (S-01–S-03) replace placeholder page content.

## Current State Analysis

**Web (blank UI):** Standalone `App` root component with CLI welcome template (~340 lines inline CSS in `app.html`), empty `app.routes.ts`, no UI library in `apps/web/package.json`. Root uses external `app.scss` (empty) and global `styles.scss` (placeholder comment only).

**Downstream dependency:** `web-oauth-app-shell` (F-02) plan was written assuming it builds the shell and excludes the UI library. F-01 now owns the shell; F-02 should wire OAuth into existing header slots (Login/Logout, avatar/name) rather than recreate layout.

**Gap:** No PrimeNG, no layout shell, no routes, no way to preview navigation chrome for Active/Archive/Settings.

### Key Discoveries:

- Angular 21 scaffold uses `app.ts` / class `App`, not `app.component.ts` (`apps/web/src/app/app.ts`).
- PrimeNG v21 uses `primeng` + `@primeuix/themes` with `providePrimeNG({ theme: { preset: Aura } })` and `provideAnimationsAsync()` (`primeng.org/installation`).
- Dev proxy and relative `/api/...` rule unchanged (`apps/web/proxy.conf.json`, AGENTS.md).
- Vitest via `@angular/build:unit-test`; standalone component tests use `imports: [Component]` (`apps/web/src/app/app.spec.ts`).

## Desired End State

Running `npm run dev` and opening `http://localhost:4200` shows:

1. **Logged out:** Landing hero at `/` with app branding and a prominent Login button. Header shows app name (left) and Login (right) only — no Active/Archive toggle, no Settings, no Logout.
2. **Click Login:** Stub `isLoggedIn` becomes `true`; user navigates to `/active`. Header shows full chrome: app name, Active/Archive `SelectButton` (Active selected), placeholder avatar + display name, Settings cog, Logout.
3. **SelectButton:** Switching Archive navigates to `/archive` and back to Active navigates to `/active`; URL and selection stay in sync during in-session navigation and browser back (refresh persistence deferred to F-02 session cookies).
4. **Settings cog:** Navigates to `/settings` (SelectButton shows no selection while on settings).
5. **Click Logout:** Stub `isLoggedIn` becomes `false`; user returns to `/` landing. Direct navigation to `/active` while logged out redirects to `/`.
6. `npm run lint`, `npm run test:web`, and `npm run build` pass.

## What We're NOT Doing

- Real Google OAuth, `HttpClient`, `APP_INITIALIZER` session probe, or JWT cookies (F-02)
- Gmail sync UI, parcel list rendering, or settings form fields (S-01, S-02)
- Real user avatar image or API-driven display name (static placeholder until F-02)
- Tailwind CSS
- Dark mode toggle
- Logo image asset (reserve layout slot/text only)
- API or NestJS changes
- Navigation tabs beyond Active/Archive in the center (Sync button deferred to S-02)

## Implementation Approach

Three phases: dependencies and theme first, then shell + stub auth (the bulk of UX), then routes/landing/tests. Use a root-level `AppShellComponent` wrapping all routes so header chrome is consistent. Stub auth lives in a dedicated injectable service with an `isLoggedIn` signal — F-02 replaces this service (or renames it) without touching shell templates. Protected routes use a functional guard reading the same signal.

## Critical Implementation Details

**SelectButton ↔ router sync:** On `NavigationEnd`, derive selected value from URL (`active` or `archive`). When path is `/settings`, clear SelectButton selection. On SelectButton change, call `router.navigate(['/', value])` — do not treat SelectButton state as the source of truth.

**Stub auth F-02 handoff:** Keep shell templates binding to `auth.isLoggedIn()` and `auth.user()` (optional stub user object with static `displayName`). F-02 implements the same public surface on `AuthService` so header markup survives unchanged.

**Landing vs protected routes:** Both render inside `AppShellComponent`. Logged-out users see landing content at `/`; logged-in users hitting `/` should redirect to `/active` (stub `guestGuard` or redirect logic in landing route).

## Phase 1: PrimeNG Setup

### Overview

Add PrimeNG packages and application-level theme/animation providers so components render correctly.

### Changes Required:

#### 1. Web workspace dependencies

**File**: `apps/web/package.json`

**Intent**: Add PrimeNG, theme preset package, icons, and animations peer required by PrimeNG components.

**Contract**: `dependencies` gains `primeng`, `@primeuix/themes`, and `primeicons` at versions compatible with Angular 21.2.x. Add `@angular/animations` only if a component errors without it at implement time (follow https://primeng.org/installation). Run `npm install` from repo root.

#### 2. Application config — theme and animations

**File**: `apps/web/src/app/app.config.ts`

**Intent**: Register PrimeNG Aura theme so interactive components (SelectButton, Button) work.

**Contract**: `providers` array adds `providePrimeNG({ theme: { preset: Aura } })` with imports from `primeng/config` and `@primeuix/themes/aura`. Add `provideAnimationsAsync()` from `@angular/platform-browser/animations/async` only if required per official install docs at implement time. Existing `provideRouter` and error listeners remain.

#### 3. Global styles

**File**: `apps/web/src/styles.scss`

**Intent**: Import PrimeIcons font and set minimal app-wide layout baseline (full-height body, box-sizing).

**Contract**: File imports `primeicons/primeicons.css`. Optional: CSS reset for `html, body { height: 100%; margin: 0; }` and `#root`/`app-root` block display. No Tailwind.

#### 4. Page title

**File**: `apps/web/src/index.html`

**Intent**: Replace CLI scaffold title with product name.

**Contract**: `<title>` becomes `Parcel Scrubber` (or consistent product string used in shell header).

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install` (repo root)
- Web lint passes: `npm run lint:web`
- Web build passes: `npm run build -w @parcel-scrubber/web`

#### Manual Verification:

- Temporary PrimeNG button in a dev-only spot renders with Aura styling (removed before phase completes, or verified via Phase 2 shell)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: App Shell and Stub Auth

### Overview

Create the auth-aware header layout and stub login/logout toggle. Slim root `App` to a bare router outlet entry if shell becomes the routed parent (see Phase 3 route map — root may route directly to shell).

### Changes Required:

#### 1. Stub auth service

**File**: `apps/web/src/app/core/auth/stub-auth.service.ts` (new)

**Intent**: Provide the simplest possible auth state for F-01 manual testing; F-02 replaces this implementation.

**Contract**: Injectable service exporting:
- `isLoggedIn` — writable `signal<boolean>` default `false`
- `user` — readonly signal with stub `{ displayName: 'Dev User', email: 'dev@local' }` when logged in, `null` when logged out
- `login()` — sets `isLoggedIn` to `true`
- `logout()` — sets `isLoggedIn` to `false`

No HttpClient, no persistence across refresh (acceptable for F-01 stub).

#### 2. Stub auth guard

**File**: `apps/web/src/app/core/auth/stub-auth.guard.ts` (new)

**Intent**: Redirect unauthenticated users away from protected routes to landing.

**Contract**: Functional `CanActivateFn` injects `StubAuthService` and `Router`. Returns `true` when `isLoggedIn()` is true; otherwise navigates to `'/'` and returns `false`. F-02 replaces with real `authGuard` reading API session.

#### 3. Guest redirect guard (optional but recommended)

**File**: `apps/web/src/app/core/auth/stub-guest.guard.ts` (new)

**Intent**: When already logged in, prevent showing landing — redirect to `/active`.

**Contract**: Functional guard: if `isLoggedIn()`, navigate to `/active` and return `false`; else return `true`. Applied only to landing route.

#### 4. App shell component

**File**: `apps/web/src/app/layout/app-shell/app-shell.component.ts` (+ `.html`, `.scss`, `.spec.ts`)

**Intent**: Single persistent chrome: conditional header + main `<router-outlet>`.

**Contract**: Standalone component importing PrimeNG modules needed for header (`ToolbarModule` or plain flex layout with `ButtonModule`, `SelectButtonModule`, `AvatarModule`) and `FormsModule` from `@angular/forms` (required for `p-selectButton` binding). Template structure:

- **Left:** App name text (`Parcel Scrubber`); optional commented logo `<img>` slot
- **Center** (`@if (auth.isLoggedIn())`): `p-selectButton` with options Active / Archive; bound per Critical Implementation Details
- **Right logged in:** `p-avatar` (initials fallback), display name text, icon button Settings (`pi pi-cog`, `routerLink="/settings"`), text/icon button Logout calling `auth.logout()` + `router.navigate(['/'])`
- **Right logged out:** `p-button` Login calling `auth.login()` + `router.navigate(['/active'])`
- **Main:** `<router-outlet />` below header

SCSS: flex header row (space-between), full-width main region. PrimeNG-only spacing — no Tailwind.

#### 5. Root App component cleanup

**File**: `apps/web/src/app/app.ts`, `apps/web/src/app/app.html`, `apps/web/src/app/app.scss`

**Intent**: Remove CLI welcome scaffold; root becomes routing entry only.

**Contract**: `App` template is `<router-outlet />` only (if shell is routed child) OR routes load shell directly from `app.routes.ts` with no extra wrapper. Remove `title` signal and welcome-specific code. Delete inline styles from former `app.html`.

### Success Criteria:

#### Automated Verification:

- Web lint passes: `npm run lint:web`
- Shell component spec creates component with stub auth: `npm run test:web`

#### Manual Verification:

- Login toggles header from minimal to full chrome
- Logout restores minimal header
- Settings cog visible only when logged in

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Routes, Landing, Placeholders, and Tests

### Overview

Wire the route tree, landing hero page, feature placeholders, and smoke tests. Verify stub guards and navigation end-to-end.

### Changes Required:

#### 1. Route configuration

**File**: `apps/web/src/app/app.routes.ts`

**Intent**: Define full route tree with lazy-loaded feature components under shell.

**Contract**:

```
{ path: '', component: AppShellComponent, children: [
    { path: '', pathMatch: 'full', loadComponent: landing, canActivate: [stubGuestGuard] },
    { path: 'active', loadComponent: activePlaceholder, canActivate: [stubAuthGuard] },
    { path: 'archive', loadComponent: archivePlaceholder, canActivate: [stubAuthGuard] },
    { path: 'settings', loadComponent: settingsPlaceholder, canActivate: [stubAuthGuard] },
  ]},
{ path: '**', redirectTo: '' }
```

Use dynamic `import()` for each feature component. Default authenticated entry is `/active` via guest guard + login navigation.

#### 2. Landing feature

**File**: `apps/web/src/app/features/landing/landing.component.ts` (+ `.html`, `.scss`)

**Intent**: Public marketing-style entry for logged-out users with a second Login CTA.

**Contract**: Standalone component with hero heading (product value prop), subtext, and large PrimeNG `p-button` Login that calls `StubAuthService.login()` and navigates to `/active`. Visually distinct from placeholder pages — centered layout, generous spacing. No API calls.

#### 3. Active placeholder

**File**: `apps/web/src/app/features/active/active-placeholder.component.ts` (+ `.html`, `.scss`)

**Intent**: Stub content until S-02 ships real parcel list.

**Contract**: Page heading "Active parcels" and one-line message that sync/list arrives in a later slice. Minimal PrimeNG `p-card` or plain section acceptable.

#### 4. Archive placeholder

**File**: `apps/web/src/app/features/archive/archive-placeholder.component.ts` (+ `.html`, `.scss`)

**Intent**: Stub content until S-03 ships archive view.

**Contract**: Page heading "Archive" and one-line placeholder message.

#### 5. Settings placeholder

**File**: `apps/web/src/app/features/settings/settings-placeholder.component.ts` (+ `.html`, `.scss`)

**Intent**: Stub content until S-01 ships settings form.

**Contract**: Page heading "Settings" and one-line message referencing Gmail label/scan period defaults coming later.

#### 6. App spec update

**File**: `apps/web/src/app/app.spec.ts`

**Intent**: Remove assertions against CLI welcome `h1`; keep minimal create test.

**Contract**: Spec imports `App` with `provideRouter([])` if needed; drops "Hello, bootstrap-scaffold" assertion.

#### 7. Routing and auth smoke tests

**Files**: `apps/web/src/app/layout/app-shell/app-shell.component.spec.ts`, `apps/web/src/app/core/auth/stub-auth.guard.spec.ts`, `apps/web/src/app/core/auth/stub-guest.guard.spec.ts`, `apps/web/src/app/core/auth/stub-auth.service.spec.ts`

**Intent**: Catch routing/auth wiring regressions without exhaustive PrimeNG DOM tests.

**Contract**: Required tests cover:
- `StubAuthService.login()` / `logout()` flip `isLoggedIn`
- `stubAuthGuard` redirects when logged out
- `stubGuestGuard` redirects when logged in
- Shell renders Login when logged out (query button text or role)
- Router navigates to `/active` when Login clicked (RouterTestingHarness or navigate + fixture)

### Success Criteria:

#### Automated Verification:

- Web lint passes: `npm run lint:web`
- Web tests pass: `npm run test:web`
- Web build passes: `npm run build -w @parcel-scrubber/web`
- Root test suite passes: `npm run test`

#### Manual Verification:

- Visit `/` logged out → landing hero + minimal header
- Login (header or hero) → `/active` + full header
- SelectButton → `/archive` and back
- Settings cog → `/settings`; SelectButton deselected
- Logout → `/` landing
- Direct `/active` while logged out → redirected to `/`
- Direct `/` while logged in → redirected to `/active`
- SelectButton switches routes when logged in
- Page refresh resets to logged out (stub does not persist — expected)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `StubAuthService` — login/logout toggle
- `stubAuthGuard` / `stubGuestGuard` — allow and redirect paths
- `AppShellComponent` — conditional Login vs Logout/SelectButton visibility
- Router smoke — navigation to `/active` after login

### Integration Tests:

- None in F-01 (no API coupling)

### Manual Testing Steps:

1. Open `/` — confirm landing layout and single Login in header
2. Click hero Login — confirm `/active`, full header, Active selected in SelectButton
3. Click Archive in SelectButton — confirm URL and placeholder content
4. Click Settings cog — confirm `/settings` placeholder
5. Click Logout — confirm return to landing, minimal header
6. While logged out, manually enter `/settings` in URL — confirm redirect to `/`
7. Run `npm run lint` and `npm run test:web`

## Performance Considerations

PrimeNG adds to initial bundle; lazy-loaded feature routes keep feature chunks separate. SelectButton and header modules should be imported only in shell component. Monitor `ng build` initial bundle against existing 500 kB warning budget.

## Migration Notes

No data migration. F-02 migration steps:
1. Replace `StubAuthService` with `AuthService` (same public signals/methods where possible)
2. Swap `stubAuthGuard` → `authGuard` using API session
3. Wire Login buttons to `window.location.assign('/api/auth/google')` instead of `login()`
4. Wire Logout to `POST /api/auth/logout`
5. Remove stub guest guard in favor of session-aware redirect

Update `context/changes/web-oauth-app-shell/plan.md` to remove duplicate shell/layout phases when F-02 implementation starts.

**F-02 prerequisite:** Do not run `/10x-implement web-oauth-app-shell` until F-01 is merged. Rewrite the F-02 plan first — it still assumes F-02 builds the shell, routes, and scaffold cleanup. F-02 should only wire OAuth/session into F-01's existing shell (Login/Logout slots, `AuthService` replacing `StubAuthService`, real guards). Align OAuth callback redirect with F-01 route map (`/` landing, not `/login`).

## References

- Roadmap F-01: `context/foundation/roadmap.md`
- Tech stack UI choice: `context/foundation/tech-stack.md`
- F-02 downstream plan: `context/changes/web-oauth-app-shell/plan-brief.md`
- Current web entry: `apps/web/src/app/app.ts`
- PrimeNG installation: https://primeng.org/installation

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: PrimeNG Setup

#### Automated

- [x] 1.1 Dependencies install cleanly: `npm install` (repo root) — 0b8c4bc
- [x] 1.2 Web lint passes: `npm run lint:web` — 0b8c4bc
- [x] 1.3 Web build passes: `npm run build -w @parcel-scrubber/web` — 0b8c4bc

#### Manual

- [x] 1.4 PrimeNG Aura styling visible on a component in the running dev app — 0b8c4bc

### Phase 2: App Shell and Stub Auth

#### Automated

- [x] 2.1 Web lint passes: `npm run lint:web`
- [x] 2.2 Shell component spec passes: `npm run test:web`

#### Manual

- [x] 2.3 Login toggles header from minimal to full chrome
- [x] 2.4 Logout restores minimal header
- [x] 2.5 Settings cog visible only when logged in

### Phase 3: Routes, Landing, Placeholders, and Tests

#### Automated

- [ ] 3.1 Web lint passes: `npm run lint:web`
- [ ] 3.2 Web tests pass: `npm run test:web`
- [ ] 3.3 Web build passes: `npm run build -w @parcel-scrubber/web`
- [ ] 3.4 Root test suite passes: `npm run test`

#### Manual

- [ ] 3.5 Logged-out landing and logged-in navigation flow verified end-to-end
- [ ] 3.6 Stub guards redirect correctly for protected routes and landing
- [ ] 3.7 SelectButton switches routes when logged in
