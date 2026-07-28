import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "domains" ADD COLUMN "tls_certificate_ref" varchar;
  ALTER TABLE "domains" ADD COLUMN "tls_renews_at" timestamp(3) with time zone;
  ALTER TABLE "apps" ADD COLUMN "native_scheme" varchar;
  ALTER TABLE "link_events" ADD COLUMN "hostname" varchar;
  CREATE INDEX "apps_native_scheme_idx" ON "apps" USING btree ("native_scheme");
  CREATE INDEX "link_events_hostname_idx" ON "link_events" USING btree ("hostname");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "apps_native_scheme_idx";
  DROP INDEX "link_events_hostname_idx";
  ALTER TABLE "domains" DROP COLUMN "tls_certificate_ref";
  ALTER TABLE "domains" DROP COLUMN "tls_renews_at";
  ALTER TABLE "apps" DROP COLUMN "native_scheme";
  ALTER TABLE "link_events" DROP COLUMN "hostname";`)
}
