import { Router } from "express";
import prisma from "../prisma";
import {
  BscPerspective,
  buildDefaultScoringConfig,
  DashboardModuleKey,
  getDashboardModuleCoverage,
  getDashboardModuleCoverageSummary,
  isDashboardModuleKey,
  listFrameworkMetrics,
  listDashboardModuleCoverageSummaries,
  listDashboardModules,
  mergeWithDefaultScoringConfig,
  PERFORMANCE_FRAMEWORK_BLUEPRINT,
  PyramidLevel,
  resolveDashboardModuleForContext,
} from "../services/performanceFramework.service";
import {
  getBalancedScorecardWorkspace,
  WorkspaceRole,
} from "../services/balancedScorecardWorkspace.service";
import {
  createBalancedScorecardCycle,
  createBalancedScorecardVersion,
  listBalancedScorecardGovernance,
  publishBalancedScorecardVersion,
} from "../services/balancedScorecardGovernance.service";
import {
  closeBalancedScorecardMeasurementPeriod,
  createBalancedScorecardMeasurementPeriod,
  generateBalancedScorecardMeasurementPeriod,
  getBalancedScorecardMeasurementSnapshots,
  listBalancedScorecardMeasurementPeriods,
  reviewBalancedScorecardMeasurementPeriod,
  submitBalancedScorecardMeasurementPeriod,
} from "../services/balancedScorecardMeasurement.service";
import {
  acknowledgeBalancedScorecardContribution,
  getBalancedScorecardContributionDetail,
  uploadBalancedScorecardContributionEvidence,
  updateBalancedScorecardContributionProgress,
} from "../services/balancedScorecardContribution.service";
import {
  archiveBalancedScorecardPerspective,
  archiveBalancedScorecardGoal,
  archiveBalancedScorecardInitiative,
  deleteBalancedScorecardKpiAssignment,
  deleteBalancedScorecardPerspective,
  createBalancedScorecardGoal,
  createBalancedScorecardInitiative,
  createBalancedScorecardKpi,
  KpiMeasurementType,
  KpiTargetDirection,
  KpiTrackingMode,
  createBalancedScorecardPerspective,
  ensureBalancedScorecardSeed,
  listBalancedScorecardKpiAssignments,
  listBalancedScorecardMetricTemplates,
  listPerformanceBands,
  listBalancedScorecardStructure,
  upsertBalancedScorecardKpiAssignment,
  upsertPerformanceBand,
  updateBalancedScorecardGoal,
  updateBalancedScorecardInitiative,
  updateBalancedScorecardKpiActual,
  updateBalancedScorecardPerspective,
} from "../services/balancedScorecardStructure.service";
import { AuthRequest } from "../middleware/auth";
import { errorResponse, successResponse } from "../utils/response";
import { buildDiskUpload, deleteStoredUpload, storeUploadedFile } from "../config/uploads";

const router = Router();
const contributionEvidenceUpload = buildDiskUpload("documents");

const parseIntSafe = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const parseNumberSafe = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeUserRoles = (req: AuthRequest) =>
  (req.userRoles || []).map((role) => role.toLowerCase());

const canManageBalancedScorecard = (req: AuthRequest) => {
  const roles = normalizeUserRoles(req);
  return roles.includes("hr") || roles.includes("super_admin");
};

const canUpdateKpiActuals = (req: AuthRequest) => {
  const roles = normalizeUserRoles(req);
  return roles.includes("hr") || roles.includes("super_admin") || roles.includes("finance") || roles.includes("marketing");
};

const canManageContributionForProfile = (req: AuthRequest, profileId: number) => {
  const requesterProfileId = parseIntSafe(req.user?.profileId);
  if (requesterProfileId && requesterProfileId === profileId) return true;
  const roles = normalizeUserRoles(req);
  return roles.includes("hr") || roles.includes("super_admin");
};

const isPyramidLevel = (value: string): value is PyramidLevel =>
  [
    "level_1_corporate_vision",
    "level_2_business_unit",
    "level_3_operational_systems",
    "level_4_people_capability",
  ].includes(value);

const isBscPerspective = (value: string): value is BscPerspective =>
  ["financial", "customer", "internal_process", "learning_growth"].includes(value);

const isWorkspaceRole = (value: string): value is WorkspaceRole =>
  ["hr", "gmp", "partner", "manager", "finance", "marketing", "employee"].includes(value);

const isScorecardCadence = (
  value: string
): value is "monthly" | "quarterly" | "annual" =>
  ["monthly", "quarterly", "annual"].includes(value);

const isMeasurementReviewDecision = (
  value: string
): value is "start_review" | "request_changes" | "approve" =>
  ["start_review", "request_changes", "approve"].includes(value);

const isKpiMeasurementType = (value: string): value is KpiMeasurementType =>
  ["percentage", "currency", "number", "count", "days", "boolean", "milestone"].includes(value);

const isKpiTargetDirection = (value: string): value is KpiTargetDirection =>
  ["higher_better", "lower_better", "exact_match", "milestone_complete"].includes(value);

const resolveDefinitionForProfile = async (
  departmentId: number | null | undefined,
  cycleId?: number
) => {
  if (cycleId) {
    const cycleDepartment = await prisma.evaluationDefinition.findFirst({
      where: {
        status: "published",
        cycleId,
        departmentId: departmentId ?? null,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        cycleId: true,
        departmentId: true,
        scoringConfig: true,
      },
    });
    if (cycleDepartment) return cycleDepartment;

    const cycleGlobal = await prisma.evaluationDefinition.findFirst({
      where: {
        status: "published",
        cycleId,
        departmentId: null,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        cycleId: true,
        departmentId: true,
        scoringConfig: true,
      },
    });
    if (cycleGlobal) return cycleGlobal;
  }

  if (departmentId) {
    const departmentDefinition = await prisma.evaluationDefinition.findFirst({
      where: {
        status: "published",
        departmentId,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        cycleId: true,
        departmentId: true,
        scoringConfig: true,
      },
    });
    if (departmentDefinition) return departmentDefinition;
  }

  return prisma.evaluationDefinition.findFirst({
    where: {
      status: "published",
      departmentId: null,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      cycleId: true,
      departmentId: true,
      scoringConfig: true,
    },
  });
};

router.get("/blueprint", async (_req, res) => {
  try {
    return res.json(
      successResponse(
        PERFORMANCE_FRAMEWORK_BLUEPRINT,
        "Performance framework blueprint loaded"
      )
    );
  } catch (error: any) {
    console.error("Error loading framework blueprint:", error);
    return res.status(500).json(errorResponse("Failed to load framework blueprint", 500));
  }
});

