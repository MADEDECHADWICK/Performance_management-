ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'submitted_to_manager';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'manager_changes_requested';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'manager_rejected';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'manager_approved';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'assigned_to_bd';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'bd_in_progress';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'bd_changes_requested';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'ready_for_client_submission';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'submitted_to_client';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TYPE "ProposalTeamMemberStatus" AS ENUM (
  'pending_manager_approval',
  'approved',
  'rejected',
  'removed'
);

ALTER TABLE "proposals"
  ADD COLUMN IF NOT EXISTS "deadline_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "date_assigned" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "employee_submission_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "final_submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "manager_profile_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "source_profile_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "reviewer_profile_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "bd_owner_profile_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "department_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "proposal_type" TEXT,
  ADD COLUMN IF NOT EXISTS "requested_service" TEXT,
  ADD COLUMN IF NOT EXISTS "source_name" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewer_name" TEXT,
  ADD COLUMN IF NOT EXISTS "employee_draft_link" TEXT,
  ADD COLUMN IF NOT EXISTS "bd_final_proposal_link" TEXT,
  ADD COLUMN IF NOT EXISTS "final_submission_status" TEXT,
  ADD COLUMN IF NOT EXISTS "award_status" TEXT,
  ADD COLUMN IF NOT EXISTS "client_feedback" TEXT,
  ADD COLUMN IF NOT EXISTS "manager_decision_note" TEXT,
  ADD COLUMN IF NOT EXISTS "time_taken_hours" DECIMAL(10,2);

ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_manager_profile_id_fkey"
    FOREIGN KEY ("manager_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proposals_source_profile_id_fkey"
    FOREIGN KEY ("source_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proposals_reviewer_profile_id_fkey"
    FOREIGN KEY ("reviewer_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proposals_bd_owner_profile_id_fkey"
    FOREIGN KEY ("bd_owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proposals_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "proposals_manager_profile_id_idx" ON "proposals"("manager_profile_id");
CREATE INDEX IF NOT EXISTS "proposals_department_id_idx" ON "proposals"("department_id");
CREATE INDEX IF NOT EXISTS "proposals_bd_owner_profile_id_idx" ON "proposals"("bd_owner_profile_id");

CREATE TABLE "proposal_team_members" (
  "id" SERIAL NOT NULL,
  "proposal_id" INTEGER NOT NULL,
  "profile_id" INTEGER NOT NULL,
  "status" "ProposalTeamMemberStatus" NOT NULL DEFAULT 'pending_manager_approval',
  "role_on_proposal" TEXT,
  "approved_by_profile_id" INTEGER,
  "approved_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "proposal_team_members_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "proposal_team_members"
  ADD CONSTRAINT "proposal_team_members_proposal_id_fkey"
    FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "proposal_team_members_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "proposal_team_members_approved_by_profile_id_fkey"
    FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "proposal_team_members_proposal_id_profile_id_key"
  ON "proposal_team_members"("proposal_id", "profile_id");
CREATE INDEX "proposal_team_members_profile_id_status_idx"
  ON "proposal_team_members"("profile_id", "status");
CREATE INDEX "proposal_team_members_proposal_id_status_idx"
  ON "proposal_team_members"("proposal_id", "status");
CREATE INDEX "proposal_team_members_approved_by_profile_id_idx"
  ON "proposal_team_members"("approved_by_profile_id");

ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "proposal_id" INTEGER,
  ALTER COLUMN "job_id" DROP NOT NULL;

ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_proposal_id_fkey"
    FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "time_entries_employee_profile_id_proposal_id_date_worked_idx"
  ON "time_entries"("employee_profile_id", "proposal_id", "date_worked");
CREATE INDEX IF NOT EXISTS "time_entries_proposal_id_idx" ON "time_entries"("proposal_id");

ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_job_or_proposal_required"
    CHECK ("job_id" IS NOT NULL OR "proposal_id" IS NOT NULL);
