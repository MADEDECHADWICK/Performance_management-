import prisma from "../prisma";
import {
  getBalancedScorecardWorkspace,
  type BalancedScorecardWorkspace,
  type StatusTone,
  type WorkspaceRole,
} from "./balancedScorecardWorkspace.service";
import { resolveDashboardModuleForContext } from "./performanceFramework.service";

type ReportTab =
  | "summary"
  | "client_summary"
  | "job_reports"
  | "timesheets"
  | "productivity"
  | "bsc_tracking";

type MetricTone = "neutral" | "positive" | "warning" | "danger";

export interface ReportingMetricCard {
  label: string;
  value: string;
  hint: string;
  tone: MetricTone;
}

export interface ReportingScopeSummary {
  title: string;
  description: string;
  roleLabel: string;
}

export interface ClientSummaryRow {
  clientId: number;
  clientName: string;
  jobs: number;
  budgetFee: number;
  billableAmount: number;
  nonBillableHours: number;
  nonBillableCost: number;
  amountCollected: number;
  remainingBalance: number;
  profit: number;
  loss: number;
  status: StatusTone;
}

export interface JobReportRow {
  jobId: number;
  job: string;
  jobCode: string | null;
  client: string;
  department: string;
  manager: string;
  partner: string;
  status: string;
  budgetFee: number;
  billableAmount: number;
  billableHours: number;
  nonBillableHours: number;
  amountCollected: number;
  remainingBalance: number;
  profit: number;
  loss: number;
  utilizationPercent: number;
  collectionStage: string;
}

export interface TimesheetRow {
  employeeId: number;
  employeeName: string;
  department: string;
  manager: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  billableAmount: number;
  approvalCount: number;
  utilizationPercent: number;
  lastWorkedAt: string | null;
}

export interface ProductivityRow {
  jobId: number;
  job: string;
  client: string;
  employeeName: string;
  category: string;
  staff: string;
  budgetFee: number;
  billableHours: number;
  nonBillableHours: number;
  billableAmount: number;
  amountCollected: number;
  remainingBalance: number;
  profit: number;
  loss: number;
}

export interface ReportsSpecializedCard {
  title: string;
  description: string;
  path: string;
  metric: string;
  metricHint: string;
}

export interface ReportsSpecializedSurface {
  title: string;
  description: string;
  cards: ReportsSpecializedCard[];
}

export interface BscTrackingSlice {
  workspaceRole: WorkspaceRole;
  dataQuality: BalancedScorecardWorkspace["dataQuality"];
  perspectiveCards: BalancedScorecardWorkspace["perspectiveCards"];
  topKpis: BalancedScorecardWorkspace["kpis"];
  initiatives: BalancedScorecardWorkspace["cascadeInitiatives"];
  employeeContributions: BalancedScorecardWorkspace["employeeContributions"];
  evaluationSummary: BalancedScorecardWorkspace["evaluationSummary"];
}

export interface ReportingWorkspace {
  generatedAt: string;
  effectiveRole: WorkspaceRole;
  visibleTabs: ReportTab[];
  scope: ReportingScopeSummary;
  cards: ReportingMetricCard[];
  clientSummary: {
    rows: ClientSummaryRow[];
  };
  jobReports: {
    rows: JobReportRow[];
  };
  timesheets: {
    rows: TimesheetRow[];
  };
  productivity: {
    rows: ProductivityRow[];
  };
  bscTracking: BscTrackingSlice;
  specializedSurface: ReportsSpecializedSurface | null;
}

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) => Number(value.toFixed(2));

const formatCurrency = (value: number) => `KES ${Math.round(value).toLocaleString("en-KE")}`;

const formatHours = (value: number) => `${round2(value).toFixed(1)}h`;

const formatPercent = (value: number) => `${round2(value).toFixed(1)}%`;

const formatDate = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10) : null;