router.get("/metrics", async (req, res) => {
  try {
    const levelRaw = typeof req.query.level === "string" ? req.query.level : undefined;
    const perspectiveRaw =
      typeof req.query.perspective === "string" ? req.query.perspective : undefined;
    const owner = typeof req.query.owner === "string" ? req.query.owner : undefined;

    const metrics = listFrameworkMetrics({
      level: levelRaw && isPyramidLevel(levelRaw) ? levelRaw : undefined,
      perspective:
        perspectiveRaw && isBscPerspective(perspectiveRaw) ? perspectiveRaw : undefined,
      owner,
    });

    return res.json(successResponse(metrics, "Framework metrics loaded"));
  } catch (error: any) {
    console.error("Error loading framework metrics:", error);
    return res.status(500).json(errorResponse("Failed to load framework metrics", 500));
  }
});

router.get("/coverage", async (_req, res) => {
  try {
    const metrics = PERFORMANCE_FRAMEWORK_BLUEPRINT.metrics;

    const byLevel = PERFORMANCE_FRAMEWORK_BLUEPRINT.levels.map((level) => ({
      id: level.id,
      name: level.name,
      count: metrics.filter((metric) => metric.level === level.id).length,
    }));

    const perspectives: BscPerspective[] = [
      "financial",
      "customer",
      "internal_process",
      "learning_growth",
    ];
    const byPerspective = perspectives.map((perspective) => ({
      perspective,
      count: metrics.filter((metric) => metric.perspective === perspective).length,
    }));

    const ownerMap = new Map<string, number>();
    metrics.forEach((metric) => {
      ownerMap.set(metric.owner, (ownerMap.get(metric.owner) || 0) + 1);
    });
    const byOwner = Array.from(ownerMap.entries())
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count);

    const signalMap = new Map<string, number>();
    metrics.forEach((metric) => {
      metric.dataSignals.forEach((signal) => {
        signalMap.set(signal, (signalMap.get(signal) || 0) + 1);
      });
    });

    const topSignals = Array.from(signalMap.entries())
      .map(([signal, count]) => ({ signal, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return res.json(
      successResponse(
        {
          frameworkVersion: PERFORMANCE_FRAMEWORK_BLUEPRINT.framework,
          totalMetrics: metrics.length,
          byLevel,
          byPerspective,
          byOwner,
          uniqueDataSignals: signalMap.size,
          topSignals,
        },
        "Framework coverage summary loaded"
      )
    );
  } catch (error: any) {
    console.error("Error loading framework coverage:", error);
    return res.status(500).json(errorResponse("Failed to load framework coverage", 500));
  }
});

router.get("/workspace", async (req: AuthRequest, res) => {
  try {
    // The requesting user's own profile ID — always used for role-based scoping.
    const requestingProfileId = parseIntSafe(req.user?.profileId);
    // An optional override: HR can pass ?profileId=X to view another employee's contributions.
    const profileIdOverride = parseIntSafe(req.query.profileId);
    const profileId = profileIdOverride ?? requestingProfileId;

    const requestedRoleRaw = typeof req.query.role === "string" ? req.query.role.toLowerCase() : undefined;
    const requestedRole = requestedRoleRaw && isWorkspaceRole(requestedRoleRaw) ? requestedRoleRaw : undefined;
    const evaluationCycleId = parseIntSafe(req.query.evaluationCycleId);

    let roles = (req.userRoles || []).map((role) => role.toLowerCase());
    let positionTitle: string | null = null;

    if (profileId) {
      const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          positionTitle: true,
          role: { select: { name: true } },
        },
      });
      if (profile?.role?.name) {
        roles = Array.from(new Set([...roles, profile.role.name.toLowerCase()]));
      }
      positionTitle = profile?.positionTitle ?? null;
    }

    const resolvedRole = resolveDashboardModuleForContext({
      roles,
      positionTitle,
    }) as WorkspaceRole;

    const canPreviewAllRoles = roles.includes("hr") || roles.includes("super_admin");
    if (requestedRole && requestedRole !== resolvedRole && !canPreviewAllRoles) {
      return res.status(403).json(errorResponse("You cannot preview another KPI workspace role", 403));
    }

    const workspace = await getBalancedScorecardWorkspace({
      role: requestedRole ?? resolvedRole,
      profileId: profileId ?? null,
      requestingProfileId: requestingProfileId ?? null,
      evaluationCycleId: evaluationCycleId ?? null,
    });

    return res.json(successResponse(workspace, "Balanced scorecard workspace loaded"));
  } catch (error: any) {
    console.error("Error loading balanced scorecard workspace:", error);
    const message =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message || "Failed to load balanced scorecard workspace"
        : "Failed to load balanced scorecard workspace";
    return res.status(500).json(errorResponse(message, 500));
  }
});

router.get("/employee-contributions/:contributionKey", async (req: AuthRequest, res) => {
  try {
    const requestedProfileId = parseIntSafe(req.query.profileId);
    const fallbackProfileId = parseIntSafe(req.user?.profileId);
    const profileId = requestedProfileId ?? fallbackProfileId;
    const evaluationCycleId = parseIntSafe(req.query.evaluationCycleId);
    const contributionKey = decodeURIComponent(String(req.params.contributionKey || "")).trim();

    if (!profileId) {
      return res.status(400).json(errorResponse("Profile is required", 400));
    }
    if (!contributionKey) {
      return res.status(400).json(errorResponse("Contribution key is required", 400));
    }
    if (!canManageContributionForProfile(req, profileId)) {
      return res.status(403).json(errorResponse("You cannot access this contribution item", 403));
    }

    const detail = await getBalancedScorecardContributionDetail({
      profileId,
      contributionKey,
      evaluationCycleId: evaluationCycleId ?? null,
    });
    return res.json(successResponse(detail, "Employee contribution detail loaded"));
  } catch (error: any) {
    console.error("Error loading employee contribution detail:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to load contribution detail" : error.message, statusCode));
  }
});

