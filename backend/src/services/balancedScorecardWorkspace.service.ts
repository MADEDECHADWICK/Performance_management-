import prisma from "../prisma";
import {
  KpiMeasurementType,
  KpiTargetDirection,
  listBalancedScorecardStructure,
} from "./balancedScorecardStructure.service";
import { resolveActiveBalancedScorecardVersionId } from "./balancedScorecardGovernance.service";
import cacheService from "./cache.service";

export type StatusTone = "on_track" | "at_risk" | "off_track";
export type WorkspaceRole =
  | "hr"
  | "gmp"
  | "partner"
  | "manager"
  | "finance"
  | "marketing"
  | "employee";

export type PerspectiveKey = "financial" | "customer" | "internal" | "people";

export interface WorkspacePerspectiveCard {
  id: PerspectiveKey;
  name: string;
  score: number;
  owner: string;
  status: StatusTone;
  summary: string;
  goals: number;
  kpis: number;
  initiatives: number;
  cascadeProgress: number;
}

export interface WorkspaceGoal {
  id: string;
  perspectiveId: PerspectiveKey;
  title: string;
  owner: string;
  description: string;
  linkedKpis: string[];
  initiativeCount: number;
  status: StatusTone;
}

export interface WorkspaceKpi {
  id: string;
  name: string;
  perspectiveId: PerspectiveKey;
  goalId: string;
  description: string;
  formula: string;
  frequency: string;
  unit: string;
  weight: number;
  firmTarget: string;
  actual: string;
  weightedScore: number;
  owner: string;
  status: StatusTone;
  statusLogic: string;
  updateFrequency: string;
  initiativeProgress: number;
  trend: number[];
  ownerUpdate: string;
  dataQualityStatus: BalancedScorecardComputedDataQualityStatus;
  dataQualityNote: string | null;
}

export interface WorkspaceInitiative {
  id: string;
  title: string;
  goalId: string;
  kpiId: string;
  perspectiveId: PerspectiveKey;
  owner: string;
  ownerProfileId?: number | null;
  timeline: string;
  dueDate: string;
  status: StatusTone;
  progress: number;
  drilldownCount: number;
  scopeRole: WorkspaceRole;
  parentInitiativeId: string | null;
  summary: string;
}

export interface WorkspaceCascadeLevel {
  level: "HR" | "GMP" | "Partner" | "Manager" | "Employee";
  owner: string;
  initiative: string;
  target: string;
  progress: number;
  dueDate: string;
  status: StatusTone;
  note: string;
}

export interface WorkspaceEmployeeContribution {
  id: string;
  sourceType: "evaluation_cycle" | "learning_assignment";
  sourceReferenceId: number | null;
  title: string;
  kpiId: string;
  initiative: string;
  dueDate: string;
  progress: number;
  score: number;
  status: StatusTone;
  acknowledged: boolean;
  managerComment: string;
  rollup: string;
  employeeComment: string | null;
  lastUpdatedAt: string | null;
  workflowRecordId: number | null;
  evidenceCount: number;
  reviewContextPath: string | null;
  individualTarget?: number | null;
  individualWeight?: number | null;
}

export interface WorkspaceEmployeeKpiAssignment {
  id: number;
  profileId: number;
  kpiId: string;
  kpiName: string;
  individualTarget: number | null;
  individualWeight: number;
  actualProgress: number;
  score: number;
  status: StatusTone;
  initiativeTitles: string[];
  dueDate: string | null;
  owner: string;
}

export interface WorkspaceReportBlock {
  label: string;
  value: string;
  hint: string;
}

export interface WorkspaceDepartmentRow {
  name: string;
  score: number;
  status: StatusTone;
}

export interface WorkspaceManagerRow {
  name: string;
  score: number;
  team: string;
}

export interface WorkspaceEmployeeRow {
  name: string;
  score: number;
  ack: string;
}

export interface WorkspaceEvaluationSummary {
  cycleId: number | null;
  cycleTitle: string | null;
  cycleStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  totalAssignments: number;
  submittedAssignments: number;
  pendingAssignments: number;
  acknowledgedAssignments: number;
  overdueAssignments: number;
  completionPercent: number;
  acknowledgementPercent: number;
  averageScore: number;
  departmentCount: number;
  managerCount: number;
  resultCount: number;
}

export interface BalancedScorecardWorkspace {
  generatedAt: string;
  effectiveRole: WorkspaceRole;
  dataQuality: WorkspaceDataQualitySummary;
  perspectiveCards: WorkspacePerspectiveCard[];
  goals: WorkspaceGoal[];
  kpis: WorkspaceKpi[];
  initiatives: WorkspaceInitiative[];
  cascadeInitiatives: WorkspaceInitiative[];
  featuredCascade: WorkspaceCascadeLevel[];
  employeeContributions: WorkspaceEmployeeContribution[];
  employeeKpiAssignments: WorkspaceEmployeeKpiAssignment[];
  evaluationSummary: WorkspaceEvaluationSummary;
  reportBlocks: WorkspaceReportBlock[];
  departmentPerformance: WorkspaceDepartmentRow[];
  managerPerformance: WorkspaceManagerRow[];
  employeePerformance: WorkspaceEmployeeRow[];
}

const WORKSPACE_CACHE_TTL_MS = 15_000;

export interface WorkspaceDataQualitySummary {
  status: BalancedScorecardComputedDataQualityStatus;
  counts: Record<BalancedScorecardComputedDataQualityStatus, number>;
  notes: string[];
  usesFrameworkBaselineDefinitions: boolean;
  cacheTtlMs: number;
}

const buildWorkspaceCacheKey = (params: {
  role: WorkspaceRole;
  profileId?: number | null;
  requestingProfileId?: number | null;
  evaluationCycleId?: number | null;
}) =>
  [
    "bsc:workspace",
    params.role,
    params.profileId ?? "none",
    params.requestingProfileId ?? "none",
    params.evaluationCycleId ?? "latest",
  ].join(":");

export type BalancedScorecardComputedDataQualityStatus =
  | "healthy"
  | "warning"
  | "missing_data"
  | "stale_data"
  | "manual_override";

const DATA_QUALITY_STATUSES: BalancedScorecardComputedDataQualityStatus[] = [
  "healthy",
  "warning",
  "missing_data",
  "stale_data",
  "manual_override",
];

const summarizeWorkspaceDataQuality = (
  kpis: WorkspaceKpi[]
): WorkspaceDataQualitySummary => {
  const counts = DATA_QUALITY_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<BalancedScorecardComputedDataQualityStatus, number>
  );

  kpis.forEach((kpi) => {
    counts[kpi.dataQualityStatus] += 1;
  });

  const notes = [
    "BSC framework goals, KPI definitions, formulas, and ownership metadata are baseline catalogue definitions; actual values are computed from operational signals or manual KPI submissions.",
  ];

  if (counts.missing_data > 0) {
    notes.push(`${counts.missing_data} KPI(s) have no supporting measurement data in the selected window.`);
  }
  if (counts.warning > 0) {
    notes.push(`${counts.warning} KPI(s) use fallback or partial operational signals.`);
  }
  if (counts.stale_data > 0) {
    notes.push(`${counts.stale_data} KPI(s) are based on stale source data.`);
  }
  if (counts.manual_override > 0) {
    notes.push(`${counts.manual_override} KPI(s) use manual actuals or overrides.`);
  }

  const status: BalancedScorecardComputedDataQualityStatus =
    counts.missing_data > 0
      ? "missing_data"
      : counts.warning > 0
        ? "warning"
        : counts.stale_data > 0
          ? "stale_data"
          : counts.manual_override > 0
            ? "manual_override"
            : "healthy";

  return {
    status,
    counts,
    notes,
    usesFrameworkBaselineDefinitions: true,
    cacheTtlMs: WORKSPACE_CACHE_TTL_MS,
  };
};

export type BalancedScorecardComputedTraceSourceType =
  | "metric_catalog"
  | "manual_actual"
  | "initiative_rollup"
  | "operational_signal";

