-- CreateEnum
CREATE TYPE "JobInvoiceStatus" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void');

-- CreateEnum
CREATE TYPE "JobInvoiceLineType" AS ENUM ('milestone_fee', 'service_fee', 'expense', 'adjustment', 'tax', 'credit');

-- CreateTable
CREATE TABLE "job_invoice_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject_line" TEXT,
    "template_definition" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_invoice_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_invoices" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "milestone_task_id" INTEGER,
    "job_invoice_template_id" INTEGER,
    "generated_by_profile_id" INTEGER,
    "issued_by_profile_id" INTEGER,
    "document_id" INTEGER,
    "invoice_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "JobInvoiceStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "expected_percent" DECIMAL(5,2),
    "subtotal_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_outstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "generated_at" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_invoice_lines" (
    "id" SERIAL NOT NULL,
    "job_invoice_id" INTEGER NOT NULL,
    "line_type" "JobInvoiceLineType" NOT NULL DEFAULT 'service_fee',
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_invoice_status_history" (
    "id" SERIAL NOT NULL,
    "job_invoice_id" INTEGER NOT NULL,
    "from_status" "JobInvoiceStatus",
    "to_status" "JobInvoiceStatus" NOT NULL,
    "notes" TEXT,
    "changed_by_profile_id" INTEGER,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_invoice_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_invoice_payment_applications" (
    "id" SERIAL NOT NULL,
    "job_invoice_id" INTEGER NOT NULL,
    "client_payment_id" INTEGER NOT NULL,
    "applied_amount" DECIMAL(14,2) NOT NULL,
    "applied_by_profile_id" INTEGER,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "job_invoice_payment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_invoice_templates_created_by_profile_id_idx" ON "job_invoice_templates"("created_by_profile_id");

-- CreateIndex
CREATE INDEX "job_invoice_templates_is_default_idx" ON "job_invoice_templates"("is_default");

-- CreateIndex
CREATE UNIQUE INDEX "job_invoices_milestone_task_id_key" ON "job_invoices"("milestone_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_invoices_invoice_number_key" ON "job_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "job_invoices_job_id_status_idx" ON "job_invoices"("job_id", "status");

-- CreateIndex
CREATE INDEX "job_invoices_client_id_status_idx" ON "job_invoices"("client_id", "status");

-- CreateIndex
CREATE INDEX "job_invoices_job_invoice_template_id_idx" ON "job_invoices"("job_invoice_template_id");

-- CreateIndex
CREATE INDEX "job_invoices_generated_by_profile_id_idx" ON "job_invoices"("generated_by_profile_id");

-- CreateIndex
CREATE INDEX "job_invoices_issued_by_profile_id_idx" ON "job_invoices"("issued_by_profile_id");

-- CreateIndex
CREATE INDEX "job_invoices_document_id_idx" ON "job_invoices"("document_id");

-- CreateIndex
CREATE INDEX "job_invoices_due_date_idx" ON "job_invoices"("due_date");

-- CreateIndex
CREATE INDEX "job_invoice_lines_job_invoice_id_sort_order_idx" ON "job_invoice_lines"("job_invoice_id", "sort_order");

-- CreateIndex
CREATE INDEX "job_invoice_status_history_job_invoice_id_changed_at_idx" ON "job_invoice_status_history"("job_invoice_id", "changed_at");

-- CreateIndex
CREATE INDEX "job_invoice_status_history_changed_by_profile_id_idx" ON "job_invoice_status_history"("changed_by_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_invoice_payment_applications_job_invoice_id_client_payment_id_key" ON "job_invoice_payment_applications"("job_invoice_id", "client_payment_id");

-- CreateIndex
CREATE INDEX "job_invoice_payment_applications_client_payment_id_idx" ON "job_invoice_payment_applications"("client_payment_id");

-- CreateIndex
CREATE INDEX "job_invoice_payment_applications_applied_by_profile_id_idx" ON "job_invoice_payment_applications"("applied_by_profile_id");

-- AddForeignKey
ALTER TABLE "job_invoice_templates" ADD CONSTRAINT "job_invoice_templates_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_milestone_task_id_fkey" FOREIGN KEY ("milestone_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_job_invoice_template_id_fkey" FOREIGN KEY ("job_invoice_template_id") REFERENCES "job_invoice_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_generated_by_profile_id_fkey" FOREIGN KEY ("generated_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_issued_by_profile_id_fkey" FOREIGN KEY ("issued_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoice_lines" ADD CONSTRAINT "job_invoice_lines_job_invoice_id_fkey" FOREIGN KEY ("job_invoice_id") REFERENCES "job_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoice_status_history" ADD CONSTRAINT "job_invoice_status_history_job_invoice_id_fkey" FOREIGN KEY ("job_invoice_id") REFERENCES "job_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoice_status_history" ADD CONSTRAINT "job_invoice_status_history_changed_by_profile_id_fkey" FOREIGN KEY ("changed_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoice_payment_applications" ADD CONSTRAINT "job_invoice_payment_applications_job_invoice_id_fkey" FOREIGN KEY ("job_invoice_id") REFERENCES "job_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoice_payment_applications" ADD CONSTRAINT "job_invoice_payment_applications_client_payment_id_fkey" FOREIGN KEY ("client_payment_id") REFERENCES "client_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoice_payment_applications" ADD CONSTRAINT "job_invoice_payment_applications_applied_by_profile_id_fkey" FOREIGN KEY ("applied_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