router.post("/employee-contributions/:contributionKey/acknowledge", async (req: AuthRequest, res) => {
  try {
    const requestedProfileId = parseIntSafe(req.body?.profileId);
    const fallbackProfileId = parseIntSafe(req.user?.profileId);
    const profileId = requestedProfileId ?? fallbackProfileId;
    const evaluationCycleId = parseIntSafe(req.body?.evaluationCycleId);
    const contributionKey = decodeURIComponent(String(req.params.contributionKey || "")).trim();

    if (!profileId) {
      return res.status(400).json(errorResponse("Profile is required", 400));
    }
    if (!contributionKey) {
      return res.status(400).json(errorResponse("Contribution key is required", 400));
    }
    if (!canManageContributionForProfile(req, profileId)) {
      return res.status(403).json(errorResponse("You cannot acknowledge this contribution item", 403));
    }

    const detail = await acknowledgeBalancedScorecardContribution({
      profileId,
      contributionKey,
      actedByProfileId: parseIntSafe(req.user?.profileId) ?? null,
      evaluationCycleId: evaluationCycleId ?? null,
    });
    return res.json(successResponse(detail, "Contribution acknowledged"));
  } catch (error: any) {
    console.error("Error acknowledging employee contribution:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to acknowledge contribution" : error.message, statusCode));
  }
});

router.post("/employee-contributions/:contributionKey/progress", async (req: AuthRequest, res) => {
  try {
    const requestedProfileId = parseIntSafe(req.body?.profileId);
    const fallbackProfileId = parseIntSafe(req.user?.profileId);
    const profileId = requestedProfileId ?? fallbackProfileId;
    const evaluationCycleId = parseIntSafe(req.body?.evaluationCycleId);
    const contributionKey = decodeURIComponent(String(req.params.contributionKey || "")).trim();
    const progress = parseNumberSafe(req.body?.progress);
    const comment = typeof req.body?.comment === "string" ? req.body.comment : undefined;

    if (!profileId) {
      return res.status(400).json(errorResponse("Profile is required", 400));
    }
    if (!contributionKey) {
      return res.status(400).json(errorResponse("Contribution key is required", 400));
    }
    if (!Number.isFinite(progress)) {
      return res.status(400).json(errorResponse("Progress is required", 400));
    }
    if (!canManageContributionForProfile(req, profileId)) {
      return res.status(403).json(errorResponse("You cannot update this contribution item", 403));
    }

    const detail = await updateBalancedScorecardContributionProgress({
      profileId,
      contributionKey,
      progress: Number(progress),
      comment,
      actedByProfileId: parseIntSafe(req.user?.profileId) ?? null,
      evaluationCycleId: evaluationCycleId ?? null,
    });
    return res.json(successResponse(detail, "Contribution progress updated"));
  } catch (error: any) {
    console.error("Error updating employee contribution progress:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to update contribution progress" : error.message, statusCode));
  }
});

router.post(
  "/employee-contributions/:contributionKey/evidence",
  contributionEvidenceUpload.single("file"),
  async (req: AuthRequest, res) => {
    let storedUpload:
      | {
          storedName: string;
          publicPath: string;
          fileSize: number;
          mimeType: string | null;
          originalName: string;
        }
      | undefined;

    try {
      const requestedProfileId = parseIntSafe(req.body?.profileId);
      const fallbackProfileId = parseIntSafe(req.user?.profileId);
      const profileId = requestedProfileId ?? fallbackProfileId;
      const evaluationCycleId = parseIntSafe(req.body?.evaluationCycleId);
      const contributionKey = decodeURIComponent(String(req.params.contributionKey || "")).trim();
      const uploadedFile = (req as any).file as Express.Multer.File | undefined;
      if (uploadedFile) {
        storedUpload = await storeUploadedFile("documents", uploadedFile);
      }
      const filePath =
        storedUpload?.publicPath ||
        (typeof req.body?.filePath === "string" ? String(req.body.filePath).trim() : "");
      const fileName =
        (typeof req.body?.fileName === "string" ? String(req.body.fileName).trim() : "") ||
        storedUpload?.originalName ||
        uploadedFile?.originalname ||
        "";
      const mimeType =
        (typeof req.body?.mimeType === "string" ? String(req.body.mimeType).trim() : "") ||
        storedUpload?.mimeType ||
        uploadedFile?.mimetype ||
        "";
      const description =
        typeof req.body?.description === "string" ? String(req.body.description) : undefined;
      const documentType =
        typeof req.body?.documentType === "string" ? String(req.body.documentType) : undefined;

      if (!profileId) {
        return res.status(400).json(errorResponse("Profile is required", 400));
      }
      if (!contributionKey) {
        return res.status(400).json(errorResponse("Contribution key is required", 400));
      }
      if (!canManageContributionForProfile(req, profileId)) {
        return res.status(403).json(errorResponse("You cannot upload evidence for this contribution item", 403));
      }
      if (!filePath || !fileName) {
        return res.status(400).json(errorResponse("File upload or filePath is required", 400));
      }

      const detail = await uploadBalancedScorecardContributionEvidence({
        profileId,
        contributionKey,
        actedByProfileId: parseIntSafe(req.user?.profileId) ?? null,
        actedByUserId: parseIntSafe(req.user?.userId) ?? null,
        actedByRoles: req.userRoles ?? [],
        fileName,
        filePath,
        fileSize: storedUpload?.fileSize ?? uploadedFile?.size,
        mimeType: mimeType || undefined,
        description,
        documentType,
        evaluationCycleId: evaluationCycleId ?? null,
      });
      return res.status(201).json(successResponse(detail, "Contribution evidence uploaded", 201));
    } catch (error: any) {
      if (storedUpload?.publicPath) {
        await deleteStoredUpload("documents", storedUpload.publicPath).catch(() => undefined);
      }
      console.error("Error uploading contribution evidence:", error);
      const statusCode = Number(error?.statusCode || 500);
      return res
        .status(statusCode)
        .json(errorResponse(statusCode >= 500 ? "Failed to upload contribution evidence" : error.message, statusCode));
    }
  }
);

router.get("/scorecard-governance", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can review scorecard governance", 403));
    }
    const governance = await listBalancedScorecardGovernance();
    return res.json(successResponse(governance, "Balanced scorecard governance loaded"));
  } catch (error: any) {
    console.error("Error loading balanced scorecard governance:", error);
    return res.status(500).json(errorResponse("Failed to load balanced scorecard governance", 500));
  }
});

router.post("/scorecard-cycles", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can create scorecard cycles", 403));
    }
    const { name, cadence, startDate, endDate } = req.body || {};
    if (!name || String(name).trim().length < 3) {
      return res.status(400).json(errorResponse("Cycle name is required", 400));
    }
    const resolvedCadence = String(cadence || "").trim().toLowerCase();
    if (!isScorecardCadence(resolvedCadence)) {
      return res.status(400).json(errorResponse("Valid cadence is required", 400));
    }
    if (!startDate || !endDate) {
      return res.status(400).json(errorResponse("Start date and end date are required", 400));
    }

    const created = await createBalancedScorecardCycle({
      name: String(name),
      cadence: resolvedCadence,
      startDate: String(startDate),
      endDate: String(endDate),
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(created, "Balanced scorecard cycle created"));
  } catch (error: any) {
    console.error("Error creating balanced scorecard cycle:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to create scorecard cycle" : error.message, statusCode));
  }
});

