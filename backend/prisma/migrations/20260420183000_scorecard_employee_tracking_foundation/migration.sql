ALTER TABLE "balanced_scorecard_kpis"
ADD COLUMN "owner_profile_id" INTEGER;

ALTER TABLE "balanced_scorecard_initiatives"
ADD COLUMN "owner_profile_id" INTEGER;

CREATE TABLE "balanced_scorecard_kpi_assignments" (
  "id" SERIAL NOT NULL,
  "kpi_id" INTEGER NOT NULL,
  "profile_id" INTEGER NOT NULL,
  "scorecard_version_id" INTEGER NOT NULL,
  "individual_target" DECIMAL(14, 2),
  "individual_weight" INTEGER NOT NULL DEFAULT 0,
  "created_by_profile_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "balanced_scorecard_kpi_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_bands" (
  "id" SERIAL NOT NULL,
  "role_id" INTEGER,
  "on_track_min" DECIMAL(5, 2) NOT NULL DEFAULT 85,
  "at_risk_min" DECIMAL(5, 2) NOT NULL DEFAULT 65,
  "label" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "performance_bands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "balanced_scorecard_kpi_assignments_kpi_id_profile_id_scorecard_version_id_key"
ON "balanced_scorecard_kpi_assignments"("kpi_id", "profile_id", "scorecard_version_id");

CREATE INDEX "balanced_scorecard_kpis_owner_profile_id_idx"
ON "balanced_scorecard_kpis"("owner_profile_id");

CREATE INDEX "balanced_scorecard_initiatives_owner_profile_id_idx"
ON "balanced_scorecard_initiatives"("owner_profile_id");

CREATE INDEX "balanced_scorecard_kpi_assignments_profile_id_scorecard_version_id_idx"
ON "balanced_scorecard_kpi_assignments"("profile_id", "scorecard_version_id");

CREATE INDEX "balanced_scorecard_kpi_assignments_kpi_id_idx"
ON "balanced_scorecard_kpi_assignments"("kpi_id");

CREATE INDEX "performance_bands_role_id_idx"
ON "performance_bands"("role_id");

ALTER TABLE "balanced_scorecard_kpis"
ADD CONSTRAINT "balanced_scorecard_kpis_owner_profile_id_fkey"
FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_initiatives"
ADD CONSTRAINT "balanced_scorecard_initiatives_owner_profile_id_fkey"
FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_assignments"
ADD CONSTRAINT "balanced_scorecard_kpi_assignments_kpi_id_fkey"
FOREIGN KEY ("kpi_id") REFERENCES "balanced_scorecard_kpis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_assignments"
ADD CONSTRAINT "balanced_scorecard_kpi_assignments_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balanced_scorecard_kpi_assignments"
ADD CONSTRAINT "balanced_scorecard_kpi_assignments_scorecard_version_id_fkey"
FOREIGN KEY ("scorecard_version_id") REFERENCES "balanced_scorecard_versions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "performance_bands"
ADD CONSTRAINT "performance_bands_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "position_roles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "balanced_scorecard_kpis" AS "k"
SET "owner_profile_id" = "p"."id"
FROM "profiles" AS "p"
WHERE "k"."owner_profile_id" IS NULL
  AND LOWER(TRIM(COALESCE("k"."owner_name", ''))) = LOWER(TRIM(CONCAT_WS(' ', "p"."first_name", "p"."last_name")));

UPDATE "balanced_scorecard_initiatives" AS "i"
SET "owner_profile_id" = "p"."id"
FROM "profiles" AS "p"
WHERE "i"."owner_profile_id" IS NULL
  AND LOWER(TRIM(COALESCE("i"."owner_name", ''))) = LOWER(TRIM(CONCAT_WS(' ', "p"."first_name", "p"."last_name")));

INSERT INTO "performance_bands" ("role_id", "on_track_min", "at_risk_min", "label", "updated_at")
SELECT NULL, 85, 65, 'Default', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "performance_bands"
  WHERE "role_id" IS NULL
);
