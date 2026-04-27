-- Governed balanced scorecard backbone:
-- cycles, published versions, and optional version links for existing scorecard entities.

CREATE TYPE "BalancedScorecardCadence" AS ENUM ('monthly', 'quarterly', 'annual');
CREATE TYPE "BalancedScorecardCycleStatus" AS ENUM ('draft', 'active', 'closed', 'archived');
CREATE TYPE "BalancedScorecardVersionStatus" AS ENUM ('draft', 'published', 'superseded', 'archived');

CREATE TABLE "balanced_scorecard_cycles" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cadence" "BalancedScorecardCadence" NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "status" "BalancedScorecardCycleStatus" NOT NULL DEFAULT 'draft',
  "active_version_id" INTEGER,
  "created_by_profile_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "balanced_scorecard_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_versions" (
  "id" SERIAL NOT NULL,
  "cycle_id" INTEGER NOT NULL,
  "version_number" INTEGER NOT NULL,
  "label" TEXT,
  "status" "BalancedScorecardVersionStatus" NOT NULL DEFAULT 'draft',
  "published_at" TIMESTAMP(3),
  "created_by_profile_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "balanced_scorecard_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "balanced_scorecard_perspectives" ADD COLUMN "scorecard_version_id" INTEGER;
ALTER TABLE "balanced_scorecard_goals" ADD COLUMN "scorecard_version_id" INTEGER;
ALTER TABLE "balanced_scorecard_kpis" ADD COLUMN "scorecard_version_id" INTEGER;
ALTER TABLE "balanced_scorecard_initiatives" ADD COLUMN "scorecard_version_id" INTEGER;

CREATE UNIQUE INDEX "balanced_scorecard_cycles_key_key" ON "balanced_scorecard_cycles"("key");
CREATE UNIQUE INDEX "balanced_scorecard_cycles_active_version_id_key" ON "balanced_scorecard_cycles"("active_version_id");
CREATE INDEX "balanced_scorecard_cycles_status_idx" ON "balanced_scorecard_cycles"("status");
CREATE INDEX "balanced_scorecard_cycles_start_date_end_date_idx" ON "balanced_scorecard_cycles"("start_date", "end_date");

CREATE UNIQUE INDEX "balanced_scorecard_versions_cycle_id_version_number_key" ON "balanced_scorecard_versions"("cycle_id", "version_number");
CREATE INDEX "balanced_scorecard_versions_cycle_id_status_idx" ON "balanced_scorecard_versions"("cycle_id", "status");

CREATE INDEX "balanced_scorecard_perspectives_scorecard_version_id_sort_order_idx"
  ON "balanced_scorecard_perspectives"("scorecard_version_id", "sort_order");
CREATE INDEX "balanced_scorecard_goals_scorecard_version_id_sort_order_idx"
  ON "balanced_scorecard_goals"("scorecard_version_id", "sort_order");
CREATE INDEX "balanced_scorecard_kpis_scorecard_version_id_sort_order_idx"
  ON "balanced_scorecard_kpis"("scorecard_version_id", "sort_order");
CREATE INDEX "balanced_scorecard_initiatives_scorecard_version_id_sort_order_idx"
  ON "balanced_scorecard_initiatives"("scorecard_version_id", "sort_order");

ALTER TABLE "balanced_scorecard_versions"
  ADD CONSTRAINT "balanced_scorecard_versions_cycle_id_fkey"
  FOREIGN KEY ("cycle_id") REFERENCES "balanced_scorecard_cycles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_cycles"
  ADD CONSTRAINT "balanced_scorecard_cycles_active_version_id_fkey"
  FOREIGN KEY ("active_version_id") REFERENCES "balanced_scorecard_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_perspectives"
  ADD CONSTRAINT "balanced_scorecard_perspectives_scorecard_version_id_fkey"
  FOREIGN KEY ("scorecard_version_id") REFERENCES "balanced_scorecard_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_goals"
  ADD CONSTRAINT "balanced_scorecard_goals_scorecard_version_id_fkey"
  FOREIGN KEY ("scorecard_version_id") REFERENCES "balanced_scorecard_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpis"
  ADD CONSTRAINT "balanced_scorecard_kpis_scorecard_version_id_fkey"
  FOREIGN KEY ("scorecard_version_id") REFERENCES "balanced_scorecard_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_initiatives"
  ADD CONSTRAINT "balanced_scorecard_initiatives_scorecard_version_id_fkey"
  FOREIGN KEY ("scorecard_version_id") REFERENCES "balanced_scorecard_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
