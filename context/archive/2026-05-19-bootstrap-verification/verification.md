---
bootstrapped_at: 2026-05-19T12:00:00Z
starter_id: angular
starter_name: Angular
project_name: parcel-scrubber
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: angular
package_manager: npm
project_name: parcel-scrubber
hints:
  language_family: js
  team_size: solo
  deployment_target: self-host
  ci_provider: github-actions
  ci_default_flow: manual-promotion
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Session note:** User requested TypeScript for this run. The Angular starter scaffolds a TypeScript project (`tsconfig.json`, `.ts` sources). `language_family: js` denotes the npm/Node ecosystem for audit tooling, not the source language.

## Why this stack

Solo, three-week after-hours MVP for a local-only parcel tracker with Google OAuth and Gmail import. You chose the custom path over the cloud-oriented JS default to match explicit preferences: TypeScript, PostgreSQL/MariaDB, and Angular on the frontend with a Node API layer. Angular clears all four agent-friendly gates, defaults to self-host (aligned with Unraid Docker), and matches your stated stack. Auth and Gmail are not bundled in the Angular CLI scaffold—you will add a Node backend (e.g. NestJS) with Postgres for OAuth tokens and parcel data. GitHub Actions with a self-hosted runner on Unraid fits manual-promotion better than auto-deploy to a public PaaS. Payments, realtime, AI extraction, and background sync stay out of scope per the PRD.

## Pre-scaffold verification

| Signal             | Value                                              | Severity | Notes                                      |
| ------------------ | -------------------------------------------------- | -------- | ------------------------------------------ |
| npm package        | @angular/cli v21.2.11 published 2026-05-13         | fresh    | resolved from cmd_template (`@angular/cli`) |
| GitHub repo        | not run                                            | —        | card `docs_url` is https://angular.dev (not GitHub) |

## Scaffold log

**Resolved invocation**: `npx @angular/cli new bootstrap-scaffold --defaults --routing --style scss --skip-tests --ssr false`

**Strategy**: subdir-then-move (temp dir `bootstrap-scaffold`; Angular CLI rejects a leading-dot project name per its `name` schema)

**Exit code**: 0

**Files moved**: 22 (application scaffold files; excludes `node_modules`)

**Conflicts (.scaffold siblings)**: README.md

**.gitignore handling**: moved silently (no pre-existing `.gitignore` in cwd)

**bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json

**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW

**Direct vs transitive**: 0 findings; clean tree (prod: 10, dev: 504 dependencies scanned)

#### CRITICAL findings

(none)

#### HIGH findings

(none)

#### MODERATE findings

(none)

#### LOW / INFO findings

(none)

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | verified                           |
| quality_override           | false                              |
| path_taken                 | custom                             |
| self_check_answers         | typed, from_official_starter, conventions, docs_current, can_judge_agent (all true) |
| team_size                  | solo                               |
| deployment_target        | self-host                          |
| ci_provider                | github-actions                     |
| ci_default_flow            | manual-promotion                   |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | false                              |
| has_background_jobs        | false                              |

## Post-bootstrap evolution

Manual follow-up after the initial Angular bootstrap (not a second bootstrapper run). Recorded here so the audit trail stays in one place; see also `context/foundation/tech-stack.md` (updated “Why” paragraph).

| Date       | Change | Notes |
| ---------- | ------ | ----- |
| 2026-05-19 | Monorepo | Moved Angular from repo root to `apps/web` (`@parcel-scrubber/web`); root `package.json` workspaces `apps/*`. |
| 2026-05-19 | NestJS API | Scaffolded `apps/api` (`@parcel-scrubber/api`) via `@nestjs/cli`; default listen port **4201** (`PORT` env override). |
| 2026-05-19 | API prefix | `app.setGlobalPrefix('api')` in `apps/api/src/main.ts`. |
| 2026-05-19 | Dev proxy | `apps/web/proxy.conf.json` + `angular.json` `serve.options.proxyConfig`; browser calls `/api/*` on 4200 → API on 4201. |
| 2026-05-19 | Lint & test | Root `lint` / `test` scripts; web: `angular-eslint` + Vitest (`ng test`); api: ESLint + Jest. |
| 2026-05-19 | CI | `.github/workflows/lint-and-test.yml` — self-hosted, Node 24, parallel web/api jobs (lint + UT, no build). |
| 2026-06-04 | Product docs | Roadmap + PRD v3: settings (FR-017), label-scoped sync, no age auto-archive, restore/undeliver any parcel; PrimeNG (F-01). |

**Current layout:**

```
apps/web/   — Angular (project name `web` in angular.json)
apps/api/   — NestJS
context/    — preserved at repo root
```

**Root scripts:** `dev`, `start:web`, `start:api`, `build`, `build:web`, `build:api`, `lint`, `lint:web`, `lint:api`, `test`, `test:web`, `test:api`.

**Post-evolution audit:** not re-run; run `npm audit` at repo root when dependencies change.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, the frontend and API shells are in place — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (`README.md.scaffold` may still exist at repo root).
- Address audit findings per your project's risk tolerance — re-audit after major dependency changes.
- ~~Add a Node backend (e.g. NestJS)~~ — done (`apps/api`); partial **Postgres** + **Google OAuth** on API; see `context/foundation/roadmap.md` for **PrimeNG shell**, **settings**, **parcel model**, and **Gmail sync** sequence.
