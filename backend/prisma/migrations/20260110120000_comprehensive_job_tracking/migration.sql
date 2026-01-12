-- CreateTable: Position Rates for position-based costing
CREATE TABLE "position_rates" (
    "id" TEXT NOT NULL,
    "position_level" TEXT NOT NULL,
    "billing_rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cost_rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_rates_pkey" PRIMARY KEY ("id")
);

-- Add columns to jobs table for enhanced job tracking
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "budget_hours" DECIMAL(65,30) DEFAULT 0;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "job_owner_id" INTEGER;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'medium';

-- Add columns to profiles table for position level
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "position_level" TEXT;

-- Add columns to job_staff_assignments table
ALTER TABLE "job_staff_assignments" ADD COLUMN IF NOT EXISTS "role_on_job" TEXT;
ALTER TABLE "job_staff_assignments" ADD COLUMN IF NOT EXISTS "assigned_by" INTEGER;

-- Create unique index for position_level
CREATE UNIQUE INDEX IF NOT EXISTS "position_rates_position_level_key" ON "position_rates"("position_level");

-- Add check constraint for priority
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'jobs_priority_check') THEN
        ALTER TABLE "jobs" ADD CONSTRAINT "jobs_priority_check" CHECK ("priority" IN ('low', 'medium', 'high', 'urgent'));
    END IF;
END $$;

-- Add check constraint for position_level
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'profiles_position_level_check') THEN
        ALTER TABLE "profiles" ADD CONSTRAINT "profiles_position_level_check" CHECK ("position_level" IN ('group_managing_partner', 'partner', 'manager', 'senior', 'semi_senior', 'associate', 'intern'));
    END IF;
END $$;

-- Add check constraint for position_rates position_level
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'position_rates_position_level_check') THEN
        ALTER TABLE "position_rates" ADD CONSTRAINT "position_rates_position_level_check" CHECK ("position_level" IN ('group_managing_partner', 'partner', 'manager', 'senior', 'semi_senior', 'associate', 'intern'));
    END IF;
END $$;

-- Seed default position rates (KES/hour) only if table is empty
INSERT INTO "position_rates" ("id", "position_level", "billing_rate", "cost_rate") 
SELECT * FROM (VALUES
    (gen_random_uuid()::text, 'group_managing_partner', 15000::decimal, 8000::decimal),
    (gen_random_uuid()::text, 'partner', 12000::decimal, 6500::decimal),
    (gen_random_uuid()::text, 'manager', 8000::decimal, 4500::decimal),
    (gen_random_uuid()::text, 'senior', 5500::decimal, 3000::decimal),
    (gen_random_uuid()::text, 'semi_senior', 4000::decimal, 2200::decimal),
    (gen_random_uuid()::text, 'associate', 2500::decimal, 1500::decimal),
    (gen_random_uuid()::text, 'intern', 1500::decimal, 800::decimal)
) AS new_rates(id, position_level, billing_rate, cost_rate)
WHERE NOT EXISTS (SELECT 1 FROM "position_rates" WHERE "position_level" = new_rates.position_level);

-- Create sequence for job codes if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS job_code_seq START 1000;