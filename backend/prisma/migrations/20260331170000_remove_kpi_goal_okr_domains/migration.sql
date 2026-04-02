ALTER TABLE "performance_scores"
  DROP COLUMN IF EXISTS "kpi_score";

ALTER TABLE "development_goals"
  DROP COLUMN IF EXISTS "linked_kpi_id";

DROP TABLE IF EXISTS "kpi_coaching_checkins";
DROP TABLE IF EXISTS "kpi_snapshot_items";
DROP TABLE IF EXISTS "kpi_snapshots";
DROP TABLE IF EXISTS "kpi_reassignments";
DROP TABLE IF EXISTS "kpi_approval_history";
DROP TABLE IF EXISTS "kpi_progress_updates";
DROP TABLE IF EXISTS "kpi_initiatives";
DROP TABLE IF EXISTS "kpi_metrics";
DROP TABLE IF EXISTS "kpi_goals";
DROP TABLE IF EXISTS "kpi_cycle_versions";
DROP TABLE IF EXISTS "kpi_cycles";
DROP TABLE IF EXISTS "kpi_legacy_map";
DROP TABLE IF EXISTS "employee_kpi_scores";
DROP TABLE IF EXISTS "employee_kpi_assignments";

DROP TABLE IF EXISTS "okr_progress_history";
DROP TABLE IF EXISTS "okr_key_results";
DROP TABLE IF EXISTS "okr_objectives";
DROP TABLE IF EXISTS "okrs";
DROP TABLE IF EXISTS "kpis";
DROP TABLE IF EXISTS "development_goals";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'evaluation_questions'
      AND column_name = 'category'
  ) AND EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'EvaluationQuestionCategory'
  ) THEN
    UPDATE "evaluation_questions"
    SET "category" = 'competency'
    WHERE "category"::text = 'goal';

    DROP TYPE IF EXISTS "EvaluationQuestionCategory_new";
    CREATE TYPE "EvaluationQuestionCategory_new" AS ENUM ('competency', 'behavior', 'culture');

    ALTER TABLE "evaluation_questions"
      ALTER COLUMN "category" TYPE "EvaluationQuestionCategory_new"
      USING ("category"::text::"EvaluationQuestionCategory_new");

    DROP TYPE "EvaluationQuestionCategory";
    ALTER TYPE "EvaluationQuestionCategory_new" RENAME TO "EvaluationQuestionCategory";
  END IF;
END $$;

DROP TYPE IF EXISTS "DevelopmentPlanStatus";
DROP TYPE IF EXISTS "DevelopmentGoalStatus";
DROP TYPE IF EXISTS "OkrChangeType";
DROP TYPE IF EXISTS "OkrApprovalStatus";
DROP TYPE IF EXISTS "OkrStatus";

DROP TYPE IF EXISTS "KpiForecastConfidence";
DROP TYPE IF EXISTS "KpiSnapshotType";
DROP TYPE IF EXISTS "KpiProgressSource";
DROP TYPE IF EXISTS "KpiUpdateFrequency";
DROP TYPE IF EXISTS "KpiInitiativeLevel";
DROP TYPE IF EXISTS "KpiRagMethod";
DROP TYPE IF EXISTS "KpiMetricType";
DROP TYPE IF EXISTS "KpiMetricFamily";
DROP TYPE IF EXISTS "KpiRag";
DROP TYPE IF EXISTS "KpiDirection";
DROP TYPE IF EXISTS "KpiBscPerspective";
DROP TYPE IF EXISTS "KpiEntityState";
DROP TYPE IF EXISTS "KpiCycleVersionStatus";
DROP TYPE IF EXISTS "KpiCycleState";
DROP TYPE IF EXISTS "KpiCadence";
DROP TYPE IF EXISTS "EmployeeKpiAssignmentStatus";
DROP TYPE IF EXISTS "KpiTrackingStatus";
