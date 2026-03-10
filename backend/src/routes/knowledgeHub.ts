import { Router } from "express";
import { Prisma } from "@prisma/client";
import { body, param, query } from "express-validator";
import prisma from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validate";
import { ensureAuthorizationContext } from "../services/authorizationContext.service";
import fs from "fs";
import multer from "multer";
import path from "path";
import {
  SYSTEM_MODULES,
  hasModuleAccess,
  isModuleKey,
} from "../services/moduleAccess.service";
import { requireModuleAccess } from "../middleware/requireModuleAccess";

const router = Router();

const KNOWLEDGE_DOMAINS = [
  "accounting",
  "tax",
  "audit",
  "compliance",
  "advisory",
  "operations",
] as const;

const KNOWLEDGE_RESOURCE_TYPES = [
  "guide",
  "template",
  "checklist",
  "policy",
  "article",
  "video",
  "tool",
] as const;

const KNOWLEDGE_ASSET_KINDS = ["document", "image", "video", "link"] as const;

const uploadRoot = path.join(process.cwd(), "uploads", "knowledge-hub");
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

const excludedScopeModules = new Set(["access_control", "settings", "knowledge_hub"]);
const moduleScopeOptions = SYSTEM_MODULES.filter(
  (item) => !excludedScopeModules.has(item.key)
).map((item) => ({
  key: item.key,
  label: item.label,
}));

type KnowledgeHubRow = {
  id: number;
  title: string;
  summary: string | null;
  domain: string;
  resource_type: string;
  asset_kind: string;
  submodules: string[] | null;
  tags: string[] | null;
  link_url: string | null;
  asset_file_name: string | null;
  asset_mime_type: string | null;
  content: string | null;
  allow_download: boolean;
  is_featured: boolean;
  is_published: boolean;
  published_at: Date | null;
  created_by_profile_id: number | null;
  updated_by_profile_id: number | null;
  created_at: Date;
  updated_at: Date;
  created_by_name: string | null;
  updated_by_name: string | null;
};

const normalizeModuleKeyInput = (value: string) =>
  value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();

const parseStringList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => String(item).trim())
            .filter(Boolean);
        }
      } catch {
        return [];
      }
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeModuleScopes = (value: unknown) =>
  Array.from(
    new Set(
      parseStringList(value)
        .map(normalizeModuleKeyInput)
        .filter((item) => isModuleKey(item))
        .filter((item) => !excludedScopeModules.has(item))
    )
  );

const normalizeTags = (value: unknown) =>
  Array.from(
    new Set(
      parseStringList(value)
        .map((item) => item.toLowerCase())
        .filter((item) => item.length <= 40)
    )
  ).slice(0, 20);

const toSqlTextArray = (values: string[]) =>
  values.length > 0
    ? Prisma.sql`ARRAY[${Prisma.join(values)}]::TEXT[]`
    : Prisma.sql`ARRAY[]::TEXT[]`;

const parseBooleanInput = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

const toNullableTrimmedString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const validateLinkUrlInput = (value: unknown) => {
  const trimmed = toNullableTrimmedString(value);
  if (!trimmed) return true;
  if (trimmed.startsWith("/uploads/knowledge-hub/")) return true;

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("linkUrl must use http or https");
    }
    return true;
  } catch {
    throw new Error("linkUrl must be a valid URL");
  }
};

const isLocalKnowledgeHubUpload = (value: string | null) =>
  typeof value === "string" && value.startsWith("/uploads/knowledge-hub/");

const inferAssetKindFromUpload = (
  file: Express.Multer.File | undefined
): (typeof KNOWLEDGE_ASSET_KINDS)[number] => {
  if (!file?.mimetype) return "document";
  if (file.mimetype.startsWith("image/")) return "image";
  if (file.mimetype.startsWith("video/")) return "video";
  return "document";
};

