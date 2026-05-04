CREATE TYPE "NonBillableCategory" AS ENUM (
  'leave',
  'public_holiday',
  'internal',
  'training',
  'over_budget',
  'other'
);

ALTER TABLE "time_entries"
  ADD COLUMN "non_billable_category" "NonBillableCategory";

UPDATE "time_entries"
SET
  "non_billable_category" = (
    CASE
      WHEN "description" LIKE '[[RG_NON_BILLABLE_CATEGORY]]leave%' THEN 'leave'
      WHEN "description" LIKE '[[RG_NON_BILLABLE_CATEGORY]]public_holiday%' THEN 'public_holiday'
      WHEN "description" LIKE '[[RG_NON_BILLABLE_CATEGORY]]internal%' THEN 'internal'
      WHEN "description" LIKE '[[RG_NON_BILLABLE_CATEGORY]]training%' THEN 'training'
      WHEN "description" LIKE '[[RG_NON_BILLABLE_CATEGORY]]other%' THEN 'other'
      ELSE 'other'
    END
  )::"NonBillableCategory",
  "description" = NULLIF(
    regexp_replace(
      "description",
      '^\[\[RG_NON_BILLABLE_CATEGORY\]\](leave|public_holiday|internal|training|other)\n?',
      ''
    ),
    ''
  )
WHERE "description" LIKE '[[RG_NON_BILLABLE_CATEGORY]]%';

UPDATE "time_entries"
SET "non_billable_category" = 'other'
WHERE "billable" = false
  AND "non_billable_category" IS NULL;
