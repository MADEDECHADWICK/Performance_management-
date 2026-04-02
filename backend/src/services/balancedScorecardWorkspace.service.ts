import prisma from "../prisma";
import { listBalancedScorecardStructure } from "./balancedScorecardStructure.service";

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
}

export interface WorkspaceInitiative {
  id: string;
  title: string;
  goalId: string;
  kpiId: string;
  perspectiveId: PerspectiveKey;
  owner: string;
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
  perspectiveCards: WorkspacePerspectiveCard[];
  goals: WorkspaceGoal[];
  kpis: WorkspaceKpi[];
  initiatives: WorkspaceInitiative[];
  cascadeInitiatives: WorkspaceInitiative[];
  featuredCascade: WorkspaceCascadeLevel[];
  employeeContributions: WorkspaceEmployeeContribution[];
  evaluationSummary: WorkspaceEvaluationSummary;
  reportBlocks: WorkspaceReportBlock[];
  departmentPerformance: WorkspaceDepartmentRow[];
  managerPerformance: WorkspaceManagerRow[];
  employeePerformance: WorkspaceEmployeeRow[];
}

type MetricToneDirection = "higher_better" | "lower_better";

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
  compute: (ctx: WorkspaceComputationContext) => {
    actualValue: number;
    actualLabel: string;
    trend: number[];
    ownerUpdate: string;
  };
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const ratioPercent = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;
const formatPercent = (value: number, decimals = 1) =>
  `${Number.isInteger(value) ? value : Number(value.toFixed(decimals))}%`;
const formatDays = (value: number) => `${Math.round(value)} days`;
const scoreToStatus = (score: number): StatusTone =>
  score >= 85 ? "on_track" : score >= 65 ? "at_risk" : "off_track";
const achievementToScore = (
  actualValue: number,
  targetValue: number,
  direction: MetricToneDirection
) => {
  if (targetValue <= 0) return 0;
  if (direction === "higher_better") return clamp((actualValue / targetValue) * 100, 0, 100);
  if (actualValue <= 0) return 100;
  return clamp((targetValue / actualValue) * 100, 0, 100);
};
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
const monthBuckets = (months = 6) => {
  const currentStart = new Date();
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
  end: Date
) => {
  const scoped = invoices.filter((invoice) => {
    const anchor = invoice.issuedAt ?? invoice.createdAt;
    return anchor >= start && anchor <= end;
  });
  if (scoped.length === 0) return 0;
  return average(
    scoped.map((invoice) => {
      const anchor = invoice.issuedAt ?? invoice.createdAt;
      const closeDate = invoice.paidAt ?? new Date();
      return Math.max(0, closeDate.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24);
    })
  );
};

