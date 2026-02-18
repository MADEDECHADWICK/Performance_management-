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

-- CreateTable
CREATE TABLE "employee_onboarding_stages" (
    "id" SERIAL NOT NULL,
    "onboarding_case_id" INTEGER NOT NULL,
    "stage_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'pending',
    "owner_profile_id" INTEGER,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "employee_onboarding_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_onboarding_stages_onboarding_case_id_idx" ON "employee_onboarding_stages"("onboarding_case_id");

-- CreateIndex
CREATE INDEX "employee_onboarding_stages_owner_profile_id_idx" ON "employee_onboarding_stages"("owner_profile_id");

-- AddForeignKey
ALTER TABLE "employee_onboarding_stages" ADD CONSTRAINT "employee_onboarding_stages_onboarding_case_id_fkey" FOREIGN KEY ("onboarding_case_id") REFERENCES "employee_onboarding_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboarding_stages" ADD CONSTRAINT "employee_onboarding_stages_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
