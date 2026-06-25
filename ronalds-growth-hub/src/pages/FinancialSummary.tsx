import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { AlertCircle, DollarSign } from "lucide-react";

type RoleView = "employee" | "manager" | "partner" | "hr" | "gmp";
type CardTone = "neutral" | "positive" | "warning" | "negative";

interface SummaryCardItem {
  label: string;
  value: string;
  hint: string;
  tone?: CardTone;
}

interface SummaryStatItem {
  label: string;
  value: string;
  hint?: string;
}

interface SummarySectionTable {
  type: "table";
  title: string;
  description?: string;
  columns: string[];
  rows: string[][];
}

interface SummarySectionStats {
  type: "stats";
  title: string;
  description?: string;
  items: SummaryStatItem[];
}

type SummarySection = SummarySectionTable | SummarySectionStats;

interface FinancialSummaryPayload {
  role: RoleView;
  title: string;
  subtitle: string;
  cards: SummaryCardItem[];
  sections: SummarySection[];
}

const asNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const formatKES = (value: unknown): string => `KES ${asNumber(value).toLocaleString()}`;
const formatPct = (value: unknown, digits = 1): string => `${asNumber(value).toFixed(digits)}%`;
const formatHours = (value: unknown): string => `${asNumber(value).toFixed(1)} hrs`;
const formatDate = (value: unknown): string => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const toneClasses: Record<CardTone, string> = {
  neutral: "border-border",
  positive: "border-emerald-200/70 bg-emerald-50/20",
  warning: "border-amber-200/70 bg-amber-50/20",
  negative: "border-rose-200/70 bg-rose-50/20",
};

const toneTextClasses: Record<CardTone, string> = {
  neutral: "text-foreground",
  positive: "text-emerald-700",
  warning: "text-amber-700",
  negative: "text-rose-700",
};

const toneAccentClasses: Record<CardTone, string> = {
  neutral: "bg-primary/40",
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  negative: "bg-rose-500",
};

function buildEmployeeSummary(dashboardData: any, scoreData: any): FinancialSummaryPayload {
  const financial = dashboardData?.financial ?? {};
  const scoreFinancial = scoreData?.financial ?? {};
  const formula = scoreData?.formula ?? {};

  const totalHours = asNumber(financial.totalHours);
  const billableHours = asNumber(financial.billableHours);
  const nonBillableHours = asNumber(financial.nonBillableHours || totalHours - billableHours);
  const utilization = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

  const jobBreakdown = asArray<any>(financial.jobBreakdown);
  const rows = jobBreakdown.map((job) => [
    String(job.jobTitle || `Job #${job.jobId || "-"}`),
    String(job.status || "in_progress").replace(/_/g, " "),
    formatHours(job.totalHours),
    formatHours(job.billableHours),
    formatHours(job.nonBillableHours),
    formatKES(job.allocatedRevenue),
    formatKES(job.profit),
    formatKES(job.loss),
    formatDate(job.lastWorkedAt),
  ]);

  const formulaRole = String(formula.role || "employee");
  const formulaScope = String(formula.jobScope || "assigned");
  const financialScore = asNumber(scoreFinancial.financialWeighted);

  return {
    role: "employee",
    title: "Employee Financial Summary",
    subtitle:
      "Personal cash allocations, profitability impact, time utilization, and score-driven financial inputs.",
    cards: [
      {
        label: "Allocated Revenue",
        value: formatKES(financial.allocatedRevenueTotal),
        hint: "Cash collected and allocated to you",
      },
      {
        label: "Billable Hours",
        value: formatHours(billableHours),
        hint: `Out of ${formatHours(totalHours)} total approved hours`,
      },
      {
        label: "Utilization",
        value: formatPct(utilization),
        hint: "Billable hours / total approved hours",
        tone: utilization >= 75 ? "positive" : utilization >= 50 ? "warning" : "negative",
      },
      {
        label: "Profit Impact",
        value: formatKES(financial.profitTotal),
        hint: `Loss impact ${formatKES(financial.lossTotal)}`,
        tone: asNumber(financial.profitTotal) >= asNumber(financial.lossTotal) ? "positive" : "warning",
      },
      {
        label: "Financial Score",
        value: `${financialScore.toFixed(1)}/100`,
        hint: `Formula role: ${formulaRole} (${formulaScope})`,
      },
      {
        label: "Revenue Signal",
        value: `${asNumber(formula?.financial?.scores?.revenue).toFixed(1)}%`,
        hint: `Profit signal ${asNumber(formula?.financial?.scores?.profit).toFixed(1)}%`,
      },
    ],
    sections: [
      {
        type: "table",
        title: "Job-Level Financial Breakdown",
        description: "Approved work, allocations, and profitability by job.",
        columns: [
          "Job",
          "Status",
          "Total Hours",
          "Billable",
          "Non-Billable",
          "Allocated Revenue",
          "Profit",
          "Loss",
          "Last Worked",
        ],
        rows,
      },
    ],
  };
}

