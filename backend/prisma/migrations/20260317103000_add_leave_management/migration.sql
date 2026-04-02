CREATE TYPE "LeaveUnitType" AS ENUM ('day', 'hour');
CREATE TYPE "LeaveDayPortion" AS ENUM ('full_day', 'half_day_am', 'half_day_pm');
CREATE TYPE "LeaveAccrualFrequency" AS ENUM ('monthly', 'quarterly', 'annually', 'manual');
CREATE TYPE "LeaveRequestStatus" AS ENUM (
  'pending_manager_approval',
  'pending_hr_approval',
  'approved',
  'declined',
  'cancelled'
);
CREATE TYPE "LeaveApprovalDecision" AS ENUM ('pending', 'approved', 'declined', 'skipped');
CREATE TYPE "LeaveApprovalStageType" AS ENUM ('manager', 'hr', 'admin', 'custom');
CREATE TYPE "LeaveBalanceTransactionType" AS ENUM (
  'opening_balance',
  'accrual',
  'carryover',
  'adjustment',
  'deduction',
  'reversal',
  'expiry'
);
CREATE TYPE "LeavePolicyAssignmentScope" AS ENUM ('global', 'department', 'role', 'employee');

CREATE TABLE "leave_types" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_paid" BOOLEAN NOT NULL DEFAULT true,
  "balance_tracked" BOOLEAN NOT NULL DEFAULT true,
  "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
  "allows_half_day" BOOLEAN NOT NULL DEFAULT true,
  "unit_type" "LeaveUnitType" NOT NULL DEFAULT 'day',
  "default_notice_days" INTEGER NOT NULL DEFAULT 0,
  "default_max_units" NUMERIC(8, 2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");
CREATE INDEX "leave_types_is_active_idx" ON "leave_types"("is_active");

CREATE TABLE "leave_policies" (
  "id" SERIAL NOT NULL,
  "leave_type_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMP(3),
  "effective_to" TIMESTAMP(3),
  "annual_entitlement" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "carryover_cap" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "accrual_enabled" BOOLEAN NOT NULL DEFAULT true,
  "accrual_frequency" "LeaveAccrualFrequency" NOT NULL DEFAULT 'monthly',
  "accrual_rate" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "requires_manager_approval" BOOLEAN NOT NULL DEFAULT true,
  "requires_hr_approval" BOOLEAN NOT NULL DEFAULT false,
  "exclude_weekends" BOOLEAN NOT NULL DEFAULT true,
  "exclude_public_holidays" BOOLEAN NOT NULL DEFAULT true,
  "min_notice_days" INTEGER NOT NULL DEFAULT 0,
  "max_consecutive_units" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "max_units_per_request" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "allow_negative_balance" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_policies_leave_type_id_fkey"
    FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "leave_policies_leave_type_id_is_active_idx"
  ON "leave_policies"("leave_type_id", "is_active");

CREATE TABLE "leave_policy_assignments" (
  "id" SERIAL NOT NULL,
  "policy_id" INTEGER NOT NULL,
  "scope" "LeavePolicyAssignmentScope" NOT NULL DEFAULT 'global',
  "department_id" INTEGER,
  "role_id" INTEGER,
  "profile_id" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_policy_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_policy_assignments_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "leave_policies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_policy_assignments_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_policy_assignments_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "position_roles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_policy_assignments_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "leave_policy_assignments_policy_id_scope_priority_idx"
  ON "leave_policy_assignments"("policy_id", "scope", "priority");
CREATE INDEX "leave_policy_assignments_department_id_idx"
  ON "leave_policy_assignments"("department_id");
CREATE INDEX "leave_policy_assignments_role_id_idx"
  ON "leave_policy_assignments"("role_id");
CREATE INDEX "leave_policy_assignments_profile_id_idx"
  ON "leave_policy_assignments"("profile_id");

CREATE TABLE "public_holidays" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "holiday_date" TIMESTAMP(3) NOT NULL,
  "country_code" TEXT NOT NULL DEFAULT 'KE',
  "region" TEXT,
  "is_recurring" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "public_holidays_holiday_date_country_code_idx"
  ON "public_holidays"("holiday_date", "country_code");

CREATE TABLE "leave_delegations" (
  "id" SERIAL NOT NULL,
  "approver_profile_id" INTEGER NOT NULL,
  "delegate_profile_id" INTEGER NOT NULL,
  "created_by_profile_id" INTEGER,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_delegations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_delegations_approver_profile_id_fkey"
    FOREIGN KEY ("approver_profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_delegations_delegate_profile_id_fkey"
    FOREIGN KEY ("delegate_profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_delegations_created_by_profile_id_fkey"
    FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "leave_delegations_approver_profile_id_is_active_idx"
  ON "leave_delegations"("approver_profile_id", "is_active");
CREATE INDEX "leave_delegations_delegate_profile_id_is_active_idx"
  ON "leave_delegations"("delegate_profile_id", "is_active");

CREATE TABLE "leave_requests" (
  "id" SERIAL NOT NULL,
  "employee_profile_id" INTEGER NOT NULL,
  "leave_type_id" INTEGER NOT NULL,
  "policy_id" INTEGER,
  "current_approver_profile_id" INTEGER,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "start_day_portion" "LeaveDayPortion" NOT NULL DEFAULT 'full_day',
  "end_day_portion" "LeaveDayPortion" NOT NULL DEFAULT 'full_day',
  "requested_units" NUMERIC(8, 2) NOT NULL,
  "deducted_units" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending_manager_approval',
  "reason" TEXT,
  "decline_reason" TEXT,
  "cancellation_reason" TEXT,
  "validation_snapshot" JSONB,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "declined_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_requests_employee_profile_id_fkey"
    FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_requests_leave_type_id_fkey"
    FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "leave_requests_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "leave_policies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "leave_requests_current_approver_profile_id_fkey"
    FOREIGN KEY ("current_approver_profile_id") REFERENCES "profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "leave_requests_employee_profile_id_status_idx"
  ON "leave_requests"("employee_profile_id", "status");
CREATE INDEX "leave_requests_leave_type_id_idx"
  ON "leave_requests"("leave_type_id");
CREATE INDEX "leave_requests_policy_id_idx"
  ON "leave_requests"("policy_id");
CREATE INDEX "leave_requests_current_approver_profile_id_status_idx"
  ON "leave_requests"("current_approver_profile_id", "status");
CREATE INDEX "leave_requests_start_date_end_date_idx"
  ON "leave_requests"("start_date", "end_date");

CREATE TABLE "leave_approval_steps" (
  "id" SERIAL NOT NULL,
  "leave_request_id" INTEGER NOT NULL,
  "step_number" INTEGER NOT NULL,
  "stage_type" "LeaveApprovalStageType" NOT NULL,
  "approver_profile_id" INTEGER NOT NULL,
  "delegated_from_profile_id" INTEGER,
  "decision" "LeaveApprovalDecision" NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "acted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_approval_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_approval_steps_leave_request_id_fkey"
    FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_approval_steps_approver_profile_id_fkey"
    FOREIGN KEY ("approver_profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_approval_steps_delegated_from_profile_id_fkey"
    FOREIGN KEY ("delegated_from_profile_id") REFERENCES "profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "leave_approval_steps_leave_request_id_step_number_key"
  ON "leave_approval_steps"("leave_request_id", "step_number");
CREATE INDEX "leave_approval_steps_approver_profile_id_decision_idx"
  ON "leave_approval_steps"("approver_profile_id", "decision");
CREATE INDEX "leave_approval_steps_leave_request_id_decision_idx"
  ON "leave_approval_steps"("leave_request_id", "decision");

CREATE TABLE "leave_balances" (
  "id" SERIAL NOT NULL,
  "employee_profile_id" INTEGER NOT NULL,
  "leave_type_id" INTEGER NOT NULL,
  "leave_year" INTEGER NOT NULL,
  "opening_balance" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "accrued_units" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "carried_over_units" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "adjusted_units" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "used_units" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "pending_units" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "available_units" NUMERIC(8, 2) NOT NULL DEFAULT 0,
  "last_calculated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_balances_employee_profile_id_fkey"
    FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_balances_leave_type_id_fkey"
    FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "leave_balances_employee_profile_id_leave_type_id_leave_year_key"
  ON "leave_balances"("employee_profile_id", "leave_type_id", "leave_year");
CREATE INDEX "leave_balances_leave_type_id_leave_year_idx"
  ON "leave_balances"("leave_type_id", "leave_year");

CREATE TABLE "leave_ledger_entries" (
  "id" SERIAL NOT NULL,
  "leave_balance_id" INTEGER,
  "employee_profile_id" INTEGER NOT NULL,
  "leave_type_id" INTEGER NOT NULL,
  "leave_request_id" INTEGER,
  "created_by_profile_id" INTEGER,
  "leave_year" INTEGER NOT NULL,
  "transaction_type" "LeaveBalanceTransactionType" NOT NULL,
  "units" NUMERIC(8, 2) NOT NULL,
  "note" TEXT,
  "effective_date" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_ledger_entries_leave_balance_id_fkey"
    FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balances"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "leave_ledger_entries_employee_profile_id_fkey"
    FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_ledger_entries_leave_type_id_fkey"
    FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_ledger_entries_leave_request_id_fkey"
    FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "leave_ledger_entries_created_by_profile_id_fkey"
    FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "leave_ledger_entries_employee_profile_id_leave_type_id_leave_year_effective_date_idx"
  ON "leave_ledger_entries"("employee_profile_id", "leave_type_id", "leave_year", "effective_date");
CREATE INDEX "leave_ledger_entries_leave_request_id_idx"
  ON "leave_ledger_entries"("leave_request_id");