router.post("/scorecard-cycles/:id/versions", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can create scorecard versions", 403));
    }
    const cycleId = parseIntSafe(req.params.id);
    if (!cycleId) {
      return res.status(400).json(errorResponse("Scorecard cycle is required", 400));
    }
    const { label, sourceVersionId } = req.body || {};
    const parsedSourceVersionId =
      sourceVersionId === null || sourceVersionId === "baseline"
        ? null
        : sourceVersionId === undefined
          ? undefined
          : parseIntSafe(sourceVersionId);
    const created = await createBalancedScorecardVersion({
      cycleId,
      label: label ? String(label) : null,
      sourceVersionId: parsedSourceVersionId,
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(created, "Balanced scorecard version created"));
  } catch (error: any) {
    console.error("Error creating balanced scorecard version:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to create scorecard version" : error.message, statusCode));
  }
});

router.post("/scorecard-versions/:id/publish", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can publish scorecard versions", 403));
    }
    const versionId = parseIntSafe(req.params.id);
    if (!versionId) {
      return res.status(400).json(errorResponse("Scorecard version is required", 400));
    }
    const published = await publishBalancedScorecardVersion(versionId);
    return res.json(successResponse(published, "Balanced scorecard version published"));
  } catch (error: any) {
    console.error("Error publishing balanced scorecard version:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to publish scorecard version" : error.message, statusCode));
  }
});

router.get("/measurement-periods", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can review measurement periods", 403));
    }
    const versionId =
      typeof req.query.versionId === "string" ? parseIntSafe(req.query.versionId) : undefined;
    const periods = await listBalancedScorecardMeasurementPeriods({
      scorecardVersionId: versionId ?? undefined,
    });
    return res.json(successResponse(periods, "Balanced scorecard measurement periods loaded"));
  } catch (error: any) {
    console.error("Error loading balanced scorecard measurement periods:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(
        errorResponse(
          statusCode >= 500
            ? "Failed to load balanced scorecard measurement periods"
            : error.message,
          statusCode
        )
      );
  }
});

router.post("/measurement-periods", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can create measurement periods", 403));
    }
    const { versionId, label, periodStart, periodEnd } = req.body || {};
    if (!periodStart || !periodEnd) {
      return res
        .status(400)
        .json(errorResponse("Measurement period start and end dates are required", 400));
    }
    const created = await createBalancedScorecardMeasurementPeriod({
      scorecardVersionId: parseIntSafe(versionId) ?? undefined,
      label: label ? String(label) : null,
      periodStart: String(periodStart),
      periodEnd: String(periodEnd),
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(created, "Balanced scorecard measurement period created"));
  } catch (error: any) {
    console.error("Error creating balanced scorecard measurement period:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(
        errorResponse(
          statusCode >= 500
            ? "Failed to create balanced scorecard measurement period"
            : error.message,
          statusCode
        )
      );
  }
});

router.post("/measurement-periods/:id/generate", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can generate measurement snapshots", 403));
    }
    const periodId = parseIntSafe(req.params.id);
    if (!periodId) {
      return res.status(400).json(errorResponse("Measurement period is required", 400));
    }
    const generated = await generateBalancedScorecardMeasurementPeriod({
      periodId,
      generatedByProfileId: parseIntSafe(req.user?.profileId) ?? null,
      comment: req.body?.comment ? String(req.body.comment) : null,
    });
    return res.json(successResponse(generated, "Balanced scorecard measurement snapshots generated"));
  } catch (error: any) {
    console.error("Error generating balanced scorecard measurement snapshots:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(
        errorResponse(
          statusCode >= 500
            ? "Failed to generate balanced scorecard measurement snapshots"
            : error.message,
          statusCode
        )
      );
  }
});

router.get("/measurement-periods/:id/snapshots", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can review measurement snapshots", 403));
    }
    const periodId = parseIntSafe(req.params.id);
    if (!periodId) {
      return res.status(400).json(errorResponse("Measurement period is required", 400));
    }
    const snapshotPack = await getBalancedScorecardMeasurementSnapshots(periodId);
    return res.json(successResponse(snapshotPack, "Balanced scorecard measurement snapshot pack loaded"));
  } catch (error: any) {
    console.error("Error loading balanced scorecard measurement snapshot pack:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(
        errorResponse(
          statusCode >= 500
            ? "Failed to load balanced scorecard measurement snapshot pack"
            : error.message,
          statusCode
        )
      );
  }
});

router.post("/measurement-periods/:id/submit", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can submit measurement periods", 403));
    }
    const periodId = parseIntSafe(req.params.id);
    if (!periodId) {
      return res.status(400).json(errorResponse("Measurement period is required", 400));
    }
    const submitted = await submitBalancedScorecardMeasurementPeriod({
      periodId,
      actedByProfileId: parseIntSafe(req.user?.profileId) ?? null,
      comment: req.body?.comment ? String(req.body.comment) : null,
    });
    return res.json(successResponse(submitted, "Balanced scorecard measurement period submitted"));
  } catch (error: any) {
    console.error("Error submitting balanced scorecard measurement period:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(
        errorResponse(
          statusCode >= 500
            ? "Failed to submit balanced scorecard measurement period"
            : error.message,
          statusCode
        )
      );
  }
});

router.post("/measurement-periods/:id/review", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can review measurement periods", 403));
    }
    const periodId = parseIntSafe(req.params.id);
    if (!periodId) {
      return res.status(400).json(errorResponse("Measurement period is required", 400));
    }
    const decision = String(req.body?.decision || "").trim().toLowerCase();
    if (!isMeasurementReviewDecision(decision)) {
      return res
        .status(400)
        .json(errorResponse("Valid review decision is required", 400));
    }
    const reviewed = await reviewBalancedScorecardMeasurementPeriod({
      periodId,
      decision,
      actedByProfileId: parseIntSafe(req.user?.profileId) ?? null,
      comment: req.body?.comment ? String(req.body.comment) : null,
    });
    return res.json(successResponse(reviewed, "Balanced scorecard measurement period reviewed"));
  } catch (error: any) {
    console.error("Error reviewing balanced scorecard measurement period:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(
        errorResponse(
          statusCode >= 500
            ? "Failed to review balanced scorecard measurement period"
            : error.message,
          statusCode
        )
      );
  }
});

