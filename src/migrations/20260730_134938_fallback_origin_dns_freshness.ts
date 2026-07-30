import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "fallback_origins" ADD COLUMN "verification_expires_at" timestamp(3) with time zone;
  ALTER TABLE "fallback_origins" ADD COLUMN "outage_grace_expires_at" timestamp(3) with time zone;
  UPDATE "fallback_origins"
  SET "verification_expires_at" = "verified_at" + interval '24 hours'
  WHERE "status" = 'verified'
    AND "verified_at" IS NOT NULL
    AND "verified_at" <= now();
  CREATE INDEX "fallback_origins_verification_expires_at_idx" ON "fallback_origins" USING btree ("verification_expires_at");
  CREATE INDEX "fallback_origins_outage_grace_expires_at_idx" ON "fallback_origins" USING btree ("outage_grace_expires_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "fallback_origins_verification_expires_at_idx";
  DROP INDEX "fallback_origins_outage_grace_expires_at_idx";
  ALTER TABLE "fallback_origins" DROP COLUMN "verification_expires_at";
  ALTER TABLE "fallback_origins" DROP COLUMN "outage_grace_expires_at";`)
}
