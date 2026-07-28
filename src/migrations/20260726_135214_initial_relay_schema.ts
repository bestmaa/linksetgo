import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('super-admin', 'admin', 'viewer');
  CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'disabled');
  CREATE TYPE "public"."enum_apps_status" AS ENUM('draft', 'active', 'paused');
  CREATE TYPE "public"."enum_deep_links_status" AS ENUM('draft', 'active', 'paused');
  CREATE TYPE "public"."enum_link_events_event_type" AS ENUM('resolved', 'fallback-viewed', 'open-app-clicked', 'store-clicked', 'app-opened');
  CREATE TYPE "public"."enum_link_events_platform" AS ENUM('ios', 'android', 'web', 'unknown');
  CREATE TYPE "public"."enum_verification_runs_kind" AS ENUM('association', 'deep-link');
  CREATE TYPE "public"."enum_verification_runs_status" AS ENUM('queued', 'running', 'passed', 'failed');
  CREATE TABLE "users_sessions" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "created_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "users" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "role" "enum_users_role" DEFAULT 'admin' NOT NULL,
    "status" "enum_users_status" DEFAULT 'active' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "email" varchar NOT NULL,
    "reset_password_token" varchar,
    "reset_password_expiration" timestamp(3) with time zone,
    "salt" varchar,
    "hash" varchar,
    "login_attempts" numeric DEFAULT 0,
    "lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "users_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "apps_id" integer
  );

  CREATE TABLE "apps" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "slug" varchar NOT NULL,
    "description" varchar,
    "status" "enum_apps_status" DEFAULT 'draft' NOT NULL,
    "ios_bundle_id" varchar,
    "ios_team_id" varchar,
    "android_package_name" varchar,
    "app_store_url" varchar,
    "play_store_url" varchar,
    "fallback_url" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "apps_texts" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "text" varchar
  );

  CREATE TABLE "deep_links" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "app_id" integer NOT NULL,
    "slug" varchar NOT NULL,
    "destination_path" varchar NOT NULL,
    "parameters" jsonb,
    "fallback_url" varchar,
    "status" "enum_deep_links_status" DEFAULT 'draft' NOT NULL,
    "expires_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "link_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "link_id" integer NOT NULL,
    "app_id" integer NOT NULL,
    "event_type" "enum_link_events_event_type" NOT NULL,
    "platform" "enum_link_events_platform" DEFAULT 'unknown' NOT NULL,
    "session_hash" varchar,
    "referrer" varchar,
    "user_agent" varchar,
    "metadata" jsonb,
    "occurred_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "verification_runs" (
    "id" serial PRIMARY KEY NOT NULL,
    "app_id" integer NOT NULL,
    "link_id" integer,
    "kind" "enum_verification_runs_kind" NOT NULL,
    "status" "enum_verification_runs_status" DEFAULT 'queued' NOT NULL,
    "checks" jsonb,
    "started_at" timestamp(3) with time zone NOT NULL,
    "finished_at" timestamp(3) with time zone,
    "initiated_by_id" integer,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_kv" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "data" jsonb NOT NULL
  );

  CREATE TABLE "payload_locked_documents" (
    "id" serial PRIMARY KEY NOT NULL,
    "global_slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_locked_documents_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer,
    "apps_id" integer,
    "deep_links_id" integer,
    "link_events_id" integer,
    "verification_runs_id" integer
  );

  CREATE TABLE "payload_preferences" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar,
    "value" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_preferences_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer
  );

  CREATE TABLE "payload_migrations" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "batch" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_apps_fk" FOREIGN KEY ("apps_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_texts" ADD CONSTRAINT "apps_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "deep_links" ADD CONSTRAINT "deep_links_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "link_events" ADD CONSTRAINT "link_events_link_id_deep_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."deep_links"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "link_events" ADD CONSTRAINT "link_events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_link_id_deep_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."deep_links"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_apps_fk" FOREIGN KEY ("apps_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_deep_links_fk" FOREIGN KEY ("deep_links_id") REFERENCES "public"."deep_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_link_events_fk" FOREIGN KEY ("link_events_id") REFERENCES "public"."link_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_verification_runs_fk" FOREIGN KEY ("verification_runs_id") REFERENCES "public"."verification_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "users_rels_order_idx" ON "users_rels" USING btree ("order");
  CREATE INDEX "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
  CREATE INDEX "users_rels_path_idx" ON "users_rels" USING btree ("path");
  CREATE INDEX "users_rels_apps_id_idx" ON "users_rels" USING btree ("apps_id");
  CREATE UNIQUE INDEX "apps_slug_idx" ON "apps" USING btree ("slug");
  CREATE INDEX "apps_status_idx" ON "apps" USING btree ("status");
  CREATE INDEX "apps_updated_at_idx" ON "apps" USING btree ("updated_at");
  CREATE INDEX "apps_created_at_idx" ON "apps" USING btree ("created_at");
  CREATE INDEX "apps_texts_order_parent" ON "apps_texts" USING btree ("order","parent_id");
  CREATE INDEX "deep_links_app_idx" ON "deep_links" USING btree ("app_id");
  CREATE INDEX "deep_links_slug_idx" ON "deep_links" USING btree ("slug");
  CREATE INDEX "deep_links_status_idx" ON "deep_links" USING btree ("status");
  CREATE INDEX "deep_links_expires_at_idx" ON "deep_links" USING btree ("expires_at");
  CREATE INDEX "deep_links_updated_at_idx" ON "deep_links" USING btree ("updated_at");
  CREATE INDEX "deep_links_created_at_idx" ON "deep_links" USING btree ("created_at");
  CREATE UNIQUE INDEX "app_slug_idx" ON "deep_links" USING btree ("app_id","slug");
  CREATE INDEX "app_status_idx" ON "deep_links" USING btree ("app_id","status");
  CREATE INDEX "link_events_link_idx" ON "link_events" USING btree ("link_id");
  CREATE INDEX "link_events_app_idx" ON "link_events" USING btree ("app_id");
  CREATE INDEX "link_events_event_type_idx" ON "link_events" USING btree ("event_type");
  CREATE INDEX "link_events_occurred_at_idx" ON "link_events" USING btree ("occurred_at");
  CREATE INDEX "link_events_updated_at_idx" ON "link_events" USING btree ("updated_at");
  CREATE INDEX "link_events_created_at_idx" ON "link_events" USING btree ("created_at");
  CREATE INDEX "link_occurredAt_idx" ON "link_events" USING btree ("link_id","occurred_at");
  CREATE INDEX "app_occurredAt_idx" ON "link_events" USING btree ("app_id","occurred_at");
  CREATE INDEX "sessionHash_occurredAt_idx" ON "link_events" USING btree ("session_hash","occurred_at");
  CREATE INDEX "verification_runs_app_idx" ON "verification_runs" USING btree ("app_id");
  CREATE INDEX "verification_runs_link_idx" ON "verification_runs" USING btree ("link_id");
  CREATE INDEX "verification_runs_status_idx" ON "verification_runs" USING btree ("status");
  CREATE INDEX "verification_runs_started_at_idx" ON "verification_runs" USING btree ("started_at");
  CREATE INDEX "verification_runs_initiated_by_idx" ON "verification_runs" USING btree ("initiated_by_id");
  CREATE INDEX "verification_runs_updated_at_idx" ON "verification_runs" USING btree ("updated_at");
  CREATE INDEX "verification_runs_created_at_idx" ON "verification_runs" USING btree ("created_at");
  CREATE INDEX "app_startedAt_idx" ON "verification_runs" USING btree ("app_id","started_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_apps_id_idx" ON "payload_locked_documents_rels" USING btree ("apps_id");
  CREATE INDEX "payload_locked_documents_rels_deep_links_id_idx" ON "payload_locked_documents_rels" USING btree ("deep_links_id");
  CREATE INDEX "payload_locked_documents_rels_link_events_id_idx" ON "payload_locked_documents_rels" USING btree ("link_events_id");
  CREATE INDEX "payload_locked_documents_rels_verification_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("verification_runs_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "users_rels" CASCADE;
  DROP TABLE "apps" CASCADE;
  DROP TABLE "apps_texts" CASCADE;
  DROP TABLE "deep_links" CASCADE;
  DROP TABLE "link_events" CASCADE;
  DROP TABLE "verification_runs" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_users_status";
  DROP TYPE "public"."enum_apps_status";
  DROP TYPE "public"."enum_deep_links_status";
  DROP TYPE "public"."enum_link_events_event_type";
  DROP TYPE "public"."enum_link_events_platform";
  DROP TYPE "public"."enum_verification_runs_kind";
  DROP TYPE "public"."enum_verification_runs_status";`)
}
