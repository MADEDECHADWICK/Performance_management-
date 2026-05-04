-- Migration: calibration_reviews_dev_plans
-- Adds:
--   1. New enums
--   2. CalibrationSession + CalibrationSessionParticipant
--   3. PerformanceReview (check-ins)
--   4. DevelopmentPlan + DevelopmentPlanItem
--   5. Extend PerformanceBand (grade, outcome)
--   6. Extend PerformanceScore (calibration_session_id, potential_rating)

-- =============================
-- 1. ENUMS
-- =============================

CREATE TYPE "calibration_session_status" AS ENUM ('open', 'in_review', 'finalized');
CREATE TYPE "performance_band_outcome"   AS ENUM ('promote', 'retain', 'pip', 'exit');
CREATE TYPE "performance_review_type"    AS ENUM ('check_in', 'quarterly', 'annual');
CREATE TYPE "performance_review_status"  AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "development_plan_status"    AS ENUM ('draft', 'active', 'completed');
CREATE TYPE "development_plan_item_status" AS ENUM ('pending', 'in_progress', 'completed', 'deferred');

-- =============================
-- 2. CALIBRATION SESSIONS
-- =============================

CREATE TABLE "calibration_sessions" (
    "id"                    SERIAL PRIMARY KEY,
    "evaluation_cycle_id"   INTEGER NOT NULL,
    "name"                  TEXT    NOT NULL,
    "status"                "calibration_session_status" NOT NULL DEFAULT 'open',
    "facilitator_profile_id" INTEGER,
    "department_id"         INTEGER,
    "notes"                 TEXT,
    "scheduled_at"          TIMESTAMP(3),
    "finalized_at"          TIMESTAMP(3),
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "calibration_sessions"
    ADD CONSTRAINT "calibration_sessions_evaluation_cycle_id_fkey"
    FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE CASCADE;

ALTER TABLE "calibration_sessions"
    ADD CONSTRAINT "calibration_sessions_facilitator_profile_id_fkey"
    FOREIGN KEY ("facilitator_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL;

ALTER TABLE "calibration_sessions"
    ADD CONSTRAINT "calibration_sessions_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;

CREATE INDEX "calibration_sessions_evaluation_cycle_id_status_idx" ON "calibration_sessions"("evaluation_cycle_id", "status");
CREATE INDEX "calibration_sessions_department_id_idx" ON "calibration_sessions"("department_id");

CREATE TABLE "calibration_session_participants" (
    "id"          SERIAL PRIMARY KEY,
    "session_id"  INTEGER NOT NULL,
    "profile_id"  INTEGER NOT NULL,
    "role"        TEXT    NOT NULL DEFAULT 'reviewer',
    "joined_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "calibration_session_participants"
    ADD CONSTRAINT "calibration_session_participants_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "calibration_sessions"("id") ON DELETE CASCADE;

ALTER TABLE "calibration_session_participants"
    ADD CONSTRAINT "calibration_session_participants_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "calibration_session_participants_session_id_profile_id_key"
    ON "calibration_session_participants"("session_id", "profile_id");

CREATE INDEX "calibration_session_participants_profile_id_idx"
    ON "calibration_session_participants"("profile_id");

-- =============================
-- 3. PERFORMANCE REVIEWS
-- =============================

CREATE TABLE "performance_reviews" (
    "id"                    SERIAL PRIMARY KEY,
    "reviewer_profile_id"   INTEGER NOT NULL,
    "reviewee_profile_id"   INTEGER NOT NULL,
    "evaluation_cycle_id"   INTEGER,
    "type"                  "performance_review_type"   NOT NULL DEFAULT 'check_in',
    "status"                "performance_review_status" NOT NULL DEFAULT 'scheduled',
    "scheduled_at"          TIMESTAMP(3),
    "completed_at"          TIMESTAMP(3),
    "notes"                 TEXT,
    "competency_ratings"    JSONB,
    "overall_rating"        INTEGER,
    "agenda_items"          JSONB,
    "action_items"          JSONB,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "performance_reviews"
    ADD CONSTRAINT "performance_reviews_reviewer_profile_id_fkey"
    FOREIGN KEY ("reviewer_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "performance_reviews"
    ADD CONSTRAINT "performance_reviews_reviewee_profile_id_fkey"
    FOREIGN KEY ("reviewee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "performance_reviews"
    ADD CONSTRAINT "performance_reviews_evaluation_cycle_id_fkey"
    FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL;

CREATE INDEX "performance_reviews_reviewer_profile_id_status_idx" ON "performance_reviews"("reviewer_profile_id", "status");
CREATE INDEX "performance_reviews_reviewee_profile_id_status_idx" ON "performance_reviews"("reviewee_profile_id", "status");
CREATE INDEX "performance_reviews_evaluation_cycle_id_idx" ON "performance_reviews"("evaluation_cycle_id");

-- =============================
-- 4. DEVELOPMENT PLANS
-- =============================

CREATE TABLE "development_plans" (
    "id"                    SERIAL PRIMARY KEY,
    "profile_id"            INTEGER NOT NULL,
    "evaluation_cycle_id"   INTEGER,
    "title"                 TEXT    NOT NULL,
    "status"                "development_plan_status" NOT NULL DEFAULT 'draft',
    "auto_generated"        BOOLEAN NOT NULL DEFAULT false,
    "notes"                 TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "development_plans"
    ADD CONSTRAINT "development_plans_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "development_plans"
    ADD CONSTRAINT "development_plans_evaluation_cycle_id_fkey"
    FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL;

CREATE INDEX "development_plans_profile_id_status_idx" ON "development_plans"("profile_id", "status");
CREATE INDEX "development_plans_evaluation_cycle_id_idx" ON "development_plans"("evaluation_cycle_id");

CREATE TABLE "development_plan_items" (
    "id"            SERIAL PRIMARY KEY,
    "plan_id"       INTEGER NOT NULL,
    "competency_id" INTEGER,
    "title"         TEXT    NOT NULL,
    "description"   TEXT,
    "target_level"  INTEGER,
    "current_level" INTEGER,
    "status"        "development_plan_item_status" NOT NULL DEFAULT 'pending',
    "priority"      INTEGER NOT NULL DEFAULT 1,
    "due_date"      TIMESTAMP(3),
    "completed_at"  TIMESTAMP(3),
    "resources"     JSONB,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "development_plan_items"
    ADD CONSTRAINT "development_plan_items_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "development_plans"("id") ON DELETE CASCADE;

ALTER TABLE "development_plan_items"
    ADD CONSTRAINT "development_plan_items_competency_id_fkey"
    FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE SET NULL;

CREATE INDEX "development_plan_items_plan_id_status_idx" ON "development_plan_items"("plan_id", "status");
CREATE INDEX "development_plan_items_competency_id_idx" ON "development_plan_items"("competency_id");

-- =============================
-- 5. EXTEND performance_bands
-- =============================

ALTER TABLE "performance_bands"
    ADD COLUMN "grade"   TEXT,
    ADD COLUMN "outcome" "performance_band_outcome";

-- =============================
-- 6. EXTEND performance_scores
-- =============================

ALTER TABLE "performance_scores"
    ADD COLUMN "calibration_session_id" INTEGER,
    ADD COLUMN "potential_rating"        INTEGER;

ALTER TABLE "performance_scores"
    ADD CONSTRAINT "performance_scores_calibration_session_id_fkey"
    FOREIGN KEY ("calibration_session_id") REFERENCES "calibration_sessions"("id") ON DELETE SET NULL;

CREATE INDEX "performance_scores_calibration_session_id_idx"
    ON "performance_scores"("calibration_session_id");
