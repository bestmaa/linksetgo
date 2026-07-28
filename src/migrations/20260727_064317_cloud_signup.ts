import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_users_status" ADD VALUE 'pending-verification' BEFORE 'disabled';
  ALTER TYPE "public"."enum_organizations_status" ADD VALUE 'pending-verification' BEFORE 'suspended';
  ALTER TYPE "public"."enum_workspaces_status" ADD VALUE 'pending-verification' BEFORE 'suspended';
  ALTER TABLE "users" ADD COLUMN "email_verification_token_hash" varchar;
  ALTER TABLE "users" ADD COLUMN "email_verification_expires_at" timestamp(3) with time zone;
  CREATE UNIQUE INDEX "users_email_verification_token_hash_idx" ON "users" USING btree ("email_verification_token_hash");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'::text;
  DROP TYPE "public"."enum_users_status";
  CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'disabled');
  ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."enum_users_status";
  ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE "public"."enum_users_status" USING "status"::"public"."enum_users_status";
  ALTER TABLE "organizations" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "organizations" ALTER COLUMN "status" SET DEFAULT 'active'::text;
  DROP TYPE "public"."enum_organizations_status";
  CREATE TYPE "public"."enum_organizations_status" AS ENUM('active', 'suspended');
  ALTER TABLE "organizations" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."enum_organizations_status";
  ALTER TABLE "organizations" ALTER COLUMN "status" SET DATA TYPE "public"."enum_organizations_status" USING "status"::"public"."enum_organizations_status";
  ALTER TABLE "workspaces" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "workspaces" ALTER COLUMN "status" SET DEFAULT 'active'::text;
  DROP TYPE "public"."enum_workspaces_status";
  CREATE TYPE "public"."enum_workspaces_status" AS ENUM('active', 'suspended');
  ALTER TABLE "workspaces" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."enum_workspaces_status";
  ALTER TABLE "workspaces" ALTER COLUMN "status" SET DATA TYPE "public"."enum_workspaces_status" USING "status"::"public"."enum_workspaces_status";
  DROP INDEX "users_email_verification_token_hash_idx";
  ALTER TABLE "users" DROP COLUMN "email_verification_token_hash";
  ALTER TABLE "users" DROP COLUMN "email_verification_expires_at";`)
}
