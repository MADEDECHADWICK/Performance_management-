import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import websocketService from "./websocket.service";
import { NotificationService } from "./notifications.service";
import { createAudit } from "../utils/audit";
import {
  KPI_INCLUDE,
  buildKpiMetrics,
  buildListWhere,
  hasElevatedKpiAccess,
  isManagerRole,
  mapKpi,
  normalizeDirection,
  normalizeText,
  normalizeWeightPercent,
  parseDate,
  resolveActualValue,
  resolveBaselineText,
  resolveKpiName,
  resolveOwnerProfileId,
  resolveTargetValue,
  resolveKpiStatus,
  roundTo,
  toNullableNumber,
  toNumber,
} from "./kpis.service.helpers";

type ServiceAuthContext = {
  userId: number;
  profileId: number;
  roles: string[];
};

type KpiInput = {
  userId?: number;
  ownerProfileId?: number;
  cycleId?: number | null;
  departmentId?: number | null;
  roleId?: number | null;
  title?: string;
  name?: string;
  description?: string;
  category?: string;
  kpiType?: string;
  strategicTheme?: string;
  strategicObjective?: string;
  criticalSuccessFactor?: string;
  indicatorType?: string;
  kpiCategory?: string;
  target?: number;
  targetValue?: number;
  actual?: number;
  actualValue?: number;
  baseline?: number | string;
  baselineText?: string;
  unit?: string;
  measurementUnit?: string;
  targetFrequency?: string;
  targetType?: string;
  targetDescription?: string;
  weight?: number;
  dueDate?: string | Date | null;
  reviewOwnerProfileId?: number | null;
  reviewFrequency?: string;
  approvalRequired?: boolean;
  evidenceRequired?: boolean;
  commentaryRequired?: boolean;
  redThreshold?: number;
  amberThreshold?: number;
  greenThreshold?: number;
  dataSourceType?: string;
  sourceReference?: string;
  formulaLocked?: boolean;
  rollupMethod?: string;
  inheritWeight?: boolean;
  isActive?: boolean;
};

type KpiProgressInput = {
  actual: number;
  note?: string;
  measuredAt?: string | Date | null;
};

type ListFilters = {
  userId?: number;
  departmentId?: number;
  status?: string;
  isActive?: boolean;
};

type PrismaTx = Prisma.TransactionClient;

const ensureCanManageProfile = async (targetProfileId: number, auth: ServiceAuthContext) => {
  if (targetProfileId === auth.profileId || hasElevatedKpiAccess(auth.roles)) return;

  if (!isManagerRole(auth.roles)) {
    throw { statusCode: 403, message: "You do not have access to manage this KPI" };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: targetProfileId },
    select: { managerId: true },
  });

  if (profile?.managerId !== auth.profileId) {
    throw { statusCode: 403, message: "You do not have access to manage this KPI" };
  }
};

const ensureCanAccessKpiRecord = async (
  kpi: { ownerProfileId?: number | null; createdByProfileId?: number | null },
  auth: ServiceAuthContext
) => {
  if (kpi.ownerProfileId) {
    await ensureCanManageProfile(kpi.ownerProfileId, auth);
    return;
  }

  if (kpi.createdByProfileId === auth.profileId || hasElevatedKpiAccess(auth.roles)) return;
  throw { statusCode: 403, message: "You do not have access to this KPI" };
};

const emitKpiEvent = (kpi: any) => {
  const metrics = buildKpiMetrics(kpi);
  websocketService.emitToUser(String(kpi.ownerProfileId), "kpi:updated", {
    kpiId: kpi.id,
    actual: toNumber(kpi.actualValue),
    target: toNumber(kpi.targetValue),
    status: kpi.progressStatus,
    achievementPercent: metrics.achievementPercent,
    progressPercent: metrics.progressPercent,
    isOverdue: metrics.isOverdue,
  });
};

