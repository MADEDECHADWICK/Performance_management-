ALTER TABLE "okr_objectives"
ADD COLUMN IF NOT EXISTS "kpi_id" INTEGER;

DO $$
BEGIN
  ALTER TABLE "okr_objectives"
  ADD CONSTRAINT "okr_objectives_kpi_id_fkey"
  FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "okr_objectives_kpi_id_idx"
ON "okr_objectives" ("kpi_id");
