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
  archiveBalancedScorecardPerspective,
  createBalancedScorecardGoal,
  createBalancedScorecardInitiative,
  createBalancedScorecardKpi,
  KpiMeasurementType,
  KpiTargetDirection,
  KpiTrackingMode,
  createBalancedScorecardPerspective,
  ensureBalancedScorecardSeed,
  listBalancedScorecardMetricTemplates,
  listBalancedScorecardStructure,
  updateBalancedScorecardPerspective,
} from "../services/balancedScorecardStructure.service";
import { AuthRequest } from "../middleware/auth";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

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
    const profileId = parseIntSafe(req.query.profileId) ?? parseIntSafe(req.user?.profileId);
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
      evaluationCycleId: evaluationCycleId ?? null,
    });

    return res.json(successResponse(workspace, "Balanced scorecard workspace loaded"));
  } catch (error: any) {
    console.error("Error loading balanced scorecard workspace:", error);
    return res.status(500).json(errorResponse("Failed to load balanced scorecard workspace", 500));
  }
});

router.get("/scorecard-structure", async (_req, res) => {
  try {
    const structure = await listBalancedScorecardStructure();
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
    const { name, ownerName, summary } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json(errorResponse("Perspective name is required", 400));
    }
    const created = await createBalancedScorecardPerspective({
      name: String(name),
      ownerName: ownerName ? String(ownerName) : null,
      summary: summary ? String(summary) : null,
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
      statusLogic: statusLogic ? String(statusLogic) : null,
      updateFrequency: updateFrequency ? String(updateFrequency) : null,
      createdByProfileId: parseIntSafe(req.user?.profileId) ?? null,
    });
    return res.json(successResponse(created, "KPI contract created"));
  } catch (error: any) {
    console.error("Error creating KPI:", error);
    return res.status(500).json(errorResponse("Failed to create KPI contract", 500));
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
