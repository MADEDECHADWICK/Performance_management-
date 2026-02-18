/*
  Warnings:

  - You are about to drop the column `ethics_risk_flag` on the `kpis` table. All the data in the column will be lost.
  - You are about to drop the column `quality_floor_note` on the `kpis` table. All the data in the column will be lost.
  - You are about to drop the column `quality_floor_threshold` on the `kpis` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "evaluation_definitions" ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoring_config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "evaluation_templates" ALTER COLUMN "competencies" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "kpis" DROP COLUMN "ethics_risk_flag",
DROP COLUMN "quality_floor_note",
DROP COLUMN "quality_floor_threshold";

-- AlterTable
ALTER TABLE "performance_scores" ALTER COLUMN "score_breakdown" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "position_roles" ALTER COLUMN "default_access" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "project_evaluations" ALTER COLUMN "scores" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "workflow_assignments" ALTER COLUMN "completed_steps" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "workflow_definitions" ALTER COLUMN "conditions" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "actions" SET DEFAULT '[]'::jsonb;
