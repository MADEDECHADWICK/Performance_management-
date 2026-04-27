CREATE TYPE "BalancedScorecardContributionSourceType" AS ENUM ('evaluation_cycle', 'learning_assignment');

CREATE TABLE "balanced_scorecard_employee_contributions" (
    "id" SERIAL NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "contribution_key" TEXT NOT NULL,
    "source_type" "BalancedScorecardContributionSourceType" NOT NULL,
    "source_reference_id" INTEGER,
    "title" TEXT NOT NULL,
    "initiative_title" TEXT,
    "linked_kpi_key" TEXT,
    "due_date" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_profile_id" INTEGER,
    "latest_progress" INTEGER,
    "latest_comment" TEXT,
    "last_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balanced_scorecard_employee_contributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_employee_contribution_updates" (
    "id" SERIAL NOT NULL,
    "contribution_id" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL,
    "comment" TEXT,
    "created_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balanced_scorecard_employee_contribution_updates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "balanced_scorecard_employee_contributions_profile_id_contributio_key" ON "balanced_scorecard_employee_contributions"("profile_id", "contribution_key");
CREATE INDEX "balanced_scorecard_employee_contributions_profile_id_due_date_idx" ON "balanced_scorecard_employee_contributions"("profile_id", "due_date");
CREATE INDEX "balanced_scorecard_employee_contributions_source_type_source_refe_idx" ON "balanced_scorecard_employee_contributions"("source_type", "source_reference_id");
CREATE INDEX "balanced_scorecard_employee_contribution_updates_contribution_id_cre_idx" ON "balanced_scorecard_employee_contribution_updates"("contribution_id", "created_at");

ALTER TABLE "balanced_scorecard_employee_contributions"
ADD CONSTRAINT "balanced_scorecard_employee_contributions_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_employee_contributions"
ADD CONSTRAINT "balanced_scorecard_employee_contributions_acknowledged_by_profi_fkey"
FOREIGN KEY ("acknowledged_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_employee_contribution_updates"
ADD CONSTRAINT "balanced_scorecard_employee_contribution_updates_contribution_id_fkey"
FOREIGN KEY ("contribution_id") REFERENCES "balanced_scorecard_employee_contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_employee_contribution_updates"
ADD CONSTRAINT "balanced_scorecard_employee_contribution_updates_created_by_pro_fkey"
FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