const fullName = (input: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  [input?.firstName, input?.lastName].filter(Boolean).join(" ").trim() || "Unassigned";

const getToneByStatus = (status: StatusTone): MetricTone => {
  if (status === "on_track") return "positive";
  if (status === "off_track") return "danger";
  return "warning";
};

const scoreToStatus = (score: number): StatusTone => {
  if (score >= 80) return "on_track";
  if (score >= 55) return "at_risk";
  return "off_track";
};

const sum = (values: number[]) => round2(values.reduce((acc, value) => acc + value, 0));

const average = (values: number[]) =>
  values.length > 0 ? round2(values.reduce((acc, value) => acc + value, 0) / values.length) : 0;

const resolveJobFee = (job: {
  billingType: string;
  fixedFeeAmount: unknown;
  jobCosting?: { jobFee: unknown } | null;
}) => {
  const costingFee = numberValue(job.jobCosting?.jobFee);
  if (costingFee > 0) return costingFee;
  if (job.billingType === "fixed_fee") return numberValue(job.fixedFeeAmount);
  return 0;
};

const getRoleLabel = (role: WorkspaceRole) => {
  if (role === "hr") return "HR";
  if (role === "gmp") return "GMP";
  if (role === "partner") return "Partner";
  if (role === "manager") return "Manager";
  if (role === "finance") return "Finance";
  if (role === "marketing") return "Marketing";
  return "Employee";
};

const getScopeSummary = (role: WorkspaceRole): ReportingScopeSummary => {
  if (role === "hr") {
    return {
      title: "Firm reporting snapshot",
      description: "Firm-wide client, job, timesheet, productivity, and BSC progress for governance review.",
      roleLabel: "HR / Admin",
    };
  }
  if (role === "gmp") {
    return {
      title: "Executive reporting snapshot",
      description: "Executive view across firm delivery, collections, utilization, and scorecard movement.",
      roleLabel: "GMP",
    };
  }
  if (role === "partner") {
    return {
      title: "Portfolio reporting snapshot",
      description: "Portfolio-level client, job, timesheet, productivity, and KPI movement in your scope.",
      roleLabel: "Partner",
    };
  }
  if (role === "manager") {
    return {
      title: "Team reporting snapshot",
      description: "Manager view of delivery, team hours, productivity, and role-scoped BSC contribution.",
      roleLabel: "Manager",
    };
  }
  if (role === "finance") {
    return {
      title: "Finance reporting workspace",
      description: "Finance stays focused on collections, projections, balances, profitability, and financial KPI signals.",
      roleLabel: "Finance",
    };
  }
  if (role === "marketing") {
    return {
      title: "Growth reporting workspace",
      description: "Marketing stays focused on pipeline, client growth, surveys, and customer-facing KPI signals.",
      roleLabel: "Marketing",
    };
  }
  return {
    title: "My reporting snapshot",
    description: "Personal view of my jobs, time mix, productivity, and individual BSC/evaluation contribution.",
    roleLabel: "Employee",
  };
};

const getVisibleTabs = (role: WorkspaceRole): ReportTab[] => {
  if (role === "finance" || role === "marketing") {
    return ["summary", "bsc_tracking"];
  }
  return ["client_summary", "job_reports", "timesheets", "productivity", "bsc_tracking"];
};

const buildDateRangeFilter = (dateFrom?: Date, dateTo?: Date) => {
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom ? { gte: dateFrom } : {}),
    ...(dateTo ? { lte: dateTo } : {}),
  };
};

