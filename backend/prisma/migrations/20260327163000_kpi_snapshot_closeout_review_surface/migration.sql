ALTER TABLE "kpi_snapshots"
ADD COLUMN IF NOT EXISTS "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS "comparison_summary" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "kpi_snapshot_items"
ADD COLUMN IF NOT EXISTS "title" text,
ADD COLUMN IF NOT EXISTS "initiative_level" "KpiInitiativeLevel";