export interface BalancedScorecardComputedTrace {
  sourceType: BalancedScorecardComputedTraceSourceType;
  sourceKey: string;
  sourceLabel: string;
  dataQualityStatus: BalancedScorecardComputedDataQualityStatus;
  recordCount?: number;
  rawValue?: number | null;
  normalizedValue?: number | null;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface BalancedScorecardComputedKpiRecord {
  recordId: number;
  key: string;
  metricKey: string;
  trackingMode: "template" | "manual";
  perspectiveKey: PerspectiveKey;
  perspectiveName: string;
  goalRecordId: number;
  goalKey: string;
  goalTitle: string;
  name: string;
  description: string;
  formula: string;
  frequency: string;
  unit: string;
  weight: number;
  firmTarget: string;
  targetValue: number | null;
  targetLabel: string | null;
  actualValue: number | null;
  actualLabel: string;
  weightedScore: number;
  owner: string;
  status: StatusTone;
  statusLogic: string;
  updateFrequency: string;
  trend: number[];
  ownerUpdate: string;
  dataQualityStatus: BalancedScorecardComputedDataQualityStatus;
  dataQualityNote: string | null;
  actualAsOf: Date | null;
  traces: BalancedScorecardComputedTrace[];
}

type MetricToneDirection = "higher_better" | "lower_better";

type ScoreBandThresholds = {
  onTrackMin: number;
  atRiskMin: number;
};

const DEFAULT_SCORE_BAND: ScoreBandThresholds = {
  onTrackMin: 85,
  atRiskMin: 65,
};

type KpiComputeOutput = {
  actualValue: number | null;
  actualLabel: string;
  trend: number[];
  ownerUpdate: string;
  dataQualityStatus: BalancedScorecardComputedDataQualityStatus;
  dataQualityNote?: string | null;
  actualAsOf?: Date | null;
  traces: BalancedScorecardComputedTrace[];
};

type WorkspaceComputationContext = {
  payments: Array<{ paymentAmount: unknown; paymentDate: Date }>;
  projections: Array<{ projectedAmount: unknown; actualCollected: unknown; monthYear: Date }>;
  invoices: Array<{
    totalAmount: unknown;
    amountPaid: unknown;
    amountOutstanding: unknown;
    dueDate: Date | null;
    issuedAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
    status: string;
  }>;
  surveys: Array<{
    overallSatisfaction: number | null;
    wouldRecommend: boolean | null;
    completedAt: Date | null;
    createdAt: Date;
  }>;
  proposals: Array<{
    status: string;
    proposalDate: Date;
    wonAt: Date | null;
  }>;
  timeEntries: Array<{
    hours: unknown;
    billable: boolean;
    billableAmount: unknown;
    dateWorked: Date;
  }>;
  jobs: Array<{
    id: number;
    clientId: number | null;
    status: string;
    dueDate: Date | null;
    completionDate: Date | null;
    createdAt: Date;
    department: { name: string } | null;
    manager: { firstName: string; lastName: string } | null;
    partner: { firstName: string; lastName: string } | null;
  }>;
  projectEvaluations: Array<{
    overallScore: unknown;
    submittedAt: Date | null;
    createdAt: Date;
  }>;
  evaluationAssignments: Array<{
    id: number;
    cycleId: number | null;
    status: string;
    submittedAt: Date | null;
    dueDate: Date | null;
    createdAt: Date;
    evaluateeAcknowledged: boolean;
    evaluatee: {
      id: number;
      firstName: string;
      lastName: string;
      department: { name: string } | null;
      manager: { id: number; firstName: string; lastName: string } | null;
    };
  }>;
  learningAssignments: Array<{
    id: number;
    employeeProfileId: number;
    status: string;
    progressPercent: unknown;
    startedAt: Date | null;
    dueAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    employee: {
      id: number;
      firstName: string;
      lastName: string;
      department: { name: string } | null;
      manager: { id: number; firstName: string; lastName: string } | null;
    };
    programVersion: {
      title: string;
      program: { title: string };
    };
  }>;
  onboardingCases: Array<{
    status: string;
    startDate: Date | null;
    dueDate: Date | null;
    createdAt: Date;
    employee: {
      id: number;
      firstName: string;
      lastName: string;
    } | null;
  }>;
  tasks: Array<{
    id: number;
    title: string;
    description: string | null;
    status: string;
    dueDate: Date | null;
    createdAt: Date;
    assignee: {
      id: number;
      firstName: string;
      lastName: string;
      manager: { firstName: string; lastName: string } | null;
    } | null;
    job: { jobName: string } | null;
  }>;
  latestScores: Array<{
    employeeId: number;
    employeeName: string;
    departmentName: string;
    managerName: string | null;
    score: number;
  }>;
  measurementWindow: { start: Date; end: Date };
  asOfDate: Date;
  monthBuckets: Array<{ key: string; label: string; start: Date; end: Date }>;
  currentMonthBucket: { key: string; label: string; start: Date; end: Date };
};

type KpiCatalogEntry = {
  id: string;
  name: string;
  perspectiveId: PerspectiveKey;
  goalId: string;
  description: string;
  formula: string;
  frequency: string;
  unit: string;
  weight: number;
  owner: string;
  targetValue: number;
  targetLabel: string;
  direction: MetricToneDirection;
  statusLogic: string;
  updateFrequency: string;
  compute: (ctx: WorkspaceComputationContext) => KpiComputeOutput;
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
// Weighted average: each entry carries a `score` (0-100) and a `weight` (positive int).
// Falls back to a simple average when all weights are zero.
const weightedAverage = (entries: Array<{ score: number; weight: number }>) => {
  if (entries.length === 0) return 0;
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) return average(entries.map((e) => e.score));
  return entries.reduce((sum, e) => sum + e.score * e.weight, 0) / totalWeight;
};
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const ratioPercent = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;
const formatPercent = (value: number, decimals = 1) =>
  `${Number.isInteger(value) ? value : Number(value.toFixed(decimals))}%`;
const formatDays = (value: number) => `${Math.round(value)} days`;
const formatCount = (value: number) => `${Math.round(value)}`;
const formatCurrency = (value: number, unit?: string | null) => {
  if (unit && unit.trim()) return `${unit.trim()} ${Math.round(value).toLocaleString()}`;
  return `KES ${Math.round(value).toLocaleString()}`;
};
const scoreToStatus = (
  score: number,
  thresholds: ScoreBandThresholds = DEFAULT_SCORE_BAND
): StatusTone =>
  score >= thresholds.onTrackMin
    ? "on_track"
    : score >= thresholds.atRiskMin
      ? "at_risk"
      : "off_track";
const achievementToScore = (
  actualValue: number | null,
  targetValue: number,
  direction: MetricToneDirection
) => {
  if (actualValue === null) return 0;
  if (targetValue <= 0) return 0;
  if (direction === "higher_better") return clamp((actualValue / targetValue) * 100, 0, 100);
  if (actualValue <= 0) return 100;
  return clamp((targetValue / actualValue) * 100, 0, 100);
};

const manualStatusScore = (
  actualValue: number | null,
  targetValue: number,
  direction: KpiTargetDirection
) => {
  if (actualValue === null) return 0;
  if (!Number.isFinite(actualValue) || !Number.isFinite(targetValue)) return 0;
  if (direction === "higher_better") {
    return achievementToScore(actualValue, targetValue, "higher_better");
  }
  if (direction === "lower_better") {
    return achievementToScore(actualValue, targetValue, "lower_better");
  }
  if (direction === "exact_match") {
    return actualValue === targetValue ? 100 : 0;
  }
  return actualValue >= targetValue ? 100 : 0;
};

const formatManualActual = (
  measurementType: KpiMeasurementType | null,
  actualValue: number,
  unit?: string | null
) => {
  if (measurementType === "percentage") return formatPercent(actualValue);
  if (measurementType === "currency") return formatCurrency(actualValue, unit);
  if (measurementType === "days") return formatDays(actualValue);
  if (measurementType === "count") return formatCount(actualValue);
  if (measurementType === "boolean" || measurementType === "milestone") {
    return actualValue >= 1 ? "Completed" : "Not completed";
  }
  return unit?.trim() ? `${actualValue} ${unit.trim()}` : `${actualValue}`;
};

// Build real historical trend for a manual KPI using its actual history records.
// Each bucket gets the last recorded value within that bucket. If no record exists
// in a bucket, carry forward the previous known value (or 0 for the earliest bucket).
const buildManualKpiTrend = (
  kpiId: number,
  history: Array<{ kpiId: number; actualValue: unknown; recordedAt: Date }>,
  buckets: WorkspaceComputationContext["monthBuckets"]
): number[] => {
  const kpiHistory = history
    .filter((h) => h.kpiId === kpiId)
    .map((h) => ({ value: numberValue(h.actualValue), recordedAt: h.recordedAt }))
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  if (kpiHistory.length === 0) return [];

  let lastKnown: number | null = null;
  return buckets.map((bucket) => {
    const inBucket = kpiHistory.filter(
      (h) => h.recordedAt >= bucket.start && h.recordedAt <= bucket.end
    );
    if (inBucket.length > 0) {
      lastKnown = inBucket[inBucket.length - 1].value;
    }
    return Math.round(lastKnown ?? 0);
  });
};

const buildManualKpiComputation = (
  record: {
    id: number;
    measurementType: KpiMeasurementType | null;
    targetDirection: KpiTargetDirection | null;
    targetValue: number | null;
    currentActualValue: number | null;
    unit: string;
    lastMeasurementNote: string | null;
  },
  history: Array<{ kpiId: number; actualValue: unknown; recordedAt: Date }>,
  buckets: WorkspaceComputationContext["monthBuckets"]
): KpiComputeOutput & { weightedScore: number; status: StatusTone } => {
  const kpiHistory = history
    .filter((entry) => entry.kpiId === record.id)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const latestHistory = kpiHistory[kpiHistory.length - 1] ?? null;
  const hasActualValue =
    record.currentActualValue !== null &&
    record.currentActualValue !== undefined &&
    Number.isFinite(Number(record.currentActualValue));
  const actualValue =
    record.currentActualValue !== null && record.currentActualValue !== undefined
      ? Number(record.currentActualValue)
      : null;
  const targetValue =
    record.targetValue !== null && record.targetValue !== undefined
      ? Number(record.targetValue)
      : 0;
  const direction = record.targetDirection ?? "higher_better";
  const score = manualStatusScore(actualValue, targetValue, direction);
  const trend = buildManualKpiTrend(record.id, history, buckets);
  return {
    actualValue,
    actualLabel: hasActualValue
      ? formatManualActual(record.measurementType, Number(actualValue), record.unit)
      : "Awaiting first update",
    trend,
    ownerUpdate: record.lastMeasurementNote || "",
    weightedScore: Math.round(score),
    status: scoreToStatus(score),
    dataQualityStatus: hasActualValue ? "manual_override" : "missing_data",
    dataQualityNote:
      hasActualValue
        ? "This KPI uses a manually entered actual value."
        : "No manual actual value has been captured for this KPI yet.",
    actualAsOf: latestHistory?.recordedAt ?? null,
    traces: [
      {
        sourceType: "manual_actual",
        sourceKey: `kpi-${record.id}-manual`,
        sourceLabel: "Manual KPI update",
        dataQualityStatus: hasActualValue ? "manual_override" : "missing_data",
        recordCount: kpiHistory.length,
        rawValue: hasActualValue ? Number(actualValue) : null,
        normalizedValue: hasActualValue ? Math.round(score) : null,
        note:
          record.lastMeasurementNote ||
          (hasActualValue
            ? "Manual measurement captured on the KPI."
            : "Awaiting the first manual measurement update."),
        metadata: latestHistory
          ? { lastRecordedAt: latestHistory.recordedAt.toISOString() }
          : undefined,
      },
    ] satisfies BalancedScorecardComputedTrace[],
  };
};

const loadLatestKpiEngineResults = async (kpiIds: number[]) => {
  if (kpiIds.length === 0) return new Map<number, {
    kpiId: number;
    actualValue: unknown;
    score: number;
    status: StatusTone;
    trend: unknown;
    calculatedAt: Date;
  }>();

  const results = await prisma.balancedScorecardKpiResult.findMany({
    where: { kpiId: { in: kpiIds } },
    orderBy: [{ calculatedAt: "desc" }, { id: "desc" }],
    select: {
      kpiId: true,
      actualValue: true,
      score: true,
      status: true,
      trend: true,
      calculatedAt: true,
    },
  });

  const latest = new Map<number, {
    kpiId: number;
    actualValue: unknown;
    score: number;
    status: StatusTone;
    trend: unknown;
    calculatedAt: Date;
  }>();
  results.forEach((result) => {
    if (!latest.has(result.kpiId)) {
      latest.set(result.kpiId, {
        ...result,
        status: result.status as StatusTone,
      });
    }
  });
  return latest;
};

const normalizeEngineTrend = (trend: unknown) =>
  Array.isArray(trend)
    ? trend.map((point) => numberValue(point)).filter((point) => Number.isFinite(point))
    : [];

const monthKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
const formatDateLabel = (value: Date | null | undefined) => {
  if (!value) return "No due date";
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
const normalizeReviewScore = (value: number) => {
  if (value <= 0) return 0;
  if (value <= 5) return clamp((value / 5) * 100);
  return clamp(value);
};
const monthBuckets = (months = 6, anchorDate = new Date()) => {
  const currentStart = new Date(anchorDate);
  currentStart.setDate(1);
  currentStart.setHours(0, 0, 0, 0);
  return Array.from({ length: months }, (_, index) => {
    const bucketStart = new Date(
      currentStart.getFullYear(),
      currentStart.getMonth() - (months - 1 - index),
      1
    );
    const bucketEnd = new Date(
      bucketStart.getFullYear(),
      bucketStart.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );
    return {
      key: monthKey(bucketStart),
      label: bucketStart.toLocaleDateString("en-GB", { month: "short" }),
      start: bucketStart,
      end: bucketEnd,
    };
  });
};

type EmployeeActivity = {
  employeeId: number;
  employeeName: string;
  departmentName: string;
  managerName: string | null;
  totalReviews: number;
  submittedReviews: number;
  acknowledgedReviews: number;
  overdueReviews: number;
  totalLearning: number;
  completedLearning: number;
  activeLearning: number;
  learningProgressTotal: number;
};

const buildEmployeeActivityMap = (
  assignments: WorkspaceComputationContext["evaluationAssignments"],
  learningAssignments: WorkspaceComputationContext["learningAssignments"]
) => {
  const map = new Map<number, EmployeeActivity>();
  const ensureActivity = (
    employeeId: number,
    employeeName: string,
    departmentName: string,
    managerName: string | null
  ) => {
    const existing = map.get(employeeId);
    if (existing) return existing;
    const created: EmployeeActivity = {
      employeeId,
      employeeName,
      departmentName,
      managerName,
      totalReviews: 0,
      submittedReviews: 0,
      acknowledgedReviews: 0,
      overdueReviews: 0,
      totalLearning: 0,
      completedLearning: 0,
      activeLearning: 0,
      learningProgressTotal: 0,
    };
    map.set(employeeId, created);
    return created;
  };

  assignments.forEach((assignment) => {
    const employeeName = `${assignment.evaluatee.firstName} ${assignment.evaluatee.lastName}`.trim();
    const managerName = assignment.evaluatee.manager
      ? `${assignment.evaluatee.manager.firstName} ${assignment.evaluatee.manager.lastName}`.trim()
      : null;
    const activity = ensureActivity(
      assignment.evaluatee.id,
      employeeName,
      assignment.evaluatee.department?.name || "Unassigned",
      managerName
    );
    activity.totalReviews += 1;
    if (assignment.status === "submitted") activity.submittedReviews += 1;
    if (assignment.evaluateeAcknowledged) activity.acknowledgedReviews += 1;
    if (
      assignment.status !== "submitted" &&
      assignment.dueDate &&
      assignment.dueDate < new Date()
    ) {
      activity.overdueReviews += 1;
    }
  });

  learningAssignments.forEach((assignment) => {
    const employeeName = `${assignment.employee.firstName} ${assignment.employee.lastName}`.trim();
    const managerName = assignment.employee.manager
      ? `${assignment.employee.manager.firstName} ${assignment.employee.manager.lastName}`.trim()
      : null;
    const activity = ensureActivity(
      assignment.employee.id,
      employeeName,
      assignment.employee.department?.name || "Unassigned",
      managerName
    );
    activity.totalLearning += 1;
    if (assignment.status === "completed") activity.completedLearning += 1;
    if (assignment.status !== "completed") activity.activeLearning += 1;
    activity.learningProgressTotal += numberValue(assignment.progressPercent);
  });

  return map;
};

const scoreFromActivity = (activity?: EmployeeActivity) => {
  if (!activity) return 0;
  const reviewCompletion = ratioPercent(activity.submittedReviews, activity.totalReviews);
  const learningCompletion =
    activity.totalLearning > 0
      ? activity.learningProgressTotal / activity.totalLearning
      : 0;
  if (activity.totalReviews > 0 && activity.totalLearning > 0) {
    return Math.round(reviewCompletion * 0.7 + learningCompletion * 0.3);
  }
  if (activity.totalReviews > 0) return Math.round(reviewCompletion);
  if (activity.totalLearning > 0) return Math.round(learningCompletion);
  return 0;
};

const acknowledgementLabelFromActivity = (activity?: EmployeeActivity) => {
  if (!activity || (activity.totalReviews === 0 && activity.totalLearning === 0)) {
    return "No evaluation cycle activity";
  }
  if (activity.overdueReviews > 0) {
    return `${activity.overdueReviews} overdue reviews`;
  }
  if (activity.totalReviews > 0 && activity.submittedReviews < activity.totalReviews) {
    return `${activity.submittedReviews}/${activity.totalReviews} reviews submitted`;
  }
  if (activity.totalReviews > 0 && activity.acknowledgedReviews > 0) {
    if (activity.acknowledgedReviews < activity.submittedReviews) {
      return `${activity.acknowledgedReviews}/${activity.submittedReviews} acknowledged`;
    }
    return "All reviews acknowledged";
  }
  if (activity.totalReviews > 0 && activity.submittedReviews === activity.totalReviews) {
    return "All reviews submitted";
  }
  if (activity.activeLearning > 0) {
    return `${activity.activeLearning} learning actions open`;
  }
  return "Cycle complete";
};
const buildMonthlyTrend = (
  buckets: WorkspaceComputationContext["monthBuckets"],
  resolver: (bucket: { start: Date; end: Date }) => number
) => buckets.map((bucket) => Math.round(clamp(resolver(bucket), 0, 100)));

const averageCollectionDays = (
  invoices: WorkspaceComputationContext["invoices"],
  start: Date,
  end: Date,
  asOfDate: Date
) => {
  const scoped = invoices.filter((invoice) => {
    const anchor = invoice.issuedAt ?? invoice.createdAt;
    return anchor >= start && anchor <= end;
  });
  if (scoped.length === 0) return 0;
  return average(
    scoped.map((invoice) => {
      const anchor = invoice.issuedAt ?? invoice.createdAt;
      const closeDate = invoice.paidAt ?? asOfDate;
      return Math.max(0, closeDate.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24);
    })
  );
};

// Real retention: clients active in the current window who were also active in the equivalent
// prior window (same duration, immediately before). Prior window defaults to the same span
// ending one period before `start`.
const clientRetentionRate = (
  jobs: WorkspaceComputationContext["jobs"],
  start: Date,
  end: Date
) => {
  const windowMs = end.getTime() - start.getTime();
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - windowMs);

  const currentClients = new Set(
    jobs
      .filter((job) => job.clientId && job.createdAt >= start && job.createdAt <= end)
      .map((job) => job.clientId as number)
  );
  const priorClients = new Set(
    jobs
      .filter((job) => job.clientId && job.createdAt >= priorStart && job.createdAt <= priorEnd)
      .map((job) => job.clientId as number)
  );

  if (priorClients.size === 0) return currentClients.size > 0 ? 100 : 0;
  const retained = Array.from(currentClients).filter((id) => priorClients.has(id)).length;
  return ratioPercent(retained, priorClients.size);
};

const proposalWinRate = (
  proposals: WorkspaceComputationContext["proposals"],
  start: Date,
  end: Date
) =>
  ratioPercent(
    proposals.filter(
      (proposal) =>
        proposal.proposalDate >= start &&
        proposal.proposalDate <= end &&
        proposal.status === "won"
    ).length,
    proposals.filter(
      (proposal) => proposal.proposalDate >= start && proposal.proposalDate <= end
    ).length
  );

const surveyScore = (
  surveys: WorkspaceComputationContext["surveys"],
  start: Date,
  end: Date
) => {
  const scoped = surveys.filter((survey) => {
    const anchor = survey.completedAt ?? survey.createdAt;
    return anchor >= start && anchor <= end && typeof survey.overallSatisfaction === "number";
  });
  if (scoped.length === 0) return 0;
  return average(scoped.map((survey) => normalizeReviewScore(survey.overallSatisfaction || 0)));
};

const billableUtilizationRate = (
  timeEntries: WorkspaceComputationContext["timeEntries"],
  start: Date,
  end: Date
) => {
  const scoped = timeEntries.filter(
    (entry) => entry.dateWorked >= start && entry.dateWorked <= end
  );
  const totalHours = scoped.reduce((sum, entry) => sum + numberValue(entry.hours), 0);
  const billableHours = scoped.reduce(
    (sum, entry) => sum + (entry.billable ? numberValue(entry.hours) : 0),
    0
  );
  return {
    totalHours,
    billableHours,
    rate: ratioPercent(billableHours, totalHours),
  };
};

const onTimeJobRate = (
  jobs: WorkspaceComputationContext["jobs"],
  start: Date,
  end: Date
) => {
  const scoped = jobs.filter(
    (job) =>
      job.completionDate &&
      job.completionDate >= start &&
      job.completionDate <= end &&
      job.dueDate
  );
  return ratioPercent(
    scoped.filter(
      (job) =>
        job.completionDate &&
        job.dueDate &&
        job.completionDate.getTime() <= job.dueDate.getTime()
    ).length,
    scoped.length
  );
};

const reviewQualityRate = (
  evaluations: WorkspaceComputationContext["projectEvaluations"],
  start: Date,
  end: Date
) => {
  const scoped = evaluations.filter((evaluation) => {
    const anchor = evaluation.submittedAt ?? evaluation.createdAt;
    return anchor >= start && anchor <= end;
  });
  if (scoped.length === 0) return 0;
  return average(scoped.map((evaluation) => normalizeReviewScore(numberValue(evaluation.overallScore))));
};

const evaluationCompletionRate = (
  assignments: WorkspaceComputationContext["evaluationAssignments"],
  start: Date,
  end: Date
) =>
  ratioPercent(
    assignments.filter(
      (assignment) =>
        assignment.createdAt >= start &&
        assignment.createdAt <= end &&
        assignment.status === "submitted"
    ).length,
    assignments.filter(
      (assignment) => assignment.createdAt >= start && assignment.createdAt <= end
    ).length
  );

const readinessCompletionRate = (
  learningAssignments: WorkspaceComputationContext["learningAssignments"],
  onboardingCases: WorkspaceComputationContext["onboardingCases"],
  start: Date,
  end: Date
) => {
  const learningScoped = learningAssignments.filter(
    (assignment) => assignment.createdAt >= start && assignment.createdAt <= end
  );
  const onboardingScoped = onboardingCases.filter(
    (record) => record.createdAt >= start && record.createdAt <= end
  );
  const learningCompletion = ratioPercent(
    learningScoped.filter((assignment) => assignment.status === "completed").length,
    learningScoped.length
  );
  const onboardingCompletion = ratioPercent(
    onboardingScoped.filter((record) => record.status === "completed").length,
    onboardingScoped.length
  );
  return average([learningCompletion, onboardingCompletion].filter((value) => value > 0));
};

const qualityFromCount = (
  count: number,
  fallback = false
): BalancedScorecardComputedDataQualityStatus => {
  if (count <= 0) return "missing_data";
  return fallback ? "warning" : "healthy";
};

const latestDateOrNull = (...values: Array<Date | null | undefined>) => {
  const valid = values.filter((value): value is Date => value instanceof Date);
  if (valid.length === 0) return null;
  return valid.sort((a, b) => b.getTime() - a.getTime())[0];
};

const kpiCatalog: KpiCatalogEntry[] = [
  {
    id: "kpi-1",
    name: "Priority account revenue growth",
    perspectiveId: "financial",
    goalId: "goal-1",
    description: "Tracks revenue collected against the current projection pack for priority account work.",
    formula: "Current month collected revenue / current month projected revenue",
    frequency: "Monthly",
    unit: "%",
    weight: 20,
    owner: "HR / Strategy Office",
    targetValue: 90,
    targetLabel: "90%",
    direction: "higher_better",
    statusLogic: "Green at 90%+, amber at 75%-89.9%, red below 75%.",
    updateFrequency: "Monthly finance close",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const monthRecords = ctx.projections.filter(
        (record) => record.monthYear >= start && record.monthYear <= end
      );
      const projected = monthRecords.reduce((sum, record) => sum + numberValue(record.projectedAmount), 0);
      const projectionActual = monthRecords.reduce((sum, record) => sum + numberValue(record.actualCollected), 0);
      const paymentRecords = ctx.payments.filter(
        (payment) => payment.paymentDate >= start && payment.paymentDate <= end
      );
      const paymentActual = paymentRecords
        .reduce((sum, payment) => sum + numberValue(payment.paymentAmount), 0);
      const actual = ratioPercent(projectionActual > 0 ? projectionActual : paymentActual, projected);
      const usingPaymentFallback = projected <= 0 && paymentActual > 0;
      const isMissingData = monthRecords.length <= 0 && paymentRecords.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) => {
          const scopedProjection = ctx.projections.filter(
            (record) => record.monthYear >= bucket.start && record.monthYear <= bucket.end
          );
          const scopedProjected = scopedProjection.reduce((sum, record) => sum + numberValue(record.projectedAmount), 0);
          const scopedProjectionActual = scopedProjection.reduce((sum, record) => sum + numberValue(record.actualCollected), 0);
          const scopedPayments = ctx.payments
            .filter((payment) => payment.paymentDate >= bucket.start && payment.paymentDate <= bucket.end)
            .reduce((sum, payment) => sum + numberValue(payment.paymentAmount), 0);
          return ratioPercent(scopedProjectionActual > 0 ? scopedProjectionActual : scopedPayments, scopedProjected);
        }),
        ownerUpdate: `${formatPercent(actual)} collected against ${projected > 0 ? `KES ${projected.toLocaleString()}` : "no live projection"} in the current month.`,
        dataQualityStatus:
          monthRecords.length <= 0 && paymentRecords.length <= 0
            ? "missing_data"
            : usingPaymentFallback
              ? "warning"
              : "healthy",
        dataQualityNote:
          monthRecords.length <= 0 && paymentRecords.length <= 0
            ? "No live projection or payment records were found in this measurement window."
            : usingPaymentFallback
              ? "Projection actuals were unavailable, so the KPI fell back to payment records."
              : null,
        actualAsOf: latestDateOrNull(
          ...monthRecords.map((record) => record.monthYear),
          ...paymentRecords.map((payment) => payment.paymentDate)
        ),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "revenue_projections",
            sourceLabel: "Revenue projections",
            dataQualityStatus: qualityFromCount(monthRecords.length),
            recordCount: monthRecords.length,
            rawValue: projected,
            normalizedValue: projectionActual,
            note: "Projection pack rows contributing to projected and actual collected values.",
          },
          {
            sourceType: "operational_signal",
            sourceKey: "client_payments",
            sourceLabel: "Client payments",
            dataQualityStatus: qualityFromCount(paymentRecords.length, usingPaymentFallback),
            recordCount: paymentRecords.length,
            rawValue: paymentActual,
            normalizedValue: actual,
            note: usingPaymentFallback
              ? "Payments provided the fallback actual because no projection actuals were available."
              : "Payments available for corroborating the projection-based actual.",
          },
        ],
      };
    },
  },
  {
    id: "kpi-2",
    name: "Matter realization rate",
    perspectiveId: "financial",
    goalId: "goal-1",
    description: "Shows how much of issued invoice value has already been recovered as cash.",
    formula: "Invoice amount paid / total issued invoice value",
    frequency: "Monthly",
    unit: "%",
    weight: 18,
    owner: "Finance",
    targetValue: 85,
    targetLabel: "85%",
    direction: "higher_better",
    statusLogic: "Green at 85%+, amber at 70%-84.9%, red below 70%.",
    updateFrequency: "Monthly collections review",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const scoped = ctx.invoices.filter(
        (invoice) => invoice.createdAt >= start && invoice.createdAt <= end
      );
      const total = scoped.reduce((sum, invoice) => sum + numberValue(invoice.totalAmount), 0);
      const paid = scoped.reduce((sum, invoice) => sum + numberValue(invoice.amountPaid), 0);
      const outstanding = scoped.reduce((sum, invoice) => sum + numberValue(invoice.amountOutstanding), 0);
      const actual = ratioPercent(paid, total);
      const isMissingData = scoped.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) => {
          const monthInvoices = ctx.invoices.filter(
            (invoice) => invoice.createdAt >= bucket.start && invoice.createdAt <= bucket.end
          );
          return ratioPercent(
            monthInvoices.reduce((sum, invoice) => sum + numberValue(invoice.amountPaid), 0),
            monthInvoices.reduce((sum, invoice) => sum + numberValue(invoice.totalAmount), 0)
          );
        }),
        ownerUpdate: isMissingData ? "No invoice data in the current period." : `${formatPercent(actual)} recovered across issued invoices, with KES ${Math.round(outstanding).toLocaleString()} still outstanding.`,
        dataQualityStatus: qualityFromCount(scoped.length),
        dataQualityNote:
          scoped.length <= 0
            ? "No invoice records were found in this measurement window."
            : null,
        actualAsOf: latestDateOrNull(...scoped.map((invoice) => invoice.createdAt)),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "job_invoices",
            sourceLabel: "Job invoices",
            dataQualityStatus: qualityFromCount(scoped.length),
            recordCount: scoped.length,
            rawValue: total,
            normalizedValue: actual,
            note: "Issued invoice value and paid value contributing to realization.",
          },
        ],
      };
    },
  },
  {
    id: "kpi-3",
    name: "Collection cycle days",
    perspectiveId: "financial",
    goalId: "goal-2",
    description: "Average elapsed days from invoice issue to payment or current aging for unresolved invoices.",
    formula: "Average days from invoice issue date to paid date",
    frequency: "Weekly",
    unit: "Days",
    weight: 14,
    owner: "Finance",
    targetValue: 42,
    targetLabel: "42 days",
    direction: "lower_better",
    statusLogic: "Green at 42 days or better, amber at 43-50, red above 50 days.",
    updateFrequency: "Weekly collections huddle",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const scoped = ctx.invoices.filter((invoice) => {
        const anchor = invoice.issuedAt ?? invoice.createdAt;
        return anchor >= start && anchor <= end;
      });
      const actual = averageCollectionDays(ctx.invoices, start, end, ctx.asOfDate);
      const overdueInvoices = scoped.filter((invoice) => invoice.status === "overdue").length;
      const isMissingData = scoped.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatDays(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          achievementToScore(
            averageCollectionDays(ctx.invoices, bucket.start, bucket.end, ctx.asOfDate),
            42,
            "lower_better"
          )
        ),
        ownerUpdate: isMissingData ? "No invoice aging data in the current period." : `${Math.round(actual)} day cycle with ${overdueInvoices} overdue invoices still sitting in the receivables queue.`,
        dataQualityStatus: qualityFromCount(scoped.length),
        dataQualityNote:
          scoped.length <= 0
            ? "No invoice aging records were available for this measurement window."
            : null,
        actualAsOf: ctx.asOfDate,
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "invoice_aging",
            sourceLabel: "Invoice aging",
            dataQualityStatus: qualityFromCount(scoped.length),
            recordCount: scoped.length,
            rawValue: actual,
            normalizedValue: achievementToScore(actual, 42, "lower_better"),
            note: "Average days from invoice issue to payment or current aging.",
          },
        ],
      };
    },
  },
  {
    id: "kpi-11",
    name: "Billable utilization",
    perspectiveId: "financial",
    goalId: "goal-2",
    description: "Measures the share of recorded hours marked as billable in the current period.",
    formula: "Billable hours / total recorded hours",
    frequency: "Monthly",
    unit: "%",
    weight: 12,
    owner: "Finance",
    targetValue: 80,
    targetLabel: "80%",
    direction: "higher_better",
    statusLogic: "Green at 80%+, amber at 65%-79.9%, red below 65%.",
    updateFrequency: "Monthly time entry close",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const { rate, billableHours, totalHours } = billableUtilizationRate(
        ctx.timeEntries,
        start,
        end
      );
      const isMissingData = totalHours <= 0;
      return {
        actualValue: isMissingData ? null : rate,
        actualLabel: isMissingData ? "No data" : formatPercent(rate),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          billableUtilizationRate(ctx.timeEntries, bucket.start, bucket.end).rate
        ),
        ownerUpdate:
          isMissingData
            ? "No time entries logged in the current period."
            : `${formatPercent(rate)} billable across ${Math.round(billableHours)} billable hours out of ${Math.round(totalHours)} total hours logged.`,
        dataQualityStatus: totalHours > 0 ? "healthy" : "missing_data",
        dataQualityNote:
          totalHours > 0 ? null : "No time entries were logged in this measurement window.",
        actualAsOf: latestDateOrNull(
          ...ctx.timeEntries
            .filter((entry) => entry.dateWorked >= start && entry.dateWorked <= end)
            .map((entry) => entry.dateWorked)
        ),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "time_entries",
            sourceLabel: "Time entries",
            dataQualityStatus: totalHours > 0 ? "healthy" : "missing_data",
            recordCount: ctx.timeEntries.filter(
              (entry) => entry.dateWorked >= start && entry.dateWorked <= end
            ).length,
            rawValue: totalHours,
            normalizedValue: rate,
            note: "Billable hours divided by total logged hours.",
            metadata: {
              billableHours: Math.round(billableHours),
              totalHours: Math.round(totalHours),
            },
          },
        ],
      };
    },
  },
  {
    id: "kpi-4",
    name: "Strategic client retention",
    perspectiveId: "customer",
    goalId: "goal-3",
    description: "Share of clients active in the prior 6-month window who are also active in the current 6-month window. Measures true carry-forward retention.",
    formula: "Clients retained from prior period / clients in prior period",
    frequency: "Quarterly",
    unit: "%",
    weight: 16,
    owner: "GMP Office",
    targetValue: 70,
    targetLabel: "70%",
    direction: "higher_better",
    statusLogic: "Green at 70%+, amber at 55%-69.9%, red below 55%.",
    updateFrequency: "Quarterly sponsor review",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const scoped = ctx.jobs.filter(
        (job) => job.clientId && job.createdAt >= start && job.createdAt <= end
      );
      const actual = clientRetentionRate(ctx.jobs, start, end);
      const currentClients = new Set(scoped.map((job) => job.clientId)).size;
      const isMissingData = currentClients <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          clientRetentionRate(ctx.jobs, bucket.start, bucket.end)
        ),
        ownerUpdate: isMissingData ? "No client-job activity in the current period." : `${formatPercent(actual)} of prior-period clients are active in the current window. ${currentClients} unique client relationships tracked.`,
        dataQualityStatus: currentClients > 0 ? "healthy" : "missing_data",
        dataQualityNote:
          currentClients > 0 ? null : "No client-job activity was found in this measurement window.",
        actualAsOf: latestDateOrNull(...scoped.map((job) => job.createdAt)),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "jobs_retention",
            sourceLabel: "Client job activity",
            dataQualityStatus: currentClients > 0 ? "healthy" : "missing_data",
            recordCount: scoped.length,
            rawValue: currentClients,
            normalizedValue: actual,
            note: "Unique clients active in the current period compared with the immediately prior equivalent window.",
          },
        ],
      };
    },
  },
  {
    id: "kpi-5",
    name: "Cross-practice expansion wins",
    perspectiveId: "customer",
    goalId: "goal-3",
    description: "Tracks proposal conversion as a live proxy for turning growth opportunities into active work.",
    formula: "Won proposals / total proposals raised in the period",
    frequency: "Monthly",
    unit: "%",
    weight: 14,
    owner: "Marketing",
    targetValue: 35,
    targetLabel: "35%",
    direction: "higher_better",
    statusLogic: "Green at 35%+, amber at 22%-34.9%, red below 22%.",
    updateFrequency: "Monthly pipeline review",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const scoped = ctx.proposals.filter(
        (proposal) => proposal.proposalDate >= start && proposal.proposalDate <= end
      );
      const actual = proposalWinRate(ctx.proposals, start, end);
      const isMissingData = scoped.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          proposalWinRate(ctx.proposals, bucket.start, bucket.end)
        ),
        ownerUpdate: isMissingData ? "No proposals in the current pipeline window." : `${scoped.filter((proposal) => proposal.status === "won").length} wins from ${scoped.length} proposals in the live pipeline window.`,
        dataQualityStatus: qualityFromCount(scoped.length),
        dataQualityNote:
          scoped.length <= 0 ? "No proposals were raised in this measurement window." : null,
        actualAsOf: latestDateOrNull(...scoped.map((proposal) => proposal.proposalDate)),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "proposals",
            sourceLabel: "Proposals",
            dataQualityStatus: qualityFromCount(scoped.length),
            recordCount: scoped.length,
            rawValue: scoped.filter((proposal) => proposal.status === "won").length,
            normalizedValue: actual,
            note: "Won proposals divided by total proposals raised in the measurement window.",
          },
        ],
      };
    },
  },
  {
    id: "kpi-6",
    name: "Stakeholder satisfaction score",
    perspectiveId: "customer",
    goalId: "goal-4",
    description: "Average satisfaction signal from completed client surveys.",
    formula: "Average overall satisfaction score from completed client surveys",
    frequency: "Monthly",
    unit: "Score",
    weight: 12,
    owner: "Partner Office",
    targetValue: 88,
    targetLabel: "88%",
    direction: "higher_better",
    statusLogic: "Green at 88%+, amber at 75%-87.9%, red below 75%.",
    updateFrequency: "Monthly client-listening pack",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const scoped = ctx.surveys.filter(
        (survey) =>
          (survey.completedAt ?? survey.createdAt) >= start &&
          (survey.completedAt ?? survey.createdAt) <= end &&
          typeof survey.overallSatisfaction === "number"
      );
      const actual = surveyScore(ctx.surveys, start, end);
      const isMissingData = scoped.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) => surveyScore(ctx.surveys, bucket.start, bucket.end)),
        ownerUpdate: isMissingData ? "No client surveys in the current period." : `${scoped.length} completed surveys with ${scoped.filter((survey) => survey.wouldRecommend === true).length} positive recommendation signals in the current period.`,
        dataQualityStatus: qualityFromCount(scoped.length),
        dataQualityNote:
          scoped.length <= 0 ? "No completed client surveys were found in this measurement window." : null,
        actualAsOf: latestDateOrNull(
          ...scoped.map((survey) => survey.completedAt ?? survey.createdAt)
        ),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "client_surveys",
            sourceLabel: "Client satisfaction surveys",
            dataQualityStatus: qualityFromCount(scoped.length),
            recordCount: scoped.length,
            rawValue: scoped.length,
            normalizedValue: actual,
            note: "Average normalized overall satisfaction score from completed surveys.",
            metadata: {
              promoterSignals: scoped.filter((survey) => survey.wouldRecommend === true).length,
            },
          },
        ],
      };
    },
  },
  {
    id: "kpi-7",
    name: "Turnaround and SLA adherence",
    perspectiveId: "internal",
    goalId: "goal-5",
    description: "Completed jobs delivered on or before the committed due date.",
    formula: "Completed jobs on or before due date / completed jobs with due dates",
    frequency: "Weekly",
    unit: "%",
    weight: 12,
    owner: "Operations Council",
    targetValue: 85,
    targetLabel: "85%",
    direction: "higher_better",
    statusLogic: "Green at 85%+, amber at 70%-84.9%, red below 70%.",
    updateFrequency: "Weekly delivery board",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const overdueJobs = ctx.jobs.filter(
        (job) =>
          job.status !== "completed" &&
          job.status !== "cancelled" &&
          job.dueDate &&
          job.dueDate < ctx.asOfDate
      ).length;
      const scoped = ctx.jobs.filter(
        (job) =>
          job.completionDate &&
          job.completionDate >= start &&
          job.completionDate <= end &&
          job.dueDate
      );
      const actual = onTimeJobRate(ctx.jobs, start, end);
      const isMissingData = scoped.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          onTimeJobRate(ctx.jobs, bucket.start, bucket.end)
        ),
        ownerUpdate: isMissingData ? "No completed jobs with due dates in the current period." : `${formatPercent(actual)} on-time completion across recent jobs, with ${overdueJobs} open jobs currently past due.`,
        dataQualityStatus: qualityFromCount(scoped.length),
        dataQualityNote:
          scoped.length <= 0 ? "No completed jobs with due dates were found in this measurement window." : null,
        actualAsOf: latestDateOrNull(
          ...scoped.map((job) => job.completionDate),
          ...scoped.map((job) => job.dueDate)
        ),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "jobs_delivery",
            sourceLabel: "Completed jobs",
            dataQualityStatus: qualityFromCount(scoped.length),
            recordCount: scoped.length,
            rawValue: scoped.filter(
              (job) =>
                job.completionDate &&
                job.dueDate &&
                job.completionDate.getTime() <= job.dueDate.getTime()
            ).length,
            normalizedValue: actual,
            note: "Completed jobs delivered on or before the committed due date.",
          },
        ],
      };
    },
  },
  {
    id: "kpi-8",
    name: "Quality review pass rate",
    perspectiveId: "internal",
    goalId: "goal-6",
    description: "Average project evaluation score across submitted quality reviews.",
    formula: "Average submitted project evaluation score",
    frequency: "Monthly",
    unit: "%",
    weight: 10,
    owner: "Manager Quality Forum",
    targetValue: 84,
    targetLabel: "84%",
    direction: "higher_better",
    statusLogic: "Green at 84%+, amber at 70%-83.9%, red below 70%.",
    updateFrequency: "Monthly quality review",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const scoped = ctx.projectEvaluations.filter((evaluation) => {
        const anchor = evaluation.submittedAt ?? evaluation.createdAt;
        return anchor >= start && anchor <= end;
      });
      const actual = reviewQualityRate(ctx.projectEvaluations, start, end);
      const isMissingData = scoped.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          reviewQualityRate(ctx.projectEvaluations, bucket.start, bucket.end)
        ),
        ownerUpdate: isMissingData ? "No submitted project evaluations in the current period." : `${ctx.projectEvaluations.length} submitted project evaluations are feeding the current quality score.`,
        dataQualityStatus: qualityFromCount(scoped.length),
        dataQualityNote:
          scoped.length <= 0 ? "No submitted project evaluations were found in this measurement window." : null,
        actualAsOf: latestDateOrNull(
          ...scoped.map((evaluation) => evaluation.submittedAt ?? evaluation.createdAt)
        ),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "project_evaluations",
            sourceLabel: "Project evaluations",
            dataQualityStatus: qualityFromCount(scoped.length),
            recordCount: scoped.length,
            rawValue: scoped.length,
            normalizedValue: actual,
            note: "Average normalized quality-review score across submitted evaluations.",
          },
        ],
      };
    },
  },
  {
    id: "kpi-9",
    name: "Coaching and review completion",
    perspectiveId: "people",
    goalId: "goal-7",
    description: "Share of evaluation assignments already submitted within the active review window.",
    formula: "Submitted evaluation assignments / total assignments created in the period",
    frequency: "Monthly",
    unit: "%",
    weight: 12,
    owner: "HR Business Partnering",
    targetValue: 90,
    targetLabel: "90%",
    direction: "higher_better",
    statusLogic: "Green at 90%+, amber at 75%-89.9%, red below 75%.",
    updateFrequency: "Monthly people review",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const scoped = ctx.evaluationAssignments.filter(
        (assignment) => assignment.createdAt >= start && assignment.createdAt <= end
      );
      const actual = evaluationCompletionRate(ctx.evaluationAssignments, start, end);
      const isMissingData = scoped.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          evaluationCompletionRate(ctx.evaluationAssignments, bucket.start, bucket.end)
        ),
        ownerUpdate: isMissingData ? "No evaluation assignments in the current period." : `${formatPercent(actual)} completion with ${ctx.evaluationAssignments.filter((assignment) => assignment.status !== "submitted").length} assignments still open or in progress.`,
        dataQualityStatus: qualityFromCount(scoped.length),
        dataQualityNote:
          scoped.length <= 0 ? "No evaluation assignments were created in this measurement window." : null,
        actualAsOf: latestDateOrNull(
          ...scoped.map((assignment) => assignment.submittedAt ?? assignment.createdAt)
        ),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "evaluation_assignments",
            sourceLabel: "Evaluation assignments",
            dataQualityStatus: qualityFromCount(scoped.length),
            recordCount: scoped.length,
            rawValue: scoped.filter((assignment) => assignment.status === "submitted").length,
            normalizedValue: actual,
            note: "Submitted evaluation assignments divided by total assignments created in the measurement window.",
          },
        ],
      };
    },
  },
  {
    id: "kpi-10",
    name: "Readiness and learning completion",
    perspectiveId: "people",
    goalId: "goal-8",
    description: "Blended readiness signal from learning assignment completion and employee onboarding completion.",
    formula: "Average of learning completion rate and onboarding completion rate",
    frequency: "Monthly",
    unit: "%",
    weight: 12,
    owner: "HR Capability Office",
    targetValue: 88,
    targetLabel: "88%",
    direction: "higher_better",
    statusLogic: "Green at 88%+, amber at 72%-87.9%, red below 72%.",
    updateFrequency: "Monthly readiness checkpoint",
    compute: (ctx) => {
      const { start, end } = ctx.measurementWindow;
      const scopedLearning = ctx.learningAssignments.filter(
        (assignment) => assignment.createdAt >= start && assignment.createdAt <= end
      );
      const scopedOnboarding = ctx.onboardingCases.filter(
        (record) => record.createdAt >= start && record.createdAt <= end
      );
      const actual = readinessCompletionRate(
        ctx.learningAssignments,
        ctx.onboardingCases,
        start,
        end
      );
      const isMissingData = scopedLearning.length <= 0 && scopedOnboarding.length <= 0;
      return {
        actualValue: isMissingData ? null : actual,
        actualLabel: isMissingData ? "No data" : formatPercent(actual),
        trend: isMissingData ? [] : buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          readinessCompletionRate(
            ctx.learningAssignments,
            ctx.onboardingCases,
            bucket.start,
            bucket.end
          )
        ),
        ownerUpdate: isMissingData ? "No learning assignments or onboarding cases in the current period." : `${formatPercent(actual)} readiness, with ${ctx.learningAssignments.filter((assignment) => assignment.status === "overdue").length} overdue learning assignments and ${ctx.onboardingCases.filter((record) => record.status !== "completed").length} onboarding cases still open.`,
        dataQualityStatus:
          scopedLearning.length > 0 || scopedOnboarding.length > 0 ? "healthy" : "missing_data",
        dataQualityNote:
          scopedLearning.length > 0 || scopedOnboarding.length > 0
            ? null
            : "No learning assignments or onboarding cases were found in this measurement window.",
        actualAsOf: latestDateOrNull(
          ...scopedLearning.map((assignment) => assignment.completedAt ?? assignment.createdAt),
          ...scopedOnboarding.map((record) => record.dueDate ?? record.createdAt)
        ),
        traces: [
          {
            sourceType: "operational_signal",
            sourceKey: "learning_assignments",
            sourceLabel: "Learning assignments",
            dataQualityStatus: qualityFromCount(scopedLearning.length),
            recordCount: scopedLearning.length,
            rawValue: scopedLearning.filter((assignment) => assignment.status === "completed").length,
            normalizedValue: scopedLearning.length
              ? ratioPercent(
                  scopedLearning.filter((assignment) => assignment.status === "completed").length,
                  scopedLearning.length
                )
              : null,
            note: "Learning completion rate component.",
          },
          {
            sourceType: "operational_signal",
            sourceKey: "employee_onboarding_cases",
            sourceLabel: "Onboarding cases",
            dataQualityStatus: qualityFromCount(scopedOnboarding.length),
            recordCount: scopedOnboarding.length,
            rawValue: scopedOnboarding.filter((record) => record.status === "completed").length,
            normalizedValue: scopedOnboarding.length
              ? ratioPercent(
                  scopedOnboarding.filter((record) => record.status === "completed").length,
                  scopedOnboarding.length
                )
              : null,
            note: "Onboarding completion rate component.",
          },
        ],
      };
    },
  },
];