const deleteLocalKnowledgeHubUpload = (linkUrl: string | null) => {
  if (!isLocalKnowledgeHubUpload(linkUrl)) return;

  const fileName = path.basename(linkUrl || "");
  if (!fileName) return;

  const filePath = path.join(uploadRoot, fileName);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn("Failed to remove knowledge hub upload:", filePath, error);
  }
};

const toAssetKind = (
  value: unknown,
  fallback: (typeof KNOWLEDGE_ASSET_KINDS)[number] = "link"
): (typeof KNOWLEDGE_ASSET_KINDS)[number] => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (isKnownAssetKind(normalized)) {
    return normalized as (typeof KNOWLEDGE_ASSET_KINDS)[number];
  }
  return fallback;
};

const buildUploadedAsset = (file: Express.Multer.File | undefined) => {
  if (!file) return null;

  return {
    assetKind: inferAssetKindFromUpload(file),
    linkUrl: `/uploads/knowledge-hub/${file.filename}`,
    assetFileName: file.originalname || file.filename,
    assetMimeType: file.mimetype || null,
  };
};

const toSafeCount = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
};

const hasKey = (source: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(source, key);

const withArrayDefaults = (row: KnowledgeHubRow) => ({
  ...row,
  submodules: Array.isArray(row.submodules) ? row.submodules : [],
  tags: Array.isArray(row.tags) ? row.tags : [],
});

const knowledgeResourceSelectSql = Prisma.sql`
  SELECT
    r.id,
    r.title,
    r.summary,
    r.domain,
    r.resource_type,
    r.asset_kind,
    r.submodules,
    r.tags,
    r.link_url,
    r.asset_file_name,
    r.asset_mime_type,
    r.content,
    r.allow_download,
    r.is_featured,
    r.is_published,
    r.published_at,
    r.created_by_profile_id,
    r.updated_by_profile_id,
    r.created_at,
    r.updated_at,
    NULLIF(TRIM(CONCAT(COALESCE(creator.first_name, ''), ' ', COALESCE(creator.last_name, ''))), '') AS created_by_name,
    NULLIF(TRIM(CONCAT(COALESCE(editor.first_name, ''), ' ', COALESCE(editor.last_name, ''))), '') AS updated_by_name
  FROM knowledge_hub_resources r
  LEFT JOIN profiles creator ON creator.id = r.created_by_profile_id
  LEFT JOIN profiles editor ON editor.id = r.updated_by_profile_id
`;

const hasKnowledgeHubWriteAccess = async (req: AuthRequest) => {
  const authz = await ensureAuthorizationContext(req);
  return hasModuleAccess({
    moduleKey: "knowledge_hub",
    action: "write",
    rolePolicies: authz.moduleRolePolicies,
  });
};

const isKnownDomain = (value: string) =>
  (KNOWLEDGE_DOMAINS as readonly string[]).includes(value);

const isKnownResourceType = (value: string) =>
  (KNOWLEDGE_RESOURCE_TYPES as readonly string[]).includes(value);

const isKnownAssetKind = (value: string) =>
  (KNOWLEDGE_ASSET_KINDS as readonly string[]).includes(value);

const listValidators = [
  query("search").optional().isString().isLength({ max: 120 }),
  query("domain")
    .optional()
    .custom((value) => isKnownDomain(String(value).toLowerCase()))
    .withMessage("domain must be a supported value"),
  query("resourceType")
    .optional()
    .custom((value) => isKnownResourceType(String(value).toLowerCase()))
    .withMessage("resourceType must be a supported value"),
  query("moduleKey")
    .optional()
    .custom((value) => isModuleKey(normalizeModuleKeyInput(String(value))))
    .withMessage("moduleKey must be a valid module"),
  query("featured").optional().isIn(["true", "false"]),
  query("includeDrafts").optional().isIn(["true", "false"]),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).toInt(),
];

const resourceIdValidators = [param("resourceId").isInt({ min: 1 }).toInt()];

