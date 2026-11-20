-- Simplify onboarding into employee submission + HR review/activation
CREATE TYPE "OnboardingReviewStatus" AS ENUM (
  'draft',
  'submitted',
  'changes_requested',
  'approved'
);

ALTER TABLE "employee_onboarding_cases"
  ADD COLUMN "review_status" "OnboardingReviewStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by_profile_id" INTEGER,
  ADD COLUMN "review_note" TEXT;
