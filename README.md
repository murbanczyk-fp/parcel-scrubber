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

## Dev API proxy

With `npm run start:web` or `npm run dev`, the Angular dev server proxies `/api/*` to the Nest app on port **4201** (`apps/web/proxy.conf.json`). Call the backend with relative URLs, e.g. `HttpClient.get('/api')` — not `http://localhost:4201/...`. Nest serves all routes under the `/api` prefix.
