-- CreateEnum
CREATE TYPE "DevelopmentGoalStatus" AS ENUM ('active', 'completed', 'paused', 'cancelled');

-- CreateTable
CREATE TABLE "skill_assessments" (
    "id" SERIAL NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "assessor_profile_id" INTEGER NOT NULL,
    "department_id" INTEGER,
    "skill_category" TEXT NOT NULL,
    "skill_name" TEXT NOT NULL,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "target_level" INTEGER NOT NULL DEFAULT 1,
    "assessment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_goals" (
    "id" SERIAL NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "created_by_profile_id" INTEGER NOT NULL,
    "assigned_mentor_profile_id" INTEGER,
    "department_id" INTEGER,
    "goal_title" TEXT NOT NULL,
    "goal_description" TEXT NOT NULL,
    "target_completion" TIMESTAMP(3) NOT NULL,
    "current_progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "DevelopmentGoalStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "development_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_assessments_employee_profile_id_assessment_date_idx" ON "skill_assessments"("employee_profile_id", "assessment_date");

-- CreateIndex
CREATE INDEX "skill_assessments_assessor_profile_id_idx" ON "skill_assessments"("assessor_profile_id");

-- CreateIndex
CREATE INDEX "skill_assessments_department_id_idx" ON "skill_assessments"("department_id");

-- CreateIndex
CREATE INDEX "development_goals_employee_profile_id_status_idx" ON "development_goals"("employee_profile_id", "status");

-- CreateIndex
CREATE INDEX "development_goals_created_by_profile_id_idx" ON "development_goals"("created_by_profile_id");

-- CreateIndex
CREATE INDEX "development_goals_assigned_mentor_profile_id_idx" ON "development_goals"("assigned_mentor_profile_id");

-- CreateIndex
CREATE INDEX "development_goals_department_id_idx" ON "development_goals"("department_id");

-- CreateIndex
CREATE INDEX "development_goals_target_completion_idx" ON "development_goals"("target_completion");

-- AddForeignKey
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_assessor_profile_id_fkey" FOREIGN KEY ("assessor_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_goals" ADD CONSTRAINT "development_goals_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_goals" ADD CONSTRAINT "development_goals_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_goals" ADD CONSTRAINT "development_goals_assigned_mentor_profile_id_fkey" FOREIGN KEY ("assigned_mentor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_goals" ADD CONSTRAINT "development_goals_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
