-- CreateEnum
CREATE TYPE "TrainingRecordType" AS ENUM ('internal', 'external', 'certification', 'workshop');

-- CreateEnum
CREATE TYPE "TrainingRecordStatus" AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "training_records" (
    "id" SERIAL NOT NULL,
    "employee_profile_id" INTEGER,
    "created_by_profile_id" INTEGER NOT NULL,
    "department_id" INTEGER,
    "course_name" TEXT NOT NULL,
    "training_type" "TrainingRecordType" NOT NULL DEFAULT 'internal',
    "status" "TrainingRecordStatus" NOT NULL DEFAULT 'planned',
    "delivery_mode" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "provider" TEXT,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "completion_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "certificate_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_records_employee_profile_id_idx" ON "training_records"("employee_profile_id");

-- CreateIndex
CREATE INDEX "training_records_created_by_profile_id_idx" ON "training_records"("created_by_profile_id");

-- CreateIndex
CREATE INDEX "training_records_department_id_idx" ON "training_records"("department_id");

-- CreateIndex
CREATE INDEX "training_records_status_start_date_idx" ON "training_records"("status", "start_date");

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
