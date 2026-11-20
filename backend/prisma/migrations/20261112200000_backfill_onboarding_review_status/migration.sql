-- Preserve previously completed onboarding cases under the new review model
UPDATE "employee_onboarding_cases"
SET
  "review_status" = 'approved',
  "reviewed_at" = COALESCE("reviewed_at", "updatedAt")
WHERE "status" = 'completed'
  AND "review_status" = 'draft';
