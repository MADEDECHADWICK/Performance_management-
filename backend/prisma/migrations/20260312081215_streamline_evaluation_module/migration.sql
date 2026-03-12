-- Streamlined evaluation module: evaluation cycles, responses, KPI tracking, feedback, and check-ins.

CREATE TYPE "EvaluationCycleType" AS ENUM ('annual', 'mid_year', 'quarterly', 'probation');
CREATE TYPE "EvaluationRelationship" AS ENUM ('self', 'peer', 'manager', 'subordinate');
CREATE TYPE "EvaluationQuestionCategory" AS ENUM ('competency', 'behavior', 'goal', 'culture');
CREATE TYPE "DevelopmentPlanStatus" AS ENUM ('not_started', 'in_progress', 'completed', 'deferred');
CREATE TYPE "KpiTrackingStatus" AS ENUM ('on_track', 'at_risk', 'achieved', 'missed');
CREATE TYPE "ContinuousFeedbackType" AS ENUM ('praise', 'coaching', 'concern');
CREATE TYPE "FeedbackVisibility" AS ENUM ('self', 'manager', 'hr', 'all');
CREATE TYPE "CheckInStatus" AS ENUM ('scheduled', 'completed', 'missed');

ALTER TABLE "development_goals"
ADD COLUMN "linked_kpi_id" INTEGER,
ADD COLUMN "plan_status" "DevelopmentPlanStatus" NOT NULL DEFAULT 'not_started',
ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "evaluation_assignments"
ADD COLUMN "cycle_id" INTEGER,
ADD COLUMN "due_date" TIMESTAMP(3),
ADD COLUMN "relationship" "EvaluationRelationship" DEFAULT 'manager';

ALTER TABLE "evaluation_cycles"
ADD COLUMN "cycle_type" "EvaluationCycleType" NOT NULL DEFAULT 'annual',
ADD COLUMN "department_id" INTEGER;

ALTER TABLE "evaluation_definitions"
ADD COLUMN "template_id" INTEGER,
ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoring_config" SET DEFAULT '{}'::jsonb;

ALTER TABLE "evaluation_templates"
ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "competencies" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb;

ALTER TABLE "feedback"
ADD COLUMN "feedback_type" "ContinuousFeedbackType" NOT NULL DEFAULT 'praise',
ADD COLUMN "is_private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "job_id" INTEGER,
ADD COLUMN "message" TEXT,
ADD COLUMN "visibility" "FeedbackVisibility" NOT NULL DEFAULT 'all';

ALTER TABLE "kpis"
ADD COLUMN "actual_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "created_by_profile_id" INTEGER,
ADD COLUMN "cycle_id" INTEGER,
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "due_date" TIMESTAMP(3),
ADD COLUMN "owner_profile_id" INTEGER,
ADD COLUMN "progress_status" "KpiTrackingStatus" NOT NULL DEFAULT 'on_track';

CREATE TABLE "okrs" (
    "id" SERIAL NOT NULL,
    "owner_profile_id" INTEGER NOT NULL,
    "cycle_id" INTEGER,
    "objective" TEXT NOT NULL,
    "key_results" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "KpiTrackingStatus" NOT NULL DEFAULT 'on_track',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "okrs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_questions" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "category" "EvaluationQuestionCategory" NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_responses" (
    "id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "check_ins" (
    "id" SERIAL NOT NULL,
    "manager_profile_id" INTEGER NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "action_items" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status" "CheckInStatus" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "development_goals_linked_kpi_id_idx" ON "development_goals"("linked_kpi_id");
CREATE INDEX "evaluation_assignments_cycle_id_evaluatee_profile_id_idx" ON "evaluation_assignments"("cycle_id", "evaluatee_profile_id");
CREATE INDEX "evaluation_cycles_department_id_idx" ON "evaluation_cycles"("department_id");
CREATE INDEX "evaluation_definitions_template_id_idx" ON "evaluation_definitions"("template_id");
CREATE INDEX "feedback_job_id_idx" ON "feedback"("job_id");
CREATE INDEX "kpis_owner_profile_id_idx" ON "kpis"("owner_profile_id");
CREATE INDEX "kpis_cycle_id_idx" ON "kpis"("cycle_id");
CREATE INDEX "kpis_progress_status_idx" ON "kpis"("progress_status");
CREATE INDEX "okrs_owner_profile_id_idx" ON "okrs"("owner_profile_id");
CREATE INDEX "okrs_cycle_id_idx" ON "okrs"("cycle_id");
CREATE INDEX "evaluation_questions_template_id_display_order_idx" ON "evaluation_questions"("template_id", "display_order");
CREATE INDEX "evaluation_responses_question_id_idx" ON "evaluation_responses"("question_id");
CREATE UNIQUE INDEX "evaluation_responses_assignment_id_question_id_key" ON "evaluation_responses"("assignment_id", "question_id");
CREATE INDEX "check_ins_manager_profile_id_status_idx" ON "check_ins"("manager_profile_id", "status");
CREATE INDEX "check_ins_employee_profile_id_scheduled_at_idx" ON "check_ins"("employee_profile_id", "scheduled_at");

ALTER TABLE "feedback"
ADD CONSTRAINT "feedback_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "development_goals"
ADD CONSTRAINT "development_goals_linked_kpi_id_fkey" FOREIGN KEY ("linked_kpi_id") REFERENCES "kpis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kpis"
ADD CONSTRAINT "kpis_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "kpis_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "kpis_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evaluation_cycles"
ADD CONSTRAINT "evaluation_cycles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "evaluation_cycles_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evaluation_definitions"
ADD CONSTRAINT "evaluation_definitions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "evaluation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evaluation_assignments"
ADD CONSTRAINT "evaluation_assignments_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "okrs"
ADD CONSTRAINT "okrs_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "okrs_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evaluation_questions"
ADD CONSTRAINT "evaluation_questions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "evaluation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evaluation_responses"
ADD CONSTRAINT "evaluation_responses_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "evaluation_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "evaluation_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "evaluation_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "check_ins"
ADD CONSTRAINT "check_ins_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "check_ins_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
