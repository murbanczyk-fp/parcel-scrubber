# Repository Guidelines

Parcel Scrubber is a local parcel tracker: npm workspaces with Angular 21 (`@apps/web`) and NestJS 11 + Prisma (`@apps/api`). Product scope: `@context/foundation/prd.md`; stack notes: `@context/foundation/tech-stack.md`.

## Hard rules

Never commit `.env`, `.env.local`, or secrets from `@.env.example`. Do not commit `apps/*/dist`, `/dist`, `node_modules`, or Angular cache paths listed in `@.gitignore`. In the web app, use relative `/api/...` URLs only — never `http://localhost:4201` (`@apps/web/proxy.conf.json` proxies to Nest). All Nest routes use global prefix `/api` (`@apps/api/src/main.ts`).

## Project structure

Monorepo workspaces `@parcel-scrubber/web` and `@parcel-scrubber/api` under `apps/`. Prisma schema and migrations in `apps/api/prisma/`. Agent/product docs under `context/foundation/`; Unraid Docker deploy in `@docs/deploy-unraid.md`. Root orchestration: `@package.json`.

## Build, test, and development

Run from repo root after `npm install`: `npm run dev` (web :4200, API :4201), `npm run build`, `npm run lint`, `npm run test`. API database: set `DATABASE_URL`, then `npm run prisma:migrate:dev -w @parcel-scrubber/api`. Copy `@.env.example` → `.env.local` for local dev; env load order and overrides: `@apps/api/src/config/env-files.ts` and `@README.md`.

## Coding style

TypeScript throughout; 2-space indent (`@apps/web/.editorconfig`). Lint via `@apps/web/eslint.config.js` and `@apps/api/eslint.config.mjs`. API Prettier: single quotes, trailing commas (`@apps/api/.prettierrc`). Place Nest modules under `apps/api/src/<feature>/`; Angular code under `apps/web/src/app/`.

## Testing

Web: Vitest through `ng test`, `*.spec.ts` co-located (see `@apps/web/src/app/app.spec.ts`). API: Jest `*.spec.ts` in `src/`, e2e `*.e2e-spec.ts` in `apps/api/test/` (`@apps/api/test/jest-e2e.json`). Single workspace: `npm run test:web` or `npm run test:api`; full suite: `npm run test`.

## Commit and pull requests

Recent commits use short imperative subjects without a fixed `type:` prefix. Base branch `main` on `murbanczyk-fp/parcel-scrubber`. PRs must pass `.github/workflows/lint-and-test.yml` (Node 24, `npm ci`, workspace lint + test). Production deploy is manual via `deploy.yml` and Unraid path variable `PARCEL_SCRUBBER_DEPLOY_PATH`.