const validateSubmoduleInput = (value: unknown) => {
  const items = parseStringList(value);
  const normalized = items.map(normalizeModuleKeyInput);
  const invalid = normalized.filter(
    (item) => !isModuleKey(item) || excludedScopeModules.has(item)
  );
  if (invalid.length > 0) {
    throw new Error("submodules must use supported module keys");
  }
  return true;
};

const validateTagsInput = (value: unknown) => {
  const items = parseStringList(value);
  if (items.length > 20) {
    throw new Error("tags cannot exceed 20 values");
  }
  const oversized = items.find((item) => item.length > 40);
  if (oversized) {
    throw new Error("tag length cannot exceed 40 characters");
  }
  return true;
};

const createValidators = [
  body("title").isString().trim().isLength({ min: 3, max: 200 }),
  body("summary").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 2000 }),
  body("domain")
    .isString()
    .custom((value) => isKnownDomain(String(value).toLowerCase()))
    .withMessage("domain must be a supported value"),
  body("resourceType")
    .isString()
    .custom((value) => isKnownResourceType(String(value).toLowerCase()))
    .withMessage("resourceType must be a supported value"),
  body("assetKind")
    .optional()
    .custom((value) => isKnownAssetKind(String(value).toLowerCase()))
    .withMessage("assetKind must be a supported value"),
  body("submodules").optional().custom(validateSubmoduleInput),
  body("tags").optional().custom(validateTagsInput),
  body("linkUrl")
    .optional({ nullable: true, checkFalsy: true })
    .custom(validateLinkUrlInput)
    .isLength({ max: 500 }),
  body("content").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 20000 }),
  body("allowDownload").optional().isBoolean(),
  body("isFeatured").optional().isBoolean(),
  body("isPublished").optional().isBoolean(),
];

const updateValidators = [
  ...resourceIdValidators,
  body("title").optional().isString().trim().isLength({ min: 3, max: 200 }),
  body("summary").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 2000 }),
  body("domain")
    .optional()
    .custom((value) => isKnownDomain(String(value).toLowerCase()))
    .withMessage("domain must be a supported value"),
  body("resourceType")
    .optional()
    .custom((value) => isKnownResourceType(String(value).toLowerCase()))
    .withMessage("resourceType must be a supported value"),
  body("assetKind")
    .optional()
    .custom((value) => isKnownAssetKind(String(value).toLowerCase()))
    .withMessage("assetKind must be a supported value"),
  body("submodules").optional().custom(validateSubmoduleInput),
  body("tags").optional().custom(validateTagsInput),
  body("linkUrl")
    .optional({ nullable: true, checkFalsy: true })
    .custom(validateLinkUrlInput)
    .isLength({ max: 500 }),
  body("content").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 20000 }),
  body("allowDownload").optional().isBoolean(),
  body("isFeatured").optional().isBoolean(),
  body("isPublished").optional().isBoolean(),
];

const getResourceById = async (resourceId: number, includeDrafts: boolean) => {
  const visibilitySql = includeDrafts ? Prisma.empty : Prisma.sql`AND r.is_published = TRUE`;
  const rows = await prisma.$queryRaw<KnowledgeHubRow[]>(Prisma.sql`
    ${knowledgeResourceSelectSql}
    WHERE r.id = ${resourceId}
    ${visibilitySql}
    LIMIT 1
  `);

  return rows[0] ? withArrayDefaults(rows[0]) : null;
};

router.get("/meta", (_req, res) => {
  res.json({
    domains: KNOWLEDGE_DOMAINS,
    resourceTypes: KNOWLEDGE_RESOURCE_TYPES,
    assetKinds: KNOWLEDGE_ASSET_KINDS,
    modules: moduleScopeOptions,
  });
});

