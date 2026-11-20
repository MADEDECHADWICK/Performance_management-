-- Allow system-projected leave / public holiday entries and standalone
-- non-billable activities that are not tied to a job or proposal.

ALTER TABLE "time_entries"
  DROP CONSTRAINT IF EXISTS "time_entries_job_or_proposal_required";

ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_job_or_proposal_required"
    CHECK (
      "job_id" IS NOT NULL
      OR "proposal_id" IS NOT NULL
      OR "non_billable_activity_id" IS NOT NULL
      OR "non_billable_category" IN ('leave', 'public_holiday')
    );
