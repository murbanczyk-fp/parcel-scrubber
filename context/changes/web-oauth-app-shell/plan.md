# Web OAuth and App Shell Implementation Plan

> **Rewritten 2026-06-06** after F-01 (`prime-layout-scaffold`) landed. This plan wires real Google OAuth + JWT session into the existing PrimeNG shell — it does **not** recreate `AppShellComponent`, `app.routes.ts` structure, landing layout, or placeholders.

## Overview

Replace F-01 stub auth with the NestJS Google OAuth + JWT session-cookie layer, bootstrap session state before routing, and land authenticated users on `/active` after OAuth callback. Roadmap **F-02** — auth plumbing on the F-01 layout shell; unlocks **S-01**.

## Current State Analysis

**API (ready):** Nest auth module exposes `GET /api/auth/google`, `GET /api/auth/google/callback` (sets httpOnly `session` cookie, redirects to `/`), `GET /api/auth/status`, `GET /api/auth/me`, `POST /api/auth/logout`. JWT is stateless; cookie options: `httpOnly`, `sameSite: 'lax'`, 7-day TTL (`apps/api/src/auth/auth.controller.ts`).

**Web (F-01 shell, stub auth):** PrimeNG `AppShellComponent` with header nav, `LandingComponent` at `/`, placeholder routes at `/active`, `/archive`, `/settings`. `StubAuthService` toggles a fake `Dev User`; `stubAuthGuard` / `stubGuestGuard` gate routes. No `HttpClient`, no `APP_INITIALIZER`, no real session probe. Dev proxy forwards `/api` → `localhost:4201` (`apps/web/proxy.conf.json`). Root `App` is already a bare `<router-outlet />`.

**Gap:** Stub auth must become real OAuth + cookie session. Sign-in must hit `/api/auth/google` (full-page redirect). OAuth callback still redirects to `/` instead of `/active`.

### Key Discoveries:

- Sign-in must use **full-page navigation** to `/api/auth/google` — not `HttpClient` (Passport redirect flow).
- Session probe uses `GET /api/auth/status` returning `SessionUser | { authenticated: false }` — no 401 on logged-out state.
- `SessionUser` shape: `{ id, email, displayName }` (`apps/api/src/auth/types.ts`).
- F-01 uses **landing at `/`** for guests, not a `/login` route — keep that map; guards redirect to `/` when unauthenticated.
- `StubAuthService` API surface (`isLoggedIn`, `user`, `login`, `logout`) is already consumed by shell, landing, and guards — real `AuthService` should preserve those names where possible to minimize template churn.
- Same-origin relative `/api/...` URLs only — no `localhost:4201` in browser code (AGENTS.md).

## Desired End State

A developer runs `npm run dev`, opens `http://localhost:4200`, sees the F-01 landing page, clicks Login, completes Google OAuth, lands on `/active` with JWT cookie set via proxy, sees header with display name + Sign out, and the existing active placeholder. Logout clears session and returns to `/`. Refresh on `/active` stays authenticated. `npm run lint` and `npm run test` pass.

### Verification checklist:

1. Unauthenticated visit to `/active` → redirect to `/` (landing)
2. Login on landing → Google consent → lands on `/active` with user display name in header
3. Page refresh on `/active` → still authenticated (cookie persists)
4. Sign out → `/`; `/active` blocked again
5. `GET /api/auth/status` returns user when cookie present
6. Authenticated visit to `/` → redirect to `/active` (guest guard)

## What We're NOT Doing

- Recreating `AppShellComponent`, route table shape, landing layout, or placeholder components (F-01 owns these)
- Adding a `/login` route (F-01 landing is the sign-in entry)
- Gmail sync UI or Sync button (S-02)
- Parcel data, list rendering, or Prisma `Parcel` model (F-03, S-02)
- FR-002 disconnect / Gmail token revocation flow (parked)
- Logout `clearCookie` `secure`/`sameSite` mirror fix (defer to deploy hardening)
- OAuth e2e automation against real Google
- Bearer-token interceptors (cookie auth only)

## Implementation Approach

Add `AuthService` + `APP_INITIALIZER` session probe first, then swap stub guards/service for real implementations in existing touchpoints (`app.routes.ts`, `LandingComponent`, `AppShellComponent`). Delete stub files after migration. One API change: OAuth callback redirects to `/active`. Preserve F-01 route map and PrimeNG shell markup — only change auth behavior.

## Critical Implementation Details

**Sign-in transport:** `window.location.assign('/api/auth/google')` — never `HttpClient.get` for the OAuth start endpoint.

**APP_INITIALIZER:** Call `AuthService.loadSession()` during bootstrap before first route render. Guards read cached state after initializer completes. On network failure, treat as unauthenticated.

**Stub → real mapping:**

