# Web OAuth and App Shell Implementation Plan

> **⚠️ Stale — requires rewrite before implementation.** This plan was written before F-01 (`prime-layout-scaffold`) owned the PrimeNG shell, routes, and scaffold cleanup. **Prerequisite:** merge F-01 first, then rewrite this plan to wire OAuth/session only — do not recreate `AppShellComponent`, `app.routes.ts`, or landing layout. See `context/changes/prime-layout-scaffold/plan.md` Migration Notes.

## Overview

Wire the Angular web app to the existing NestJS Google OAuth + JWT session-cookie auth layer, add routed shell layout with sign-in/logout, and show a minimal empty active-list placeholder at `/active`. This is roadmap **F-02** — auth plumbing on top of the F-01 layout shell; unlocks **S-01**.

## Current State Analysis

**API (ready):** Nest auth module exposes `GET /api/auth/google`, `GET /api/auth/google/callback` (sets httpOnly `session` cookie, redirects to `/`), `GET /api/auth/status`, `GET /api/auth/me`, `POST /api/auth/logout`. JWT is stateless (no server session store); cookie options: `httpOnly`, `sameSite: 'lax'`, 7-day TTL (`apps/api/src/auth/auth.controller.ts`).

**Web (blank):** Angular 21 scaffold with empty `app.routes.ts`, no `HttpClient`, no auth code, CLI placeholder template in `app.html`. Dev proxy forwards `/api` → `localhost:4201` (`apps/web/proxy.conf.json`).

**Gap:** No web-side session probe, sign-in entry, route protection, or app shell. OAuth callback lands at `/` but product default should be `/active`.

### Key Discoveries:

- Sign-in must use **full-page navigation** to `/api/auth/google` — not `HttpClient` (Passport redirect flow).
- Session probe uses `GET /api/auth/status` returning `SessionUser | { authenticated: false }` — no 401 on logged-out state.
- `SessionUser` shape: `{ id, email, displayName }` (`apps/api/src/auth/types.ts`).
- Same-origin relative `/api/...` URLs only — no `localhost:4201` in browser code (AGENTS.md).
- Only auth e2e test today: logged-out `/auth/status` (`apps/api/test/app.e2e-spec.ts`).

## Desired End State

A developer runs `npm run dev`, opens `http://localhost:4200`, is redirected to `/login`, clicks Sign in, completes Google OAuth, lands on `/active` with JWT cookie set via proxy, sees header with email + Sign out, and an empty active list message. Logout clears session and returns to `/login`. `npm run lint` and `npm run test` pass.

### Verification checklist:

1. Unauthenticated visit to `/active` → redirect to `/login`
2. Sign in → Google consent → lands on `/active` with user email in header
3. Page refresh on `/active` → still authenticated (cookie persists)
4. Sign out → `/login`, `/active` blocked again
5. `GET /api/auth/status` returns user when cookie present

## What We're NOT Doing

- Gmail sync UI or Sync button (S-02)
- Parcel data, list rendering, or Prisma `Parcel` model (F-02, S-02)
- Archive route or navigation tab (S-03)
- FR-002 disconnect / Gmail token revocation flow (parked)
- Logout `clearCookie` `secure`/`sameSite` mirror fix (defer to deploy hardening)
- OAuth e2e automation against real Google
- UI component library / design system
- Bearer-token interceptors (cookie auth only)

## Implementation Approach

Establish auth state first (`AuthService` + `APP_INITIALIZER`), then layer routing with a functional `authGuard` and shell parent component. Sign-in is a dedicated `/login` page with a button that navigates to `/api/auth/google`. Protected routes live under an `AppShellComponent` with child routes starting at `/active`. Replace the CLI scaffold in root `App` with a bare `<router-outlet>`. One API change: OAuth callback redirects to `/active`.

## Critical Implementation Details

**Sign-in transport:** `window.location.assign('/api/auth/google')` (or `href`) — never `HttpClient.get` for the OAuth start endpoint. Passport issues a 302 redirect chain that XHR cannot follow correctly.

**APP_INITIALIZER:** Call `AuthService.loadSession()` during bootstrap before first route render. The guard reads the cached signal; avoid duplicate status calls on every navigation. On network failure, treat as unauthenticated and let the guard redirect to `/login`.

**Route map:** `/login` (public) → `AppShellComponent` (guarded) → child `active` at path `active`. Root path `''` redirects to `active` when authenticated context is handled by guard/redirect logic.

## Phase 1: Auth Infrastructure

### Overview

Add HttpClient, session types, `AuthService`, and bootstrap session loading so the rest of the app has a single auth signal.

### Changes Required:

#### 1. App config — HttpClient + initializer

