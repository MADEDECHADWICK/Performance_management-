ALTER TABLE "knowledge_hub_resources"
ADD COLUMN "asset_kind" TEXT NOT NULL DEFAULT 'link',
ADD COLUMN "asset_file_name" TEXT,
ADD COLUMN "asset_mime_type" TEXT;
