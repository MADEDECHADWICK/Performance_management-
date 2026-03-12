import { KpiTrackingStatus, Prisma } from "@prisma/client";

export type MeasurementDirection = "higher_better" | "lower_better" | "milestone";
export type ThresholdBand = "red" | "amber" | "green" | "none";

export const KPI_INCLUDE = {
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      managerId: true,
      department: {
        select: { id: true, name: true },
      },
    },
  },
  reviewOwner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

const normalizeRole = (role: string) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const normalizeText = (value: unknown) => String(value || "").trim();

const toRoleSet = (roles: string[]) => new Set((roles || []).map(normalizeRole));

export const hasElevatedKpiAccess = (roles: string[]) => {
  const normalizedRoles = toRoleSet(roles);
  return normalizedRoles.has("super_admin") || normalizedRoles.has("hr");
};

export const isManagerRole = (roles: string[]) => toRoleSet(roles).has("manager");

export const parseDate = (value: string | Date | undefined | null, field = "date") => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw { statusCode: 400, message: `${field} is invalid` };
  }
  return parsed;
};

export const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const roundTo = (value: number, digits = 2) => {
  const scale = Math.pow(10, digits);
  return Math.round(value * scale) / scale;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const normalizeDirection = (value: unknown): MeasurementDirection => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["lower_better", "lower_is_better", "decrease", "minimize"].includes(normalized)) {
    return "lower_better";
  }
  if (["milestone", "binary", "complete"].includes(normalized)) {
    return "milestone";
  }
  return "higher_better";
};

export const normalizeWeightPercent = (value: number) => {
  if (value <= 0) return 100;
  if (value <= 1) return roundTo(value * 100);
  return roundTo(value);
};

export const daysBetween = (target: Date, base = new Date()) =>
  Math.ceil((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));

export const computeAchievementPercent = (
  actual: number,
  target: number,
  direction: MeasurementDirection
) => {
  if (target <= 0) {
    if (direction === "milestone") return actual > 0 ? 100 : 0;
    return actual > 0 ? 100 : 0;
  }

  if (direction === "lower_better") {
    if (actual <= 0) return 200;
    return roundTo(clamp((target / Math.max(actual, 0.0001)) * 100, 0, 200));
  }

  if (direction === "milestone") {
    return actual >= target ? 100 : 0;
  }

  return roundTo(clamp((actual / target) * 100, 0, 200));
};

const compareThreshold = (
  actual: number,
  threshold: number | null,
  direction: MeasurementDirection
) => {
  if (threshold === null) return false;
  if (direction === "lower_better") return actual <= threshold;
  return actual >= threshold;
};

export const resolveThresholdBand = (input: {
  actual: number;
  achievementPercent: number;
  direction: MeasurementDirection;
  redThreshold: number | null;
  amberThreshold: number | null;
  greenThreshold: number | null;
}): ThresholdBand => {
  const { actual, achievementPercent, direction, redThreshold, amberThreshold, greenThreshold } = input;

  if (greenThreshold !== null || amberThreshold !== null || redThreshold !== null) {
    if (compareThreshold(actual, greenThreshold, direction)) return "green";
    if (compareThreshold(actual, amberThreshold, direction)) return "amber";
    return "red";
  }

  if (achievementPercent >= 100) return "green";
  if (achievementPercent >= 75) return "amber";
  if (achievementPercent > 0) return "red";
  return "none";
};

export const resolveKpiStatus = (input: {
  actual: number;
  target: number;
  dueDate: Date | null;
  direction: MeasurementDirection;
  redThreshold: number | null;
  amberThreshold: number | null;
  greenThreshold: number | null;
}): KpiTrackingStatus => {
  const achievementPercent = computeAchievementPercent(input.actual, input.target, input.direction);
  const thresholdBand = resolveThresholdBand({
    actual: input.actual,
    achievementPercent,
    direction: input.direction,
    redThreshold: input.redThreshold,
    amberThreshold: input.amberThreshold,
    greenThreshold: input.greenThreshold,
  });
  const isOverdue = Boolean(
    input.dueDate && daysBetween(input.dueDate) < 0 && achievementPercent < 100
  );

  if (isOverdue) return "missed";
  if (thresholdBand === "green" || achievementPercent >= 100) return "achieved";
  if (thresholdBand === "amber" || achievementPercent >= 75) return "on_track";
  if (achievementPercent >= 50 || thresholdBand === "red") return "at_risk";
  return "missed";
};

