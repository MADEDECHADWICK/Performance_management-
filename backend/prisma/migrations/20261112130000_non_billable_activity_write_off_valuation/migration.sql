-- Classify non-billable activities that represent write-offs and how to value them

CREATE TYPE "WriteOffValuation" AS ENUM ('none', 'billing_rate', 'cost_rate');

ALTER TABLE "non_billable_activities"
  ADD COLUMN "write_off_valuation" "WriteOffValuation" NOT NULL DEFAULT 'none';

UPDATE "non_billable_activities"
SET "write_off_valuation" = 'billing_rate'
WHERE "code" IN (
  'client_non_billable_work',
  'client_work_without_engagement_letter',
  'pro_bono'
);

UPDATE "non_billable_activities"
SET "write_off_valuation" = 'cost_rate'
WHERE "code" = 'no_work_idle';

CREATE INDEX "non_billable_activities_write_off_valuation_idx"
  ON "non_billable_activities"("write_off_valuation");