const recordKpiMeasurement = async (
  tx: PrismaTx,
  kpi: {
    id: number;
    ownerProfileId?: number | null;
    actualValue?: unknown;
    targetValue?: unknown;
    weight?: unknown;
    dueDate?: Date | null;
    targetType?: string | null;
    redThreshold?: unknown;
    amberThreshold?: unknown;
    greenThreshold?: unknown;
    updatedAt?: Date | null;
  },
  note?: string | null,
  measuredAt?: Date | null
) => {
  if (!kpi.ownerProfileId) return;

  const metrics = buildKpiMetrics(kpi);
  const effectiveMeasuredAt = measuredAt || new Date();

  await tx.employeeKpiScore.create({
    data: {
      employeeProfileId: kpi.ownerProfileId,
      kpiId: kpi.id,
      periodStart: effectiveMeasuredAt,
      periodEnd: effectiveMeasuredAt,
      calculatedValue: new Prisma.Decimal(toNumber(kpi.actualValue)),
      targetValue: new Prisma.Decimal(toNumber(kpi.targetValue)),
      achievementPercent: new Prisma.Decimal(metrics.achievementPercent),
      weightPercent: new Prisma.Decimal(metrics.weightPercent),
      weightedScore: new Prisma.Decimal(metrics.weightedScore),
      notes: note || null,
      calculatedAt: effectiveMeasuredAt,
    },
  });
};