export const buildKpiMetrics = (kpi: {
  actualValue?: unknown;
  targetValue?: unknown;
  weight?: unknown;
  dueDate?: Date | null;
  targetType?: string | null;
  redThreshold?: unknown;
  amberThreshold?: unknown;
  greenThreshold?: unknown;
  updatedAt?: Date | null;
}) => {
  const actual = toNumber(kpi.actualValue);
  const target = toNumber(kpi.targetValue);
  const direction = normalizeDirection(kpi.targetType);
  const achievementPercent = computeAchievementPercent(actual, target, direction);
  const progressPercent = roundTo(Math.min(achievementPercent, 100));
  const weightPercent = normalizeWeightPercent(toNumber(kpi.weight) || 1);
  const weightedScore = roundTo((achievementPercent * weightPercent) / 100);
  const remainingToTarget =
    direction === "lower_better"
      ? roundTo(Math.max(actual - target, 0))
      : roundTo(Math.max(target - actual, 0));
  const thresholdBand = resolveThresholdBand({
    actual,
    achievementPercent,
    direction,
    redThreshold: toNullableNumber(kpi.redThreshold),
    amberThreshold: toNullableNumber(kpi.amberThreshold),
    greenThreshold: toNullableNumber(kpi.greenThreshold),
  });
  const status = resolveKpiStatus({
    actual,
    target,
    dueDate: kpi.dueDate || null,
    direction,
    redThreshold: toNullableNumber(kpi.redThreshold),
    amberThreshold: toNullableNumber(kpi.amberThreshold),
    greenThreshold: toNullableNumber(kpi.greenThreshold),
  });
  const daysRemaining = kpi.dueDate ? daysBetween(kpi.dueDate) : null;
  const isOverdue = Boolean(daysRemaining !== null && daysRemaining < 0 && achievementPercent < 100);
  const isDueSoon = Boolean(daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7);

  return {
    direction,
    achievementPercent,
    progressPercent,
    weightedScore,
    weightPercent,
    varianceToTarget: roundTo(actual - target),
    remainingToTarget,
    thresholdBand,
    status,
    isOverdue,
    isDueSoon,
    daysRemaining,
    lastMeasuredAt: kpi.updatedAt || null,
  };
};

const mapHistoryRecord = (history: any) => ({
  id: history.id,
  recordedAt: history.calculatedAt,
  actual: toNumber(history.calculatedValue),
  target: toNumber(history.targetValue),
  achievementPercent: toNumber(history.achievementPercent),
  weightedScore: toNumber(history.weightedScore),
  note: history.notes || null,
});

