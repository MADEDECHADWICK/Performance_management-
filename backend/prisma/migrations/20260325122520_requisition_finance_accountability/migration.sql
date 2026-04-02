CREATE TYPE "RequisitionAccountabilityStatus" AS ENUM ('not_released', 'pending', 'submitted');

ALTER TABLE "requisition_requests"
  ADD COLUMN "amount_breakdown" JSONB,
  ADD COLUMN "released_at" TIMESTAMP(3),
  ADD COLUMN "released_by_profile_id" INTEGER,
  ADD COLUMN "release_notes" TEXT,
  ADD COLUMN "accountability_due_at" TIMESTAMP(3),
  ADD COLUMN "accountability_status" "RequisitionAccountabilityStatus" NOT NULL DEFAULT 'not_released',
  ADD COLUMN "accountability_submitted_at" TIMESTAMP(3),
  ADD COLUMN "accountability_submitted_by_profile_id" INTEGER,
  ADD COLUMN "accountability_notes" TEXT;

CREATE INDEX "requisition_requests_released_by_profile_id_idx"
  ON "requisition_requests"("released_by_profile_id");

CREATE INDEX "requisition_requests_accountability_status_accountability_due_at_idx"
  ON "requisition_requests"("accountability_status", "accountability_due_at");

ALTER TABLE "requisition_requests"
  ADD CONSTRAINT "requisition_requests_released_by_profile_id_fkey"
  FOREIGN KEY ("released_by_profile_id") REFERENCES "profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "requisition_requests"
  ADD CONSTRAINT "requisition_requests_accountability_submitted_by_profile_id_fkey"
  FOREIGN KEY ("accountability_submitted_by_profile_id") REFERENCES "profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
