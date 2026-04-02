ALTER TABLE "induction_checklists"
ADD COLUMN "employee_acknowledged_at" TIMESTAMP(3),
ADD COLUMN "employee_acknowledged_by_profile_id" INTEGER,
ADD COLUMN "hr_signed_off_at" TIMESTAMP(3),
ADD COLUMN "hr_signed_off_by_profile_id" INTEGER,
ADD COLUMN "hr_signoff_notes" TEXT;

ALTER TABLE "induction_checklist_items"
ADD COLUMN "section_key" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN "section_label" TEXT NOT NULL DEFAULT 'General',
ADD COLUMN "owner_role" TEXT,
ADD COLUMN "comments" TEXT;
