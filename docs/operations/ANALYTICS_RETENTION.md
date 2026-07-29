# Analytics retention operations

LinksetGo records privacy-reduced link events for aggregate analytics. Retention is
enforced by an explicit maintenance command, not by a background timer inside the
web process. An operator must schedule that command for the published retention
policy to be true in practice.

## Community policy

`ANALYTICS_RETENTION_DAYS` accepts an integer from 1 through 3650 and defaults to 90. It affects only Community Edition. Preview the exact cutoff and candidate
count without deleting anything:

```bash
docker compose --env-file .env.community run --rm migrate \
  npm run analytics:prune
```

After checking the report and backup policy, execute deletion:

```bash
docker compose --env-file .env.community run --rm migrate \
  npm run analytics:prune -- --execute
```

The command emits a JSON report and exits non-zero on invalid configuration or a
database error. Run the execute form daily from a trusted scheduler. Retention
deletion is permanent; a database volume is not a backup.

## Cloud policy

Cloud ignores `ANALYTICS_RETENTION_DAYS`. It derives a cutoff for each
organization from the server-owned plan catalog and applies the Free-plan cutoff
to orphaned legacy events. Run the same command from one trusted maintenance
worker. Do not run overlapping copies; schedule one completion before the next
window.

The application does not claim that a plan's retention is operational merely
because the plan exists. Before Cloud registration opens, monitor successful job
runs, deletion counts, duration, failures, and PostgreSQL growth.

## Test-database guard

The command refuses databases whose name ends in `_test` (or a `NODE_ENV=test`
process) unless `--allow-test-database` is explicit. That option is for disposable
verification only and must not appear in production scheduling.
