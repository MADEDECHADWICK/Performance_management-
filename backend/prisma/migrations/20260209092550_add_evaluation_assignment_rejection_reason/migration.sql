-- CreateEnum
CREATE TYPE "JobCollectionStage" AS ENUM ('not_ready', 'ready_for_collection', 'partial_collection', 'fully_collected', 'overdue');

-- AlterTable
ALTER TABLE "evaluation_assignments" ADD COLUMN     "rejection_reason" TEXT;

-- AlterTable
ALTER TABLE "evaluation_definitions" ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoring_config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "evaluation_templates" ALTER COLUMN "competencies" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "collection_stage" "JobCollectionStage" NOT NULL DEFAULT 'not_ready',
ADD COLUMN     "ready_for_collection_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "performance_scores" ADD COLUMN     "bd_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
ADD COLUMN     "efficiency_weighted" DECIMAL(7,2) NOT NULL DEFAULT 0,
ADD COLUMN     "job_completion_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
ADD COLUMN     "time_to_delivery_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
ALTER COLUMN "score_breakdown" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "position_roles" ALTER COLUMN "default_access" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "project_evaluations" ALTER COLUMN "scores" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "workflow_assignments" ALTER COLUMN "completed_steps" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "workflow_definitions" ALTER COLUMN "conditions" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "actions" SET DEFAULT '[]'::jsonb;
