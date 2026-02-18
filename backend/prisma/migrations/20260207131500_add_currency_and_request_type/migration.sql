-- Add currency columns
ALTER TABLE "jobs" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KES';
ALTER TABLE "job_costings" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KES';
ALTER TABLE "revenue_allocations" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KES';

-- Create enum for approval request type
CREATE TYPE "TimeEntryApprovalRequestType" AS ENUM ('additional_hours', 'over_budget');

-- Normalize existing request_type values
UPDATE "time_entry_approval_requests"
SET "request_type" = 'additional_hours'
WHERE "request_type" IS NULL OR "request_type" IN ('billable', 'additional_hours', '');

UPDATE "time_entry_approval_requests"
SET "request_type" = 'over_budget'
WHERE "request_type" IN ('non_billable', 'over_budget');

UPDATE "time_entry_approval_requests"
SET "request_type" = 'additional_hours'
WHERE "request_type" NOT IN ('additional_hours', 'over_budget');

-- Change column type
ALTER TABLE "time_entry_approval_requests"
  ALTER COLUMN "request_type" TYPE "TimeEntryApprovalRequestType"
  USING ("request_type"::text::"TimeEntryApprovalRequestType");

-- Backfill currencies from related records
UPDATE "jobs" j
SET "currency" = COALESCE(e.currency, j.currency, 'KES')
FROM "engagement_letters" e
WHERE j."engagement_letter_id" = e.id;

UPDATE "job_costings" jc
SET "currency" = COALESCE(j.currency, 'KES')
FROM "jobs" j
WHERE jc."job_id" = j.id;

UPDATE "revenue_allocations" ra
SET "currency" = COALESCE(cp.currency, 'KES')
FROM "client_payments" cp
WHERE ra."client_payment_id" = cp.id;
