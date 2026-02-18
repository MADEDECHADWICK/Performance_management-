-- CreateEnum
CREATE TYPE "ReceivableFollowUpActionType" AS ENUM ('call', 'email', 'meeting', 'reminder', 'escalation', 'promise_to_pay', 'dispute', 'note');

-- AlterTable
ALTER TABLE "evaluation_definitions" ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoring_config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "evaluation_templates" ALTER COLUMN "competencies" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "receivable_owner_assigned_at" TIMESTAMP(3),
ADD COLUMN     "receivable_owner_profile_id" INTEGER;

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

-- CreateTable
CREATE TABLE "receivable_follow_up_actions" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "client_id" INTEGER,
    "owner_profile_id" INTEGER,
    "action_by_profile_id" INTEGER NOT NULL,
    "action_type" "ReceivableFollowUpActionType" NOT NULL DEFAULT 'note',
    "action_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL,
    "next_follow_up_date" TIMESTAMP(3),
    "promised_payment_date" TIMESTAMP(3),
    "promised_payment_amount" DECIMAL(14,2),
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivable_follow_up_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receivable_follow_up_actions_job_id_idx" ON "receivable_follow_up_actions"("job_id");

-- CreateIndex
CREATE INDEX "receivable_follow_up_actions_client_id_idx" ON "receivable_follow_up_actions"("client_id");

-- CreateIndex
CREATE INDEX "receivable_follow_up_actions_owner_profile_id_idx" ON "receivable_follow_up_actions"("owner_profile_id");

-- CreateIndex
CREATE INDEX "receivable_follow_up_actions_action_by_profile_id_idx" ON "receivable_follow_up_actions"("action_by_profile_id");

-- CreateIndex
CREATE INDEX "receivable_follow_up_actions_action_date_idx" ON "receivable_follow_up_actions"("action_date");

-- CreateIndex
CREATE INDEX "receivable_follow_up_actions_next_follow_up_date_idx" ON "receivable_follow_up_actions"("next_follow_up_date");

-- CreateIndex
CREATE INDEX "jobs_receivable_owner_profile_id_idx" ON "jobs"("receivable_owner_profile_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_receivable_owner_profile_id_fkey" FOREIGN KEY ("receivable_owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_follow_up_actions" ADD CONSTRAINT "receivable_follow_up_actions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_follow_up_actions" ADD CONSTRAINT "receivable_follow_up_actions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_follow_up_actions" ADD CONSTRAINT "receivable_follow_up_actions_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_follow_up_actions" ADD CONSTRAINT "receivable_follow_up_actions_action_by_profile_id_fkey" FOREIGN KEY ("action_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