const clientRetentionRate = (
  jobs: WorkspaceComputationContext["jobs"],
  start: Date,
  end: Date
) => {
  const scoped = jobs.filter(
    (job) => job.clientId && job.createdAt >= start && job.createdAt <= end
  );
  const byClient = new Map<number, number>();
  scoped.forEach((job) => {
    if (!job.clientId) return;
    byClient.set(job.clientId, (byClient.get(job.clientId) || 0) + 1);
  });
  return ratioPercent(
    Array.from(byClient.values()).filter((count) => count > 1).length,
    byClient.size
  );
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
      const monthRecords = ctx.projections.filter(
        (record) =>
          record.monthYear >= ctx.currentMonthBucket.start &&
          record.monthYear <= ctx.currentMonthBucket.end
      );
      const projected = monthRecords.reduce((sum, record) => sum + numberValue(record.projectedAmount), 0);
      const projectionActual = monthRecords.reduce((sum, record) => sum + numberValue(record.actualCollected), 0);
      const paymentActual = ctx.payments
        .filter(
          (payment) =>
            payment.paymentDate >= ctx.currentMonthBucket.start &&
            payment.paymentDate <= ctx.currentMonthBucket.end
        )
        .reduce((sum, payment) => sum + numberValue(payment.paymentAmount), 0);
      const actual = ratioPercent(projectionActual > 0 ? projectionActual : paymentActual, projected);
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) => {
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
      const scoped = ctx.invoices.filter((invoice) => invoice.createdAt >= ctx.monthBuckets[0].start);
      const total = scoped.reduce((sum, invoice) => sum + numberValue(invoice.totalAmount), 0);
      const paid = scoped.reduce((sum, invoice) => sum + numberValue(invoice.amountPaid), 0);
      const outstanding = scoped.reduce((sum, invoice) => sum + numberValue(invoice.amountOutstanding), 0);
      const actual = ratioPercent(paid, total);
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) => {
          const monthInvoices = ctx.invoices.filter(
            (invoice) => invoice.createdAt >= bucket.start && invoice.createdAt <= bucket.end
          );
          return ratioPercent(
            monthInvoices.reduce((sum, invoice) => sum + numberValue(invoice.amountPaid), 0),
            monthInvoices.reduce((sum, invoice) => sum + numberValue(invoice.totalAmount), 0)
          );
        }),
        ownerUpdate: `${formatPercent(actual)} recovered across issued invoices, with KES ${Math.round(outstanding).toLocaleString()} still outstanding.`,
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
      const actual = averageCollectionDays(ctx.invoices, ctx.monthBuckets[0].start, ctx.currentMonthBucket.end);
      const overdueInvoices = ctx.invoices.filter((invoice) => invoice.status === "overdue").length;
      return {
        actualValue: actual,
        actualLabel: formatDays(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          achievementToScore(averageCollectionDays(ctx.invoices, bucket.start, bucket.end), 42, "lower_better")
        ),
        ownerUpdate: `${Math.round(actual)} day cycle with ${overdueInvoices} overdue invoices still sitting in the receivables queue.`,
      };
    },
  },
  {
    id: "kpi-4",
    name: "Strategic client retention",
    perspectiveId: "customer",
    goalId: "goal-3",
    description: "Measures repeat client activity as a proxy for retention depth across live work.",
    formula: "Clients with multiple live jobs / clients with at least one job in the period",
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
      const actual = clientRetentionRate(ctx.jobs, ctx.monthBuckets[0].start, ctx.currentMonthBucket.end);
      const uniqueClients = new Set(ctx.jobs.filter((job) => job.clientId).map((job) => job.clientId)).size;
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          clientRetentionRate(ctx.jobs, bucket.start, bucket.end)
        ),
        ownerUpdate: `${formatPercent(actual)} repeat-client activity across ${uniqueClients} active client relationships in the current window.`,
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
      const scoped = ctx.proposals.filter(
        (proposal) =>
          proposal.proposalDate >= ctx.monthBuckets[0].start &&
          proposal.proposalDate <= ctx.currentMonthBucket.end
      );
      const actual = proposalWinRate(ctx.proposals, ctx.monthBuckets[0].start, ctx.currentMonthBucket.end);
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          proposalWinRate(ctx.proposals, bucket.start, bucket.end)
        ),
        ownerUpdate: `${scoped.filter((proposal) => proposal.status === "won").length} wins from ${scoped.length} proposals in the live pipeline window.`,
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
      const scoped = ctx.surveys.filter(
        (survey) =>
          (survey.completedAt ?? survey.createdAt) >= ctx.monthBuckets[0].start &&
          (survey.completedAt ?? survey.createdAt) <= ctx.currentMonthBucket.end &&
          typeof survey.overallSatisfaction === "number"
      );
      const actual = surveyScore(ctx.surveys, ctx.monthBuckets[0].start, ctx.currentMonthBucket.end);
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) => surveyScore(ctx.surveys, bucket.start, bucket.end)),
        ownerUpdate: `${scoped.length} completed surveys with ${scoped.filter((survey) => survey.wouldRecommend === true).length} positive recommendation signals in the current period.`,
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
      const overdueJobs = ctx.jobs.filter(
        (job) =>
          job.status !== "completed" &&
          job.status !== "cancelled" &&
          job.dueDate &&
          job.dueDate < new Date()
      ).length;
      const actual = onTimeJobRate(ctx.jobs, ctx.monthBuckets[0].start, ctx.currentMonthBucket.end);
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          onTimeJobRate(ctx.jobs, bucket.start, bucket.end)
        ),
        ownerUpdate: `${formatPercent(actual)} on-time completion across recent jobs, with ${overdueJobs} open jobs currently past due.`,
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
      const actual = reviewQualityRate(
        ctx.projectEvaluations,
        ctx.monthBuckets[0].start,
        ctx.currentMonthBucket.end
      );
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          reviewQualityRate(ctx.projectEvaluations, bucket.start, bucket.end)
        ),
        ownerUpdate: `${ctx.projectEvaluations.length} submitted project evaluations are feeding the current quality score.`,
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
      const actual = evaluationCompletionRate(
        ctx.evaluationAssignments,
        ctx.monthBuckets[0].start,
        ctx.currentMonthBucket.end
      );
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          evaluationCompletionRate(ctx.evaluationAssignments, bucket.start, bucket.end)
        ),
        ownerUpdate: `${formatPercent(actual)} completion with ${ctx.evaluationAssignments.filter((assignment) => assignment.status !== "submitted").length} assignments still open or in progress.`,
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
      const actual = readinessCompletionRate(
        ctx.learningAssignments,
        ctx.onboardingCases,
        ctx.monthBuckets[0].start,
        ctx.currentMonthBucket.end
      );
      return {
        actualValue: actual,
        actualLabel: formatPercent(actual),
        trend: buildMonthlyTrend(ctx.monthBuckets, (bucket) =>
          readinessCompletionRate(
            ctx.learningAssignments,
            ctx.onboardingCases,
            bucket.start,
            bucket.end
          )
        ),
        ownerUpdate: `${formatPercent(actual)} readiness, with ${ctx.learningAssignments.filter((assignment) => assignment.status === "overdue").length} overdue learning assignments and ${ctx.onboardingCases.filter((record) => record.status !== "completed").length} onboarding cases still open.`,
      };
    },
  },
];

