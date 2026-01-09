-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department_code" TEXT,
    "department_head_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "billing_rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone_number" TEXT,
    "profile_picture" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "position" TEXT,
    "departmentId" INTEGER,
    "role_id" INTEGER,
    "hire_date" TIMESTAMP(3),
    "manager_id" INTEGER,
    "cost_rate" DECIMAL(65,30) DEFAULT 0,
    "is_partner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_companies" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT NOT NULL,
    "registration_number" TEXT,
    "tax_id" TEXT,
    "bank_account_details" TEXT,
    "contract_terms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" SERIAL NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "company_id" INTEGER,
    "commission_rate" DECIMAL(65,30) DEFAULT 0,
    "performance_threshold" DECIMAL(65,30) DEFAULT 80,
    "group_name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_code" TEXT,
    "industry" TEXT,
    "contact_person" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "project_name" TEXT NOT NULL,
    "project_code" TEXT,
    "client_id" INTEGER,
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "budget" DECIMAL(65,30),
    "project_manager_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_logs" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "work_date" TIMESTAMP(3) NOT NULL,
    "hours_worked" DECIMAL(65,30) NOT NULL,
    "billable_hours" DECIMAL(65,30),
    "description" TEXT,
    "task_type" TEXT,
    "activity_type" TEXT,
    "is_overtime" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_records" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "course_name" TEXT NOT NULL,
    "provider" TEXT,
    "hours" DECIMAL(65,30) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "certificate_url" TEXT,
    "training_type" TEXT NOT NULL DEFAULT 'external',
    "cost" DECIMAL(65,30) DEFAULT 0,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_sessions" (
    "id" SERIAL NOT NULL,
    "presenter_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "topic_area" TEXT,
    "session_date" TIMESTAMP(3) NOT NULL,
    "duration_hours" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "attendee_count" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "session_type" TEXT NOT NULL DEFAULT 'presentation',
    "materials_url" TEXT,
    "feedback_score" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_reviews" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "reviewer_id" INTEGER NOT NULL,
    "accuracy_score" DECIMAL(65,30) NOT NULL,
    "completeness_score" DECIMAL(65,30) NOT NULL,
    "timeliness_score" DECIMAL(65,30) NOT NULL,
    "innovation_score" DECIMAL(65,30),
    "overall_score" DECIMAL(65,30) NOT NULL,
    "feedback" TEXT,
    "areas_for_improvement" TEXT,
    "strengths" TEXT,
    "review_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_ideas" (
    "id" SERIAL NOT NULL,
    "submitted_by" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "impact_area" TEXT,
    "estimated_savings" DECIMAL(65,30),
    "implementation_date" TIMESTAMP(3),
    "feedback" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "improvement_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_kpi_scores" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "evaluation_cycle_id" INTEGER,
    "kpi_name" TEXT NOT NULL,
    "kpi_category" TEXT NOT NULL,
    "calculated_value" DECIMAL(65,30) NOT NULL,
    "target_value" DECIMAL(65,30) NOT NULL,
    "achievement_percentage" DECIMAL(65,30) NOT NULL,
    "weight_percentage" DECIMAL(65,30) NOT NULL,
    "weighted_score" DECIMAL(65,30) NOT NULL,
    "calculation_period_start" TIMESTAMP(3) NOT NULL,
    "calculation_period_end" TIMESTAMP(3) NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_kpi_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpis" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "measurement_unit" TEXT,
    "target_value" DECIMAL(65,30),
    "weight" DECIMAL(65,30),
    "bsc_category" TEXT,
    "department_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "reviewer_id" INTEGER,
    "review_period_start" TIMESTAMP(3),
    "review_period_end" TIMESTAMP(3),
    "overall_rating" DECIMAL(65,30),
    "financial_score" DECIMAL(65,30),
    "non_financial_score" DECIMAL(65,30),
    "strengths" TEXT,
    "areas_for_improvement" TEXT,
    "goals_next_period" TEXT,
    "reviewer_comments" TEXT,
    "employee_comments" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "giver_id" INTEGER,
    "feedback_type" TEXT,
    "category" TEXT,
    "message" TEXT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_cycles" (
    "id" SERIAL NOT NULL,
    "cycle_name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_evaluations" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "client_id" INTEGER,
    "evaluation_date" TIMESTAMP(3),
    "quality_of_work" INTEGER,
    "communication" INTEGER,
    "timeliness" INTEGER,
    "professionalism" INTEGER,
    "expertise" INTEGER,
    "overall_rating" DECIMAL(65,30),
    "comments" TEXT,
    "would_recommend" BOOLEAN,
    "access_token" TEXT,
    "submitted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_financials" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER,
    "total_revenue" DECIMAL(65,30),
    "total_cost" DECIMAL(65,30),
    "profit_margin" DECIMAL(65,30),
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_financials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_project_allocations" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "allocation_percentage" DECIMAL(65,30),
    "allocation_amount" DECIMAL(65,30),
    "billable_hours" DECIMAL(65,30),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "role_in_project" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_project_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_evaluations" (
    "id" SERIAL NOT NULL,
    "evaluation_cycle_id" INTEGER,
    "employee_id" INTEGER NOT NULL,
    "evaluator_id" INTEGER,
    "evaluation_type" TEXT,
    "self_rating" DECIMAL(65,30),
    "manager_rating" DECIMAL(65,30),
    "peer_rating" DECIMAL(65,30),
    "upward_rating" DECIMAL(65,30),
    "overall_rating" DECIMAL(65,30),
    "manager_technical_expertise" DECIMAL(65,30),
    "manager_communication" DECIMAL(65,30),
    "manager_collaboration" DECIMAL(65,30),
    "manager_problem_solving" DECIMAL(65,30),
    "manager_time_management" DECIMAL(65,30),
    "manager_innovation" DECIMAL(65,30),
    "bsc_learning_growth_score" DECIMAL(65,30),
    "bsc_customer_satisfaction_score" DECIMAL(65,30),
    "bsc_internal_processes_score" DECIMAL(65,30),
    "competencies" TEXT,
    "goals_achieved" TEXT,
    "development_areas" TEXT,
    "comments" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer_evaluations" (
    "id" SERIAL NOT NULL,
    "evaluation_cycle_id" INTEGER,
    "evaluatee_id" INTEGER NOT NULL,
    "evaluator_id" INTEGER NOT NULL,
    "collaboration_rating" INTEGER,
    "communication_rating" INTEGER,
    "reliability_rating" INTEGER,
    "knowledge_sharing_rating" INTEGER,
    "overall_rating" DECIMAL(65,30),
    "strengths" TEXT,
    "areas_for_improvement" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "peer_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upward_evaluations" (
    "id" SERIAL NOT NULL,
    "manager_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "evaluation_cycle_id" INTEGER,
    "leadership_rating" INTEGER,
    "communication_rating" INTEGER,
    "support_rating" INTEGER,
    "decision_making_rating" INTEGER,
    "feedback_quality_rating" INTEGER,
    "overall_rating" DECIMAL(65,30),
    "strengths" TEXT,
    "areas_for_improvement" TEXT,
    "suggestions" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upward_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_goals" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "goal_title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "target_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "progress_percentage" INTEGER NOT NULL DEFAULT 0,
    "kpi_id" INTEGER,
    "created_by" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_kpi_assignments" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "kpi_id" INTEGER,
    "target_value" DECIMAL(65,30),
    "achieved_value" DECIMAL(65,30),
    "weight" DECIMAL(65,30),
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_kpi_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" SERIAL NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_hoc_evaluations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "evaluation_target" TEXT,
    "department_id" INTEGER,
    "created_by" INTEGER,
    "enable_self_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "enable_peer_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "enable_upward_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "enable_downward_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "due_date" TIMESTAMP(3),
    "cancel_if_not_processed" BOOLEAN NOT NULL DEFAULT false,
    "process_anonymously" BOOLEAN NOT NULL DEFAULT false,
    "hide_from_dashboard" BOOLEAN NOT NULL DEFAULT false,
    "require_all_kpis" BOOLEAN NOT NULL DEFAULT false,
    "exclude_from_score" BOOLEAN NOT NULL DEFAULT false,
    "require_evaluator_signature" BOOLEAN NOT NULL DEFAULT false,
    "require_evaluatee_signature" BOOLEAN NOT NULL DEFAULT false,
    "send_signature_to_evaluatee" BOOLEAN NOT NULL DEFAULT false,
    "send_signature_to_managers" BOOLEAN NOT NULL DEFAULT false,
    "send_signature_to_downward_evaluators" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_hoc_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_assignments" (
    "id" SERIAL NOT NULL,
    "ad_hoc_evaluation_id" INTEGER,
    "evaluator_id" INTEGER NOT NULL,
    "evaluatee_id" INTEGER NOT NULL,
    "evaluation_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responses" TEXT,
    "evidence_urls" TEXT[],
    "evaluator_comments" TEXT,
    "submitted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_result_areas" (
    "id" SERIAL NOT NULL,
    "ad_hoc_evaluation_id" INTEGER,
    "kpi_id" INTEGER,
    "evaluator_type" TEXT,
    "weight" DECIMAL(65,30),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_result_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_teams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department_id" INTEGER,
    "created_by" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_team_members" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_templates" (
    "id" SERIAL NOT NULL,
    "template_name" TEXT NOT NULL,
    "description" TEXT,
    "template_type" TEXT,
    "questions" TEXT,
    "created_by" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_kpi_links" (
    "id" SERIAL NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "kpi_id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_kpi_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "continuous_feedback" (
    "id" SERIAL NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "giver_id" INTEGER,
    "feedback_type" TEXT,
    "category" TEXT,
    "message" TEXT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "continuous_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_recommendations" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "recommended_by" INTEGER,
    "recommendation_type" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT,
    "target_completion_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress_notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "development_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_action_items" (
    "id" SERIAL NOT NULL,
    "evaluation_id" INTEGER,
    "employee_id" INTEGER NOT NULL,
    "action_item" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assigned_by" INTEGER,
    "completed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "job_name" TEXT NOT NULL,
    "job_code" TEXT,
    "client_id" INTEGER,
    "partner_id" INTEGER,
    "manager_id" INTEGER,
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "completion_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "assigned_to" INTEGER,
    "department_id" INTEGER,
    "estimated_hours" DECIMAL(65,30),
    "actual_hours" DECIMAL(65,30),
    "billable_hours" DECIMAL(65,30),
    "billing_type" TEXT NOT NULL DEFAULT 'hourly',
    "budgeted_hours" DECIMAL(65,30),
    "fixed_fee_amount" DECIMAL(65,30) DEFAULT 0,
    "amount_collected" DECIMAL(65,30) DEFAULT 0,
    "fees" DECIMAL(65,30) DEFAULT 0,
    "partner_notes" TEXT,
    "completion_percentage" INTEGER NOT NULL DEFAULT 0,
    "budget" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "assigned_to" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimated_hours" DECIMAL(65,30),
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "due_date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "task_id" INTEGER,
    "employee_id" INTEGER NOT NULL,
    "date_worked" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "hours" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "billable_amount" DECIMAL(65,30) DEFAULT 0,
    "cost" DECIMAL(65,30) DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_records" (
    "id" SERIAL NOT NULL,
    "record_type" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "transaction_date" TIMESTAMP(3),
    "project_id" INTEGER,
    "employee_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_staff_assignments" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "assigned_role_id" INTEGER NOT NULL,
    "assigned_hourly_rate" DECIMAL(65,30) NOT NULL,
    "role_snapshot" JSONB,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_profitability" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "total_revenue" DECIMAL(65,30),
    "total_cost" DECIMAL(65,30),
    "profit" DECIMAL(65,30),
    "profit_margin" DECIMAL(65,30),
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_profitability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "departments_department_code_key" ON "departments"("department_code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "roles_name_idx" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_is_partner_idx" ON "profiles"("is_partner");

-- CreateIndex
CREATE UNIQUE INDEX "partner_companies_company_name_key" ON "partner_companies"("company_name");

-- CreateIndex
CREATE UNIQUE INDEX "partners_profile_id_key" ON "partners"("profile_id");

-- CreateIndex
CREATE INDEX "partners_profile_id_idx" ON "partners"("profile_id");

-- CreateIndex
CREATE INDEX "partners_company_id_idx" ON "partners"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "clients_client_code_key" ON "clients"("client_code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

-- CreateIndex
CREATE INDEX "training_records_employee_id_idx" ON "training_records"("employee_id");

-- CreateIndex
CREATE INDEX "training_records_completed_at_idx" ON "training_records"("completed_at");

-- CreateIndex
CREATE INDEX "knowledge_sessions_presenter_id_idx" ON "knowledge_sessions"("presenter_id");

-- CreateIndex
CREATE INDEX "knowledge_sessions_session_date_idx" ON "knowledge_sessions"("session_date");

-- CreateIndex
CREATE INDEX "quality_reviews_employee_id_idx" ON "quality_reviews"("employee_id");

-- CreateIndex
CREATE INDEX "quality_reviews_reviewer_id_idx" ON "quality_reviews"("reviewer_id");

-- CreateIndex
CREATE INDEX "quality_reviews_review_date_idx" ON "quality_reviews"("review_date");

-- CreateIndex
CREATE UNIQUE INDEX "quality_reviews_job_id_employee_id_key" ON "quality_reviews"("job_id", "employee_id");

-- CreateIndex
CREATE INDEX "improvement_ideas_submitted_by_idx" ON "improvement_ideas"("submitted_by");

-- CreateIndex
CREATE INDEX "improvement_ideas_status_idx" ON "improvement_ideas"("status");

-- CreateIndex
CREATE INDEX "improvement_ideas_submitted_at_idx" ON "improvement_ideas"("submitted_at");

-- CreateIndex
CREATE INDEX "employee_kpi_scores_employee_id_idx" ON "employee_kpi_scores"("employee_id");

-- CreateIndex
CREATE INDEX "employee_kpi_scores_evaluation_cycle_id_idx" ON "employee_kpi_scores"("evaluation_cycle_id");

-- CreateIndex
CREATE INDEX "employee_kpi_scores_kpi_category_idx" ON "employee_kpi_scores"("kpi_category");

-- CreateIndex
CREATE INDEX "employee_kpi_scores_calculation_period_start_idx" ON "employee_kpi_scores"("calculation_period_start");

-- CreateIndex
CREATE UNIQUE INDEX "employee_kpi_scores_employee_id_evaluation_cycle_id_kpi_nam_key" ON "employee_kpi_scores"("employee_id", "evaluation_cycle_id", "kpi_name");

-- CreateIndex
CREATE UNIQUE INDEX "client_evaluations_access_token_key" ON "client_evaluations"("access_token");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_config_key_key" ON "system_config"("config_key");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_job_code_key" ON "jobs"("job_code");

-- CreateIndex
CREATE INDEX "jobs_partner_id_idx" ON "jobs"("partner_id");

-- CreateIndex
CREATE INDEX "jobs_manager_id_idx" ON "jobs"("manager_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_partner_id_status_idx" ON "jobs"("partner_id", "status");

-- CreateIndex
CREATE INDEX "tasks_job_id_idx" ON "tasks"("job_id");

-- CreateIndex
CREATE INDEX "tasks_assigned_to_idx" ON "tasks"("assigned_to");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "time_entries_job_id_idx" ON "time_entries"("job_id");

-- CreateIndex
CREATE INDEX "time_entries_employee_id_idx" ON "time_entries"("employee_id");

-- CreateIndex
CREATE INDEX "time_entries_date_worked_idx" ON "time_entries"("date_worked");

-- CreateIndex
CREATE INDEX "time_entries_status_idx" ON "time_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "job_staff_assignments_job_id_employee_id_key" ON "job_staff_assignments"("job_id", "employee_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "partner_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sessions" ADD CONSTRAINT "knowledge_sessions_presenter_id_fkey" FOREIGN KEY ("presenter_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_reviews" ADD CONSTRAINT "quality_reviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_reviews" ADD CONSTRAINT "quality_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_reviews" ADD CONSTRAINT "quality_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_ideas" ADD CONSTRAINT "improvement_ideas_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_ideas" ADD CONSTRAINT "improvement_ideas_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_scores" ADD CONSTRAINT "employee_kpi_scores_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_scores" ADD CONSTRAINT "employee_kpi_scores_evaluation_cycle_id_fkey" FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_evaluations" ADD CONSTRAINT "client_evaluations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_evaluations" ADD CONSTRAINT "client_evaluations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_evaluations" ADD CONSTRAINT "client_evaluations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_financials" ADD CONSTRAINT "project_financials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_project_allocations" ADD CONSTRAINT "employee_project_allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_project_allocations" ADD CONSTRAINT "employee_project_allocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluations" ADD CONSTRAINT "employee_evaluations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_evaluations" ADD CONSTRAINT "employee_evaluations_evaluation_cycle_id_fkey" FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_evaluations" ADD CONSTRAINT "peer_evaluations_evaluation_cycle_id_fkey" FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upward_evaluations" ADD CONSTRAINT "upward_evaluations_evaluation_cycle_id_fkey" FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_goals" ADD CONSTRAINT "employee_goals_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_goals" ADD CONSTRAINT "employee_goals_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_assignments" ADD CONSTRAINT "employee_kpi_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_assignments" ADD CONSTRAINT "employee_kpi_assignments_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_hoc_evaluations" ADD CONSTRAINT "ad_hoc_evaluations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_assignments" ADD CONSTRAINT "evaluation_assignments_ad_hoc_evaluation_id_fkey" FOREIGN KEY ("ad_hoc_evaluation_id") REFERENCES "ad_hoc_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_result_areas" ADD CONSTRAINT "evaluation_result_areas_ad_hoc_evaluation_id_fkey" FOREIGN KEY ("ad_hoc_evaluation_id") REFERENCES "ad_hoc_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_result_areas" ADD CONSTRAINT "evaluation_result_areas_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_teams" ADD CONSTRAINT "evaluation_teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_team_members" ADD CONSTRAINT "evaluation_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "evaluation_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "continuous_feedback" ADD CONSTRAINT "continuous_feedback_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_recommendations" ADD CONSTRAINT "development_recommendations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_action_items" ADD CONSTRAINT "evaluation_action_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_staff_assignments" ADD CONSTRAINT "job_staff_assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_staff_assignments" ADD CONSTRAINT "job_staff_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_staff_assignments" ADD CONSTRAINT "job_staff_assignments_assigned_role_id_fkey" FOREIGN KEY ("assigned_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_profitability" ADD CONSTRAINT "job_profitability_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
