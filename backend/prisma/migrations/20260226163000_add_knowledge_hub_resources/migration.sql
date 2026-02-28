-- CreateTable
CREATE TABLE "knowledge_hub_resources" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "domain" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "submodules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "link_url" TEXT,
    "content" TEXT,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "created_by_profile_id" INTEGER,
    "updated_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_hub_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_hub_resources_domain_idx" ON "knowledge_hub_resources"("domain");

-- CreateIndex
CREATE INDEX "knowledge_hub_resources_resource_type_idx" ON "knowledge_hub_resources"("resource_type");

-- CreateIndex
CREATE INDEX "knowledge_hub_resources_is_published_idx" ON "knowledge_hub_resources"("is_published");

-- CreateIndex
CREATE INDEX "knowledge_hub_resources_is_featured_idx" ON "knowledge_hub_resources"("is_featured");

-- CreateIndex
CREATE INDEX "knowledge_hub_resources_updated_at_idx" ON "knowledge_hub_resources"("updated_at");

-- CreateIndex
CREATE INDEX "knowledge_hub_resources_submodules_gin_idx" ON "knowledge_hub_resources" USING GIN ("submodules");

-- CreateIndex
CREATE INDEX "knowledge_hub_resources_tags_gin_idx" ON "knowledge_hub_resources" USING GIN ("tags");

-- AddForeignKey
ALTER TABLE "knowledge_hub_resources"
ADD CONSTRAINT "knowledge_hub_resources_created_by_profile_id_fkey"
FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_hub_resources"
ADD CONSTRAINT "knowledge_hub_resources_updated_by_profile_id_fkey"
FOREIGN KEY ("updated_by_profile_id") REFERENCES "profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed starter resources
INSERT INTO "knowledge_hub_resources" (
  "title",
  "summary",
  "domain",
  "resource_type",
  "submodules",
  "tags",
  "link_url",
  "is_featured",
  "is_published",
  "published_at"
)
VALUES
  (
    'Accounting Close Checklist',
    'Month-end and year-end close checklist with control review points and sign-off order.',
    'accounting',
    'checklist',
    ARRAY['finance', 'reports', 'jobs']::TEXT[],
    ARRAY['month-end', 'close', 'controls']::TEXT[],
    'https://intranet.ronalds.local/knowledge/accounting-close-checklist',
    true,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'Tax Compliance Calendar Template',
    'Tax filing calendar template covering recurring VAT, PAYE, corporate, and statutory deadlines.',
    'tax',
    'template',
    ARRAY['finance', 'clients', 'jobs']::TEXT[],
    ARRAY['tax', 'deadlines', 'calendar']::TEXT[],
    'https://intranet.ronalds.local/knowledge/tax-compliance-calendar',
    true,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'Audit Planning Program',
    'Reusable risk-based audit planning guide with engagement scoping and evidence planning.',
    'audit',
    'guide',
    ARRAY['jobs', 'clients', 'reports']::TEXT[],
    ARRAY['audit', 'planning', 'risk']::TEXT[],
    'https://intranet.ronalds.local/knowledge/audit-planning-program',
    true,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'Management Accounts Review SOP',
    'Standard review sequence for management accounts, reconciliations, and partner sign-off.',
    'accounting',
    'policy',
    ARRAY['finance', 'dashboard']::TEXT[],
    ARRAY['management-accounts', 'review', 'sop']::TEXT[],
    'https://intranet.ronalds.local/knowledge/management-accounts-review',
    false,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'VAT Working Paper Pack',
    'Working paper structure and reconciliation template for indirect tax returns.',
    'tax',
    'template',
    ARRAY['finance', 'clients', 'documents']::TEXT[],
    ARRAY['vat', 'indirect-tax', 'working-paper']::TEXT[],
    'https://intranet.ronalds.local/knowledge/vat-working-paper-pack',
    false,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'Audit Evidence Index Standard',
    'Evidence indexing standard for request lists, tie-outs, and final file assembly.',
    'audit',
    'guide',
    ARRAY['documents', 'jobs', 'reports']::TEXT[],
    ARRAY['audit', 'evidence', 'file-management']::TEXT[],
    'https://intranet.ronalds.local/knowledge/audit-evidence-index',
    false,
    true,
    CURRENT_TIMESTAMP
  );
