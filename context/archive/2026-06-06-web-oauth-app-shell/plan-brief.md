# Web OAuth and Session Shell — Plan Brief

> Full plan: `context/changes/web-oauth-app-shell/plan.md`

## What & Why

F-01 delivered the PrimeNG shell with stub auth — Login toggles a fake user in memory. F-02 swaps that for real Google OAuth and the Nest JWT session cookie so developers can sign in, stay signed in across refresh, and sign out. Authenticated users land on `/active` inside the existing layout; no parcel data yet. Unlocks **S-01** (settings).

## Starting Point

- **API (ready):** `GET /api/auth/google`, callback (sets httpOnly `session` cookie, redirects to `/`), `GET /api/auth/status`, `GET /api/auth/me`, `POST /api/auth/logout` (`apps/api/src/auth/auth.controller.ts`).
- **Web (F-01 shell):** `AppShellComponent`, `LandingComponent` at `/`, placeholders at `/active`, `/archive`, `/settings`. `StubAuthService` + `stubAuthGuard` / `stubGuestGuard` gate routes. No `HttpClient`, no `APP_INITIALIZER`. Dev proxy forwards `/api` → `:4201`.
- **Gap:** Stub auth must call the API; OAuth start needs full-page redirect; callback still lands on `/` not `/active`.

## Desired End State

`npm run dev` → open `http://localhost:4200` → landing with Login → Google OAuth → `/active` with JWT cookie, header shows display name (or email) + Sign out, active placeholder visible. Refresh keeps session. Sign out returns to `/`; `/active` blocked when logged out. Authenticated visit to `/` redirects to `/active`. Lint and tests pass.

## Key Decisions Made

| Decision | Choice | Why | Source |
| -------- | ------ | --- | ------ |
| Shell & routes | Keep F-01 layout unchanged | F-01 owns chrome; F-02 is auth wiring only | Plan |
| Sign-in entry | Landing at `/` (no `/login` route) | Matches F-01 route map and guest guard | Plan |
| OAuth start | `window.location.assign('/api/auth/google')` | Passport issues redirect chain XHR cannot follow | Plan |
| Session probe | `APP_INITIALIZER` + `GET /api/auth/status` | Single bootstrap probe; guards read cached signal | Plan |
| Auth state API | `isLoggedIn`, `user` computed signals preserved | Minimizes shell template churn | Plan |
| Guard behavior | Same redirects as stubs (`/` / `/active`) | Drop-in replacement for stub guards | Plan |
| Post-OAuth landing | API callback `res.redirect('/active')` | Product default is active list, not landing | Plan |
| Auth transport | httpOnly cookie only | Matches existing API; no bearer interceptors | Plan |
| Status errors | Network failure → unauthenticated | Guard sends user to landing; no blocking spinner | Plan |
| Testing | Unit tests for service + guards; no OAuth e2e | Real Google flow is manual-only for F-02 | Plan |
| Deferred | `clearCookie` secure/sameSite mirror, FR-002 disconnect | Deploy hardening / later slice | Plan |

## Scope

**In scope:**
- `AuthService`, session types, `HttpClient`, bootstrap initializer
- Replace stub service/guards with real implementations
- Wire landing + shell Login/Logout to OAuth + API logout
- API callback redirect to `/active`
- Auth unit tests; update shell spec; add landing spec

**Out of scope:**
- Recreating shell, routes, landing layout, or placeholders
- Gmail sync, parcel data, settings form (S-01+)
- OAuth e2e automation, bearer-token interceptors
- Logout cookie-option parity fix (deferred)

## Architecture / Approach

```
Bootstrap: APP_INITIALIZER → AuthService.loadSession() → GET /api/auth/status

Sign in:  Login click → window.location → /api/auth/google → Google → callback
          → Set session cookie → redirect /active

Sign out: POST /api/auth/logout → clear signal → navigate /

Routes (unchanged from F-01):
  /           LandingComponent     guestGuard → /active if logged in
  /active     ActivePlaceholder    authGuard  → / if logged out
  /archive    ArchivePlaceholder   authGuard
  /settings   SettingsPlaceholder  authGuard

AppShellComponent header: same PrimeNG chrome; data from AuthService.user()
```

F-01 stub files deleted after Phase 2 wiring completes. Phase 3 replaces stub specs with real auth tests.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Auth infrastructure | `AuthService`, types, HttpClient, initializer | `AuthService` added alongside stubs; no consumer rewiring yet |
| 2. Wire OAuth into shell | Guards, landing/shell actions, API redirect | OAuth env misconfiguration blocks manual verify |
| 3. Auth unit tests | Service/guard specs, shell + landing updates | Tests must mock HttpClient, not hit real API |

**Prerequisites:** F-01 merged; `.env.local` with valid Google OAuth credentials (`GOOGLE_CALLBACK_URL=http://localhost:4200/api/auth/google/callback`).

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Manual OAuth round-trip requires real Google credentials; CI cannot verify sign-in flow.
- `displayName` may be null from Google — shell may need email fallback (noted in plan, optional).
- Logout `clearCookie` omits `secure`/`sameSite` mirror; acceptable for local dev, deferred for production.

## Success Criteria (Summary)

- Full sign-in → `/active` → refresh → sign-out cycle works with real Google account.
- Unauthenticated `/active` → `/`; authenticated `/` → `/active`.
- Header reflects real session user; active placeholder unchanged.
- `npm run lint`, `npm run test`, and `npm run build` pass.