router.post("/measurement-periods/:id/close", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can close measurement periods", 403));
    }
    const periodId = parseIntSafe(req.params.id);
    if (!periodId) {
      return res.status(400).json(errorResponse("Measurement period is required", 400));
    }
    const closed = await closeBalancedScorecardMeasurementPeriod({
      periodId,
      actedByProfileId: parseIntSafe(req.user?.profileId) ?? null,
      comment: req.body?.comment ? String(req.body.comment) : null,
    });
    return res.json(successResponse(closed, "Balanced scorecard measurement period closed"));
  } catch (error: any) {
    console.error("Error closing balanced scorecard measurement period:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(
        errorResponse(
          statusCode >= 500
            ? "Failed to close balanced scorecard measurement period"
            : error.message,
          statusCode
        )
      );
  }
});

router.get("/scorecard-structure", async (_req, res) => {
  try {
    const versionId =
      typeof _req.query.versionId === "string" ? parseIntSafe(_req.query.versionId) : undefined;
    const structure = await listBalancedScorecardStructure({
      scorecardVersionId: versionId ?? undefined,
    });
    return res.json(successResponse(structure, "Balanced scorecard structure loaded"));
  } catch (error: any) {
    console.error("Error loading balanced scorecard structure:", error);
    return res.status(500).json(errorResponse("Failed to load balanced scorecard structure", 500));
  }
});

router.get("/kpi-templates", async (_req, res) => {
  try {
    return res.json(
      successResponse(listBalancedScorecardMetricTemplates(), "Balanced scorecard KPI templates loaded")
    );
  } catch (error: any) {
    console.error("Error loading balanced scorecard KPI templates:", error);
    return res.status(500).json(errorResponse("Failed to load balanced scorecard KPI templates", 500));
  }
});

router.post("/scorecard-structure/bootstrap", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can bootstrap the balanced scorecard structure", 403));
    }
    await ensureBalancedScorecardSeed();
    const structure = await listBalancedScorecardStructure();
    return res.json(successResponse(structure, "Balanced scorecard structure bootstrapped"));
  } catch (error: any) {
    console.error("Error bootstrapping balanced scorecard structure:", error);
    return res.status(500).json(errorResponse("Failed to bootstrap balanced scorecard structure", 500));
  }
});

router.post("/perspectives", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can create scorecard perspectives", 403));
    }
    const { name, ownerName, summary, versionId } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json(errorResponse("Perspective name is required", 400));
    }
    const created = await createBalancedScorecardPerspective({
      name: String(name),
      ownerName: ownerName ? String(ownerName) : null,
      summary: summary ? String(summary) : null,
      scorecardVersionId: parseIntSafe(versionId) ?? undefined,
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(created, "Perspective created"));
  } catch (error: any) {
    console.error("Error creating perspective:", error);
    return res.status(500).json(errorResponse("Failed to create perspective", 500));
  }
});

router.patch("/perspectives/:id", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can update scorecard perspectives", 403));
    }

    const perspectiveId = parseIntSafe(req.params.id);
    if (!perspectiveId) {
      return res.status(400).json(errorResponse("Perspective is required", 400));
    }

    const { name, ownerName, summary } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json(errorResponse("Perspective name is required", 400));
    }

    const updated = await updateBalancedScorecardPerspective(perspectiveId, {
      name: String(name),
      ownerName: ownerName ? String(ownerName) : null,
      summary: summary ? String(summary) : null,
    });

    return res.json(successResponse(updated, "Perspective updated"));
  } catch (error: any) {
    console.error("Error updating perspective:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to update perspective" : error.message, statusCode));
  }
});

router.delete("/perspectives/:id", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can archive scorecard perspectives", 403));
    }

    const perspectiveId = parseIntSafe(req.params.id);
    if (!perspectiveId) {
      return res.status(400).json(errorResponse("Perspective is required", 400));
    }

    const archived = await archiveBalancedScorecardPerspective(perspectiveId);
    return res.json(successResponse(archived, "Perspective archived"));
  } catch (error: any) {
    console.error("Error archiving perspective:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to archive perspective" : error.message, statusCode));
  }
});

router.delete("/perspectives/:id/hard-delete", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can delete scorecard perspectives", 403));
    }

    const perspectiveId = parseIntSafe(req.params.id);
    if (!perspectiveId) {
      return res.status(400).json(errorResponse("Perspective is required", 400));
    }

    const deleted = await deleteBalancedScorecardPerspective(perspectiveId);
    return res.json(successResponse(deleted, "Perspective deleted"));
  } catch (error: any) {
    console.error("Error deleting perspective:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to delete perspective" : error.message, statusCode));
  }
});

router.post("/goals", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can create strategic goals", 403));
    }
    const { perspectiveId, title, description, ownerName } = req.body || {};
    const resolvedPerspectiveId = parseIntSafe(perspectiveId);
    if (!resolvedPerspectiveId) {
      return res.status(400).json(errorResponse("Perspective is required", 400));
    }
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json(errorResponse("Goal title is required", 400));
    }
    const created = await createBalancedScorecardGoal({
      perspectiveId: resolvedPerspectiveId,
      title: String(title),
      description: description ? String(description) : null,
      ownerName: ownerName ? String(ownerName) : null,
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(created, "Strategic goal created"));
  } catch (error: any) {
    console.error("Error creating goal:", error);
    return res.status(500).json(errorResponse("Failed to create strategic goal", 500));
  }
});

router.patch("/goals/:id", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can update strategic goals", 403));
    }
    const goalId = parseIntSafe(req.params.id);
    if (!goalId) {
      return res.status(400).json(errorResponse("Goal is required", 400));
    }
    const { title, description, ownerName } = req.body || {};
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json(errorResponse("Goal title is required", 400));
    }
    const updated = await updateBalancedScorecardGoal(goalId, {
      title: String(title),
      description: description ? String(description) : null,
      ownerName: ownerName ? String(ownerName) : null,
    });
    return res.json(successResponse(updated, "Strategic goal updated"));
  } catch (error: any) {
    console.error("Error updating goal:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json(
      errorResponse(statusCode >= 500 ? "Failed to update strategic goal" : error.message, statusCode)
    );
  }
});

router.delete("/goals/:id", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can archive strategic goals", 403));
    }
    const goalId = parseIntSafe(req.params.id);
    if (!goalId) {
      return res.status(400).json(errorResponse("Goal is required", 400));
    }
    const archived = await archiveBalancedScorecardGoal(goalId);
    return res.json(successResponse(archived, "Strategic goal archived"));
  } catch (error: any) {
    console.error("Error archiving goal:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json(
      errorResponse(statusCode >= 500 ? "Failed to archive strategic goal" : error.message, statusCode)
    );
  }
});

