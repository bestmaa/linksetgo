# Backup and restore

The Compose installation keeps PostgreSQL in the `relay-postgres-data` named
volume. A volume is durable storage, not a backup. Keep encrypted copies on a
different host or object store.

## Create a logical backup

```bash
./scripts/community-backup.sh
```

The script runs `pg_dump` inside the database container and writes a private,
timestamped custom-format dump under `backups/`. Override the destinations without
editing the script:

```bash
RELAY_ENV_FILE=/srv/relay/.env.community \
RELAY_BACKUP_DIR=/srv/relay-backups \
  ./scripts/community-backup.sh
```

Copy the completed dump off-host, encrypt it at rest, and apply a retention policy.
The ignored local `backups/` directory prevents accidental Git commits but does not
provide encryption.

## Verify a backup

At least monthly, restore into a disposable PostgreSQL database that is not the
production database:

```bash
docker run --rm \
  -e POSTGRES_PASSWORD=temporary-restore-password \
  -p 127.0.0.1:55432:5432 \
  --name relay-restore-check \
  -d postgres:16-alpine

docker exec relay-restore-check \
  createdb --username postgres relay_restore

docker exec -i relay-restore-check \
  pg_restore --username postgres --dbname relay_restore --exit-on-error \
  < backups/relay-YYYYMMDDTHHMMSSZ.dump
```

Inspect row counts and launch a disposable Relay instance against the restored
database before declaring the backup verified. Remove only the explicitly named
test container when finished:

```bash
docker rm --force relay-restore-check
```

## Production restore

A production restore replaces data and requires planned downtime. Stop Relay,
retain the failed database and its volume, restore into a new database or new
volume, run the release's migrations, validate readiness and representative links,
then switch traffic. Do not use `pg_restore --clean` against the only copy of a
database. Document and rehearse the exact runbook for your infrastructure before an
incident.