const kpiCatalogByMetricKey = new Map(kpiCatalog.map((item) => [item.id, item]));

const buildLatestScores = async (evaluationCycleId?: number | null) => {
  const rawScores = await prisma.performanceScore.findMany({
    where: evaluationCycleId ? { evaluationCycleId } : undefined,
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
  learningAssignments: WorkspaceComputationContext["learningAssignments"]
): WorkspaceEmployeeRow[] => {
  const activityMap = buildEmployeeActivityMap(assignments, learningAssignments);
  const latestByEmployee = new Map(latestScores.map((record) => [record.employeeId, record]));
  const employeeIds = Array.from(
    new Set([...latestScores.map((record) => record.employeeId), ...activityMap.keys()])
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
  learningAssignments: WorkspaceComputationContext["learningAssignments"]
): WorkspaceDepartmentRow[] => {
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
  learningAssignments: WorkspaceComputationContext["learningAssignments"]
): WorkspaceManagerRow[] => {
  const activityMap = buildEmployeeActivityMap(assignments, learningAssignments);
  if (latestScores.length > 0) {
    const grouped = new Map<string, number[]>();
    latestScores.forEach((record) => {
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
  activityMap.forEach((activity) => {
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
    contributionItems.push({
      id: `evaluation-${resolvedProfileId}`,
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
    });
  }

  const learningItems = learningItemsForEmployee
    .slice(0, Math.max(0, 3 - contributionItems.length))
    .map<WorkspaceEmployeeContribution>((assignment) => {
      const progress = Math.round(numberValue(assignment.progressPercent));
      return {
        id: `learning-${assignment.id}`,
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
      };
    });

  return [...contributionItems, ...learningItems].slice(0, 3);
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

export async function getBalancedScorecardWorkspace(params: {
  role: WorkspaceRole;
  profileId?: number | null;
  evaluationCycleId?: number | null;
}): Promise<BalancedScorecardWorkspace> {
  const buckets = monthBuckets(6);
  const currentMonthBucket = buckets[buckets.length - 1];
  const evaluationCycle = await resolveWorkspaceEvaluationCycle(
    params.evaluationCycleId ?? null
  );
  const effectiveEvaluationCycleId = evaluationCycle?.id ?? null;

  const [
    structure,
    payments,
    projections,
    invoices,
    surveys,
    proposals,
    jobs,
    projectEvaluations,
    evaluationAssignments,
    learningAssignments,
    onboardingCases,
    tasks,
    latestScores,
  ] = await Promise.all([
    listBalancedScorecardStructure(),
    prisma.clientPayment.findMany({
      where: { paymentDate: { gte: buckets[0].start } },
      select: { paymentAmount: true, paymentDate: true },
    }),
    prisma.revenueProjection.findMany({
      where: { monthYear: { gte: buckets[0].start } },
      select: { projectedAmount: true, actualCollected: true, monthYear: true },
    }),
    prisma.jobInvoice.findMany({
      where: { createdAt: { gte: buckets[0].start } },
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
      where: { OR: [{ createdAt: { gte: buckets[0].start } }, { completedAt: { gte: buckets[0].start } }] },
      select: { overallSatisfaction: true, wouldRecommend: true, completedAt: true, createdAt: true },
    }),
    prisma.proposal.findMany({
      where: { proposalDate: { gte: buckets[0].start } },
      select: { status: true, proposalDate: true, wonAt: true },
    }),
    prisma.job.findMany({
      where: { OR: [{ createdAt: { gte: buckets[0].start } }, { completionDate: { gte: buckets[0].start } }, { dueDate: { gte: buckets[0].start } }] },
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
      where: { createdAt: { gte: buckets[0].start }, status: "submitted" },
      select: { overallScore: true, submittedAt: true, createdAt: true },
    }),
    prisma.evaluationAssignment.findMany({
      where: effectiveEvaluationCycleId
        ? { cycleId: effectiveEvaluationCycleId }
        : { createdAt: { gte: buckets[0].start } },
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
      where: { createdAt: { gte: buckets[0].start } },
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
      select: {
        status: true,
        startDate: true,
        dueDate: true,
        createdAt: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.task.findMany({
      where: { OR: [{ createdAt: { gte: buckets[0].start } }, { dueDate: { gte: buckets[0].start } }] },
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
    buildLatestScores(effectiveEvaluationCycleId),
  ]);

  const ctx: WorkspaceComputationContext = {
    payments,
    projections,
    invoices,
    surveys,
    proposals,
    jobs,
    projectEvaluations,
    evaluationAssignments,
    learningAssignments,
    onboardingCases,
    tasks,
    latestScores,
    monthBuckets: buckets,
    currentMonthBucket,
  };

  const perspectiveKeyById = new Map(
    structure.perspectives.map((perspective) => [perspective.id, perspective.key as PerspectiveKey])
  );
  const goalById = new Map(structure.goals.map((goal) => [goal.id, goal]));
  const rawKpis = structure.kpis.map((record) => {
    const goal = goalById.get(record.goalId);
    const perspectiveId = goal ? perspectiveKeyById.get(goal.perspectiveId) : undefined;
    const catalogKpi = kpiCatalogByMetricKey.get(record.metricKey);
    const computed = catalogKpi
      ? catalogKpi.compute(ctx)
      : {
          actualValue: 0,
          actualLabel: "No live metric",
          trend: [0, 0, 0, 0, 0, 0],
          ownerUpdate: "This KPI is stored in the scorecard structure but is not yet mapped to a live metric template.",
        };
    const weightedScore = Math.round(
      catalogKpi
        ? achievementToScore(computed.actualValue, catalogKpi.targetValue, catalogKpi.direction)
        : 0
    );
    return {
      id: record.key,
      name: record.name,
      perspectiveId: perspectiveId || "financial",
      goalId: goal?.key || `goal-${record.goalId}`,
      description: record.description || catalogKpi?.description || "",
      formula: record.formula || catalogKpi?.formula || "",
      frequency: record.frequency,
      unit: record.unit,
      weight: record.weight,
      firmTarget: record.firmTarget,
      actual: computed.actualLabel,
      weightedScore,
      owner: record.ownerName || catalogKpi?.owner || "Unassigned",
      status: scoreToStatus(weightedScore),
      statusLogic: record.statusLogic || catalogKpi?.statusLogic || "Live status logic not yet set.",
      updateFrequency: record.updateFrequency || catalogKpi?.updateFrequency || record.frequency,
      initiativeProgress: weightedScore,
      trend: computed.trend,
      ownerUpdate: computed.ownerUpdate,
    } satisfies WorkspaceKpi;
  });

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
    const summaryByInitiative: Record<string, string> = {
      "init-1": `${jobs.length} live jobs and ${proposals.filter((proposal) => proposal.status === "won").length} wins are feeding the growth chain behind the firm revenue goal.`,
      "init-2": `${overdueInvoices} overdue invoices still need active collection follow-through.`,
      "init-3": `${surveys.filter((survey) => survey.completedAt).length} client feedback signals and ${proposals.filter((proposal) => proposal.status === "sent").length} open proposals are feeding sponsor review decisions.`,
      "init-4": `${overdueJobs} overdue jobs and ${tasks.filter((task) => task.status === "blocked").length} blocked tasks are driving the delivery control board.`,
      "init-5": `${evaluationAssignments.filter((assignment) => assignment.status !== "submitted").length} review assignments and ${learningAssignments.filter((assignment) => assignment.status !== "completed").length} learning actions remain open in the people layer.`,
    };
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
        summaryByInitiative[record.key] ||
        "Live execution signals are feeding this workstream.",
    } satisfies WorkspaceInitiative;
  });
  const topLevelInitiativeRecords = structure.initiatives.filter(
    (initiative) => !initiative.parentInitiativeId && !initiative.key.startsWith("cascade-")
  );
  const initiatives = allInitiatives.filter((initiative) =>
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

  const goals = structure.goals.map((goal) => {
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

  const perspectiveCards = structure.perspectives.map((perspective) => {
    const perspectiveId = perspective.key as PerspectiveKey;
    const perspectiveGoals = goals.filter((goal) => goal.perspectiveId === perspectiveId);
    const perspectiveKpis = kpis.filter((kpi) => kpi.perspectiveId === perspectiveId);
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

  const peopleGoalKeys = new Set(
    goals
      .filter((goal) => goal.perspectiveId === "people")
      .map((goal) => goal.id)
  );
  const peopleKpiId =
    kpis.find((kpi) => kpi.perspectiveId === "people")?.id ||
    kpis.find((kpi) => peopleGoalKeys.has(kpi.goalId))?.id ||
    kpis[0]?.id ||
    "unmapped-kpi";
  const peopleInitiativeTitle =
    allInitiatives.find(
      (initiative) =>
        initiative.perspectiveId === "people" &&
        ["hr", "manager", "employee"].includes(initiative.scopeRole)
    )?.title ||
    initiatives.find((initiative) => initiative.perspectiveId === "people")?.title ||
    "People and evaluation readiness";

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
  const employeeContributionProgress = Math.round(
    average(employeeContributions.map((item) => item.progress))
  );
  const chainRoot =
    structure.initiatives.find((initiative) => initiative.key === "cascade-growth-hr") ||
    structure.initiatives.find(
      (initiative) =>
        initiative.scopeRole === "hr" &&
        structure.initiatives.some((candidate) => candidate.parentInitiativeId === initiative.id)
    );
  const featuredChainRecords: typeof structure.initiatives = [];
  let currentChainNode = chainRoot || null;
  while (currentChainNode) {
    featuredChainRecords.push(currentChainNode);
    currentChainNode =
      structure.initiatives
        .filter((initiative) => initiative.parentInitiativeId === currentChainNode?.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0] || null;
  }
  const noteByScopeRole: Record<string, string> = {
    hr: "HR anchors the strategic goal, KPI contract, and the parent initiative that the rest of the chain inherits.",
    gmp: "GMP keeps the same KPI aligned while focusing on sponsorship quality and executive intervention.",
    partner: "Partner initiatives stay aligned to the same KPI but become portfolio and account specific.",
    manager: "Managers convert the shared KPI chain into team deliverables, follow-up, and delivery controls.",
    employee: "Employees own specific actions and updates, not the whole scorecard structure.",
  };
  const featuredCascade: WorkspaceCascadeLevel[] =
    featuredChainRecords.length > 0
      ? featuredChainRecords.map((record) => {
          const linkedKpiRecord = structure.kpis.find((item) => item.id === record.kpiId);
          const linkedKpi = linkedKpiRecord
            ? kpis.find((item) => item.id === linkedKpiRecord.key)
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
              ? employeeContributions[0]?.rollup || "Employee contribution flowing into the manager and partner chain."
              : linkedKpi
                ? `${linkedKpi.actual} actual against ${linkedKpi.firmTarget} target`
                : "Live KPI target",
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
              noteByScopeRole[record.scopeRole] ||
              "This initiative layer contributes to the same strategic KPI from a more specific operating context.",
          } satisfies WorkspaceCascadeLevel;
        })
      : [];

  const evaluationSummary = buildEvaluationSummary(
    evaluationCycle,
    latestScores,
    evaluationAssignments
  );
  const departmentPerformance = buildDepartmentRows(
    latestScores,
    evaluationAssignments,
    learningAssignments
  );
  const managerPerformance = buildManagerRows(
    latestScores,
    evaluationAssignments,
    learningAssignments
  );
  const employeePerformance = buildEmployeePerformanceRows(
    latestScores,
    evaluationAssignments,
    learningAssignments
  );
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
    perspectiveCards,
    goals,
    kpis,
    initiatives,
    cascadeInitiatives: allInitiatives,
    featuredCascade,
    employeeContributions,
    evaluationSummary,
    reportBlocks,
    departmentPerformance,
    managerPerformance,
    employeePerformance,
  };
}
