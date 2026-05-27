---
project: parcel-scrubber
researched_at: 2026-05-27T05:57:00Z
recommended_platform: Unraid Docker Compose
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Angular 21 + NestJS 11
  runtime: Node 24
---

## Recommendation

**Deploy on Unraid Docker Compose.**

This project is explicitly optimized for self-hosting and manual promotion, and the repository already contains a complete Unraid-first deployment path (`docker-compose.yml`, `.github/workflows/deploy.yml`, and `docs/deploy-unraid.md`). For an MVP with a solo developer and no realtime/background-worker requirements, this gives the shortest path to stable deployment with minimal platform migration work.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Unraid Docker Compose | Pass | Pass | Pass | Pass | Partial | 4.5/5 |
| Railway | Pass | Pass | Pass | Pass | Partial | 4.5/5 |
| Render | Pass | Pass | Pass | Pass | Partial | 4.5/5 |
| Fly.io | Pass | Pass | Pass | Pass | Partial | 4.5/5 |
| Vercel | Pass | Partial | Pass | Pass | Partial | 4.0/5 |
| Cloudflare Workers + Pages | Pass | Partial | Pass | Pass | Partial | 4.0/5 |

Unraid Docker Compose scores highest in practical fit because the current repo already encodes this path end-to-end. Railway/Render/Fly.io are viable alternatives but would require adapting build/runtime assumptions and secret + database wiring away from current Compose conventions.

Vercel and Cloudflare are strong DX platforms, but this repository is not currently structured for their preferred deployment model (edge/serverless-first adapters and service decomposition), so they score lower for immediate MVP execution.

### Shortlisted Platforms

#### 1. Unraid Docker Compose (Recommended)

Best fit for existing assets and constraints: same-origin nginx + API proxy is already implemented, Postgres is colocated, and deployment is already wired for manual promotion through a self-hosted GitHub Actions runner.

#### 2. Railway

Strong runner-up for fast hosted PaaS iteration and managed services, but requires migration from Unraid-local operational assumptions and a hosted-database/secrets model change.

#### 3. Render

Similar benefit profile to Railway with straightforward container hosting, but still requires the same migration effort from the current self-hosted baseline.

## Anti-Bias Cross-Check: Unraid Docker Compose

### Devil's Advocate - Weaknesses

1. Single-host deployment creates a hard single point of failure for app and database.
2. Operational continuity depends on runner/mount correctness; misconfigured runner containers can break deploys.
3. Secret hygiene relies on manual discipline because `.env` is managed outside git and can drift.
4. Rollback is straightforward for code but not for incompatible database migrations without explicit backup/restore practice.
5. LAN-first OAuth flow can become brittle if networking, hostname, or HTTPS posture changes.

### Pre-Mortem - How This Could Fail

The team deploys quickly on Unraid and ships the MVP. Early usage is fine, so they defer operational hardening. Over a few months, they make several schema changes and rely on startup migrations, but never establish a repeatable backup-and-restore drill. One deploy introduces a migration that is valid but difficult to roll back. At the same time, a runner container is recreated without the same bind mounts, causing deployment automation to fail intermittently. Under pressure, they patch production manually. This creates config drift between documented and actual runtime state. A later host update or disk issue forces recovery, and the team discovers backups were incomplete and restoration steps were never fully tested. Service comes back slowly with partial data and ad-hoc fixes. Confidence in deployments drops, release cadence slows, and the original speed advantage of self-hosting is lost because too much knowledge remains implicit and operator-specific.

### Unknown Unknowns

- Prisma migration success does not guarantee safe functional rollback without tested restore procedures.
- Self-hosted runner path visibility depends on container mounts, not only repository variables.
- Browser OAuth behavior on LAN HTTP can differ across clients if hostname/IP/origin changes.
- Docker host storage growth and log retention can become the hidden limit before CPU/RAM.
- Manual promotion workflows often hide undocumented human approval gates that become bottlenecks.

## Operational Story

- **Preview deploys**: no automatic PR preview environments; branches are tested in CI, and production deploy is a manual `workflow_dispatch` action.
- **Secrets**: secrets live in server-side `.env` at deploy path (outside git); rotation is manual edit + redeploy; repository stores no production secrets.
- **Rollback**: revert on the target branch (e.g. `main`), merge, then re-run the deploy workflow; or on the server run `git pull` to an earlier commit and `docker compose up -d --build`. Database rollback may require backup restore if migrations are not backward-compatible.
- **Approval**: production deployment is human-triggered in GitHub Actions; secret rotation and destructive DB actions require explicit human action.
- **Logs**: runtime logs via `docker compose logs -f api` and service status via `docker compose ps`; workflow logs from GitHub Actions job output.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Single-host outage affects full stack | Devil's advocate | M | H | Add scheduled backups and a documented host recovery runbook. |
| Runner path/mount mismatch blocks deploys | Research finding | M | M | Keep runner mount checklist in docs and validate with a periodic dry-run deploy. |
| Env/config drift outside git | Unknown unknowns | M | M | Maintain a versioned `.env.example` baseline and a manual secret rotation checklist. |
| Migration causes non-trivial rollback | Pre-mortem | M | H | Run pre-deploy DB backups and test restore before high-risk migrations. |
| OAuth redirect/cookie issues after network changes | Devil's advocate | M | M | Standardize on stable hostname + HTTPS reverse proxy and revalidate callback URLs. |

## Getting Started

1. Copy `.env.example` to `.env` at repo root and set production secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`, OAuth values).
2. Confirm `DATABASE_URL` in `.env` uses `postgres` as host for Compose networking.
3. Start stack with `docker compose up -d --build` and verify health at `/api/health`.
4. Configure repository variable `PARCEL_SCRUBBER_DEPLOY_PATH` for self-hosted runner deploys.
5. Trigger `Deploy to Unraid` workflow (branch input defaults to `main`) when promoting to production.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