function buildManagerSummary(
  overviewData: any,
  financialData: any,
  jobsData: any,
  approvalData: any
): FinancialSummaryPayload {
  const controls = jobsData?.controls ?? {};
  const chainSummary = approvalData?.summary ?? {};
  const monthlyFinancials = asArray<any>(financialData?.monthlyFinancials);
  const jobProfitability = asArray<any>(financialData?.jobProfitability);
  const teamContributions = asArray<any>(financialData?.teamContributions);
  const overBudgetRequests = asArray<any>(approvalData?.overBudgetRequests);

  const pendingChainTotal =
    asNumber(chainSummary.pending) +
    asNumber(chainSummary.overBudgetPending) +
    asNumber(chainSummary.awaitingPartner);

  return {
    role: "manager",
    title: "Manager Financial Summary",
    subtitle:
      "Team profitability, planned-vs-actual controls, and approval-chain accountability for your portfolio.",
    cards: [
      {
        label: "Monthly Revenue",
        value: formatKES(overviewData?.monthlyRevenue),
        hint: "Current month allocation revenue for your team",
      },
      {
        label: "Monthly Profit",
        value: formatKES(overviewData?.monthlyProfit),
        hint: "Current month net (profit-loss) signal",
      },
      {
        label: "Utilization",
        value: formatPct(overviewData?.utilizationRate, 0),
        hint: "Team billable utilization this month",
      },
      {
        label: "Active Jobs",
        value: `${asNumber(overviewData?.activeJobs).toLocaleString()}`,
        hint: "Planned + in-progress + on-hold",
      },
      {
        label: "Pending Approvals",
        value: `${pendingChainTotal.toLocaleString()}`,
        hint: `${asNumber(chainSummary.awaitingPartner)} awaiting partner`,
        tone: pendingChainTotal > 0 ? "warning" : "positive",
      },
      {
        label: "Jobs Over Fee Cap",
        value: `${asNumber(controls.jobsOverFeeCap).toLocaleString()}`,
        hint: "Actual cost above fee cap",
        tone: asNumber(controls.jobsOverFeeCap) > 0 ? "negative" : "positive",
      },
    ],
    sections: [
      {
        type: "stats",
        title: "Planned vs Actual Cost Controls",
        description: "Cost and hours governance for manager-owned jobs.",
        items: [
          {
            label: "Total Planned Cost",
            value: formatKES(controls.totalPlannedCost),
          },
          {
            label: "Total Actual Cost",
            value: formatKES(controls.totalActualCost),
          },
          {
            label: "Cost Variance",
            value: formatKES(controls.totalCostVariance),
            hint: "Actual - planned",
          },
          {
            label: "Hours Variance",
            value: formatHours(controls.totalHoursVariance),
            hint: "Actual - planned",
          },
          {
            label: "Jobs Over Planned Cost",
            value: `${asNumber(controls.jobsOverPlannedCost).toLocaleString()}`,
          },
          {
            label: "Jobs Over Planned Hours",
            value: `${asNumber(controls.jobsOverPlannedHours).toLocaleString()}`,
          },
        ],
      },
      {
        type: "table",
        title: "Job Profitability",
        columns: ["Job", "Client", "Revenue", "Cost", "Profit"],
        rows: jobProfitability.map((job) => [
          String(job.jobName || job.jobCode || "-"),
          String(job.clientName || "-"),
          formatKES(job.revenue),
          formatKES(job.cost),
          formatKES(job.profit),
        ]),
      },
      {
        type: "table",
        title: "Approval Chain (Over-Budget Requests)",
        description: "Visibility of over-budget requests and decision status.",
        columns: ["Job", "Employee", "Status", "Requested Additional", "Cost Impact", "Created"],
        rows: overBudgetRequests.slice(0, 30).map((request) => [
          String(request.jobName || request.jobCode || "-"),
          String(request.employeeName || "-"),
          String(request.status || "-").replace(/_/g, " "),
          formatHours(request.requestedAdditional),
          formatKES(request.estimatedCostImpact),
          formatDate(request.createdAt),
        ]),
      },
      {
        type: "table",
        title: "Team Financial Contributions",
        columns: ["Employee", "Role", "Revenue Contribution", "Total Hours", "Billable Hours"],
        rows: teamContributions.map((member) => [
          String(member.employeeName || "-"),
          String(member.roleName || "-"),
          formatKES(member.revenueContribution),
          formatHours(member.totalHours),
          formatHours(member.billableHours),
        ]),
      },
      {
        type: "table",
        title: "Monthly Financial Trend (12 Months)",
        columns: ["Month", "Revenue", "Cost", "Total Hours", "Billable Hours"],
        rows: monthlyFinancials.map((month) => [
          formatDate(month.month),
          formatKES(month.revenue),
          formatKES(month.cost),
          formatHours(month.totalHours),
          formatHours(month.billableHours),
        ]),
      },
    ],
  };
}

