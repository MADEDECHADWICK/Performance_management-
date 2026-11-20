-- Per-assignment billable and non-billable hour budgets
ALTER TABLE "job_staff_assignments"
ADD COLUMN "billable_allocated_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "non_billable_allocated_hours" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Rejected over-allocation hours are void but remain auditable
ALTER TABLE "time_entries"
ADD COLUMN "rejected_excess_hours" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Record over-allocation request reasons and decisions
ALTER TABLE "time_over_budget_requests"
ADD COLUMN "request_reason" TEXT,
ADD COLUMN "decided_by_profile_id" INTEGER,
ADD COLUMN "decided_at" TIMESTAMP(3);

-- Working documents are links, not uploaded files
CREATE TYPE "JobWorkingLinkType" AS ENUM (
  'milestone_requirement',
  'proposal',
  'cost_estimate',
  'work_plan',
  'budget',
  'other'
);

CREATE TYPE "JobWorkingLinkStatus" AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TABLE "job_working_document_links" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "milestone_task_id" INTEGER,
  "link_type" "JobWorkingLinkType" NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "added_by_profile_id" INTEGER NOT NULL,
  "review_status" "JobWorkingLinkStatus" NOT NULL DEFAULT 'pending',
  "approved_by_profile_id" INTEGER,
  "approved_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "job_working_document_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_working_document_links_job_id_link_type_idx"
ON "job_working_document_links"("job_id", "link_type");

CREATE INDEX "job_working_document_links_milestone_task_id_idx"
ON "job_working_document_links"("milestone_task_id");

CREATE INDEX "job_working_document_links_review_status_idx"
ON "job_working_document_links"("review_status");

ALTER TABLE "job_working_document_links"
ADD CONSTRAINT "job_working_document_links_job_id_fkey"
FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_working_document_links"
ADD CONSTRAINT "job_working_document_links_milestone_task_id_fkey"
FOREIGN KEY ("milestone_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "job_working_document_links"
ADD CONSTRAINT "job_working_document_links_added_by_profile_id_fkey"
FOREIGN KEY ("added_by_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "job_working_document_links"
ADD CONSTRAINT "job_working_document_links_approved_by_profile_id_fkey"
FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
