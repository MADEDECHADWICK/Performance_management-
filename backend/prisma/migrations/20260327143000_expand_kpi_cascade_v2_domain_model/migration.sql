DO $$
BEGIN
  CREATE TYPE "KpiMetricFamily" AS ENUM (
    'audit_quality',
    'tax_accounting',
    'consulting_advisory',
    'firm_operations',
    'client_growth',
    'people_development'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiMetricType" AS ENUM (
    'outcome',
    'quality',
    'capacity',
    'risk',
    'development'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiRagMethod" AS ENUM ('auto', 'schedule', 'threshold');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "KpiForecastConfidence" AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "kpi_goals"
  ADD COLUMN IF NOT EXISTS "metric_family" "KpiMetricFamily" NOT NULL DEFAULT 'firm_operations',
  ADD COLUMN IF NOT EXISTS "kpi_type" "KpiMetricType" NOT NULL DEFAULT 'outcome',
  ADD COLUMN IF NOT EXISTS "rag_method" "KpiRagMethod" NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "template_code" TEXT,
  ADD COLUMN IF NOT EXISTS "dimensions" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "kpi_metrics"
  ADD COLUMN IF NOT EXISTS "metric_family" "KpiMetricFamily" NOT NULL DEFAULT 'firm_operations',
  ADD COLUMN IF NOT EXISTS "kpi_type" "KpiMetricType" NOT NULL DEFAULT 'outcome',
  ADD COLUMN IF NOT EXISTS "rag_method" "KpiRagMethod" NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "template_code" TEXT,
  ADD COLUMN IF NOT EXISTS "dimensions" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "kpi_initiatives"
  ADD COLUMN IF NOT EXISTS "metric_family" "KpiMetricFamily" NOT NULL DEFAULT 'firm_operations',
  ADD COLUMN IF NOT EXISTS "kpi_type" "KpiMetricType" NOT NULL DEFAULT 'outcome',
  ADD COLUMN IF NOT EXISTS "rag_method" "KpiRagMethod" NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "template_code" TEXT,
  ADD COLUMN IF NOT EXISTS "dimensions" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "kpi_snapshots"
  ADD COLUMN IF NOT EXISTS "label" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "period_start" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "period_end" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ;

ALTER TABLE "kpi_snapshot_items"
  ADD COLUMN IF NOT EXISTS "metric_family" "KpiMetricFamily",
  ADD COLUMN IF NOT EXISTS "kpi_type" "KpiMetricType",
  ADD COLUMN IF NOT EXISTS "template_code" TEXT,
  ADD COLUMN IF NOT EXISTS "dimensions" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "kpi_goals_metric_family_idx" ON "kpi_goals"("metric_family");
CREATE INDEX IF NOT EXISTS "kpi_goals_kpi_type_idx" ON "kpi_goals"("kpi_type");
CREATE INDEX IF NOT EXISTS "kpi_metrics_metric_family_idx" ON "kpi_metrics"("metric_family");
CREATE INDEX IF NOT EXISTS "kpi_metrics_kpi_type_idx" ON "kpi_metrics"("kpi_type");
CREATE INDEX IF NOT EXISTS "kpi_initiatives_metric_family_idx" ON "kpi_initiatives"("metric_family");
CREATE INDEX IF NOT EXISTS "kpi_initiatives_kpi_type_idx" ON "kpi_initiatives"("kpi_type");

CREATE TABLE IF NOT EXISTS "kpi_coaching_checkins" (
  "id" SERIAL PRIMARY KEY,
  "initiative_id" INTEGER NOT NULL REFERENCES "kpi_initiatives"("id") ON DELETE CASCADE,
  "week_start" TIMESTAMPTZ NOT NULL,
  "week_end" TIMESTAMPTZ NOT NULL,
  "is_blocked" BOOLEAN NOT NULL DEFAULT FALSE,
  "blocker_summary" TEXT,
  "forecast_confidence" "KpiForecastConfidence",
  "employee_comment" TEXT,
  "manager_comment" TEXT,
  "development_note" TEXT,
  "created_by_profile_id" INTEGER REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "kpi_coaching_checkins_initiative_week_idx"
  ON "kpi_coaching_checkins"("initiative_id", "week_start");