function buildPartnerSummary(
  summaryData: any,
  approvalData: any,
  allocationData: any
): FinancialSummaryPayload {
  const portfolio = summaryData?.portfolio ?? {};
  const topJobs = asArray<any>(summaryData?.topJobs);
  const chainSummary = approvalData?.summary ?? {};
  const overBudgetRequests = asArray<any>(approvalData?.overBudgetRequests);
  const jobBalances = asArray<any>(allocationData?.jobBalances);
  const allocationTotals = allocationData?.totals ?? {};

  const collectionRate =
    asNumber(portfolio.totalFee) > 0
      ? (asNumber(portfolio.totalRevenueCollected) / asNumber(portfolio.totalFee)) * 100
      : 0;

  return {
    role: "partner",
    title: "Partner Financial Summary",
    subtitle:
      "Portfolio profitability, cost control governance, collections-vs-allocations, and approval-chain status.",
    cards: [
      {
        label: "Portfolio Revenue",
        value: formatKES(portfolio.totalRevenueCollected),
        hint: "Collected revenue across portfolio jobs",
      },
      {
        label: "Portfolio Profit",
        value: formatKES(portfolio.totalProfit),
        hint: `Cost ${formatKES(portfolio.totalCost)}`,
      },
      {
        label: "Collection Rate",
        value: formatPct(collectionRate),
        hint: `Collected ${formatKES(portfolio.totalRevenueCollected)} / Fees ${formatKES(portfolio.totalFee)}`,
      },
      {
        label: "Pending Approval Requests",
        value: `${asNumber(portfolio.totalPendingApprovalRequests).toLocaleString()}`,
        hint: `${asNumber(portfolio.jobsAwaitingPartner)} jobs awaiting partner`,
        tone:
          asNumber(portfolio.jobsAwaitingPartner) > 0 || asNumber(portfolio.totalPendingApprovalRequests) > 0
            ? "warning"
            : "positive",
      },
      {
        label: "Jobs Over Planned Cost",
        value: `${asNumber(portfolio.jobsOverPlannedCost).toLocaleString()}`,
        hint: "Portfolio governance breach count",
        tone: asNumber(portfolio.jobsOverPlannedCost) > 0 ? "negative" : "positive",
      },
      {
        label: "Jobs Over Fee Cap",
        value: `${asNumber(portfolio.jobsOverFeeCap).toLocaleString()}`,
        hint: "Actual cost exceeded fee cap",
        tone: asNumber(portfolio.jobsOverFeeCap) > 0 ? "negative" : "positive",
      },
    ],
    sections: [
      {
        type: "stats",
        title: "Planned vs Actual Controls",
        description: "Control totals for partner-owned jobs.",
        items: [
          { label: "Planned Cost", value: formatKES(portfolio.totalPlannedCost) },
          { label: "Actual Cost", value: formatKES(portfolio.totalCost) },
          { label: "Cost Variance", value: formatKES(portfolio.totalCostVariance) },
          { label: "Planned Hours", value: formatHours(portfolio.totalPlannedHours) },
          { label: "Actual Hours", value: formatHours(portfolio.totalActualHours) },
          { label: "Hours Variance", value: formatHours(portfolio.totalHoursVariance) },
        ],
      },
      {
        type: "table",
        title: "Top Jobs: Cost and Margin Controls",
        columns: [
          "Job",
          "Status",
          "Fee Cap",
          "Collected",
          "Actual Cost",
          "Profit",
          "Margin",
          "Pending Approvals",
        ],
        rows: topJobs.map((job) => [
          String(job.jobName || job.jobCode || "-"),
          String(job.status || "-").replace(/_/g, " "),
          formatKES(job.feeCap || job.feeAmount),
          formatKES(job.amountCollected),
          formatKES(job.actualCost || job.costAmount),
          formatKES(job.profit),
          formatPct(job.marginPercentage),
          `${asNumber(job.pendingApprovalTotal).toLocaleString()}`,
        ]),
      },
      {
        type: "stats",
        title: "Approval Chain Summary",
        description: "Standard and over-budget request states.",
        items: [
          { label: "Standard Pending", value: `${asNumber(chainSummary.pending).toLocaleString()}` },
          { label: "Standard Approved", value: `${asNumber(chainSummary.approved).toLocaleString()}` },
          { label: "Over-Budget Pending", value: `${asNumber(chainSummary.overBudgetPending).toLocaleString()}` },
          { label: "Awaiting Partner", value: `${asNumber(chainSummary.awaitingPartner).toLocaleString()}` },
          { label: "Partner Approved", value: `${asNumber(chainSummary.partnerApproved).toLocaleString()}` },
          { label: "Partner Rejected", value: `${asNumber(chainSummary.partnerRejected).toLocaleString()}` },
        ],
      },
      {
        type: "table",
        title: "Over-Budget Requests",
        columns: ["Job", "Employee", "Status", "Requested Additional", "Cost Impact", "Created"],
        rows: overBudgetRequests.slice(0, 30).map((request) => [
          String(request.jobName || request.jobCode || "-"),
          String(request.employeeName || "-"),
          String(request.status || "-").replace(/_/g, " "),
          formatHours(request.requestedAdditional),
          formatKES(request.estimatedCostImpact),
          formatDate(request.createdAt),
        ]),
      },
      {
        type: "table",
        title: "Collections vs Allocations",
        description: `Portfolio totals: Collected ${formatKES(
          allocationTotals.collectedAmount
        )} / Allocated ${formatKES(allocationTotals.allocatedAmount)}`,
        columns: ["Job", "Client", "Collected", "Allocated", "Unallocated", "Profit", "Loss"],
        rows: jobBalances.map((job) => [
          String(job.jobName || job.jobCode || "-"),
          String(job.clientName || "-"),
          formatKES(job.collectedAmount),
          formatKES(job.allocatedAmount),
          formatKES(job.unallocatedAmount),
          formatKES(job.totalProfit),
          formatKES(job.totalLoss),
        ]),
      },
    ],
  };
}

