CREATE TABLE "balanced_scorecard_perspectives" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_name" TEXT,
    "summary" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balanced_scorecard_perspectives_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_goals" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "perspective_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_name" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balanced_scorecard_goals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_kpis" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "metric_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "formula" TEXT,
    "frequency" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "firm_target" TEXT NOT NULL,
    "owner_name" TEXT,
    "status_logic" TEXT,
    "update_frequency" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balanced_scorecard_kpis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "balanced_scorecard_initiatives" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "kpi_id" INTEGER NOT NULL,
    "parent_initiative_id" INTEGER,
    "scope_role" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "owner_name" TEXT,
    "timeline" TEXT,
    "due_date" TIMESTAMP(3),
    "status" "DashboardStatus" NOT NULL DEFAULT 'at_risk',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balanced_scorecard_initiatives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "balanced_scorecard_perspectives_key_key" ON "balanced_scorecard_perspectives"("key");
CREATE UNIQUE INDEX "balanced_scorecard_goals_key_key" ON "balanced_scorecard_goals"("key");
CREATE UNIQUE INDEX "balanced_scorecard_kpis_key_key" ON "balanced_scorecard_kpis"("key");
CREATE UNIQUE INDEX "balanced_scorecard_initiatives_key_key" ON "balanced_scorecard_initiatives"("key");

CREATE INDEX "balanced_scorecard_perspectives_sort_order_idx" ON "balanced_scorecard_perspectives"("sort_order");
CREATE INDEX "balanced_scorecard_perspectives_is_active_idx" ON "balanced_scorecard_perspectives"("is_active");

CREATE INDEX "balanced_scorecard_goals_perspective_id_sort_order_idx" ON "balanced_scorecard_goals"("perspective_id", "sort_order");
CREATE INDEX "balanced_scorecard_goals_is_active_idx" ON "balanced_scorecard_goals"("is_active");

CREATE INDEX "balanced_scorecard_kpis_goal_id_sort_order_idx" ON "balanced_scorecard_kpis"("goal_id", "sort_order");
CREATE INDEX "balanced_scorecard_kpis_metric_key_idx" ON "balanced_scorecard_kpis"("metric_key");
CREATE INDEX "balanced_scorecard_kpis_is_active_idx" ON "balanced_scorecard_kpis"("is_active");

CREATE INDEX "balanced_scorecard_initiatives_goal_id_sort_order_idx" ON "balanced_scorecard_initiatives"("goal_id", "sort_order");
CREATE INDEX "balanced_scorecard_initiatives_kpi_id_sort_order_idx" ON "balanced_scorecard_initiatives"("kpi_id", "sort_order");
CREATE INDEX "balanced_scorecard_initiatives_parent_initiative_id_idx" ON "balanced_scorecard_initiatives"("parent_initiative_id");
CREATE INDEX "balanced_scorecard_initiatives_scope_role_idx" ON "balanced_scorecard_initiatives"("scope_role");
CREATE INDEX "balanced_scorecard_initiatives_is_active_idx" ON "balanced_scorecard_initiatives"("is_active");

ALTER TABLE "balanced_scorecard_goals"
ADD CONSTRAINT "balanced_scorecard_goals_perspective_id_fkey"
FOREIGN KEY ("perspective_id") REFERENCES "balanced_scorecard_perspectives"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpis"
ADD CONSTRAINT "balanced_scorecard_kpis_goal_id_fkey"
FOREIGN KEY ("goal_id") REFERENCES "balanced_scorecard_goals"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_initiatives"
ADD CONSTRAINT "balanced_scorecard_initiatives_goal_id_fkey"
FOREIGN KEY ("goal_id") REFERENCES "balanced_scorecard_goals"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_initiatives"
ADD CONSTRAINT "balanced_scorecard_initiatives_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_initiatives"
ADD CONSTRAINT "balanced_scorecard_initiatives_parent_initiative_id_fkey"
FOREIGN KEY ("parent_initiative_id") REFERENCES "balanced_scorecard_initiatives"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
