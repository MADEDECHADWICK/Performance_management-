-- CreateEnum
CREATE TYPE "TrainingRecordSourceType" AS ENUM ('manual', 'learning_assignment');

-- CreateEnum
CREATE TYPE "KnowledgeCompletionMode" AS ENUM ('video_end', 'watch_percent', 'document_scroll', 'manual');

-- CreateEnum
CREATE TYPE "LearningPointEventType" AS ENUM ('knowledge_resource_completed', 'knowledge_quiz_passed', 'training_attendance_confirmed', 'training_quiz_passed', 'training_feedback_submitted');

-- CreateEnum
CREATE TYPE "LearningPointSourceType" AS ENUM ('knowledge_resource', 'knowledge_quiz', 'learning_session', 'learning_quiz', 'training_feedback');

-- CreateEnum
CREATE TYPE "LearningProgramStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "LearningProgramVersionStatus" AS ENUM ('draft', 'published', 'retired');

-- CreateEnum
CREATE TYPE "LearningModuleContentType" AS ENUM ('video', 'document', 'link', 'knowledge_resource', 'live_session');

-- CreateEnum
CREATE TYPE "LearningAssignmentStatus" AS ENUM ('assigned', 'in_progress', 'completed', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "LearningProgressStatus" AS ENUM ('not_started', 'in_progress', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "LearningAttendanceStatus" AS ENUM ('invited', 'attended', 'missed', 'excused');

-- CreateEnum
CREATE TYPE "LearningQuizQuestionType" AS ENUM ('single_choice', 'multiple_choice', 'true_false', 'short_text');

-- CreateEnum
CREATE TYPE "LearningQuizAttemptStatus" AS ENUM ('in_progress', 'submitted', 'passed', 'failed');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('issued', 'revoked');

-- CreateEnum
CREATE TYPE "ImpactAssessmentStatus" AS ENUM ('pending', 'submitted', 'overdue', 'cancelled');

-- AlterTable
ALTER TABLE "knowledge_hub_resources"
ADD COLUMN "completion_mode" "KnowledgeCompletionMode" NOT NULL DEFAULT 'manual',
ADD COLUMN "completion_threshold_percent" DECIMAL(5,2),
ADD COLUMN "estimated_duration_minutes" INTEGER,
ADD COLUMN "min_read_seconds" INTEGER,
ADD COLUMN "points_on_completion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "training_records"
ADD COLUMN "learning_assignment_id" INTEGER,
ADD COLUMN "source_type" "TrainingRecordSourceType" NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "knowledge_hub_resource_progress" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "status" "LearningProgressStatus" NOT NULL DEFAULT 'not_started',
    "started_at" TIMESTAMP(3),
    "last_interacted_at" TIMESTAMP(3),
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "scroll_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "watch_seconds" INTEGER NOT NULL DEFAULT 0,
    "watch_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_hub_resource_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_hub_quizzes" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "pass_mark" DECIMAL(5,2) NOT NULL,
    "points_on_pass" INTEGER NOT NULL DEFAULT 0,
    "attempt_limit" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_hub_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_hub_quiz_questions" (
    "id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "question_type" "LearningQuizQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_hub_quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_hub_quiz_options" (
    "id" SERIAL NOT NULL,
    "question_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "knowledge_hub_quiz_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_hub_quiz_attempts" (
    "id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "LearningQuizAttemptStatus" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "passed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_hub_quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_hub_quiz_answers" (
    "id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "free_text_answer" TEXT,
    "is_correct" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_hub_quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_hub_quiz_answer_options" (
    "answer_id" INTEGER NOT NULL,
    "option_id" INTEGER NOT NULL,

    CONSTRAINT "knowledge_hub_quiz_answer_options_pkey" PRIMARY KEY ("answer_id","option_id")
);

-- CreateTable
CREATE TABLE "learning_programs" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "department_id" INTEGER,
    "created_by_profile_id" INTEGER NOT NULL,
    "status" "LearningProgramStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_program_versions" (
    "id" SERIAL NOT NULL,
    "program_id" INTEGER NOT NULL,
    "version_no" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "training_type" "TrainingRecordType" NOT NULL DEFAULT 'internal',
    "delivery_mode" TEXT,
    "provider" TEXT,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "trainer_profile_id" INTEGER,
    "external_trainer_name" TEXT,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "feedback_points" INTEGER NOT NULL DEFAULT 0,
    "impact_assessment_delay_days" INTEGER,
    "status" "LearningProgramVersionStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_by_profile_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_program_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_modules" (
    "id" SERIAL NOT NULL,
    "program_version_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content_type" "LearningModuleContentType" NOT NULL,
    "knowledge_hub_resource_id" INTEGER,
    "document_id" INTEGER,
    "content_url" TEXT,
    "sequence_no" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "estimated_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_sessions" (
    "id" SERIAL NOT NULL,
    "program_version_id" INTEGER NOT NULL,
    "module_id" INTEGER,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "trainer_profile_id" INTEGER,
    "external_trainer_name" TEXT,
    "attendance_points" INTEGER NOT NULL DEFAULT 0,
    "attendance_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_assignments" (
    "id" SERIAL NOT NULL,
    "program_version_id" INTEGER NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "assigned_by_profile_id" INTEGER NOT NULL,
    "manager_profile_id" INTEGER,
    "due_at" TIMESTAMP(3),
    "status" "LearningAssignmentStatus" NOT NULL DEFAULT 'assigned',
    "progress_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_module_progress" (
    "id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "module_id" INTEGER NOT NULL,
    "status" "LearningProgressStatus" NOT NULL DEFAULT 'not_started',
    "started_at" TIMESTAMP(3),
    "last_interacted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completion_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "watch_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "scroll_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_module_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_attendance_records" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "attendance_status" "LearningAttendanceStatus" NOT NULL DEFAULT 'invited',
    "attended_at" TIMESTAMP(3),
    "marked_by_profile_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_quizzes" (
    "id" SERIAL NOT NULL,
    "program_version_id" INTEGER NOT NULL,
    "module_id" INTEGER,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "pass_mark" DECIMAL(5,2) NOT NULL,
    "points_on_pass" INTEGER NOT NULL DEFAULT 0,
    "attempt_limit" INTEGER,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_quiz_questions" (
    "id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "question_type" "LearningQuizQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_quiz_options" (
    "id" SERIAL NOT NULL,
    "question_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "learning_quiz_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_quiz_attempts" (
    "id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "LearningQuizAttemptStatus" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "passed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_quiz_answers" (
    "id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "free_text_answer" TEXT,
    "is_correct" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_quiz_answer_options" (
    "answer_id" INTEGER NOT NULL,
    "option_id" INTEGER NOT NULL,

    CONSTRAINT "learning_quiz_answer_options_pkey" PRIMARY KEY ("answer_id","option_id")
);

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" SERIAL NOT NULL,
    "program_version_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "template_definition" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "background_document_id" INTEGER,
    "signature_document_id" INTEGER,
    "issued_by_label" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issued_certificates" (
    "id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "certificate_template_id" INTEGER NOT NULL,
    "document_id" INTEGER,
    "certificate_number" TEXT NOT NULL,
    "verification_code" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'issued',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issued_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_feedback" (
    "id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "trainer_profile_id" INTEGER,
    "overall_rating" INTEGER NOT NULL,
    "content_rating" INTEGER NOT NULL,
    "delivery_rating" INTEGER NOT NULL,
    "relevance_rating" INTEGER NOT NULL,
    "comment" TEXT,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_assessment_tasks" (
    "id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "manager_profile_id" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "ImpactAssessmentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "impact_assessment_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_assessment_responses" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "submitted_by_profile_id" INTEGER NOT NULL,
    "behavior_change_score" INTEGER,
    "productivity_impact_score" INTEGER,
    "quality_impact_score" INTEGER,
    "business_impact_score" INTEGER,
    "comment" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "impact_assessment_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_point_ledger" (
    "id" SERIAL NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "event_type" "LearningPointEventType" NOT NULL,
    "source_type" "LearningPointSourceType" NOT NULL,
    "source_id" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "awarded_by_profile_id" INTEGER,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "learning_point_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_hub_resource_progress_profile_id_status_idx" ON "knowledge_hub_resource_progress"("profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_hub_resource_progress_resource_id_profile_id_key" ON "knowledge_hub_resource_progress"("resource_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_hub_quizzes_resource_id_key" ON "knowledge_hub_quizzes"("resource_id");

-- CreateIndex
CREATE INDEX "knowledge_hub_quizzes_is_active_idx" ON "knowledge_hub_quizzes"("is_active");

-- CreateIndex
CREATE INDEX "knowledge_hub_quiz_questions_quiz_id_display_order_idx" ON "knowledge_hub_quiz_questions"("quiz_id", "display_order");

-- CreateIndex
CREATE INDEX "knowledge_hub_quiz_options_question_id_display_order_idx" ON "knowledge_hub_quiz_options"("question_id", "display_order");

-- CreateIndex
CREATE INDEX "knowledge_hub_quiz_attempts_profile_id_status_idx" ON "knowledge_hub_quiz_attempts"("profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_hub_quiz_attempts_quiz_id_profile_id_attempt_no_key" ON "knowledge_hub_quiz_attempts"("quiz_id", "profile_id", "attempt_no");

-- CreateIndex
CREATE INDEX "knowledge_hub_quiz_answers_question_id_idx" ON "knowledge_hub_quiz_answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_hub_quiz_answers_attempt_id_question_id_key" ON "knowledge_hub_quiz_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "knowledge_hub_quiz_answer_options_option_id_idx" ON "knowledge_hub_quiz_answer_options"("option_id");

-- CreateIndex
CREATE INDEX "learning_programs_department_id_idx" ON "learning_programs"("department_id");

-- CreateIndex
CREATE INDEX "learning_programs_created_by_profile_id_idx" ON "learning_programs"("created_by_profile_id");

-- CreateIndex
CREATE INDEX "learning_programs_status_idx" ON "learning_programs"("status");

-- CreateIndex
CREATE INDEX "learning_program_versions_trainer_profile_id_idx" ON "learning_program_versions"("trainer_profile_id");

-- CreateIndex
CREATE INDEX "learning_program_versions_created_by_profile_id_idx" ON "learning_program_versions"("created_by_profile_id");

-- CreateIndex
CREATE INDEX "learning_program_versions_status_idx" ON "learning_program_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "learning_program_versions_program_id_version_no_key" ON "learning_program_versions"("program_id", "version_no");

-- CreateIndex
CREATE INDEX "learning_modules_knowledge_hub_resource_id_idx" ON "learning_modules"("knowledge_hub_resource_id");

-- CreateIndex
CREATE INDEX "learning_modules_document_id_idx" ON "learning_modules"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_modules_program_version_id_sequence_no_key" ON "learning_modules"("program_version_id", "sequence_no");

-- CreateIndex
CREATE INDEX "learning_sessions_program_version_id_starts_at_idx" ON "learning_sessions"("program_version_id", "starts_at");

-- CreateIndex
CREATE INDEX "learning_sessions_module_id_idx" ON "learning_sessions"("module_id");

-- CreateIndex
CREATE INDEX "learning_sessions_trainer_profile_id_idx" ON "learning_sessions"("trainer_profile_id");

-- CreateIndex
CREATE INDEX "learning_assignments_employee_profile_id_status_idx" ON "learning_assignments"("employee_profile_id", "status");

-- CreateIndex
CREATE INDEX "learning_assignments_manager_profile_id_status_idx" ON "learning_assignments"("manager_profile_id", "status");

-- CreateIndex
CREATE INDEX "learning_assignments_due_at_idx" ON "learning_assignments"("due_at");

-- CreateIndex
CREATE UNIQUE INDEX "learning_assignments_program_version_id_employee_profile_id_key" ON "learning_assignments"("program_version_id", "employee_profile_id");

-- CreateIndex
CREATE INDEX "learning_module_progress_module_id_idx" ON "learning_module_progress"("module_id");

-- CreateIndex
CREATE INDEX "learning_module_progress_status_idx" ON "learning_module_progress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "learning_module_progress_assignment_id_module_id_key" ON "learning_module_progress"("assignment_id", "module_id");

-- CreateIndex
CREATE INDEX "learning_attendance_records_assignment_id_attendance_status_idx" ON "learning_attendance_records"("assignment_id", "attendance_status");

-- CreateIndex
CREATE INDEX "learning_attendance_records_marked_by_profile_id_idx" ON "learning_attendance_records"("marked_by_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_attendance_records_session_id_assignment_id_key" ON "learning_attendance_records"("session_id", "assignment_id");

-- CreateIndex
CREATE INDEX "learning_quizzes_program_version_id_idx" ON "learning_quizzes"("program_version_id");

-- CreateIndex
CREATE INDEX "learning_quizzes_module_id_idx" ON "learning_quizzes"("module_id");

-- CreateIndex
CREATE INDEX "learning_quizzes_is_active_idx" ON "learning_quizzes"("is_active");

-- CreateIndex
CREATE INDEX "learning_quiz_questions_quiz_id_display_order_idx" ON "learning_quiz_questions"("quiz_id", "display_order");

-- CreateIndex
CREATE INDEX "learning_quiz_options_question_id_display_order_idx" ON "learning_quiz_options"("question_id", "display_order");

-- CreateIndex
CREATE INDEX "learning_quiz_attempts_assignment_id_status_idx" ON "learning_quiz_attempts"("assignment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "learning_quiz_attempts_quiz_id_assignment_id_attempt_no_key" ON "learning_quiz_attempts"("quiz_id", "assignment_id", "attempt_no");

-- CreateIndex
CREATE INDEX "learning_quiz_answers_question_id_idx" ON "learning_quiz_answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_quiz_answers_attempt_id_question_id_key" ON "learning_quiz_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "learning_quiz_answer_options_option_id_idx" ON "learning_quiz_answer_options"("option_id");

-- CreateIndex
CREATE INDEX "certificate_templates_program_version_id_idx" ON "certificate_templates"("program_version_id");

-- CreateIndex
CREATE INDEX "certificate_templates_background_document_id_idx" ON "certificate_templates"("background_document_id");

-- CreateIndex
CREATE INDEX "certificate_templates_signature_document_id_idx" ON "certificate_templates"("signature_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "issued_certificates_assignment_id_key" ON "issued_certificates"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "issued_certificates_certificate_number_key" ON "issued_certificates"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "issued_certificates_verification_code_key" ON "issued_certificates"("verification_code");

-- CreateIndex
CREATE INDEX "issued_certificates_certificate_template_id_idx" ON "issued_certificates"("certificate_template_id");

-- CreateIndex
CREATE INDEX "issued_certificates_document_id_idx" ON "issued_certificates"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_feedback_assignment_id_key" ON "training_feedback"("assignment_id");

-- CreateIndex
CREATE INDEX "training_feedback_trainer_profile_id_idx" ON "training_feedback"("trainer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "impact_assessment_tasks_assignment_id_key" ON "impact_assessment_tasks"("assignment_id");

-- CreateIndex
CREATE INDEX "impact_assessment_tasks_manager_profile_id_status_idx" ON "impact_assessment_tasks"("manager_profile_id", "status");

-- CreateIndex
CREATE INDEX "impact_assessment_tasks_due_at_idx" ON "impact_assessment_tasks"("due_at");

-- CreateIndex
CREATE UNIQUE INDEX "impact_assessment_responses_task_id_key" ON "impact_assessment_responses"("task_id");

-- CreateIndex
CREATE INDEX "impact_assessment_responses_submitted_by_profile_id_idx" ON "impact_assessment_responses"("submitted_by_profile_id");

-- CreateIndex
CREATE INDEX "learning_point_ledger_profile_id_awarded_at_idx" ON "learning_point_ledger"("profile_id", "awarded_at");

-- CreateIndex
CREATE INDEX "learning_point_ledger_event_type_awarded_at_idx" ON "learning_point_ledger"("event_type", "awarded_at");

-- CreateIndex
CREATE UNIQUE INDEX "learning_point_ledger_profile_id_event_type_source_type_sou_key" ON "learning_point_ledger"("profile_id", "event_type", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_records_learning_assignment_id_key" ON "training_records"("learning_assignment_id");

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_learning_assignment_id_fkey" FOREIGN KEY ("learning_assignment_id") REFERENCES "learning_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_resource_progress" ADD CONSTRAINT "knowledge_hub_resource_progress_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "knowledge_hub_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_resource_progress" ADD CONSTRAINT "knowledge_hub_resource_progress_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quizzes" ADD CONSTRAINT "knowledge_hub_quizzes_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "knowledge_hub_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quiz_questions" ADD CONSTRAINT "knowledge_hub_quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "knowledge_hub_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quiz_options" ADD CONSTRAINT "knowledge_hub_quiz_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "knowledge_hub_quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quiz_attempts" ADD CONSTRAINT "knowledge_hub_quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "knowledge_hub_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quiz_attempts" ADD CONSTRAINT "knowledge_hub_quiz_attempts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quiz_answers" ADD CONSTRAINT "knowledge_hub_quiz_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "knowledge_hub_quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quiz_answers" ADD CONSTRAINT "knowledge_hub_quiz_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "knowledge_hub_quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quiz_answer_options" ADD CONSTRAINT "knowledge_hub_quiz_answer_options_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "knowledge_hub_quiz_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_quiz_answer_options" ADD CONSTRAINT "knowledge_hub_quiz_answer_options_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "knowledge_hub_quiz_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_programs" ADD CONSTRAINT "learning_programs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_programs" ADD CONSTRAINT "learning_programs_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_program_versions" ADD CONSTRAINT "learning_program_versions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "learning_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_program_versions" ADD CONSTRAINT "learning_program_versions_trainer_profile_id_fkey" FOREIGN KEY ("trainer_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_program_versions" ADD CONSTRAINT "learning_program_versions_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_program_version_id_fkey" FOREIGN KEY ("program_version_id") REFERENCES "learning_program_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_knowledge_hub_resource_id_fkey" FOREIGN KEY ("knowledge_hub_resource_id") REFERENCES "knowledge_hub_resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_program_version_id_fkey" FOREIGN KEY ("program_version_id") REFERENCES "learning_program_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "learning_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_trainer_profile_id_fkey" FOREIGN KEY ("trainer_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignments" ADD CONSTRAINT "learning_assignments_program_version_id_fkey" FOREIGN KEY ("program_version_id") REFERENCES "learning_program_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignments" ADD CONSTRAINT "learning_assignments_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignments" ADD CONSTRAINT "learning_assignments_assigned_by_profile_id_fkey" FOREIGN KEY ("assigned_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignments" ADD CONSTRAINT "learning_assignments_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_module_progress" ADD CONSTRAINT "learning_module_progress_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "learning_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_module_progress" ADD CONSTRAINT "learning_module_progress_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "learning_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_attendance_records" ADD CONSTRAINT "learning_attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "learning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_attendance_records" ADD CONSTRAINT "learning_attendance_records_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "learning_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_attendance_records" ADD CONSTRAINT "learning_attendance_records_marked_by_profile_id_fkey" FOREIGN KEY ("marked_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quizzes" ADD CONSTRAINT "learning_quizzes_program_version_id_fkey" FOREIGN KEY ("program_version_id") REFERENCES "learning_program_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quizzes" ADD CONSTRAINT "learning_quizzes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "learning_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quiz_questions" ADD CONSTRAINT "learning_quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "learning_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quiz_options" ADD CONSTRAINT "learning_quiz_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "learning_quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quiz_attempts" ADD CONSTRAINT "learning_quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "learning_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quiz_attempts" ADD CONSTRAINT "learning_quiz_attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "learning_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quiz_answers" ADD CONSTRAINT "learning_quiz_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "learning_quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quiz_answers" ADD CONSTRAINT "learning_quiz_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "learning_quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quiz_answer_options" ADD CONSTRAINT "learning_quiz_answer_options_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "learning_quiz_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_quiz_answer_options" ADD CONSTRAINT "learning_quiz_answer_options_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "learning_quiz_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_program_version_id_fkey" FOREIGN KEY ("program_version_id") REFERENCES "learning_program_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_background_document_id_fkey" FOREIGN KEY ("background_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_signature_document_id_fkey" FOREIGN KEY ("signature_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "learning_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_certificate_template_id_fkey" FOREIGN KEY ("certificate_template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_feedback" ADD CONSTRAINT "training_feedback_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "learning_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_feedback" ADD CONSTRAINT "training_feedback_trainer_profile_id_fkey" FOREIGN KEY ("trainer_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_assessment_tasks" ADD CONSTRAINT "impact_assessment_tasks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "learning_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_assessment_tasks" ADD CONSTRAINT "impact_assessment_tasks_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_assessment_responses" ADD CONSTRAINT "impact_assessment_responses_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "impact_assessment_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_assessment_responses" ADD CONSTRAINT "impact_assessment_responses_submitted_by_profile_id_fkey" FOREIGN KEY ("submitted_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_point_ledger" ADD CONSTRAINT "learning_point_ledger_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_point_ledger" ADD CONSTRAINT "learning_point_ledger_awarded_by_profile_id_fkey" FOREIGN KEY ("awarded_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
