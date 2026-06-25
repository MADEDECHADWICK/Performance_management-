-- Make clientId optional on proposals (employees can log proposals without a client record)
ALTER TABLE "proposals" ALTER COLUMN "client_id" DROP NOT NULL;

-- Add free-text client name for proposals not linked to a client record
ALTER TABLE "proposals" ADD COLUMN "client_name" TEXT;

-- Constraint: at least one of client_id or client_name must be set
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_required"
  CHECK ("client_id" IS NOT NULL OR ("client_name" IS NOT NULL AND "client_name" <> ''));
