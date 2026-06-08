---
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
  has_ai: true
  has_background_jobs: false
---

## Why this stack

Solo, three-week after-hours MVP for a local-only parcel tracker with Google OAuth and Gmail import. You chose the custom path over the cloud-oriented JS default: TypeScript, PostgreSQL/MariaDB, Angular UI, and a Node API. **Implemented repo layout (2026-05-19):** npm workspaces monorepo — `apps/web` (Angular 21, `ng serve` on 4200), `apps/api` (NestJS 11 on 4201, global route prefix `/api`), root scripts via `concurrently` (`npm run dev`). Angular dev proxy (`apps/web/proxy.conf.json`) forwards `/api` to the API so the UI uses same-origin relative URLs in dev. Root also exposes `lint` / `lint:web` / `lint:api` and `test` / `test:web` / `test:api` (workspace targets; web uses `ng lint` + Vitest via `ng test`). **CI (2026-05-19):** `.github/workflows/lint-and-test.yml` on a self-hosted runner — parallel `web` and `api` jobs, Node 24, `npm ci`, lint + unit tests per app (no build/deploy). **UI components (2026-06-04):** PrimeNG selected for the web app per `context/foundation/roadmap.md` (F-01); Tailwind for layout utilities remains an open choice during planning. **Domain (2026-06-08):** API has Google OAuth/JWT with Gmail read scope; parcel model, user settings, and PrimeNG shell are landed. Gmail retrieval (F-05) and OpenRouter extraction (F-06, `gpt-5.4-mini` / `gpt-5.4-nano`) precede north-star sync UI (S-02) per `context/foundation/roadmap.md`. Manual-promotion via self-hosted GHA fits Unraid; payments, realtime, and background sync stay out of scope.
