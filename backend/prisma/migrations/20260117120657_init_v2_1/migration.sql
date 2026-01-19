-- CreateEnum
CREATE TYPE "EmployeeKpiAssignmentStatus" AS ENUM ('active', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "BackgroundCheckStatus" AS ENUM ('pending', 'cleared', 'flagged', 'failed');

-- CreateEnum
CREATE TYPE "TimeEntryApprovalRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "RevenueProjectionStatus" AS ENUM ('projected', 'revised', 'actualized', 'cancelled');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'inactive', 'separated');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "RecruitmentStage" AS ENUM ('applied', 'shortlisted', 'interviewed', 'offered', 'accepted', 'rejected', 'hired');

-- CreateEnum
CREATE TYPE "DocumentAccessLevel" AS ENUM ('employee', 'manager', 'hr', 'admin');

-- CreateEnum
CREATE TYPE "DocumentVerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ClientOnboardingStatus" AS ENUM ('pending_hr_review', 'approved', 'rejected', 'client_created', 'job_created');

-- CreateEnum
CREATE TYPE "EngagementLetterStatus" AS ENUM ('uploaded', 'pending_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('planned', 'in_progress', 'on_hold', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('hourly', 'fixed_fee');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'in_progress', 'blocked', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('pending', 'submitted', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "OverBudgetRequestStatus" AS ENUM ('pending', 'manager_approved', 'manager_rejected', 'partner_approved', 'partner_rejected', 'auto_rejected');

-- CreateEnum
CREATE TYPE "BillableType" AS ENUM ('billable', 'non_billable', 'loss');

-- CreateEnum
CREATE TYPE "EvaluatorType" AS ENUM ('self', 'manager', 'peer', 'direct_report', 'client', 'custom');

-- CreateEnum
CREATE TYPE "EvaluationDefinitionStatus" AS ENUM ('draft', 'published', 'closed');

-- CreateEnum
CREATE TYPE "EvaluationAssignmentStatus" AS ENUM ('pending', 'in_progress', 'submitted', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('info', 'action', 'warning', 'escalation');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('revenue', 'profit', 'utilization', 'client_satisfaction', 'pipeline_value', 'jobs_completed');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'sent', 'won', 'lost');

-- CreateEnum
CREATE TYPE "WorkflowTriggerType" AS ENUM ('client_onboarding_submitted', 'engagement_letter_uploaded', 'job_created', 'costing_submitted', 'budget_exceeded', 'time_entry_submitted', 'evaluation_due', 'job_overdue');

-- CreateEnum
CREATE TYPE "WorkflowAssignmentStatus" AS ENUM ('pending', 'in_progress', 'completed', 'cancelled', 'escalated');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "JobCostingStatus" AS ENUM ('draft', 'submitted', 'partner_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "EvaluationCycleStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "DashboardStatus" AS ENUM ('on_track', 'at_risk', 'off_track');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLogin" TIMESTAMP(3),
    "resetToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "auth_roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_auth_roles" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "user_auth_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "auth_role_permissions" (
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "auth_role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "ip_address" TEXT,
    "metadata" JSONB,
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
CREATE TABLE "position_roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billing_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cost_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_access" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT,
    "profile_picture" TEXT,
    "employee_id" TEXT,
    "kra_pin" TEXT,
    "nssf_number" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "position_title" TEXT,
    "departmentId" INTEGER,
    "role_id" INTEGER,
    "hire_date" TIMESTAMP(3),
    "separation_date" TIMESTAMP(3),
    "manager_id" INTEGER,
    "is_partner" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'pending',
    "onboarding_checklist_completed" BOOLEAN NOT NULL DEFAULT false,
    "induction_completed" BOOLEAN NOT NULL DEFAULT false,
    "background_check_required" BOOLEAN NOT NULL DEFAULT true,
    "background_check_status" "BackgroundCheckStatus",
    "background_check_date" TIMESTAMP(3),
    "financial_target" DECIMAL(14,2),
    "utilization_target" DECIMAL(5,2) NOT NULL DEFAULT 0.75,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_candidates" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone_number" TEXT,
    "position_applied" TEXT NOT NULL,
    "department_id" INTEGER,
    "stage" "RecruitmentStage" NOT NULL DEFAULT 'applied',
    "notes" TEXT,
    "created_by_profile_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "offer_letter_document_id" INTEGER,

    CONSTRAINT "recruitment_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_onboarding_cases" (
    "id" SERIAL NOT NULL,
    "candidate_id" INTEGER,
    "profile_id" INTEGER,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'pending',
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "hr_owner_profile_id" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_onboarding_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "induction_checklists" (
    "id" SERIAL NOT NULL,
    "onboarding_case_id" INTEGER,
    "employee_profile_id" INTEGER NOT NULL,
    "checklist_name" TEXT NOT NULL DEFAULT 'Standard Employee Induction',
    "status" "ChecklistStatus" NOT NULL DEFAULT 'pending',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "completed_items" INTEGER NOT NULL DEFAULT 0,
    "completion_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "assigned_by_profile_id" INTEGER,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "induction_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "induction_checklist_items" (
    "id" SERIAL NOT NULL,
    "checklist_id" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_by_profile_id" INTEGER,
    "completed_at" TIMESTAMP(3),
    "requires_document" BOOLEAN NOT NULL DEFAULT false,
    "document_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "induction_checklist_items_pkey" PRIMARY KEY ("id")
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
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "performance_threshold" DECIMAL(6,2) NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "document_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER,
    "access_level" "DocumentAccessLevel" NOT NULL DEFAULT 'admin',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" "DocumentVerificationStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "uploaded_by" INTEGER,
    "verified_by" INTEGER,
    "verified_at" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_onboardings" (
    "id" SERIAL NOT NULL,
    "client_name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "uploaded_by_profile_id" INTEGER NOT NULL,
    "hr_reviewer_profile_id" INTEGER,
    "engagement_letter_id" INTEGER NOT NULL,
    "status" "ClientOnboardingStatus" NOT NULL DEFAULT 'pending_hr_review',
    "department_id" INTEGER,
    "client_id" INTEGER,
    "job_id" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_onboardings_pkey" PRIMARY KEY ("id")
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
    "location" TEXT,
    "department_id" INTEGER,
    "partner_profile_id" INTEGER,
    "manager_profile_id" INTEGER,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_letters" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "document_id" INTEGER,
    "job_title" TEXT,
    "engagement_type" TEXT NOT NULL,
    "fee_amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "scope_description" TEXT,
    "terms_conditions" TEXT,
    "uploaded_by_profile_id" INTEGER,
    "approved_by_profile_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "EngagementLetterStatus" NOT NULL DEFAULT 'uploaded',

    CONSTRAINT "engagement_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "job_name" TEXT NOT NULL,
    "job_code" TEXT,
    "description" TEXT,
    "client_id" INTEGER,
    "department_id" INTEGER,
    "partner_profile_id" INTEGER,
    "manager_profile_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "completion_date" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'planned',
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "billing_type" "BillingType" NOT NULL DEFAULT 'hourly',
    "fixed_fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "budget_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "engagement_letter_id" INTEGER,
    "costing_completed" BOOLEAN NOT NULL DEFAULT false,
    "team_assigned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigned_to_profile_id" INTEGER,
    "estimated_hours" DECIMAL(10,2),
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "due_date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_staff_assignments" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "assigned_role_id" INTEGER NOT NULL,
    "assigned_hourly_rate" DECIMAL(12,2) NOT NULL,
    "role_snapshot" JSONB,
    "role_on_job" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_profile_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_costings" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "manager_profile_id" INTEGER NOT NULL,
    "job_fee" DECIMAL(14,2) NOT NULL,
    "allocated_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profit_loss_indicator" TEXT,
    "warning_threshold" DECIMAL(5,2) NOT NULL DEFAULT 0.90,
    "total_estimated_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_estimated_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costing_status" "JobCostingStatus" NOT NULL DEFAULT 'draft',
    "approved_by_partner_profile_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_costings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_time_allocations" (
    "id" SERIAL NOT NULL,
    "job_costing_id" INTEGER NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "allocated_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "hourly_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimated_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "task_description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_time_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_caps" (
    "id" SERIAL NOT NULL,
    "job_costing_id" INTEGER NOT NULL,
    "total_allocated_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cap_enforced" BOOLEAN NOT NULL DEFAULT true,
    "allow_overage" BOOLEAN NOT NULL DEFAULT false,
    "max_overage_percent" DECIMAL(5,2) NOT NULL DEFAULT 0.20,
    "auto_lock_on_exceed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_caps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "task_id" INTEGER,
    "employee_profile_id" INTEGER NOT NULL,
    "date_worked" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'submitted',
    "approved_by_profile_id" INTEGER,
    "approved_at" TIMESTAMP(3),
    "billable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profit_loss" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entry_approval_requests" (
    "id" SERIAL NOT NULL,
    "time_entry_id" INTEGER,
    "job_id" INTEGER NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "current_allocated_hours" DECIMAL(10,2) NOT NULL,
    "current_logged_hours" DECIMAL(10,2) NOT NULL,
    "additional_hours_requested" DECIMAL(10,2) NOT NULL,
    "justification" TEXT NOT NULL,
    "request_type" TEXT NOT NULL,
    "status" "TimeEntryApprovalRequestStatus" NOT NULL DEFAULT 'pending',
    "approved_by_profile_id" INTEGER,
    "approval_notes" TEXT,
    "approved_at" TIMESTAMP(3),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entry_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_over_budget_requests" (
    "id" SERIAL NOT NULL,
    "time_entry_id" INTEGER NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "allocated_hours" DECIMAL(10,2) NOT NULL,
    "logged_hours" DECIMAL(10,2) NOT NULL,
    "requested_additional" DECIMAL(10,2) NOT NULL,
    "total_after_request" DECIMAL(10,2) NOT NULL,
    "billable_type" "BillableType" NOT NULL DEFAULT 'billable',
    "requires_partner_approval" BOOLEAN NOT NULL DEFAULT false,
    "manager_approved" BOOLEAN NOT NULL DEFAULT false,
    "partner_approved" BOOLEAN NOT NULL DEFAULT false,
    "status" "OverBudgetRequestStatus" NOT NULL DEFAULT 'pending',
    "auto_rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" TEXT,
    "approval_notes" TEXT,
    "estimated_cost_impact" DECIMAL(14,2),
    "would_exceed_budget" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_over_budget_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_payments" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "invoice_number" TEXT,
    "payment_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT,
    "reference_number" TEXT,
    "notes" TEXT,
    "recorded_by_profile_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_allocations" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "client_payment_id" INTEGER NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "employee_billable" DECIMAL(14,2) NOT NULL,
    "employee_profit" DECIMAL(14,2) NOT NULL,
    "employee_loss" DECIMAL(14,2) NOT NULL,
    "total_job_billable" DECIMAL(14,2) NOT NULL,
    "allocation_percentage" DECIMAL(7,4) NOT NULL,
    "allocated_amount" DECIMAL(14,2) NOT NULL,
    "allocation_month" TIMESTAMP(3) NOT NULL,
    "is_finalized" BOOLEAN NOT NULL DEFAULT false,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_satisfaction_surveys" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "survey_token" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "quality_rating" INTEGER,
    "communication_rating" INTEGER,
    "timeliness_rating" INTEGER,
    "professionalism_rating" INTEGER,
    "value_for_money_rating" INTEGER,
    "overall_satisfaction" INTEGER,
    "would_recommend" BOOLEAN,
    "improvement_suggestions" TEXT,
    "additional_comments" TEXT,
    "completed_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_satisfaction_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "proposal_title" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "proposed_fee" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "proposal_date" TIMESTAMP(3) NOT NULL,
    "expected_start" TIMESTAMP(3),
    "expected_duration_days" INTEGER,
    "status" "ProposalStatus" NOT NULL DEFAULT 'sent',
    "probability" INTEGER NOT NULL DEFAULT 50,
    "created_by_profile_id" INTEGER,
    "assigned_partner_profile_id" INTEGER,
    "won_at" TIMESTAMP(3),
    "lost_reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_projections" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER,
    "department_id" INTEGER,
    "month_year" TIMESTAMP(3) NOT NULL,
    "projected_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "actual_collected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "variance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "variance_percent" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "status" "RevenueProjectionStatus" NOT NULL DEFAULT 'projected',
    "created_by_profile_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_projections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpis" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "kpi_type" TEXT NOT NULL,
    "measurement_unit" TEXT,
    "currency" TEXT DEFAULT 'KES',
    "target_value" DECIMAL(14,2),
    "target_frequency" TEXT,
    "target_description" TEXT,
    "weight" DECIMAL(5,2),
    "department_id" INTEGER,
    "role_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_kpi_assignments" (
    "id" SERIAL NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "kpi_id" INTEGER NOT NULL,
    "target_value" DECIMAL(14,2),
    "achieved_value" DECIMAL(14,2),
    "weight" DECIMAL(5,2),
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "status" "EmployeeKpiAssignmentStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_kpi_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_kpi_scores" (
    "id" SERIAL NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "kpi_id" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "calculated_value" DECIMAL(14,2) NOT NULL,
    "target_value" DECIMAL(14,2) NOT NULL,
    "achievement_percent" DECIMAL(7,2) NOT NULL,
    "weight_percent" DECIMAL(5,2) NOT NULL,
    "weighted_score" DECIMAL(7,2) NOT NULL,
    "notes" TEXT,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_kpi_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_cycles" (
    "id" SERIAL NOT NULL,
    "cycle_name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "EvaluationCycleStatus" NOT NULL DEFAULT 'draft',
    "created_by_profile_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_definitions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cycle_id" INTEGER,
    "department_id" INTEGER,
    "enable_self_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "enable_peer_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "enable_upward_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "enable_downward_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "enable_client_evaluation" BOOLEAN NOT NULL DEFAULT false,
    "due_date" TIMESTAMP(3),
    "process_anonymously" BOOLEAN NOT NULL DEFAULT false,
    "hide_from_dashboard" BOOLEAN NOT NULL DEFAULT false,
    "exclude_from_score" BOOLEAN NOT NULL DEFAULT false,
    "require_evaluator_signature" BOOLEAN NOT NULL DEFAULT false,
    "require_evaluatee_signature" BOOLEAN NOT NULL DEFAULT false,
    "status" "EvaluationDefinitionStatus" NOT NULL DEFAULT 'draft',
    "created_by_profile_id" INTEGER,
    "published_at" TIMESTAMP(3),
    "questions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "scoring_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_assignments" (
    "id" SERIAL NOT NULL,
    "evaluation_definition_id" INTEGER NOT NULL,
    "evaluator_profile_id" INTEGER NOT NULL,
    "evaluatee_profile_id" INTEGER NOT NULL,
    "evaluator_type" "EvaluatorType" NOT NULL DEFAULT 'manager',
    "status" "EvaluationAssignmentStatus" NOT NULL DEFAULT 'pending',
    "responses" JSONB,
    "score" DECIMAL(7,2),
    "evidence_urls" TEXT[],
    "evaluator_comments" TEXT,
    "submitted_at" TIMESTAMP(3),
    "evaluator_signed" BOOLEAN NOT NULL DEFAULT false,
    "evaluator_signed_at" TIMESTAMP(3),
    "evaluatee_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "evaluatee_acknowledged_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_scores" (
    "id" SERIAL NOT NULL,
    "employee_profile_id" INTEGER NOT NULL,
    "evaluation_cycle_id" INTEGER,
    "period" TIMESTAMP(3) NOT NULL,
    "revenue_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "profit_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "utilization_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "financial_weighted" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "evaluation_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "kpi_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "client_rating_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "non_financial_weighted" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "total_score" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "grade" TEXT,
    "score_breakdown" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "notes" TEXT,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_metrics" (
    "id" SERIAL NOT NULL,
    "metric_type" "MetricType" NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "department_id" INTEGER,
    "partner_profile_id" INTEGER,
    "job_id" INTEGER,
    "value" DECIMAL(14,2) NOT NULL,
    "target" DECIMAL(14,2),
    "variance" DECIMAL(14,2),
    "variance_percent" DECIMAL(7,2),
    "status" "DashboardStatus" NOT NULL DEFAULT 'on_track',
    "trend" TEXT,
    "context_data" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'info',
    "action_required" BOOLEAN NOT NULL DEFAULT false,
    "due_date" TIMESTAMP(3),
    "escalation_level" INTEGER NOT NULL DEFAULT 1,
    "job_id" INTEGER,
    "client_id" INTEGER,
    "evaluation_definition_id" INTEGER,
    "time_entry_id" INTEGER,
    "workflow_assignment_id" INTEGER,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_transitions" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "changed_by_profile_id" INTEGER,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_id" INTEGER,
    "job_id" INTEGER,
    "job_costing_id" INTEGER,
    "engagement_letter_id" INTEGER,

    CONSTRAINT "status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" "WorkflowTriggerType" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "actions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "escalation_rules" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "created_by_profile_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_assignments" (
    "id" SERIAL NOT NULL,
    "workflow_definition_id" INTEGER NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "assigned_to_profile_id" INTEGER NOT NULL,
    "status" "WorkflowAssignmentStatus" NOT NULL DEFAULT 'pending',
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "completed_steps" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step_events" (
    "id" SERIAL NOT NULL,
    "workflow_assignment_id" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "acted_by_profile_id" INTEGER,
    "acted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "workflow_step_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_resetToken_key" ON "users"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "auth_roles_name_key" ON "auth_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "departments_department_code_key" ON "departments"("department_code");

-- CreateIndex
CREATE INDEX "departments_department_head_id_idx" ON "departments"("department_head_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_roles_name_key" ON "position_roles"("name");

-- CreateIndex
CREATE INDEX "position_roles_name_idx" ON "position_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_employee_id_key" ON "profiles"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_kra_pin_key" ON "profiles"("kra_pin");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_nssf_number_key" ON "profiles"("nssf_number");

-- CreateIndex
CREATE INDEX "profiles_is_partner_idx" ON "profiles"("is_partner");

-- CreateIndex
CREATE INDEX "recruitment_candidates_stage_idx" ON "recruitment_candidates"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "employee_onboarding_cases_candidate_id_key" ON "employee_onboarding_cases"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_onboarding_cases_profile_id_key" ON "employee_onboarding_cases"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "induction_checklists_onboarding_case_id_key" ON "induction_checklists"("onboarding_case_id");

-- CreateIndex
CREATE INDEX "induction_checklists_employee_profile_id_idx" ON "induction_checklists"("employee_profile_id");

-- CreateIndex
CREATE INDEX "induction_checklist_items_checklist_id_idx" ON "induction_checklist_items"("checklist_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_companies_company_name_key" ON "partner_companies"("company_name");

-- CreateIndex
CREATE UNIQUE INDEX "partners_profile_id_key" ON "partners"("profile_id");

-- CreateIndex
CREATE INDEX "partners_company_id_idx" ON "partners"("company_id");

-- CreateIndex
CREATE INDEX "documents_entity_type_entity_id_idx" ON "documents"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "documents_document_type_idx" ON "documents"("document_type");

-- CreateIndex
CREATE UNIQUE INDEX "client_onboardings_client_id_key" ON "client_onboardings"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_onboardings_job_id_key" ON "client_onboardings"("job_id");

-- CreateIndex
CREATE INDEX "client_onboardings_status_idx" ON "client_onboardings"("status");

-- CreateIndex
CREATE INDEX "client_onboardings_uploaded_by_profile_id_idx" ON "client_onboardings"("uploaded_by_profile_id");

-- CreateIndex
CREATE INDEX "client_onboardings_hr_reviewer_profile_id_idx" ON "client_onboardings"("hr_reviewer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_client_code_key" ON "clients"("client_code");

-- CreateIndex
CREATE INDEX "clients_department_id_idx" ON "clients"("department_id");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "engagement_letters_client_id_idx" ON "engagement_letters"("client_id");

-- CreateIndex
CREATE INDEX "engagement_letters_status_idx" ON "engagement_letters"("status");

-- CreateIndex
CREATE INDEX "engagement_letters_uploaded_by_profile_id_idx" ON "engagement_letters"("uploaded_by_profile_id");

-- CreateIndex
CREATE INDEX "engagement_letters_approved_by_profile_id_idx" ON "engagement_letters"("approved_by_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_job_code_key" ON "jobs"("job_code");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_engagement_letter_id_key" ON "jobs"("engagement_letter_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_partner_profile_id_idx" ON "jobs"("partner_profile_id");

-- CreateIndex
CREATE INDEX "jobs_manager_profile_id_idx" ON "jobs"("manager_profile_id");

-- CreateIndex
CREATE INDEX "jobs_client_id_idx" ON "jobs"("client_id");

-- CreateIndex
CREATE INDEX "tasks_job_id_idx" ON "tasks"("job_id");

-- CreateIndex
CREATE INDEX "tasks_assigned_to_profile_id_idx" ON "tasks"("assigned_to_profile_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "job_staff_assignments_job_id_idx" ON "job_staff_assignments"("job_id");

-- CreateIndex
CREATE INDEX "job_staff_assignments_employee_profile_id_idx" ON "job_staff_assignments"("employee_profile_id");

-- CreateIndex
CREATE INDEX "job_staff_assignments_assigned_by_profile_id_idx" ON "job_staff_assignments"("assigned_by_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_staff_assignments_job_id_employee_profile_id_key" ON "job_staff_assignments"("job_id", "employee_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_costings_job_id_key" ON "job_costings"("job_id");

-- CreateIndex
CREATE INDEX "job_costings_manager_profile_id_idx" ON "job_costings"("manager_profile_id");

-- CreateIndex
CREATE INDEX "job_time_allocations_job_costing_id_idx" ON "job_time_allocations"("job_costing_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_time_allocations_job_costing_id_employee_profile_id_rol_key" ON "job_time_allocations"("job_costing_id", "employee_profile_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_caps_job_costing_id_key" ON "budget_caps"("job_costing_id");

-- CreateIndex
CREATE INDEX "time_entries_employee_profile_id_date_worked_idx" ON "time_entries"("employee_profile_id", "date_worked");

-- CreateIndex
CREATE INDEX "time_entries_employee_profile_id_job_id_date_worked_idx" ON "time_entries"("employee_profile_id", "job_id", "date_worked");

-- CreateIndex
CREATE INDEX "time_entries_job_id_date_worked_idx" ON "time_entries"("job_id", "date_worked");

-- CreateIndex
CREATE INDEX "time_entries_job_id_idx" ON "time_entries"("job_id");

-- CreateIndex
CREATE INDEX "time_entries_task_id_idx" ON "time_entries"("task_id");

-- CreateIndex
CREATE INDEX "time_entry_approval_requests_job_id_idx" ON "time_entry_approval_requests"("job_id");

-- CreateIndex
CREATE INDEX "time_entry_approval_requests_employee_profile_id_idx" ON "time_entry_approval_requests"("employee_profile_id");

-- CreateIndex
CREATE INDEX "time_entry_approval_requests_status_idx" ON "time_entry_approval_requests"("status");

-- CreateIndex
CREATE INDEX "time_entry_approval_requests_approved_by_profile_id_idx" ON "time_entry_approval_requests"("approved_by_profile_id");

-- CreateIndex
CREATE INDEX "time_over_budget_requests_job_id_idx" ON "time_over_budget_requests"("job_id");

-- CreateIndex
CREATE INDEX "time_over_budget_requests_employee_profile_id_idx" ON "time_over_budget_requests"("employee_profile_id");

-- CreateIndex
CREATE INDEX "time_over_budget_requests_status_idx" ON "time_over_budget_requests"("status");

-- CreateIndex
CREATE INDEX "client_payments_client_id_idx" ON "client_payments"("client_id");

-- CreateIndex
CREATE INDEX "client_payments_job_id_idx" ON "client_payments"("job_id");

-- CreateIndex
CREATE INDEX "client_payments_payment_date_idx" ON "client_payments"("payment_date");

-- CreateIndex
CREATE INDEX "revenue_allocations_allocation_month_idx" ON "revenue_allocations"("allocation_month");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_allocations_job_id_client_payment_id_employee_profi_key" ON "revenue_allocations"("job_id", "client_payment_id", "employee_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_satisfaction_surveys_survey_token_key" ON "client_satisfaction_surveys"("survey_token");

-- CreateIndex
CREATE INDEX "client_satisfaction_surveys_client_id_idx" ON "client_satisfaction_surveys"("client_id");

-- CreateIndex
CREATE INDEX "client_satisfaction_surveys_job_id_idx" ON "client_satisfaction_surveys"("job_id");

-- CreateIndex
CREATE INDEX "client_satisfaction_surveys_survey_token_idx" ON "client_satisfaction_surveys"("survey_token");

-- CreateIndex
CREATE INDEX "proposals_client_id_idx" ON "proposals"("client_id");

-- CreateIndex
CREATE INDEX "proposals_status_idx" ON "proposals"("status");

-- CreateIndex
CREATE INDEX "proposals_proposal_date_idx" ON "proposals"("proposal_date");

-- CreateIndex
CREATE INDEX "proposals_created_by_profile_id_idx" ON "proposals"("created_by_profile_id");

-- CreateIndex
CREATE INDEX "proposals_assigned_partner_profile_id_idx" ON "proposals"("assigned_partner_profile_id");

-- CreateIndex
CREATE INDEX "revenue_projections_month_year_idx" ON "revenue_projections"("month_year");

-- CreateIndex
CREATE INDEX "revenue_projections_created_by_profile_id_idx" ON "revenue_projections"("created_by_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_projections_client_id_department_id_month_year_key" ON "revenue_projections"("client_id", "department_id", "month_year");

-- CreateIndex
CREATE INDEX "kpis_category_idx" ON "kpis"("category");

-- CreateIndex
CREATE INDEX "kpis_kpi_type_idx" ON "kpis"("kpi_type");

-- CreateIndex
CREATE INDEX "employee_kpi_assignments_employee_profile_id_idx" ON "employee_kpi_assignments"("employee_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_kpi_assignments_employee_profile_id_kpi_id_period__key" ON "employee_kpi_assignments"("employee_profile_id", "kpi_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "employee_kpi_scores_employee_profile_id_idx" ON "employee_kpi_scores"("employee_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_kpi_scores_employee_profile_id_kpi_id_period_start_key" ON "employee_kpi_scores"("employee_profile_id", "kpi_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "evaluation_definitions_status_idx" ON "evaluation_definitions"("status");

-- CreateIndex
CREATE INDEX "evaluation_assignments_evaluatee_profile_id_status_idx" ON "evaluation_assignments"("evaluatee_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_assignments_evaluation_definition_id_evaluator_p_key" ON "evaluation_assignments"("evaluation_definition_id", "evaluator_profile_id", "evaluatee_profile_id", "evaluator_type");

-- CreateIndex
CREATE INDEX "performance_scores_employee_profile_id_idx" ON "performance_scores"("employee_profile_id");

-- CreateIndex
CREATE INDEX "performance_scores_period_idx" ON "performance_scores"("period");

-- CreateIndex
CREATE UNIQUE INDEX "performance_scores_employee_profile_id_evaluation_cycle_id__key" ON "performance_scores"("employee_profile_id", "evaluation_cycle_id", "period");

-- CreateIndex
CREATE INDEX "dashboard_metrics_metric_type_period_idx" ON "dashboard_metrics"("metric_type", "period");

-- CreateIndex
CREATE INDEX "dashboard_metrics_department_id_period_idx" ON "dashboard_metrics"("department_id", "period");

-- CreateIndex
CREATE INDEX "notifications_profile_id_is_read_idx" ON "notifications"("profile_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "status_transitions_engagement_letter_id_idx" ON "status_transitions"("engagement_letter_id");

-- CreateIndex
CREATE INDEX "status_transitions_entity_type_entity_id_idx" ON "status_transitions"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "status_transitions_createdAt_idx" ON "status_transitions"("createdAt");

-- CreateIndex
CREATE INDEX "workflow_definitions_trigger_type_is_active_idx" ON "workflow_definitions"("trigger_type", "is_active");

-- CreateIndex
CREATE INDEX "workflow_assignments_assigned_to_profile_id_status_idx" ON "workflow_assignments"("assigned_to_profile_id", "status");

-- CreateIndex
CREATE INDEX "workflow_assignments_entity_type_entity_id_idx" ON "workflow_assignments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "workflow_assignments_workflow_definition_id_idx" ON "workflow_assignments"("workflow_definition_id");

-- CreateIndex
CREATE INDEX "workflow_step_events_workflow_assignment_id_acted_at_idx" ON "workflow_step_events"("workflow_assignment_id", "acted_at");

-- CreateIndex
CREATE INDEX "workflow_step_events_acted_by_profile_id_idx" ON "workflow_step_events"("acted_by_profile_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_auth_roles" ADD CONSTRAINT "user_auth_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_auth_roles" ADD CONSTRAINT "user_auth_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "auth_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_role_permissions" ADD CONSTRAINT "auth_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "auth_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_role_permissions" ADD CONSTRAINT "auth_role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_department_head_id_fkey" FOREIGN KEY ("department_head_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "position_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_offer_letter_document_id_fkey" FOREIGN KEY ("offer_letter_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboarding_cases" ADD CONSTRAINT "employee_onboarding_cases_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "recruitment_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboarding_cases" ADD CONSTRAINT "employee_onboarding_cases_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboarding_cases" ADD CONSTRAINT "employee_onboarding_cases_hr_owner_profile_id_fkey" FOREIGN KEY ("hr_owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "induction_checklists" ADD CONSTRAINT "induction_checklists_onboarding_case_id_fkey" FOREIGN KEY ("onboarding_case_id") REFERENCES "employee_onboarding_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "induction_checklists" ADD CONSTRAINT "induction_checklists_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "induction_checklists" ADD CONSTRAINT "induction_checklists_assigned_by_profile_id_fkey" FOREIGN KEY ("assigned_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "induction_checklist_items" ADD CONSTRAINT "induction_checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "induction_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "induction_checklist_items" ADD CONSTRAINT "induction_checklist_items_completed_by_profile_id_fkey" FOREIGN KEY ("completed_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "induction_checklist_items" ADD CONSTRAINT "induction_checklist_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "partner_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_engagement_letter_id_fkey" FOREIGN KEY ("engagement_letter_id") REFERENCES "engagement_letters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_uploaded_by_profile_id_fkey" FOREIGN KEY ("uploaded_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_hr_reviewer_profile_id_fkey" FOREIGN KEY ("hr_reviewer_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_partner_profile_id_fkey" FOREIGN KEY ("partner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_letters" ADD CONSTRAINT "engagement_letters_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_letters" ADD CONSTRAINT "engagement_letters_uploaded_by_profile_id_fkey" FOREIGN KEY ("uploaded_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_letters" ADD CONSTRAINT "engagement_letters_approved_by_profile_id_fkey" FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_letters" ADD CONSTRAINT "engagement_letters_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_partner_profile_id_fkey" FOREIGN KEY ("partner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_engagement_letter_id_fkey" FOREIGN KEY ("engagement_letter_id") REFERENCES "engagement_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_profile_id_fkey" FOREIGN KEY ("assigned_to_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_staff_assignments" ADD CONSTRAINT "job_staff_assignments_assigned_by_profile_id_fkey" FOREIGN KEY ("assigned_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_staff_assignments" ADD CONSTRAINT "job_staff_assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_staff_assignments" ADD CONSTRAINT "job_staff_assignments_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_staff_assignments" ADD CONSTRAINT "job_staff_assignments_assigned_role_id_fkey" FOREIGN KEY ("assigned_role_id") REFERENCES "position_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_costings" ADD CONSTRAINT "job_costings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_costings" ADD CONSTRAINT "job_costings_manager_profile_id_fkey" FOREIGN KEY ("manager_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_time_allocations" ADD CONSTRAINT "job_time_allocations_job_costing_id_fkey" FOREIGN KEY ("job_costing_id") REFERENCES "job_costings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_time_allocations" ADD CONSTRAINT "job_time_allocations_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_time_allocations" ADD CONSTRAINT "job_time_allocations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "position_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_caps" ADD CONSTRAINT "budget_caps_job_costing_id_fkey" FOREIGN KEY ("job_costing_id") REFERENCES "job_costings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approved_by_profile_id_fkey" FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry_approval_requests" ADD CONSTRAINT "time_entry_approval_requests_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry_approval_requests" ADD CONSTRAINT "time_entry_approval_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry_approval_requests" ADD CONSTRAINT "time_entry_approval_requests_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entry_approval_requests" ADD CONSTRAINT "time_entry_approval_requests_approved_by_profile_id_fkey" FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_over_budget_requests" ADD CONSTRAINT "time_over_budget_requests_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_over_budget_requests" ADD CONSTRAINT "time_over_budget_requests_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_over_budget_requests" ADD CONSTRAINT "time_over_budget_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_client_payment_id_fkey" FOREIGN KEY ("client_payment_id") REFERENCES "client_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_satisfaction_surveys" ADD CONSTRAINT "client_satisfaction_surveys_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_satisfaction_surveys" ADD CONSTRAINT "client_satisfaction_surveys_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_assigned_partner_profile_id_fkey" FOREIGN KEY ("assigned_partner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_projections" ADD CONSTRAINT "revenue_projections_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_projections" ADD CONSTRAINT "revenue_projections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_projections" ADD CONSTRAINT "revenue_projections_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "position_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_assignments" ADD CONSTRAINT "employee_kpi_assignments_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_assignments" ADD CONSTRAINT "employee_kpi_assignments_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_scores" ADD CONSTRAINT "employee_kpi_scores_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_scores" ADD CONSTRAINT "employee_kpi_scores_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_definitions" ADD CONSTRAINT "evaluation_definitions_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_definitions" ADD CONSTRAINT "evaluation_definitions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_definitions" ADD CONSTRAINT "evaluation_definitions_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_assignments" ADD CONSTRAINT "evaluation_assignments_evaluation_definition_id_fkey" FOREIGN KEY ("evaluation_definition_id") REFERENCES "evaluation_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_assignments" ADD CONSTRAINT "evaluation_assignments_evaluator_profile_id_fkey" FOREIGN KEY ("evaluator_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_assignments" ADD CONSTRAINT "evaluation_assignments_evaluatee_profile_id_fkey" FOREIGN KEY ("evaluatee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_evaluation_cycle_id_fkey" FOREIGN KEY ("evaluation_cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_metrics" ADD CONSTRAINT "dashboard_metrics_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_metrics" ADD CONSTRAINT "dashboard_metrics_partner_profile_id_fkey" FOREIGN KEY ("partner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_metrics" ADD CONSTRAINT "dashboard_metrics_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_changed_by_profile_id_fkey" FOREIGN KEY ("changed_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_job_costing_id_fkey" FOREIGN KEY ("job_costing_id") REFERENCES "job_costings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_engagement_letter_id_fkey" FOREIGN KEY ("engagement_letter_id") REFERENCES "engagement_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_assignments" ADD CONSTRAINT "workflow_assignments_workflow_definition_id_fkey" FOREIGN KEY ("workflow_definition_id") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_assignments" ADD CONSTRAINT "workflow_assignments_assigned_to_profile_id_fkey" FOREIGN KEY ("assigned_to_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step_events" ADD CONSTRAINT "workflow_step_events_workflow_assignment_id_fkey" FOREIGN KEY ("workflow_assignment_id") REFERENCES "workflow_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step_events" ADD CONSTRAINT "workflow_step_events_acted_by_profile_id_fkey" FOREIGN KEY ("acted_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
