import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "linksetgo_rate_limit_windows" (
      "bucket" varchar(64) NOT NULL,
      "key_hash" varchar(64) NOT NULL,
      "count" integer NOT NULL,
      "reset_at" timestamp(3) with time zone NOT NULL,
      CONSTRAINT "linksetgo_rate_limit_windows_pkey" PRIMARY KEY ("bucket", "key_hash"),
      CONSTRAINT "linksetgo_rate_limit_windows_count_check" CHECK ("count" >= 1)
    );
    CREATE INDEX "linksetgo_rate_limit_windows_reset_at_idx"
      ON "linksetgo_rate_limit_windows" USING btree ("reset_at");

    CREATE FUNCTION "linksetgo_consume_rate_limit_pair"(
      "p_first_bucket" varchar,
      "p_first_key_hash" varchar,
      "p_first_limit" integer,
      "p_first_window_ms" integer,
      "p_second_bucket" varchar,
      "p_second_key_hash" varchar,
      "p_second_limit" integer,
      "p_second_window_ms" integer
    )
    RETURNS TABLE ("allowed" boolean, "remaining" integer, "reset_at" timestamptz)
    LANGUAGE plpgsql
    AS $$
    DECLARE
      "v_now" timestamptz := clock_timestamp();
      "v_first_count" integer;
      "v_first_reset" timestamptz;
      "v_second_count" integer;
      "v_second_reset" timestamptz;
      "v_first_lock" text := "p_first_bucket" || ':' || "p_first_key_hash";
      "v_second_lock" text := "p_second_bucket" || ':' || "p_second_key_hash";
    BEGIN
      IF "v_first_lock" <= "v_second_lock" THEN
        PERFORM pg_advisory_xact_lock(hashtextextended("v_first_lock", 0));
        PERFORM pg_advisory_xact_lock(hashtextextended("v_second_lock", 0));
      ELSE
        PERFORM pg_advisory_xact_lock(hashtextextended("v_second_lock", 0));
        PERFORM pg_advisory_xact_lock(hashtextextended("v_first_lock", 0));
      END IF;

      SELECT "count", "linksetgo_rate_limit_windows"."reset_at"
      INTO "v_first_count", "v_first_reset"
      FROM "linksetgo_rate_limit_windows"
      WHERE
        "bucket" = "p_first_bucket"
        AND "key_hash" = "p_first_key_hash";
      IF "v_first_count" IS NULL OR "v_first_reset" <= "v_now" THEN
        "v_first_count" := 0;
        "v_first_reset" :=
          "v_now" + ("p_first_window_ms" * interval '1 millisecond');
      END IF;

      SELECT "count", "linksetgo_rate_limit_windows"."reset_at"
      INTO "v_second_count", "v_second_reset"
      FROM "linksetgo_rate_limit_windows"
      WHERE
        "bucket" = "p_second_bucket"
        AND "key_hash" = "p_second_key_hash";
      IF "v_second_count" IS NULL OR "v_second_reset" <= "v_now" THEN
        "v_second_count" := 0;
        "v_second_reset" :=
          "v_now" + ("p_second_window_ms" * interval '1 millisecond');
      END IF;

      IF
        "v_first_count" >= "p_first_limit"
        OR "v_second_count" >= "p_second_limit"
      THEN
        "allowed" := false;
        "remaining" := 0;
        "reset_at" := GREATEST(
          CASE
            WHEN "v_first_count" >= "p_first_limit" THEN "v_first_reset"
            ELSE "v_now"
          END,
          CASE
            WHEN "v_second_count" >= "p_second_limit" THEN "v_second_reset"
            ELSE "v_now"
          END
        );
        RETURN NEXT;
        RETURN;
      END IF;

      "v_first_count" := "v_first_count" + 1;
      "v_second_count" := "v_second_count" + 1;
      INSERT INTO "linksetgo_rate_limit_windows"
        ("bucket", "key_hash", "count", "reset_at")
      VALUES
        ("p_first_bucket", "p_first_key_hash", "v_first_count", "v_first_reset")
      ON CONFLICT ("bucket", "key_hash") DO UPDATE SET
        "count" = EXCLUDED."count",
        "reset_at" = EXCLUDED."reset_at";
      INSERT INTO "linksetgo_rate_limit_windows"
        ("bucket", "key_hash", "count", "reset_at")
      VALUES
        ("p_second_bucket", "p_second_key_hash", "v_second_count", "v_second_reset")
      ON CONFLICT ("bucket", "key_hash") DO UPDATE SET
        "count" = EXCLUDED."count",
        "reset_at" = EXCLUDED."reset_at";

      "allowed" := true;
      "remaining" := LEAST(
        "p_first_limit" - "v_first_count",
        "p_second_limit" - "v_second_count"
      );
      "reset_at" := GREATEST("v_first_reset", "v_second_reset");
      RETURN NEXT;
    END;
    $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP FUNCTION "linksetgo_consume_rate_limit_pair"(
      varchar,
      varchar,
      integer,
      integer,
      varchar,
      varchar,
      integer,
      integer
    );
    DROP TABLE "linksetgo_rate_limit_windows";
  `)
}
