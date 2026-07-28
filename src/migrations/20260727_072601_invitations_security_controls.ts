import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_fallback_origins_status" AS ENUM('pending', 'verifying', 'verified', 'revoked');
  CREATE TYPE "public"."enum_organization_invitations_role" AS ENUM('owner', 'admin', 'member', 'viewer');
  CREATE TYPE "public"."enum_organization_invitations_status" AS ENUM('pending', 'accepted', 'revoked');
  CREATE TYPE "public"."enum_organization_invitations_delivery_mode" AS ENUM('webhook', 'manual');
  CREATE TYPE "public"."enum_abuse_reports_category" AS ENUM('malware', 'phishing', 'spam', 'impersonation', 'other');
  CREATE TYPE "public"."enum_abuse_reports_status" AS ENUM('received', 'triaged', 'attached-to-case', 'closed');
  CREATE TYPE "public"."enum_abuse_cases_status" AS ENUM('open', 'investigating', 'actioned', 'closed');
  CREATE TYPE "public"."enum_abuse_cases_severity" AS ENUM('low', 'medium', 'high', 'critical');
  CREATE TYPE "public"."enum_enforcement_events_resource_type" AS ENUM('organization', 'workspace', 'domain', 'app', 'link');
  CREATE TYPE "public"."enum_enforcement_events_action" AS ENUM('suspend', 'restore');
  CREATE TYPE "public"."enum_abuse_case_events_event_type" AS ENUM('opened', 'note', 'status-changed', 'resource-suspended', 'resource-restored');
  CREATE TABLE "fallback_origins" (
    "id" serial PRIMARY KEY NOT NULL,
    "workspace_id" integer NOT NULL,
    "hostname" varchar NOT NULL,
    "status" "enum_fallback_origins_status" DEFAULT 'pending' NOT NULL,
    "verification_token" varchar NOT NULL,
    "last_checked_at" timestamp(3) with time zone,
    "verified_at" timestamp(3) with time zone,
    "revoked_at" timestamp(3) with time zone,
    "last_verification_error" varchar,
    "last_evidence" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "organization_invitations" (
    "id" serial PRIMARY KEY NOT NULL,
    "organization_id" integer NOT NULL,
    "email_normalized" varchar NOT NULL,
    "role" "enum_organization_invitations_role" NOT NULL,
    "status" "enum_organization_invitations_status" DEFAULT 'pending' NOT NULL,
    "token_hash" varchar NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "delivery_mode" "enum_organization_invitations_delivery_mode" NOT NULL,
    "delivered_at" timestamp(3) with time zone,
    "accepted_at" timestamp(3) with time zone,
    "revoked_at" timestamp(3) with time zone,
    "invited_by_id" integer NOT NULL,
    "accepted_by_id" integer,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "abuse_reports" (
    "id" serial PRIMARY KEY NOT NULL,
    "category" "enum_abuse_reports_category" NOT NULL,
    "target_hostname" varchar NOT NULL,
    "target_path" varchar,
    "details" varchar NOT NULL,
    "reporter_contact" varchar,
    "reporter_key_hash" varchar NOT NULL,
    "user_agent_hash" varchar,
    "submission_hash" varchar NOT NULL,
    "received_at" timestamp(3) with time zone NOT NULL,
    "status" "enum_abuse_reports_status" DEFAULT 'received' NOT NULL,
    "workspace_id" integer,
    "domain_id" integer,
    "app_id" integer,
    "link_id" integer,
    "evidence_snapshot" jsonb NOT NULL
  );

  CREATE TABLE "abuse_cases" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "status" "enum_abuse_cases_status" DEFAULT 'open' NOT NULL,
    "severity" "enum_abuse_cases_severity" DEFAULT 'medium' NOT NULL,
    "primary_report_id" integer,
    "workspace_id" integer,
    "domain_id" integer,
    "app_id" integer,
    "link_id" integer,
    "assigned_to_id" integer,
    "opened_at" timestamp(3) with time zone NOT NULL,
    "closed_at" timestamp(3) with time zone,
    "resolution" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "enforcement_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "resource_type" "enum_enforcement_events_resource_type" NOT NULL,
    "resource_i_d" varchar NOT NULL,
    "action" "enum_enforcement_events_action" NOT NULL,
    "previous_suspended" boolean DEFAULT false NOT NULL,
    "reason" varchar NOT NULL,
    "abuse_case_id" integer,
    "actor_id" integer NOT NULL,
    "occurred_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "abuse_case_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "abuse_case_id" integer NOT NULL,
    "event_type" "enum_abuse_case_events_event_type" NOT NULL,
    "summary" varchar NOT NULL,
    "actor_id" integer NOT NULL,
    "enforcement_event_id" integer,
    "occurred_at" timestamp(3) with time zone NOT NULL
  );

  ALTER TABLE "organizations" ADD COLUMN "platform_suspended" boolean DEFAULT false;
  ALTER TABLE "organizations" ADD COLUMN "platform_suspended_at" timestamp(3) with time zone;
  ALTER TABLE "organizations" ADD COLUMN "platform_restored_at" timestamp(3) with time zone;
  ALTER TABLE "organizations" ADD COLUMN "platform_suspension_reason" varchar;
  ALTER TABLE "organizations" ADD COLUMN "platform_suspension_case_id" integer;
  ALTER TABLE "workspaces" ADD COLUMN "platform_suspended" boolean DEFAULT false;
  ALTER TABLE "workspaces" ADD COLUMN "platform_suspended_at" timestamp(3) with time zone;
  ALTER TABLE "workspaces" ADD COLUMN "platform_restored_at" timestamp(3) with time zone;
  ALTER TABLE "workspaces" ADD COLUMN "platform_suspension_reason" varchar;
  ALTER TABLE "workspaces" ADD COLUMN "platform_suspension_case_id" integer;
  ALTER TABLE "domains" ADD COLUMN "platform_suspended" boolean DEFAULT false;
  ALTER TABLE "domains" ADD COLUMN "platform_suspended_at" timestamp(3) with time zone;
  ALTER TABLE "domains" ADD COLUMN "platform_restored_at" timestamp(3) with time zone;
  ALTER TABLE "domains" ADD COLUMN "platform_suspension_reason" varchar;
  ALTER TABLE "domains" ADD COLUMN "platform_suspension_case_id" integer;
  ALTER TABLE "apps" ADD COLUMN "platform_suspended" boolean DEFAULT false;
  ALTER TABLE "apps" ADD COLUMN "platform_suspended_at" timestamp(3) with time zone;
  ALTER TABLE "apps" ADD COLUMN "platform_restored_at" timestamp(3) with time zone;
  ALTER TABLE "apps" ADD COLUMN "platform_suspension_reason" varchar;
  ALTER TABLE "apps" ADD COLUMN "platform_suspension_case_id" integer;
  ALTER TABLE "deep_links" ADD COLUMN "platform_suspended" boolean DEFAULT false;
  ALTER TABLE "deep_links" ADD COLUMN "platform_suspended_at" timestamp(3) with time zone;
  ALTER TABLE "deep_links" ADD COLUMN "platform_restored_at" timestamp(3) with time zone;
  ALTER TABLE "deep_links" ADD COLUMN "platform_suspension_reason" varchar;
  ALTER TABLE "deep_links" ADD COLUMN "platform_suspension_case_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "fallback_origins_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organization_invitations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "abuse_reports_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "abuse_cases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "enforcement_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "abuse_case_events_id" integer;
  ALTER TABLE "fallback_origins" ADD CONSTRAINT "fallback_origins_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_link_id_deep_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."deep_links"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_primary_report_id_abuse_reports_id_fk" FOREIGN KEY ("primary_report_id") REFERENCES "public"."abuse_reports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_link_id_deep_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."deep_links"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_cases" ADD CONSTRAINT "abuse_cases_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enforcement_events" ADD CONSTRAINT "enforcement_events_abuse_case_id_abuse_cases_id_fk" FOREIGN KEY ("abuse_case_id") REFERENCES "public"."abuse_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enforcement_events" ADD CONSTRAINT "enforcement_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_case_events" ADD CONSTRAINT "abuse_case_events_abuse_case_id_abuse_cases_id_fk" FOREIGN KEY ("abuse_case_id") REFERENCES "public"."abuse_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_case_events" ADD CONSTRAINT "abuse_case_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "abuse_case_events" ADD CONSTRAINT "abuse_case_events_enforcement_event_id_enforcement_events_id_fk" FOREIGN KEY ("enforcement_event_id") REFERENCES "public"."enforcement_events"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "fallback_origins_workspace_idx" ON "fallback_origins" USING btree ("workspace_id");
  CREATE UNIQUE INDEX "fallback_origins_hostname_idx" ON "fallback_origins" USING btree ("hostname");
  CREATE INDEX "fallback_origins_status_idx" ON "fallback_origins" USING btree ("status");
  CREATE INDEX "fallback_origins_updated_at_idx" ON "fallback_origins" USING btree ("updated_at");
  CREATE INDEX "fallback_origins_created_at_idx" ON "fallback_origins" USING btree ("created_at");
  CREATE INDEX "organization_invitations_organization_idx" ON "organization_invitations" USING btree ("organization_id");
  CREATE INDEX "organization_invitations_email_normalized_idx" ON "organization_invitations" USING btree ("email_normalized");
  CREATE INDEX "organization_invitations_role_idx" ON "organization_invitations" USING btree ("role");
  CREATE INDEX "organization_invitations_status_idx" ON "organization_invitations" USING btree ("status");
  CREATE UNIQUE INDEX "organization_invitations_token_hash_idx" ON "organization_invitations" USING btree ("token_hash");
  CREATE INDEX "organization_invitations_expires_at_idx" ON "organization_invitations" USING btree ("expires_at");
  CREATE INDEX "organization_invitations_invited_by_idx" ON "organization_invitations" USING btree ("invited_by_id");
  CREATE INDEX "organization_invitations_accepted_by_idx" ON "organization_invitations" USING btree ("accepted_by_id");
  CREATE INDEX "organization_invitations_updated_at_idx" ON "organization_invitations" USING btree ("updated_at");
  CREATE INDEX "organization_invitations_created_at_idx" ON "organization_invitations" USING btree ("created_at");
  CREATE INDEX "organization_status_expiresAt_idx" ON "organization_invitations" USING btree ("organization_id","status","expires_at");
  CREATE INDEX "organization_emailNormalized_status_idx" ON "organization_invitations" USING btree ("organization_id","email_normalized","status");
  CREATE INDEX "abuse_reports_category_idx" ON "abuse_reports" USING btree ("category");
  CREATE INDEX "abuse_reports_target_hostname_idx" ON "abuse_reports" USING btree ("target_hostname");
  CREATE INDEX "abuse_reports_reporter_key_hash_idx" ON "abuse_reports" USING btree ("reporter_key_hash");
  CREATE UNIQUE INDEX "abuse_reports_submission_hash_idx" ON "abuse_reports" USING btree ("submission_hash");
  CREATE INDEX "abuse_reports_received_at_idx" ON "abuse_reports" USING btree ("received_at");
  CREATE INDEX "abuse_reports_status_idx" ON "abuse_reports" USING btree ("status");
  CREATE INDEX "abuse_reports_workspace_idx" ON "abuse_reports" USING btree ("workspace_id");
  CREATE INDEX "abuse_reports_domain_idx" ON "abuse_reports" USING btree ("domain_id");
  CREATE INDEX "abuse_reports_app_idx" ON "abuse_reports" USING btree ("app_id");
  CREATE INDEX "abuse_reports_link_idx" ON "abuse_reports" USING btree ("link_id");
  CREATE INDEX "abuse_cases_status_idx" ON "abuse_cases" USING btree ("status");
  CREATE INDEX "abuse_cases_severity_idx" ON "abuse_cases" USING btree ("severity");
  CREATE INDEX "abuse_cases_primary_report_idx" ON "abuse_cases" USING btree ("primary_report_id");
  CREATE INDEX "abuse_cases_workspace_idx" ON "abuse_cases" USING btree ("workspace_id");
  CREATE INDEX "abuse_cases_domain_idx" ON "abuse_cases" USING btree ("domain_id");
  CREATE INDEX "abuse_cases_app_idx" ON "abuse_cases" USING btree ("app_id");
  CREATE INDEX "abuse_cases_link_idx" ON "abuse_cases" USING btree ("link_id");
  CREATE INDEX "abuse_cases_assigned_to_idx" ON "abuse_cases" USING btree ("assigned_to_id");
  CREATE INDEX "abuse_cases_opened_at_idx" ON "abuse_cases" USING btree ("opened_at");
  CREATE INDEX "abuse_cases_closed_at_idx" ON "abuse_cases" USING btree ("closed_at");
  CREATE INDEX "abuse_cases_updated_at_idx" ON "abuse_cases" USING btree ("updated_at");
  CREATE INDEX "abuse_cases_created_at_idx" ON "abuse_cases" USING btree ("created_at");
  CREATE INDEX "enforcement_events_resource_type_idx" ON "enforcement_events" USING btree ("resource_type");
  CREATE INDEX "enforcement_events_resource_i_d_idx" ON "enforcement_events" USING btree ("resource_i_d");
  CREATE INDEX "enforcement_events_abuse_case_idx" ON "enforcement_events" USING btree ("abuse_case_id");
  CREATE INDEX "enforcement_events_actor_idx" ON "enforcement_events" USING btree ("actor_id");
  CREATE INDEX "enforcement_events_occurred_at_idx" ON "enforcement_events" USING btree ("occurred_at");
  CREATE INDEX "abuse_case_events_abuse_case_idx" ON "abuse_case_events" USING btree ("abuse_case_id");
  CREATE INDEX "abuse_case_events_event_type_idx" ON "abuse_case_events" USING btree ("event_type");
  CREATE INDEX "abuse_case_events_actor_idx" ON "abuse_case_events" USING btree ("actor_id");
  CREATE INDEX "abuse_case_events_enforcement_event_idx" ON "abuse_case_events" USING btree ("enforcement_event_id");
  CREATE INDEX "abuse_case_events_occurred_at_idx" ON "abuse_case_events" USING btree ("occurred_at");
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_platform_suspension_case_id_abuse_cases_id_fk" FOREIGN KEY ("platform_suspension_case_id") REFERENCES "public"."abuse_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_platform_suspension_case_id_abuse_cases_id_fk" FOREIGN KEY ("platform_suspension_case_id") REFERENCES "public"."abuse_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "domains" ADD CONSTRAINT "domains_platform_suspension_case_id_abuse_cases_id_fk" FOREIGN KEY ("platform_suspension_case_id") REFERENCES "public"."abuse_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "apps" ADD CONSTRAINT "apps_platform_suspension_case_id_abuse_cases_id_fk" FOREIGN KEY ("platform_suspension_case_id") REFERENCES "public"."abuse_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "deep_links" ADD CONSTRAINT "deep_links_platform_suspension_case_id_abuse_cases_id_fk" FOREIGN KEY ("platform_suspension_case_id") REFERENCES "public"."abuse_cases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fallback_origins_fk" FOREIGN KEY ("fallback_origins_id") REFERENCES "public"."fallback_origins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organization_invitations_fk" FOREIGN KEY ("organization_invitations_id") REFERENCES "public"."organization_invitations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_abuse_reports_fk" FOREIGN KEY ("abuse_reports_id") REFERENCES "public"."abuse_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_abuse_cases_fk" FOREIGN KEY ("abuse_cases_id") REFERENCES "public"."abuse_cases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_enforcement_events_fk" FOREIGN KEY ("enforcement_events_id") REFERENCES "public"."enforcement_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_abuse_case_events_fk" FOREIGN KEY ("abuse_case_events_id") REFERENCES "public"."abuse_case_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "organizations_platform_suspended_idx" ON "organizations" USING btree ("platform_suspended");
  CREATE INDEX "organizations_platform_suspension_case_idx" ON "organizations" USING btree ("platform_suspension_case_id");
  CREATE INDEX "workspaces_platform_suspended_idx" ON "workspaces" USING btree ("platform_suspended");
  CREATE INDEX "workspaces_platform_suspension_case_idx" ON "workspaces" USING btree ("platform_suspension_case_id");
  CREATE INDEX "domains_platform_suspended_idx" ON "domains" USING btree ("platform_suspended");
  CREATE INDEX "domains_platform_suspension_case_idx" ON "domains" USING btree ("platform_suspension_case_id");
  CREATE INDEX "apps_platform_suspended_idx" ON "apps" USING btree ("platform_suspended");
  CREATE INDEX "apps_platform_suspension_case_idx" ON "apps" USING btree ("platform_suspension_case_id");
  CREATE INDEX "deep_links_platform_suspended_idx" ON "deep_links" USING btree ("platform_suspended");
  CREATE INDEX "deep_links_platform_suspension_case_idx" ON "deep_links" USING btree ("platform_suspension_case_id");
  CREATE INDEX "payload_locked_documents_rels_fallback_origins_id_idx" ON "payload_locked_documents_rels" USING btree ("fallback_origins_id");
  CREATE INDEX "payload_locked_documents_rels_organization_invitations_i_idx" ON "payload_locked_documents_rels" USING btree ("organization_invitations_id");
  CREATE INDEX "payload_locked_documents_rels_abuse_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("abuse_reports_id");
  CREATE INDEX "payload_locked_documents_rels_abuse_cases_id_idx" ON "payload_locked_documents_rels" USING btree ("abuse_cases_id");
  CREATE INDEX "payload_locked_documents_rels_enforcement_events_id_idx" ON "payload_locked_documents_rels" USING btree ("enforcement_events_id");
  CREATE INDEX "payload_locked_documents_rels_abuse_case_events_id_idx" ON "payload_locked_documents_rels" USING btree ("abuse_case_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "fallback_origins" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organization_invitations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "abuse_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "abuse_cases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "enforcement_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "abuse_case_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "fallback_origins" CASCADE;
  DROP TABLE "organization_invitations" CASCADE;
  DROP TABLE "abuse_reports" CASCADE;
  DROP TABLE "abuse_cases" CASCADE;
  DROP TABLE "enforcement_events" CASCADE;
  DROP TABLE "abuse_case_events" CASCADE;
  ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_platform_suspension_case_id_abuse_cases_id_fk";

  ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_platform_suspension_case_id_abuse_cases_id_fk";

  ALTER TABLE "domains" DROP CONSTRAINT IF EXISTS "domains_platform_suspension_case_id_abuse_cases_id_fk";

  ALTER TABLE "apps" DROP CONSTRAINT IF EXISTS "apps_platform_suspension_case_id_abuse_cases_id_fk";

  ALTER TABLE "deep_links" DROP CONSTRAINT IF EXISTS "deep_links_platform_suspension_case_id_abuse_cases_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_fallback_origins_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_organization_invitations_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_abuse_reports_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_abuse_cases_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_enforcement_events_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_abuse_case_events_fk";

  DROP INDEX "organizations_platform_suspended_idx";
  DROP INDEX "organizations_platform_suspension_case_idx";
  DROP INDEX "workspaces_platform_suspended_idx";
  DROP INDEX "workspaces_platform_suspension_case_idx";
  DROP INDEX "domains_platform_suspended_idx";
  DROP INDEX "domains_platform_suspension_case_idx";
  DROP INDEX "apps_platform_suspended_idx";
  DROP INDEX "apps_platform_suspension_case_idx";
  DROP INDEX "deep_links_platform_suspended_idx";
  DROP INDEX "deep_links_platform_suspension_case_idx";
  DROP INDEX "payload_locked_documents_rels_fallback_origins_id_idx";
  DROP INDEX "payload_locked_documents_rels_organization_invitations_i_idx";
  DROP INDEX "payload_locked_documents_rels_abuse_reports_id_idx";
  DROP INDEX "payload_locked_documents_rels_abuse_cases_id_idx";
  DROP INDEX "payload_locked_documents_rels_enforcement_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_abuse_case_events_id_idx";
  ALTER TABLE "organizations" DROP COLUMN "platform_suspended";
  ALTER TABLE "organizations" DROP COLUMN "platform_suspended_at";
  ALTER TABLE "organizations" DROP COLUMN "platform_restored_at";
  ALTER TABLE "organizations" DROP COLUMN "platform_suspension_reason";
  ALTER TABLE "organizations" DROP COLUMN "platform_suspension_case_id";
  ALTER TABLE "workspaces" DROP COLUMN "platform_suspended";
  ALTER TABLE "workspaces" DROP COLUMN "platform_suspended_at";
  ALTER TABLE "workspaces" DROP COLUMN "platform_restored_at";
  ALTER TABLE "workspaces" DROP COLUMN "platform_suspension_reason";
  ALTER TABLE "workspaces" DROP COLUMN "platform_suspension_case_id";
  ALTER TABLE "domains" DROP COLUMN "platform_suspended";
  ALTER TABLE "domains" DROP COLUMN "platform_suspended_at";
  ALTER TABLE "domains" DROP COLUMN "platform_restored_at";
  ALTER TABLE "domains" DROP COLUMN "platform_suspension_reason";
  ALTER TABLE "domains" DROP COLUMN "platform_suspension_case_id";
  ALTER TABLE "apps" DROP COLUMN "platform_suspended";
  ALTER TABLE "apps" DROP COLUMN "platform_suspended_at";
  ALTER TABLE "apps" DROP COLUMN "platform_restored_at";
  ALTER TABLE "apps" DROP COLUMN "platform_suspension_reason";
  ALTER TABLE "apps" DROP COLUMN "platform_suspension_case_id";
  ALTER TABLE "deep_links" DROP COLUMN "platform_suspended";
  ALTER TABLE "deep_links" DROP COLUMN "platform_suspended_at";
  ALTER TABLE "deep_links" DROP COLUMN "platform_restored_at";
  ALTER TABLE "deep_links" DROP COLUMN "platform_suspension_reason";
  ALTER TABLE "deep_links" DROP COLUMN "platform_suspension_case_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "fallback_origins_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organization_invitations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "abuse_reports_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "abuse_cases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "enforcement_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "abuse_case_events_id";
  DROP TYPE "public"."enum_fallback_origins_status";
  DROP TYPE "public"."enum_organization_invitations_role";
  DROP TYPE "public"."enum_organization_invitations_status";
  DROP TYPE "public"."enum_organization_invitations_delivery_mode";
  DROP TYPE "public"."enum_abuse_reports_category";
  DROP TYPE "public"."enum_abuse_reports_status";
  DROP TYPE "public"."enum_abuse_cases_status";
  DROP TYPE "public"."enum_abuse_cases_severity";
  DROP TYPE "public"."enum_enforcement_events_resource_type";
  DROP TYPE "public"."enum_enforcement_events_action";
  DROP TYPE "public"."enum_abuse_case_events_event_type";`)
}