router.get("/goals/:id/weight-summary", async (req: AuthRequest, res) => {
  try {
    const goalId = parseIntSafe(req.params.id);
    if (!goalId) {
      return res.status(400).json(errorResponse("Goal ID is required", 400));
    }
    const kpis = await prisma.balancedScorecardKpi.findMany({
      where: { goalId, isActive: true },
      select: { weight: true },
    });
    const totalWeight = kpis.reduce((sum, k) => sum + (k.weight || 0), 0);
    return res.json(
      successResponse({ goalId, totalWeight, kpiCount: kpis.length }, "Goal weight summary")
    );
  } catch (error: any) {
    console.error("Error fetching goal weight summary:", error);
    return res.status(500).json(errorResponse("Failed to fetch weight summary", 500));
  }
});

router.post("/kpis", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can create KPI contracts", 403));
    }
    const {
      goalId,
      trackingMode,
      metricKey,
      measurementType,
      targetDirection,
      targetValue,
      currentActualValue,
      lastMeasurementNote,
      name,
      description,
      formula,
      frequency,
      unit,
      weight,
      firmTarget,
      ownerName,
      ownerProfileId,
      statusLogic,
      updateFrequency,
    } = req.body || {};
    const resolvedGoalId = parseIntSafe(goalId);
    if (!resolvedGoalId) {
      return res.status(400).json(errorResponse("Goal is required", 400));
    }
    const resolvedTrackingMode: KpiTrackingMode =
      String(trackingMode || "").trim().toLowerCase() === "manual" ? "manual" : "template";
    if (resolvedTrackingMode === "template" && (!metricKey || !String(metricKey).trim())) {
      return res.status(400).json(errorResponse("Metric template is required for template-based KPIs", 400));
    }
    if (resolvedTrackingMode === "manual") {
      const resolvedMeasurementType = String(measurementType || "").trim().toLowerCase();
      const resolvedTargetDirection = String(targetDirection || "").trim().toLowerCase();
      if (!resolvedMeasurementType) {
        return res.status(400).json(errorResponse("Measurement type is required for custom KPIs", 400));
      }
      if (!isKpiMeasurementType(resolvedMeasurementType)) {
        return res.status(400).json(errorResponse("Unsupported measurement type", 400));
      }
      if (!resolvedTargetDirection) {
        return res.status(400).json(errorResponse("Target direction is required for custom KPIs", 400));
      }
      if (!isKpiTargetDirection(resolvedTargetDirection)) {
        return res.status(400).json(errorResponse("Unsupported target direction", 400));
      }
      if (parseNumberSafe(targetValue) === undefined) {
        return res.status(400).json(errorResponse("Target value is required for custom KPIs", 400));
      }
    }
    if (!name || String(name).trim().length < 3) {
      return res.status(400).json(errorResponse("KPI name is required", 400));
    }
    if (!frequency || !unit || !firmTarget) {
      return res.status(400).json(errorResponse("Frequency, unit, and firm target are required", 400));
    }
    const parsedWeight = Number(weight ?? 0);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > 100) {
      return res.status(400).json(errorResponse("KPI weight must be between 1 and 100", 400));
    }
    // Warn if total weights for this goal already reach 100 — caller should redistribute
    const existingKpis = await prisma.balancedScorecardKpi.findMany({
      where: { goalId: resolvedGoalId, isActive: true },
      select: { weight: true },
    });
    const currentTotal = existingKpis.reduce((sum, k) => sum + (k.weight || 0), 0);
    const newTotal = currentTotal + parsedWeight;
    const created = await createBalancedScorecardKpi({
      goalId: resolvedGoalId,
      metricKey: metricKey ? String(metricKey) : null,
      trackingMode: resolvedTrackingMode,
      measurementType: measurementType ? (String(measurementType) as KpiMeasurementType) : null,
      targetDirection: targetDirection ? (String(targetDirection) as KpiTargetDirection) : null,
      targetValue: parseNumberSafe(targetValue) ?? null,
      currentActualValue: parseNumberSafe(currentActualValue) ?? null,
      lastMeasurementNote: lastMeasurementNote ? String(lastMeasurementNote) : null,
      name: String(name),
      description: description ? String(description) : null,
      formula: formula ? String(formula) : null,
      frequency: String(frequency),
      unit: String(unit),
      weight: Number(weight ?? 0),
      firmTarget: String(firmTarget),
      ownerName: ownerName ? String(ownerName) : null,
      ownerProfileId:
        ownerProfileId === undefined ? undefined : parseIntSafe(ownerProfileId) ?? null,
      statusLogic: statusLogic ? String(statusLogic) : null,
      updateFrequency: updateFrequency ? String(updateFrequency) : null,
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(
      { ...created, goalWeightTotal: newTotal },
      newTotal > 100
        ? `KPI created. Note: total goal weight is now ${newTotal}% — consider redistributing weights to sum to 100%.`
        : "KPI contract created"
    ));
  } catch (error: any) {
    console.error("Error creating KPI:", error);
    return res.status(500).json(errorResponse("Failed to create KPI contract", 500));
  }
});

router.patch("/kpis/:id/actual", async (req: AuthRequest, res) => {
  try {
    if (!canUpdateKpiActuals(req)) {
      return res.status(403).json(errorResponse("You do not have access to update KPI actuals", 403));
    }

    const kpiId = parseIntSafe(req.params.id);
    if (!kpiId) {
      return res.status(400).json(errorResponse("KPI is required", 400));
    }

    const { currentActualValue, lastMeasurementNote } = req.body || {};
    const actualValue = parseNumberSafe(currentActualValue);
    if (actualValue === undefined) {
      return res.status(400).json(errorResponse("Actual value is required", 400));
    }

    const updated = await updateBalancedScorecardKpiActual(kpiId, {
      currentActualValue: actualValue,
      lastMeasurementNote: lastMeasurementNote ? String(lastMeasurementNote) : null,
      recordedByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(updated, "KPI actual updated"));
  } catch (error: any) {
    console.error("Error updating KPI actual:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to update KPI actual" : error.message, statusCode));
  }
});

