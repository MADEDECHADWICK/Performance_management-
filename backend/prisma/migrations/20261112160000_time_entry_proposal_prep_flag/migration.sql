-- Mark time entries created from the proposal form so they can be edited in place
ALTER TABLE "time_entries"
  ADD COLUMN "is_proposal_prep" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "time_entries_proposal_id_employee_profile_id_is_proposal_prep_idx"
  ON "time_entries"("proposal_id", "employee_profile_id", "is_proposal_prep");