| Stub (F-01) | Real (F-02) |
|---|---|
| `StubAuthService.login()` sets fake user | `signIn()` → `window.location.assign('/api/auth/google')` |
| `StubAuthService.logout()` clears signal | `logout()` → `POST /api/auth/logout`, clear session signal |
| `stubAuthGuard` → `/` when logged out | `authGuard` — same redirect target |
| `stubGuestGuard` → `/active` when logged in | `guestGuard` — same redirect target |
| `user()` returns `StubUser` | `user()` returns `SessionUser \| null` from status probe |

**Header login button:** When logged out, shell header still shows Login — wire to `signIn()` (OAuth redirect), not stub toggle + navigate.

## Phase 1: Auth Infrastructure

### Overview

Add HttpClient, session types, `AuthService`, and bootstrap session loading. **Keep all stub auth files** — guards, landing, and shell still import `StubAuthService` until Phase 2 rewires them.

### Changes Required:

#### 1. App config — HttpClient + initializer

**File**: `apps/web/src/app/app.config.ts`

**Intent**: Register `provideHttpClient()` and `provideAppInitializer(() => inject(AuthService).loadSession())`.

**Contract**: Initializer returns a Promise that resolves when the status probe completes (success or failure).

#### 2. Session types

**File**: `apps/web/src/app/core/auth/session-user.ts` (new)

**Intent**: Mirror API `SessionUser` and status response union.

**Contract**: Export `SessionUser` (`id`, `email`, `displayName: string | null`) and `AuthStatus` as `SessionUser | { authenticated: false }`. Type guard `isAuthenticatedStatus(status)` optional.

#### 3. AuthService

**File**: `apps/web/src/app/core/auth/auth.service.ts` (new — coexists with stubs until Phase 2)

**Intent**: Centralize session state, status probe, sign-in redirect, and logout. Wired via `APP_INITIALIZER` only; no component or guard imports yet.

