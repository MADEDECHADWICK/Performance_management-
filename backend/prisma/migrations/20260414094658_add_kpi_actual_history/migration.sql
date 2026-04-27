-- DropForeignKey
ALTER TABLE "knowledge_hub_resources" DROP CONSTRAINT "knowledge_hub_resources_created_by_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_hub_resources" DROP CONSTRAINT "knowledge_hub_resources_updated_by_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_device_tokens" DROP CONSTRAINT "notification_device_tokens_profile_id_fkey";

-- DropIndex
DROP INDEX "knowledge_hub_resources_submodules_gin_idx";

-- DropIndex
DROP INDEX "knowledge_hub_resources_tags_gin_idx";

-- DropIndex
DROP INDEX "knowledge_hub_resources_updated_at_idx";

-- AlterTable
ALTER TABLE "certificate_templates" ALTER COLUMN "template_definition" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "check_ins" ALTER COLUMN "action_items" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "client_onboarding_checklist_items" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "client_onboarding_checklists" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "evaluation_definitions" ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoring_config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "evaluation_templates" ALTER COLUMN "competencies" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "global_certificate_templates" ALTER COLUMN "template_definition" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "job_invoice_templates" ALTER COLUMN "template_definition" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "knowledge_hub_resources" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_approval_steps" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_balances" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_delegations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_policies" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_policy_assignments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_types" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_device_tokens" ALTER COLUMN "last_seen_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "onboarding_policies" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "performance_scores" ALTER COLUMN "score_breakdown" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "position_roles" ALTER COLUMN "default_access" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "project_evaluations" ALTER COLUMN "scores" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "public_holidays" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "requisition_approval_steps" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "requisition_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "requisition_types" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "skill_assessments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "training_records" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workflow_assignments" ALTER COLUMN "completed_steps" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "workflow_definitions" ALTER COLUMN "conditions" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "actions" SET DEFAULT '[]'::jsonb;

-- CreateTable
CREATE TABLE "balanced_scorecard_kpi_actual_history" (
    "id" SERIAL NOT NULL,
    "kpi_id" INTEGER NOT NULL,
    "actual_value" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_profile_id" INTEGER,

    CONSTRAINT "balanced_scorecard_kpi_actual_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balanced_scorecard_kpi_actual_history_kpi_id_recorded_at_idx" ON "balanced_scorecard_kpi_actual_history"("kpi_id", "recorded_at");

-- CreateIndex
CREATE INDEX "notification_device_tokens_profile_id_active_idx" ON "notification_device_tokens"("profile_id", "active");

-- RenameForeignKey
ALTER TABLE "requisition_requests" RENAME CONSTRAINT "requisition_requests_accountability_submitted_by_profile_id_fke" TO "requisition_requests_accountability_submitted_by_profile_i_fkey";

-- AddForeignKey
ALTER TABLE "balanced_scorecard_kpi_actual_history" ADD CONSTRAINT "balanced_scorecard_kpi_actual_history_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "job_invoice_payment_applications_job_invoice_id_client_payment_" RENAME TO "job_invoice_payment_applications_job_invoice_id_client_paym_key";

-- RenameIndex
ALTER INDEX "leave_ledger_entries_employee_profile_id_leave_type_id_leave_ye" RENAME TO "leave_ledger_entries_employee_profile_id_leave_type_id_leav_idx";

-- RenameIndex
ALTER INDEX "notification_device_tokens_dedupe_key" RENAME TO "notification_device_tokens_profile_id_platform_token_key";

-- RenameIndex
ALTER INDEX "requisition_approval_steps_requisition_request_id_step_number_k" RENAME TO "requisition_approval_steps_requisition_request_id_step_numb_key";

-- RenameIndex
ALTER INDEX "requisition_requests_accountability_status_accountability_due_a" RENAME TO "requisition_requests_accountability_status_accountability_d_idx";
