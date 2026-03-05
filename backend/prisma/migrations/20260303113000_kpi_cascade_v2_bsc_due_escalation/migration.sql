-- KPI Cascade V2 enhancements: BSC tags, due dates, and escalated state

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'KpiBscPerspective' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "KpiBscPerspective" AS ENUM ('financial', 'customer', 'internal_process', 'learning_growth');
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'KpiEntityState'
      AND n.nspname = 'public'
      AND e.enumlabel = 'escalated'
  ) THEN
    -- no-op
    NULL;
  ELSE
    ALTER TYPE "KpiEntityState" ADD VALUE 'escalated';
  END IF;
END
$$;

ALTER TABLE "kpi_goals"
  ADD COLUMN IF NOT EXISTS "bsc_tag" "KpiBscPerspective",
  ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMPTZ;

ALTER TABLE "kpi_metrics"
  ADD COLUMN IF NOT EXISTS "bsc_tag" "KpiBscPerspective",
  ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMPTZ;

ALTER TABLE "kpi_initiatives"
  ADD COLUMN IF NOT EXISTS "bsc_tag" "KpiBscPerspective",
  ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "kpi_goals_bsc_tag_idx" ON "kpi_goals" ("bsc_tag");
CREATE INDEX IF NOT EXISTS "kpi_goals_due_date_idx" ON "kpi_goals" ("due_date");

CREATE INDEX IF NOT EXISTS "kpi_metrics_bsc_tag_idx" ON "kpi_metrics" ("bsc_tag");
CREATE INDEX IF NOT EXISTS "kpi_metrics_due_date_idx" ON "kpi_metrics" ("due_date");

CREATE INDEX IF NOT EXISTS "kpi_initiatives_bsc_tag_idx" ON "kpi_initiatives" ("bsc_tag");
CREATE INDEX IF NOT EXISTS "kpi_initiatives_due_date_idx" ON "kpi_initiatives" ("due_date");