const kpiCatalogByMetricKey = new Map(kpiCatalog.map((item) => [item.id, item]));

const buildLatestScores = async (
  evaluationCycleId?: number | null,
  scopeFilter?: RoleScopeFilter
) => {
  const filter = scopeFilter ?? { employeeIds: null, departmentIds: null };
  const rawScores = await prisma.performanceScore.findMany({
    where: {
      ...(evaluationCycleId ? { evaluationCycleId } : {}),
      ...scopeWhere(filter, "employeeProfileId", "employee"),
    },
    orderBy: [{ employeeProfileId: "asc" }, { calculatedAt: "desc" }],
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          manager: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  const latestByEmployee = new Map<number, (typeof rawScores)[number]>();
  rawScores.forEach((record) => {
    if (!latestByEmployee.has(record.employeeProfileId)) {
      latestByEmployee.set(record.employeeProfileId, record);
    }
  });
  return Array.from(latestByEmployee.values()).map((record) => ({
    employeeId: record.employeeProfileId,
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`.trim(),
    departmentName: record.employee.department?.name || "Unassigned",
    managerName: record.employee.manager
      ? `${record.employee.manager.firstName} ${record.employee.manager.lastName}`.trim()
      : null,
    score: numberValue(record.totalScore || record.nonFinancialWeighted || record.evaluationScore),
  }));
};

const buildEmployeePerformanceRows = (
  latestScores: WorkspaceComputationContext["latestScores"],
  assignments: WorkspaceComputationContext["evaluationAssignments"],
  learningAssignments: WorkspaceComputationContext["learningAssignments"],
  role: WorkspaceRole,
  scope: RoleScopeContext
): WorkspaceEmployeeRow[] => {
  const activityMap = buildEmployeeActivityMap(assignments, learningAssignments);
  const scopedLatestScores =
    role === "employee" && scope.requestingProfileId
      ? latestScores.filter((record) => record.employeeId === scope.requestingProfileId)
      : role === "manager" && scope.requestingProfileName
        ? latestScores.filter(
            (record) =>
              normalizeDisplayName(record.managerName) ===
              normalizeDisplayName(scope.requestingProfileName)
          )
        : latestScores;
  const scopedActivityEntries =
    role === "employee" && scope.requestingProfileId
      ? Array.from(activityMap.values()).filter(
          (activity) => activity.employeeId === scope.requestingProfileId
        )
      : role === "manager" && scope.requestingProfileName
        ? Array.from(activityMap.values()).filter(
            (activity) =>
              normalizeDisplayName(activity.managerName) ===
              normalizeDisplayName(scope.requestingProfileName)
          )
        : Array.from(activityMap.values());
  const latestByEmployee = new Map(scopedLatestScores.map((record) => [record.employeeId, record]));
  const employeeIds = Array.from(
    new Set([
      ...scopedLatestScores.map((record) => record.employeeId),
      ...scopedActivityEntries.map((activity) => activity.employeeId),
    ])
  );
  return employeeIds
    .map((employeeId) => {
      const latest = latestByEmployee.get(employeeId);
      const activity = activityMap.get(employeeId);
      const name = latest?.employeeName || activity?.employeeName || `Employee ${employeeId}`;
      const score = Math.round(latest?.score ?? scoreFromActivity(activity));
      return {
        name,
        score,
        ack: acknowledgementLabelFromActivity(activity),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
};

const buildDepartmentRows = (
  latestScores: WorkspaceComputationContext["latestScores"],
  assignments: WorkspaceComputationContext["evaluationAssignments"],
  learningAssignments: WorkspaceComputationContext["learningAssignments"],
  role: WorkspaceRole
): WorkspaceDepartmentRow[] => {
  if (role === "employee") {
    return [];
  }
  if (latestScores.length > 0) {
    const grouped = new Map<string, number[]>();
    latestScores.forEach((record) => {
      if (!grouped.has(record.departmentName)) grouped.set(record.departmentName, []);
      grouped.get(record.departmentName)?.push(record.score);
    });
    return Array.from(grouped.entries())
      .map(([name, scores]) => {
        const score = Math.round(average(scores));
        return { name, score, status: scoreToStatus(score) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }
  const groupedActivities = new Map<string, number[]>();
  buildEmployeeActivityMap(assignments, learningAssignments).forEach((activity) => {
    if (!groupedActivities.has(activity.departmentName)) {
      groupedActivities.set(activity.departmentName, []);
    }
    groupedActivities.get(activity.departmentName)?.push(scoreFromActivity(activity));
  });
  return Array.from(groupedActivities.entries())
    .map(([name, scores]) => {
      const score = Math.round(average(scores));
      return { name, score, status: scoreToStatus(score) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
};

const buildManagerRows = (
  latestScores: WorkspaceComputationContext["latestScores"],
  assignments: WorkspaceComputationContext["evaluationAssignments"],
  learningAssignments: WorkspaceComputationContext["learningAssignments"],
  role: WorkspaceRole,
  scope: RoleScopeContext
): WorkspaceManagerRow[] => {
  const activityMap = buildEmployeeActivityMap(assignments, learningAssignments);
  if (role === "employee" || role === "manager") {
    return [];
  }
  const scopedLatestScores =
    role === "partner" && scope.visibleProfileNames.length > 0
      ? latestScores.filter(
          (record) =>
            !record.managerName ||
            scope.visibleProfileNames.includes(normalizeDisplayName(record.managerName))
        )
      : latestScores;
  if (scopedLatestScores.length > 0) {
    const grouped = new Map<string, number[]>();
    scopedLatestScores.forEach((record) => {
      if (!record.managerName) return;
      if (!grouped.has(record.managerName)) grouped.set(record.managerName, []);
      grouped.get(record.managerName)?.push(record.score);
    });
    return Array.from(grouped.entries())
      .map(([name, scores], index) => ({
        name,
        score: Math.round(average(scores)),
        team:
          Array.from(activityMap.values()).find((activity) => activity.managerName === name)
            ?.departmentName || `Team ${index + 1}`,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }
  const groupedActivities = new Map<string, { team: string; scores: number[] }>();
  Array.from(activityMap.values())
    .filter(
      (activity) =>
        role !== "partner" ||
        scope.visibleProfileNames.length === 0 ||
        !activity.managerName ||
        scope.visibleProfileNames.includes(normalizeDisplayName(activity.managerName))
    )
    .forEach((activity) => {
    if (!activity.managerName) return;
    if (!groupedActivities.has(activity.managerName)) {
      groupedActivities.set(activity.managerName, {
        team: activity.departmentName,
        scores: [],
      });
    }
    groupedActivities.get(activity.managerName)?.scores.push(scoreFromActivity(activity));
    });
  return Array.from(groupedActivities.entries())
    .map(([name, values]) => ({
      name,
      score: Math.round(average(values.scores)),
      team: values.team,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
};

const buildEmployeeContributions = (
  role: WorkspaceRole,
  requestedProfileId: number | null,
  assignments: WorkspaceComputationContext["evaluationAssignments"],
  learningAssignments: WorkspaceComputationContext["learningAssignments"],
  config: {
    peopleKpiId: string;
    peopleInitiativeTitle: string;
  }
): WorkspaceEmployeeContribution[] => {
  const activityMap = buildEmployeeActivityMap(assignments, learningAssignments);
  const availableProfileIds = Array.from(activityMap.keys());
  const resolvedProfileId =
    requestedProfileId && activityMap.has(requestedProfileId)
      ? requestedProfileId
      : availableProfileIds[0] || requestedProfileId;

  if (!resolvedProfileId) return [];

  const employeeAssignments = assignments.filter(
    (assignment) => assignment.evaluatee.id === resolvedProfileId
  );
  const learningItemsForEmployee = learningAssignments.filter(
    (assignment) => assignment.employee.id === resolvedProfileId
  );
  const earliestAssignmentDue = employeeAssignments
    .map((assignment) => assignment.dueDate)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const evaluationProgress = Math.round(
    ratioPercent(
      employeeAssignments.filter((assignment) => assignment.status === "submitted").length,
      employeeAssignments.length
    )
  );
  const overdueAssignments = employeeAssignments.filter(
    (assignment) =>
      assignment.status !== "submitted" &&
      assignment.dueDate &&
      assignment.dueDate < new Date()
  ).length;
  const contributionItems: WorkspaceEmployeeContribution[] = [];

  if (employeeAssignments.length > 0) {
    const reviewAssignment =
      employeeAssignments.find((assignment) => assignment.status !== "submitted") ||
      employeeAssignments[0];
    contributionItems.push({
      id: `evaluation-${resolvedProfileId}`,
      sourceType: "evaluation_cycle",
      sourceReferenceId: reviewAssignment?.id ?? null,
      title:
        role === "employee"
          ? "Keep my evaluation cycle current"
          : "Evaluation cycle contribution",
      kpiId: config.peopleKpiId,
      initiative: config.peopleInitiativeTitle,
      dueDate: earliestAssignmentDue ? formatDateLabel(earliestAssignmentDue) : "Current review cycle",
      progress: evaluationProgress,
      score: evaluationProgress,
      status: scoreToStatus(evaluationProgress),
      acknowledged: employeeAssignments.some((assignment) => assignment.status !== "pending"),
      managerComment:
        overdueAssignments > 0
          ? `${overdueAssignments} review assignments are overdue and need immediate follow-through.`
          : `${employeeAssignments.filter((assignment) => assignment.status === "submitted").length}/${employeeAssignments.length} evaluation assignments are submitted in the current cycle.`,
      rollup:
        "Feeds the people perspective, review readiness, and the employee's current evaluation signal.",
      employeeComment: null,
      lastUpdatedAt: null,
      workflowRecordId: null,
      evidenceCount: 0,
      reviewContextPath: reviewAssignment
        ? "/bsc-management"
        : employeeAssignments[0]?.cycleId
          ? "/bsc-management"
          : "/bsc-management",
    });
  }

  const learningItems = learningItemsForEmployee
    .slice(0, Math.max(0, 3 - contributionItems.length))
    .map<WorkspaceEmployeeContribution>((assignment) => {
      const progress = Math.round(numberValue(assignment.progressPercent));
      return {
        id: `learning-${assignment.id}`,
        sourceType: "learning_assignment",
        sourceReferenceId: assignment.id,
        title: assignment.programVersion.title || assignment.programVersion.program.title,
        kpiId: config.peopleKpiId,
        initiative: config.peopleInitiativeTitle,
        dueDate: formatDateLabel(assignment.dueAt),
        progress,
        score: progress,
        status: scoreToStatus(progress),
        acknowledged: assignment.status !== "assigned",
        managerComment:
          assignment.status === "completed"
            ? "Learning requirement completed."
            : "Keep the readiness action moving before the next review checkpoint.",
        rollup: "Improves readiness and learning completion in the people perspective.",
        employeeComment: null,
        lastUpdatedAt: null,
        workflowRecordId: null,
        evidenceCount: 0,
        reviewContextPath: "/knowledge-hub",
      };
    });

  const combined = [...contributionItems, ...learningItems].slice(0, 3);

  if (combined.length === 0 && resolvedProfileId && config.peopleKpiId) {
    combined.push({
      id: `scorecard-${resolvedProfileId}`,
      sourceType: "evaluation_cycle",
      sourceReferenceId: null,
      title: "BSC contribution â€” awaiting review cycle",
      kpiId: config.peopleKpiId,
      initiative: config.peopleInitiativeTitle || "People & Readiness",
      dueDate: "Next review cycle",
      progress: 0,
      score: 0,
      status: "at_risk",
      acknowledged: false,
      managerComment:
        "No evaluation or learning assignment is linked yet. Your contribution will appear here once an active review cycle is started.",
      rollup: "Feeds the people perspective and review readiness signal.",
      employeeComment: null,
      lastUpdatedAt: null,
      workflowRecordId: null,
      evidenceCount: 0,
      reviewContextPath: "/bsc-management",
    });
  }

  return combined;
};

type EmployeeScoreRecord = WorkspaceComputationContext["latestScores"][number] & {
  roleId: number | null;
};

const buildEmployeeScorecardViews = (params: {
  employeeProfiles: Array<{
    id: number;
    firstName: string;
    lastName: string;
    roleId: number | null;
    department: { name: string } | null;
    manager: { firstName: string; lastName: string } | null;
  }>;
  structure: Awaited<ReturnType<typeof listBalancedScorecardStructure>>;
  rawAssignments: Array<{
    id: number;
    profileId: number;
    kpiId: number;
    individualTarget: unknown;
    individualWeight: number;
    kpi: { id: number; key: string; name: string; weight: number };
  }>;
  rawInitiatives: Awaited<ReturnType<typeof listBalancedScorecardStructure>>["initiatives"];
  activityMap: ReturnType<typeof buildEmployeeActivityMap>;
  latestScores: WorkspaceComputationContext["latestScores"];
  performanceBandByRoleId: Map<number | null, ScoreBandThresholds>;
  perspectiveKeyById: Map<number, PerspectiveKey>;
  goalById: Map<number, Awaited<ReturnType<typeof listBalancedScorecardStructure>>["goals"][number]>;
}) => {
  const peopleKpiIds = new Set(
    params.structure.kpis
      .filter((kpi) => {
        const goal = params.goalById.get(kpi.goalId);
        return goal ? params.perspectiveKeyById.get(goal.perspectiveId) === "people" : false;
      })
      .map((kpi) => kpi.id)
  );
  const latestScoreByEmployee = new Map(
    params.latestScores.map((record) => [record.employeeId, record])
  );
  const profileById = new Map(params.employeeProfiles.map((profile) => [profile.id, profile]));
  const initiativeSignalByProfileAndKpi = new Map<
    string,
    {
      progresses: number[];
      dueDates: Date[];
      initiativeTitles: string[];
      ownerName: string;
    }
  >();

  params.rawInitiatives.forEach((initiative) => {
    if (!initiative.ownerProfileId) return;
    if (!["employee", "manager"].includes(String(initiative.scopeRole || "").toLowerCase())) {
      return;
    }
    const key = `${initiative.ownerProfileId}:${initiative.kpiId}`;
    const current = initiativeSignalByProfileAndKpi.get(key) ?? {
      progresses: [],
      dueDates: [],
      initiativeTitles: [],
      ownerName: initiative.ownerName || "Unassigned",
    };
    current.progresses.push(Math.max(0, Math.min(100, Number(initiative.progress || 0))));
    if (initiative.dueDate) current.dueDates.push(initiative.dueDate);
    if (initiative.title) current.initiativeTitles.push(initiative.title);
    if (!current.ownerName && initiative.ownerName) current.ownerName = initiative.ownerName;
    initiativeSignalByProfileAndKpi.set(key, current);
  });

  const assignmentsByProfileId = new Map<number, WorkspaceEmployeeKpiAssignment[]>();

  params.rawAssignments.forEach((assignment) => {
    const profile = profileById.get(assignment.profileId);
    if (!profile) return;
    const band =
      params.performanceBandByRoleId.get(profile.roleId ?? null) ??
      params.performanceBandByRoleId.get(null) ??
      DEFAULT_SCORE_BAND;
    const signal = initiativeSignalByProfileAndKpi.get(`${assignment.profileId}:${assignment.kpiId}`);
    const activity = params.activityMap.get(assignment.profileId);
    const actualProgress = Math.round(
      signal?.progresses.length
        ? average(signal.progresses)
        : peopleKpiIds.has(assignment.kpiId)
          ? scoreFromActivity(activity)
          : 0
    );
    const targetValue = Number(assignment.individualTarget);
    const individualTarget = Number.isFinite(targetValue) ? targetValue : null;
    const score =
      individualTarget !== null && individualTarget > 0
        ? Math.round(achievementToScore(actualProgress, individualTarget, "higher_better"))
        : Math.round(clamp(actualProgress));
    const dueDate =
      signal?.dueDates.length && signal.dueDates[0]
        ? formatDateLabel(
            signal.dueDates.sort((left, right) => left.getTime() - right.getTime())[0]
          )
        : null;
    const view: WorkspaceEmployeeKpiAssignment = {
      id: assignment.id,
      profileId: assignment.profileId,
      kpiId: assignment.kpi.key,
      kpiName: assignment.kpi.name,
      individualTarget,
      individualWeight:
        assignment.individualWeight > 0 ? assignment.individualWeight : assignment.kpi.weight,
      actualProgress,
      score,
      status: scoreToStatus(score, band),
      initiativeTitles: signal?.initiativeTitles ?? [],
      dueDate,
      owner: signal?.ownerName || `${profile.firstName} ${profile.lastName}`.trim(),
    };
    const bucket = assignmentsByProfileId.get(assignment.profileId) ?? [];
    bucket.push(view);
    assignmentsByProfileId.set(assignment.profileId, bucket);
  });

  const scoreRows: EmployeeScoreRecord[] = params.employeeProfiles.map((profile) => {
    const assignmentViews = assignmentsByProfileId.get(profile.id) ?? [];
    const assignmentScore = assignmentViews.length
      ? Math.round(
          weightedAverage(
            assignmentViews.map((view) => ({
              score: view.score,
              weight: view.individualWeight || 1,
            }))
          )
        )
      : null;
    const activity = params.activityMap.get(profile.id);
    const fallbackScore = Math.round(
      latestScoreByEmployee.get(profile.id)?.score ?? scoreFromActivity(activity)
    );

    return {
      employeeId: profile.id,
      employeeName: `${profile.firstName} ${profile.lastName}`.trim(),
      departmentName: profile.department?.name || "Unassigned",
      managerName: profile.manager
        ? `${profile.manager.firstName} ${profile.manager.lastName}`.trim()
        : null,
      roleId: profile.roleId ?? null,
      score: assignmentScore ?? fallbackScore,
    };
  });

  return {
    assignmentsByProfileId,
    scoreRows,
  };
};

const resolveWorkspaceEvaluationCycle = async (evaluationCycleId?: number | null) => {
  if (evaluationCycleId) {
    return prisma.evaluationCycle.findUnique({
      where: { id: evaluationCycleId },
      select: {
        id: true,
        cycleName: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });
  }

  const activeCycle = await prisma.evaluationCycle.findFirst({
    where: { status: "active" },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      cycleName: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });
  if (activeCycle) return activeCycle;

  return prisma.evaluationCycle.findFirst({
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      cycleName: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });
};

const buildEvaluationSummary = (
  cycle: Awaited<ReturnType<typeof resolveWorkspaceEvaluationCycle>>,
  latestScores: WorkspaceComputationContext["latestScores"],
  assignments: WorkspaceComputationContext["evaluationAssignments"]
): WorkspaceEvaluationSummary => {
  const totalAssignments = assignments.length;
  const submittedAssignments = assignments.filter(
    (assignment) => assignment.status === "submitted"
  ).length;
  const pendingAssignments = totalAssignments - submittedAssignments;
  const acknowledgedAssignments = assignments.filter(
    (assignment) => assignment.evaluateeAcknowledged
  ).length;
  const overdueAssignments = assignments.filter(
    (assignment) =>
      assignment.status !== "submitted" &&
      assignment.dueDate &&
      assignment.dueDate < new Date()
  ).length;
  const departmentCount = new Set(
    assignments.map((assignment) => assignment.evaluatee.department?.name || "Unassigned")
  ).size;
  const managerCount = new Set(
    assignments
      .map((assignment) =>
        assignment.evaluatee.manager
          ? `${assignment.evaluatee.manager.firstName} ${assignment.evaluatee.manager.lastName}`.trim()
          : null
      )
      .filter(Boolean)
  ).size;

  return {
    cycleId: cycle?.id ?? null,
    cycleTitle: cycle?.cycleName ?? null,
    cycleStatus: cycle?.status ?? null,
    startDate: cycle?.startDate?.toISOString() ?? null,
    endDate: cycle?.endDate?.toISOString() ?? null,
    totalAssignments,
    submittedAssignments,
    pendingAssignments,
    acknowledgedAssignments,
    overdueAssignments,
    completionPercent: Math.round(ratioPercent(submittedAssignments, totalAssignments)),
    acknowledgementPercent: Math.round(
      ratioPercent(acknowledgedAssignments, submittedAssignments)
    ),
    averageScore: Math.round(average(latestScores.map((score) => score.score))),
    departmentCount,
    managerCount,
    resultCount: latestScores.length,
  };
};

// ---------------------------------------------------------------------------
// Role-based data scoping
// ---------------------------------------------------------------------------

type RoleScopeFilter = {
  /** Restrict people-data queries to these employee profile IDs. null = no filter (firm-wide). */
  employeeIds: number[] | null;
  /** Restrict people-data queries to employees in these departments. null = no filter (firm-wide). */
  departmentIds: number[] | null;
};

type RoleScopeContext = RoleScopeFilter & {
  requestingProfileId: number | null;
  requestingProfileName: string | null;
  visibleProfileIds: number[];
  visibleProfileNames: string[];
};

/** Roles that always see full firm-wide data. */
const FIRM_WIDE_ROLES = new Set<WorkspaceRole>(["hr", "gmp"]);

/**
 * Build the Prisma `where` fragment that scopes a query to the resolved filter.
 * Pass the field names as used on the model being queried.
 *
 * Returns `{}` (no restriction) when the filter is firm-wide (both fields null).
 */
function scopeWhere(
  filter: RoleScopeFilter,
  employeeIdField: string,
  departmentRelationField: string
): Record<string, unknown> {
  if (filter.employeeIds !== null) {
    return { [employeeIdField]: { in: filter.employeeIds } };
  }
  if (filter.departmentIds !== null) {
    return { [departmentRelationField]: { departmentId: { in: filter.departmentIds } } };
  }
  return {};
}

async function resolveRoleScopeFilter(
  role: WorkspaceRole,
  requestingProfileId: number | null
): Promise<RoleScopeFilter> {
  // No profile ID or privileged role â†’ firm-wide access.
  // Omitting requestingProfileId silently grants firm-wide scope, so callers
  // should always supply it for non-privileged roles.
  if (FIRM_WIDE_ROLES.has(role)) {
    return { employeeIds: null, departmentIds: null };
  }

  if (!requestingProfileId) {
    if (role === "finance" || role === "marketing") {
      return { employeeIds: null, departmentIds: null };
    }

    return { employeeIds: [], departmentIds: [] };
  }

  if (role === "employee") {
    return { employeeIds: [requestingProfileId], departmentIds: null };
  }

  if (role === "manager") {
    const directReports = await prisma.profile.findMany({
      where: { managerId: requestingProfileId },
      select: { id: true },
    });
    // Use a Set for O(1) dedup, then include the manager so their own
    // evaluations are visible alongside their team's.
    const idSet = new Set(directReports.map((r) => r.id));
    idSet.add(requestingProfileId);
    return { employeeIds: Array.from(idSet), departmentIds: null };
  }

  if (role === "partner") {
    const partnerDepts = await prisma.department.findMany({
      where: { partnerProfileId: requestingProfileId },
      select: { id: true },
    });
    // An unassigned partner sees an empty dataset, not firm-wide data.
    return {
      employeeIds: null,
      departmentIds: partnerDepts.map((d) => d.id),
    };
  }

  // finance / marketing â€” firm-wide KPI view, no people scoping.
  return { employeeIds: null, departmentIds: null };
}

const normalizeDisplayName = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

async function resolveRoleScopeContext(
  role: WorkspaceRole,
  requestingProfileId: number | null
): Promise<RoleScopeContext> {
  const baseScope = await resolveRoleScopeFilter(role, requestingProfileId);

  if (!requestingProfileId) {
    return {
      ...baseScope,
      requestingProfileId: null,
      requestingProfileName: null,
      visibleProfileIds: [],
      visibleProfileNames: [],
    };
  }

  const requestingProfile = await prisma.profile.findUnique({
    where: { id: requestingProfileId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      departmentId: true,
      departmentsHeaded: { select: { id: true } },
    },
  });

  const requestingProfileName = requestingProfile
    ? `${requestingProfile.firstName} ${requestingProfile.lastName}`.trim()
    : null;

  if (FIRM_WIDE_ROLES.has(role) || role === "finance" || role === "marketing") {
    return {
      ...baseScope,
      requestingProfileId,
      requestingProfileName,
      visibleProfileIds: [],
      visibleProfileNames: [],
    };
  }

  let scopedEmployeeIds = baseScope.employeeIds;
  let scopedDepartmentIds = baseScope.departmentIds;

  if (role === "manager" && requestingProfile) {
    const primaryDepartmentId =
      requestingProfile.departmentId ?? requestingProfile.departmentsHeaded[0]?.id ?? null;
    if (primaryDepartmentId) {
      scopedDepartmentIds = [primaryDepartmentId];
      scopedEmployeeIds = null;
    }
  }

  const visibleProfiles =
    scopedEmployeeIds !== null
      ? await prisma.profile.findMany({
          where: { id: { in: scopedEmployeeIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : scopedDepartmentIds !== null
        ? await prisma.profile.findMany({
            where: { departmentId: { in: scopedDepartmentIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];

  const visibleProfileNames = Array.from(
    new Set(
      visibleProfiles
        .map((profile) => normalizeDisplayName(`${profile.firstName} ${profile.lastName}`))
        .filter(Boolean)
    )
  );
  const visibleProfileIds = Array.from(new Set(visibleProfiles.map((profile) => profile.id)));

  return {
    employeeIds: scopedEmployeeIds,
    departmentIds: scopedDepartmentIds,
    requestingProfileId,
    requestingProfileName,
    visibleProfileIds,
    visibleProfileNames,
  };
}

const firmWideScopeContext: RoleScopeContext = {
  employeeIds: null,
  departmentIds: null,
  requestingProfileId: null,
  requestingProfileName: null,
  visibleProfileIds: [],
  visibleProfileNames: [],
};

const earlierDate = (left: Date, right: Date) =>
  left.getTime() <= right.getTime() ? left : right;

async function loadWorkspaceComputationContext(params: {
  evaluationCycleId?: number | null;
  scopeContext: RoleScopeContext;
  measurementWindow: { start: Date; end: Date };
  monthBuckets: WorkspaceComputationContext["monthBuckets"];
  asOfDate: Date;
}) {
  const effectiveEvaluationCycleId = params.evaluationCycleId ?? null;
  const currentMonthBucket = params.monthBuckets[params.monthBuckets.length - 1];
  const windowDurationMs = Math.max(
    0,
    params.measurementWindow.end.getTime() - params.measurementWindow.start.getTime()
  );
  const priorWindowStart = new Date(params.measurementWindow.start.getTime() - windowDurationMs - 1);
  const lowerBound = earlierDate(
    earlierDate(params.measurementWindow.start, params.monthBuckets[0].start),
    priorWindowStart
  );
  const upperBound = params.asOfDate;
  const { scopeContext } = params;

  const [
    payments,
    projections,
    invoices,
    surveys,
    proposals,
    timeEntries,
    jobs,
    projectEvaluations,
    evaluationAssignments,
    learningAssignments,
    onboardingCases,
    tasks,
    latestScores,
    kpiActualHistory,
  ] = await Promise.all([
    prisma.clientPayment.findMany({
      where: { paymentDate: { gte: lowerBound, lte: upperBound } },
      select: { paymentAmount: true, paymentDate: true },
    }),
    prisma.revenueProjection.findMany({
      where: { monthYear: { gte: lowerBound, lte: upperBound } },
      select: { projectedAmount: true, actualCollected: true, monthYear: true },
    }),
    prisma.jobInvoice.findMany({
      where: { createdAt: { gte: lowerBound, lte: upperBound } },
      select: {
        totalAmount: true,
        amountPaid: true,
        amountOutstanding: true,
        dueDate: true,
        issuedAt: true,
        paidAt: true,
        createdAt: true,
        status: true,
      },
    }),
    prisma.clientSatisfactionSurvey.findMany({
      where: {
        OR: [
          { createdAt: { gte: lowerBound, lte: upperBound } },
          { completedAt: { gte: lowerBound, lte: upperBound } },
        ],
      },
      select: { overallSatisfaction: true, wouldRecommend: true, completedAt: true, createdAt: true },
    }),
    prisma.proposal.findMany({
      where: { proposalDate: { gte: lowerBound, lte: upperBound } },
      select: { status: true, proposalDate: true, wonAt: true },
    }),
    prisma.timeEntry.findMany({
      where: { dateWorked: { gte: lowerBound, lte: upperBound } },
      select: { hours: true, billable: true, billableAmount: true, dateWorked: true },
    }),
    prisma.job.findMany({
      where: {
        OR: [
          { createdAt: { gte: lowerBound, lte: upperBound } },
          { completionDate: { gte: lowerBound, lte: upperBound } },
          { dueDate: { gte: lowerBound, lte: upperBound } },
        ],
      },
      select: {
        id: true,
        clientId: true,
        status: true,
        dueDate: true,
        completionDate: true,
        createdAt: true,
        department: { select: { name: true } },
        manager: { select: { firstName: true, lastName: true } },
        partner: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.projectEvaluation.findMany({
      where: { createdAt: { gte: lowerBound, lte: upperBound }, status: "submitted" },
      select: { overallScore: true, submittedAt: true, createdAt: true },
    }),
    prisma.evaluationAssignment.findMany({
      where: {
        ...(effectiveEvaluationCycleId
          ? { cycleId: effectiveEvaluationCycleId }
          : { createdAt: { gte: lowerBound, lte: upperBound } }),
        ...scopeWhere(scopeContext, "evaluateeProfileId", "evaluatee"),
      },
      select: {
        id: true,
        cycleId: true,
        status: true,
        submittedAt: true,
        dueDate: true,
        createdAt: true,
        evaluateeAcknowledged: true,
        evaluatee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            manager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.learningAssignment.findMany({
      where: {
        createdAt: { gte: lowerBound, lte: upperBound },
        ...scopeWhere(scopeContext, "employeeProfileId", "employee"),
      },
      select: {
        id: true,
        employeeProfileId: true,
        status: true,
        progressPercent: true,
        startedAt: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            manager: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        programVersion: { select: { title: true, program: { select: { title: true } } } },
      },
    }),
    prisma.employeeOnboardingCase.findMany({
      where: {
        OR: [
          { createdAt: { gte: lowerBound, lte: upperBound } },
          { dueDate: { gte: lowerBound, lte: upperBound } },
        ],
      },
      select: {
        status: true,
        startDate: true,
        dueDate: true,
        createdAt: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        OR: [
          { createdAt: { gte: lowerBound, lte: upperBound } },
          { dueDate: { gte: lowerBound, lte: upperBound } },
        ],
        ...scopeWhere(scopeContext, "assignedToProfileId", "assignee"),
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        createdAt: true,
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            manager: { select: { firstName: true, lastName: true } },
          },
        },
        job: { select: { jobName: true } },
      },
    }),
    buildLatestScores(effectiveEvaluationCycleId, scopeContext),
    prisma.balancedScorecardKpiActualHistory.findMany({
      where: { recordedAt: { gte: lowerBound, lte: upperBound } },
      orderBy: { recordedAt: "asc" },
      select: { kpiId: true, actualValue: true, recordedAt: true },
    }),
  ]);

  const ctx: WorkspaceComputationContext = {
    payments,
    projections,
    invoices,
    surveys,
    proposals,
    timeEntries,
    jobs,
    projectEvaluations,
    evaluationAssignments,
    learningAssignments,
    onboardingCases,
    tasks,
    latestScores,
    measurementWindow: params.measurementWindow,
    asOfDate: params.asOfDate,
    monthBuckets: params.monthBuckets,
    currentMonthBucket,
  };

  return { ctx, kpiActualHistory };
}

export async function computeBalancedScorecardKpiRecords(params?: {
  scorecardVersionId?: number | null;
  evaluationCycleId?: number | null;
  scopeContext?: RoleScopeContext;
  measurementWindow?: { start: Date; end: Date };
  monthBucketCount?: number;
  asOfDate?: Date;
}) {
  const measurementWindow = params?.measurementWindow ?? {
    start: monthBuckets(6)[0].start,
    end: monthBuckets(6)[monthBuckets(6).length - 1].end,
  };
  const monthBucketCount = params?.monthBucketCount ?? 6;
  const buckets = monthBuckets(monthBucketCount, measurementWindow.end);
  const asOfDate = params?.asOfDate ?? new Date();
  const scopeContext = params?.scopeContext ?? firmWideScopeContext;
  const structure = await listBalancedScorecardStructure({
    scorecardVersionId: params?.scorecardVersionId ?? undefined,
  });
  const { ctx, kpiActualHistory } = await loadWorkspaceComputationContext({
    evaluationCycleId: params?.evaluationCycleId ?? null,
    scopeContext,
    measurementWindow,
    monthBuckets: buckets,
    asOfDate,
  });

  const perspectiveById = new Map(structure.perspectives.map((perspective) => [perspective.id, perspective]));
  const perspectiveKeyById = new Map(
    structure.perspectives.map((perspective) => [perspective.id, perspective.key as PerspectiveKey])
  );
  const goalById = new Map(structure.goals.map((goal) => [goal.id, goal]));
  const latestEngineResultByKpiId = await loadLatestKpiEngineResults(
    structure.kpis.map((kpi) => kpi.id)
  );

  const kpis = structure.kpis
    .map((record) => {
      const goal = goalById.get(record.goalId);
      const perspective = goal ? perspectiveById.get(goal.perspectiveId) : undefined;
      const perspectiveKey = goal ? perspectiveKeyById.get(goal.perspectiveId) : undefined;
      const catalogKpi = kpiCatalogByMetricKey.get(record.metricKey);
      const manualActualValue =
        record.currentActualValue !== null &&
        record.currentActualValue !== undefined &&
        Number.isFinite(Number(record.currentActualValue))
          ? Number(record.currentActualValue)
          : null;
      const manualComputation =
        record.trackingMode === "manual"
          ? buildManualKpiComputation(
              {
                id: record.id,
                measurementType: record.measurementType ?? null,
                targetDirection: record.targetDirection ?? null,
                targetValue: record.targetValue ?? null,
                currentActualValue: manualActualValue,
                unit: record.unit,
                lastMeasurementNote: record.lastMeasurementNote ?? null,
              },
              kpiActualHistory,
              buckets
            )
          : null;
      const computed = catalogKpi
        ? catalogKpi.compute(ctx)
        : manualComputation
          ? {
              actualValue: manualComputation.actualValue,
              actualLabel: manualComputation.actualLabel,
              trend: manualComputation.trend,
              ownerUpdate: manualComputation.ownerUpdate,
              dataQualityStatus: manualComputation.dataQualityStatus,
              dataQualityNote: manualComputation.dataQualityNote,
              actualAsOf: manualComputation.actualAsOf,
              traces: manualComputation.traces,
            }
          : {
              actualValue: null as number | null,
              actualLabel: "Awaiting first update",
              trend: [] as number[],
              ownerUpdate: "",
              dataQualityStatus: "missing_data" as BalancedScorecardComputedDataQualityStatus,
              dataQualityNote: "No supporting measurement data was available for this KPI.",
              actualAsOf: null,
              traces: [] as BalancedScorecardComputedTrace[],
            };
      const resolvedActualValue = manualActualValue ?? computed.actualValue;
      const resolvedActualLabel =
        manualActualValue !== null
          ? formatManualActual(record.measurementType ?? null, manualActualValue, record.unit)
          : computed.actualLabel;
      const historicalTrend = buildManualKpiTrend(record.id, kpiActualHistory, buckets);
      const resolvedTrend = historicalTrend.length > 0 ? historicalTrend : computed.trend;
      const targetValue =
        record.targetValue !== null && record.targetValue !== undefined
          ? Number(record.targetValue)
          : catalogKpi?.targetValue ?? null;
      const targetLabel =
        record.firmTarget?.trim() || catalogKpi?.targetLabel || (targetValue !== null ? `${targetValue}` : null);
      const engineResult = latestEngineResultByKpiId.get(record.id);
      const engineActualValue =
        engineResult?.actualValue !== null && engineResult?.actualValue !== undefined
          ? Number(engineResult.actualValue)
          : null;
      const engineTrend = engineResult ? normalizeEngineTrend(engineResult.trend) : [];
      const weightedScore = Math.round(
        engineResult
          ? engineResult.score
          : catalogKpi
            ? achievementToScore(
                resolvedActualValue,
                catalogKpi.targetValue,
                catalogKpi.direction
              )
            : manualComputation
              ? manualComputation.weightedScore
              : 0
      );
      const status = engineResult
        ? engineResult.status
        : catalogKpi
          ? scoreToStatus(weightedScore)
          : manualComputation
            ? manualComputation.status
            : scoreToStatus(weightedScore);
      if (!goal || !perspective || !perspectiveKey) {
        return null;
      }
      return {
        recordId: record.id,
        key: record.key,
        metricKey: record.metricKey,
        trackingMode: record.trackingMode as "template" | "manual",
        perspectiveKey,
        perspectiveName: perspective.name,
        goalRecordId: goal.id,
        goalKey: goal.key,
        goalTitle: goal.title,
        name: record.name,
        description: record.description || catalogKpi?.description || "",
        formula: record.formula || catalogKpi?.formula || "",
        frequency: record.frequency,
        unit: record.unit,
        weight: record.weight,
        firmTarget: record.firmTarget,
        targetValue,
        targetLabel,
        actualValue: engineResult ? engineActualValue : resolvedActualValue,
        actualLabel:
          engineResult && engineActualValue !== null
            ? formatManualActual(record.measurementType ?? null, engineActualValue, record.unit)
            : resolvedActualLabel,
        weightedScore,
        owner: record.ownerName || catalogKpi?.owner || "Unassigned",
        status,
        statusLogic: record.statusLogic || catalogKpi?.statusLogic || record.targetDirection || "",
        updateFrequency: record.updateFrequency || catalogKpi?.updateFrequency || record.frequency,
        trend: engineTrend.length > 0 ? engineTrend : resolvedTrend,
        ownerUpdate:
          engineResult
            ? `Engine calculated ${formatDateLabel(engineResult.calculatedAt)}.`
            : computed.ownerUpdate,
        dataQualityStatus: computed.dataQualityStatus,
        dataQualityNote: computed.dataQualityNote ?? null,
        actualAsOf: computed.actualAsOf ?? null,
        traces: computed.traces,
      } satisfies BalancedScorecardComputedKpiRecord;
    })
    .filter((record): record is BalancedScorecardComputedKpiRecord => record !== null);

  return {
    structure,
    kpis,
    ctx,
    kpiActualHistory,
    monthBuckets: buckets,
    currentMonthBucket: buckets[buckets.length - 1],
  };
}

function isInitiativeVisibleToRole(
  initiative: WorkspaceInitiative,
  role: WorkspaceRole,
  scope: RoleScopeContext
) {
  if (FIRM_WIDE_ROLES.has(role) || role === "finance" || role === "marketing") {
    return true;
  }

  const ownerName = normalizeDisplayName(initiative.owner);
  const requesterName = normalizeDisplayName(scope.requestingProfileName);
  const ownerProfileId = initiative.ownerProfileId ?? null;
  const visibleOwner =
    (ownerProfileId !== null && scope.visibleProfileIds.includes(ownerProfileId)) ||
    (ownerName && scope.visibleProfileNames.includes(ownerName)) ||
    (requesterName && ownerName === requesterName);

  if (role === "employee") {
    return (
      initiative.scopeRole === "employee" &&
      ((ownerProfileId !== null && ownerProfileId === scope.requestingProfileId) ||
        ownerName === requesterName)
    );
  }

  if (role === "manager") {
    return ["manager", "employee"].includes(initiative.scopeRole) && visibleOwner;
  }

  if (role === "partner") {
    return ["partner", "manager", "employee"].includes(initiative.scopeRole) && visibleOwner;
  }

  return true;
}

const buildBalancedScorecardWorkspace = async (params: {
  role: WorkspaceRole;
  profileId?: number | null;
  /**
   * The profile ID of the user who is actually making the request.
   * Used for role-based data scoping. When omitted, defaults to firm-wide
   * access â€” callers must supply this for non-privileged roles.
   */
  requestingProfileId?: number | null;
  evaluationCycleId?: number | null;
}): Promise<BalancedScorecardWorkspace> => {
  const buckets = monthBuckets(6);
  const currentMonthBucket = buckets[buckets.length - 1];
  const measurementWindow = {
    start: buckets[0].start,
    end: currentMonthBucket.end,
  };
  const asOfDate = new Date();

  // Resolve evaluation cycle and role scope in parallel â€” they are independent.
  const [evaluationCycle, scopeContext] = await Promise.all([
    resolveWorkspaceEvaluationCycle(params.evaluationCycleId ?? null),
    resolveRoleScopeContext(params.role, params.requestingProfileId ?? null),
  ]);
  const effectiveEvaluationCycleId = evaluationCycle?.id ?? null;

  const { structure, ctx, kpiActualHistory } =
    await computeBalancedScorecardKpiRecords({
      evaluationCycleId: effectiveEvaluationCycleId,
      scopeContext,
      measurementWindow,
      monthBucketCount: 6,
      asOfDate,
    });

  const { invoices, jobs, evaluationAssignments, learningAssignments, latestScores } = ctx;

  const perspectiveKeyById = new Map(
    structure.perspectives.map((perspective) => [perspective.id, perspective.key as PerspectiveKey])
  );
  const goalById = new Map(structure.goals.map((goal) => [goal.id, goal]));
  const latestEngineResultByKpiId = await loadLatestKpiEngineResults(
    structure.kpis.map((kpi) => kpi.id)
  );
  const rawKpisWithNulls = structure.kpis.map((record) => {
    const goal = goalById.get(record.goalId);
    const perspectiveId = goal ? perspectiveKeyById.get(goal.perspectiveId) : undefined;
    const catalogKpi = kpiCatalogByMetricKey.get(record.metricKey);
    const manualActualValue =
      record.currentActualValue !== null &&
      record.currentActualValue !== undefined &&
      Number.isFinite(Number(record.currentActualValue))
        ? Number(record.currentActualValue)
        : null;
    const manualComputation =
      record.trackingMode === "manual"
        ? buildManualKpiComputation(
            {
              id: record.id,
              measurementType: record.measurementType ?? null,
              targetDirection: record.targetDirection ?? null,
              targetValue: record.targetValue ?? null,
              currentActualValue: manualActualValue,
              unit: record.unit,
              lastMeasurementNote: record.lastMeasurementNote ?? null,
            },
            kpiActualHistory,
            buckets
          )
        : null;
    const computed = catalogKpi
      ? catalogKpi.compute(ctx)
      : manualComputation
        ? {
            actualValue: manualComputation.actualValue,
            actualLabel: manualComputation.actualLabel,
            trend: manualComputation.trend,
            ownerUpdate: manualComputation.ownerUpdate,
            dataQualityStatus: manualComputation.dataQualityStatus,
            dataQualityNote: manualComputation.dataQualityNote ?? null,
          }
        : {
            actualValue: null as number | null,
            actualLabel: "Awaiting first update",
            trend: [] as number[],
            ownerUpdate: "",
            dataQualityStatus: "missing_data" as BalancedScorecardComputedDataQualityStatus,
            dataQualityNote: "No supporting measurement data was available for this KPI.",
          };
    const resolvedActualValue = manualActualValue ?? computed.actualValue;
    const resolvedActualLabel =
      manualActualValue !== null
        ? formatManualActual(record.measurementType ?? null, manualActualValue, record.unit)
        : computed.actualLabel;
    const historicalTrend = buildManualKpiTrend(record.id, kpiActualHistory, buckets);
    const resolvedTrend = historicalTrend.length > 0 ? historicalTrend : computed.trend;
    const engineResult = latestEngineResultByKpiId.get(record.id);
    const engineActualValue =
      engineResult?.actualValue !== null && engineResult?.actualValue !== undefined
        ? Number(engineResult.actualValue)
        : null;
    const engineTrend = engineResult ? normalizeEngineTrend(engineResult.trend) : [];
    const weightedScore = Math.round(
      engineResult
        ? engineResult.score
        : catalogKpi
          ? achievementToScore(
              resolvedActualValue,
              catalogKpi.targetValue,
              catalogKpi.direction
            )
          : manualComputation
            ? manualComputation.weightedScore
            : 0
    );
    const status = engineResult
      ? engineResult.status
      : catalogKpi
        ? scoreToStatus(weightedScore)
        : manualComputation
          ? manualComputation.status
          : scoreToStatus(weightedScore);
    if (!perspectiveId) {
      // Goal's parent perspective is archived or missing â€” skip this KPI to avoid
      // it appearing under the wrong perspective.
      return null;
    }
    return {
      id: record.key,
      name: record.name,
      perspectiveId,
      goalId: goal?.key || `goal-${record.goalId}`,
      description: record.description || catalogKpi?.description || "",
      formula: record.formula || catalogKpi?.formula || "",
      frequency: record.frequency,
      unit: record.unit,
      weight: record.weight,
      firmTarget: record.firmTarget,
      actual:
        engineResult && engineActualValue !== null
          ? formatManualActual(record.measurementType ?? null, engineActualValue, record.unit)
          : resolvedActualLabel,
      weightedScore,
      owner: record.ownerName || catalogKpi?.owner || "Unassigned",
      status,
      statusLogic: record.statusLogic || catalogKpi?.statusLogic || record.targetDirection || "",
      updateFrequency: record.updateFrequency || catalogKpi?.updateFrequency || record.frequency,
      initiativeProgress: weightedScore,
      trend: engineTrend.length > 0 ? engineTrend : resolvedTrend,
      ownerUpdate:
        engineResult
          ? `Engine calculated ${formatDateLabel(engineResult.calculatedAt)}.`
          : computed.ownerUpdate,
      dataQualityStatus: computed.dataQualityStatus,
      dataQualityNote: computed.dataQualityNote ?? null,
    } satisfies WorkspaceKpi;
  });

  // Drop KPIs whose parent goal's perspective has been archived/deleted.
  const rawKpis = rawKpisWithNulls.filter((kpi): kpi is WorkspaceKpi => kpi !== null);

  const allInitiatives = structure.initiatives.map((record) => {
    const goal = goalById.get(record.goalId);
    const perspectiveId =
      (goal ? perspectiveKeyById.get(goal.perspectiveId) : undefined) || "financial";
    const linkedKpi = rawKpis.find(
      (kpi) => kpi.id === (structure.kpis.find((item) => item.id === record.kpiId)?.key || "")
    );
    const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue").length;
    const overdueJobs = jobs.filter(
      (job) =>
        job.status !== "completed" &&
        job.status !== "cancelled" &&
        job.dueDate &&
        job.dueDate < new Date()
    ).length;
    const descendantCount = structure.initiatives.filter((candidate) => {
      let currentParentId = candidate.parentInitiativeId;
      while (currentParentId) {
        if (currentParentId === record.id) return true;
        currentParentId =
          structure.initiatives.find((item) => item.id === currentParentId)?.parentInitiativeId ?? null;
      }
      return false;
    }).length;
    return {
      id: record.key,
      title: record.title,
      goalId: goal?.key || `goal-${record.goalId}`,
      kpiId: structure.kpis.find((item) => item.id === record.kpiId)?.key || `kpi-${record.kpiId}`,
      perspectiveId,
      owner: record.ownerName || "Unassigned",
      ownerProfileId: record.ownerProfileId ?? null,
      timeline: record.timeline || "Open timeline",
      dueDate: formatDateLabel(record.dueDate),
      drilldownCount: descendantCount,
      progress: record.progress || linkedKpi?.initiativeProgress || 0,
      status: (record.status as StatusTone) || linkedKpi?.status || "at_risk",
      scopeRole: record.scopeRole as WorkspaceRole,
      parentInitiativeId:
        structure.initiatives.find((item) => item.id === record.parentInitiativeId)?.key || null,
      summary:
        record.summary ||
        [
          linkedKpi ? `Linked KPI: ${linkedKpi.name}.` : null,
          record.timeline ? `Timeline: ${record.timeline}.` : null,
          record.dueDate ? `Due ${formatDateLabel(record.dueDate)}.` : null,
          `Progress ${record.progress || linkedKpi?.initiativeProgress || 0}%.`,
        ]
          .filter(Boolean)
          .join(" "),
    } satisfies WorkspaceInitiative;
  });
  const visibleInitiativesByRole = allInitiatives.filter((initiative) =>
    isInitiativeVisibleToRole(initiative, params.role, scopeContext)
  );
  const visibleInitiativeRecordKeys = new Set(visibleInitiativesByRole.map((initiative) => initiative.id));
  const visibleInitiativeRecords = structure.initiatives.filter((initiative) =>
    visibleInitiativeRecordKeys.has(initiative.key)
  );
  const topLevelInitiativeRecords = visibleInitiativeRecords.filter(
    (initiative) => !initiative.parentInitiativeId && !initiative.key.startsWith("cascade-")
  );
  const initiatives = visibleInitiativesByRole.filter((initiative) =>
    topLevelInitiativeRecords.some((record) => record.key === initiative.id)
  );

  const initiativeProgressByKpiId = new Map<string, number>();
  initiatives.forEach((initiative) => {
    const bucket = initiativeProgressByKpiId.get(initiative.kpiId) ?? 0;
    initiativeProgressByKpiId.set(initiative.kpiId, bucket + initiative.progress);
  });
  const initiativeCountByKpiId = new Map<string, number>();
  initiatives.forEach((initiative) => {
    initiativeCountByKpiId.set(
      initiative.kpiId,
      (initiativeCountByKpiId.get(initiative.kpiId) ?? 0) + 1
    );
  });
  const kpis = rawKpis.map((kpi) => {
    const initiativeCount = initiativeCountByKpiId.get(kpi.id) ?? 0;
    const initiativeProgress =
      initiativeCount > 0
        ? Math.round((initiativeProgressByKpiId.get(kpi.id) ?? 0) / initiativeCount)
        : kpi.initiativeProgress;
    return {
      ...kpi,
      initiativeProgress,
    };
  });
  const provisionalGoals = structure.goals.map((goal) => {
    const goalKpis = kpis.filter((kpi) => kpi.goalId === goal.key);
    const score = Math.round(average(goalKpis.map((kpi) => kpi.weightedScore)));
    return {
      id: goal.key,
      perspectiveId: perspectiveKeyById.get(goal.perspectiveId) || "financial",
      title: goal.title,
      owner: goal.ownerName || "Unassigned",
      description: goal.description || "",
      linkedKpis: goalKpis.map((kpi) => kpi.id),
      initiativeCount: initiatives.filter((initiative) => initiative.goalId === goal.key).length,
      status: scoreToStatus(score),
    } satisfies WorkspaceGoal;
  });

  const visibleKpiIds = new Set<string>();
  const visibleGoalIds = new Set<string>();

  if (FIRM_WIDE_ROLES.has(params.role) || params.role === "finance" || params.role === "marketing") {
    kpis.forEach((kpi) => visibleKpiIds.add(kpi.id));
    provisionalGoals.forEach((goal) => visibleGoalIds.add(goal.id));
  } else {
    initiatives.forEach((initiative) => {
      visibleKpiIds.add(initiative.kpiId);
      visibleGoalIds.add(initiative.goalId);
    });
  }

  const peopleGoalKeys = new Set(
    provisionalGoals
      .filter((goal) => goal.perspectiveId === "people")
      .map((goal) => goal.id)
  );
  const provisionalPeopleKpiId =
    kpis.find((kpi) => kpi.perspectiveId === "people")?.id ||
    kpis.find((kpi) => peopleGoalKeys.has(kpi.goalId))?.id ||
    "";
  const provisionalPeopleInitiativeTitle =
    visibleInitiativesByRole.find(
      (initiative) =>
        initiative.perspectiveId === "people" &&
        ["hr", "manager", "employee"].includes(initiative.scopeRole)
    )?.title ||
    initiatives.find((initiative) => initiative.perspectiveId === "people")?.title ||
    "";

  const peopleKpiId = provisionalPeopleKpiId;
  const peopleInitiativeTitle = provisionalPeopleInitiativeTitle;
  const activityMap = buildEmployeeActivityMap(evaluationAssignments, learningAssignments);
  const employeeProfileIds = Array.from(
    new Set(
      [
        ...activityMap.keys(),
        ...latestScores.map((record) => record.employeeId),
        ...structure.initiatives
          .map((initiative) => initiative.ownerProfileId ?? null)
          .filter((value): value is number => Boolean(value)),
        params.profileId ?? null,
      ].filter((value): value is number => Boolean(value))
    )
  );
  const activeScorecardVersionId = await resolveActiveBalancedScorecardVersionId();
  const employeeProfiles = employeeProfileIds.length
    ? await prisma.profile.findMany({
        where: { id: { in: employeeProfileIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          roleId: true,
          department: { select: { name: true } },
          manager: { select: { firstName: true, lastName: true } },
        },
      })
    : [];
  const rawKpiAssignments =
    activeScorecardVersionId && employeeProfileIds.length
      ? await prisma.balancedScorecardKpiAssignment.findMany({
          where: {
            scorecardVersionId: activeScorecardVersionId,
            profileId: { in: employeeProfileIds },
            kpiId: { in: structure.kpis.map((record) => record.id) },
          },
          select: {
            id: true,
            profileId: true,
            kpiId: true,
            individualTarget: true,
            individualWeight: true,
            kpi: {
              select: {
                id: true,
                key: true,
                name: true,
                weight: true,
              },
            },
          },
        })
      : [];
  const roleIds = Array.from(
    new Set(
      employeeProfiles
        .map((profile) => profile.roleId)
        .filter((value): value is number => value !== null)
    )
  );
  const performanceBandRecords =
    roleIds.length || employeeProfiles.length
      ? await prisma.performanceBand.findMany({
          where: {
            OR: [{ roleId: null }, ...(roleIds.length ? [{ roleId: { in: roleIds } }] : [])],
          },
          orderBy: [{ roleId: "asc" }, { id: "asc" }],
        })
      : [];
  const performanceBandByRoleId = new Map<number | null, ScoreBandThresholds>();
  performanceBandRecords.forEach((record) => {
    const roleId = record.roleId ?? null;
    if (performanceBandByRoleId.has(roleId)) return;
    performanceBandByRoleId.set(roleId, {
      onTrackMin: numberValue(record.onTrackMin) || DEFAULT_SCORE_BAND.onTrackMin,
      atRiskMin: numberValue(record.atRiskMin) || DEFAULT_SCORE_BAND.atRiskMin,
    });
  });
  if (!performanceBandByRoleId.has(null)) {
    performanceBandByRoleId.set(null, DEFAULT_SCORE_BAND);
  }
  const employeeScoreViews = buildEmployeeScorecardViews({
    employeeProfiles,
    structure,
    rawAssignments: rawKpiAssignments,
    rawInitiatives: structure.initiatives,
    activityMap,
    latestScores,
    performanceBandByRoleId,
    perspectiveKeyById,
    goalById,
  });
  const scorecardLatestScores =
    employeeScoreViews.scoreRows.length > 0
      ? employeeScoreViews.scoreRows
      : latestScores.map((record) => ({ ...record, roleId: null }));

  const employeeContributions = buildEmployeeContributions(
    params.role,
    params.profileId ?? null,
    evaluationAssignments,
    learningAssignments,
    {
      peopleKpiId,
      peopleInitiativeTitle,
    }
  );
  const contributionProfileCandidates = Array.from(
    new Set([
      ...evaluationAssignments.map((assignment) => assignment.evaluatee.id),
      ...learningAssignments.map((assignment) => assignment.employee.id),
    ])
  );
  const resolvedContributionProfileId =
    params.profileId && contributionProfileCandidates.includes(params.profileId)
      ? params.profileId
      : contributionProfileCandidates[0] ?? params.profileId ?? null;
  const employeeKpiAssignments =
    resolvedContributionProfileId
      ? (employeeScoreViews.assignmentsByProfileId.get(resolvedContributionProfileId) ?? []).sort(
          (left, right) => right.individualWeight - left.individualWeight || left.kpiName.localeCompare(right.kpiName)
        )
      : [];

  if (resolvedContributionProfileId && employeeContributions.length > 0) {
    const contributionKeys = employeeContributions.map((item) => item.id);
    const contributionRecords = await prisma.balancedScorecardEmployeeContribution.findMany({
      where: {
        profileId: resolvedContributionProfileId,
        contributionKey: { in: contributionKeys },
      },
      select: {
        id: true,
        contributionKey: true,
        acknowledgedAt: true,
        latestProgress: true,
        latestComment: true,
        lastUpdatedAt: true,
      },
    });
    const recordByKey = new Map(contributionRecords.map((record) => [record.contributionKey, record]));
    const evidenceCounts = contributionRecords.length
      ? await prisma.document.findMany({
          where: {
            entityType: "BalancedScorecardContribution",
            entityId: { in: contributionRecords.map((record) => record.id) },
          },
          select: { entityId: true },
        })
      : [];
    const evidenceCountByRecordId = new Map<number, number>();
    evidenceCounts.forEach((document) => {
      if (!document.entityId) return;
      evidenceCountByRecordId.set(
        document.entityId,
        (evidenceCountByRecordId.get(document.entityId) || 0) + 1
      );
    });

    employeeContributions.forEach((item, index) => {
      const record = recordByKey.get(item.id);
      if (!record) return;
      const progress = record.latestProgress ?? item.progress;
      employeeContributions[index] = {
        ...item,
        acknowledged: item.acknowledged || Boolean(record.acknowledgedAt),
        progress,
        score: progress,
        status: scoreToStatus(progress),
        employeeComment: record.latestComment ?? null,
        lastUpdatedAt: record.lastUpdatedAt?.toISOString() ?? null,
        workflowRecordId: record.id,
        evidenceCount: evidenceCountByRecordId.get(record.id) || 0,
      };
    });
  }
  const peopleAssignment = employeeKpiAssignments.find((assignment) => assignment.kpiId === peopleKpiId);
  if (peopleAssignment) {
    employeeContributions.forEach((item, index) => {
      if (item.kpiId !== peopleKpiId) return;
      employeeContributions[index] = {
        ...item,
        progress: peopleAssignment.actualProgress,
        score: peopleAssignment.score,
        status: peopleAssignment.status,
        managerComment:
          peopleAssignment.individualTarget !== null
            ? `Individual target ${peopleAssignment.individualTarget}. Current progress ${peopleAssignment.actualProgress}%.`
            : item.managerComment,
        rollup: `${item.rollup} Weighted contribution ${peopleAssignment.individualWeight}%.`,
        individualTarget: peopleAssignment.individualTarget,
        individualWeight: peopleAssignment.individualWeight,
      };
    });
  }
  employeeContributions.forEach((item) => {
    if (item.kpiId) {
      visibleKpiIds.add(item.kpiId);
    }
  });

  const scopedKpis = kpis.filter((kpi) => visibleKpiIds.has(kpi.id));
  scopedKpis.forEach((kpi) => visibleGoalIds.add(kpi.goalId));
  const goals = provisionalGoals.filter((goal) => visibleGoalIds.has(goal.id));

  const perspectiveCards = structure.perspectives.map((perspective) => {
    const perspectiveId = perspective.key as PerspectiveKey;
    const perspectiveGoals = goals.filter((goal) => goal.perspectiveId === perspectiveId);
    const perspectiveKpis = scopedKpis.filter((kpi) => kpi.perspectiveId === perspectiveId);
    const perspectiveInitiatives = initiatives.filter((initiative) =>
      perspectiveGoals.some((goal) => goal.id === initiative.goalId)
    );
    const score = Math.round(average(perspectiveKpis.map((kpi) => kpi.weightedScore)));
    const cascadeProgress = Math.round(
      average(perspectiveInitiatives.map((initiative) => initiative.progress))
    );
    return {
      id: perspectiveId,
      name: perspective.name,
      owner: perspective.ownerName || "Unassigned",
      summary: perspective.summary || "",
      score,
      status: scoreToStatus(score),
      goals: perspectiveGoals.length,
      kpis: perspectiveKpis.length,
      initiatives: perspectiveInitiatives.length,
      cascadeProgress: Number.isFinite(cascadeProgress) ? cascadeProgress : 0,
    } satisfies WorkspacePerspectiveCard;
  });
  const employeeContributionProgress = Math.round(
    average(employeeContributions.map((item) => item.progress))
  );
  const chainRoot =
    visibleInitiativeRecords.find((initiative) => initiative.key === "cascade-growth-hr") ||
    visibleInitiativeRecords.find(
      (initiative) =>
        initiative.scopeRole === "hr" &&
        visibleInitiativeRecords.some((candidate) => candidate.parentInitiativeId === initiative.id)
    );
  const featuredChainRecords: typeof structure.initiatives = [];
  let currentChainNode = chainRoot || null;
  while (currentChainNode) {
    featuredChainRecords.push(currentChainNode);
    currentChainNode =
      visibleInitiativeRecords
        .filter((initiative) => initiative.parentInitiativeId === currentChainNode?.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0] || null;
  }
  const featuredCascade: WorkspaceCascadeLevel[] =
    featuredChainRecords.length > 0
      ? featuredChainRecords.map((record) => {
          const linkedKpiRecord = structure.kpis.find((item) => item.id === record.kpiId);
          const linkedKpi = linkedKpiRecord
            ? scopedKpis.find((item) => item.id === linkedKpiRecord.key)
            : undefined;
          const isEmployeeLayer = record.scopeRole === "employee";
          return {
            level:
              record.scopeRole === "gmp"
                ? "GMP"
                : record.scopeRole === "partner"
                  ? "Partner"
                  : record.scopeRole === "manager"
                    ? "Manager"
                    : record.scopeRole === "employee"
                      ? "Employee"
                      : "HR",
            owner: isEmployeeLayer
              ? employeeContributions[0]?.managerComment
                ? "Current assigned employee"
                : record.ownerName || "Employee layer"
              : record.ownerName || "Unassigned",
            initiative: isEmployeeLayer
              ? employeeContributions[0]?.initiative || record.title
              : record.title,
            target: isEmployeeLayer
              ? employeeContributions[0]?.rollup || "No downstream roll-up is linked yet."
              : linkedKpi
                ? `${linkedKpi.actual} actual against ${linkedKpi.firmTarget} target`
                : "No KPI target linked yet.",
            progress: isEmployeeLayer
              ? employeeContributionProgress || record.progress
              : record.progress || linkedKpi?.weightedScore || 0,
            dueDate: isEmployeeLayer
              ? employeeContributions[0]?.dueDate || formatDateLabel(record.dueDate)
              : formatDateLabel(record.dueDate),
            status: isEmployeeLayer
              ? scoreToStatus(employeeContributionProgress || record.progress)
              : (record.status as StatusTone),
            note:
              record.summary ||
              (isEmployeeLayer
                ? employeeContributions[0]?.managerComment ||
                  employeeContributions[0]?.rollup ||
                  "Employee contribution is linked to the active cascade."
                : [
                    linkedKpi ? `Tracking ${linkedKpi.name}.` : null,
                    record.ownerName ? `Owner: ${record.ownerName}.` : null,
                    record.dueDate ? `Due ${formatDateLabel(record.dueDate)}.` : null,
                  ]
                    .filter(Boolean)
                    .join(" ")),
          } satisfies WorkspaceCascadeLevel;
        })
      : [];
  const scopedFeaturedCascade = featuredCascade.filter((level) => {
    if (FIRM_WIDE_ROLES.has(params.role) || params.role === "finance" || params.role === "marketing") {
      return true;
    }
    if (params.role === "employee") {
      return level.level === "Employee";
    }
    if (params.role === "manager") {
      return level.level === "Manager" || level.level === "Employee";
    }
    if (params.role === "partner") {
      return ["Partner", "Manager", "Employee"].includes(level.level);
    }
    return true;
  });

  const evaluationSummary = buildEvaluationSummary(
    evaluationCycle,
    scorecardLatestScores,
    evaluationAssignments
  );
  const hasLiveScorecardRollup =
    goals.length > 0 &&
    scopedKpis.length > 0 &&
    (initiatives.length > 0 || scorecardLatestScores.length > 0);
  const departmentPerformance = hasLiveScorecardRollup
    ? buildDepartmentRows(scorecardLatestScores, evaluationAssignments, learningAssignments, params.role)
    : [];
  const managerPerformance = hasLiveScorecardRollup
    ? buildManagerRows(
        scorecardLatestScores,
        evaluationAssignments,
        learningAssignments,
        params.role,
        scopeContext
      )
    : [];
  const employeePerformance = hasLiveScorecardRollup
    ? buildEmployeePerformanceRows(
        scorecardLatestScores,
        evaluationAssignments,
        learningAssignments,
        params.role,
        scopeContext
      )
    : [];
  const reportBlocks: WorkspaceReportBlock[] = [
    {
      label: "Evaluation cycle",
      value:
        evaluationSummary.cycleTitle ||
        "No evaluation cycle selected",
      hint: evaluationSummary.cycleId
        ? `${evaluationSummary.completionPercent}% complete with ${evaluationSummary.pendingAssignments} reviews still open.`
        : "Pick a live evaluation cycle to join BSC and evaluation signals cleanly.",
    },
    {
      label: "Performance by department",
      value: `${departmentPerformance.length} departments`,
      hint: "Department roll-up now anchored to live evaluation scores and review readiness.",
    },
    {
      label: "Performance by manager",
      value: `${managerPerformance.length} managers`,
      hint: "Manager roll-up now uses evaluation-cycle employee scores rather than generic task flow.",
    },
    {
      label: "Initiative completion summary",
      value: `${initiatives.length} live workstreams`,
      hint: "Firm and cascade initiatives are shown alongside evaluation readiness and KPI movement.",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    effectiveRole: params.role,
    dataQuality: summarizeWorkspaceDataQuality(scopedKpis),
    perspectiveCards,
    goals,
    kpis: scopedKpis,
    initiatives,
    cascadeInitiatives: visibleInitiativesByRole,
    featuredCascade: scopedFeaturedCascade,
    employeeContributions,
    employeeKpiAssignments,
    evaluationSummary,
    reportBlocks,
    departmentPerformance,
    managerPerformance,
    employeePerformance,
  };
};

export async function getBalancedScorecardWorkspace(params: {
  role: WorkspaceRole;
  profileId?: number | null;
  /**
   * The profile ID of the user who is actually making the request.
   * Used for role-based data scoping. When omitted, defaults to firm-wide
   * access Ã¢â‚¬â€ callers must supply this for non-privileged roles.
   */
  requestingProfileId?: number | null;
  evaluationCycleId?: number | null;
}): Promise<BalancedScorecardWorkspace> {
  const cacheKey = buildWorkspaceCacheKey(params);
  return cacheService.getOrSet(
    cacheKey,
    () => buildBalancedScorecardWorkspace(params),
    WORKSPACE_CACHE_TTL_MS
  );
}
