import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from "@/components/ui/page-loader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  Crown,
  Download,
  RefreshCw,
  Settings,
  Target,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface FirmMetrics {
  total_employees: number;
  total_partners: number;
  total_managers: number;
  total_revenue: number;
  total_fees: number;
  active_jobs: number;
  active_clients: number;
  total_departments: number;
  evaluations_this_month: number;
  utilization_rate?: number;
}

interface PartnerRanking {
  partner_id: number;
  name: string;
  department: string;
  position: string;
  portfolio_revenue: number;
  portfolio_fees: number;
  portfolio_profit?: number;
  collection_rate?: number;
  utilization_rate?: number;
  active_jobs: number;
  direct_reports: number;
  client_count: number;
  avg_team_score: number;
}

interface ManagerRanking {
  manager_id: number;
  name: string;
  department: string;
  position: string;
  reports_to: string;
  team_size: number;
  team_total_hours: number;
  evaluation_count: number;
  avg_performance: number;
  jobs_managed: number;
  portfolio_revenue?: number;
  portfolio_fees?: number;
  portfolio_profit?: number;
  utilization_rate?: number;
  collection_rate?: number;
}

interface DepartmentData {
  department_id: number;
  department_name: string;
  department_code: string;
  employee_count: number;
  partner_count: number;
  manager_count: number;
  department_revenue: number;
  department_fees: number;
  collection_rate?: number;
  active_jobs?: number;
  jobs_count: number;
  avg_department_performance: number | null;
}

interface TopClient {
  client_id: number;
  client_name: string;
  total_collected: number;
  total_fees: number;
  outstanding_amount: number;
  active_jobs: number;
  collection_rate: number;
  projected_amount?: number;
  projection_collected?: number;
  variance?: number;
}

interface DashboardData {
  firmMetrics: FirmMetrics;
  financials?: {
    totalRevenue?: number;
    totalProfit?: number;
    projectedRevenue?: number;
    collectedAmount?: number;
    totalCost?: number;
    collectionRate?: number;
  };
  partnerRankings: PartnerRanking[];
  managerRankings: ManagerRanking[];
  departmentBreakdown: DepartmentData[];
  revenueTrend?: Array<{ month: string | Date; collected: number }>;
  projectionTrend?: Array<{ month: string | Date; projected: number; collected: number }>;
  alertsSummary?: {
    engagementsApprovedNotStarted?: number;
    pendingOverBudget?: number;
    pendingEvaluationsOver30Days?: number;
    atRiskJobs?: number;
    atRiskExposure?: number;
  };
  topClients?: TopClient[];
  riskSummary?: {
    atRiskJobs?: number;
    atRiskExposure?: number;
    overdueJobs?: number;
    onHoldJobs?: number;
  };
}

interface ProposalMetrics {
  totalOpportunities: number;
  pipelineValue: number;
  weightedPipelineValue: number;
  avgDealSize: number;
  conversionRate: number;
  wonThisMonth: number;
  lostThisMonth: number;
  hotLeads: number;
}

interface PersonalData {
  personalMetrics: {
    activeJobs: number;
    totalRevenue: number;
    totalFees: number;
    directReports: number;
    overallScore: number;
  };
  jobs: any[];
  directReports: any[];
}

interface AlertsData {
  jobsAtRisk: Array<{
    id: number;
    jobNumber?: string | null;
    jobName?: string | null;
    clientName?: string | null;
    status?: string;
    deadlineDate?: string | Date | null;
    daysOverdue?: number;
    feeAmount?: number;
    amountCollected?: number;
    outstandingAmount?: number;
    severity?: string;
  }>;
  pendingEvaluations: Array<{
    id: number;
    employeeName?: string;
    employeePosition?: string | null;
    managerName?: string | null;
    status?: string;
    daysPending?: number;
  }>;
  lowUtilizationPartners: Array<{
    id: number;
    name: string;
    position?: string | null;
    monthlyHours: number;
    billableHours?: number;
    utilizationRate?: number;
    activeJobs?: number;
  }>;
}

