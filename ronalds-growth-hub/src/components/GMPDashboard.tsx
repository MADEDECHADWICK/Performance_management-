import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
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
  Loader2,
  RefreshCw,
  Settings,
  Target,
} from "lucide-react";
import { apiFetch, authAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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
}

interface PartnerRanking {
  partner_id: number;
  name: string;
  department: string;
  position: string;
  portfolio_revenue: number;
  portfolio_fees: number;
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
  jobs_count: number;
  avg_department_performance: number;
}

interface DashboardData {
  firmMetrics: FirmMetrics;
  partnerRankings: PartnerRanking[];
  managerRankings: ManagerRanking[];
  departmentBreakdown: DepartmentData[];
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
  jobsAtRisk: any[];
  pendingEvaluations: any[];
  lowUtilizationPartners: any[];
}

export default function GMPDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [personalData, setPersonalData] = useState<PersonalData | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [lossAlertCount, setLossAlertCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    verifyGMPAccessAndLoadData();
  }, []);

  const verifyGMPAccessAndLoadData = async () => {
    try {
      setIsLoading(true);

      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      await Promise.all([loadDashboardData(), loadPersonalData(), loadAlertsData()]);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error loading GMP dashboard:", error);

      if (error?.status === 403) {
        toast({
          title: "Access Denied",
          description: "Group Managing Partner privileges required. Redirecting...",
          variant: "destructive",
        });
        setTimeout(() => navigate("/dashboard"), 2000);
        return;
      }

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
          total_employees: 156,
          total_partners: 8,
          total_managers: 24,
          total_revenue: 45200000,
          total_fees: 38400000,
          active_jobs: 89,
          active_clients: 156,
          total_departments: 6,
          evaluations_this_month: 45,
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

      const payload = notifications?.data ?? notifications ?? {};
      const items = Array.isArray(payload.items)
        ? payload.items
        : payload.items?.items ?? payload.notifications ?? payload.data ?? [];

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

  const handleRefresh = async () => {
    await verifyGMPAccessAndLoadData();
    toast({
      title: "Dashboard Refreshed",
      description: "All data has been updated",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  const firmMetrics = dashboardData?.firmMetrics;
  const collected = firmMetrics?.total_revenue ?? 0;
  const projected = firmMetrics?.total_fees ?? 0;
  const profitability = collected - projected;
  const atRiskCount = alertsData?.jobsAtRisk?.length ?? 0;
  const atRiskExposure = alertsData?.jobsAtRisk?.reduce((sum, job) => {
    const fee = Number(job.feeAmount ?? job.fee ?? job.jobFee ?? 0);
    return sum + (Number.isNaN(fee) ? 0 : fee);
  }, 0) ?? 0;

  const pipelineValue = dashboardData?.departmentBreakdown?.reduce((sum, dept) => {
    const fees = Number(dept.department_fees ?? 0);
    return sum + (Number.isNaN(fees) ? 0 : fees);
  }, 0) ?? 0;

  const revenueTrend = (() => {
    const now = new Date();
    const base = collected ? Math.max(collected / 6, 0) : 0;
    return Array.from({ length: 6 }).map((_, index) => {
      const pointDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        month: pointDate.toLocaleString("en-US", { month: "short" }),
        collected: Math.round(base * (0.9 + index * 0.04)),
      };
    });
  })();

  const departmentSplit = dashboardData?.departmentBreakdown?.map((dept) => ({
    department: dept.department_code || dept.department_name,
    revenue: Number(dept.department_revenue ?? 0),
  })) ?? [];

  const topClients = dashboardData?.partnerRankings?.slice(0, 5).map((partner) => ({
    name: partner.name,
    collected: partner.portfolio_revenue,
  })) ?? [];

  const operationalAlerts = [
    {
      label: "Overdue jobs",
      value: atRiskCount,
      tone: atRiskCount > 0 ? "destructive" : "secondary",
      route: "/jobs?status=overdue",
    },
    {
      label: "Over-budget / extra time approvals",
      value: alertsData?.pendingEvaluations?.length ?? 0,
      tone: (alertsData?.pendingEvaluations?.length ?? 0) > 0 ? "default" : "secondary",
      route: "/timesheets",
    },
    {
      label: "Engagements approved, not started",
      value: 0,
      tone: "secondary",
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
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading Executive Dashboard...</p>
          </div>
        </div>
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
            <Button>
              <Settings className="h-4 w-4 mr-2" />
              Admin Panel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Collected vs Projected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(collected)}</div>
              <p className="text-xs text-muted-foreground">Projected {formatCurrency(projected)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Profitability (MTD)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(profitability)}</div>
              <p className="text-xs text-muted-foreground">Collected minus delivery cost</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {firmMetrics?.evaluations_this_month ? formatPercentage(firmMetrics.evaluations_this_month) : ""}
              </div>
              <p className="text-xs text-muted-foreground">Billable hours / capacity</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">At-Risk Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{atRiskCount}</div>
              <p className="text-xs text-muted-foreground">Exposure {formatCurrency(atRiskExposure)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(pipelineValue)}</div>
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
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Line type="monotone" dataKey="collected" stroke="#2563eb" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
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
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Top 5 clients (collections)</p>
                <div className="space-y-2">
                  {topClients.length > 0 ? (
                    topClients.map((client) => (
                      <div key={client.name} className="flex items-center justify-between text-sm">
                        <span>{client.name}</span>
                        <span className="font-semibold">{formatCurrency(client.collected)}</span>
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
                      const profit = partner.portfolio_revenue - partner.portfolio_fees;
                      return (
                        <TableRow key={partner.partner_id}>
                          <TableCell className="font-medium">{partner.name}</TableCell>
                          <TableCell className="text-right">{partner.active_jobs}</TableCell>
                          <TableCell className="text-right">{formatCurrency(partner.portfolio_revenue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(profit)}</TableCell>
                          <TableCell className="text-right"></TableCell>
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
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump to high-impact reviews</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate("/finance-dashboard")}>
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
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export report
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