function buildHrSummary(metricsData: any, controlsData: any): FinancialSummaryPayload {
  const controls = controlsData?.controls ?? {};
  const approvals = controlsData?.approvals ?? {};
  const recentJobs = asArray<any>(controlsData?.recentJobs);

  return {
    role: "hr",
    title: "Admin Financial Summary",
    subtitle:
      "Firm-wide financial oversight across collections, profitability, utilization, and control/approval compliance.",
    cards: [
      { label: "Projected (Month)", value: formatKES(metricsData?.projectedMonth), hint: "Current month projection" },
      { label: "Collected (Month)", value: formatKES(metricsData?.collectedMonth), hint: "Current month collections" },
      { label: "Variance (Month)", value: formatKES(metricsData?.varianceMonth), hint: "Collected - projected" },
      {
        label: "Outstanding",
        value: formatKES(metricsData?.totalOutstanding),
        hint: `Across fee base ${formatKES(metricsData?.totalFees)}`,
        tone: asNumber(metricsData?.totalOutstanding) > 0 ? "warning" : "positive",
      },
      { label: "Collection Rate", value: formatPct(metricsData?.collectionRate), hint: "Collected vs total fees" },
      { label: "Firm Profit", value: formatKES(metricsData?.firmProfit), hint: "Allocations net profit-loss" },
      { label: "Utilization", value: formatPct(metricsData?.utilizationRate), hint: "Billable utilization" },
      {
        label: "Overdue Jobs",
        value: `${asNumber(metricsData?.overdueJobs).toLocaleString()}`,
        hint: "Due date passed and not completed",
        tone: asNumber(metricsData?.overdueJobs) > 0 ? "warning" : "positive",
      },
    ],
    sections: [
      {
        type: "stats",
        title: "Cost Control Summary",
        description: "Planned-vs-actual exposure across all jobs.",
        items: [
          { label: "Total Jobs", value: `${asNumber(controls.totalJobs).toLocaleString()}` },
          { label: "Planned Cost", value: formatKES(controls.totalPlannedCost) },
          { label: "Actual Cost", value: formatKES(controls.totalActualCost) },
          { label: "Cost Variance", value: formatKES(controls.totalCostVariance) },
          { label: "Jobs Over Planned Cost", value: `${asNumber(controls.jobsOverPlannedCost).toLocaleString()}` },
          { label: "Jobs Over Fee Cap", value: `${asNumber(controls.jobsOverFeeCap).toLocaleString()}` },
        ],
      },
      {
        type: "stats",
        title: "Approval Chain Summary",
        items: [
          { label: "Standard Pending", value: `${asNumber(approvals?.standard?.pending).toLocaleString()}` },
          { label: "Standard Rejected", value: `${asNumber(approvals?.standard?.rejected).toLocaleString()}` },
          { label: "Over-Budget Pending", value: `${asNumber(approvals?.overBudget?.pending).toLocaleString()}` },
          { label: "Awaiting Partner", value: `${asNumber(approvals?.overBudget?.awaitingPartner).toLocaleString()}` },
          { label: "Partner Rejected", value: `${asNumber(approvals?.overBudget?.partnerRejected).toLocaleString()}` },
          { label: "Auto Rejected", value: `${asNumber(approvals?.overBudget?.autoRejected).toLocaleString()}` },
        ],
      },
      {
        type: "table",
        title: "Recent Job Controls",
        columns: [
          "Job",
          "Client",
          "Manager",
          "Partner",
          "Planned Cost",
          "Actual Cost",
          "Cost Variance",
          "Fee Buffer",
        ],
        rows: recentJobs.map((job) => [
          String(job.jobName || job.jobCode || "-"),
          String(job.clientName || "-"),
          String(job.managerName || "-"),
          String(job.partnerName || "-"),
          formatKES(job.plannedCost),
          formatKES(job.actualCost),
          formatKES(job.costVariance),
          formatKES(job.feeBuffer),
        ]),
      },
    ],
  };
}

