-- Employee billable/non-billable thresholds + managed non-billable activity catalog

ALTER TABLE "profiles"
  ADD COLUMN "standard_daily_hours" DECIMAL(5, 2) NOT NULL DEFAULT 8,
  ADD COLUMN "billable_target_percent" DECIMAL(5, 2) NOT NULL DEFAULT 80,
  ADD COLUMN "non_billable_target_percent" DECIMAL(5, 2) NOT NULL DEFAULT 20;

CREATE TABLE "non_billable_activities" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category_group" TEXT NOT NULL,
  "description" TEXT,
  "is_productive" BOOLEAN NOT NULL DEFAULT true,
  "requires_job" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "non_billable_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "non_billable_activities_code_key"
  ON "non_billable_activities"("code");

CREATE INDEX "non_billable_activities_is_active_category_group_idx"
  ON "non_billable_activities"("is_active", "category_group");

INSERT INTO "non_billable_activities"
  ("code", "name", "category_group", "is_productive", "requires_job", "sort_order")
VALUES
  ('client_meeting', 'Client meeting', 'client', true, false, 10),
  ('client_meeting_report_review', 'Client meeting - report review', 'client', true, false, 20),
  ('client_non_billable_work', 'Client non-billable work', 'client', true, false, 30),
  ('client_work_without_engagement_letter', 'Client work without engagement letter', 'client', true, false, 40),
  ('customer_service', 'Customer service', 'client', true, false, 50),
  ('pro_bono', 'Pro bono', 'client', true, false, 60),
  ('audit_engagement_planning', 'Audit / engagement planning', 'delivery', true, false, 70),
  ('reporting', 'Reporting', 'delivery', true, false, 80),
  ('audit_draft_review', 'Review of audit drafts', 'delivery', true, false, 90),
  ('data_review_processing', 'Data review & processing', 'delivery', true, false, 100),
  ('technical_research', 'Technical research (IFRS/IAS/ISA)', 'delivery', true, false, 110),
  ('admin_internal_tasks', 'Admin & internal tasks', 'internal', true, false, 120),
  ('email_correspondence', 'Responding to emails', 'internal', true, false, 130),
  ('petty_cash_review', 'Petty cash review', 'internal', true, false, 140),
  ('department_firm_setup', 'Department / firm setup', 'internal', true, false, 150),
  ('presentations', 'Presentations', 'internal', true, false, 160),
  ('event_preparation', 'Event preparation & participation', 'internal', true, false, 170),
  ('internal_meeting', 'Internal meeting', 'internal', true, false, 180),
  ('external_meeting', 'External meeting', 'internal', true, false, 190),
  ('team_building', 'Team building', 'internal', true, false, 200),
  ('schedule_development_peer_review', 'Schedule development & peer review', 'internal', true, false, 210),
  ('internal_training', 'Internal training', 'learning', true, false, 220),
  ('external_training_cpd', 'External training & CPD', 'learning', true, false, 230),
  ('practical_accountancy_training', 'Practical accountancy training (PAT)', 'learning', true, false, 240),
  ('marketing_business_development', 'Marketing & business development', 'marketing', true, false, 250),
  ('proposal_content_writing', 'Proposal & content writing', 'marketing', true, false, 260),
  ('no_work_idle', 'No work / idle', 'other', false, false, 270)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "time_entries"
  ADD COLUMN "non_billable_activity_id" INTEGER;

CREATE INDEX "time_entries_non_billable_activity_id_idx"
  ON "time_entries"("non_billable_activity_id");

ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_non_billable_activity_id_fkey"
  FOREIGN KEY ("non_billable_activity_id")
  REFERENCES "non_billable_activities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "time_entries"
SET "non_billable_activity_id" = (
  SELECT "id" FROM "non_billable_activities" WHERE "code" = 'admin_internal_tasks'
)
WHERE "non_billable_category" = 'internal'
  AND "non_billable_activity_id" IS NULL;

UPDATE "time_entries"
SET "non_billable_activity_id" = (
  SELECT "id" FROM "non_billable_activities" WHERE "code" = 'internal_training'
)
WHERE "non_billable_category" = 'training'
  AND "non_billable_activity_id" IS NULL;
