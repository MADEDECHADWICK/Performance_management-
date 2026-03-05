-- CreateTable
CREATE TABLE "client_onboarding_checklists" (
    "id" SERIAL NOT NULL,
    "client_onboarding_id" INTEGER NOT NULL,
    "checklist_name" TEXT NOT NULL DEFAULT 'Standard Client Onboarding',
    "status" "ChecklistStatus" NOT NULL DEFAULT 'pending',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "completed_items" INTEGER NOT NULL DEFAULT 0,
    "completion_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "assigned_by_profile_id" INTEGER,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_onboarding_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_onboarding_checklist_items" (
    "id" SERIAL NOT NULL,
    "checklist_id" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_by_profile_id" INTEGER,
    "completed_at" TIMESTAMP(3),
    "requires_document" BOOLEAN NOT NULL DEFAULT false,
    "document_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_onboarding_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_onboarding_checklists_client_onboarding_id_key" ON "client_onboarding_checklists"("client_onboarding_id");

-- CreateIndex
CREATE INDEX "client_onboarding_checklists_assigned_by_profile_id_idx" ON "client_onboarding_checklists"("assigned_by_profile_id");

-- CreateIndex
CREATE INDEX "client_onboarding_checklist_items_checklist_id_idx" ON "client_onboarding_checklist_items"("checklist_id");

-- AddForeignKey
ALTER TABLE "client_onboarding_checklists" ADD CONSTRAINT "client_onboarding_checklists_client_onboarding_id_fkey" FOREIGN KEY ("client_onboarding_id") REFERENCES "client_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboarding_checklists" ADD CONSTRAINT "client_onboarding_checklists_assigned_by_profile_id_fkey" FOREIGN KEY ("assigned_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboarding_checklist_items" ADD CONSTRAINT "client_onboarding_checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "client_onboarding_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboarding_checklist_items" ADD CONSTRAINT "client_onboarding_checklist_items_completed_by_profile_id_fkey" FOREIGN KEY ("completed_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboarding_checklist_items" ADD CONSTRAINT "client_onboarding_checklist_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
