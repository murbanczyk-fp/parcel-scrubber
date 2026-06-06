# PrimeNG UI Layout Scaffold — Plan Brief

> Full plan: `context/changes/prime-layout-scaffold/plan.md`

## What & Why

Parcel Scrubber's Angular app is still the CLI welcome scaffold — no UI library, no layout, no routes. F-01 installs PrimeNG, builds the authenticated app shell with auth-aware header navigation, lands a public landing page, and wires lazy-loaded placeholder routes so F-02 (OAuth), S-01 (settings), S-02 (active list), and S-03 (archive) plug into a consistent chrome without redoing layout.

## Starting Point

- **Web:** Angular 21 standalone app with empty `app.routes.ts`, no PrimeNG/Tailwind, CLI placeholder template in `app.html` (`apps/web/src/app/`).
- **Auth:** None on the web client. Nest OAuth exists on the API but is out of F-01 scope.
- **Proxy:** Dev proxy forwards `/api` → `localhost:4201` — unchanged.

## Desired End State

Developer runs `npm run dev`, opens `http://localhost:4200`, sees a branded landing page with a prominent Login CTA and minimal header (app name + Login). Clicking Login toggles stub auth on and navigates to `/active` with full header: Active/Archive `SelectButton`, avatar/name placeholder, Settings cog, Logout. SelectButton switches between `/active` and `/archive`; Settings navigates to `/settings`. Logout toggles stub auth off and returns to landing. Lint, test, and build pass.

## Key Decisions Made

| Decision | Choice | Why | Source |
| -------- | ------ | --- | ------ |
| Styling | PrimeNG-only (no Tailwind) | Single styling system; matches roadmap default | Plan |
| Theme | Aura preset | PrimeNG v21 default; well documented | Plan |
| Header nav (logged in) | `SelectButton` for Active / Archive | Compact toggle; user spec | Plan |
| Header nav (logged out) | Center nav hidden | Landing-focused; user spec | Plan |
| Settings / user area | Cog → `/settings`; avatar + name + Logout on right | Separates list views from config | Plan |
| Public entry | Landing page at `/` with hero + Login CTA | User spec; no separate `/login` route needed | Plan |
| Route stubs | `/`, `/active`, `/archive`, `/settings` | Full tree ready for downstream slices | Plan |
| F-01 auth | Stub `isLoggedIn` signal toggled by Login/Logout buttons | Easiest way to test both header states without OAuth | Plan |
| F-02 handoff | Replace stub auth service with real `AuthService` + API | Clean slice boundary | Plan |
| Real auth guard | Deferred to F-02 (stub guard reads `isLoggedIn` in F-01) | F-01 guard validates UX; F-02 swaps implementation | Plan |
| Folder layout | `layout/` + `features/<route>/` | Scales with upcoming slices | Plan |
| Testing | Shell + routing + stub auth smoke tests | Catches regressions without brittle PrimeNG DOM | Plan |

## Scope

**In scope:**
- Install `primeng`, `@primeuix/themes`, `primeicons`; configure Aura theme + animations
- `AppShellComponent` with conditional header per auth state
- Stub auth service (`isLoggedIn` signal, Login/Logout toggle)
- Stub route guard on protected routes
- Landing page (logged-out hero)
- Placeholder pages for active, archive, settings
- Remove CLI welcome scaffold; update page title
- Shell/routing/auth smoke tests

**Out of scope:**
- Real Google OAuth, HttpClient session probe, JWT cookies (F-02)
- Gmail sync, parcel data, real settings form (S-01+)
- Archive/sync business logic (S-02, S-03)
- Tailwind, dark mode, logo asset (slot only)
- API changes

## Architecture / Approach

```
/  → LandingComponent (public; stub guestGuard redirects if isLoggedIn)

AppShellComponent (all routes share shell chrome)
├─ header: conditional on isLoggedIn()
│    logged out: [App name] ············· [Login]
│    logged in:  [App name] [Active|Archive SelectButton] [avatar name] [⚙] [Logout]
└─ router-outlet
     ├─ /           → LandingComponent
     ├─ /active     → ActivePlaceholder (stubAuthGuard)
     ├─ /archive    → ArchivePlaceholder (stubAuthGuard)
     └─ /settings   → SettingsPlaceholder (stubAuthGuard)

StubAuthService.isLoggedIn signal:
  Login click  → true  + navigate /active
  Logout click → false + navigate /
```

F-02 replaces `StubAuthService` with real session loading; header template stays, data bindings swap to API user.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. PrimeNG setup | Packages, theme provider, global styles | Missing `@angular/animations` peer |
| 2. Shell + stub auth | Header layout, `isLoggedIn` toggle, conditional chrome | SelectButton ↔ router sync on back/refresh |
| 3. Routes, landing & tests | Placeholders, guards, smoke specs | Stub guard left in place if F-02 delay |

**Prerequisites:** `npm install` at repo root; no OAuth env needed for F-01.

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- F-02 plan (`web-oauth-app-shell`) assumed it would build the shell — F-01 now owns layout; F-02 plan should be trimmed to auth wiring only when implemented.
- Stub avatar/name can show static placeholder text until F-02 provides real `SessionUser`.
- Production bundle grows with PrimeNG; initial budget headroom exists (500 kB warn in `angular.json`).

## Success Criteria (Summary)

- Toggle Login/Logout and see both header variants without OAuth.
- SelectButton navigates Active ↔ Archive; Settings cog opens `/settings`.
- Unauthenticated direct visit to `/active` redirects to `/`.
- `npm run lint`, `npm run test:web`, and `npm run build` pass.
