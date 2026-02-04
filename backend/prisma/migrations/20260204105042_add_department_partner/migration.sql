-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "partner_profile_id" INTEGER;

-- AlterTable
ALTER TABLE "evaluation_definitions" ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoring_config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "evaluation_templates" ALTER COLUMN "competencies" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb;

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
CREATE INDEX "departments_partner_profile_id_idx" ON "departments"("partner_profile_id");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_partner_profile_id_fkey" FOREIGN KEY ("partner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
