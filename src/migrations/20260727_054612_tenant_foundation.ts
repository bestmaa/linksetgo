import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_organizations_status" AS ENUM('active', 'suspended');
  CREATE TYPE "public"."enum_workspaces_status" AS ENUM('active', 'suspended');
  CREATE TYPE "public"."enum_organization_memberships_role" AS ENUM('owner', 'admin', 'member', 'viewer');
  CREATE TYPE "public"."enum_organization_memberships_status" AS ENUM('active', 'disabled');
  CREATE TABLE "organizations" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "slug" varchar NOT NULL,
    "status" "enum_organizations_status" DEFAULT 'active' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "workspaces" (
    "id" serial PRIMARY KEY NOT NULL,
    "organization_id" integer NOT NULL,
    "name" varchar NOT NULL,
    "slug" varchar NOT NULL,
    "status" "enum_workspaces_status" DEFAULT 'active' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "organization_memberships" (
    "id" serial PRIMARY KEY NOT NULL,
    "organization_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "role" "enum_organization_memberships_role" DEFAULT 'member' NOT NULL,
    "status" "enum_organization_memberships_status" DEFAULT 'active' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "apps" ADD COLUMN "workspace_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organizations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "workspaces_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organization_memberships_id" integer;
  ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");
  CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");
  CREATE INDEX "organizations_updated_at_idx" ON "organizations" USING btree ("updated_at");
  CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");
  CREATE INDEX "workspaces_organization_idx" ON "workspaces" USING btree ("organization_id");
  CREATE UNIQUE INDEX "workspaces_slug_idx" ON "workspaces" USING btree ("slug");
  CREATE INDEX "workspaces_status_idx" ON "workspaces" USING btree ("status");
  CREATE INDEX "workspaces_updated_at_idx" ON "workspaces" USING btree ("updated_at");
  CREATE INDEX "workspaces_created_at_idx" ON "workspaces" USING btree ("created_at");
  CREATE INDEX "organization_memberships_organization_idx" ON "organization_memberships" USING btree ("organization_id");
  CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("user_id");
  CREATE INDEX "organization_memberships_role_idx" ON "organization_memberships" USING btree ("role");
  CREATE INDEX "organization_memberships_status_idx" ON "organization_memberships" USING btree ("status");
  CREATE INDEX "organization_memberships_updated_at_idx" ON "organization_memberships" USING btree ("updated_at");
  CREATE INDEX "organization_memberships_created_at_idx" ON "organization_memberships" USING btree ("created_at");
  CREATE UNIQUE INDEX "organization_user_idx" ON "organization_memberships" USING btree ("organization_id","user_id");
  CREATE INDEX "organization_status_idx" ON "organization_memberships" USING btree ("organization_id","status");
  ALTER TABLE "apps" ADD CONSTRAINT "apps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizations_fk" FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_workspaces_fk" FOREIGN KEY ("workspaces_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organization_memberships_fk" FOREIGN KEY ("organization_memberships_id") REFERENCES "public"."organization_memberships"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "apps_workspace_idx" ON "apps" USING btree ("workspace_id");
  CREATE INDEX "payload_locked_documents_rels_organizations_id_idx" ON "payload_locked_documents_rels" USING btree ("organizations_id");
  CREATE INDEX "payload_locked_documents_rels_workspaces_id_idx" ON "payload_locked_documents_rels" USING btree ("workspaces_id");
  CREATE INDEX "payload_locked_documents_rels_organization_memberships_i_idx" ON "payload_locked_documents_rels" USING btree ("organization_memberships_id");

  -- Preserve every pre-tenant installation inside one explicit legacy tenant.
  -- The application keeps workspace_id nullable for a staged rollout, while this
  -- migration deterministically assigns all records that already exist.
  INSERT INTO "organizations" ("name", "slug", "status", "updated_at", "created_at")
  VALUES ('Legacy organization', 'legacy', 'active', now(), now())
  ON CONFLICT ("slug") DO NOTHING;

  INSERT INTO "workspaces" (
    "organization_id",
    "name",
    "slug",
    "status",
    "updated_at",
    "created_at"
  )
  SELECT "id", 'Legacy workspace', 'legacy', 'active', now(), now()
  FROM "organizations"
  WHERE "slug" = 'legacy'
  ON CONFLICT ("slug") DO NOTHING;

  UPDATE "apps"
  SET "workspace_id" = (
    SELECT "id"
    FROM "workspaces"
    WHERE "slug" = 'legacy'
    LIMIT 1
  )
  WHERE "workspace_id" IS NULL;

  INSERT INTO "organization_memberships" (
    "organization_id",
    "user_id",
    "role",
    "status",
    "updated_at",
    "created_at"
  )
  SELECT
    "organizations"."id",
    "users"."id",
    CASE
      WHEN "users"."role" = 'super-admin' THEN 'owner'::"enum_organization_memberships_role"
      WHEN "users"."role" = 'admin' THEN 'admin'::"enum_organization_memberships_role"
      ELSE 'viewer'::"enum_organization_memberships_role"
    END,
    CASE
      WHEN "users"."status" = 'active' THEN 'active'::"enum_organization_memberships_status"
      ELSE 'disabled'::"enum_organization_memberships_status"
    END,
    now(),
    now()
  FROM "users"
  CROSS JOIN "organizations"
  WHERE "organizations"."slug" = 'legacy'
  ON CONFLICT ("organization_id", "user_id") DO NOTHING;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "apps" DROP CONSTRAINT "apps_workspace_id_workspaces_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organizations_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_workspaces_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organization_memberships_fk";

  DROP INDEX "apps_workspace_idx";
  DROP INDEX "payload_locked_documents_rels_organizations_id_idx";
  DROP INDEX "payload_locked_documents_rels_workspaces_id_idx";
  DROP INDEX "payload_locked_documents_rels_organization_memberships_i_idx";
  ALTER TABLE "apps" DROP COLUMN "workspace_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organizations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "workspaces_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organization_memberships_id";
  DROP TABLE "organization_memberships" CASCADE;
  DROP TABLE "workspaces" CASCADE;
  DROP TABLE "organizations" CASCADE;
  DROP TYPE "public"."enum_organizations_status";
  DROP TYPE "public"."enum_workspaces_status";
  DROP TYPE "public"."enum_organization_memberships_role";
  DROP TYPE "public"."enum_organization_memberships_status";`)
}
