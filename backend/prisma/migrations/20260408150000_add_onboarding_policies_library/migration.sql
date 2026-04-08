-- Create onboarding policy library separate from Knowledge Hub.
CREATE TABLE "onboarding_policies" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "section_key" TEXT NOT NULL DEFAULT 'general',
    "section_label" TEXT NOT NULL DEFAULT 'General',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "requires_acknowledgement" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "created_by_profile_id" INTEGER,
    "updated_by_profile_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_policies_slug_key" ON "onboarding_policies"("slug");
CREATE INDEX "onboarding_policies_section_key_order_index_idx" ON "onboarding_policies"("section_key", "order_index");
CREATE INDEX "onboarding_policies_is_published_is_active_idx" ON "onboarding_policies"("is_published", "is_active");

ALTER TABLE "onboarding_policies"
ADD CONSTRAINT "onboarding_policies_created_by_profile_id_fkey"
FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onboarding_policies"
ADD CONSTRAINT "onboarding_policies_updated_by_profile_id_fkey"
FOREIGN KEY ("updated_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