export async function getReportingWorkspace(params: {
  roles: string[];
  profileId?: number | null;
  evaluationCycleId?: number;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<ReportingWorkspace> {
  const profile =
    params.profileId != null
      ? await prisma.profile.findUnique({
          where: { id: params.profileId },
          select: {
            id: true,
            positionTitle: true,
            departmentId: true,
          },
        })
      : null;

  const effectiveRole = resolveDashboardModuleForContext({
    roles: params.roles,
    positionTitle: profile?.positionTitle ?? null,
  }) as WorkspaceRole;

  const scopedJobWhere =
    effectiveRole === "partner" && params.profileId
      ? { partnerProfileId: params.profileId }
      : effectiveRole === "manager" && params.profileId
        ? { managerProfileId: params.profileId }
        : effectiveRole === "employee" && params.profileId
          ? {
              OR: [
                { staffing: { some: { employeeProfileId: params.profileId } } },
                { timeEntries: { some: { employeeProfileId: params.profileId } } },
              ],
            }
          : {};

  const jobs = await prisma.job.findMany({
    where: scopedJobWhere,
    select: {
      id: true,
      jobName: true,
      jobCode: true,
      billingType: true,
      fixedFeeAmount: true,
      status: true,
      collectionStage: true,
      clientId: true,
      client: { select: { id: true, clientName: true } },
      department: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true } },
      partner: { select: { firstName: true, lastName: true } },
      jobCosting: { select: { jobFee: true } },
      staffing: {
        select: {
          employeeProfileId: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  const jobIds = jobs.map((job) => job.id);
  const clientIds = Array.from(new Set(jobs.map((job) => job.clientId).filter((value): value is number => value != null)));
  const activityDateRange = buildDateRangeFilter(params.dateFrom, params.dateTo);

  const [timeEntries, payments, invoices, proposals, surveys, bscWorkspace] = await Promise.all([
    jobIds.length > 0
      ? prisma.timeEntry.findMany({
          where: {
            jobId: { in: jobIds },
            status: "approved",
            ...(activityDateRange ? { dateWorked: activityDateRange } : {}),
          },
          select: {
            id: true,
            jobId: true,
            employeeProfileId: true,
            hours: true,
            billable: true,
            billableAmount: true,
            costAmount: true,
            profitLoss: true,
            dateWorked: true,
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                positionTitle: true,
                department: { select: { name: true } },
                manager: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: [{ dateWorked: "desc" }, { id: "desc" }],
        })
      : Promise.resolve([]),
    clientIds.length > 0
      ? prisma.clientPayment.findMany({
          where: {
            ...(effectiveRole === "hr" || effectiveRole === "gmp" || effectiveRole === "finance" || effectiveRole === "marketing"
              ? {
                  OR: [
                    { jobId: { in: jobIds } },
                    { jobId: null, clientId: { in: clientIds } },
                  ],
                }
              : {
                  jobId: { in: jobIds },
                }),
            ...(activityDateRange ? { paymentDate: activityDateRange } : {}),
          },
          select: {
            id: true,
            clientId: true,
            jobId: true,
            paymentAmount: true,
            paymentDate: true,
          },
        })
      : Promise.resolve([]),
    jobIds.length > 0
      ? prisma.jobInvoice.findMany({
          where: {
            jobId: { in: jobIds },
            status: { not: "void" },
          },
          select: {
            id: true,
            jobId: true,
            clientId: true,
            amountOutstanding: true,
            totalAmount: true,
            amountPaid: true,
          },
        })
      : Promise.resolve([]),
    effectiveRole === "marketing"
      ? prisma.proposal.findMany({
          where: {
            ...(activityDateRange ? { proposalDate: activityDateRange } : {}),
          },
          select: {
            id: true,
            status: true,
            proposedFee: true,
            wonAt: true,
          },
        })
      : Promise.resolve([]),
    effectiveRole === "marketing"
      ? prisma.clientSatisfactionSurvey.findMany({
          where: {
            ...(activityDateRange
              ? {
                  OR: [
                    { completedAt: activityDateRange },
                    { createdAt: activityDateRange },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            overallSatisfaction: true,
            completedAt: true,
          },
        })
      : Promise.resolve([]),
    getBalancedScorecardWorkspace({
      role: effectiveRole,
      profileId: params.profileId ?? undefined,
      evaluationCycleId: params.evaluationCycleId,
    }),
  ]);

  const jobReportRows = jobs.map((job) => {
    const jobTimeEntries = timeEntries.filter((entry) => entry.jobId === job.id);
    const jobPayments = payments.filter((payment) => payment.jobId === job.id);
    const jobInvoices = invoices.filter((invoice) => invoice.jobId === job.id);
    const budgetFee = resolveJobFee(job);
    const billableHours = sum(jobTimeEntries.filter((entry) => entry.billable).map((entry) => numberValue(entry.hours)));
    const nonBillableHours = sum(jobTimeEntries.filter((entry) => !entry.billable).map((entry) => numberValue(entry.hours)));
    const totalHours = round2(billableHours + nonBillableHours);
    const billableAmount = sum(jobTimeEntries.map((entry) => numberValue(entry.billableAmount)));
    const costAmount = sum(jobTimeEntries.map((entry) => numberValue(entry.costAmount)));
    const amountCollected = sum(jobPayments.map((payment) => numberValue(payment.paymentAmount)));
    const invoiceOutstanding = sum(jobInvoices.map((invoice) => numberValue(invoice.amountOutstanding)));
    const expectedBase = budgetFee > 0 ? budgetFee : billableAmount;
    const remainingBalance = round2(
      invoiceOutstanding > 0 ? invoiceOutstanding : Math.max(0, expectedBase - amountCollected)
    );
    const rawProfitLoss = round2(billableAmount - costAmount);
    return {
      jobId: job.id,
      job: job.jobName,
      jobCode: job.jobCode,
      client: job.client?.clientName || "Unassigned client",
      department: job.department?.name || "Unassigned",
      manager: fullName(job.manager),
      partner: fullName(job.partner),
      status: job.status.replace(/_/g, " "),
      budgetFee,
      billableAmount,
      billableHours,
      nonBillableHours,
      amountCollected,
      remainingBalance,
      profit: rawProfitLoss > 0 ? rawProfitLoss : 0,
      loss: rawProfitLoss < 0 ? Math.abs(rawProfitLoss) : 0,
      utilizationPercent: totalHours > 0 ? round2((billableHours / totalHours) * 100) : 0,
      collectionStage: job.collectionStage.replace(/_/g, " "),
    } satisfies JobReportRow;
  });

  const clientSummaryMap = jobReportRows.reduce((acc, row) => {
      const clientKey = row.client;
      const existing = acc.get(clientKey) || {
        clientId: jobs.find((job) => (job.client?.clientName || "Unassigned client") === clientKey)?.clientId || 0,
        clientName: clientKey,
        jobs: 0,
        budgetFee: 0,
        billableAmount: 0,
        nonBillableHours: 0,
        nonBillableCost: 0,
        amountCollected: 0,
        remainingBalance: 0,
        profit: 0,
        loss: 0,
        status: "on_track" as StatusTone,
      };
      const jobTimeEntries = timeEntries.filter((entry) => entry.jobId === row.jobId && !entry.billable);
      const nonBillableCost = sum(jobTimeEntries.map((entry) => numberValue(entry.costAmount)));
      existing.jobs += 1;
      existing.budgetFee = round2(existing.budgetFee + row.budgetFee);
      existing.billableAmount = round2(existing.billableAmount + row.billableAmount);
      existing.nonBillableHours = round2(existing.nonBillableHours + row.nonBillableHours);
      existing.nonBillableCost = round2(existing.nonBillableCost + nonBillableCost);
      existing.amountCollected = round2(existing.amountCollected + row.amountCollected);
      existing.remainingBalance = round2(existing.remainingBalance + row.remainingBalance);
      existing.profit = round2(existing.profit + row.profit);
      existing.loss = round2(existing.loss + row.loss);
      acc.set(clientKey, existing);
      return acc;
    }, new Map<string, Omit<ClientSummaryRow, "status"> & { status: StatusTone }>());

  const clientSummaryRows = Array.from(clientSummaryMap.values())
    .map((row) => {
      const collectionBase = row.billableAmount > 0 ? row.billableAmount : row.budgetFee;
      const collectionPercent =
        collectionBase > 0 ? (row.amountCollected / collectionBase) * 100 : row.remainingBalance > 0 ? 0 : 100;
      return {
        ...row,
        status: scoreToStatus(collectionPercent),
      } satisfies ClientSummaryRow;
    })
    .sort((a, b) => b.remainingBalance - a.remainingBalance);

  const timesheetMap = timeEntries.reduce((acc, entry) => {
      const existing = acc.get(entry.employeeProfileId) || {
        employeeId: entry.employeeProfileId,
        employeeName: fullName(entry.employee),
        department: entry.employee.department?.name || "Unassigned",
        manager: fullName(entry.employee.manager),
        totalHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        billableAmount: 0,
        approvalCount: 0,
        utilizationPercent: 0,
        lastWorkedAt: null as string | null,
      };
      const hours = numberValue(entry.hours);
      existing.totalHours = round2(existing.totalHours + hours);
      existing.billableAmount = round2(existing.billableAmount + numberValue(entry.billableAmount));
      existing.approvalCount += 1;
      existing.lastWorkedAt =
        !existing.lastWorkedAt || new Date(entry.dateWorked) > new Date(existing.lastWorkedAt)
          ? formatDate(entry.dateWorked)
          : existing.lastWorkedAt;
      if (entry.billable) {
        existing.billableHours = round2(existing.billableHours + hours);
      } else {
        existing.nonBillableHours = round2(existing.nonBillableHours + hours);
      }
      acc.set(entry.employeeProfileId, existing);
      return acc;
    }, new Map<number, TimesheetRow>());

  const timesheetRows: TimesheetRow[] = Array.from(timesheetMap, ([, row]) => row)
    .map((row) => ({
      ...row,
      utilizationPercent: row.totalHours > 0 ? round2((row.billableHours / row.totalHours) * 100) : 0,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  const jobReportById = new Map(jobReportRows.map((row) => [row.jobId, row] as const));
  const productivityMap = timeEntries.reduce((acc, entry) => {
      const jobReport = jobReportById.get(entry.jobId);
      if (!jobReport) return acc;
      const key = `${entry.jobId}:${entry.employeeProfileId}`;
      const existing = acc.get(key) || {
        jobId: entry.jobId,
        job: jobReport.job,
        client: jobReport.client,
        employeeName: fullName(entry.employee),
        category: jobReport.department,
        staff: entry.employee.positionTitle || "Staff",
        budgetFee: jobReport.budgetFee,
        billableHours: 0,
        nonBillableHours: 0,
        billableAmount: 0,
        amountCollected: jobReport.amountCollected,
        remainingBalance: jobReport.remainingBalance,
        profit: 0,
        loss: 0,
      };
      const hours = numberValue(entry.hours);
      const profitLoss = numberValue(entry.profitLoss);
      existing.billableAmount = round2(existing.billableAmount + numberValue(entry.billableAmount));
      if (entry.billable) {
        existing.billableHours = round2(existing.billableHours + hours);
      } else {
        existing.nonBillableHours = round2(existing.nonBillableHours + hours);
      }
      if (profitLoss >= 0) {
        existing.profit = round2(existing.profit + profitLoss);
      } else {
        existing.loss = round2(existing.loss + Math.abs(profitLoss));
      }
      acc.set(key, existing);
      return acc;
    }, new Map<string, ProductivityRow>());

  const productivityRows: ProductivityRow[] = Array.from(
    productivityMap,
    ([, row]) => row
  ).sort(
    (a, b) => b.billableAmount - a.billableAmount
  );

  const totalBillableAmount = sum(jobReportRows.map((row) => row.billableAmount));
  const totalCollected = sum(jobReportRows.map((row) => row.amountCollected));
  const totalOutstanding = sum(jobReportRows.map((row) => row.remainingBalance));
  const totalNonBillableHours = sum(jobReportRows.map((row) => row.nonBillableHours));
  const averageUtilization = average(timesheetRows.map((row) => row.utilizationPercent));
  const offTrackKpis = bscWorkspace.kpis.filter((kpi) => kpi.status !== "on_track").length;

  const cards: ReportingMetricCard[] = [
    {
      label: "Jobs in scope",
      value: String(jobReportRows.length),
      hint: "Jobs included in this reporting snapshot.",
      tone: "neutral",
    },
    {
      label: "Billable amount",
      value: formatCurrency(totalBillableAmount),
      hint: "Approved billable value captured from time entries in the active window.",
      tone: totalBillableAmount > 0 ? "positive" : "warning",
    },
    {
      label: "Non-billable hours",
      value: formatHours(totalNonBillableHours),
      hint: "Approved non-billable hours that still consume staff capacity.",
      tone: totalNonBillableHours > 0 ? "warning" : "positive",
    },
    {
      label: "Collected",
      value: formatCurrency(totalCollected),
      hint: "Collections captured in scope for the active reporting window.",
      tone: totalCollected > 0 ? "positive" : "neutral",
    },
    {
      label: "Outstanding balance",
      value: formatCurrency(totalOutstanding),
      hint: "Current open balance across scoped jobs and issued invoices.",
      tone: totalOutstanding > 0 ? "warning" : "positive",
    },
    {
      label: "BSC at-risk signals",
      value: String(offTrackKpis),
      hint: `${bscWorkspace.evaluationSummary.pendingAssignments} evaluation reviews still open in the selected cycle.`,
      tone: offTrackKpis > 0 ? "warning" : "positive",
    },
  ];

  const specializedSurface =
    effectiveRole === "finance"
      ? {
          title: "Finance reporting surfaces",
          description: "Finance reporting stays inside dedicated collections, projections, balances, and profitability workspaces.",
          cards: [
            {
              title: "Collections",
              description: "Track receipts, payment history, and collection activity.",
              path: "/finance-collections",
              metric: formatCurrency(totalCollected),
              metricHint: "Collections captured in the active window.",
            },
            {
              title: "Projections",
              description: "Compare projected cash against actual collected amounts.",
              path: "/finance-projections",
              metric: String(
                await prisma.revenueProjection.count({
                  where: activityDateRange ? { monthYear: activityDateRange } : undefined,
                })
              ),
              metricHint: "Projection records in the active window.",
            },
            {
              title: "Balances",
              description: "Review current outstanding balances and collection-stage exposure.",
              path: "/finance-balances",
              metric: formatCurrency(totalOutstanding),
              metricHint: "Current open balance in this scope.",
            },
            {
              title: "Profitability",
              description: "Review job profit, cost, and margin trends.",
              path: "/finance-profitability",
              metric: formatCurrency(sum(jobReportRows.map((row) => row.profit - row.loss))),
              metricHint: "Net profit/loss across scoped jobs.",
            },
          ],
        }
      : effectiveRole === "marketing"
        ? {
            title: "Growth reporting surfaces",
            description: "Marketing reporting stays inside business development, client surveys, and customer-growth KPI views.",
            cards: [
              {
                title: "Pipeline",
                description: "Track proposal volume, conversion, and proposal value.",
                path: "/business-development",
                metric: String(proposals.length),
                metricHint: "Proposals in the active reporting window.",
              },
              {
                title: "Won value",
                description: "See total value of proposals won in the current window.",
                path: "/business-development",
                metric: formatCurrency(
                  sum(
                    proposals
                      .filter((proposal) => proposal.status === "won")
                      .map((proposal) => numberValue(proposal.proposedFee))
                  )
                ),
                metricHint: "Won proposal value captured in this period.",
              },
              {
                title: "Client surveys",
                description: "Review completed client feedback and quality signal volume.",
                path: "/client-surveys",
                metric: String(surveys.filter((survey) => survey.completedAt).length),
                metricHint: "Completed client surveys in the active window.",
              },
              {
                title: "BSC growth lens",
                description: "Open the marketing BSC workspace for customer KPI contribution.",
                path: "/bsc-management/marketing",
                metric: formatPercent(
                  average(
                    bscWorkspace.perspectiveCards
                      .filter((perspective) => perspective.id === "customer")
                      .map((perspective) => perspective.score)
                  )
                ),
                metricHint: "Current customer/stakeholder perspective score.",
              },
            ],
          }
        : null;

  return {
    generatedAt: new Date().toISOString(),
    effectiveRole,
    visibleTabs: getVisibleTabs(effectiveRole),
    scope: getScopeSummary(effectiveRole),
    cards,
    clientSummary: {
      rows: clientSummaryRows,
    },
    jobReports: {
      rows: jobReportRows.sort((a, b) => b.remainingBalance - a.remainingBalance),
    },
    timesheets: {
      rows: timesheetRows,
    },
    productivity: {
      rows: productivityRows,
    },
    bscTracking: {
      workspaceRole: effectiveRole,
      dataQuality: bscWorkspace.dataQuality,
      perspectiveCards: bscWorkspace.perspectiveCards,
      topKpis: [...bscWorkspace.kpis]
        .sort((a, b) => a.weightedScore - b.weightedScore)
        .slice(0, 8),
      initiatives: bscWorkspace.cascadeInitiatives.slice(0, 8),
      employeeContributions: bscWorkspace.employeeContributions.slice(0, 8),
      evaluationSummary: bscWorkspace.evaluationSummary,
    },
    specializedSurface,
  };
}
