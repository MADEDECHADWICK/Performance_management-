-- Track physical job completion so quarterly revenue can be allocated on the increment

ALTER TABLE "jobs"
  ADD COLUMN "completion_percent" DECIMAL(5, 2) NOT NULL DEFAULT 0;

CREATE TABLE "job_completion_history" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "completion_percent" DECIMAL(5, 2) NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recorded_by_profile_id" INTEGER,
  "note" TEXT,

  CONSTRAINT "job_completion_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_completion_history_job_id_recorded_at_idx"
  ON "job_completion_history"("job_id", "recorded_at");

ALTER TABLE "job_completion_history"
  ADD CONSTRAINT "job_completion_history_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_completion_history"
  ADD CONSTRAINT "job_completion_history_recorded_by_profile_id_fkey"
  FOREIGN KEY ("recorded_by_profile_id") REFERENCES "profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed a 0% baseline for existing jobs so the first completion update is incremental
INSERT INTO "job_completion_history" ("job_id", "completion_percent", "recorded_at", "note")
SELECT "id", 0, CURRENT_TIMESTAMP, 'Baseline created during job completion tracking rollout'
FROM "jobs"
WHERE NOT EXISTS (
  SELECT 1 FROM "job_completion_history" h WHERE h."job_id" = "jobs"."id"
);
