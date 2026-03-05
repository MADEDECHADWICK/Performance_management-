-- KPI Cascade V2 (Draft DDL)
-- This migration introduces the V2 cascade model without touching legacy KPI/OKR tables.
-- Legacy tables remain read-only archive after cutover.

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE "KpiCadence" AS ENUM ('quarterly', 'annual');
CREATE TYPE "KpiCycleState" AS ENUM ('draft', 'active', 'completed', 'archived');
CREATE TYPE "KpiCycleVersionStatus" AS ENUM ('draft', 'published', 'locked');
CREATE TYPE "KpiEntityState" AS ENUM (
  'draft',
  'submitted',
  'in_review',
  'approved',
  'rejected',
  'active',
  'completed',
  'archived'
);
CREATE TYPE "KpiDirection" AS ENUM ('higher_better', 'lower_better', 'milestone');
CREATE TYPE "KpiRag" AS ENUM ('red', 'amber', 'green');
CREATE TYPE "KpiInitiativeLevel" AS ENUM ('firm', 'team', 'department', 'employee');
CREATE TYPE "KpiUpdateFrequency" AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly');
CREATE TYPE "KpiProgressSource" AS ENUM ('web', 'mobile', 'api', 'system', 'migration');
CREATE TYPE "KpiSnapshotType" AS ENUM ('baseline', 'periodic', 'closeout');

-- ============================================================================
-- Core hierarchy
-- ============================================================================

CREATE TABLE "kpi_cycles" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "cadence" "KpiCadence" NOT NULL,
  "start_at" TIMESTAMPTZ NOT NULL,
  "end_at" TIMESTAMPTZ NOT NULL,
  "state" "KpiCycleState" NOT NULL DEFAULT 'draft',
  "created_by_profile_id" INTEGER,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_cycles_date_window_ck" CHECK ("end_at" > "start_at"),
  CONSTRAINT "kpi_cycles_created_by_profile_id_fkey"
    FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "kpi_cycle_versions" (
  "id" SERIAL PRIMARY KEY,
  "cycle_id" INTEGER NOT NULL,
  "version_no" INTEGER NOT NULL,
  "status" "KpiCycleVersionStatus" NOT NULL DEFAULT 'draft',
  "published_at" TIMESTAMPTZ,
  "created_by_profile_id" INTEGER,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_cycle_versions_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "kpi_cycles" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_cycle_versions_created_by_profile_id_fkey"
    FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_cycle_versions_version_ck" CHECK ("version_no" > 0)
);

CREATE TABLE "kpi_goals" (
  "id" SERIAL PRIMARY KEY,
  "cycle_version_id" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "owner_profile_id" INTEGER NOT NULL,
  "state" "KpiEntityState" NOT NULL DEFAULT 'draft',
  "baseline" DECIMAL(14,2) NOT NULL,
  "target" DECIMAL(14,2) NOT NULL,
  "actual" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "weight" DECIMAL(5,2) NOT NULL,
  "percent_complete" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "rag" "KpiRag" NOT NULL DEFAULT 'red',
  "last_updated_at" TIMESTAMPTZ,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_goals_cycle_version_id_fkey"
    FOREIGN KEY ("cycle_version_id") REFERENCES "kpi_cycle_versions" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_goals_owner_profile_id_fkey"
    FOREIGN KEY ("owner_profile_id") REFERENCES "profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "kpi_goals_weight_ck" CHECK ("weight" >= 0 AND "weight" <= 100),
  CONSTRAINT "kpi_goals_percent_ck" CHECK ("percent_complete" >= 0 AND "percent_complete" <= 100)
);

CREATE TABLE "kpi_metrics" (
  "id" SERIAL PRIMARY KEY,
  "goal_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit" TEXT,
  "direction" "KpiDirection" NOT NULL,
  "aggregation_method" TEXT NOT NULL,
  "red_threshold" DECIMAL(14,2),
  "amber_threshold" DECIMAL(14,2),
  "green_threshold" DECIMAL(14,2),
  "state" "KpiEntityState" NOT NULL DEFAULT 'draft',
  "baseline" DECIMAL(14,2) NOT NULL,
  "target" DECIMAL(14,2) NOT NULL,
  "actual" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "weight" DECIMAL(5,2) NOT NULL,
  "percent_complete" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "rag" "KpiRag" NOT NULL DEFAULT 'red',
  "last_updated_at" TIMESTAMPTZ,
  "update_frequency" "KpiUpdateFrequency",
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_metrics_goal_id_fkey"
    FOREIGN KEY ("goal_id") REFERENCES "kpi_goals" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_metrics_weight_ck" CHECK ("weight" >= 0 AND "weight" <= 100),
  CONSTRAINT "kpi_metrics_percent_ck" CHECK ("percent_complete" >= 0 AND "percent_complete" <= 100)
);