router.post("/initiatives", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can create firm initiatives", 403));
    }
    const {
      goalId,
      kpiId,
      parentInitiativeId,
      scopeRole,
      title,
      summary,
      ownerName,
      ownerProfileId,
      timeline,
      dueDate,
      status,
      progress,
    } = req.body || {};
    const resolvedGoalId = parseIntSafe(goalId);
    const resolvedKpiId = parseIntSafe(kpiId);
    const resolvedParentInitiativeId = parseIntSafe(parentInitiativeId);
    if (!resolvedGoalId || !resolvedKpiId) {
      return res.status(400).json(errorResponse("Goal and KPI are required", 400));
    }
    if (!scopeRole || !String(scopeRole).trim()) {
      return res.status(400).json(errorResponse("Scope role is required", 400));
    }
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json(errorResponse("Initiative title is required", 400));
    }
    const created = await createBalancedScorecardInitiative({
      goalId: resolvedGoalId,
      kpiId: resolvedKpiId,
      parentInitiativeId: resolvedParentInitiativeId ?? null,
      scopeRole: String(scopeRole),
      title: String(title),
      summary: summary ? String(summary) : null,
      ownerName: ownerName ? String(ownerName) : null,
      ownerProfileId:
        ownerProfileId === undefined ? undefined : parseIntSafe(ownerProfileId) ?? null,
      timeline: timeline ? String(timeline) : null,
      dueDate: dueDate ? String(dueDate) : null,
      status:
        status === "on_track" || status === "at_risk" || status === "off_track"
          ? status
          : "at_risk",
      progress: Number(progress ?? 0),
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(created, "Initiative created"));
  } catch (error: any) {
    console.error("Error creating initiative:", error);
    return res.status(500).json(errorResponse("Failed to create initiative", 500));
  }
});

router.patch("/initiatives/:id", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can update initiatives", 403));
    }
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) {
      return res.status(400).json(errorResponse("Initiative is required", 400));
    }
    const { title, summary, ownerName, ownerProfileId, timeline, dueDate, status, progress, scopeRole } = req.body || {};
    if (title !== undefined && String(title).trim().length < 3) {
      return res.status(400).json(errorResponse("Initiative title must be at least 3 characters", 400));
    }
    if (
      status !== undefined &&
      !["on_track", "at_risk", "off_track"].includes(String(status))
    ) {
      return res.status(400).json(errorResponse("Invalid initiative status", 400));
    }
    const updated = await updateBalancedScorecardInitiative(initiativeId, {
      title: title ? String(title) : undefined,
      summary: summary !== undefined ? (summary ? String(summary) : null) : undefined,
      ownerName: ownerName !== undefined ? (ownerName ? String(ownerName) : null) : undefined,
      ownerProfileId:
        ownerProfileId === undefined ? undefined : parseIntSafe(ownerProfileId) ?? null,
      timeline: timeline !== undefined ? (timeline ? String(timeline) : null) : undefined,
      dueDate: dueDate !== undefined ? (dueDate ? String(dueDate) : null) : undefined,
      status: status ? (String(status) as "on_track" | "at_risk" | "off_track") : undefined,
      progress: progress !== undefined ? parseNumberSafe(progress) : undefined,
      scopeRole: scopeRole ? String(scopeRole) : undefined,
    });
    return res.json(successResponse(updated, "Initiative updated"));
  } catch (error: any) {
    console.error("Error updating initiative:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json(
      errorResponse(statusCode >= 500 ? "Failed to update initiative" : error.message, statusCode)
    );
  }
});

router.delete("/initiatives/:id", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can archive initiatives", 403));
    }
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) {
      return res.status(400).json(errorResponse("Initiative is required", 400));
    }
    const archived = await archiveBalancedScorecardInitiative(initiativeId);
    return res.json(successResponse(archived, "Initiative archived"));
  } catch (error: any) {
    console.error("Error archiving initiative:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json(
      errorResponse(statusCode >= 500 ? "Failed to archive initiative" : error.message, statusCode)
    );
  }
});

router.get("/kpi-assignments", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can review KPI assignments", 403));
    }

    const assignments = await listBalancedScorecardKpiAssignments({
      scorecardVersionId: parseIntSafe(req.query.scorecardVersionId),
      profileId: parseIntSafe(req.query.profileId),
    });
    return res.json(successResponse(assignments, "KPI assignments loaded"));
  } catch (error: any) {
    console.error("Error loading KPI assignments:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to load KPI assignments" : error.message, statusCode));
  }
});

router.post("/kpi-assignments", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can manage KPI assignments", 403));
    }

    const kpiId = parseIntSafe(req.body?.kpiId);
    const profileId = parseIntSafe(req.body?.profileId);
    const scorecardVersionId =
      req.body?.scorecardVersionId === undefined
        ? undefined
        : parseIntSafe(req.body?.scorecardVersionId) ?? null;
    const individualTarget =
      req.body?.individualTarget === undefined ? undefined : parseNumberSafe(req.body?.individualTarget);
    const individualWeight =
      req.body?.individualWeight === undefined ? undefined : parseNumberSafe(req.body?.individualWeight);

    if (!kpiId || !profileId) {
      return res.status(400).json(errorResponse("KPI and profile are required", 400));
    }
    if (individualTarget !== undefined && !Number.isFinite(individualTarget)) {
      return res.status(400).json(errorResponse("individualTarget must be numeric", 400));
    }
    if (individualWeight !== undefined && !Number.isFinite(individualWeight)) {
      return res.status(400).json(errorResponse("individualWeight must be numeric", 400));
    }

    const assignment = await upsertBalancedScorecardKpiAssignment({
      kpiId,
      profileId,
      scorecardVersionId,
      individualTarget: individualTarget ?? undefined,
      individualWeight: individualWeight ?? undefined,
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(assignment, "KPI assignment saved"));
  } catch (error: any) {
    console.error("Error saving KPI assignment:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to save KPI assignment" : error.message, statusCode));
  }
});

router.delete("/kpi-assignments/:id", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can manage KPI assignments", 403));
    }

    const assignmentId = parseIntSafe(req.params.id);
    if (!assignmentId) {
      return res.status(400).json(errorResponse("Assignment is required", 400));
    }

    const deleted = await deleteBalancedScorecardKpiAssignment(assignmentId);
    return res.json(successResponse(deleted, "KPI assignment removed"));
  } catch (error: any) {
    console.error("Error deleting KPI assignment:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to delete KPI assignment" : error.message, statusCode));
  }
});

router.get("/performance-bands", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can review performance bands", 403));
    }

    const bands = await listPerformanceBands();
    return res.json(successResponse(bands, "Performance bands loaded"));
  } catch (error: any) {
    console.error("Error loading performance bands:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to load performance bands" : error.message, statusCode));
  }
});

