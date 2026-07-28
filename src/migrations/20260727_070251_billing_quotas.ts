import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_subscriptions_plan" AS ENUM('free', 'starter', 'pro');
  CREATE TYPE "public"."enum_subscriptions_status" AS ENUM('active', 'trialing', 'past-due', 'paused', 'canceled');
  CREATE TYPE "public"."enum_billing_events_plan" AS ENUM('free', 'starter', 'pro');
  CREATE TYPE "public"."enum_billing_events_status" AS ENUM('active', 'trialing', 'past-due', 'paused', 'canceled');
  CREATE TYPE "public"."enum_billing_events_outcome" AS ENUM('applied', 'stale');
  CREATE TYPE "public"."enum_usage_counters_metric" AS ENUM('monthly-resolutions');
  CREATE TABLE "subscriptions" (
    "id" serial PRIMARY KEY NOT NULL,
    "organization_id" integer NOT NULL,
    "plan" "enum_subscriptions_plan" DEFAULT 'free' NOT NULL,
    "status" "enum_subscriptions_status" DEFAULT 'active' NOT NULL,
    "provider" varchar NOT NULL,
    "provider_customer_i_d" varchar,
    "provider_subscription_i_d" varchar NOT NULL,
    "current_period_end" timestamp(3) with time zone,
    "grace_ends_at" timestamp(3) with time zone,
    "last_event_at" timestamp(3) with time zone NOT NULL,
    "last_provider_event_i_d" varchar NOT NULL,
    "catalog_version" numeric DEFAULT 1 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "billing_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "organization_id" integer NOT NULL,
    "provider" varchar NOT NULL,
    "provider_event_i_d" varchar NOT NULL,
    "provider_subscription_i_d" varchar NOT NULL,
    "occurred_at" timestamp(3) with time zone NOT NULL,
    "received_at" timestamp(3) with time zone NOT NULL,
    "payload_hash" varchar NOT NULL,
    "plan" "enum_billing_events_plan" NOT NULL,
    "status" "enum_billing_events_status" NOT NULL,
    "outcome" "enum_billing_events_outcome" NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "usage_counters" (
    "id" serial PRIMARY KEY NOT NULL,
    "organization_id" integer NOT NULL,
    "metric" "enum_usage_counters_metric" DEFAULT 'monthly-resolutions' NOT NULL,
    "period_start" timestamp(3) with time zone NOT NULL,
    "count" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DROP INDEX "apps_slug_idx";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscriptions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "billing_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "usage_counters_id" integer;
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "subscriptions_organization_idx" ON "subscriptions" USING btree ("organization_id");
  CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan");
  CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");
  CREATE INDEX "subscriptions_provider_customer_i_d_idx" ON "subscriptions" USING btree ("provider_customer_i_d");
  CREATE UNIQUE INDEX "subscriptions_provider_subscription_i_d_idx" ON "subscriptions" USING btree ("provider_subscription_i_d");
  CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions" USING btree ("current_period_end");
  CREATE INDEX "subscriptions_grace_ends_at_idx" ON "subscriptions" USING btree ("grace_ends_at");
  CREATE INDEX "subscriptions_last_event_at_idx" ON "subscriptions" USING btree ("last_event_at");
  CREATE INDEX "subscriptions_updated_at_idx" ON "subscriptions" USING btree ("updated_at");
  CREATE INDEX "subscriptions_created_at_idx" ON "subscriptions" USING btree ("created_at");
  CREATE INDEX "status_currentPeriodEnd_idx" ON "subscriptions" USING btree ("status","current_period_end");
  CREATE INDEX "billing_events_organization_idx" ON "billing_events" USING btree ("organization_id");
  CREATE UNIQUE INDEX "billing_events_provider_event_i_d_idx" ON "billing_events" USING btree ("provider_event_i_d");
  CREATE INDEX "billing_events_provider_subscription_i_d_idx" ON "billing_events" USING btree ("provider_subscription_i_d");
  CREATE INDEX "billing_events_occurred_at_idx" ON "billing_events" USING btree ("occurred_at");
  CREATE INDEX "billing_events_received_at_idx" ON "billing_events" USING btree ("received_at");
  CREATE INDEX "billing_events_outcome_idx" ON "billing_events" USING btree ("outcome");
  CREATE INDEX "billing_events_updated_at_idx" ON "billing_events" USING btree ("updated_at");
  CREATE INDEX "billing_events_created_at_idx" ON "billing_events" USING btree ("created_at");
  CREATE INDEX "organization_occurredAt_idx" ON "billing_events" USING btree ("organization_id","occurred_at");
  CREATE INDEX "providerSubscriptionID_occurredAt_idx" ON "billing_events" USING btree ("provider_subscription_i_d","occurred_at");
  CREATE INDEX "usage_counters_organization_idx" ON "usage_counters" USING btree ("organization_id");
  CREATE INDEX "usage_counters_period_start_idx" ON "usage_counters" USING btree ("period_start");
  CREATE INDEX "usage_counters_updated_at_idx" ON "usage_counters" USING btree ("updated_at");
  CREATE INDEX "usage_counters_created_at_idx" ON "usage_counters" USING btree ("created_at");
  CREATE UNIQUE INDEX "organization_metric_periodStart_idx" ON "usage_counters" USING btree ("organization_id","metric","period_start");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscriptions_fk" FOREIGN KEY ("subscriptions_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_billing_events_fk" FOREIGN KEY ("billing_events_id") REFERENCES "public"."billing_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_usage_counters_fk" FOREIGN KEY ("usage_counters_id") REFERENCES "public"."usage_counters"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "workspace_slug_idx" ON "apps" USING btree ("workspace_id","slug");
  CREATE UNIQUE INDEX "apps_legacy_slug_unique_idx" ON "apps" USING btree ("slug") WHERE "workspace_id" IS NULL;
  CREATE INDEX "payload_locked_documents_rels_subscriptions_id_idx" ON "payload_locked_documents_rels" USING btree ("subscriptions_id");
  CREATE INDEX "payload_locked_documents_rels_billing_events_id_idx" ON "payload_locked_documents_rels" USING btree ("billing_events_id");
  CREATE INDEX "payload_locked_documents_rels_usage_counters_id_idx" ON "payload_locked_documents_rels" USING btree ("usage_counters_id");
  CREATE INDEX "apps_slug_idx" ON "apps" USING btree ("slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "billing_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "usage_counters" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "subscriptions" CASCADE;
  DROP TABLE "billing_events" CASCADE;
  DROP TABLE "usage_counters" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subscriptions_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_billing_events_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_usage_counters_fk";

  DROP INDEX "workspace_slug_idx";
  DROP INDEX "apps_legacy_slug_unique_idx";
  DROP INDEX "payload_locked_documents_rels_subscriptions_id_idx";
  DROP INDEX "payload_locked_documents_rels_billing_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_usage_counters_id_idx";
  DROP INDEX "apps_slug_idx";
  CREATE UNIQUE INDEX "apps_slug_idx" ON "apps" USING btree ("slug");
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscriptions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "billing_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "usage_counters_id";
  DROP TYPE "public"."enum_subscriptions_plan";
  DROP TYPE "public"."enum_subscriptions_status";
  DROP TYPE "public"."enum_billing_events_plan";
  DROP TYPE "public"."enum_billing_events_status";
  DROP TYPE "public"."enum_billing_events_outcome";
  DROP TYPE "public"."enum_usage_counters_metric";`)
}
