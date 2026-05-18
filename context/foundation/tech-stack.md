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
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Solo, three-week after-hours MVP for a local-only parcel tracker with Google OAuth and Gmail import. You chose the custom path over the cloud-oriented JS default to match explicit preferences: TypeScript, PostgreSQL/MariaDB, and Angular on the frontend with a Node API layer. Angular clears all four agent-friendly gates, defaults to self-host (aligned with Unraid Docker), and matches your stated stack. Auth and Gmail are not bundled in the Angular CLI scaffold—you will add a Node backend (e.g. NestJS) with Postgres for OAuth tokens and parcel data. GitHub Actions with a self-hosted runner on Unraid fits manual-promotion better than auto-deploy to a public PaaS. Payments, realtime, AI extraction, and background sync stay out of scope per the PRD.