router.get(
  "/",
  ...listValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const domain = typeof req.query.domain === "string" ? req.query.domain.trim().toLowerCase() : "";
      const resourceType =
        typeof req.query.resourceType === "string"
          ? req.query.resourceType.trim().toLowerCase()
          : "";
      const moduleKey =
        typeof req.query.moduleKey === "string"
          ? normalizeModuleKeyInput(req.query.moduleKey)
          : "";

      const featuredOnly = parseBooleanInput(req.query.featured, false);
      const includeDraftsRequested = parseBooleanInput(req.query.includeDrafts, false);
      const canWrite = await hasKnowledgeHubWriteAccess(req);
      const includeDrafts = includeDraftsRequested && canWrite;

      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 20);
      const offset = (page - 1) * pageSize;

      const whereClauses: Prisma.Sql[] = [];

      if (!includeDrafts) {
        whereClauses.push(Prisma.sql`r.is_published = TRUE`);
      }

      if (search) {
        const searchLike = `%${search}%`;
        whereClauses.push(Prisma.sql`
          (
            LOWER(r.title) LIKE ${searchLike}
            OR LOWER(COALESCE(r.summary, '')) LIKE ${searchLike}
            OR LOWER(COALESCE(r.content, '')) LIKE ${searchLike}
            OR EXISTS (
              SELECT 1
              FROM unnest(r.tags) AS tag
              WHERE LOWER(tag) LIKE ${searchLike}
            )
          )
        `);
      }

      if (domain) {
        whereClauses.push(Prisma.sql`r.domain = ${domain}`);
      }

      if (resourceType) {
        whereClauses.push(Prisma.sql`r.resource_type = ${resourceType}`);
      }

      if (moduleKey) {
        whereClauses.push(
          Prisma.sql`(${moduleKey} = ANY(r.submodules) OR cardinality(r.submodules) = 0)`
        );
      }

      if (featuredOnly) {
        whereClauses.push(Prisma.sql`r.is_featured = TRUE`);
      }

      const whereSql =
        whereClauses.length > 0
          ? Prisma.sql`WHERE ${Prisma.join(whereClauses, " AND ")}`
          : Prisma.empty;

      const rows = await prisma.$queryRaw<KnowledgeHubRow[]>(Prisma.sql`
        ${knowledgeResourceSelectSql}
        ${whereSql}
        ORDER BY r.is_featured DESC, r.updated_at DESC, r.id DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `);

      const countRows = await prisma.$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM knowledge_hub_resources r
        ${whereSql}
      `);

      return res.json({
        resources: rows.map(withArrayDefaults),
        total: toSafeCount(countRows[0]?.total),
        page,
        pageSize,
      });
    } catch (error: any) {
      console.error("Failed to list knowledge hub resources:", error);
      return res.status(500).json({ error: "Failed to load knowledge hub resources" });
    }
  }
);

router.get(
  "/:resourceId",
  ...resourceIdValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    try {
      const resourceId = Number(req.params.resourceId);
      const canWrite = await hasKnowledgeHubWriteAccess(req);
      const row = await getResourceById(resourceId, canWrite);

      if (!row) {
        return res.status(404).json({ error: "Knowledge resource not found" });
      }

      return res.json(row);
    } catch (error: any) {
      console.error("Failed to load knowledge hub resource:", error);
      return res.status(500).json({ error: "Failed to load knowledge hub resource" });
    }
  }
);

router.post(
  "/",
  requireModuleAccess("knowledge_hub", "write"),
  upload.single("file"),
  ...createValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    const uploadedAsset = buildUploadedAsset(req.file);
    try {
      const actorProfileId = req.user?.profileId ? Number(req.user.profileId) : null;
      const payload = req.body as Record<string, unknown>;

      const title = String(payload.title || "").trim();
      const summary = toNullableTrimmedString(payload.summary);
      const domain = String(payload.domain || "").trim().toLowerCase();
      const resourceType = String(payload.resourceType || "").trim().toLowerCase();
      const assetKind = toAssetKind(payload.assetKind, uploadedAsset?.assetKind ?? "link");
      const submodules = normalizeModuleScopes(payload.submodules);
      const tags = normalizeTags(payload.tags);
      const linkUrl = uploadedAsset?.linkUrl ?? toNullableTrimmedString(payload.linkUrl);
      const assetFileName = uploadedAsset?.assetFileName ?? null;
      const assetMimeType = uploadedAsset?.assetMimeType ?? null;
      const content = toNullableTrimmedString(payload.content);
      const allowDownload = parseBooleanInput(payload.allowDownload, true);
      const isFeatured = parseBooleanInput(payload.isFeatured, false);
      const isPublished = parseBooleanInput(payload.isPublished, true);

      const createdRows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        INSERT INTO knowledge_hub_resources (
          title,
          summary,
          domain,
          resource_type,
          asset_kind,
          submodules,
          tags,
          link_url,
          asset_file_name,
          asset_mime_type,
          content,
          allow_download,
          is_featured,
          is_published,
          published_at,
          created_by_profile_id,
          updated_by_profile_id
        )
        VALUES (
          ${title},
          ${summary},
          ${domain},
          ${resourceType},
          ${assetKind},
          ${toSqlTextArray(submodules)},
          ${toSqlTextArray(tags)},
          ${linkUrl},
          ${assetFileName},
          ${assetMimeType},
          ${content},
          ${allowDownload},
          ${isFeatured},
          ${isPublished},
          CASE WHEN ${isPublished} THEN NOW() ELSE NULL END,
          ${actorProfileId},
          ${actorProfileId}
        )
        RETURNING id
      `);

      const resourceId = createdRows[0]?.id;
      if (!resourceId) {
        return res.status(500).json({ error: "Failed to create knowledge resource" });
      }

      const created = await getResourceById(resourceId, true);
      return res.status(201).json(created);
    } catch (error: any) {
      if (uploadedAsset) {
        deleteLocalKnowledgeHubUpload(uploadedAsset.linkUrl);
      }
      console.error("Failed to create knowledge hub resource:", error);
      return res.status(500).json({ error: "Failed to create knowledge hub resource" });
    }
  }
);