export const mapKpi = (kpi: any, history: any[] = []) => {
  const metrics = buildKpiMetrics(kpi);

  return {
    id: kpi.id,
    userId: kpi.ownerProfileId,
    ownerProfileId: kpi.ownerProfileId,
    cycleId: kpi.cycleId,
    departmentId: kpi.departmentId,
    roleId: kpi.roleId,
    title: kpi.name,
    name: kpi.name,
    description: kpi.description,
    category: kpi.category,
    kpiType: kpi.kpiType,
    strategicTheme: kpi.strategicTheme,
    strategicObjective: kpi.strategicObjective,
    criticalSuccessFactor: kpi.criticalSuccessFactor,
    indicatorType: kpi.indicatorType,
    kpiCategory: kpi.kpiCategory,
    target: toNumber(kpi.targetValue),
    targetValue: toNumber(kpi.targetValue),
    actual: toNumber(kpi.actualValue),
    actualValue: toNumber(kpi.actualValue),
    baseline: toNullableNumber(kpi.baselineText),
    baselineText: kpi.baselineText,
    unit: kpi.measurementUnit,
    measurementUnit: kpi.measurementUnit,
    targetFrequency: kpi.targetFrequency,
    targetType: kpi.targetType || metrics.direction,
    targetDescription: kpi.targetDescription,
    weight: toNumber(kpi.weight),
    dueDate: kpi.dueDate,
    status: kpi.progressStatus,
    progressStatus: kpi.progressStatus,
    redThreshold: toNullableNumber(kpi.redThreshold),
    amberThreshold: toNullableNumber(kpi.amberThreshold),
    greenThreshold: toNullableNumber(kpi.greenThreshold),
    reviewOwnerProfileId: kpi.reviewOwnerProfileId,
    reviewFrequency: kpi.reviewFrequency,
    approvalRequired: Boolean(kpi.approvalRequired),
    evidenceRequired: Boolean(kpi.evidenceRequired),
    commentaryRequired: Boolean(kpi.commentaryRequired),
    dataSourceType: kpi.dataSourceType,
    sourceReference: kpi.sourceReference,
    formulaLocked: Boolean(kpi.formulaLocked),
    rollupMethod: kpi.rollupMethod,
    inheritWeight: Boolean(kpi.inheritWeight),
    isActive: Boolean(kpi.isActive),
    createdBy: kpi.createdByProfileId,
    createdByProfileId: kpi.createdByProfileId,
    createdAt: kpi.createdAt,
    updatedAt: kpi.updatedAt,
    owner: kpi.owner,
    reviewOwner: kpi.reviewOwner,
    metrics,
    history: history.map(mapHistoryRecord),
  };
};

export const resolveOwnerProfileId = (
  input: { ownerProfileId?: number; userId?: number },
  profileId: number
) => Number(input.ownerProfileId || input.userId || profileId);

export const resolveKpiName = (input: { title?: unknown; name?: unknown }) =>
  normalizeText(input.title || input.name);

export const resolveTargetValue = (
  input: { target?: unknown; targetValue?: unknown },
  fallback?: number
) => {
  const candidate =
    input.target !== undefined
      ? toNumber(input.target)
      : input.targetValue !== undefined
        ? toNumber(input.targetValue)
        : fallback ?? 0;

  if (candidate <= 0) {
    throw { statusCode: 400, message: "target must be greater than zero" };
  }

  return roundTo(candidate);
};

export const resolveActualValue = (
  input: { actual?: unknown; actualValue?: unknown },
  fallback = 0
) =>
  roundTo(
    input.actual !== undefined
      ? toNumber(input.actual)
      : input.actualValue !== undefined
        ? toNumber(input.actualValue)
        : fallback
  );

export const resolveBaselineText = (
  input: { baseline?: unknown; baselineText?: unknown },
  fallback?: string | null
) => {
  if (input.baselineText !== undefined) {
    return normalizeText(input.baselineText) || null;
  }
  if (input.baseline !== undefined) {
    const numeric = toNullableNumber(input.baseline);
    return numeric === null ? null : String(roundTo(numeric));
  }
  return fallback ?? null;
};

export const buildListWhere = (
  filters: {
    userId?: number;
    departmentId?: number;
    status?: string;
    isActive?: boolean;
  },
  auth: {
    profileId: number;
    roles: string[];
  }
): Prisma.KpiWhereInput => {
  const where: Prisma.KpiWhereInput = {
    deletedAt: null,
  };

  if (filters.userId) {
    where.ownerProfileId = filters.userId;
  } else if (!hasElevatedKpiAccess(auth.roles)) {
    if (isManagerRole(auth.roles)) {
      where.OR = [
        { ownerProfileId: auth.profileId },
        {
          owner: {
            managerId: auth.profileId,
          },
        },
      ];
    } else {
      where.ownerProfileId = auth.profileId;
    }
  }

  if (filters.departmentId) {
    where.owner = {
      is: {
        departmentId: filters.departmentId,
      },
    };
  }

  if (filters.status) {
    where.progressStatus = String(filters.status).toLowerCase() as KpiTrackingStatus;
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  return where;
};
