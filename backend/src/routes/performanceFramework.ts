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
import { AuthRequest } from "../middleware/auth";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const parseIntSafe = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

    let roles = (req.user?.authRoles || []).map((role) => role.toLowerCase());
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
