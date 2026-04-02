import { Router } from "express";
import { Prisma } from "@prisma/client";
import { body, param, query } from "express-validator";
import prisma from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { handleValidationErrors } from "../middleware/validate";
import { ensureAuthorizationContext } from "../services/authorizationContext.service";
import fs from "fs";
import path from "path";
import {
  SYSTEM_MODULES,
  hasModuleAccess,
  isModuleKey,
} from "../services/moduleAccess.service";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import {
  buildDiskUpload,
  buildPublicUploadPath,
  getPublicUploadPrefix,
  resolveLocalUploadPath,
} from "../config/uploads";
import { logger, toLogContext } from "../lib/logger";
import { rejectMultipartDiskUploadsDisabled } from "../middleware/rejectMultipartDiskUploads";
import {
  submitKnowledgeHubQuizAttempt,
  updateKnowledgeHubProgress,
} from "../services/learningDevelopment.service";

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
const KNOWLEDGE_COMPLETION_MODES = [
  "video_end",
  "watch_percent",
  "document_scroll",
  "manual",
] as const;

const localKnowledgeHubUploadPrefix = `${getPublicUploadPrefix("knowledge-hub")}/`;
const upload = buildDiskUpload("knowledge-hub");

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
  estimated_duration_minutes: number | null;
  completion_mode: string;
  completion_threshold_percent: Prisma.Decimal | number | null;
  min_read_seconds: number | null;
  points_on_completion: number;
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

const parseNullableInt = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const parseNullablePercentage = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return Math.round(parsed * 100) / 100;
};

const withStatusCode = (message: string, statusCode: number) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
};

const toNullableTrimmedString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const validateLinkUrlInput = (value: unknown) => {
  const trimmed = toNullableTrimmedString(value);
  if (!trimmed) return true;
  if (trimmed.startsWith(localKnowledgeHubUploadPrefix)) return true;

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
  typeof value === "string" && value.startsWith(localKnowledgeHubUploadPrefix);

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

  const filePath = resolveLocalUploadPath("knowledge-hub", fileName);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    logger.warn("knowledge_hub_upload_delete_failed", {
      filePath,
      ...toLogContext(error),
    });
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
    linkUrl: buildPublicUploadPath("knowledge-hub", file.filename),
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
  completion_threshold_percent:
    row.completion_threshold_percent === null
      ? null
      : Number(row.completion_threshold_percent),
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
    r.estimated_duration_minutes,
    r.completion_mode,
    r.completion_threshold_percent,
    r.min_read_seconds,
    r.points_on_completion,
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

const isKnownCompletionMode = (value: string) =>
  (KNOWLEDGE_COMPLETION_MODES as readonly string[]).includes(value);

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
  body("estimatedDurationMinutes").optional({ nullable: true }).isInt({ min: 0, max: 1440 }).toInt(),
  body("completionMode")
    .optional()
    .custom((value) => isKnownCompletionMode(String(value)))
    .withMessage("completionMode must be a supported value"),
  body("completionThresholdPercent")
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .toFloat(),
  body("minReadSeconds").optional({ nullable: true }).isInt({ min: 0, max: 86400 }).toInt(),
  body("pointsOnCompletion").optional().isInt({ min: 0, max: 100000 }).toInt(),
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
  body("estimatedDurationMinutes").optional({ nullable: true }).isInt({ min: 0, max: 1440 }).toInt(),
  body("completionMode")
    .optional()
    .custom((value) => isKnownCompletionMode(String(value)))
    .withMessage("completionMode must be a supported value"),
  body("completionThresholdPercent")
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .toFloat(),
  body("minReadSeconds").optional({ nullable: true }).isInt({ min: 0, max: 86400 }).toInt(),
  body("pointsOnCompletion").optional().isInt({ min: 0, max: 100000 }).toInt(),
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

const serializeKnowledgeQuiz = (
  quiz: {
    id: number;
    resourceId: number;
    title: string;
    passMark: Prisma.Decimal | number;
    pointsOnPass: number;
    attemptLimit: number | null;
    isActive: boolean;
    questions: Array<{
      id: number;
      questionType: string;
      prompt: string;
      displayOrder: number;
      required: boolean;
      explanation: string | null;
      options: Array<{
        id: number;
        label: string;
        displayOrder: number;
        isCorrect: boolean;
      }>;
    }>;
  },
  includeCorrectAnswers: boolean
) => ({
  id: quiz.id,
  resourceId: quiz.resourceId,
  title: quiz.title,
  passMark: Number(quiz.passMark),
  pointsOnPass: quiz.pointsOnPass,
  attemptLimit: quiz.attemptLimit,
  isActive: quiz.isActive,
  questions: quiz.questions.map((question) => ({
    id: question.id,
    questionType: question.questionType,
    prompt: question.prompt,
    displayOrder: question.displayOrder,
    required: question.required,
    explanation: question.explanation,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      displayOrder: option.displayOrder,
      ...(includeCorrectAnswers ? { isCorrect: option.isCorrect } : {}),
    })),
  })),
});

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
      logger.error("knowledge_hub_resource_list_failed", toLogContext(error));
      return res.status(500).json({ error: "Failed to load knowledge hub resources" });
    }
  }
);