CREATE TABLE "kpi_initiatives" (
  "id" SERIAL PRIMARY KEY,
  "metric_id" INTEGER NOT NULL,
  "level" "KpiInitiativeLevel" NOT NULL,
  "parent_initiative_id" INTEGER,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "owner_profile_id" INTEGER,
  "partner_profile_id" INTEGER,
  "manager_profile_id" INTEGER,
  "department_id" INTEGER,
  "employee_profile_id" INTEGER,
  "state" "KpiEntityState" NOT NULL DEFAULT 'draft',
  "baseline" DECIMAL(14,2) NOT NULL,
  "target" DECIMAL(14,2) NOT NULL,
  "actual" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "weight" DECIMAL(5,2) NOT NULL,
  "percent_complete" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "rag" "KpiRag" NOT NULL DEFAULT 'red',
  "last_updated_at" TIMESTAMPTZ,
  "update_frequency" "KpiUpdateFrequency" NOT NULL,
  "ack_required" BOOLEAN NOT NULL DEFAULT TRUE,
  "acknowledged_at" TIMESTAMPTZ,
  "effective_from" TIMESTAMPTZ,
  "effective_to" TIMESTAMPTZ,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_initiatives_metric_id_fkey"
    FOREIGN KEY ("metric_id") REFERENCES "kpi_metrics" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_initiatives_parent_initiative_id_fkey"
    FOREIGN KEY ("parent_initiative_id") REFERENCES "kpi_initiatives" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_initiatives_owner_profile_id_fkey"
    FOREIGN KEY ("owner_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_initiatives_partner_profile_id_fkey"
    FOREIGN KEY ("partner_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_initiatives_manager_profile_id_fkey"
    FOREIGN KEY ("manager_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_initiatives_employee_profile_id_fkey"
    FOREIGN KEY ("employee_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_initiatives_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_initiatives_weight_ck" CHECK ("weight" >= 0 AND "weight" <= 100),
  CONSTRAINT "kpi_initiatives_percent_ck" CHECK ("percent_complete" >= 0 AND "percent_complete" <= 100),
  CONSTRAINT "kpi_initiatives_level_shape_ck" CHECK (
    ("level" = 'firm' AND "parent_initiative_id" IS NULL AND "employee_profile_id" IS NULL)
    OR
    ("level" = 'team' AND "parent_initiative_id" IS NOT NULL AND "partner_profile_id" IS NOT NULL AND "employee_profile_id" IS NULL)
    OR
    ("level" = 'department' AND "parent_initiative_id" IS NOT NULL AND "manager_profile_id" IS NOT NULL AND "department_id" IS NOT NULL AND "employee_profile_id" IS NULL)
    OR
    ("level" = 'employee' AND "parent_initiative_id" IS NOT NULL AND "employee_profile_id" IS NOT NULL)
  )
);

-- ============================================================================
-- Activity and approvals
-- ============================================================================

CREATE TABLE "kpi_progress_updates" (
  "id" SERIAL PRIMARY KEY,
  "initiative_id" INTEGER NOT NULL,
  "period_start" TIMESTAMPTZ NOT NULL,
  "period_end" TIMESTAMPTZ NOT NULL,
  "actual" DECIMAL(14,2) NOT NULL,
  "note" TEXT,
  "evidence_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updated_by_profile_id" INTEGER,
  "source" "KpiProgressSource" NOT NULL DEFAULT 'api',
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_progress_updates_initiative_id_fkey"
    FOREIGN KEY ("initiative_id") REFERENCES "kpi_initiatives" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_progress_updates_updated_by_profile_id_fkey"
    FOREIGN KEY ("updated_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_progress_updates_window_ck" CHECK ("period_end" > "period_start")
);

CREATE TABLE "kpi_approval_history" (
  "id" SERIAL PRIMARY KEY,
  "entity_type" TEXT NOT NULL,
  "entity_id" INTEGER NOT NULL,
  "from_state" "KpiEntityState" NOT NULL,
  "to_state" "KpiEntityState" NOT NULL,
  "acted_by_profile_id" INTEGER,
  "acted_role" TEXT NOT NULL,
  "comments" TEXT,
  "acted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sequence_no" INTEGER NOT NULL,
  "sla_breached" BOOLEAN NOT NULL DEFAULT FALSE,
  "metadata" JSONB,
  CONSTRAINT "kpi_approval_history_acted_by_profile_id_fkey"
    FOREIGN KEY ("acted_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_approval_history_reject_comment_ck" CHECK (
    ("to_state" <> 'rejected') OR ("comments" IS NOT NULL AND LENGTH(TRIM("comments")) > 0)
  ),
  CONSTRAINT "kpi_approval_history_sequence_ck" CHECK ("sequence_no" > 0)
);

CREATE TABLE "kpi_reassignments" (
  "id" SERIAL PRIMARY KEY,
  "initiative_id" INTEGER NOT NULL,
  "from_profile_id" INTEGER,
  "to_profile_id" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "effective_at" TIMESTAMPTZ NOT NULL,
  "approved_by_profile_id" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_reassignments_initiative_id_fkey"
    FOREIGN KEY ("initiative_id") REFERENCES "kpi_initiatives" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_reassignments_from_profile_id_fkey"
    FOREIGN KEY ("from_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "kpi_reassignments_to_profile_id_fkey"
    FOREIGN KEY ("to_profile_id") REFERENCES "profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "kpi_reassignments_approved_by_profile_id_fkey"
    FOREIGN KEY ("approved_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- ============================================================================
-- Snapshots and archive crosswalk
-- ============================================================================

CREATE TABLE "kpi_snapshots" (
  "id" SERIAL PRIMARY KEY,
  "cycle_id" INTEGER NOT NULL,
  "cycle_version_id" INTEGER NOT NULL,
  "snapshot_type" "KpiSnapshotType" NOT NULL,
  "created_by_profile_id" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_snapshots_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "kpi_cycles" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_snapshots_cycle_version_id_fkey"
    FOREIGN KEY ("cycle_version_id") REFERENCES "kpi_cycle_versions" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_snapshots_created_by_profile_id_fkey"
    FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "kpi_snapshot_items" (
  "id" SERIAL PRIMARY KEY,
  "snapshot_id" INTEGER NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" INTEGER NOT NULL,
  "parent_id" INTEGER,
  "state" "KpiEntityState" NOT NULL,
  "target" DECIMAL(14,2) NOT NULL,
  "actual" DECIMAL(14,2) NOT NULL,
  "baseline" DECIMAL(14,2) NOT NULL,
  "weight" DECIMAL(5,2) NOT NULL,
  "percent_complete" DECIMAL(7,2) NOT NULL,
  "rag" "KpiRag" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "kpi_snapshot_items_snapshot_id_fkey"
    FOREIGN KEY ("snapshot_id") REFERENCES "kpi_snapshots" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "kpi_legacy_map" (
  "id" SERIAL PRIMARY KEY,
  "legacy_table" TEXT NOT NULL,
  "legacy_id" INTEGER NOT NULL,
  "new_entity_type" TEXT NOT NULL,
  "new_entity_id" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Notification token support (mobile delivery)
-- ============================================================================

CREATE TABLE "notification_device_tokens" (
  "id" SERIAL PRIMARY KEY,
  "profile_id" INTEGER NOT NULL,
  "platform" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "notification_device_tokens_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================================
-- Indexes and uniqueness
-- ============================================================================

CREATE UNIQUE INDEX "kpi_cycle_versions_cycle_id_version_no_key"
  ON "kpi_cycle_versions" ("cycle_id", "version_no");

CREATE UNIQUE INDEX "kpi_cycle_versions_one_published_per_cycle_key"
  ON "kpi_cycle_versions" ("cycle_id")
  WHERE "status" = 'published';

CREATE UNIQUE INDEX "kpi_goals_cycle_version_id_title_key"
  ON "kpi_goals" ("cycle_version_id", "title");

CREATE INDEX "kpi_cycles_state_idx" ON "kpi_cycles" ("state");
CREATE INDEX "kpi_cycles_cadence_idx" ON "kpi_cycles" ("cadence");
CREATE INDEX "kpi_goals_state_idx" ON "kpi_goals" ("state");
CREATE INDEX "kpi_metrics_goal_id_idx" ON "kpi_metrics" ("goal_id");
CREATE INDEX "kpi_initiatives_metric_id_idx" ON "kpi_initiatives" ("metric_id");
CREATE INDEX "kpi_initiatives_parent_initiative_id_idx" ON "kpi_initiatives" ("parent_initiative_id");
CREATE INDEX "kpi_initiatives_level_state_idx" ON "kpi_initiatives" ("level", "state");
CREATE INDEX "kpi_initiatives_department_id_idx" ON "kpi_initiatives" ("department_id");
CREATE INDEX "kpi_initiatives_employee_profile_id_idx" ON "kpi_initiatives" ("employee_profile_id");

CREATE UNIQUE INDEX "kpi_progress_updates_window_key"
  ON "kpi_progress_updates" ("initiative_id", "period_start", "period_end");

CREATE UNIQUE INDEX "kpi_progress_updates_idempotency_key_key"
  ON "kpi_progress_updates" ("idempotency_key");

CREATE UNIQUE INDEX "kpi_approval_history_entity_seq_key"
  ON "kpi_approval_history" ("entity_type", "entity_id", "sequence_no");

CREATE UNIQUE INDEX "kpi_snapshot_items_snapshot_entity_key"
  ON "kpi_snapshot_items" ("snapshot_id", "entity_type", "entity_id");

CREATE UNIQUE INDEX "kpi_legacy_map_legacy_key"
  ON "kpi_legacy_map" ("legacy_table", "legacy_id");

CREATE UNIQUE INDEX "notification_device_tokens_dedupe_key"
  ON "notification_device_tokens" ("profile_id", "platform", "token");

-- One active cycle per cadence window (overlap guard).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "kpi_cycles"
  ADD CONSTRAINT "kpi_cycles_active_window_excl"
  EXCLUDE USING gist (
    "cadence" WITH =,
    tstzrange("start_at", "end_at", '[]') WITH &&
  )
  WHERE ("state" = 'active');