function buildGmpSummary(overviewData: any, personalData: any): FinancialSummaryPayload {
  const firmMetrics = overviewData?.firmMetrics ?? {};
  const financials = overviewData?.financials ?? {};
  const departmentBreakdown = asArray<any>(overviewData?.departmentBreakdown);
  const partnerRankings = asArray<any>(overviewData?.partnerRankings);
  const managerRankings = asArray<any>(overviewData?.managerRankings);
  const projectionTrend = asArray<any>(overviewData?.projectionTrend);
  const alertsSummary = overviewData?.alertsSummary ?? {};
  const riskSummary = overviewData?.riskSummary ?? {};
  const personalMetrics = personalData?.personalMetrics ?? {};

  const activeJobs = asNumber(firmMetrics.active_jobs ?? firmMetrics.activeJobs);
  const utilizationRate = asNumber(firmMetrics.utilization_rate ?? firmMetrics.utilizationRate);
  const pendingEvaluationsOver30Days = asNumber(
    alertsSummary.pendingEvaluationsOver30Days
  );
  const atRiskJobs = asNumber(riskSummary.atRiskJobs ?? alertsSummary.atRiskJobs);
  const atRiskExposure = asNumber(
    riskSummary.atRiskExposure ?? alertsSummary.atRiskExposure
  );

  return {
    role: "gmp",
    title: "Group Managing Partner Financial Summary",
    subtitle:
      "Firm-level financial health, partner ranking, department performance, and pipeline-to-collection execution.",
    cards: [
      { label: "Total Revenue", value: formatKES(financials.totalRevenue), hint: "All-time collections" },
      { label: "Projected Revenue", value: formatKES(financials.projectedRevenue), hint: "Open projection baseline" },
      { label: "Collected Amount", value: formatKES(financials.collectedAmount), hint: "Projection actual + payments" },
      { label: "Collection Rate", value: formatPct(financials.collectionRate), hint: "Collected vs fee baseline" },
      { label: "Total Profit", value: formatKES(financials.totalProfit), hint: `Total cost ${formatKES(financials.totalCost)}` },
      { label: "Active Jobs", value: `${activeJobs.toLocaleString()}`, hint: "Firm-wide active engagements" },
      {
        label: "At-Risk Jobs",
        value: `${atRiskJobs.toLocaleString()}`,
        hint: `Exposure ${formatKES(atRiskExposure)}`,
        tone: atRiskJobs > 0 ? "warning" : "positive",
      },
      {
        label: "Pending Over-Budget",
        value: `${asNumber(alertsSummary.pendingOverBudget).toLocaleString()}`,
        hint: "Requests needing control decisions",
        tone: asNumber(alertsSummary.pendingOverBudget) > 0 ? "warning" : "positive",
      },
      {
        label: "Aged Evaluations",
        value: `${pendingEvaluationsOver30Days.toLocaleString()}`,
        hint: "Pending for 30+ days",
        tone: pendingEvaluationsOver30Days > 0 ? "warning" : "positive",
      },
      { label: "Firm Utilization", value: formatPct(utilizationRate), hint: "Billable utilization ratio" },
    ],
    sections: [
      {
        type: "table",
        title: "Department Financial Breakdown",
        columns: ["Department", "Revenue", "Fees", "Collection Rate", "Team Size", "Active Jobs"],
        rows: departmentBreakdown.map((department) => [
          String(department.department_name ?? department.departmentName ?? "-"),
          formatKES(department.department_revenue ?? department.departmentRevenue),
          formatKES(department.department_fees ?? department.departmentFees),
          formatPct(department.collection_rate ?? department.collectionRate),
          `${asNumber(department.employee_count ?? department.employeeCount).toLocaleString()}`,
          `${asNumber(department.active_jobs ?? department.activeJobs ?? department.jobs_count).toLocaleString()}`,
        ]),
      },
      {
        type: "table",
        title: "Partner Rankings",
        columns: ["Partner", "Revenue", "Fees", "Collection Rate", "Profit", "Utilization"],
        rows: partnerRankings.map((partner) => [
          String(partner.name ?? partner.partnerName ?? "-"),
          formatKES(partner.portfolio_revenue ?? partner.portfolioRevenue),
          formatKES(partner.portfolio_fees ?? partner.portfolioFees),
          formatPct(partner.collection_rate ?? partner.collectionRate),
          formatKES(
            (partner.portfolio_profit ?? partner.portfolioProfit) ??
              (asNumber(partner.portfolio_revenue ?? partner.portfolioRevenue) -
                asNumber(partner.portfolio_fees ?? partner.portfolioFees))
          ),
          formatPct(partner.utilization_rate ?? partner.utilizationRate),
        ]),
      },
      {
        type: "table",
        title: "Manager Rankings",
        columns: ["Manager", "Team Size", "Jobs Managed", "Revenue", "Utilization", "Avg Team Score"],
        rows: managerRankings.map((manager) => [
          String(manager.name || "-"),
          `${asNumber(manager.team_size ?? manager.teamSize).toLocaleString()}`,
          `${asNumber(manager.jobs_managed ?? manager.jobsManaged).toLocaleString()}`,
          formatKES(manager.portfolio_revenue ?? manager.portfolioRevenue),
          formatPct(manager.utilization_rate ?? manager.utilizationRate),
          `${asNumber(manager.avg_performance ?? manager.avgPerformance).toFixed(1)}`,
        ]),
      },
      {
        type: "table",
        title: "Projection vs Collection Trend",
        columns: ["Month", "Projected", "Collected", "Variance"],
        rows: projectionTrend.map((month) => [
          formatDate(month.month),
          formatKES(month.projected),
          formatKES(month.collected),
          formatKES(asNumber(month.collected) - asNumber(month.projected)),
        ]),
      },
      {
        type: "stats",
        title: "GMP Personal Portfolio",
        description: "Direct personal portfolio metrics for partner/manager responsibilities.",
        items: [
          { label: "Active Jobs", value: `${asNumber(personalMetrics.activeJobs).toLocaleString()}` },
          { label: "Total Revenue", value: formatKES(personalMetrics.totalRevenue) },
          { label: "Total Fees", value: formatKES(personalMetrics.totalFees) },
          { label: "Direct Reports", value: `${asNumber(personalMetrics.directReports).toLocaleString()}` },
          {
            label: "Overall Performance",
            value: `${asNumber(personalMetrics.overallScore).toFixed(1)}`,
            hint: "Latest available score",
          },
        ],
      },
    ],
  };
}