export default function GMPDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isGMP } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [personalData, setPersonalData] = useState<PersonalData | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [lossAlertCount, setLossAlertCount] = useState(0);
  const [pipelineMetrics, setPipelineMetrics] = useState<ProposalMetrics | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!isGMP) {
      toast({
        title: "Access Denied",
        description: "Group Managing Partner privileges required. Redirecting...",
        variant: "destructive",
      });
      setTimeout(() => navigate("/dashboard"), 2000);
      return;
    }
    verifyGMPAccessAndLoadData();
  }, [authLoading, user, isGMP, navigate, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const verifyGMPAccessAndLoadData = async () => {
    try {
      setIsLoading(true);

      await Promise.all([loadDashboardData(), loadPersonalData(), loadAlertsData(), loadPipelineMetrics()]);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error loading GMP dashboard:", error);

      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const data = await apiFetch("GET", "/gmp-dashboard/overview");
      setDashboardData(data);
    } catch (error) {
      console.error("Error loading dashboard overview:", error);
      setDashboardData({
        firmMetrics: {
          total_employees: 0,
          total_partners: 0,
          total_managers: 0,
          total_revenue: 0,
          total_fees: 0,
          active_jobs: 0,
          active_clients: 0,
          total_departments: 0,
          evaluations_this_month: 0,
        },
        partnerRankings: [],
        managerRankings: [],
        departmentBreakdown: [],
      });
    }
  };

  const loadPersonalData = async () => {
    try {
      const data = await apiFetch("GET", "/gmp-dashboard/personal");
      setPersonalData(data);
    } catch (error) {
      console.error("Error loading personal data:", error);
      setPersonalData({
        personalMetrics: {
          activeJobs: 0,
          totalRevenue: 0,
          totalFees: 0,
          directReports: 0,
          overallScore: 0,
        },
        jobs: [],
        directReports: [],
      });
    }
  };

  const loadAlertsData = async () => {
    try {
      const [alerts, notifications] = await Promise.all([
        apiFetch("GET", "/gmp-dashboard/alerts"),
        apiFetch("GET", "/notifications?type=warning&status=unread&page=1&pageSize=50"),
      ]);

      setAlertsData(alerts);

      const payload: any = notifications ?? {};
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.items)
            ? payload.items
            : Array.isArray(payload.notifications)
              ? payload.notifications
              : [];

      const lossAlerts = (Array.isArray(items) ? items : []).filter((item) => {
        const title = String(item?.title || "").toLowerCase();
        const message = String(item?.message || "").toLowerCase();
        return title.includes("loss") || message.includes("loss");
      });

      setLossAlertCount(lossAlerts.length);
    } catch (error) {
      console.error("Error loading alerts:", error);
      setAlertsData({
        jobsAtRisk: [],
        pendingEvaluations: [],
        lowUtilizationPartners: [],
      });
      setLossAlertCount(0);
    }
  };

  const loadPipelineMetrics = async () => {
    try {
      const data = await apiFetch("GET", "/proposals/metrics");
      setPipelineMetrics(data);
    } catch (error) {
      console.error("Error loading pipeline metrics:", error);
      setPipelineMetrics(null);
    }
  };

  const handleRefresh = async () => {
    await verifyGMPAccessAndLoadData();
    toast({
      title: "Dashboard Refreshed",
      description: "All data has been updated",
    });
  };

  const asNumber = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleExportReport = () => {
    if (!dashboardData) return;

    const lines: string[] = [];
    lines.push("Section,Metric,Value");
    lines.push(`Executive,Collected,${asNumber(dashboardData?.financials?.collectedAmount ?? 0)}`);
    lines.push(`Executive,Projected,${asNumber(dashboardData?.financials?.projectedRevenue ?? 0)}`);
    lines.push(`Executive,Profit,${asNumber(dashboardData?.financials?.totalProfit ?? 0)}`);
    lines.push(`Executive,Collection Rate,${asNumber(dashboardData?.financials?.collectionRate ?? 0).toFixed(2)}%`);
    lines.push(`Executive,At-Risk Jobs,${asNumber(dashboardData?.riskSummary?.atRiskJobs ?? 0)}`);
    lines.push(`Executive,At-Risk Exposure,${asNumber(dashboardData?.riskSummary?.atRiskExposure ?? 0)}`);

    (dashboardData.partnerRankings || []).forEach((partner) => {
      lines.push(`Partner,${partner.name} Revenue,${asNumber(partner.portfolio_revenue)}`);
      lines.push(`Partner,${partner.name} Profit,${asNumber(partner.portfolio_profit)}`);
      lines.push(`Partner,${partner.name} Utilization,${asNumber(partner.utilization_rate).toFixed(2)}%`);
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gmp-executive-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safe);
  };

  const formatCompactCurrency = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safe);
  };

  const formatPercentage = (value: number) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  const firmMetrics = dashboardData?.firmMetrics;
  const collected =
    dashboardData?.financials?.collectedAmount ??
    dashboardData?.financials?.totalRevenue ??
    firmMetrics?.total_revenue ??
    0;
  const projected =
    dashboardData?.financials?.projectedRevenue ??
    firmMetrics?.total_fees ??
    0;
  const profitability =
    dashboardData?.financials?.totalProfit ??
    (dashboardData?.financials?.totalCost !== undefined
      ? collected - Number(dashboardData?.financials?.totalCost || 0)
      : collected - projected);
  const collectionRate = dashboardData?.financials?.collectionRate ?? 0;
  const atRiskCount =
    dashboardData?.riskSummary?.atRiskJobs ??
    dashboardData?.alertsSummary?.atRiskJobs ??
    alertsData?.jobsAtRisk?.length ??
    0;
  const atRiskExposure =
    dashboardData?.riskSummary?.atRiskExposure ??
    dashboardData?.alertsSummary?.atRiskExposure ??
    alertsData?.jobsAtRisk?.reduce((sum, job) => {
      const outstanding = Number(job.outstandingAmount ?? 0);
      const fee = Number(job.feeAmount ?? 0);
      const contribution = Number.isFinite(outstanding) && outstanding > 0 ? outstanding : fee;
      return sum + (Number.isFinite(contribution) ? contribution : 0);
    }, 0) ??
    0;

  const pipelineValue = pipelineMetrics?.pipelineValue ?? 0;

  const revenueTrend: Array<{ month: string; collected: number; projected: number }> =
    dashboardData?.projectionTrend && dashboardData.projectionTrend.length > 0
      ? dashboardData.projectionTrend.map((row) => ({
          month: new Date(row.month).toLocaleString("en-US", { month: "short" }),
          collected: Number(row.collected || 0),
          projected: Number(row.projected || 0),
        }))
      : dashboardData?.revenueTrend && dashboardData.revenueTrend.length > 0
      ? dashboardData.revenueTrend.map((row) => ({
          month: new Date(row.month).toLocaleString("en-US", { month: "short" }),
          collected: Number(row.collected || 0),
          projected: 0,
        }))
      : [];

  const departmentSplit = dashboardData?.departmentBreakdown?.map((dept) => ({
    department: dept.department_code || dept.department_name,
    revenue: Number(dept.department_revenue ?? 0),
  })) ?? [];

  const topClients = (dashboardData?.topClients ?? []).slice(0, 5);

  const operationalAlerts = [
    {
      label: "Overdue jobs",
      value: dashboardData?.riskSummary?.overdueJobs ?? atRiskCount,
      tone: atRiskCount > 0 ? "destructive" : "secondary",
      route: "/jobs?status=overdue",
    },
    {
      label: "Evaluations pending over 30 days",
      value: dashboardData?.alertsSummary?.pendingEvaluationsOver30Days ?? alertsData?.pendingEvaluations?.length ?? 0,
      tone:
        (dashboardData?.alertsSummary?.pendingEvaluationsOver30Days ?? alertsData?.pendingEvaluations?.length ?? 0) > 0
          ? "destructive"
          : "secondary",
      route: "/evaluations",
    },
    {
      label: "Over-budget / extra time approvals",
      value: dashboardData?.alertsSummary?.pendingOverBudget ?? 0,
      tone: (dashboardData?.alertsSummary?.pendingOverBudget ?? 0) > 0 ? "default" : "secondary",
      route: "/timesheets",
    },
    {
      label: "Engagements approved, not started",
      value: dashboardData?.alertsSummary?.engagementsApprovedNotStarted ?? 0,
      tone: (dashboardData?.alertsSummary?.engagementsApprovedNotStarted ?? 0) > 0 ? "default" : "secondary",
      route: "/client-onboarding-queue",
    },
    {
      label: "Collections below projection",
      value: collected < projected ? 1 : 0,
      tone: collected < projected ? "destructive" : "secondary",
      route: "/finance-dashboard",
    },
  ];

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading Executive Dashboard..." minHeightClassName="min-h-[420px]" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-amber-400 to-yellow-600 rounded-full flex items-center justify-center">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">GMP Executive Overview</h1>
              <p className="text-gray-600">Firm pulse, risk, and partner performance at a glance</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <p className="text-gray-600">Last updated</p>
              <p className="font-semibold">{lastUpdated.toLocaleTimeString()}</p>
            </div>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => navigate("/role-management")}>
              <Settings className="h-4 w-4 mr-2" />
              Admin Panel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Collected vs Projected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="kpi-value text-primary" title={formatCurrency(collected)}>
                {formatCurrency(collected)}
              </div>
              <p className="text-xs text-muted-foreground">
                Projected {formatCurrency(projected)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="kpi-value text-primary">{formatPercentage(collectionRate)}</div>
              <p className="text-xs text-muted-foreground">Collected against total fee baseline</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Profitability (MTD)
                {profitability < 0 && <Badge variant="destructive">Loss</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="kpi-value text-primary" title={formatCurrency(profitability)}>
                {formatCurrency(profitability)}
              </div>
              <p className="text-xs text-muted-foreground">Collected minus delivery cost</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Utilization (MTD)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="kpi-value text-primary">
                {formatPercentage(firmMetrics?.utilization_rate ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">Billable vs total hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">At-Risk Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="kpi-value text-primary">{atRiskCount}</div>
              <p className="text-xs text-muted-foreground" title={formatCurrency(atRiskExposure)}>
                Exposure {formatCurrency(atRiskExposure)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="kpi-value text-primary" title={formatCurrency(pipelineValue)}>
                {formatCurrency(pipelineValue)}
              </div>
              <p className="text-xs text-muted-foreground">Expected revenue</p>
            </CardContent>
          </Card>
        </div>


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Firm Performance Snapshot
            </CardTitle>
            <CardDescription>Revenue trend, department split, and top clients</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">Revenue trend (last 6 months)</p>
              {revenueTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Line type="monotone" dataKey="collected" stroke="#2563eb" strokeWidth={3} />
                    <Line
                      type="monotone"
                      dataKey="projected"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">No trend data available yet.</p>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3">Department split</p>
                {departmentSplit.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={departmentSplit} dataKey="revenue" nameKey="department" outerRadius={70}>
                        {departmentSplit.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={["#2563eb", "#10b981", "#f59e0b", "#6366f1", "#ef4444"][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No department data yet.</p>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium text-muted-foreground mb-2">Pipeline snapshot</p>
                {pipelineMetrics ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Opportunities</span>
                      <span className="font-semibold">{pipelineMetrics.totalOpportunities}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Pipeline value</span>
                      <span className="font-semibold">{formatCurrency(pipelineMetrics.pipelineValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Conversion rate</span>
                      <span className="font-semibold">{pipelineMetrics.conversionRate}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Won / Lost (MTD)</span>
                      <span className="font-semibold">
                        {pipelineMetrics.wonThisMonth} / {pipelineMetrics.lostThisMonth}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No pipeline metrics yet.</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Top 5 clients (collections)</p>
                <div className="space-y-2">
                  {topClients.length > 0 ? (
                    topClients.map((client) => (
                      <div key={client.client_id} className="flex items-center justify-between text-sm">
                        <span className="truncate pr-3">{client.client_name}</span>
                        <span
                          className="font-semibold"
                          title={formatCurrency(client.total_collected)}
                        >
                          {formatCompactCurrency(client.total_collected)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No collection data yet.</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Operational Alerts
              {lossAlertCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  Loss alerts {lossAlertCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Firm-wide risks that require executive attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {operationalAlerts.map((alert) => (
              <div key={alert.label} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Badge variant={alert.tone as "default" | "secondary" | "destructive"}>{alert.value}</Badge>
                  <span className="text-sm font-medium">{alert.label}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => alert.route && navigate(alert.route)}
                  disabled={!alert.route}
                >
                  Review
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Partner Performance Summary</CardTitle>
            <CardDescription>Portfolio health, utilization, and profitability</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardData?.partnerRankings && dashboardData.partnerRankings.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">Active Jobs</TableHead>
                      <TableHead className="text-right">Collected (MTD)</TableHead>
                      <TableHead className="text-right">Profit / Loss</TableHead>
                      <TableHead className="text-right">Utilization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData.partnerRankings.map((partner) => {
                      const revenue = Number(partner.portfolio_revenue || 0);
                      const fees = Number(partner.portfolio_fees || 0);
                      const profit =
                        Number(partner.portfolio_profit ?? revenue - fees) || 0;
                      return (
                        <TableRow key={partner.partner_id}>
                          <TableCell className="font-medium">{partner.name}</TableCell>
                          <TableCell className="text-right">{partner.active_jobs}</TableCell>
                          <TableCell className="text-right" title={formatCurrency(revenue)}>
                            {formatCompactCurrency(revenue)}
                          </TableCell>
                          <TableCell className="text-right" title={formatCurrency(profit)}>
                            {formatCompactCurrency(profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number.isFinite(partner.utilization_rate) ? (
                              <Badge variant="outline">
                                {formatPercentage(partner.utilization_rate as number)}
                              </Badge>
                            ) : (
                              <Badge variant="outline">--</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Partner performance data is not yet available.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manager Performance Summary</CardTitle>
            <CardDescription>Delivery leadership, team output, and utilization</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardData?.managerRankings && dashboardData.managerRankings.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manager</TableHead>
                      <TableHead className="text-right">Team Size</TableHead>
                      <TableHead className="text-right">Jobs Managed</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Utilization</TableHead>
                      <TableHead className="text-right">Avg Team Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData.managerRankings.map((manager) => (
                      <TableRow key={manager.manager_id}>
                        <TableCell className="font-medium">{manager.name}</TableCell>
                        <TableCell className="text-right">{manager.team_size}</TableCell>
                        <TableCell className="text-right">{manager.jobs_managed}</TableCell>
                        <TableCell className="text-right">
                          {formatCompactCurrency(Number(manager.portfolio_revenue || 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">
                            {formatPercentage(Number(manager.utilization_rate || 0))}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{Number(manager.avg_performance || 0).toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Manager performance data is not yet available.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump to high-impact reviews</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate("/finance-projections")}>
              <Target className="h-4 w-4 mr-2" />
              View projections
            </Button>
            <Button variant="outline" onClick={() => navigate("/jobs") }>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Review at-risk jobs
            </Button>
            <Button variant="outline" onClick={() => navigate("/partner-portfolio-summary") }>
              <Briefcase className="h-4 w-4 mr-2" />
              View partner portfolio
            </Button>
            <Button variant="outline" onClick={() => navigate("/financial-summary")}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Open financial summary
            </Button>
            <Button variant="outline" onClick={() => navigate("/finance-balances")}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Review receivables
            </Button>
            <Button variant="outline" onClick={handleExportReport}>
              <Download className="h-4 w-4 mr-2" />
              Export report
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}


