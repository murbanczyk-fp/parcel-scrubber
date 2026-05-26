# parcel-scrubber

Local parcel tracker (Angular + NestJS). Gmail import and Postgres come in later MVP slices.

## Monorepo layout

```
apps/
  web/   — Angular UI (@parcel-scrubber/web)
  api/   — NestJS API (@parcel-scrubber/api)
context/ — product docs and agent context
```

## Commands (from repo root)

| Command | Description |
|--------|-------------|
| `npm install` | Install all workspace dependencies |
| `npm run dev` | Run web (port 4200) and API (port 4201) together |
| `npm run start:web` | Angular dev server only |
| `npm run start:api` | NestJS watch mode only |
| `npm run build` | Production build for web and API |

## Environment variables (local dev)

1. Copy [`.env.example`](.env.example) to **`.env.local`** at the repo root (already gitignored).
2. Fill in at least `JWT_SECRET`, `DATABASE_URL`, and Google OAuth values.
3. Run `npm run dev` from the repo root.

| File | Used by |
|------|---------|
| `.env.local` | `npm run dev` / Nest on your machine (preferred) |
| `.env` | `docker compose` on Unraid |

Nest loads `.env` then `.env.local` from the repo root (and optional `apps/api/` copies); **`.env.local` wins** over `.env`.

For local Postgres, point `DATABASE_URL` at `localhost` (e.g. `docker compose up -d postgres` only). Use `GOOGLE_CALLBACK_URL=http://localhost:4200/api/auth/google/callback` and the same URI in Google Cloud Console.

## Dev API proxy

With `npm run start:web` or `npm run dev`, the Angular dev server proxies `/api/*` to the Nest app on port **4201** (`apps/web/proxy.conf.json`). Call the backend with relative URLs, e.g. `HttpClient.get('/api')` — not `http://localhost:4201/...`. Nest serves all routes under the `/api` prefix.

## Deploy on Unraid (Docker)

Production stack: Postgres + API + nginx (single host port). See [docs/deploy-unraid.md](docs/deploy-unraid.md).

```bash
cp .env.example .env   # fill secrets
docker compose up -d --build
```

Optional: GitHub Actions **Deploy to Unraid** (`workflow_dispatch`) after setting repo variable `PARCEL_SCRUBBER_DEPLOY_PATH`.
