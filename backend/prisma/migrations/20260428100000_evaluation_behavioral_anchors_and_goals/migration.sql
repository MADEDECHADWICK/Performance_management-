-- Migration: evaluation_behavioral_anchors_and_goals
-- Adds:
--   1. competencies table (Competency library)
--   2. competency_id FK + rating_scale JSON on evaluation_questions (behavioral anchors)
--   3. employee_goals table (Item 2 — employee goal-setting)

-- =============================
-- 1. COMPETENCY LIBRARY
-- =============================

CREATE TABLE "competencies" (
    "id"          SERIAL PRIMARY KEY,
    "name"        TEXT    NOT NULL,
    "category"    TEXT    NOT NULL,
    "description" TEXT,
    "levels"      JSONB   NOT NULL DEFAULT '[]',
    "is_active"   BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "competencies_name_key" ON "competencies"("name");
CREATE INDEX "competencies_category_is_active_idx" ON "competencies"("category", "is_active");

-- =============================
-- 2. BEHAVIORAL ANCHORS on evaluation_questions
-- =============================

ALTER TABLE "evaluation_questions"
    ADD COLUMN "competency_id" INTEGER,
    ADD COLUMN "rating_scale"  JSONB;

ALTER TABLE "evaluation_questions"
    ADD CONSTRAINT "evaluation_questions_competency_id_fkey"
    FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE SET NULL;

CREATE INDEX "evaluation_questions_competency_id_idx" ON "evaluation_questions"("competency_id");

-- =============================
-- 3. EMPLOYEE GOALS
-- =============================

CREATE TYPE "employee_goal_status" AS ENUM ('draft', 'active', 'achieved', 'missed');

CREATE TABLE "employee_goals" (
    "id"                  SERIAL PRIMARY KEY,
    "profile_id"          INTEGER          NOT NULL,
    "evaluation_cycle_id" INTEGER,
    "bsc_kpi_key"         TEXT,
    "title"               TEXT             NOT NULL,
    "description"         TEXT,
    "target_value"        DECIMAL(10, 2),
    "actual_value"        DECIMAL(10, 2),
    "weight"              DECIMAL(5, 2)    NOT NULL DEFAULT 1,
    "status"              "employee_goal_status" NOT NULL DEFAULT 'draft',
    "due_date"            TIMESTAMP(3),
    "manager_comment"     TEXT,
    "acknowledged_at"     TIMESTAMP(3),
    "created_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "employee_goals"
    ADD CONSTRAINT "employee_goals_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "employee_goals"
    ADD CONSTRAINT "employee_goals_evaluation_cycle_id_fkey"
    FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL;

CREATE INDEX "employee_goals_profile_id_status_idx" ON "employee_goals"("profile_id", "status");
CREATE INDEX "employee_goals_evaluation_cycle_id_idx" ON "employee_goals"("evaluation_cycle_id");