export class KPIService {
  static async listKPIs(filters: ListFilters, auth: ServiceAuthContext) {
    if (filters.userId) {
      await ensureCanManageProfile(filters.userId, auth);
    }

    const kpis = await prisma.kpi.findMany({
      where: buildListWhere(filters, auth),
      include: KPI_INCLUDE,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    return kpis.map((kpi) => mapKpi(kpi));
  }

  static async getKPIById(kpiId: number, auth: ServiceAuthContext) {
    const kpi = await prisma.kpi.findUnique({
      where: { id: kpiId },
      include: KPI_INCLUDE,
    });

    if (!kpi || kpi.deletedAt) {
      throw { statusCode: 404, message: "KPI not found" };
    }

    await ensureCanAccessKpiRecord(kpi, auth);

    const history = kpi.ownerProfileId
      ? await prisma.employeeKpiScore.findMany({
          where: {
            kpiId,
            employeeProfileId: kpi.ownerProfileId,
          },
          orderBy: { calculatedAt: "desc" },
          take: 20,
        })
      : [];

    return mapKpi(kpi, history);
  }

  static async createKPI(input: KpiInput, auth: ServiceAuthContext) {
    const ownerProfileId = resolveOwnerProfileId(input, auth.profileId);
    await ensureCanManageProfile(ownerProfileId, auth);

    const title = resolveKpiName(input);
    if (!title) {
      throw { statusCode: 400, message: "title is required" };
    }

    const ownerProfile = await prisma.profile.findUnique({
      where: { id: ownerProfileId },
      select: { id: true, departmentId: true },
    });

    if (!ownerProfile) {
      throw { statusCode: 404, message: "KPI owner profile not found" };
    }

    const targetValue = resolveTargetValue(input);
    const actualValue = resolveActualValue(input);
    const weight = roundTo(toNumber(input.weight) || 1);
    const dueDate = parseDate(input.dueDate, "dueDate");
    const baselineText = resolveBaselineText(input);
    const reviewOwnerProfileId =
      input.reviewOwnerProfileId !== undefined
        ? input.reviewOwnerProfileId || null
        : auth.profileId !== ownerProfileId
          ? auth.profileId
          : null;
    const status = resolveKpiStatus({
      actual: actualValue,
      target: targetValue,
      dueDate,
      direction: normalizeDirection(input.targetType),
      redThreshold: toNullableNumber(input.redThreshold),
      amberThreshold: toNullableNumber(input.amberThreshold),
      greenThreshold: toNullableNumber(input.greenThreshold),
    });

    const created = await prisma.$transaction(async (tx) => {
      const kpi = await tx.kpi.create({
        data: {
          name: title,
          description: normalizeText(input.description) || null,
          category: normalizeText(input.category) || "employee_performance",
          kpiType: normalizeText(input.kpiType) || "individual",
          strategicTheme: normalizeText(input.strategicTheme) || null,
          strategicObjective: normalizeText(input.strategicObjective) || null,
          criticalSuccessFactor: normalizeText(input.criticalSuccessFactor) || null,
          indicatorType: normalizeText(input.indicatorType) || null,
          kpiCategory: normalizeText(input.kpiCategory) || null,
          measurementUnit: normalizeText(input.unit || input.measurementUnit) || "%",
          targetValue: new Prisma.Decimal(targetValue),
          targetFrequency: normalizeText(input.targetFrequency) || "monthly",
          targetDescription: normalizeText(input.targetDescription) || null,
          targetType: normalizeText(input.targetType) || "higher_better",
          baselineText,
          redThreshold:
            input.redThreshold !== undefined && input.redThreshold !== null
              ? new Prisma.Decimal(toNumber(input.redThreshold))
              : null,
          amberThreshold:
            input.amberThreshold !== undefined && input.amberThreshold !== null
              ? new Prisma.Decimal(toNumber(input.amberThreshold))
              : null,
          greenThreshold:
            input.greenThreshold !== undefined && input.greenThreshold !== null
              ? new Prisma.Decimal(toNumber(input.greenThreshold))
              : null,
          weight: new Prisma.Decimal(weight),
          departmentId: input.departmentId || ownerProfile.departmentId || null,
          roleId: input.roleId || null,
          ownerProfileId,
          cycleId: input.cycleId || null,
          actualValue: new Prisma.Decimal(actualValue),
          dueDate,
          progressStatus: status,
          createdByProfileId: auth.profileId,
          reviewOwnerProfileId,
          reviewFrequency:
            normalizeText(input.reviewFrequency) || normalizeText(input.targetFrequency) || "monthly",
          approvalRequired: Boolean(input.approvalRequired),
          evidenceRequired: Boolean(input.evidenceRequired),
          commentaryRequired: Boolean(input.commentaryRequired),
          dataSourceType: normalizeText(input.dataSourceType) || "manual",
          sourceReference: normalizeText(input.sourceReference) || null,
          formulaLocked: Boolean(input.formulaLocked),
          rollupMethod: normalizeText(input.rollupMethod) || null,
          inheritWeight: input.inheritWeight === undefined ? true : Boolean(input.inheritWeight),
          isActive: input.isActive === undefined ? true : Boolean(input.isActive),
        },
        include: KPI_INCLUDE,
      });

      await recordKpiMeasurement(tx, kpi, "KPI created");
      return kpi;
    });

    emitKpiEvent(created);

    if (ownerProfileId !== auth.profileId) {
      await NotificationService.dispatchEvent(
        {
          eventType: "kpi.created",
          title: "New KPI assigned",
          message: `${title} has been added to your performance plan.`,
          canonicalRoute: "/evaluations/kpis",
          targetEntityType: "Kpi",
          targetEntityId: created.id,
          requiredPermission: "module.evaluations.read",
          recipientProfileIds: [ownerProfileId],
        },
        auth
      );
    }

    await createAudit({
      action: "kpi_created",
      entity_type: "Kpi",
      entity_id: created.id,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        ownerProfileId,
        targetValue,
        actualValue,
      } as Prisma.InputJsonValue,
    });

    return this.getKPIById(created.id, auth);
  }

  static async updateKPI(kpiId: number, input: Partial<KpiInput>, auth: ServiceAuthContext) {
    const existing = await prisma.kpi.findUnique({
      where: { id: kpiId },
      include: KPI_INCLUDE,
    });

    if (!existing || existing.deletedAt) {
      throw { statusCode: 404, message: "KPI not found" };
    }

    await ensureCanAccessKpiRecord(existing, auth);

    const ownerProfileId =
      input.ownerProfileId !== undefined || input.userId !== undefined
        ? resolveOwnerProfileId(input as KpiInput, auth.profileId)
        : existing.ownerProfileId || auth.profileId;
    await ensureCanManageProfile(ownerProfileId, auth);

    const title =
      input.title !== undefined || input.name !== undefined
        ? resolveKpiName(input as KpiInput)
        : existing.name;
    if (!title) {
      throw { statusCode: 400, message: "title is required" };
    }

    const targetValue = resolveTargetValue(input, toNumber(existing.targetValue));
    const actualValue = resolveActualValue(input, toNumber(existing.actualValue));
    const dueDate = input.dueDate !== undefined ? parseDate(input.dueDate, "dueDate") : existing.dueDate;
    const targetType =
      input.targetType !== undefined ? normalizeText(input.targetType) || "higher_better" : existing.targetType;
    const redThreshold =
      input.redThreshold !== undefined
        ? input.redThreshold === null
          ? null
          : new Prisma.Decimal(toNumber(input.redThreshold))
        : existing.redThreshold;
    const amberThreshold =
      input.amberThreshold !== undefined
        ? input.amberThreshold === null
          ? null
          : new Prisma.Decimal(toNumber(input.amberThreshold))
        : existing.amberThreshold;
    const greenThreshold =
      input.greenThreshold !== undefined
        ? input.greenThreshold === null
          ? null
          : new Prisma.Decimal(toNumber(input.greenThreshold))
        : existing.greenThreshold;
    const weight =
      input.weight !== undefined ? new Prisma.Decimal(roundTo(toNumber(input.weight) || 1)) : existing.weight;
    const status = resolveKpiStatus({
      actual: actualValue,
      target: targetValue,
      dueDate,
      direction: normalizeDirection(targetType),
      redThreshold: toNullableNumber(redThreshold),
      amberThreshold: toNullableNumber(amberThreshold),
      greenThreshold: toNullableNumber(greenThreshold),
    });

    const updated = await prisma.$transaction(async (tx) => {
      const kpi = await tx.kpi.update({
        where: { id: kpiId },
        data: {
          name: title,
          description: input.description !== undefined ? normalizeText(input.description) || null : undefined,
          category:
            input.category !== undefined ? normalizeText(input.category) || existing.category : undefined,
          kpiType:
            input.kpiType !== undefined ? normalizeText(input.kpiType) || existing.kpiType : undefined,
          strategicTheme:
            input.strategicTheme !== undefined ? normalizeText(input.strategicTheme) || null : undefined,
          strategicObjective:
            input.strategicObjective !== undefined
              ? normalizeText(input.strategicObjective) || null
              : undefined,
          criticalSuccessFactor:
            input.criticalSuccessFactor !== undefined
              ? normalizeText(input.criticalSuccessFactor) || null
              : undefined,
          indicatorType:
            input.indicatorType !== undefined ? normalizeText(input.indicatorType) || null : undefined,
          kpiCategory:
            input.kpiCategory !== undefined ? normalizeText(input.kpiCategory) || null : undefined,
          measurementUnit:
            input.unit !== undefined || input.measurementUnit !== undefined
              ? normalizeText(input.unit || input.measurementUnit) || "%"
              : undefined,
          targetValue: new Prisma.Decimal(targetValue),
          targetFrequency:
            input.targetFrequency !== undefined ? normalizeText(input.targetFrequency) || null : undefined,
          targetDescription:
            input.targetDescription !== undefined
              ? normalizeText(input.targetDescription) || null
              : undefined,
          targetType,
          baselineText:
            input.baseline !== undefined || input.baselineText !== undefined
              ? resolveBaselineText(input, existing.baselineText)
              : undefined,
          redThreshold,
          amberThreshold,
          greenThreshold,
          weight,
          departmentId: input.departmentId !== undefined ? input.departmentId || null : undefined,
          roleId: input.roleId !== undefined ? input.roleId || null : undefined,
          ownerProfileId,
          cycleId: input.cycleId !== undefined ? input.cycleId || null : undefined,
          actualValue: new Prisma.Decimal(actualValue),
          dueDate,
          progressStatus: status,
          reviewOwnerProfileId:
            input.reviewOwnerProfileId !== undefined ? input.reviewOwnerProfileId || null : undefined,
          reviewFrequency:
            input.reviewFrequency !== undefined ? normalizeText(input.reviewFrequency) || null : undefined,
          approvalRequired:
            input.approvalRequired !== undefined ? Boolean(input.approvalRequired) : undefined,
          evidenceRequired:
            input.evidenceRequired !== undefined ? Boolean(input.evidenceRequired) : undefined,
          commentaryRequired:
            input.commentaryRequired !== undefined ? Boolean(input.commentaryRequired) : undefined,
          dataSourceType:
            input.dataSourceType !== undefined ? normalizeText(input.dataSourceType) || null : undefined,
          sourceReference:
            input.sourceReference !== undefined ? normalizeText(input.sourceReference) || null : undefined,
          formulaLocked: input.formulaLocked !== undefined ? Boolean(input.formulaLocked) : undefined,
          rollupMethod:
            input.rollupMethod !== undefined ? normalizeText(input.rollupMethod) || null : undefined,
          inheritWeight: input.inheritWeight !== undefined ? Boolean(input.inheritWeight) : undefined,
          isActive: input.isActive !== undefined ? Boolean(input.isActive) : undefined,
        },
        include: KPI_INCLUDE,
      });

      await recordKpiMeasurement(tx, kpi, "KPI updated");
      return kpi;
    });

    emitKpiEvent(updated);

    await createAudit({
      action: "kpi_updated",
      entity_type: "Kpi",
      entity_id: kpiId,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        ownerProfileId,
      } as Prisma.InputJsonValue,
    });

    return this.getKPIById(updated.id, auth);
  }

