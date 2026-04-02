DO $$
BEGIN
  CREATE TYPE "LeaveNoticeUnit" AS ENUM ('calendar_days', 'business_days');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "LeaveApproverSource" AS ENUM ('employee_manager', 'department_partner', 'hr_pool', 'specific_profile');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "LeaveRequestSegmentSyncStatus" AS ENUM ('projected', 'confirmed', 'voided');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "LeaveApprovalStageType" ADD VALUE IF NOT EXISTS 'partner';
ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS 'pending_partner_approval';

ALTER TABLE "leave_policies"
  ADD COLUMN IF NOT EXISTS "hours_per_workday" DECIMAL(6,2) NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "auto_project_to_timesheet" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "leave_requests"
  ADD COLUMN IF NOT EXISTS "starts_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ends_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "requested_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "deducted_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "approval_route_snapshot" JSONB;

CREATE TABLE IF NOT EXISTS "leave_policy_notice_rules" (
  "id" SERIAL NOT NULL,
  "policy_id" INTEGER NOT NULL,
  "sequence_no" INTEGER NOT NULL,
  "min_hours" DECIMAL(8,2),
  "max_hours" DECIMAL(8,2),
  "notice_value" INTEGER NOT NULL,
  "notice_unit" "LeaveNoticeUnit" NOT NULL DEFAULT 'calendar_days',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_policy_notice_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "leave_policy_approval_routes" (
  "id" SERIAL NOT NULL,
  "policy_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "min_hours" DECIMAL(8,2),
  "max_hours" DECIMAL(8,2),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_policy_approval_routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "leave_policy_approval_route_steps" (
  "id" SERIAL NOT NULL,
  "route_id" INTEGER NOT NULL,
  "step_number" INTEGER NOT NULL,
  "stage_type" "LeaveApprovalStageType" NOT NULL,
  "approver_source" "LeaveApproverSource" NOT NULL DEFAULT 'employee_manager',
  "approver_profile_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_policy_approval_route_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "leave_request_segments" (
  "id" SERIAL NOT NULL,
  "leave_request_id" INTEGER NOT NULL,
  "leave_date" TIMESTAMP(3) NOT NULL,
  "start_minute_of_day" INTEGER,
  "end_minute_of_day" INTEGER,
  "hours" DECIMAL(8,2) NOT NULL,
  "time_entry_id" INTEGER,
  "sync_status" "LeaveRequestSegmentSyncStatus" NOT NULL DEFAULT 'projected',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_request_segments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leave_policy_notice_rules_policy_id_is_active_idx"
  ON "leave_policy_notice_rules"("policy_id", "is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "leave_policy_notice_rules_policy_id_sequence_no_key"
  ON "leave_policy_notice_rules"("policy_id", "sequence_no");

CREATE INDEX IF NOT EXISTS "leave_policy_approval_routes_policy_id_is_active_idx"
  ON "leave_policy_approval_routes"("policy_id", "is_active");

CREATE INDEX IF NOT EXISTS "leave_policy_approval_route_steps_route_id_stage_type_idx"
  ON "leave_policy_approval_route_steps"("route_id", "stage_type");

CREATE INDEX IF NOT EXISTS "leave_policy_approval_route_steps_approver_profile_id_idx"
  ON "leave_policy_approval_route_steps"("approver_profile_id");

CREATE UNIQUE INDEX IF NOT EXISTS "leave_policy_approval_route_steps_route_id_step_number_key"
  ON "leave_policy_approval_route_steps"("route_id", "step_number");

CREATE INDEX IF NOT EXISTS "leave_request_segments_leave_request_id_leave_date_idx"
  ON "leave_request_segments"("leave_request_id", "leave_date");

CREATE INDEX IF NOT EXISTS "leave_request_segments_leave_date_sync_status_idx"
  ON "leave_request_segments"("leave_date", "sync_status");

CREATE INDEX IF NOT EXISTS "leave_request_segments_time_entry_id_idx"
  ON "leave_request_segments"("time_entry_id");

CREATE INDEX IF NOT EXISTS "leave_requests_starts_at_ends_at_idx"
  ON "leave_requests"("starts_at", "ends_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leave_policy_notice_rules_policy_id_fkey'
  ) THEN
    ALTER TABLE "leave_policy_notice_rules"
      ADD CONSTRAINT "leave_policy_notice_rules_policy_id_fkey"
      FOREIGN KEY ("policy_id") REFERENCES "leave_policies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leave_policy_approval_routes_policy_id_fkey'
  ) THEN
    ALTER TABLE "leave_policy_approval_routes"
      ADD CONSTRAINT "leave_policy_approval_routes_policy_id_fkey"
      FOREIGN KEY ("policy_id") REFERENCES "leave_policies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leave_policy_approval_route_steps_route_id_fkey'
  ) THEN
    ALTER TABLE "leave_policy_approval_route_steps"
      ADD CONSTRAINT "leave_policy_approval_route_steps_route_id_fkey"
      FOREIGN KEY ("route_id") REFERENCES "leave_policy_approval_routes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leave_policy_approval_route_steps_approver_profile_id_fkey'
  ) THEN
    ALTER TABLE "leave_policy_approval_route_steps"
      ADD CONSTRAINT "leave_policy_approval_route_steps_approver_profile_id_fkey"
      FOREIGN KEY ("approver_profile_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leave_request_segments_leave_request_id_fkey'
  ) THEN
    ALTER TABLE "leave_request_segments"
      ADD CONSTRAINT "leave_request_segments_leave_request_id_fkey"
      FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leave_request_segments_time_entry_id_fkey'
  ) THEN
    ALTER TABLE "leave_request_segments"
      ADD CONSTRAINT "leave_request_segments_time_entry_id_fkey"
      FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
