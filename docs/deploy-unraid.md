# Deploy Parcel Scrubber on Unraid (Docker Compose)

Single-instance stack: **PostgreSQL**, **NestJS API**, and **nginx** (Angular static files + `/api` proxy). One host port (default **8080**) serves the UI and API on the same origin.

## Prerequisites

- Unraid with Docker and Docker Compose (Compose plugin or CLI)
- Git clone of this repo on the server
- Self-hosted GitHub Actions runner (optional, for one-click deploy)
- Google Cloud project with Gmail API enabled (for sign-in)

## 1. Clone and configure secrets

```bash
mkdir -p /mnt/user/appdata/parcel-scrubber
cd /mnt/user/appdata/parcel-scrubber
git clone https://github.com/YOUR_USER/parcel-scrubber.git app
cd app
cp .env.example .env
```

Edit `.env`:

| Variable | Notes |
|----------|--------|
| `WEB_PORT` | Host port (default `8080`) |
| `POSTGRES_PASSWORD` | Strong random password |
| `DATABASE_URL` | Must use host `postgres` and match user/password/db above |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `http://<UNRAID_LAN_IP>:<WEB_PORT>/api/auth/google/callback` |
| `JWT_SECRET` | At least 32 random characters |
| `OPENROUTER_API_KEY` | OpenRouter API key (required for Gmail sync / AI extraction) |
| `COOKIE_SECURE` | `false` for LAN HTTP; `true` only behind HTTPS |

Never commit `.env`.

### Postgres data location

Current `docker-compose.yml` already uses an Unraid bind mount by default:

```yaml
- /mnt/user/appdata/parcel-scrubber/postgres:/var/lib/postgresql/data
```

If you prefer a Docker-managed named volume instead, replace that line with:

```yaml
- parcel_pg_data:/var/lib/postgresql/data
```

and add this top-level `volumes` section:

```yaml
volumes:
  parcel_pg_data:
```

## 2. Google Cloud OAuth (LAN HTTP)

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. **APIs & Services** → enable **Gmail API**.
3. **OAuth consent screen** → External → **Testing** → add your Google account as a test user.
4. **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
5. **Authorized JavaScript origins:** `http://<UNRAID_LAN_IP>:8080` (match `WEB_PORT`).
6. **Authorized redirect URIs:** same as `GOOGLE_CALLBACK_URL` in `.env` (byte-for-byte).
7. Copy Client ID and Secret into `.env`.

Scopes requested at sign-in: email, profile, Gmail read-only (for future sync).

If Google rejects a bare LAN IP redirect, use a hostname via `/etc/hosts` on your PC or HTTPS on an internal reverse proxy and set `COOKIE_SECURE=true`.

## 3. Build and run

From the repo root (where `docker-compose.yml` lives):

```bash
docker compose up -d --build
```

Check logs:

```bash
docker compose logs -f api
docker compose ps
```

Open `http://<UNRAID_LAN_IP>:8080` from a machine on your LAN.

- Health: `http://<ip>:8080/api/health`
- Sign in: `http://<ip>:8080/api/auth/google`

## 4. Updates (manual deploy)

```bash
cd /mnt/user/appdata/parcel-scrubber/app
git pull
docker compose up -d --build
```

Migrations run automatically when the `api` container starts (`prisma migrate deploy`).

## 5. Optional: deploy from GitHub Actions

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) (`workflow_dispatch` only).

1. In GitHub → **Settings** → **Secrets and variables** → **Actions** → **Variables**, add:
   - `PARCEL_SCRUBBER_DEPLOY_PATH` = path to the clone **as seen inside the runner** (usually `/mnt/user/appdata/parcel-scrubber/app` on Unraid).
2. Ensure `.env` exists on the server at that path (not in git).
3. Run **Deploy to Unraid** from the Actions tab after merging to `main`.

The job runs on your self-hosted runner: `git fetch`, checkout the chosen **branch** (input `ref`, default `main`), `git pull --ff-only`, then `docker compose up -d --build` in that directory. Tags and commit SHAs are not supported — use a branch name only.

### Self-hosted runner in Docker (common on Unraid)

The workflow does **not** SSH to the host. It `cd`s into `PARCEL_SCRUBBER_DEPLOY_PATH` on whatever machine (or container) runs the runner. If the runner is itself a container, Unraid paths like `/mnt/user/appdata/...` exist on the **host**, not automatically inside the runner — you will see `No such file or directory` until you bind-mount them.

Configure the runner container with at least:

| Mount (host → container) | Purpose |
|--------------------------|---------|
| `/mnt/user/appdata/parcel-scrubber` → same path | Git clone + `.env` visible to the job |
| `/var/run/docker.sock` → `/var/run/docker.sock` | `docker compose` controls host Docker |

Use the **same path inside the container** as on the host when setting `PARCEL_SCRUBBER_DEPLOY_PATH`, or set the variable to whatever path you mounted (e.g. `/deploy/app` if you mapped the host dir there).

Example extra args for a `ghcr.io/actions/actions-runner` (or similar) container:

```text
-v /mnt/user/appdata/parcel-scrubber:/mnt/user/appdata/parcel-scrubber
-v /var/run/docker.sock:/var/run/docker.sock
```

The runner image must include `git` and the Docker CLI (`docker compose`). After changing mounts, recreate the runner container and re-run the workflow.

**Alternative:** install the runner directly on the Unraid host (not in Docker) so host paths and Docker work without extra mounts.

## Local development (without Docker)

1. Start Postgres (e.g. `docker compose up -d postgres` only, or local install).
2. Copy `.env.example` to `.env` at repo root; set `DATABASE_URL` to `localhost` if Postgres is published.
3. From repo root:

```bash
npm install
npm run prisma:migrate:dev -w @parcel-scrubber/api
npm run dev
```

API: `http://localhost:4201/api` — Web (with proxy): `http://localhost:4200`.

For OAuth locally, use redirect `http://localhost:4200/api/auth/google/callback` in Google Console and `.env`, and run via the web dev server so cookies stay same-origin.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `api` unhealthy | `docker compose logs api` — DB URL, migrations, missing env |
| OAuth redirect mismatch | `GOOGLE_CALLBACK_URL` vs Google Console URI |
| Login works but session lost | `COOKIE_SECURE` must be `false` on HTTP LAN |
| 502 on `/api` | `docker compose ps` — wait for `api` healthy |