**File**: `apps/web/src/app/app.config.ts`

**Intent**: Register `provideHttpClient()` and an `APP_INITIALIZER` that calls `AuthService.loadSession()` before routing starts.

**Contract**: `ApplicationConfig.providers` gains `provideHttpClient()` and `provideAppInitializer(() => inject(AuthService).loadSession())` (or equivalent factory). Initializer must return a Promise/Observable that resolves when status probe completes.

#### 2. Session types

**File**: `apps/web/src/app/auth/session-user.ts` (new)

**Intent**: Mirror API `SessionUser` and status response union on the web client.

**Contract**: Export `SessionUser` (`id`, `email`, `displayName: string | null`) and `AuthStatus` as `SessionUser | { authenticated: false }`. Type guard `isAuthenticated(status)` optional but useful in guard/service.

#### 3. AuthService

**File**: `apps/web/src/app/auth/auth.service.ts` (new)

**Intent**: Centralize session state, status probe, sign-in redirect, and logout.

**Contract**:
- `readonly session = signal<SessionUser | null>(null)`
- `readonly loading = signal(true)` until first probe completes
- `loadSession(): Promise<void>` — `GET /api/auth/status`, sets session signal
- `signIn(): void` — `window.location.assign('/api/auth/google')`
- `logout(): Promise<void>` — `POST /api/auth/logout`, clear session signal
- `isAuthenticated(): boolean` — derived from session signal
- All HTTP calls use relative `/api/auth/...` paths

#### 4. Auth guard

**File**: `apps/web/src/app/auth/auth.guard.ts` (new)

**Intent**: Block unauthenticated access to shell routes; send users to `/login`.

