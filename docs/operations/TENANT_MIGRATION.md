# Tenant foundation migration

The tenant foundation is intentionally introduced as a staged migration. The
`apps.workspace` relationship remains nullable in the Payload schema so an
existing schema-pushed development database can still boot before its data has
been reconciled. Application access treats a missing workspace as legacy data;
only platform super-admins and users explicitly listed in `allowedApps` can
access it.

For a migration-managed installation:

1. Take and verify a PostgreSQL backup.
2. Confirm the initial LinksetGo migration is recorded in `payload_migrations`.
   Do not run the initial migration over a database that was created by schema
   push; baseline that database first.
3. Run `20260727_054612_tenant_foundation` in staging.
4. Verify that it created the `legacy` organization and workspace, assigned
   every existing app to that workspace, and created one membership per user.
5. Exercise collection access using at least two users before production.
6. Deploy the matching application build, then repeat the verified migration in
   production.

The backfill is deterministic and uses conflict-safe inserts. Existing public
URLs keep their `/l/{appSlug}/{linkSlug}` shape, because app slugs remain
globally unique in this milestone. A later host-aware routing migration can
relax that constraint only after workspace/domain resolution is live.

Do not run `npm run migrate` against the current local schema-pushed database
until it has been baselined. Creating and reviewing migration files does not
connect to or mutate the database.