  static async deleteKPI(kpiId: number, auth: ServiceAuthContext) {
    const existing = await prisma.kpi.findUnique({
      where: { id: kpiId },
    });

    if (!existing || existing.deletedAt) {
      throw { statusCode: 404, message: "KPI not found" };
    }

    await ensureCanAccessKpiRecord(existing, auth);

    await prisma.kpi.update({
      where: { id: kpiId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await createAudit({
      action: "kpi_deleted",
      entity_type: "Kpi",
      entity_id: kpiId,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
      } as Prisma.InputJsonValue,
    });

    return { id: kpiId, deleted: true };
  }

  static async updateKPIProgress(kpiId: number, input: KpiProgressInput, auth: ServiceAuthContext) {
    const existing = await prisma.kpi.findUnique({
      where: { id: kpiId },
      include: KPI_INCLUDE,
    });

    if (!existing || existing.deletedAt) {
      throw { statusCode: 404, message: "KPI not found" };
    }

    await ensureCanAccessKpiRecord(existing, auth);

    const actualValue = roundTo(toNumber(input.actual));
    if (actualValue < 0) {
      throw { statusCode: 400, message: "actual must be zero or greater" };
    }

    const measuredAt = parseDate(input.measuredAt, "measuredAt") || new Date();
    const status = resolveKpiStatus({
      actual: actualValue,
      target: toNumber(existing.targetValue),
      dueDate: existing.dueDate,
      direction: normalizeDirection(existing.targetType),
      redThreshold: toNullableNumber(existing.redThreshold),
      amberThreshold: toNullableNumber(existing.amberThreshold),
      greenThreshold: toNullableNumber(existing.greenThreshold),
    });

    const updated = await prisma.$transaction(async (tx) => {
      const kpi = await tx.kpi.update({
        where: { id: kpiId },
        data: {
          actualValue: new Prisma.Decimal(actualValue),
          progressStatus: status,
        },
        include: KPI_INCLUDE,
      });

      await recordKpiMeasurement(
        tx,
        kpi,
        normalizeText(input.note) || "KPI progress updated",
        measuredAt
      );

      return kpi;
    });

    emitKpiEvent(updated);

    if (
      updated.reviewOwnerProfileId &&
      updated.reviewOwnerProfileId !== auth.profileId &&
      updated.reviewOwnerProfileId !== updated.ownerProfileId
    ) {
      await NotificationService.dispatchEvent(
        {
          eventType: "kpi.progress.updated",
          title: "KPI progress updated",
          message: `${updated.name} was updated to ${actualValue} ${updated.measurementUnit || ""}`.trim(),
          canonicalRoute: "/evaluations/kpis",
          targetEntityType: "Kpi",
          targetEntityId: updated.id,
          requiredPermission: "module.evaluations.read",
          recipientProfileIds: [updated.reviewOwnerProfileId],
        },
        auth
      );
    }

    await createAudit({
      action: "kpi_progress_updated",
      entity_type: "Kpi",
      entity_id: kpiId,
      user_id: auth.userId,
      metadata: {
        actorProfileId: auth.profileId,
        actualValue,
        note: normalizeText(input.note) || null,
      } as Prisma.InputJsonValue,
    });

    return this.getKPIById(updated.id, auth);
  }

  static async getEmployeeKPIDashboard(userId: number, auth: ServiceAuthContext) {
    await ensureCanManageProfile(userId, auth);

    const [kpis, okrs, goals] = await Promise.all([
      prisma.kpi.findMany({
        where: {
          ownerProfileId: userId,
          deletedAt: null,
          isActive: true,
        },
        include: KPI_INCLUDE,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      }),
      prisma.okr.findMany({
        where: {
          ownerProfileId: userId,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.developmentGoal.findMany({
        where: {
          employeeProfileId: userId,
        },
        orderBy: { targetCompletion: "asc" },
      }),
    ]);

    const mappedKpis = kpis.map((kpi) => mapKpi(kpi));
    const groupedKpis = mappedKpis.reduce<Record<string, typeof mappedKpis>>((acc, kpi) => {
      const key = String(kpi.status || "on_track");
      acc[key] = acc[key] || [];
      acc[key].push(kpi);
      return acc;
    }, {});

    const groupedOkrs = okrs.reduce<Record<string, typeof okrs>>((acc, okr) => {
      const key = String(okr.status || "on_track");
      acc[key] = acc[key] || [];
      acc[key].push(okr);
      return acc;
    }, {});

    const groupedGoals = goals.reduce<
      Record<
        string,
        Array<{
          id: number;
          title: string;
          description: string;
          progress: number;
          targetDate: Date;
          status: string;
          linkedKpiId: number | null;
        }>
      >
    >((acc, goal) => {
      const key = String(goal.planStatus || "not_started");
      acc[key] = acc[key] || [];
      acc[key].push({
        id: goal.id,
        title: goal.goalTitle,
        description: goal.goalDescription,
        progress: toNumber(goal.currentProgress),
        targetDate: goal.targetCompletion,
        status: goal.planStatus,
        linkedKpiId: goal.linkedKpiId,
      });
      return acc;
    }, {});

    const totalWeight = mappedKpis.reduce(
      (sum, kpi) => sum + (kpi.metrics?.weightPercent || normalizeWeightPercent(kpi.weight || 1)),
      0
    );
    const weightedProgress = mappedKpis.length
      ? roundTo(
          mappedKpis.reduce(
            (sum, kpi) =>
              sum +
              (kpi.metrics?.achievementPercent || 0) *
                ((kpi.metrics?.weightPercent || normalizeWeightPercent(kpi.weight || 1)) / 100),
            0
          ) / (totalWeight > 0 ? totalWeight / 100 : mappedKpis.length)
        )
      : 0;
    const averageProgress = mappedKpis.length
      ? roundTo(
          mappedKpis.reduce((sum, kpi) => sum + (kpi.metrics?.achievementPercent || 0), 0) /
            mappedKpis.length
        )
      : 0;
    const overdueCount = mappedKpis.filter((kpi) => kpi.metrics?.isOverdue).length;
    const dueSoonCount = mappedKpis.filter((kpi) => kpi.metrics?.isDueSoon).length;
    const statusBreakdown = mappedKpis.reduce<Record<string, number>>((acc, kpi) => {
      const key = String(kpi.status || "on_track");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const goalCompletionPercent = goals.length
      ? roundTo(
          goals.reduce((sum, goal) => sum + toNumber(goal.currentProgress), 0) / goals.length
        )
      : 0;

    return {
      userId,
      completionPercentages: {
        kpis: weightedProgress,
        developmentGoals: goalCompletionPercent,
      },
      summary: {
        total: mappedKpis.length,
        overdue: overdueCount,
        dueSoon: dueSoonCount,
        weightedProgress,
        averageAchievementPercent: averageProgress,
        byStatus: statusBreakdown,
      },
      kpis: groupedKpis,
      okrs: groupedOkrs,
      developmentGoals: groupedGoals,
    };
  }
}

export default KPIService;