router.get("/points/me", async (req: AuthRequest, res) => {
  try {
    const profileId = req.user?.profileId ? Number(req.user.profileId) : null;
    if (!profileId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [entries, aggregate] = await Promise.all([
      prisma.learningPointLedger.findMany({
        where: { profileId },
        orderBy: [{ awardedAt: "desc" }, { id: "desc" }],
        take: 50,
      }),
      prisma.learningPointLedger.aggregate({
        where: { profileId },
        _sum: { points: true },
      }),
    ]);

    return res.json({
      totalPoints: aggregate._sum.points ?? 0,
      entries,
    });
  } catch (error: any) {
    logger.error("knowledge_hub_points_load_failed", toLogContext(error));
    return res.status(500).json({ error: "Failed to load learning points" });
  }
});

router.get(
  "/:resourceId/progress",
  ...resourceIdValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    try {
      const profileId = req.user?.profileId ? Number(req.user.profileId) : null;
      if (!profileId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const resourceId = Number(req.params.resourceId);
      const resource = await prisma.knowledgeHubResource.findUnique({
        where: { id: resourceId },
        select: {
          id: true,
          pointsOnCompletion: true,
          completionMode: true,
          completionThresholdPercent: true,
          minReadSeconds: true,
          quiz: {
            select: { id: true },
          },
        },
      });

      if (!resource) {
        return res.status(404).json({ error: "Knowledge resource not found" });
      }

      const [progress, points] = await Promise.all([
        prisma.knowledgeHubResourceProgress.findUnique({
          where: {
            resourceId_profileId: {
              resourceId,
              profileId,
            },
          },
        }),
        prisma.learningPointLedger.findMany({
          where: {
            profileId,
            OR: [
              {
                eventType: "knowledge_resource_completed",
                sourceType: "knowledge_resource",
                sourceId: resourceId,
              },
              ...(resource.quiz?.id
                ? [
                    {
                      eventType: "knowledge_quiz_passed" as const,
                      sourceType: "knowledge_quiz" as const,
                      sourceId: resource.quiz.id,
                    },
                  ]
                : []),
            ],
          },
          select: {
            id: true,
            eventType: true,
            sourceType: true,
            sourceId: true,
            points: true,
            awardedAt: true,
            metadata: true,
          },
        }),
      ]);

      return res.json({
        resource,
        progress,
        points,
      });
    } catch (error: any) {
      logger.error("knowledge_hub_progress_load_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
      return res.status(500).json({ error: "Failed to load knowledge hub progress" });
    }
  }
);

router.put(
  "/:resourceId/progress",
  ...resourceIdValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    try {
      const profileId = req.user?.profileId ? Number(req.user.profileId) : null;
      if (!profileId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const result = await updateKnowledgeHubProgress({
        resourceId: Number(req.params.resourceId),
        profileId,
        actorProfileId: profileId,
        progress: {
          timeSpentSeconds: parseNullableInt(req.body?.timeSpentSeconds),
          scrollPercent: parseNullablePercentage(req.body?.scrollPercent),
          watchSeconds: parseNullableInt(req.body?.watchSeconds),
          watchPercent: parseNullablePercentage(req.body?.watchPercent),
          completed: parseBooleanInput(req.body?.completed, false),
        },
      });

      return res.json(result);
    } catch (error: any) {
      logger.error("knowledge_hub_progress_update_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
      const statusCode = Number(error?.statusCode || 500);
      return res.status(statusCode).json({
        error: statusCode >= 500 ? "Failed to update knowledge hub progress" : error.message,
      });
    }
  }
);

router.get(
  "/:resourceId/quiz",
  ...resourceIdValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    try {
      const profileId = req.user?.profileId ? Number(req.user.profileId) : null;
      if (!profileId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const canWrite = await hasKnowledgeHubWriteAccess(req);
      const quiz = await prisma.knowledgeHubQuiz.findFirst({
        where: {
          resourceId: Number(req.params.resourceId),
          ...(canWrite ? {} : { isActive: true }),
        },
        include: {
          questions: {
            orderBy: { displayOrder: "asc" },
            include: {
              options: {
                orderBy: { displayOrder: "asc" },
              },
            },
          },
          attempts: {
            where: {
              profileId,
            },
            orderBy: [{ attemptNo: "desc" }],
            take: 5,
            select: {
              id: true,
              attemptNo: true,
              score: true,
              status: true,
              submittedAt: true,
              passedAt: true,
            },
          },
        },
      });

      if (!quiz) {
        return res.status(404).json({ error: "Knowledge quiz not found" });
      }

      return res.json({
        ...serializeKnowledgeQuiz(quiz, canWrite),
        attempts: quiz.attempts.map((attempt) => ({
          ...attempt,
          score: Number(attempt.score),
        })),
      });
    } catch (error: any) {
      logger.error("knowledge_hub_quiz_load_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
      return res.status(500).json({ error: "Failed to load knowledge quiz" });
    }
  }
);

router.put(
  "/:resourceId/quiz",
  requireModuleAccess("knowledge_hub", "write"),
  ...resourceIdValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    try {
      const resourceId = Number(req.params.resourceId);
      const title = String(req.body?.title || "").trim();
      const passMark = parseNullablePercentage(req.body?.passMark);
      const pointsOnPass = Math.max(0, parseNullableInt(req.body?.pointsOnPass) ?? 0);
      const attemptLimit = parseNullableInt(req.body?.attemptLimit);
      const isActive = parseBooleanInput(req.body?.isActive, true);
      const questionsInput = Array.isArray(req.body?.questions) ? req.body.questions : [];

      if (!title || passMark === null) {
        return res.status(400).json({ error: "title and passMark are required" });
      }

      const resource = await prisma.knowledgeHubResource.findUnique({
        where: { id: resourceId },
        select: { id: true },
      });
      if (!resource) {
        return res.status(404).json({ error: "Knowledge resource not found" });
      }

      const existingQuiz = await prisma.knowledgeHubQuiz.findUnique({
        where: { resourceId },
        include: {
          attempts: {
            select: { id: true },
            take: 1,
          },
        },
      });

      if (existingQuiz?.attempts.length) {
        return res.status(409).json({
          error: "Quiz cannot be replaced after learners have started attempting it",
        });
      }

      const normalizedQuestions = questionsInput.map((question: any, index: number) => {
        const questionType = String(question?.questionType || "").trim();
        if (!questionType || !["single_choice", "multiple_choice", "true_false", "short_text"].includes(questionType)) {
          throw withStatusCode(`Invalid questionType at position ${index + 1}`, 400);
        }

        const prompt = String(question?.prompt || "").trim();
        if (!prompt) {
          throw withStatusCode(`Question prompt is required at position ${index + 1}`, 400);
        }

        const options = Array.isArray(question?.options) ? question.options : [];
        return {
          questionType,
          prompt,
          displayOrder: Number(question?.displayOrder || index + 1),
          required: parseBooleanInput(question?.required, true),
          explanation: toNullableTrimmedString(question?.explanation),
          options: options.map((option: any, optionIndex: number) => ({
            label: String(option?.label || "").trim(),
            isCorrect: parseBooleanInput(option?.isCorrect, false),
            displayOrder: Number(option?.displayOrder || optionIndex + 1),
          })),
        };
      });

      const quiz = await prisma.$transaction(async (tx) => {
        const savedQuiz = existingQuiz
          ? await tx.knowledgeHubQuiz.update({
              where: { id: existingQuiz.id },
              data: {
                title,
                passMark,
                pointsOnPass,
                attemptLimit,
                isActive,
              },
            })
          : await tx.knowledgeHubQuiz.create({
              data: {
                resourceId,
                title,
                passMark,
                pointsOnPass,
                attemptLimit,
                isActive,
              },
            });

        await tx.knowledgeHubQuizQuestion.deleteMany({
          where: {
            quizId: savedQuiz.id,
          },
        });

        for (const question of normalizedQuestions) {
          await tx.knowledgeHubQuizQuestion.create({
            data: {
              quizId: savedQuiz.id,
              questionType: question.questionType as any,
              prompt: question.prompt,
              displayOrder: question.displayOrder,
              required: question.required,
              explanation: question.explanation,
              options:
                question.options.length > 0
                  ? {
                      create: question.options.map((option: { label: string; isCorrect: boolean; displayOrder: number }) => ({
                        label: option.label,
                        isCorrect: option.isCorrect,
                        displayOrder: option.displayOrder,
                      })),
                    }
                  : undefined,
            },
          });
        }

        return tx.knowledgeHubQuiz.findUniqueOrThrow({
          where: { id: savedQuiz.id },
          include: {
            questions: {
              orderBy: { displayOrder: "asc" },
              include: {
                options: {
                  orderBy: { displayOrder: "asc" },
                },
              },
            },
          },
        });
      });

      return res.json(serializeKnowledgeQuiz(quiz, true));
    } catch (error: any) {
      logger.error("knowledge_hub_quiz_save_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
      const statusCode = Number(error?.statusCode || 500);
      return res.status(statusCode).json({
        error: statusCode >= 500 ? "Failed to save knowledge quiz" : error.message,
      });
    }
  }
);

router.delete(
  "/:resourceId/quiz",
  requireModuleAccess("knowledge_hub", "write"),
  ...resourceIdValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    try {
      const quiz = await prisma.knowledgeHubQuiz.findUnique({
        where: {
          resourceId: Number(req.params.resourceId),
        },
        include: {
          attempts: {
            select: { id: true },
            take: 1,
          },
        },
      });

      if (!quiz) {
        return res.status(404).json({ error: "Knowledge quiz not found" });
      }

      if (quiz.attempts.length) {
        return res.status(409).json({
          error: "Quiz cannot be deleted after learners have started attempting it",
        });
      }

      await prisma.knowledgeHubQuiz.delete({
        where: { id: quiz.id },
      });

      return res.json({ success: true });
    } catch (error: any) {
      logger.error("knowledge_hub_quiz_delete_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
      return res.status(500).json({ error: "Failed to delete knowledge quiz" });
    }
  }
);

router.post(
  "/:resourceId/quiz-attempts",
  ...resourceIdValidators,
  handleValidationErrors,
  async (req: AuthRequest, res) => {
    try {
      const profileId = req.user?.profileId ? Number(req.user.profileId) : null;
      if (!profileId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
      const result = await submitKnowledgeHubQuizAttempt({
        resourceId: Number(req.params.resourceId),
        profileId,
        actorProfileId: profileId,
        answers: answers.map((answer: any) => ({
          questionId: Number(answer?.questionId),
          optionIds: Array.isArray(answer?.optionIds)
            ? answer.optionIds.map((optionId: unknown) => Number(optionId))
            : [],
          freeTextAnswer: toNullableTrimmedString(answer?.freeTextAnswer),
        })),
      });

      return res.status(201).json({
        ...result,
        attempt: {
          ...result.attempt,
          score: Number(result.attempt.score),
        },
      });
    } catch (error: any) {
      logger.error("knowledge_hub_quiz_submit_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
      const statusCode = Number(error?.statusCode || 500);
      return res.status(statusCode).json({
        error: statusCode >= 500 ? "Failed to submit knowledge quiz" : error.message,
      });
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
      logger.error("knowledge_hub_resource_load_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
      return res.status(500).json({ error: "Failed to load knowledge hub resource" });
    }
  }
);

router.post(
  "/",
  requireModuleAccess("knowledge_hub", "write"),
  rejectMultipartDiskUploadsDisabled("knowledge-hub"),
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
      const estimatedDurationMinutes = parseNullableInt(payload.estimatedDurationMinutes);
      const completionMode = isKnownCompletionMode(String(payload.completionMode || ""))
        ? String(payload.completionMode)
        : "manual";
      const completionThresholdPercent = parseNullablePercentage(payload.completionThresholdPercent);
      const minReadSeconds = parseNullableInt(payload.minReadSeconds);
      const pointsOnCompletion = Math.max(0, parseNullableInt(payload.pointsOnCompletion) ?? 0);

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
          estimated_duration_minutes,
          completion_mode,
          completion_threshold_percent,
          min_read_seconds,
          points_on_completion,
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
          ${estimatedDurationMinutes},
          ${completionMode},
          ${completionThresholdPercent},
          ${minReadSeconds},
          ${pointsOnCompletion},
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
      logger.error("knowledge_hub_resource_create_failed", toLogContext(error));
      return res.status(500).json({ error: "Failed to create knowledge hub resource" });
    }
  }
);

router.patch(
  "/:resourceId",
  requireModuleAccess("knowledge_hub", "write"),
  rejectMultipartDiskUploadsDisabled("knowledge-hub"),
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

      if (hasKey(payload, "estimatedDurationMinutes")) {
        setClauses.push(
          Prisma.sql`estimated_duration_minutes = ${parseNullableInt(payload.estimatedDurationMinutes)}`
        );
      }

      if (hasKey(payload, "completionMode")) {
        const completionMode = isKnownCompletionMode(String(payload.completionMode || ""))
          ? String(payload.completionMode)
          : "manual";
        setClauses.push(Prisma.sql`completion_mode = ${completionMode}`);
      }

      if (hasKey(payload, "completionThresholdPercent")) {
        setClauses.push(
          Prisma.sql`completion_threshold_percent = ${parseNullablePercentage(payload.completionThresholdPercent)}`
        );
      }

      if (hasKey(payload, "minReadSeconds")) {
        setClauses.push(Prisma.sql`min_read_seconds = ${parseNullableInt(payload.minReadSeconds)}`);
      }

      if (hasKey(payload, "pointsOnCompletion")) {
        setClauses.push(
          Prisma.sql`points_on_completion = ${Math.max(0, parseNullableInt(payload.pointsOnCompletion) ?? 0)}`
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
      logger.error("knowledge_hub_resource_update_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
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
      logger.error("knowledge_hub_resource_delete_failed", {
        resourceId: Number(req.params.resourceId),
        ...toLogContext(error),
      });
      return res.status(500).json({ error: "Failed to delete knowledge hub resource" });
    }
  }
);

export { KNOWLEDGE_DOMAINS, KNOWLEDGE_RESOURCE_TYPES, KNOWLEDGE_ASSET_KINDS };
export default router;
