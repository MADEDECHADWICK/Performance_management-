-- AlterEnum
ALTER TYPE "RequisitionApprovalStageType" ADD VALUE IF NOT EXISTS 'custom';

-- DropForeignKey
ALTER TABLE "issued_certificates"
DROP CONSTRAINT "issued_certificates_certificate_template_id_fkey";

-- AlterTable
ALTER TABLE "issued_certificates"
ADD COLUMN "global_certificate_template_id" INTEGER,
ALTER COLUMN "certificate_template_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "global_certificate_templates" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "template_definition" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "background_document_id" INTEGER,
    "signature_document_id" INTEGER,
    "issued_by_label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_profile_id" INTEGER,
    "updated_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "global_certificate_templates_key_key"
ON "global_certificate_templates"("key");

-- CreateIndex
CREATE INDEX "global_certificate_templates_background_document_id_idx"
ON "global_certificate_templates"("background_document_id");

-- CreateIndex
CREATE INDEX "global_certificate_templates_signature_document_id_idx"
ON "global_certificate_templates"("signature_document_id");

-- CreateIndex
CREATE INDEX "global_certificate_templates_created_by_profile_id_idx"
ON "global_certificate_templates"("created_by_profile_id");

-- CreateIndex
CREATE INDEX "global_certificate_templates_updated_by_profile_id_idx"
ON "global_certificate_templates"("updated_by_profile_id");

-- CreateIndex
CREATE INDEX "global_certificate_templates_is_active_idx"
ON "global_certificate_templates"("is_active");

-- CreateIndex
CREATE INDEX "issued_certificates_global_certificate_template_id_idx"
ON "issued_certificates"("global_certificate_template_id");

-- AddForeignKey
ALTER TABLE "global_certificate_templates"
ADD CONSTRAINT "global_certificate_templates_background_document_id_fkey"
FOREIGN KEY ("background_document_id") REFERENCES "documents"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_certificate_templates"
ADD CONSTRAINT "global_certificate_templates_signature_document_id_fkey"
FOREIGN KEY ("signature_document_id") REFERENCES "documents"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_certificate_templates"
ADD CONSTRAINT "global_certificate_templates_created_by_profile_id_fkey"
FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_certificate_templates"
ADD CONSTRAINT "global_certificate_templates_updated_by_profile_id_fkey"
FOREIGN KEY ("updated_by_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates"
ADD CONSTRAINT "issued_certificates_certificate_template_id_fkey"
FOREIGN KEY ("certificate_template_id") REFERENCES "certificate_templates"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_certificates"
ADD CONSTRAINT "issued_certificates_global_certificate_template_id_fkey"
FOREIGN KEY ("global_certificate_template_id") REFERENCES "global_certificate_templates"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
