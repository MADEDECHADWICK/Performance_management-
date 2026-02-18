-- AlterTable
ALTER TABLE "evaluation_definitions" ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoring_config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "evaluation_templates" ALTER COLUMN "competencies" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "kpis" ADD COLUMN     "amber_threshold" DECIMAL(14,2),
ADD COLUMN     "approval_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "baseline_text" TEXT,
ADD COLUMN     "commentary_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "critical_success_factor" TEXT,
ADD COLUMN     "data_source_type" TEXT,
ADD COLUMN     "ethics_risk_flag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "evidence_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "formula_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "green_threshold" DECIMAL(14,2),
ADD COLUMN     "indicator_type" TEXT,
ADD COLUMN     "inherit_weight" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "kpi_category" TEXT,
ADD COLUMN     "parent_kpi_id" INTEGER,
ADD COLUMN     "quality_floor_note" TEXT,
ADD COLUMN     "quality_floor_threshold" DECIMAL(14,2),
ADD COLUMN     "red_threshold" DECIMAL(14,2),
ADD COLUMN     "review_frequency" TEXT,
ADD COLUMN     "review_owner_profile_id" INTEGER,
ADD COLUMN     "rollup_method" TEXT,
ADD COLUMN     "source_reference" TEXT,
ADD COLUMN     "strategic_objective" TEXT,
ADD COLUMN     "strategic_theme" TEXT,
ADD COLUMN     "stretch_threshold" DECIMAL(14,2),
ADD COLUMN     "target_text" TEXT,
ADD COLUMN     "target_type" TEXT;

-- AlterTable
ALTER TABLE "performance_scores" ALTER COLUMN "score_breakdown" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "position_roles" ALTER COLUMN "default_access" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "project_evaluations" ALTER COLUMN "scores" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "workflow_assignments" ALTER COLUMN "completed_steps" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "workflow_definitions" ALTER COLUMN "conditions" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "actions" SET DEFAULT '[]'::jsonb;

-- CreateIndex
CREATE INDEX "kpis_kpi_category_idx" ON "kpis"("kpi_category");

-- CreateIndex
CREATE INDEX "kpis_indicator_type_idx" ON "kpis"("indicator_type");

-- CreateIndex
CREATE INDEX "kpis_parent_kpi_id_idx" ON "kpis"("parent_kpi_id");

-- CreateIndex
CREATE INDEX "kpis_review_owner_profile_id_idx" ON "kpis"("review_owner_profile_id");

-- AddForeignKey
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_parent_kpi_id_fkey" FOREIGN KEY ("parent_kpi_id") REFERENCES "kpis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_review_owner_profile_id_fkey" FOREIGN KEY ("review_owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
