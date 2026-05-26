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
| `COOKIE_SECURE` | `false` for LAN HTTP; `true` only behind HTTPS |

Never commit `.env`.

### Optional: bind-mount Postgres data

By default, Compose uses a named volume `parcel_pg_data`. To store data under appdata, add to `docker-compose.yml` under `postgres.volumes`:

```yaml
- /mnt/user/appdata/parcel-scrubber/postgres:/var/lib/postgresql/data
```

(remove the named volume line for that path if you replace it entirely).

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
   - `PARCEL_SCRUBBER_DEPLOY_PATH` = `/mnt/user/appdata/parcel-scrubber/app`
2. Ensure `.env` exists on the server at that path (not in git).
3. Run **Deploy to Unraid** from the Actions tab after merging to `main`.

The job runs on your self-hosted runner and executes `docker compose up -d --build` in that directory.

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