function SummaryCards({ cards }: { cards: SummaryCardItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => {
        const tone = card.tone ?? "neutral";
        return (
          <Card key={card.label} className={cn("relative overflow-hidden", toneClasses[tone])}>
            <div className={cn("absolute inset-y-0 left-0 w-1 rounded-l-xl", toneAccentClasses[tone])} />
            <CardContent className="py-5 pl-6 pr-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {card.label}
              </p>
              <p className={cn("mt-2 text-2xl font-bold leading-none break-words tabular-nums", toneTextClasses[tone])}>
                {card.value}
              </p>
              {card.hint && (
                <p className="mt-1.5 text-xs text-muted-foreground">{card.hint}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const isStatusCol = (col: string) => ["status", "state"].includes(col.toLowerCase());

function cellClass(cell: string): string {
  const lc = cell.trim().toLowerCase();
  if (/^kes\s*-/.test(lc)) return "font-mono text-right text-sm text-rose-600";
  if (/^kes\s*0\b/.test(lc)) return "font-mono text-right text-sm text-muted-foreground";
  if (/^kes\s/.test(lc)) return "font-mono text-right text-sm text-foreground";
  if (/^\d+(\.\d+)?%$/.test(lc)) return "font-mono text-right text-sm";
  if (/^\d+(\.\d+)?\s*hrs$/.test(lc)) return "font-mono text-right text-sm tabular-nums";
  if (/^-\d/.test(lc)) return "font-mono text-right text-sm text-rose-600";
  return "text-sm";
}

function StatusCell({ value }: { value: string }) {
  const lc = value.toLowerCase();
  const emerald = ["approved", "in progress", "live", "completed"].some((s) => lc.includes(s));
  const amber = ["pending", "on hold", "awaiting", "over budget"].some((s) => lc.includes(s));
  const rose = ["rejected", "overdue", "cancelled", "auto"].some((s) => lc.includes(s));
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] capitalize",
        emerald && "border-emerald-200 bg-emerald-50 text-emerald-700",
        amber && "border-amber-200 bg-amber-50 text-amber-700",
        rose && "border-rose-200 bg-rose-50 text-rose-700"
      )}
    >
      {value}
    </Badge>
  );
}

function SummarySectionView({ section }: { section: SummarySection }) {
  if (section.type === "stats") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{section.title}</CardTitle>
          {section.description && <CardDescription>{section.description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {section.items.map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-lg font-bold text-foreground tabular-nums">{item.value}</p>
              {item.hint && <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{section.title}</CardTitle>
        {section.description && <CardDescription>{section.description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[420px]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="border-b">
                {section.columns.map((col) => (
                  <TableHead
                    key={col}
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap py-3",
                      isStatusCol(col) ? "text-left" : "text-right first:text-left"
                    )}
                  >
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.rows.length > 0 ? (
                section.rows.map((row, idx) => (
                  <TableRow key={`${section.title}-${idx}`} className="hover:bg-muted/30">
                    {row.map((cell, cellIdx) => {
                      const col = section.columns[cellIdx] ?? "";
                      if (isStatusCol(col)) {
                        return (
                          <TableCell key={`${idx}-${cellIdx}`} className="py-2.5">
                            <StatusCell value={cell} />
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell
                          key={`${idx}-${cellIdx}`}
                          className={cn(
                            "py-2.5 whitespace-nowrap",
                            cellIdx === 0 ? "text-sm font-medium" : cellClass(cell)
                          )}
                        >
                          {cell}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={section.columns.length}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinancialSummary() {
  const navigate = useNavigate();
  const {
    user,
    isLoading: authLoading,
    isAdmin,
    isHR,
    isGMP,
    isPartner,
    isManager,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<FinancialSummaryPayload | null>(null);

  const roleView = useMemo<RoleView>(() => {
    if (isGMP) return "gmp";
    if (isAdmin || isHR) return "hr";
    if (isPartner) return "partner";
    if (isManager) return "manager";
    return "employee";
  }, [isGMP, isAdmin, isHR, isPartner, isManager]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (!user) {
        navigate("/auth");
        return;
      }

      if (roleView === "employee") {
        const [dashboardData, scoreData] = await Promise.all([
          apiFetch<any>("GET", "/analytics/dashboard"),
          apiFetch<any>("GET", "/performance-scores/me").catch(() => ({})),
        ]);
        setPayload(buildEmployeeSummary(dashboardData, scoreData));
        return;
      }

      if (roleView === "manager") {
        const [overviewData, financialData, jobsData, approvalData] = await Promise.all([
          apiFetch<any>("GET", "/manager-dashboard/overview"),
          apiFetch<any>("GET", "/manager-dashboard/financials"),
          apiFetch<any>("GET", "/manager-dashboard/jobs"),
          apiFetch<any>("GET", "/manager-dashboard/approval-chain"),
        ]);
        setPayload(buildManagerSummary(overviewData, financialData, jobsData, approvalData));
        return;
      }

      if (roleView === "partner") {
        const [summaryData, approvalData, allocationData] = await Promise.all([
          apiFetch<any>("GET", "/partners/dashboard-summary"),
          apiFetch<any>("GET", "/partners/approval-chain"),
          apiFetch<any>("GET", "/partners/allocations"),
        ]);
        setPayload(buildPartnerSummary(summaryData, approvalData, allocationData));
        return;
      }

      if (roleView === "hr") {
        const [metricsData, controlsData] = await Promise.all([
          apiFetch<any>("GET", "/hr-dashboard/company-metrics"),
          apiFetch<any>("GET", "/hr-dashboard/approval-controls"),
        ]);
        setPayload(buildHrSummary(metricsData, controlsData));
        return;
      }

      const [overviewData, personalData] = await Promise.all([
        apiFetch<any>("GET", "/gmp-dashboard/overview"),
        apiFetch<any>("GET", "/gmp-dashboard/personal").catch(() => ({})),
      ]);
      setPayload(buildGmpSummary(overviewData, personalData));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load financial summary.";
      setErrorMessage(message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [navigate, roleView, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    void loadSummary();
  }, [authLoading, user, navigate, loadSummary]);

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-foreground">{payload?.title || "Financial Summary"}</h2>
          {payload?.role && (
            <Badge variant="outline" className="capitalize text-xs">
              {payload.role} view
            </Badge>
          )}
        </div>

        {errorMessage && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Unable to load complete financial data
              </CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {payload ? (
          <>
            <SummaryCards cards={payload.cards} />
            {payload.sections.map((section, index) => (
              <SummarySectionView key={`${section.title}-${index}`} section={section} />
            ))}
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                No Financial Data Available
              </CardTitle>
              <CardDescription>
                Financial data will appear once jobs, time entries, collections, and allocations are posted.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