**Contract**: Functional guard (`CanActivateFn`) injects `AuthService` and `Router`. If `!auth.isAuthenticated()`, return `router.createUrlTree(['/login'])`. Wait for `loading()` to be false if initializer still running (use `toObservable` + `filter` or check signal synchronously after initializer guarantee).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint:web`
- Unit tests pass: `npm run test:web`
- TypeScript build passes: `npm run build:web`

#### Manual Verification:

- App boots without console errors (auth files exist but routing not wired yet — may show empty outlet)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Routes, Shell & Placeholder

### Overview

Wire routes, login page, app shell with header, empty active list, replace CLI scaffold, update API OAuth redirect.

### Changes Required:

#### 1. Route table

**File**: `apps/web/src/app/app.routes.ts`

**Intent**: Define public login route, guarded shell parent, and active child; redirect root appropriately.

**Contract**:
- `{ path: 'login', loadComponent: ... LoginComponent }`
- `{ path: '', component: AppShellComponent, canActivate: [authGuard], children: [{ path: '', pathMatch: 'full', redirectTo: 'active' }, { path: 'active', loadComponent: ... ActiveListComponent }] }`
- `{ path: '**', redirectTo: '' }` (or `active`)

#### 2. Root app component

**Files**: `apps/web/src/app/app.ts`, `apps/web/src/app/app.html`, `apps/web/src/app/app.scss`

**Intent**: Strip CLI placeholder; root is only `<router-outlet />`.

**Contract**: Remove inline styles and welcome content from `app.html`. Update `app.spec.ts` to match (create test only, no h1 title assertion).

#### 3. Login page

**File**: `apps/web/src/app/auth/login/login.component.ts` (new, standalone)

**Intent**: Public entry point with Sign in button triggering `AuthService.signIn()`.

**Contract**: Minimal template — app name/title, paragraph, button `(click)="auth.signIn()"`. No auto-redirect to Google.

#### 4. App shell

**File**: `apps/web/src/app/layout/app-shell.component.ts` (new, standalone)

**Intent**: Authenticated layout wrapper with header and child outlet.

**Contract**: Template includes app title ("Parcel Scrubber" or similar), user email from `AuthService.session()`, Sign out button calling `auth.logout()` then `router.navigate(['/login'])`, and `<router-outlet />` for children. SCSS in component `styleUrl` — move away from inline template styles.

#### 5. Active list placeholder

**File**: `apps/web/src/app/parcels/active-list/active-list.component.ts` (new, standalone)

**Intent**: Minimal empty state for F-01; real list comes in S-02.

**Contract**: `<h1>Active parcels</h1>` and one line e.g. "No parcels yet." No Sync button, no table skeleton.

#### 6. Global styles baseline

**File**: `apps/web/src/styles.scss`

**Intent**: Minimal reset/typography so shell is readable (not CLI defaults).

**Contract**: Basic font stack, margin reset, header spacing tokens — keep under style budget.

#### 7. Index title

**File**: `apps/web/src/index.html`

**Intent**: Update page title from scaffold default.

**Contract**: `<title>Parcel Scrubber</title>`

#### 8. API OAuth callback redirect

**File**: `apps/api/src/auth/auth.controller.ts`

**Intent**: Land authenticated users on `/active` after Google callback.

**Contract**: Change `res.redirect('/')` to `res.redirect('/active')` in `googleCallback`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Web tests pass: `npm run test:web`
- API tests pass: `npm run test:api`
- Build passes: `npm run build`

#### Manual Verification:

- Visit `http://localhost:4200` → redirected to `/login`
- Click Sign in → Google OAuth → lands on `/active`
- Header shows user email; empty list message visible
- Refresh `/active` → still authenticated
- Sign out → `/login`; `/active` redirects to login
- Cookie visible in DevTools (httpOnly `session` on `localhost`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Auth Unit Tests

### Overview

Add focused unit tests for `AuthService` and `authGuard`; update root component test.

### Changes Required:

#### 1. AuthService tests

**File**: `apps/web/src/app/auth/auth.service.spec.ts` (new)

**Intent**: Verify status parsing, session signal updates, logout clears state.

**Contract**: Mock `HttpClient` with `HttpTestingController`. Cases: authenticated status sets session; `{ authenticated: false }` clears session; logout POST to `/api/auth/logout` clears session.

#### 2. Auth guard tests

**File**: `apps/web/src/app/auth/auth.guard.spec.ts` (new)

**Intent**: Verify guard allows authenticated users and redirects unauthenticated to `/login`.

**Contract**: Provide mock `AuthService` with controllable `session`/`loading` signals. Assert `UrlTree` to `/login` when logged out; `true` when logged in.

#### 3. Root app spec update

**File**: `apps/web/src/app/app.spec.ts`

**Intent**: Align with stripped root template.

**Contract**: Provide `RouterTestingModule` or mock router; remove h1 title assertion; test creates component with router-outlet.

### Success Criteria:

#### Automated Verification:

- `npm run test:web` passes with new auth specs
- `npm run lint:web` passes
- `npm run test` (full monorepo) passes

#### Manual Verification:

- Re-run OAuth round-trip once after test changes to confirm no regressions

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `AuthService`: status response mapping, logout, loading flag lifecycle
- `authGuard`: redirect vs allow based on session signal
- `App`: smoke create with router

### Integration Tests:

- None in F-01 (API e2e OAuth not worth automating for foundation slice)

### Manual Testing Steps:

1. Start `npm run dev` with valid `.env.local` Google credentials
2. Confirm `GOOGLE_CALLBACK_URL=http://localhost:4200/api/auth/google/callback`
3. Full sign-in → `/active` → refresh → sign-out cycle
4. Direct navigate to `/active` while logged out → `/login`

## Performance Considerations

Single `GET /api/auth/status` on app bootstrap — negligible. No polling. Sign-in is one-time redirect flow.

## Migration Notes

No data migration. Deploy note: production `GOOGLE_CALLBACK_URL` must match nginx-exposed origin (see `docs/deploy-unraid.md`). Angular nginx already proxies `/api/` to Nest.

## References

- Change brief: `context/changes/web-oauth-app-shell/change.md`
- Roadmap F-01: `context/foundation/roadmap.md`
- API auth: `apps/api/src/auth/auth.controller.ts`
- Web proxy: `apps/web/proxy.conf.json`
- PRD FR-001: `context/foundation/prd.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Auth Infrastructure

#### Automated

- [ ] 1.1 Lint passes: `npm run lint:web`
- [ ] 1.2 Unit tests pass: `npm run test:web`
- [ ] 1.3 TypeScript build passes: `npm run build:web`

#### Manual

- [ ] 1.4 App boots without console errors

### Phase 2: Routes, Shell & Placeholder

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Web tests pass: `npm run test:web`
- [ ] 2.3 API tests pass: `npm run test:api`
- [ ] 2.4 Build passes: `npm run build`

#### Manual

- [ ] 2.5 Visit localhost:4200 → redirected to `/login`
- [ ] 2.6 Sign in → Google OAuth → lands on `/active`
- [ ] 2.7 Header shows user email; empty list message visible
- [ ] 2.8 Refresh `/active` → still authenticated
- [ ] 2.9 Sign out → `/login`; `/active` redirects to login
- [ ] 2.10 Cookie visible in DevTools (httpOnly `session` on localhost)

### Phase 3: Auth Unit Tests

#### Automated

- [ ] 3.1 `npm run test:web` passes with new auth specs
- [ ] 3.2 `npm run lint:web` passes
- [ ] 3.3 `npm run test` (full monorepo) passes

#### Manual

- [ ] 3.4 Re-run OAuth round-trip after test changes
