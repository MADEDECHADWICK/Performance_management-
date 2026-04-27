-- CreateEnum
CREATE TYPE "BalancedScorecardMeasurementPeriodStatus" AS ENUM (
  'draft',
  'generated',
  'submitted',
  'in_review',
  'approved',
  'closed'
);

-- CreateEnum
CREATE TYPE "BalancedScorecardSnapshotStatus" AS ENUM (
  'generated',
  'frozen',
  'stale'
);

-- CreateEnum
CREATE TYPE "BalancedScorecardDataQualityStatus" AS ENUM (
  'healthy',
  'warning',
  'missing_data',
  'stale_data',
  'manual_override'
);

-- CreateEnum
CREATE TYPE "BalancedScorecardReviewAction" AS ENUM (
  'generated',
  'submitted',
  'review_started',
  'changes_requested',
  'approved',
  'closed',
  'reopened'
);

-- CreateEnum
CREATE TYPE "BalancedScorecardTraceSourceType" AS ENUM (
  'metric_catalog',
  'manual_actual',
  'initiative_rollup',
  'operational_signal'
);

-- CreateTable
CREATE TABLE "balanced_scorecard_measurement_periods" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "scorecard_version_id" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "cadence" "BalancedScorecardCadence" NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" "BalancedScorecardMeasurementPeriodStatus" NOT NULL DEFAULT 'draft',
  "generated_at" TIMESTAMP(3),
  "generated_by_profile_id" INTEGER,
  "submitted_at" TIMESTAMP(3),
  "submitted_by_profile_id" INTEGER,
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_profile_id" INTEGER,
  "approved_at" TIMESTAMP(3),
  "approved_by_profile_id" INTEGER,
  "closed_at" TIMESTAMP(3),
  "closed_by_profile_id" INTEGER,
  "latest_comment" TEXT,
  "created_by_profile_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "balanced_scorecard_measurement_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balanced_scorecard_kpi_snapshots" (
  "id" SERIAL NOT NULL,
  "measurement_period_id" INTEGER NOT NULL,
  "kpi_id" INTEGER NOT NULL,
  "metric_key" TEXT NOT NULL,
  "kpi_key" TEXT NOT NULL,
  "kpi_name" TEXT NOT NULL,
  "goal_key" TEXT NOT NULL,
  "goal_title" TEXT NOT NULL,
  "perspective_key" TEXT NOT NULL,
  "perspective_name" TEXT NOT NULL,
  "tracking_mode" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "weight" INTEGER NOT NULL,
  "firm_target" TEXT NOT NULL,
  "target_value" DECIMAL(14,2),
  "target_label" TEXT,
  "actual_value" DECIMAL(14,2),
  "actual_label" TEXT NOT NULL,
  "weighted_score" INTEGER NOT NULL,
  "status" "DashboardStatus" NOT NULL DEFAULT 'at_risk',
  "status_logic" TEXT,
  "update_frequency" TEXT,
  "initiative_progress" INTEGER NOT NULL DEFAULT 0,
  "trend" JSONB NOT NULL DEFAULT '[]',
  "owner_name" TEXT,
  "owner_update" TEXT,
  "snapshot_status" "BalancedScorecardSnapshotStatus" NOT NULL DEFAULT 'generated',
  "data_quality_status" "BalancedScorecardDataQualityStatus" NOT NULL DEFAULT 'healthy',
  "data_quality_note" TEXT,
  "actual_as_of" TIMESTAMP(3),
  "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "measurement_context" JSONB,
  CONSTRAINT "balanced_scorecard_kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balanced_scorecard_kpi_snapshot_traces" (
  "id" SERIAL NOT NULL,
  "snapshot_id" INTEGER NOT NULL,
  "source_type" "BalancedScorecardTraceSourceType" NOT NULL,
  "source_key" TEXT NOT NULL,
  "source_label" TEXT NOT NULL,
  "data_quality_status" "BalancedScorecardDataQualityStatus" NOT NULL DEFAULT 'healthy',
  "record_count" INTEGER,
  "raw_value" DECIMAL(14,2),
  "normalized_value" DECIMAL(14,2),
  "note" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "balanced_scorecard_kpi_snapshot_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balanced_scorecard_measurement_reviews" (
  "id" SERIAL NOT NULL,
  "measurement_period_id" INTEGER NOT NULL,
  "action" "BalancedScorecardReviewAction" NOT NULL,
  "from_status" "BalancedScorecardMeasurementPeriodStatus",
  "to_status" "BalancedScorecardMeasurementPeriodStatus" NOT NULL,
  "comment" TEXT,
  "acted_by_profile_id" INTEGER,
  "acted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "balanced_scorecard_measurement_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "balanced_scorecard_measurement_periods_key_key"
ON "balanced_scorecard_measurement_periods"("key");

-- CreateIndex
CREATE UNIQUE INDEX "balanced_scorecard_measurement_periods_scorecard_version_id_period_start_period_end_key"
ON "balanced_scorecard_measurement_periods"("scorecard_version_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "balanced_scorecard_measurement_periods_scorecard_version_id_status_idx"
ON "balanced_scorecard_measurement_periods"("scorecard_version_id", "status");

-- CreateIndex
CREATE INDEX "balanced_scorecard_measurement_periods_period_start_period_end_idx"
ON "balanced_scorecard_measurement_periods"("period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "balanced_scorecard_kpi_snapshots_measurement_period_id_kpi_id_key"
ON "balanced_scorecard_kpi_snapshots"("measurement_period_id", "kpi_id");

-- CreateIndex
CREATE INDEX "balanced_scorecard_kpi_snapshots_measurement_period_id_status_idx"
ON "balanced_scorecard_kpi_snapshots"("measurement_period_id", "status");

-- CreateIndex
CREATE INDEX "balanced_scorecard_kpi_snapshots_kpi_id_idx"
ON "balanced_scorecard_kpi_snapshots"("kpi_id");

-- CreateIndex
CREATE INDEX "balanced_scorecard_kpi_snapshots_data_quality_status_idx"
ON "balanced_scorecard_kpi_snapshots"("data_quality_status");

-- CreateIndex
CREATE INDEX "balanced_scorecard_kpi_snapshot_traces_snapshot_id_idx"
ON "balanced_scorecard_kpi_snapshot_traces"("snapshot_id");

-- CreateIndex
CREATE INDEX "balanced_scorecard_kpi_snapshot_traces_source_type_idx"
ON "balanced_scorecard_kpi_snapshot_traces"("source_type");

-- CreateIndex
CREATE INDEX "balanced_scorecard_measurement_reviews_measurement_period_id_acted_at_idx"
ON "balanced_scorecard_measurement_reviews"("measurement_period_id", "acted_at");

-- AddForeignKey
ALTER TABLE "balanced_scorecard_measurement_periods"
ADD CONSTRAINT "balanced_scorecard_measurement_periods_scorecard_version_id_fkey"
FOREIGN KEY ("scorecard_version_id")
REFERENCES "balanced_scorecard_versions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balanced_scorecard_kpi_snapshots"
ADD CONSTRAINT "balanced_scorecard_kpi_snapshots_measurement_period_id_fkey"
FOREIGN KEY ("measurement_period_id")
REFERENCES "balanced_scorecard_measurement_periods"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balanced_scorecard_kpi_snapshots"
ADD CONSTRAINT "balanced_scorecard_kpi_snapshots_kpi_id_fkey"
FOREIGN KEY ("kpi_id")
REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balanced_scorecard_kpi_snapshot_traces"
ADD CONSTRAINT "balanced_scorecard_kpi_snapshot_traces_snapshot_id_fkey"
FOREIGN KEY ("snapshot_id")
REFERENCES "balanced_scorecard_kpi_snapshots"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balanced_scorecard_measurement_reviews"
ADD CONSTRAINT "balanced_scorecard_measurement_reviews_measurement_period_id_fkey"
FOREIGN KEY ("measurement_period_id")
REFERENCES "balanced_scorecard_measurement_periods"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
