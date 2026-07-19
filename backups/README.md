# Database backups

Local PostgreSQL backups for Parcel Scrubber. This folder is gitignored — dumps may contain user data, OAuth tokens, and Gmail message metadata.

## Databases

| Database | Purpose |
|----------|---------|
| `parcel_scrubber` | Main dev / production app data |
| `parcel_scrubber_test` | API e2e tests only — back up separately if needed |

Credentials and host come from repo-root `.env.local` (`POSTGRES_*`, `DATABASE_URL`). Default user is `parcel`.

## Prerequisites

- A running Postgres instance reachable from your machine.
- **Local dev (Docker):** if Postgres runs in a container, note its name (e.g. `atlas-postgres-1`) or use `host.docker.internal:5432` from a one-off client container.
- **Unraid / Compose:** Postgres is the `postgres` service; use `docker compose exec postgres …` from the repo root (with `.env` loaded).

No local `psql` / `pg_dump` install is required when using `docker exec` as below.

## Create a backup

Replace `CONTAINER` with your Postgres container name (e.g. `atlas-postgres-1` or `parcel-scrubber-postgres-1`).

Use a dated filename so restores are obvious:

```powershell
# From repo root (PowerShell)
$date = Get-Date -Format "yyyy-MM-dd"
$container = "CONTAINER"
$db = "parcel_scrubber"
$file = "backups/${db}_${date}.sql"

docker exec $container pg_dump -U parcel -d $db `
  --clean --if-exists --no-owner --no-acl `
  -f /tmp/dump.sql

docker cp "${container}:/tmp/dump.sql" $file
docker exec $container rm /tmp/dump.sql
```

### Dump flags

- `--clean --if-exists` — restore can drop existing objects first.
- `--no-owner --no-acl` — avoids role/permission errors on another host.

### Optional: test database

```powershell
$db = "parcel_scrubber_test"
# same pg_dump / docker cp steps as above
```

### Optional: compressed custom format

Smaller files; restore with `pg_restore` instead of `psql`:

```powershell
docker exec $container pg_dump -U parcel -d parcel_scrubber `
  --clean --if-exists --no-owner --no-acl -Fc `
  -f /tmp/dump.dump

docker cp "${container}:/tmp/dump.dump" "backups/parcel_scrubber_${date}.dump"
```

## Restore a backup

**Warning:** restore overwrites schema and data in the target database. Take a fresh dump first if you might need to roll back.

### Plain SQL (`.sql`)

```powershell
$container = "CONTAINER"
$db = "parcel_scrubber"
$file = "backups/parcel_scrubber_2026-07-05.sql"   # your dump

Get-Content $file | docker exec -i $container psql -U parcel -d $db
```

### Custom format (`.dump`)

```powershell
docker cp $file "${container}:/tmp/dump.dump"
docker exec $container pg_restore -U parcel -d parcel_scrubber --clean --if-exists /tmp/dump.dump
docker exec $container rm /tmp/dump.dump
```

### Empty database

If the database does not exist yet:

```powershell
docker exec $container psql -U parcel -d postgres -c "CREATE DATABASE parcel_scrubber OWNER parcel;"
# then run the restore command above
```

After restore, confirm Prisma migration history:

```powershell
docker exec $container psql -U parcel -d parcel_scrubber -c "\dt"
```

The API should start without running migrations if `_prisma_migrations` was restored intact. If you restored onto an empty DB with an older dump, run from repo root:

```bash
npm run prisma:migrate:dev -w @parcel-scrubber/api
```

Only do that when the dump did **not** include migration history or you intentionally want to reconcile schema.

## Unraid / production (Compose)

From the directory that contains `docker-compose.yml` and `.env`:

```bash
# Backup
docker compose exec -T postgres pg_dump -U parcel -d parcel_scrubber \
  --clean --if-exists --no-owner --no-acl > backups/parcel_scrubber_$(date +%F).sql

# Restore
docker compose exec -T postgres psql -U parcel -d parcel_scrubber < backups/parcel_scrubber_YYYY-MM-DD.sql
```

On the server, store dumps outside the git tree (e.g. `/mnt/user/appdata/parcel-scrubber/backups/`) and copy them here only when needed for local dev.

## Suggested cadence

- Before schema migrations or deploys that change the database.
- Before destructive manual SQL or test runs against a shared dev instance.
- Periodically if the instance holds data you cannot re-import from Gmail.
