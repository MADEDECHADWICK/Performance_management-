-- AlterTable: add firm_template_id to balanced_scorecard_kpis (nullable self-reference)
ALTER TABLE "balanced_scorecard_kpis" ADD COLUMN "firm_template_id" INTEGER;

-- AddForeignKey
ALTER TABLE "balanced_scorecard_kpis" ADD CONSTRAINT "balanced_scorecard_kpis_firm_template_id_fkey"
  FOREIGN KEY ("firm_template_id") REFERENCES "balanced_scorecard_kpis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "balanced_scorecard_kpis_firm_template_id_idx" ON "balanced_scorecard_kpis"("firm_template_id");
