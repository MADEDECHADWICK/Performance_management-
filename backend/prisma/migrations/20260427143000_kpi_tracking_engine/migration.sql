CREATE TABLE "balanced_scorecard_kpi_formulas" (
  "id" SERIAL NOT NULL,
  "kpi_id" INTEGER NOT NULL,
  "formula_type" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "balanced_scorecard_kpi_formulas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_kpi_scoring_rules" (
  "id" SERIAL NOT NULL,
  "kpi_id" INTEGER NOT NULL,
  "scoring_type" TEXT NOT NULL,
  "target_value" DECIMAL(14,2),
  "green_threshold" DECIMAL(14,2),
  "amber_threshold" DECIMAL(14,2),
  "red_threshold" DECIMAL(14,2),
  "min_value" DECIMAL(14,2),
  "max_value" DECIMAL(14,2),
  "cap_score" INTEGER NOT NULL DEFAULT 100,
  "config" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "balanced_scorecard_kpi_scoring_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_kpi_tracking_plans" (
  "id" SERIAL NOT NULL,
  "kpi_id" INTEGER NOT NULL,
  "tracking_type" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "update_owner_profile_id" INTEGER,
  "due_day" INTEGER,
  "grace_days" INTEGER NOT NULL DEFAULT 0,
  "requires_evidence" BOOLEAN NOT NULL DEFAULT false,
  "data_quality_rule" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "balanced_scorecard_kpi_tracking_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_kpi_tracking_inputs" (
  "id" SERIAL NOT NULL,
  "tracking_plan_id" INTEGER NOT NULL,
  "input_key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "input_type" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_config" JSONB NOT NULL DEFAULT '{}',
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "balanced_scorecard_kpi_tracking_inputs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_kpi_data_points" (
  "id" SERIAL NOT NULL,
  "kpi_id" INTEGER NOT NULL,
  "measurement_period_id" INTEGER NOT NULL,
  "input_key" TEXT NOT NULL,
  "raw_value" TEXT NOT NULL,
  "normalized_value" DECIMAL(14,2),
  "evidence_url" TEXT,
  "note" TEXT,
  "source_type" TEXT NOT NULL,
  "submitted_by_profile_id" INTEGER,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "data_quality_status" "BalancedScorecardDataQualityStatus" NOT NULL DEFAULT 'healthy',
  CONSTRAINT "balanced_scorecard_kpi_data_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_kpi_results" (
  "id" SERIAL NOT NULL,
  "kpi_id" INTEGER NOT NULL,
  "measurement_period_id" INTEGER NOT NULL,
  "actual_value" DECIMAL(14,2),
  "score" INTEGER NOT NULL,
  "status" "DashboardStatus" NOT NULL,
  "trend" JSONB NOT NULL DEFAULT '[]',
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  CONSTRAINT "balanced_scorecard_kpi_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_kpi_actions" (
  "id" SERIAL NOT NULL,
  "kpi_id" INTEGER NOT NULL,
  "result_id" INTEGER,
  "title" TEXT NOT NULL,
  "owner_profile_id" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'open',
  "due_date" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "balanced_scorecard_kpi_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "balanced_scorecard_kpi_formulas_kpi_id_key"
ON "balanced_scorecard_kpi_formulas"("kpi_id");
CREATE INDEX "balanced_scorecard_kpi_formulas_formula_type_idx"
ON "balanced_scorecard_kpi_formulas"("formula_type");

CREATE UNIQUE INDEX "balanced_scorecard_kpi_scoring_rules_kpi_id_key"
ON "balanced_scorecard_kpi_scoring_rules"("kpi_id");
CREATE INDEX "balanced_scorecard_kpi_scoring_rules_scoring_type_idx"
ON "balanced_scorecard_kpi_scoring_rules"("scoring_type");

CREATE UNIQUE INDEX "balanced_scorecard_kpi_tracking_plans_kpi_id_key"
ON "balanced_scorecard_kpi_tracking_plans"("kpi_id");
CREATE INDEX "balanced_scorecard_kpi_tracking_plans_tracking_type_idx"
ON "balanced_scorecard_kpi_tracking_plans"("tracking_type");
CREATE INDEX "balanced_scorecard_kpi_tracking_plans_update_owner_profile_id_idx"
ON "balanced_scorecard_kpi_tracking_plans"("update_owner_profile_id");

CREATE UNIQUE INDEX "balanced_scorecard_kpi_tracking_inputs_tracking_plan_id_input_key_key"
ON "balanced_scorecard_kpi_tracking_inputs"("tracking_plan_id", "input_key");
CREATE INDEX "balanced_scorecard_kpi_tracking_inputs_source_type_idx"
ON "balanced_scorecard_kpi_tracking_inputs"("source_type");

CREATE UNIQUE INDEX "balanced_scorecard_kpi_data_points_measurement_period_id_kpi_id_input_key_key"
ON "balanced_scorecard_kpi_data_points"("measurement_period_id", "kpi_id", "input_key");
CREATE INDEX "balanced_scorecard_kpi_data_points_kpi_id_submitted_at_idx"
ON "balanced_scorecard_kpi_data_points"("kpi_id", "submitted_at");
CREATE INDEX "balanced_scorecard_kpi_data_points_measurement_period_id_idx"
ON "balanced_scorecard_kpi_data_points"("measurement_period_id");
CREATE INDEX "balanced_scorecard_kpi_data_points_source_type_idx"
ON "balanced_scorecard_kpi_data_points"("source_type");
CREATE INDEX "balanced_scorecard_kpi_data_points_data_quality_status_idx"
ON "balanced_scorecard_kpi_data_points"("data_quality_status");

CREATE UNIQUE INDEX "balanced_scorecard_kpi_results_measurement_period_id_kpi_id_key"
ON "balanced_scorecard_kpi_results"("measurement_period_id", "kpi_id");
CREATE INDEX "balanced_scorecard_kpi_results_kpi_id_calculated_at_idx"
ON "balanced_scorecard_kpi_results"("kpi_id", "calculated_at");
CREATE INDEX "balanced_scorecard_kpi_results_measurement_period_id_status_idx"
ON "balanced_scorecard_kpi_results"("measurement_period_id", "status");

CREATE INDEX "balanced_scorecard_kpi_actions_kpi_id_status_idx"
ON "balanced_scorecard_kpi_actions"("kpi_id", "status");
CREATE INDEX "balanced_scorecard_kpi_actions_result_id_idx"
ON "balanced_scorecard_kpi_actions"("result_id");
CREATE INDEX "balanced_scorecard_kpi_actions_owner_profile_id_idx"
ON "balanced_scorecard_kpi_actions"("owner_profile_id");

ALTER TABLE "balanced_scorecard_kpi_formulas"
ADD CONSTRAINT "balanced_scorecard_kpi_formulas_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_scoring_rules"
ADD CONSTRAINT "balanced_scorecard_kpi_scoring_rules_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_tracking_plans"
ADD CONSTRAINT "balanced_scorecard_kpi_tracking_plans_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_tracking_plans"
ADD CONSTRAINT "balanced_scorecard_kpi_tracking_plans_update_owner_profile_id_fkey"
FOREIGN KEY ("update_owner_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_tracking_inputs"
ADD CONSTRAINT "balanced_scorecard_kpi_tracking_inputs_tracking_plan_id_fkey"
FOREIGN KEY ("tracking_plan_id") REFERENCES "balanced_scorecard_kpi_tracking_plans"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_data_points"
ADD CONSTRAINT "balanced_scorecard_kpi_data_points_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_data_points"
ADD CONSTRAINT "balanced_scorecard_kpi_data_points_measurement_period_id_fkey"
FOREIGN KEY ("measurement_period_id") REFERENCES "balanced_scorecard_measurement_periods"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_data_points"
ADD CONSTRAINT "balanced_scorecard_kpi_data_points_submitted_by_profile_id_fkey"
FOREIGN KEY ("submitted_by_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_results"
ADD CONSTRAINT "balanced_scorecard_kpi_results_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_results"
ADD CONSTRAINT "balanced_scorecard_kpi_results_measurement_period_id_fkey"
FOREIGN KEY ("measurement_period_id") REFERENCES "balanced_scorecard_measurement_periods"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_actions"
ADD CONSTRAINT "balanced_scorecard_kpi_actions_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_actions"
ADD CONSTRAINT "balanced_scorecard_kpi_actions_result_id_fkey"
FOREIGN KEY ("result_id") REFERENCES "balanced_scorecard_kpi_results"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_actions"
ADD CONSTRAINT "balanced_scorecard_kpi_actions_owner_profile_id_fkey"
FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
