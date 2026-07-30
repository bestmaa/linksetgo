import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX "fallback_origins_hostname_idx";
  CREATE INDEX "fallback_origins_hostname_idx" ON "fallback_origins" USING btree ("hostname");
  CREATE UNIQUE INDEX "workspace_hostname_idx" ON "fallback_origins" USING btree ("workspace_id","hostname");
  CREATE TYPE "public"."enum_fallback_url_safety_assessments_threats" AS ENUM('malware', 'phishing', 'social-engineering', 'unwanted-software', 'other');
  CREATE TYPE "public"."enum_fallback_url_safety_assessments_status" AS ENUM('pending', 'checking', 'safe', 'unsafe', 'error');
  CREATE TYPE "public"."enum_apps_routing_mode" AS ENUM('scheme-handoff', 'verified-app-links');
  CREATE TABLE "fallback_url_safety_assessments_threats" (
	"order" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"value" "enum_fallback_url_safety_assessments_threats",
	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "fallback_url_safety_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"origin_id" integer NOT NULL,
	"canonical_url" varchar NOT NULL,
	"hostname" varchar NOT NULL,
	"url_hash" varchar NOT NULL,
	"status" "enum_fallback_url_safety_assessments_status" DEFAULT 'pending' NOT NULL,
	"checked_at" timestamp(3) with time zone,
	"expires_at" timestamp(3) with time zone,
	"provider_observed_at" timestamp(3) with time zone,
	"claim_token" varchar,
	"claim_expires_at" timestamp(3) with time zone,
	"last_attempt_at" timestamp(3) with time zone,
	"redirect_count" numeric DEFAULT 0 NOT NULL,
	"last_error" varchar,
	"evidence" jsonb,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "apps" ALTER COLUMN "fallback_url" DROP NOT NULL;
  ALTER TABLE "apps" ADD COLUMN "public_key" varchar;
  ALTER TABLE "apps" ADD COLUMN "routing_mode" "enum_apps_routing_mode" DEFAULT 'verified-app-links';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "fallback_url_safety_assessments_id" integer;
  ALTER TABLE "fallback_url_safety_assessments_threats" ADD CONSTRAINT "fallback_url_safety_assessments_threats_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."fallback_url_safety_assessments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "fallback_url_safety_assessments" ADD CONSTRAINT "fallback_url_safety_assessments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "fallback_url_safety_assessments" ADD CONSTRAINT "fallback_url_safety_assessments_origin_id_fallback_origins_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."fallback_origins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "fallback_url_safety_assessments_threats_order_idx" ON "fallback_url_safety_assessments_threats" USING btree ("order");
  CREATE INDEX "fallback_url_safety_assessments_threats_parent_idx" ON "fallback_url_safety_assessments_threats" USING btree ("parent_id");
  CREATE INDEX "fallback_url_safety_assessments_workspace_idx" ON "fallback_url_safety_assessments" USING btree ("workspace_id");
  CREATE INDEX "fallback_url_safety_assessments_origin_idx" ON "fallback_url_safety_assessments" USING btree ("origin_id");
  CREATE INDEX "fallback_url_safety_assessments_hostname_idx" ON "fallback_url_safety_assessments" USING btree ("hostname");
  CREATE INDEX "fallback_url_safety_assessments_url_hash_idx" ON "fallback_url_safety_assessments" USING btree ("url_hash");
  CREATE INDEX "fallback_url_safety_assessments_status_idx" ON "fallback_url_safety_assessments" USING btree ("status");
  CREATE INDEX "fallback_url_safety_assessments_checked_at_idx" ON "fallback_url_safety_assessments" USING btree ("checked_at");
  CREATE INDEX "fallback_url_safety_assessments_expires_at_idx" ON "fallback_url_safety_assessments" USING btree ("expires_at");
  CREATE INDEX "fallback_url_safety_assessments_claim_expires_at_idx" ON "fallback_url_safety_assessments" USING btree ("claim_expires_at");
  CREATE INDEX "fallback_url_safety_assessments_last_attempt_at_idx" ON "fallback_url_safety_assessments" USING btree ("last_attempt_at");
  CREATE INDEX "fallback_url_safety_assessments_updated_at_idx" ON "fallback_url_safety_assessments" USING btree ("updated_at");
  CREATE INDEX "fallback_url_safety_assessments_created_at_idx" ON "fallback_url_safety_assessments" USING btree ("created_at");
  CREATE UNIQUE INDEX "workspace_urlHash_idx" ON "fallback_url_safety_assessments" USING btree ("workspace_id","url_hash");
  CREATE INDEX "status_expiresAt_idx" ON "fallback_url_safety_assessments" USING btree ("status","expires_at");
  CREATE INDEX "origin_status_idx" ON "fallback_url_safety_assessments" USING btree ("origin_id","status");
  CREATE INDEX "status_claimExpiresAt_idx" ON "fallback_url_safety_assessments" USING btree ("status","claim_expires_at");
  CREATE INDEX "status_checkedAt_idx" ON "fallback_url_safety_assessments" USING btree ("status","checked_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fallback_url_safety_assessm_fk" FOREIGN KEY ("fallback_url_safety_assessments_id") REFERENCES "public"."fallback_url_safety_assessments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "apps_public_key_idx" ON "apps" USING btree ("public_key");
  CREATE INDEX "apps_routing_mode_idx" ON "apps" USING btree ("routing_mode");
  CREATE UNIQUE INDEX "publicKey_idx" ON "apps" USING btree ("public_key");
  CREATE INDEX "payload_locked_documents_rels_fallback_url_safety_assess_idx" ON "payload_locked_documents_rels" USING btree ("fallback_url_safety_assessments_id");`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'This migration is irreversible: downgrading would discard shared-link routing and URL-safety evidence or invent tenant fallback destinations. Restore a verified pre-migration backup instead.',
  )
}
