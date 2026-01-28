-- CreateEnum
CREATE TYPE "ProjectEvaluationStatus" AS ENUM ('draft', 'submitted');

-- CreateEnum
CREATE TYPE "OkrStatus" AS ENUM ('draft', 'active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "OkrApprovalStatus" AS ENUM ('draft', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "OkrChangeType" AS ENUM ('progress_update', 'status_update', 'approval_update');

-- AlterTable
ALTER TABLE "evaluation_definitions" ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoring_config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "performance_scores" ADD COLUMN     "calibrated_at" TIMESTAMP(3),
ADD COLUMN     "calibrated_by_profile_id" INTEGER,
ADD COLUMN     "calibrated_score" DECIMAL(7,2),
ADD COLUMN     "calibration_note" TEXT,
ALTER COLUMN "score_breakdown" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "position_roles" ALTER COLUMN "default_access" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "workflow_assignments" ALTER COLUMN "completed_steps" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "workflow_definitions" ALTER COLUMN "conditions" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "actions" SET DEFAULT '[]'::jsonb;

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "giver_profile_id" INTEGER NOT NULL,
    "recipient_profile_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_evaluations" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "evaluatee_profile_id" INTEGER NOT NULL,
    "evaluator_profile_id" INTEGER NOT NULL,
    "evaluator_type" "EvaluatorType" NOT NULL DEFAULT 'manager',
    "status" "ProjectEvaluationStatus" NOT NULL DEFAULT 'draft',
    "scores" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "overall_score" DECIMAL(7,2),
    "comments" TEXT,
    "submitted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "okr_objectives" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "OkrStatus" NOT NULL DEFAULT 'active',
    "approval_status" "OkrApprovalStatus" NOT NULL DEFAULT 'pending',
    "owner_profile_id" INTEGER NOT NULL,
    "department_id" INTEGER,
    "cycle_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_profile_id" INTEGER,
    "approval_notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "okr_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "okr_key_results" (
    "id" SERIAL NOT NULL,
    "objective_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "unit" TEXT,
    "target_value" DECIMAL(12,2) NOT NULL,
    "current_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(5,2),
    "status" "OkrStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "okr_key_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "okr_progress_history" (
    "id" SERIAL NOT NULL,
    "objective_id" INTEGER NOT NULL,
    "key_result_id" INTEGER,
    "change_type" "OkrChangeType" NOT NULL,
    "field" TEXT NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "note" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_profile_id" INTEGER,

    CONSTRAINT "okr_progress_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template_type" TEXT NOT NULL,
    "bsc_category" TEXT,
    "competencies" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "questions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_giver_profile_id_idx" ON "feedback"("giver_profile_id");

-- CreateIndex
CREATE INDEX "feedback_recipient_profile_id_idx" ON "feedback"("recipient_profile_id");

-- CreateIndex
CREATE INDEX "project_evaluations_job_id_idx" ON "project_evaluations"("job_id");

-- CreateIndex
CREATE INDEX "project_evaluations_evaluatee_profile_id_idx" ON "project_evaluations"("evaluatee_profile_id");

-- CreateIndex
CREATE INDEX "project_evaluations_evaluator_profile_id_idx" ON "project_evaluations"("evaluator_profile_id");

-- CreateIndex
CREATE INDEX "project_evaluations_status_idx" ON "project_evaluations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_evaluations_job_id_evaluatee_profile_id_evaluator_p_key" ON "project_evaluations"("job_id", "evaluatee_profile_id", "evaluator_profile_id", "evaluator_type");

-- CreateIndex
CREATE INDEX "okr_objectives_owner_profile_id_idx" ON "okr_objectives"("owner_profile_id");

-- CreateIndex
CREATE INDEX "okr_objectives_department_id_idx" ON "okr_objectives"("department_id");

-- CreateIndex
CREATE INDEX "okr_key_results_objective_id_idx" ON "okr_key_results"("objective_id");

-- CreateIndex
CREATE INDEX "okr_progress_history_objective_id_idx" ON "okr_progress_history"("objective_id");

-- CreateIndex
CREATE INDEX "okr_progress_history_key_result_id_idx" ON "okr_progress_history"("key_result_id");

-- CreateIndex
CREATE INDEX "evaluation_templates_template_type_idx" ON "evaluation_templates"("template_type");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_giver_profile_id_fkey" FOREIGN KEY ("giver_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_recipient_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_evaluations" ADD CONSTRAINT "project_evaluations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_evaluations" ADD CONSTRAINT "project_evaluations_evaluatee_profile_id_fkey" FOREIGN KEY ("evaluatee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_evaluations" ADD CONSTRAINT "project_evaluations_evaluator_profile_id_fkey" FOREIGN KEY ("evaluator_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "okr_objectives" ADD CONSTRAINT "okr_objectives_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "okr_objectives" ADD CONSTRAINT "okr_objectives_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "okr_objectives" ADD CONSTRAINT "okr_objectives_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "okr_objectives" ADD CONSTRAINT "okr_objectives_approved_by_profile_id_fkey" FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "okr_key_results" ADD CONSTRAINT "okr_key_results_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "okr_objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "okr_progress_history" ADD CONSTRAINT "okr_progress_history_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "okr_objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "okr_progress_history" ADD CONSTRAINT "okr_progress_history_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "okr_key_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "okr_progress_history" ADD CONSTRAINT "okr_progress_history_changed_by_profile_id_fkey" FOREIGN KEY ("changed_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_calibrated_by_profile_id_fkey" FOREIGN KEY ("calibrated_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
