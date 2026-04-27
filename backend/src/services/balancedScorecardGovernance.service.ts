import { randomUUID } from "crypto";
import prisma from "../prisma";
import cacheService from "./cache.service";
import { buildBalancedScorecardBaselineSource } from "./balancedScorecardBaseline";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const uniqueKey = (prefix: string, value: string) =>
  `${prefix}-${slugify(value) || "item"}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;

const mapNotFound = (message: string) => {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 404;
  return err;
};

const mapConflict = (message: string) => {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 409;
  return err;
};

const invalidateBalancedScorecardWorkspaceCache = () => {
  cacheService.invalidate("^bsc:workspace:");
};

const ensureNoConflictingCycle = async (params: {
  startDate: Date;
  endDate: Date;
}) => {
  const conflictingCycle = await prisma.balancedScorecardCycle.findFirst({
    where: {
      status: { in: ["draft", "active"] },
      startDate: { lte: params.endDate },
      endDate: { gte: params.startDate },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      status: true,
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });

  if (!conflictingCycle) return;

  throw mapConflict(
    `Cycle "${conflictingCycle.name}" (${conflictingCycle.startDate.toISOString().slice(0, 10)} to ${conflictingCycle.endDate
      .toISOString()
      .slice(0, 10)}) already overlaps this date range.`
  );
};

const validateVersionGoalWeights = async (versionId: number) => {
  const [goals, kpis] = await Promise.all([
    prisma.balancedScorecardGoal.findMany({
      where: { scorecardVersionId: versionId, isActive: true },
      select: { id: true, title: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardKpi.findMany({
      where: { scorecardVersionId: versionId, isActive: true },
      select: { goalId: true, weight: true },
    }),
  ]);

  const totalWeightByGoalId = new Map<number, number>();
  kpis.forEach((kpi) => {
    totalWeightByGoalId.set(kpi.goalId, (totalWeightByGoalId.get(kpi.goalId) ?? 0) + (kpi.weight ?? 0));
  });

  const violations = goals
    .map((goal) => ({
      title: goal.title,
      totalWeight: totalWeightByGoalId.get(goal.id) ?? 0,
    }))
    .filter((goal) => goal.totalWeight !== 100);

  if (violations.length === 0) return;

  const summary = violations
    .map((goal) => `"${goal.title}" totals ${goal.totalWeight}%`)
    .join(", ");
  throw mapConflict(
    `Every goal must total exactly 100% KPI weight before publishing. ${summary}.`
  );
};

export type BalancedScorecardGovernanceVersion = {
  id: number;
  cycleId: number;
  versionNumber: number;
  label: string | null;
  status: "draft" | "published" | "superseded" | "archived";
  publishedAt: Date | null;
  createdAt: Date;
  perspectiveCount: number;
  goalCount: number;
  kpiCount: number;
  initiativeCount: number;
};

export type BalancedScorecardGovernanceCycle = {
  id: number;
  key: string;
  name: string;
  cadence: "monthly" | "quarterly" | "annual";
  status: "draft" | "active" | "closed" | "archived";
  startDate: Date;
  endDate: Date;
  activeVersionId: number | null;
  versions: BalancedScorecardGovernanceVersion[];
};

const listSourceStructure = async (scorecardVersionId: number | null) => {
  const versionFilter =
    scorecardVersionId === null ? { scorecardVersionId: null } : { scorecardVersionId };

  const [perspectives, goals, kpis, initiatives, kpiAssignments] = await Promise.all([
    prisma.balancedScorecardPerspective.findMany({
      where: { isActive: true, ...versionFilter },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardGoal.findMany({
      where: { isActive: true, ...versionFilter },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardKpi.findMany({
      where: { isActive: true, ...versionFilter },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.balancedScorecardInitiative.findMany({
      where: { isActive: true, ...versionFilter },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    scorecardVersionId === null
      ? Promise.resolve([])
      : prisma.balancedScorecardKpiAssignment.findMany({
          where: { scorecardVersionId },
          orderBy: [{ profileId: "asc" }, { id: "asc" }],
        }),
  ]);

  return { perspectives, goals, kpis, initiatives, kpiAssignments };
};

export async function resolveActiveBalancedScorecardVersionId() {
  const activeCycle = await prisma.balancedScorecardCycle.findFirst({
    where: {
      status: "active",
      activeVersionId: { not: null },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    select: { activeVersionId: true },
  });

  return activeCycle?.activeVersionId ?? null;
}

export async function listBalancedScorecardGovernance() {
  const cycles = await prisma.balancedScorecardCycle.findMany({
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    include: {
      versions: {
        orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
        include: {
          _count: {
            select: {
              perspectives: true,
              goals: true,
              kpis: true,
              initiatives: true,
            },
          },
        },
      },
    },
  });

  return cycles.map(
    (cycle) =>
      ({
        id: cycle.id,
        key: cycle.key,
        name: cycle.name,
        cadence: cycle.cadence as BalancedScorecardGovernanceCycle["cadence"],
        status: cycle.status as BalancedScorecardGovernanceCycle["status"],
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        activeVersionId: cycle.activeVersionId ?? null,
        versions: cycle.versions.map(
          (version) =>
            ({
              id: version.id,
              cycleId: version.cycleId,
              versionNumber: version.versionNumber,
              label: version.label ?? null,
              status: version.status as BalancedScorecardGovernanceVersion["status"],
              publishedAt: version.publishedAt ?? null,
              createdAt: version.createdAt,
              perspectiveCount: version._count.perspectives,
              goalCount: version._count.goals,
              kpiCount: version._count.kpis,
              initiativeCount: version._count.initiatives,
            }) satisfies BalancedScorecardGovernanceVersion
        ),
      }) satisfies BalancedScorecardGovernanceCycle
  );
}

export async function createBalancedScorecardCycle(input: {
  name: string;
  cadence: "monthly" | "quarterly" | "annual";
  startDate: string;
  endDate: string;
  createdByProfileId?: number | null;
}) {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    const err = new Error("Valid cycle start date is required") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    const err = new Error("Valid cycle end date is required") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  if (endDate <= startDate) {
    const err = new Error("Cycle end date must be after the start date") as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  await ensureNoConflictingCycle({ startDate, endDate });

  const created = await prisma.balancedScorecardCycle.create({
    data: {
      key: uniqueKey("scorecard-cycle", input.name),
      name: input.name.trim(),
      cadence: input.cadence,
      startDate,
      endDate,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
  invalidateBalancedScorecardWorkspaceCache();
  return created;
}

export async function createBalancedScorecardVersion(input: {
  cycleId: number;
  label?: string | null;
  sourceVersionId?: number | null;
  createdByProfileId?: number | null;
}) {
  const cycle = await prisma.balancedScorecardCycle.findUnique({
    where: { id: input.cycleId },
    include: {
      versions: {
        orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  });

  if (!cycle) {
    throw mapNotFound("Scorecard cycle not found");
  }

  const nextVersionNumber = (cycle.versions[0]?.versionNumber ?? 0) + 1;
  const fallbackSourceVersionId = cycle.activeVersionId ?? (await resolveActiveBalancedScorecardVersionId());
  const hasExplicitSourceVersion =
    Object.prototype.hasOwnProperty.call(input, "sourceVersionId");
  const sourceVersionId = hasExplicitSourceVersion
    ? (input.sourceVersionId ?? null)
    : fallbackSourceVersionId ?? null;
  const source =
    sourceVersionId === null
      ? buildBalancedScorecardBaselineSource()
      : await listSourceStructure(sourceVersionId);

  const createdVersion = await prisma.$transaction(async (tx) => {
    const createdVersion = await tx.balancedScorecardVersion.create({
      data: {
        cycleId: input.cycleId,
        versionNumber: nextVersionNumber,
        label: input.label?.trim() || null,
        createdByProfileId: input.createdByProfileId ?? null,
      },
    });

    const perspectiveIdMap = new Map<number, number>();
    for (const perspective of source.perspectives) {
      const createdPerspective = await tx.balancedScorecardPerspective.create({
        data: {
          key: uniqueKey("perspective", perspective.name),
          scorecardVersionId: createdVersion.id,
          name: perspective.name,
          ownerName: perspective.ownerName ?? null,
          summary: perspective.summary ?? null,
          sortOrder: perspective.sortOrder,
          createdByProfileId: input.createdByProfileId ?? null,
        },
      });
      perspectiveIdMap.set(perspective.id, createdPerspective.id);
    }

    const goalIdMap = new Map<number, number>();
    for (const goal of source.goals) {
      const createdGoal = await tx.balancedScorecardGoal.create({
        data: {
          key: uniqueKey("goal", goal.title),
          perspectiveId: perspectiveIdMap.get(goal.perspectiveId)!,
          scorecardVersionId: createdVersion.id,
          title: goal.title,
          description: goal.description ?? null,
          ownerName: goal.ownerName ?? null,
          sortOrder: goal.sortOrder,
          createdByProfileId: input.createdByProfileId ?? null,
        },
      });
      goalIdMap.set(goal.id, createdGoal.id);
    }

    const kpiIdMap = new Map<number, number>();
    for (const kpi of source.kpis) {
      const createdKpi = await tx.balancedScorecardKpi.create({
        data: {
          key: uniqueKey("kpi", kpi.name),
          goalId: goalIdMap.get(kpi.goalId)!,
          scorecardVersionId: createdVersion.id,
          metricKey: kpi.metricKey,
          trackingMode: kpi.trackingMode,
          measurementType: kpi.measurementType ?? null,
          targetDirection: kpi.targetDirection ?? null,
          targetValue: kpi.targetValue,
          currentActualValue: kpi.currentActualValue,
          lastMeasurementNote: kpi.lastMeasurementNote ?? null,
          name: kpi.name,
          description: kpi.description ?? null,
          formula: kpi.formula ?? null,
          frequency: kpi.frequency,
          unit: kpi.unit,
          weight: kpi.weight,
          firmTarget: kpi.firmTarget,
          ownerName: kpi.ownerName ?? null,
          ownerProfileId: kpi.ownerProfileId ?? null,
          statusLogic: kpi.statusLogic ?? null,
          updateFrequency: kpi.updateFrequency ?? null,
          sortOrder: kpi.sortOrder,
          createdByProfileId: input.createdByProfileId ?? null,
        },
      });
      kpiIdMap.set(kpi.id, createdKpi.id);
    }

    const initiativeIdMap = new Map<number, number>();
    for (const initiative of source.initiatives) {
      const createdInitiative = await tx.balancedScorecardInitiative.create({
        data: {
          key: uniqueKey("initiative", initiative.title),
          goalId: goalIdMap.get(initiative.goalId)!,
          kpiId: kpiIdMap.get(initiative.kpiId)!,
          scorecardVersionId: createdVersion.id,
          parentInitiativeId: null,
          scopeRole: initiative.scopeRole,
          title: initiative.title,
          summary: initiative.summary ?? null,
          ownerName: initiative.ownerName ?? null,
          ownerProfileId: initiative.ownerProfileId ?? null,
          timeline: initiative.timeline ?? null,
          dueDate: initiative.dueDate ?? null,
          status: initiative.status,
          progress: initiative.progress,
          sortOrder: initiative.sortOrder,
          createdByProfileId: input.createdByProfileId ?? null,
        },
      });
      initiativeIdMap.set(initiative.id, createdInitiative.id);
    }

    for (const initiative of source.initiatives) {
      if (!initiative.parentInitiativeId) continue;
      await tx.balancedScorecardInitiative.update({
        where: { id: initiativeIdMap.get(initiative.id)! },
        data: {
          parentInitiativeId: initiativeIdMap.get(initiative.parentInitiativeId) ?? null,
        },
      });
    }

    for (const assignment of source.kpiAssignments) {
      const targetKpiId = kpiIdMap.get(assignment.kpiId);
      if (!targetKpiId) continue;
      await tx.balancedScorecardKpiAssignment.create({
        data: {
          kpiId: targetKpiId,
          profileId: assignment.profileId,
          scorecardVersionId: createdVersion.id,
          individualTarget: assignment.individualTarget,
          individualWeight: assignment.individualWeight,
          createdByProfileId: input.createdByProfileId ?? assignment.createdByProfileId ?? null,
        },
      });
    }

    return createdVersion;
  });
  invalidateBalancedScorecardWorkspaceCache();
  return createdVersion;
}

export async function publishBalancedScorecardVersion(versionId: number) {
  const version = await prisma.balancedScorecardVersion.findUnique({
    where: { id: versionId },
    include: {
      cycle: {
        select: {
          id: true,
          status: true,
        },
      },
      _count: {
        select: {
          perspectives: true,
          goals: true,
          kpis: true,
          initiatives: true,
        },
      },
    },
  });

  if (!version) {
    throw mapNotFound("Scorecard version not found");
  }

  await validateVersionGoalWeights(version.id);

  const publishedVersion = await prisma.$transaction(async (tx) => {
    await tx.balancedScorecardVersion.updateMany({
      where: {
        cycleId: version.cycleId,
        id: { not: version.id },
        status: "published",
      },
      data: { status: "superseded" },
    });

    await tx.balancedScorecardCycle.updateMany({
      where: {
        id: { not: version.cycleId },
        status: "active",
      },
      data: {
        status: "closed",
        activeVersionId: null,
      },
    });

    await tx.balancedScorecardCycle.update({
      where: { id: version.cycleId },
      data: {
        status: "active",
        activeVersionId: version.id,
      },
    });

    return tx.balancedScorecardVersion.update({
      where: { id: version.id },
      data: {
        status: "published",
        publishedAt: new Date(),
      },
    });
  });
  invalidateBalancedScorecardWorkspaceCache();
  return publishedVersion;
}
