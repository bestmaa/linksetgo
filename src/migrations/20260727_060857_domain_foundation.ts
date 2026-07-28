import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_domains_type" AS ENUM('managed', 'custom');
  CREATE TYPE "public"."enum_domains_status" AS ENUM('pending-dns', 'verifying', 'certificate-ready', 'association-incomplete', 'active', 'suspended');
  CREATE TABLE "domains" (
    "id" serial PRIMARY KEY NOT NULL,
    "workspace_id" integer NOT NULL,
    "hostname" varchar NOT NULL,
    "type" "enum_domains_type" DEFAULT 'custom' NOT NULL,
    "status" "enum_domains_status" DEFAULT 'pending-dns' NOT NULL,
    "verification_token" varchar NOT NULL,
    "dns_verified_at" timestamp(3) with time zone,
    "cname_verified_at" timestamp(3) with time zone,
    "tls_ready_at" timestamp(3) with time zone,
    "associations_verified_at" timestamp(3) with time zone,
    "activated_at" timestamp(3) with time zone,
    "last_checked_at" timestamp(3) with time zone,
    "last_verification_error" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "domains_id" integer;
  ALTER TABLE "domains" ADD CONSTRAINT "domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "domains_workspace_idx" ON "domains" USING btree ("workspace_id");
  CREATE UNIQUE INDEX "domains_hostname_idx" ON "domains" USING btree ("hostname");
  CREATE INDEX "domains_status_idx" ON "domains" USING btree ("status");
  CREATE INDEX "domains_updated_at_idx" ON "domains" USING btree ("updated_at");
  CREATE INDEX "domains_created_at_idx" ON "domains" USING btree ("created_at");
  CREATE INDEX "workspace_status_idx" ON "domains" USING btree ("workspace_id","status");
  CREATE INDEX "type_status_idx" ON "domains" USING btree ("type","status");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_domains_fk" FOREIGN KEY ("domains_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_domains_id_idx" ON "payload_locked_documents_rels" USING btree ("domains_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_domains_fk";
  DROP INDEX "payload_locked_documents_rels_domains_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "domains_id";
  ALTER TABLE "domains" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "domains" CASCADE;
  DROP TYPE "public"."enum_domains_type";
  DROP TYPE "public"."enum_domains_status";`)
}