router.post("/performance-bands", async (req: AuthRequest, res) => {
  try {
    if (!canManageBalancedScorecard(req)) {
      return res.status(403).json(errorResponse("Only HR can manage performance bands", 403));
    }

    const roleId =
      req.body?.roleId === undefined ? undefined : parseIntSafe(req.body?.roleId) ?? null;
    const onTrackMin = parseNumberSafe(req.body?.onTrackMin);
    const atRiskMin = parseNumberSafe(req.body?.atRiskMin);
    const label = typeof req.body?.label === "string" ? String(req.body.label) : undefined;

    if (!Number.isFinite(onTrackMin) || !Number.isFinite(atRiskMin)) {
      return res.status(400).json(errorResponse("onTrackMin and atRiskMin are required", 400));
    }

    const band = await upsertPerformanceBand({
      roleId,
      onTrackMin: Number(onTrackMin),
      atRiskMin: Number(atRiskMin),
      label,
    });
    return res.json(successResponse(band, "Performance band saved"));
  } catch (error: any) {
    console.error("Error saving performance band:", error);
    const statusCode = Number(error?.statusCode || 500);
    return res
      .status(statusCode)
      .json(errorResponse(statusCode >= 500 ? "Failed to save performance band" : error.message, statusCode));
  }
});

router.get("/modules", async (_req, res) => {
  try {
    return res.json(
      successResponse(
        {
          modules: listDashboardModules(),
          coverage: listDashboardModuleCoverageSummaries(),
        },
        "Dashboard module coverage loaded"
      )
    );
  } catch (error: any) {
    console.error("Error loading dashboard modules:", error);
    return res.status(500).json(errorResponse("Failed to load dashboard modules", 500));
  }
});

router.get("/modules/:module", async (req, res) => {
  try {
    const moduleParam = String(req.params.module || "").toLowerCase();
    if (!isDashboardModuleKey(moduleParam)) {
      return res.status(404).json(errorResponse("Unknown dashboard module", 404));
    }

    const moduleCoverage = getDashboardModuleCoverage(moduleParam as DashboardModuleKey);

    return res.json(successResponse(moduleCoverage, "Dashboard module details loaded"));
  } catch (error: any) {
    console.error("Error loading dashboard module coverage:", error);
    return res
      .status(500)
      .json(errorResponse("Failed to load dashboard module coverage", 500));
  }
});

router.get("/resolve-module", async (req: AuthRequest, res) => {
  try {
    const profileId = parseIntSafe(req.query.profileId) ?? parseIntSafe(req.user?.profileId);
    const roleQuery = typeof req.query.role === "string" ? req.query.role : undefined;
    const positionTitleQuery =
      typeof req.query.positionTitle === "string" ? req.query.positionTitle : undefined;

    let roles = (req.userRoles || []).map((role) => role.toLowerCase());
    let positionTitle = positionTitleQuery ?? null;

    if (roleQuery) {
      roles = Array.from(new Set([...roles, roleQuery.toLowerCase()]));
    }

    if (profileId) {
      const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          positionTitle: true,
          role: { select: { name: true } },
        },
      });

      if (profile?.role?.name) {
        roles = Array.from(new Set([...roles, profile.role.name.toLowerCase()]));
      }
      if (profile?.positionTitle) {
        positionTitle = profile.positionTitle;
      }
    }

    const module = resolveDashboardModuleForContext({
      roles,
      positionTitle,
    });

    return res.json(
      successResponse(
        {
          module,
          roleSignals: roles,
          positionTitle,
          coverage: getDashboardModuleCoverageSummary(module),
        },
        "Dashboard module resolved"
      )
    );
  } catch (error: any) {
    console.error("Error resolving dashboard module:", error);
    return res.status(500).json(errorResponse("Failed to resolve dashboard module", 500));
  }
});

router.get("/default-scoring", async (req: AuthRequest, res) => {
  try {
    const profileId =
      parseIntSafe(req.query.profileId) ?? parseIntSafe(req.user?.profileId) ?? undefined;
    const roleName = typeof req.query.role === "string" ? req.query.role : undefined;
    const positionTitle =
      typeof req.query.positionTitle === "string" ? req.query.positionTitle : undefined;

    let profile: { role?: { name?: string | null } | null; positionTitle?: string | null } = {
      role: roleName ? { name: roleName } : undefined,
      positionTitle: positionTitle ?? null,
    };

    if (profileId) {
      const dbProfile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          positionTitle: true,
          role: { select: { name: true } },
        },
      });
      if (dbProfile) profile = dbProfile;
    }

    const scoringConfig = buildDefaultScoringConfig(profile);

    return res.json(
      successResponse(
        {
          profileId: profileId ?? null,
          role: profile.role?.name ?? null,
          positionTitle: profile.positionTitle ?? null,
          scoringConfig,
        },
        "Default scoring config loaded"
      )
    );
  } catch (error: any) {
    console.error("Error building default scoring config:", error);
    return res.status(500).json(errorResponse("Failed to build scoring config", 500));
  }
});

router.get("/resolved-scoring", async (req: AuthRequest, res) => {
  try {
    const profileId =
      parseIntSafe(req.query.profileId) ?? parseIntSafe(req.user?.profileId) ?? undefined;
    const evaluationCycleId = parseIntSafe(req.query.evaluationCycleId);

    if (!profileId) {
      return res
        .status(400)
        .json(errorResponse("profileId is required when user profile is unavailable", 400));
    }

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        departmentId: true,
        positionTitle: true,
        role: { select: { name: true } },
      },
    });

    if (!profile) {
      return res.status(404).json(errorResponse("Profile not found", 404));
    }

    const definition = await resolveDefinitionForProfile(
      profile.departmentId ?? null,
      evaluationCycleId
    );
    const mergedScoringConfig = mergeWithDefaultScoringConfig(
      (definition?.scoringConfig ?? {}) as Record<string, any>,
      profile
    );

    return res.json(
      successResponse(
        {
          profileId: profile.id,
          role: profile.role?.name ?? null,
          positionTitle: profile.positionTitle ?? null,
          evaluationCycleId: evaluationCycleId ?? null,
          definitionId: definition?.id ?? null,
          definitionCycleId: definition?.cycleId ?? null,
          definitionDepartmentId: definition?.departmentId ?? null,
          scoringConfig: mergedScoringConfig,
        },
        "Resolved scoring config loaded"
      )
    );
  } catch (error: any) {
    console.error("Error resolving scoring config:", error);
    return res.status(500).json(errorResponse("Failed to resolve scoring config", 500));
  }
});

export default router;
