import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, BarChart3, PieChart as PieChartIcon } from "lucide-react";

export type AnalyticsModule =
  | "employee"
  | "finance"
  | "marketing"
  | "manager"
  | "partner"
  | "hr"
  | "gmp";

interface ModuleAnalyticsProps {
  module: AnalyticsModule;
}

interface StatCardData {
  label: string;
  value: string;
  description: string;
}

interface PieDatum {
  name: string;
  value: number;
}

interface BarSeries {
  key: string;
  label: string;
  color: string;
}

interface AnalyticsModel {
  title: string;
  subtitle: string;
  stats: StatCardData[];
  pieTitle: string;
  pieDescription: string;
  pieData: PieDatum[];
  barTitle: string;
  barDescription: string;
  barData: Array<Record<string, string | number>>;
  barSeries: BarSeries[];
  insights: string[];
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPercent = (value: unknown) => {
  const numeric = toNumber(value);
  if (numeric > 0 && numeric <= 1) {
    return numeric * 100;
  }
  return numeric;
};

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const unwrap = (payload: any) => payload?.data ?? payload?.payload ?? payload ?? null;

const formatCurrency = (value: number) =>
  `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(toNumber(value))}`;

const formatPercent = (value: number) => `${toNumber(value).toFixed(1)}%`;

const toMonthLabel = (value: unknown) => {
  if (!value) return "N/A";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-KE", { month: "short", year: "2-digit" });
};

const normalizePie = (rows: PieDatum[]) => {
  const sanitized = rows.map((row) => ({
    name: row.name,
    value: Math.max(0, toNumber(row.value)),
  }));
  const hasData = sanitized.some((row) => row.value > 0);
  return hasData ? sanitized.filter((row) => row.value > 0) : [];
};

const getStatusBucket = (rawStatus: unknown) => {
  const status = String(rawStatus || "other").toLowerCase();
  if (status.includes("progress") || status === "ongoing") return "In progress";
  if (status.includes("complete") || status.includes("done")) return "Completed";
  if (status.includes("hold")) return "On hold";
  if (status.includes("overdue")) return "Overdue";
  if (status.includes("plan") || status.includes("draft")) return "Planned";
  if (status.includes("pending")) return "Pending";
  return "Other";
};

const loadModuleData = async (module: AnalyticsModule) => {
  switch (module) {
    case "employee": {
      const [performanceResult, goalsResult, unreadResult] = await Promise.allSettled([
        apiFetch("GET", "/performance-scores/me"),
        apiFetch("GET", "/goals"),
        apiFetch("GET", "/notifications/unread-count"),
      ]);

      const performance =
        performanceResult.status === "fulfilled" ? unwrap(performanceResult.value) : null;
      const goalsPayload = goalsResult.status === "fulfilled" ? unwrap(goalsResult.value) : [];
      const unreadPayload = unreadResult.status === "fulfilled" ? unwrap(unreadResult.value) : {};

      return {
        performance,
        goals: Array.isArray(goalsPayload)
          ? goalsPayload
          : asArray((goalsPayload as any)?.data),
        unreadCount: toNumber((unreadPayload as any)?.unreadCount ?? (unreadPayload as any)?.unread),
      };
    }
    case "finance": {
      const [overviewResult, projectionsResult] = await Promise.allSettled([
        apiFetch("GET", "/finance-dashboard/overview"),
        apiFetch("GET", "/finance-dashboard/projections"),
      ]);

      return {
        overview: overviewResult.status === "fulfilled" ? unwrap(overviewResult.value) : {},
        projections:
          projectionsResult.status === "fulfilled"
            ? asArray(unwrap(projectionsResult.value))
            : [],
      };
    }
    case "marketing": {
      const [proposalResult, surveyResult, clientsResult, onboardingResult, upcomingJobsResult] =
        await Promise.allSettled([
          apiFetch("GET", "/proposals/metrics"),
          apiFetch("GET", "/surveys/analytics"),
          apiFetch("GET", "/clients?page=1&pageSize=200"),
          apiFetch("GET", "/client-onboardings?page=1&pageSize=200"),
          apiFetch("GET", "/client-onboardings/upcoming-jobs?page=1&pageSize=200"),
        ]);

      return {
        proposalMetrics: proposalResult.status === "fulfilled" ? unwrap(proposalResult.value) : {},
        surveyAnalytics: surveyResult.status === "fulfilled" ? unwrap(surveyResult.value) : {},
        clients:
          clientsResult.status === "fulfilled"
            ? asArray((unwrap(clientsResult.value) as any)?.data ?? unwrap(clientsResult.value))
            : [],
        onboardings:
          onboardingResult.status === "fulfilled"
            ? asArray((unwrap(onboardingResult.value) as any)?.data ?? unwrap(onboardingResult.value))
            : [],
        upcomingJobs:
          upcomingJobsResult.status === "fulfilled"
            ? asArray((unwrap(upcomingJobsResult.value) as any)?.data ?? unwrap(upcomingJobsResult.value))
            : [],
      };
    }
    case "manager": {
      const [overviewResult, workloadResult, jobsResult] = await Promise.allSettled([
        apiFetch("GET", "/manager-dashboard/overview"),
        apiFetch("GET", "/manager/workload-metrics"),
        apiFetch("GET", "/manager-dashboard/jobs"),
      ]);

      const jobsPayload = jobsResult.status === "fulfilled" ? unwrap(jobsResult.value) : {};
      return {
        overview: overviewResult.status === "fulfilled" ? unwrap(overviewResult.value) : {},
        workload: workloadResult.status === "fulfilled" ? unwrap(workloadResult.value) : {},
        jobs: asArray((jobsPayload as any)?.portfolio ?? jobsPayload),
      };
    }
    case "partner": {
      const [summaryResult] = await Promise.allSettled([apiFetch("GET", "/partners/dashboard-summary")]);
      return {
        summary: summaryResult.status === "fulfilled" ? unwrap(summaryResult.value) : {},
      };
    }
    case "hr": {
      const [metricsResult, approvalsResult, missingResult] = await Promise.allSettled([
        apiFetch("GET", "/hr-dashboard/company-metrics"),
        apiFetch("GET", "/hr-dashboard/approval-controls"),
        apiFetch("GET", "/employees/missing-induction"),
      ]);

      return {
        companyMetrics: metricsResult.status === "fulfilled" ? unwrap(metricsResult.value) : {},
        approvalControls: approvalsResult.status === "fulfilled" ? unwrap(approvalsResult.value) : {},
        missingInduction:
          missingResult.status === "fulfilled" ? asArray(unwrap(missingResult.value)) : [],
      };
    }
    case "gmp": {
      const [overviewResult, pipelineResult] = await Promise.allSettled([
        apiFetch("GET", "/gmp-dashboard/overview"),
        apiFetch("GET", "/proposals/metrics"),
      ]);

      return {
        overview: overviewResult.status === "fulfilled" ? unwrap(overviewResult.value) : {},
        pipelineMetrics: pipelineResult.status === "fulfilled" ? unwrap(pipelineResult.value) : {},
      };
    }
    default:
      return {};
  }
};

const buildAnalyticsModel = (module: AnalyticsModule, payload: any): AnalyticsModel => {
  switch (module) {
    case "employee": {
      const performance = payload?.performance ?? {};
      const financial = performance?.financial ?? {};
      const nonFinancial = performance?.nonFinancial ?? {};
      const efficiency = performance?.efficiency ?? {};
      const overall = performance?.overall ?? {};
      const goals = asArray(payload?.goals);

      const completedGoals = goals.filter((goal: any) =>
        ["completed", "done"].includes(String(goal?.status || "").toLowerCase())
      ).length;
      const activeGoals = goals.filter((goal: any) =>
        ["active", "in_progress", "ongoing", "pending"].includes(String(goal?.status || "").toLowerCase())
      ).length;

      const pieData = normalizePie([
        { name: "Financial", value: toNumber(financial?.financialWeighted) },
        { name: "Non-financial", value: toNumber(nonFinancial?.overallNonFinancialScore) },
        { name: "Efficiency", value: toNumber(efficiency?.efficiencyWeighted) },
      ]);

      const barData = [
        { label: "Revenue", score: toNumber(financial?.revenueScore) },
        { label: "Profit", score: toNumber(financial?.profitScore) },
        { label: "Business Dev", score: toNumber(financial?.bdScore) },
        { label: "Customer", score: toNumber(nonFinancial?.customerSatisfactionScore) },
      ];

      return {
        title: "Employee Analytics",
        subtitle: "Personal score drivers and progress signals in one place.",
        stats: [
          {
            label: "Overall Score",
            value: toNumber(overall?.totalScore).toFixed(1),
            description: `Grade ${String(overall?.grade || "N/A")}`,
          },
          {
            label: "Revenue Contribution",
            value: formatCurrency(toNumber(financial?.revenue)),
            description: "From approved allocations",
          },
          {
            label: "Utilization",
            value: formatPercent(toPercent(financial?.utilizationRate)),
            description: "Billable vs allocated",
          },
          {
            label: "Goals",
            value: `${completedGoals}/${goals.length}`,
            description: `${activeGoals} active goals`,
          },
        ],
        pieTitle: "Score Composition",
        pieDescription: "How your score is currently distributed.",
        pieData,
        barTitle: "Score Drivers",
        barDescription: "Main weighted metrics feeding your score.",
        barData,
        barSeries: [{ key: "score", label: "Score", color: CHART_COLORS[0] }],
        insights: [
          `${payload?.unreadCount || 0} unread notifications need review.`,
          "Update goals and evaluations to improve non-financial signals.",
        ],
      };
    }
    case "finance": {
      const overview = payload?.overview ?? {};
      const projections = asArray(payload?.projections);

      const projectedMonth = toNumber(overview?.projectedMonth);
      const collectedMonth = toNumber(overview?.collectedMonth);
      const outstanding = toNumber(overview?.totalOutstanding);
      const collectionRate = toNumber(overview?.collectionRate);

      const barData = projections
        .slice(0, 6)
        .reverse()
        .map((row: any) => ({
          label: toMonthLabel(row?.monthYear),
          projected: toNumber(row?.projectedAmount),
          collected: toNumber(row?.actualCollected),
        }));

      const pieData = normalizePie([
        { name: "Collected", value: toNumber(overview?.totalCollected || collectedMonth) },
        { name: "Outstanding", value: outstanding },
        { name: "Gap to target", value: Math.max(projectedMonth - collectedMonth, 0) },
      ]);

      return {
        title: "Finance Analytics",
        subtitle: "Collections, projections, and risk exposure overview.",
        stats: [
          {
            label: "Projected (Month)",
            value: formatCurrency(projectedMonth),
            description: "Current month target",
          },
          {
            label: "Collected (Month)",
            value: formatCurrency(collectedMonth),
            description: "Current month actual",
          },
          {
            label: "Outstanding",
            value: formatCurrency(outstanding),
            description: "Across active jobs",
          },
          {
            label: "Collection Rate",
            value: formatPercent(collectionRate),
            description: "Collected vs fee baseline",
          },
        ],
        pieTitle: "Cash Position",
        pieDescription: "Collected amount against exposure and month gap.",
        pieData,
        barTitle: "Projection vs Collection",
        barDescription: "Last six projection periods.",
        barData,
        barSeries: [
          { key: "projected", label: "Projected", color: CHART_COLORS[0] },
          { key: "collected", label: "Collected", color: CHART_COLORS[1] },
        ],
        insights: [
          collectedMonth < projectedMonth
            ? "Collections are currently below this month target."
            : "Collections are on track against this month target.",
          "Use balances and collections modules for drill-down action.",
        ],
      };
    }
    case "marketing": {
      const pipeline = payload?.proposalMetrics ?? {};
      const surveys = payload?.surveyAnalytics ?? {};
      const clients = asArray(payload?.clients);
      const onboardings = asArray(payload?.onboardings);
      const upcomingJobs = asArray(payload?.upcomingJobs);

      const totalOpportunities = toNumber(pipeline?.totalOpportunities);
      const wonThisMonth = toNumber(pipeline?.wonThisMonth);
      const lostThisMonth = toNumber(pipeline?.lostThisMonth);
      const openOpportunities = Math.max(totalOpportunities - wonThisMonth - lostThisMonth, 0);

      const trend = asArray(pipeline?.pipelineTrend).map((row: any) => ({
        label: row?.month || "N/A",
        created: toNumber(row?.created),
        won: toNumber(row?.won),
        lost: toNumber(row?.lost),
      }));

      return {
        title: "Marketing Analytics",
        subtitle: "Pipeline health, onboarding flow, and client feedback pulse.",
        stats: [
          {
            label: "Pipeline Value",
            value: formatCurrency(toNumber(pipeline?.pipelineValue)),
            description: `${totalOpportunities} opportunities`,
          },
          {
            label: "Conversion Rate",
            value: formatPercent(toNumber(pipeline?.conversionRate)),
            description: "Won proposals ratio",
          },
          {
            label: "Client Satisfaction",
            value: `${toNumber(surveys?.averageRatings?.overall).toFixed(1)}/5`,
            description: `${toNumber(surveys?.totalSurveys)} total surveys`,
          },
          {
            label: "Onboarding Queue",
            value: `${onboardings.length}`,
            description: `${upcomingJobs.length} upcoming jobs`,
          },
        ],
        pieTitle: "Pipeline Outcome Mix",
        pieDescription: "Open, won, and lost opportunities this cycle.",
        pieData: normalizePie([
          { name: "Open", value: openOpportunities },
          { name: "Won", value: wonThisMonth },
          { name: "Lost", value: lostThisMonth },
        ]),
        barTitle: "Pipeline Trend",
        barDescription: "Created, won, and lost opportunities over time.",
        barData: trend,
        barSeries: [
          { key: "created", label: "Created", color: CHART_COLORS[0] },
          { key: "won", label: "Won", color: CHART_COLORS[1] },
          { key: "lost", label: "Lost", color: CHART_COLORS[2] },
        ],
        insights: [
          `${clients.length} clients currently in active records.`,
          "Track conversion and survey quality together for better demand quality.",
        ],
      };
    }
    case "manager": {
      const overview = payload?.overview ?? {};
      const workload = payload?.workload ?? {};
      const jobs = asArray(payload?.jobs);

      const totalTeamMembers = toNumber(workload?.totalTeamMembers || workload?.total_team_members || overview?.teamSize);
      const overloaded = toNumber(workload?.overloadedEmployees || workload?.overloaded_employees);
      const underutilized = toNumber(workload?.underutilizedEmployees || workload?.underutilized_employees);
      const balanced = Math.max(totalTeamMembers - overloaded - underutilized, 0);

      const statusMap = jobs.reduce((acc: Record<string, number>, job: any) => {
        const bucket = getStatusBucket(job?.status);
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
      }, {});

      const barData = Object.entries(statusMap).map(([label, count]) => ({ label, jobs: count }));

      return {
        title: "Manager Analytics",
        subtitle: "Team workload and delivery performance for your department.",
        stats: [
          {
            label: "Team Size",
            value: String(toNumber(overview?.teamSize || totalTeamMembers)),
            description: "Direct reports",
          },
          {
            label: "Active Jobs",
            value: String(toNumber(overview?.activeJobs)),
            description: "In current portfolio",
          },
          {
            label: "Monthly Revenue",
            value: formatCurrency(toNumber(overview?.monthlyRevenue)),
            description: "Team collected amount",
          },
          {
            label: "Pending Reviews",
            value: String(toNumber(overview?.pendingReviews)),
            description: "Awaiting manager action",
          },
        ],
        pieTitle: "Workload Distribution",
        pieDescription: "How team capacity is spread across risk buckets.",
        pieData: normalizePie([
          { name: "Balanced", value: balanced },
          { name: "Overloaded", value: overloaded },
          { name: "Underutilized", value: underutilized },
        ]),
        barTitle: "Job Status Breakdown",
        barDescription: "Portfolio distribution by status.",
        barData,
        barSeries: [{ key: "jobs", label: "Jobs", color: CHART_COLORS[0] }],
        insights: [
          `${toNumber(workload?.criticalDeadlines || workload?.critical_deadlines)} critical deadlines currently flagged.`,
          "Shift capacity from underutilized to overloaded team members where possible.",
        ],
      };
    }
    case "partner": {
      const summary = payload?.summary ?? {};
      const portfolio = summary?.portfolio ?? {};
      const topJobs = asArray(summary?.topJobs);
      const feedback = summary?.clientFeedback ?? {};

      const barData = topJobs.slice(0, 6).map((job: any) => ({
        label: String(job?.jobCode || job?.title || `Job ${job?.jobId || "-"}`),
        revenue: toNumber(job?.amountCollected ?? job?.feeAmount),
        profit: toNumber(job?.profit),
      }));

      return {
        title: "Partner Analytics",
        subtitle: "Portfolio margin, revenue, and client feedback trends.",
        stats: [
          {
            label: "Collected Revenue",
            value: formatCurrency(toNumber(portfolio?.totalRevenueCollected)),
            description: "Across your portfolio",
          },
          {
            label: "Total Profit",
            value: formatCurrency(toNumber(portfolio?.totalProfit)),
            description: "Revenue minus delivery cost",
          },
          {
            label: "Average Margin",
            value: formatPercent(toNumber(portfolio?.averageMargin)),
            description: "Portfolio profitability",
          },
          {
            label: "Survey Response",
            value: formatPercent(toNumber(feedback?.responseRate)),
            description: `${toNumber(feedback?.completedSurveys)}/${toNumber(feedback?.totalSurveys)} completed`,
          },
        ],
        pieTitle: "Portfolio Jobs Mix",
        pieDescription: "Jobs by lifecycle state in your portfolio.",
        pieData: normalizePie([
          { name: "Active", value: toNumber(portfolio?.activeJobs) },
          { name: "Completed", value: toNumber(portfolio?.completedJobs) },
          { name: "Pending", value: toNumber(portfolio?.pendingJobs) },
          { name: "Overdue", value: toNumber(portfolio?.overdueJobs) },
        ]),
        barTitle: "Top Job Performance",
        barDescription: "Revenue and profit for leading jobs.",
        barData,
        barSeries: [
          { key: "revenue", label: "Revenue", color: CHART_COLORS[0] },
          { key: "profit", label: "Profit", color: CHART_COLORS[1] },
        ],
        insights: [
          `${toNumber(portfolio?.jobsAwaitingPartner)} jobs currently awaiting partner action.`,
          "Focus on low-margin jobs to protect net portfolio outcomes.",
        ],
      };
    }
    case "hr": {
      const metrics = payload?.companyMetrics ?? {};
      const approvalControls = payload?.approvalControls ?? {};
      const missingInduction = asArray(payload?.missingInduction);

      const approvals = approvalControls?.approvals ?? {};
      const overBudget = approvals?.overBudget ?? {};
      const standard = approvals?.standard ?? {};

      return {
        title: "HR Analytics",
        subtitle: "Workforce health, evaluation coverage, and approval exposure.",
        stats: [
          {
            label: "Total Employees",
            value: String(toNumber(metrics?.totalEmployees)),
            description: "Active workforce records",
          },
          {
            label: "Active Evaluations",
            value: String(toNumber(metrics?.activeEvaluations)),
            description: `${toNumber(metrics?.pendingEvaluations)} pending`,
          },
          {
            label: "Utilization",
            value: formatPercent(toNumber(metrics?.utilizationRate)),
            description: "Company-wide billable rate",
          },
          {
            label: "Missing Induction",
            value: String(missingInduction.length),
            description: "Employees missing checklist",
          },
        ],
        pieTitle: "Approval Queue Mix",
        pieDescription: "Current approvals split by workflow stage.",
        pieData: normalizePie([
          { name: "Standard pending", value: toNumber(standard?.pending) },
          { name: "Over-budget pending", value: toNumber(overBudget?.pending) },
          { name: "Awaiting partner", value: toNumber(overBudget?.awaitingPartner) },
        ]),
        barTitle: "Financial Snapshot",
        barDescription: "Projected, collected, and outstanding company totals.",
        barData: [
          { label: "Projected", amount: toNumber(metrics?.projectedMonth) },
          { label: "Collected", amount: toNumber(metrics?.collectedMonth) },
          { label: "Outstanding", amount: toNumber(metrics?.totalOutstanding) },
        ],
        barSeries: [{ key: "amount", label: "Amount", color: CHART_COLORS[0] }],
        insights: [
          `${toNumber(approvalControls?.controls?.jobsOverFeeCap)} jobs are currently above fee cap.`,
          "Clear pending evaluations early to reduce appraisal backlog.",
        ],
      };
    }
    case "gmp":
    default: {
      const overview = payload?.overview ?? {};
      const firmMetrics = overview?.firmMetrics ?? {};
      const financials = overview?.financials ?? {};
      const departments = asArray(overview?.departmentBreakdown);
      const partners = asArray(overview?.partnerRankings);
      const pipeline = payload?.pipelineMetrics ?? {};

      const departmentPie = departments
        .slice(0, 6)
        .map((dept: any) => ({
          name: String(dept?.departmentCode || dept?.departmentName || `Dept ${dept?.departmentId || "-"}`),
          value: toNumber(dept?.departmentRevenue),
        }));

      const partnerBars = partners.slice(0, 6).map((partner: any) => ({
        label: String(partner?.name || `Partner ${partner?.partnerId || "-"}`),
        revenue: toNumber(partner?.portfolioRevenue),
        profit: toNumber(partner?.portfolioProfit),
      }));

      return {
        title: "Executive Analytics",
        subtitle: "Firm-wide performance pulse across departments and partners.",
        stats: [
          {
            label: "Total Employees",
            value: String(toNumber(firmMetrics?.totalEmployees)),
            description: "Firm headcount",
          },
          {
            label: "Active Jobs",
            value: String(toNumber(firmMetrics?.activeJobs)),
            description: "Open delivery portfolio",
          },
          {
            label: "Collected Revenue",
            value: formatCurrency(toNumber(financials?.collectedAmount || financials?.totalRevenue)),
            description: "Firm total collections",
          },
          {
            label: "Pipeline Value",
            value: formatCurrency(toNumber(pipeline?.pipelineValue)),
            description: `${toNumber(pipeline?.totalOpportunities)} opportunities`,
          },
        ],
        pieTitle: "Department Revenue Split",
        pieDescription: "Top departments by collected revenue.",
        pieData: normalizePie(departmentPie),
        barTitle: "Partner Revenue vs Profit",
        barDescription: "Top partner portfolio outcomes.",
        barData: partnerBars,
        barSeries: [
          { key: "revenue", label: "Revenue", color: CHART_COLORS[0] },
          { key: "profit", label: "Profit", color: CHART_COLORS[1] },
        ],
        insights: [
          `${toNumber(firmMetrics?.totalDepartments)} departments currently in the reporting structure.`,
          "Compare partner profitability against department revenue concentration.",
        ],
      };
    }
  }
};

export default function ModuleAnalytics({ module }: ModuleAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>({});

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const nextPayload = await loadModuleData(module);
        setPayload(nextPayload);
      } catch (err: any) {
        console.error("Failed to load analytics", err);
        setPayload({});
        setError(err?.message || "Unable to load analytics data right now.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [module]);

  const model = useMemo(() => buildAnalyticsModel(module, payload), [module, payload]);
  const hasPieData = model.pieData.length > 0;
  const hasBarData = model.barData.length > 0;

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading analytics..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{model.title}</h1>
          <p className="text-muted-foreground">{model.subtitle}</p>
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Analytics data is partially unavailable
              </CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {model.stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="metric-value">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
                {model.pieTitle}
              </CardTitle>
              <CardDescription>{model.pieDescription}</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {hasPieData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={model.pieData} dataKey="value" nameKey="name" outerRadius={98}>
                      {model.pieData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: unknown) => toNumber(value).toLocaleString("en-KE")} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No chart data yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                {model.barTitle}
              </CardTitle>
              <CardDescription>{model.barDescription}</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {hasBarData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.barData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(value: unknown) => toNumber(value).toLocaleString("en-KE")} />
                    <Legend />
                    {model.barSeries.map((series) => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        name={series.label}
                        fill={series.color}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No chart data yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Actionable Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {model.insights.map((insight) => (
              <p key={insight}>{insight}</p>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
