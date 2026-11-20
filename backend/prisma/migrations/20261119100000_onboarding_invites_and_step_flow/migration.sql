-- One-time onboarding invitation links
ALTER TABLE "users"
ADD COLUMN "onboarding_invite_token_hash" TEXT,
ADD COLUMN "onboarding_invite_expires_at" TIMESTAMP(3),
ADD COLUMN "onboarding_invite_sent_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_onboarding_invite_token_hash_key"
ON "users"("onboarding_invite_token_hash");

-- Step 1 document submission is tracked separately from the final assessment
ALTER TABLE "employee_onboarding_cases"
ADD COLUMN "documents_submitted_at" TIMESTAMP(3);

-- Employee notes for documents they cannot provide yet
ALTER TABLE "induction_checklist_items"
ADD COLUMN "employee_note" TEXT;
