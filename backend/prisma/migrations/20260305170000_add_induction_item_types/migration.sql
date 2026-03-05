-- Add dynamic onboarding checklist item fields for typed actions and links.
ALTER TABLE "induction_checklist_items"
ADD COLUMN "item_type" TEXT NOT NULL DEFAULT 'task',
ADD COLUMN "resource_url" TEXT;
