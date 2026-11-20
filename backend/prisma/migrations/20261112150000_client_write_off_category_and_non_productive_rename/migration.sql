-- Job/client non-billable time is automatically a write-off
ALTER TYPE "NonBillableCategory" ADD VALUE IF NOT EXISTS 'client_write_off';

-- Rename the non-productive activity
UPDATE "non_billable_activities"
SET "name" = 'Non-productive'
WHERE "code" = 'no_work_idle';