**Contract**:
- `readonly session = signal<SessionUser | null>(null)`
- `readonly loading = signal(true)` until first probe completes
- `readonly isLoggedIn = computed(() => this.session() !== null)` — keeps F-01 template API
- `readonly user = computed(() => this.session())` — keeps F-01 template API
- `loadSession(): Promise<void>` — `GET /api/auth/status`, sets session signal, clears `loading`
- `signIn(): void` — `window.location.assign('/api/auth/google')`
- `logout(): Promise<void>` — `POST /api/auth/logout`, clear session signal
- All HTTP calls use relative `/api/auth/...` paths

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint:web`
- Unit tests pass: `npm run test:web`
- TypeScript build passes: `npm run build:web`

#### Manual Verification:

- App boots without console errors; stub auth UX unchanged (real session loads in background via initializer)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Wire OAuth Into F-01 Shell

### Overview

Replace stub guards, connect landing + shell to real auth, update API OAuth redirect. **Do not** restructure routes or recreate layout components.

### Changes Required:

#### 1. Guards — rename and rewire

**Files**:
- `apps/web/src/app/core/auth/auth.guard.ts` (new — replaces `stub-auth.guard.ts`)
- `apps/web/src/app/core/auth/guest.guard.ts` (new — replaces `stub-guest.guard.ts`)
- `apps/web/src/app/app.routes.ts` (update imports only)

**Intent**: Same guard behavior as stubs, backed by `AuthService`.

**Contract**:
- `authGuard`: if `!auth.isLoggedIn()`, `void router.navigate(['/']); return false` (match stub pattern)
- `guestGuard`: if `auth.isLoggedIn()`, `void router.navigate(['/active']); return false` (match stub pattern)
- Route table paths and components **unchanged** from F-01

#### 2. Landing sign-in

**File**: `apps/web/src/app/features/landing/landing.component.ts`

**Intent**: Login button triggers OAuth, not stub toggle.

**Contract**: `onLogin()` calls `auth.signIn()` only — remove `router.navigate(['/active'])` (OAuth callback handles landing).

#### 3. App shell auth actions

**File**: `apps/web/src/app/layout/app-shell/app-shell.component.ts`

**Intent**: Header Login/Logout use real auth.

**Contract**:
- `onLogin()` → `auth.signIn()` (remove stub login + navigate)
- `onLogout()` → `await auth.logout()` then `router.navigate(['/'])`
- Template: username span shows `auth.user()?.displayName ?? auth.user()?.email` (satisfies manual criterion 2.7 when Google omits display name)

#### 4. API OAuth callback redirect

**File**: `apps/api/src/auth/auth.controller.ts`

**Intent**: Land authenticated users on `/active` after Google callback.

**Contract**: Change `res.redirect('/')` to `res.redirect('/active')` in `googleCallback`.

**Testing note:** No `auth.controller` spec exists today — criterion 2.3 passes vacuously. Callback redirect is manual-only in F-02; add a controller spec when auth e2e coverage grows.

**Note:** Stub files remain until Phase 3 so `npm run test:web` stays green after the shell spec is rewired. Dead stub code is harmless once nothing imports it.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Web tests pass: `npm run test:web`
- API tests pass: `npm run test:api`
- Build passes: `npm run build`

#### Manual Verification:

- Visit `http://localhost:4200` → landing visible
- Click Login → Google OAuth → lands on `/active`
- Header shows user display name (or email fallback); active placeholder visible
- Refresh `/active` → still authenticated
- Sign out → `/`; `/active` redirects to landing
- Visit `/` while authenticated → redirects to `/active`
- Cookie visible in DevTools (httpOnly `session` on `localhost`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Auth Unit Tests

### Overview

Replace stub auth specs with tests for `AuthService`, `authGuard`, and `guestGuard`; update shell/landing specs.

### Changes Required:

#### 1. AuthService tests

**File**: `apps/web/src/app/core/auth/auth.service.spec.ts` (new)

**Contract**: Mock `HttpClient` with `HttpTestingController`. Cases: authenticated status sets session; `{ authenticated: false }` clears session; logout POST to `/api/auth/logout` clears session; `loading` flag lifecycle.

#### 2. Guard tests

**Files**:
- `apps/web/src/app/core/auth/auth.guard.spec.ts` (new)
- `apps/web/src/app/core/auth/guest.guard.spec.ts` (new)

**Contract**: Mock `AuthService` with controllable session/loading. `authGuard` → `/` when logged out; `guestGuard` → `/active` when logged in.

#### 3. Shell spec update

**File**: `apps/web/src/app/layout/app-shell/app-shell.component.spec.ts`

**Intent**: Use `AuthService` mock instead of `StubAuthService`. Login click should call `signIn()` (spy), not toggle + navigate. Logout should call `logout()`.

#### 4. Landing spec (if present)

**File**: `apps/web/src/app/features/landing/landing.component.spec.ts` (create or update)

**Contract**: Login button calls `signIn()`, not navigate.

#### 5. Remove stub files (after steps 1–4 and tests pass)

**Files** (delete only after guards, landing, shell, and specs no longer reference stubs):
- `stub-auth.service.ts`, `stub-auth.guard.ts`, `stub-guest.guard.ts`
- `stub-auth.service.spec.ts`, `stub-auth.guard.spec.ts`, `stub-guest.guard.spec.ts`

**Intent**: Single cutover after replacements exist — no file still imports stub symbols.

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
- `authGuard` / `guestGuard`: redirect vs allow based on session
- `AppShellComponent`: header states with mocked `AuthService`

### Integration Tests:

- None in F-02 (API e2e OAuth not worth automating for foundation slice)

### Manual Testing Steps:

1. Start `npm run dev` with valid `.env.local` Google credentials
2. Confirm `GOOGLE_CALLBACK_URL=http://localhost:4200/api/auth/google/callback`
3. Full sign-in → `/active` → refresh → sign-out cycle
4. Direct navigate to `/active` while logged out → `/`
5. Direct navigate to `/` while logged in → `/active`

## Performance Considerations

Single `GET /api/auth/status` on app bootstrap — negligible. No polling. Sign-in is one-time redirect flow.

## Migration Notes

No data migration. F-01 stub auth files are deleted in Phase 3 after replacement specs land — no runtime feature flag needed.

Deploy note: production `GOOGLE_CALLBACK_URL` must match nginx-exposed origin (see `docs/deploy-unraid.md`). Angular nginx already proxies `/api/` to Nest.

## References

- F-01 change: `context/changes/prime-layout-scaffold/`
- Roadmap F-02: `context/foundation/roadmap.md`
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

### Phase 2: Wire OAuth Into F-01 Shell

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Web tests pass: `npm run test:web`
- [ ] 2.3 API tests pass: `npm run test:api`
- [ ] 2.4 Build passes: `npm run build`

#### Manual

- [ ] 2.5 Visit localhost:4200 → landing visible
- [ ] 2.6 Login → Google OAuth → lands on `/active`
- [ ] 2.7 Header shows user display name; active placeholder visible
- [ ] 2.8 Refresh `/active` → still authenticated
- [ ] 2.9 Sign out → `/`; `/active` redirects to landing
- [ ] 2.10 Visit `/` while authenticated → redirects to `/active`
- [ ] 2.11 Cookie visible in DevTools (httpOnly `session` on localhost)

### Phase 3: Auth Unit Tests

#### Automated

- [ ] 3.1 `npm run test:web` passes with new auth specs
- [ ] 3.2 `npm run lint:web` passes
- [ ] 3.3 `npm run test` (full monorepo) passes

#### Manual

- [ ] 3.4 Re-run OAuth round-trip after test changes
