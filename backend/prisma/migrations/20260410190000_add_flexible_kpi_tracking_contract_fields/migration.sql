ALTER TABLE "balanced_scorecard_kpis"
ADD COLUMN "tracking_mode" TEXT NOT NULL DEFAULT 'template',
ADD COLUMN "measurement_type" TEXT,
ADD COLUMN "target_direction" TEXT,
ADD COLUMN "target_value" DECIMAL(14, 2),
ADD COLUMN "current_actual_value" DECIMAL(14, 2),
ADD COLUMN "last_measurement_note" TEXT;