router.patch(
  "/:resourceId",
  requireModuleAccess("knowledge_hub", "write"),
  upload.single("file"),
  ...updateValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    const uploadedAsset = buildUploadedAsset(req.file);
    try {
      const resourceId = Number(req.params.resourceId);
      const actorProfileId = req.user?.profileId ? Number(req.user.profileId) : null;
      const payload = req.body as Record<string, unknown>;
      const existing = await getResourceById(resourceId, true);

      if (!existing) {
        if (uploadedAsset) {
          deleteLocalKnowledgeHubUpload(uploadedAsset.linkUrl);
        }
        return res.status(404).json({ error: "Knowledge resource not found" });
      }

      const setClauses: Prisma.Sql[] = [
        Prisma.sql`updated_at = NOW()`,
        Prisma.sql`updated_by_profile_id = ${actorProfileId}`,
      ];

      if (hasKey(payload, "title")) {
        const title = String(payload.title || "").trim();
        setClauses.push(Prisma.sql`title = ${title}`);
      }

      if (hasKey(payload, "summary")) {
        const summary = toNullableTrimmedString(payload.summary);
        setClauses.push(Prisma.sql`summary = ${summary}`);
      }

      if (hasKey(payload, "domain")) {
        const domain = String(payload.domain || "").trim().toLowerCase();
        setClauses.push(Prisma.sql`domain = ${domain}`);
      }

      if (hasKey(payload, "resourceType")) {
        const resourceType = String(payload.resourceType || "").trim().toLowerCase();
        setClauses.push(Prisma.sql`resource_type = ${resourceType}`);
      }

      if (hasKey(payload, "assetKind") || uploadedAsset) {
        const assetKind = toAssetKind(
          payload.assetKind,
          uploadedAsset?.assetKind ?? toAssetKind(existing.asset_kind)
        );
        setClauses.push(Prisma.sql`asset_kind = ${assetKind}`);
      }

      if (hasKey(payload, "submodules")) {
        setClauses.push(Prisma.sql`submodules = ${toSqlTextArray(normalizeModuleScopes(payload.submodules))}`);
      }

      if (hasKey(payload, "tags")) {
        setClauses.push(Prisma.sql`tags = ${toSqlTextArray(normalizeTags(payload.tags))}`);
      }

      if (hasKey(payload, "linkUrl") && !uploadedAsset) {
        const linkUrl = toNullableTrimmedString(payload.linkUrl);
        setClauses.push(Prisma.sql`link_url = ${linkUrl}`);
        setClauses.push(Prisma.sql`asset_file_name = NULL`);
        setClauses.push(Prisma.sql`asset_mime_type = NULL`);
      }

      if (uploadedAsset) {
        setClauses.push(Prisma.sql`link_url = ${uploadedAsset.linkUrl}`);
        setClauses.push(Prisma.sql`asset_file_name = ${uploadedAsset.assetFileName}`);
        setClauses.push(Prisma.sql`asset_mime_type = ${uploadedAsset.assetMimeType}`);
      }

      if (hasKey(payload, "content")) {
        const content = toNullableTrimmedString(payload.content);
        setClauses.push(Prisma.sql`content = ${content}`);
      }

      if (hasKey(payload, "allowDownload")) {
        setClauses.push(
          Prisma.sql`allow_download = ${parseBooleanInput(payload.allowDownload, true)}`
        );
      }

      if (hasKey(payload, "isFeatured")) {
        setClauses.push(Prisma.sql`is_featured = ${parseBooleanInput(payload.isFeatured, false)}`);
      }

      if (hasKey(payload, "isPublished")) {
        const isPublished = parseBooleanInput(payload.isPublished, true);
        setClauses.push(Prisma.sql`is_published = ${isPublished}`);
        setClauses.push(
          Prisma.sql`published_at = CASE WHEN ${isPublished} THEN COALESCE(published_at, NOW()) ELSE NULL END`
        );
      }

      if (setClauses.length <= 2) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const updatedRows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        UPDATE knowledge_hub_resources
        SET ${Prisma.join(setClauses, ", ")}
        WHERE id = ${resourceId}
        RETURNING id
      `);

      if (!updatedRows[0]?.id) {
        if (uploadedAsset) {
          deleteLocalKnowledgeHubUpload(uploadedAsset.linkUrl);
        }
        return res.status(404).json({ error: "Knowledge resource not found" });
      }

      if (
        isLocalKnowledgeHubUpload(existing.link_url) &&
        ((uploadedAsset && existing.link_url !== uploadedAsset.linkUrl) || hasKey(payload, "linkUrl"))
      ) {
        deleteLocalKnowledgeHubUpload(existing.link_url);
      }

      const updated = await getResourceById(resourceId, true);
      return res.json(updated);
    } catch (error: any) {
      if (uploadedAsset) {
        deleteLocalKnowledgeHubUpload(uploadedAsset.linkUrl);
      }
      console.error("Failed to update knowledge hub resource:", error);
      return res.status(500).json({ error: "Failed to update knowledge hub resource" });
    }
  }
);

router.delete(
  "/:resourceId",
  requireModuleAccess("knowledge_hub", "admin"),
  ...resourceIdValidators,
  handleValidationErrors,
  async (req, res) => {
    try {
      const resourceId = Number(req.params.resourceId);
      const existing = await getResourceById(resourceId, true);
      if (!existing) {
        return res.status(404).json({ error: "Knowledge resource not found" });
      }

      const deleted = await prisma.$executeRaw`
        DELETE FROM knowledge_hub_resources WHERE id = ${resourceId}
      `;

      if (!deleted) {
        return res.status(404).json({ error: "Knowledge resource not found" });
      }

      deleteLocalKnowledgeHubUpload(existing.link_url);

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to delete knowledge hub resource:", error);
      return res.status(500).json({ error: "Failed to delete knowledge hub resource" });
    }
  }
);

export { KNOWLEDGE_DOMAINS, KNOWLEDGE_RESOURCE_TYPES, KNOWLEDGE_ASSET_KINDS };
export default router;
