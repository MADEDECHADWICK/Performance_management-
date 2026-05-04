import DashboardLayout from "@/components/DashboardLayout";
import JobOperationsOverview from "@/components/jobs/JobOperationsOverview";
import PageLoader from '@/components/ui/page-loader';
import UserRoleManagement from "@/components/UserRoleManagement";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MiniStatGraph from "@/components/ui/mini-stat-graph";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Star,
  TrendingUp,
  Target,
  FileText,
  Bell,
  Lock,
  Building2,
  Users,
  Calendar,
  BarChart3,
  DollarSign,
  ChartCandlestick,
  TrendingDown,
  Award,
  AlertCircle,
  ClipboardCheck,
  Shield,
  Circle,
  RefreshCw,
  FileSpreadsheet,
  Clock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { timeEntriesAPI } from "@/lib/api/timeEntries";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Profile {
  first_name: string;
  last_name: string;
  email: string;
  position: string;
  department_id: string;
  phone: string;
}

interface PerformanceData {
  overallScore: number;
  revenueContribution: number;
  billableHours: number;
  utilizationRate: number;
  clientRating: number;
  clientReviewCount: number;
  financialScore: number;
  customerScore: number;
  internalProcessScore: number;
  learningGrowthScore: number;
  projectEvaluationScore: number;
  lossAlert?: boolean;
}

interface CompanyMetrics {
  totalEmployees: number;
  activeEvaluations: number;
  pendingEvaluations: number;
  avgPerformance: number;
  projectedMonth: number;
  collectedMonth: number;
  varianceMonth: number;
  totalCollected: number;
  totalOutstanding: number;
  totalFees: number;
  collectionRate: number;
  firmProfit: number;
  utilizationRate: number;
  overdueJobs: number;
}

interface NotificationCard {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

interface TimeRevenueData {
  nonBillableByCategory: Array<{ nonBillableCategory: string; _sum: { hours: number } }>;
  firmPipeline: {
    billableValue: number;
    billedRevenue: number;
    collectedRevenue: number;
    outstandingRevenue: number;
    totalHours: number;
    billableHours: number;
    nonBillableHours: number;
    utilizationRate: number;
  };
  departmentUtilization: Array<{
    departmentId: number;
    departmentName: string;
    billableHours: number;
    nonBillableHours: number;
    totalHours: number;
    utilizationRate: number;
    revenue: number;
  }>;
  lossAlertJobs: Array<{ jobId: number; jobName: string; cashProfit: number; marginPercent: number }>;
  monthlyTrend: Array<{ month: string; billable: number; nonBillable: number }>;
}

interface HrApprovalControls {
  controls: {
    totalJobs: number;
    totalPlannedCost: number;
    totalActualCost: number;
    totalPlannedHours: number;
    totalActualHours: number;
    totalCostVariance: number;
    totalHoursVariance: number;
    jobsOverPlannedCost: number;
    jobsOverPlannedHours: number;
    jobsOverFeeCap: number;
  };
  approvals: {
    standard: {
      pending: number;
      approved: number;
      rejected: number;
      cancelled: number;
    };
    overBudget: {
      pending: number;
      awaitingPartner: number;
      managerRejected: number;
      partnerApproved: number;
      partnerRejected: number;
      autoRejected: number;
    };
  };
  overBudgetRequests: Array<{
    id: number;
    jobId: number;
    trackingPath?: string | null;
    jobName: string;
    clientName?: string | null;
    employeeName?: string;
    status: string;
    requestedAdditional: number;
    estimatedCostImpact: number;
    createdAt?: string;
    approvalNotes?: string | null;
    rejectionReason?: string | null;
  }>;
}

const HRDashboard = () => {
  const { user, isLoading: authLoading, isAdmin, hasModuleAccess, hasViewAccess } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [companyMetrics, setCompanyMetrics] = useState<CompanyMetrics | null>(null);
  const [subordinates, setSubordinates] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<NotificationCard[]>([]);
  const [approvalControls, setApprovalControls] = useState<HrApprovalControls | null>(null);
  const [timeRevenue, setTimeRevenue] = useState<TimeRevenueData | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [missingChecklistCount, setMissingChecklistCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecomputeLoading, setIsRecomputeLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    loadAllData();
  }, [authLoading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapProfile = (user: any) => {
    const profile = user?.profile;
    if (!profile) return null;
    return {
      first_name: profile.firstName ?? profile.first_name ?? "",
      last_name: profile.lastName ?? profile.last_name ?? "",
      email: user.email ?? profile.email ?? "",
      position: profile.positionTitle ?? profile.position ?? profile.role?.name ?? "",
      department_id: profile.departmentId ?? profile.department_id ?? "",
      phone: profile.phoneNumber ?? profile.phone_number ?? "",
    } as Profile;
  };

  const loadAllData = async () => {
    try {
      if (!user) return;
      const profileId = user?.profile?.id ?? user.id;

      await Promise.all([
        loadPendingTasks(user.id),
        loadNotifications(),
        loadPersonalPerformance(profileId),
        loadCompanyMetrics(),
        loadApprovalControls(),
        loadSubordinates(profileId),
        loadMissingChecklists(),
        loadTimeRevenue(),
      ]);

      const mapped = mapProfile(user);
      if (mapped) setProfile(mapped);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendingTasks = async (_userId: number | string) => {
    const response = await apiFetch('GET', '/notifications?status=unread&page=1&pageSize=100');
    const payload: any = response ?? {};
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.items)
          ? payload.items
          : [];
    setPendingTasks(items.length || 0);
  };

  const loadNotifications = async () => {
    try {
      const response = await apiFetch("GET", "/notifications?page=1&pageSize=5");
      const payload: any = response ?? {};
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.items)
            ? payload.items
            : [];
      setNotifications(Array.isArray(items) ? items : []);

      const unreadResponse = await apiFetch("GET", "/notifications/unread-count");
      const unreadPayload = unreadResponse?.data ?? unreadResponse ?? {};
      const unread = unreadPayload.unreadCount ?? unreadPayload.unread ?? 0;
      setUnreadCount(unread);
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  };

  const resolveNotificationLink = (link?: string | null) => {
    if (!link) return "/notifications";
    const rawLink = link.trim();
    const jobMatch = rawLink.match(/^\/jobs\/(\d+)(?:\/.*)?$/);
    if (jobMatch) {
      const jobId = Number(jobMatch[1]);
      if (hasModuleAccess("jobs", "read")) {
        return `/jobs/${jobId}/tracking`;
      }
      return `/timesheets?jobId=${jobId}`;
    }
    if (rawLink === "/onboarding") {
      return "/profile";
    }
    return rawLink;
  };

  const resolveTrackingPath = (jobId: number, trackingPath?: string | null) =>
    trackingPath || `/jobs/${jobId}/tracking`;

  const markNotificationRead = async (id: number) => {
    try {
      await apiFetch("PATCH", `/notifications/${id}/read`);
      await loadNotifications();
    } catch (error) {
      console.error("Error marking notification read", error);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await apiFetch("PATCH", "/notifications/read-all");
      await loadNotifications();
    } catch (error) {
      console.error("Error marking all notifications read", error);
    }
  };

  const loadPersonalPerformance = async (profileId: number | string) => {
    try {
      const performanceResponse = await apiFetch('GET', '/performance-scores/me');
      const performancePayload = (performanceResponse as any)?.data ?? performanceResponse;

      if (performancePayload?.financial && performancePayload?.overall) {
        const financial = performancePayload.financial;
        const nonFinancial = performancePayload.nonFinancial || {};
        const utilizationPercent = Math.round((financial.utilizationRate || 0) * 100);
        const customerRating =
          typeof nonFinancial.customerSatisfactionScore === 'number'
            ? Math.round((nonFinancial.customerSatisfactionScore / 20) * 10) / 10
            : 0;
        const lossAlert = Boolean(performancePayload?.scoreBreakdown?.lossAlert);

        setPerformance({
          overallScore: Math.round((performancePayload.overall.totalScore || 0) * 10) / 10,
          revenueContribution: financial.revenue || 0,
          billableHours: financial.billableHours || 0,
          utilizationRate: utilizationPercent,
          clientRating: customerRating,
          clientReviewCount: 0,
          financialScore: Math.round(financial.financialWeighted || 0),
          customerScore: Math.round(nonFinancial.customerSatisfactionScore || 0),
          internalProcessScore: Math.round(nonFinancial.internalProcessesScore || 0),
          learningGrowthScore: Math.round(nonFinancial.learningGrowthScore || 0),
          projectEvaluationScore: Math.round(nonFinancial.projectEvaluationScore || 0),
          lossAlert,
        });
        return;
      }

      const asRows = (payload: any) => {
        if (Array.isArray(payload)) return payload;
        return Array.isArray(payload?.data) ? payload.data : [];
      };
      const toNumber = (value: any) => {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      // Fallback source paths aligned to mounted backend routes.
      const allocationsPayload = await apiFetch(
        'GET',
        `/employee-project-allocations?employeeIds=${profileId}`
      );
      const allocations = asRows(allocationsPayload);
      const totalRevenue = allocations.reduce(
        (sum, row) =>
          sum +
          toNumber(
            row.allocationAmount ??
            row.allocation_amount ??
            row.allocatedAmount ??
            row.allocated_amount
          ),
        0
      );
      const totalBillableHours = allocations.reduce(
        (sum, row) =>
          sum +
          toNumber(
            row.billableHours ??
            row.billable_hours ??
            row.allocatedHours ??
            row.allocated_hours
          ),
        0
      );

      const clientEvalsPayload = await apiFetch(
        'GET',
        `/client-evaluations?employeeIds=${profileId}`
      );
      const clientEvals = asRows(clientEvalsPayload);
      const avgClientRating = clientEvals.length > 0
        ? clientEvals.reduce(
            (sum, row) => sum + toNumber(row.overallRating ?? row.overall_rating),
            0
          ) / clientEvals.length
        : 0;

      const utilizationRate = Math.min(100, (totalBillableHours / 160) * 100);
      const financialScore = Math.min(100, Math.round(utilizationRate));
      const customerScore = Math.min(100, Math.round(avgClientRating * 20));
      const internalProcessScore = 0;
      const learningGrowthScore = 0;

      const overallScore = (
        financialScore * 0.40 +
        customerScore * 0.30 +
        internalProcessScore * 0.20 +
        learningGrowthScore * 0.10
      );

      setPerformance({
        overallScore: Math.round(overallScore * 10) / 10,
        revenueContribution: totalRevenue,
        billableHours: totalBillableHours,
        utilizationRate: Math.round(utilizationRate),
        clientRating: Math.round(avgClientRating * 10) / 10,
        clientReviewCount: clientEvals?.length || 0,
        financialScore: Math.round(financialScore),
        customerScore: Math.round(customerScore),
        internalProcessScore: Math.round(internalProcessScore),
        learningGrowthScore: Math.round(learningGrowthScore),
        projectEvaluationScore: 0,
        lossAlert: false,
      });
    } catch (error) {
      console.error("Error loading performance:", error);
    }
  };

  const handleRecomputeScores = async () => {
    try {
      setIsRecomputeLoading(true);
      await apiFetch("POST", "/performance-scores/recalculate", {});
      toast({
        title: "Scores refreshed",
        description: "Performance scores have been recalculated.",
      });
      if (user?.profile?.id || user?.id) {
        await loadPersonalPerformance(user?.profile?.id ?? user?.id);
      }
      await loadCompanyMetrics();
    } catch (error) {
      console.error("Error recalculating scores:", error);
      toast({
        title: "Error",
        description: "Failed to recalculate performance scores.",
        variant: "destructive",
      });
    } finally {
      setIsRecomputeLoading(false);
    }
  };

  const loadCompanyMetrics = async () => {
    try {
      const metrics = await apiFetch('GET', '/hr-dashboard/company-metrics');
      setCompanyMetrics(metrics);
    } catch (error) {
      console.error("Error loading company metrics:", error);
    }
  };

  const loadApprovalControls = async () => {
    try {
      const response = await apiFetch('GET', '/hr-dashboard/approval-controls');
      const payload = response?.data ?? response ?? null;
      setApprovalControls(payload);
    } catch (error) {
      console.error("Error loading HR approval controls:", error);
      setApprovalControls(null);
    }
  };

  const loadTimeRevenue = async () => {
    try {
      const response = await apiFetch('GET', '/hr-dashboard/time-revenue');
      const payload = response?.data ?? response ?? null;
      setTimeRevenue(payload);
    } catch (error) {
      console.error("Error loading time-revenue data:", error);
      setTimeRevenue(null);
    }
  };

  const handleApproveOverBudget = async (requestId: number) => {
    try {
      const notes = window.prompt('Approval notes (optional):') || undefined;
      await timeEntriesAPI.approveOverBudgetRequest(requestId, notes);
      await loadApprovalControls();
      await loadCompanyMetrics();
      toast({
        title: "Approved",
        description: "Over-budget request has been approved.",
      });
    } catch (error: any) {
      toast({
        title: "Approval failed",
        description: error?.message || "Unable to approve over-budget request.",
        variant: "destructive",
      });
    }
  };

  const handleRejectOverBudget = async (requestId: number) => {
    try {
      const notes = window.prompt('Rejection reason (optional):') || undefined;
      await timeEntriesAPI.rejectOverBudgetRequest(requestId, notes);
      await loadApprovalControls();
      await loadCompanyMetrics();
      toast({
        title: "Rejected",
        description: "Over-budget request has been rejected.",
      });
    } catch (error: any) {
      toast({
        title: "Rejection failed",
        description: error?.message || "Unable to reject over-budget request.",
        variant: "destructive",
      });
    }
  };

  const loadMissingChecklists = async () => {
    try {
      const response = await apiFetch("GET", "/employees/missing-induction");
      const items = response?.data ?? response ?? [];
      setMissingChecklistCount(Array.isArray(items) ? items.length : 0);
    } catch (error) {
      console.error("Error loading missing checklists", error);
      setMissingChecklistCount(0);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);

  const loadSubordinates = async (profileId: number | string) => {
    try {
      const subs = await apiFetch('GET', `/subordinates?profileId=${profileId}`);
      setSubordinates(subs || []);
    } catch (error) {
      console.error("Error loading subordinates:", error);
    }
  };

  const canViewPersonalTab = hasModuleAccess("dashboard", "read");
  const canViewCompanyTab = hasModuleAccess("reports", "read") || hasModuleAccess("dashboard", "read");
  const canViewRoleTab =
    hasViewAccess("people.role_access_management") &&
    hasModuleAccess("access_control", "admin");
  const canViewManagementTab =
    hasModuleAccess("users", "read") ||
    hasModuleAccess("jobs", "read") ||
    hasModuleAccess("finance", "read");
  const canRecomputeScores = hasModuleAccess("reports", "admin");

  const enabledTabs = useMemo(() => {
    const tabs: string[] = [];
    if (canViewPersonalTab) tabs.push("personal");
    if (canViewCompanyTab) tabs.push("company");
    if (canViewRoleTab) tabs.push("roles");
    if (canViewManagementTab) tabs.push("management");
    return tabs;
  }, [canViewCompanyTab, canViewManagementTab, canViewPersonalTab, canViewRoleTab]);

  const defaultTab = enabledTabs[0] || "personal";
  const canUseDepartmentTools = hasModuleAccess("dashboard", "read");
  const canManageEmployees = hasModuleAccess("users", "read");
  const canManageEvaluations = hasModuleAccess("evaluations", "read");
  const canViewFinanceTools = hasModuleAccess("finance", "read");
  const canViewAuditLogs = hasModuleAccess("reports", "read");
  const hrJobMetrics = [
    {
      label: "Firm fee book",
      value: formatCurrency(companyMetrics?.totalFees || 0),
      hint: `Collected ${formatCurrency(companyMetrics?.totalCollected || 0)}`,
      icon: DollarSign,
      tone: "primary" as const,
      graphValue: companyMetrics?.totalFees || 0,
      graphBaseline: companyMetrics?.totalCollected || 0,
    },
    {
      label: "Firm profit",
      value: formatCurrency(companyMetrics?.firmProfit || 0),
      hint: `Collection rate ${(companyMetrics?.collectionRate || 0).toFixed(1)}%`,
      icon: TrendingUp,
      tone: (companyMetrics?.firmProfit || 0) >= 0 ? ("positive" as const) : ("danger" as const),
      graphValue: companyMetrics?.firmProfit || 0,
      graphBaseline: 0,
      inverse: (companyMetrics?.firmProfit || 0) < 0,
    },
    {
      label: "Utilization watch",
      value: `${(companyMetrics?.utilizationRate || 0).toFixed(0)}%`,
      hint: `${companyMetrics?.totalEmployees || 0} active employees`,
      icon: Users,
      tone: "warning" as const,
      graphValue: companyMetrics?.utilizationRate || 0,
      graphBaseline: 75,
    },
    {
      label: "Overdue jobs",
      value: String(companyMetrics?.overdueJobs || 0),
      hint: `Outstanding ${formatCurrency(companyMetrics?.totalOutstanding || 0)}`,
      icon: AlertCircle,
      tone: "danger" as const,
      graphValue: companyMetrics?.overdueJobs || 0,
      graphBaseline: 0,
      inverse: true,
    },
  ];

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  if (enabledTabs.length === 0) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>
              Your account does not currently have module permissions for this dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              {profile?.position || "HR"} Dashboard
            </h2>
            <p className="text-muted-foreground">
              View your personal performance and manage company-wide operations
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasViewAccess("reports.workspace") && (
              <Link to="/reports">
                <Button size="sm" variant="outline">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Open Reports
                </Button>
              </Link>
            )}
            {canRecomputeScores && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRecomputeScores}
                disabled={isRecomputeLoading}
              >
                {isRecomputeLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Recompute scores
              </Button>
            )}
          </div>
        </div>

        <JobOperationsOverview
          title="Firmwide job operations"
          description=""
          metrics={hrJobMetrics}
          showLocator={false}
        />

        <Tabs key={defaultTab} defaultValue={defaultTab} className="w-full min-w-0">
          <TabsList className="mb-6 grid h-auto w-full min-w-0 grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-4">
            {canViewPersonalTab && (
              <TabsTrigger value="personal" className="min-w-0 px-2 py-2">
                <User className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">My Performance</span>
              </TabsTrigger>
            )}
            {canViewCompanyTab && (
              <TabsTrigger value="company" className="min-w-0 px-2 py-2">
                <Building2 className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">Company Overview</span>
              </TabsTrigger>
            )}
            {canViewRoleTab && (
              <TabsTrigger value="roles" className="min-w-0 px-2 py-2">
                <Shield className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">Role Management</span>
              </TabsTrigger>
            )}
            {canViewManagementTab && (
              <TabsTrigger value="management" className="min-w-0 px-2 py-2">
                <BarChart3 className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">Management Tools</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* My Performance Tab - Personal Data Only */}
          {canViewPersonalTab && (
          <TabsContent value="personal" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">My Overall Score</CardTitle>
                  <div className="flex items-center gap-2">
                    {performance?.lossAlert && (
                      <Badge variant="destructive">Loss alert</Badge>
                    )}
                    <Star className="h-4 w-4 text-accent" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {performance?.overallScore || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Based on BSC framework</p>
                  <MiniStatGraph
                    value={performance?.overallScore || 0}
                    baseline={performance?.financialScore || 0}
                  />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">My Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    KES {((performance?.revenueContribution || 0) / 1000000).toFixed(1)}M
                  </div>
                  <p className="text-xs text-muted-foreground">Current fiscal year</p>
                  <MiniStatGraph value={performance?.revenueContribution || 0} />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">My Billable Hours</CardTitle>
                  <TrendingUp className="h-4 w-4 text-info" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {performance?.billableHours || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {performance?.utilizationRate || 0}% utilization
                  </p>
                  <MiniStatGraph
                    value={performance?.billableHours || 0}
                    baseline={performance?.utilizationRate || 0}
                  />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">My Client Rating</CardTitle>
                  <Users className="h-4 w-4 text-secondary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {performance?.clientRating || 0}/5.0
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {performance?.clientReviewCount || 0} reviews
                  </p>
                  <MiniStatGraph
                    value={performance?.clientRating || 0}
                    baseline={4}
                  />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Project Eval Score</CardTitle>
                  <Award className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {performance?.projectEvaluationScore || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">Job-based reviews</p>
                  <MiniStatGraph
                    value={performance?.projectEvaluationScore || 0}
                    baseline={performance?.learningGrowthScore || 0}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    My Performance Scorecard
                  </CardTitle>
                  <CardDescription>Balanced Scorecard framework breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">Financial (40%)</span>
                        <span className="text-primary font-semibold">
                          {performance?.financialScore || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-primary to-info h-2 rounded-full" 
                          style={{ width: `${performance?.financialScore || 0}%` }} 
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">Customer (30%)</span>
                        <span className="text-success font-semibold">
                          {performance?.customerScore || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-success to-secondary h-2 rounded-full" 
                          style={{ width: `${performance?.customerScore || 0}%` }} 
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">Internal Process (20%)</span>
                        <span className="text-info font-semibold">
                          {performance?.internalProcessScore || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-info to-primary h-2 rounded-full" 
                          style={{ width: `${performance?.internalProcessScore || 0}%` }} 
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">Learning & Growth (10%)</span>
                        <span className="text-secondary font-semibold">
                          {performance?.learningGrowthScore || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-secondary to-accent h-2 rounded-full" 
                          style={{ width: `${performance?.learningGrowthScore || 0}%` }} 
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">Project Evaluations</span>
                        <span className="text-warning font-semibold">
                          {performance?.projectEvaluationScore || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-warning to-destructive h-2 rounded-full"
                          style={{ width: `${performance?.projectEvaluationScore || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    {subordinates.length > 0 ? "My Team" : "Profile Information"}
                  </CardTitle>
                  <CardDescription>
                    {subordinates.length > 0 
                      ? `You manage ${subordinates.length} team member(s)` 
                      : "Your personal details"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subordinates.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        As a {profile?.position || "leader"}, you have access to your team's performance data in the Company Overview tab.
                      </div>
                      <Link to="/employee-management">
                        <Button className="w-full mt-2" variant="outline">
                          <Users className="h-4 w-4 mr-2" />
                          View Team Details
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm text-muted-foreground">Name</p>
                        <p className="font-medium">{profile?.first_name} {profile?.last_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Position</p>
                        <p className="font-medium">{profile?.position || "HR Manager"}</p>
                      </div>
                      <Link to="/profile">
                        <Button className="w-full" variant="outline">
                          <User className="h-4 w-4 mr-2" />
                          Edit Profile
                        </Button>
                      </Link>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          )}

          {/* Company Overview Tab - Analytics for HR/Admin */}
          {canViewCompanyTab && (
          <TabsContent value="company" className="space-y-6">
            {isAdmin && canRecomputeScores && (
              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRecomputeScores}
                  disabled={isRecomputeLoading}
                >
                  {isRecomputeLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Recompute scores
                </Button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {companyMetrics?.totalEmployees || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Active employees</p>
                  <MiniStatGraph value={companyMetrics?.totalEmployees || 0} />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Evaluations</CardTitle>
                  <Calendar className="h-4 w-4 text-info" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {companyMetrics?.activeEvaluations || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {companyMetrics?.pendingEvaluations || 0} pending completion
                  </p>
                  <MiniStatGraph
                    value={companyMetrics?.activeEvaluations || 0}
                    baseline={companyMetrics?.pendingEvaluations || 0}
                  />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Missing Checklists</CardTitle>
                  <ClipboardCheck className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {missingChecklistCount}
                  </div>
                  <p className="text-xs text-muted-foreground">Employees without induction</p>
                  <MiniStatGraph value={missingChecklistCount} baseline={0} inverse />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Collected (Month)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(companyMetrics?.collectedMonth || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Projected {formatCurrency(companyMetrics?.projectedMonth || 0)}
                  </p>
                  <MiniStatGraph
                    value={companyMetrics?.collectedMonth || 0}
                    baseline={companyMetrics?.projectedMonth || 0}
                  />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">Firm Profit (Month)</CardTitle>
                    {(companyMetrics?.firmProfit || 0) < 0 && (
                      <Badge variant="destructive">Loss</Badge>
                    )}
                  </div>
                  <DollarSign className="h-4 w-4 text-secondary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(companyMetrics?.firmProfit || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Collection rate {(companyMetrics?.collectionRate || 0).toFixed(1)}%
                  </p>
                  <MiniStatGraph value={companyMetrics?.firmProfit || 0} baseline={0} />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Utilization</CardTitle>
                  <ChartCandlestick className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {(companyMetrics?.utilizationRate || 0).toFixed(0)}%
                  </div>
                  <p className="text-xs text-muted-foreground">Billable vs total hours</p>
                  <MiniStatGraph value={companyMetrics?.utilizationRate || 0} baseline={75} />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Overdue Jobs</CardTitle>
                  <AlertCircle className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {companyMetrics?.overdueJobs || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Outstanding {formatCurrency(companyMetrics?.totalOutstanding || 0)}
                  </p>
                  <MiniStatGraph value={companyMetrics?.overdueJobs || 0} baseline={0} inverse />
                </CardContent>
              </Card>
            </div>

            {timeRevenue && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Time &amp; Revenue Pipeline
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Billable hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-emerald-600">
                        {(timeRevenue.firmPipeline.billableHours ?? 0).toFixed(0)}h
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Utilization {(timeRevenue.firmPipeline.utilizationRate ?? 0).toFixed(1)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Non-billable hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-amber-600">
                        {(timeRevenue.firmPipeline.nonBillableHours ?? 0).toFixed(0)}h
                      </div>
                      <p className="text-xs text-muted-foreground">
                        of {(timeRevenue.firmPipeline.totalHours ?? 0).toFixed(0)}h total
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Billed revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold">
                        {formatCurrency(timeRevenue.firmPipeline.billedRevenue ?? 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Collected {formatCurrency(timeRevenue.firmPipeline.collectedRevenue ?? 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-xl font-bold ${(timeRevenue.firmPipeline.outstandingRevenue ?? 0) > 0 ? 'text-rose-600' : 'text-foreground'}`}>
                        {formatCurrency(timeRevenue.firmPipeline.outstandingRevenue ?? 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Billable value {formatCurrency(timeRevenue.firmPipeline.billableValue ?? 0)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {timeRevenue.departmentUtilization.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Department Utilization
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {timeRevenue.departmentUtilization.map((dept) => (
                          <div key={dept.departmentId} className="flex items-center gap-3">
                            <span className="w-32 shrink-0 text-xs font-medium truncate">{dept.departmentName}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${Math.min(100, dept.utilizationRate)}%` }}
                              />
                            </div>
                            <span className={`w-12 shrink-0 text-right text-xs font-semibold ${dept.utilizationRate >= 70 ? 'text-emerald-600' : dept.utilizationRate >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {dept.utilizationRate.toFixed(0)}%
                            </span>
                            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                              {dept.billableHours.toFixed(0)}h
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {timeRevenue.lossAlertJobs.length > 0 && (
                  <Card className="border-rose-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2 text-rose-700">
                        <TrendingDown className="h-4 w-4" />
                        Loss Alert Jobs
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {timeRevenue.lossAlertJobs.slice(0, 5).map((job) => (
                          <div key={job.jobId} className="flex items-center justify-between gap-3 rounded-md border border-rose-100 p-2">
                            <span className="text-sm font-medium truncate">{job.jobName}</span>
                            <div className="flex shrink-0 gap-3 text-xs">
                              <span className="text-rose-600 font-semibold">{formatCurrency(job.cashProfit)}</span>
                              <Badge variant="destructive">{job.marginPercent.toFixed(1)}%</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Planned Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {formatCurrency(approvalControls?.controls?.totalPlannedCost || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across {approvalControls?.controls?.totalJobs || 0} jobs
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Actual Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {formatCurrency(approvalControls?.controls?.totalActualCost || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Approved time entries only
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Cost Variance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-xl font-bold ${
                      Number(approvalControls?.controls?.totalCostVariance || 0) > 0
                        ? 'text-destructive'
                        : 'text-foreground'
                    }`}
                  >
                    {formatCurrency(approvalControls?.controls?.totalCostVariance || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Planned vs actual
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Approval Chain</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {Number(approvalControls?.approvals?.standard?.pending || 0) +
                      Number(approvalControls?.approvals?.overBudget?.pending || 0) +
                      Number(approvalControls?.approvals?.overBudget?.awaitingPartner || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pending + awaiting partner
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Over-Budget Approval Chain
                </CardTitle>
                <CardDescription>
                  HR/Admin visibility into cost-control approvals and escalations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Pending: {approvalControls?.approvals?.overBudget?.pending || 0}
                  </Badge>
                  <Badge variant="secondary">
                    Awaiting partner: {approvalControls?.approvals?.overBudget?.awaitingPartner || 0}
                  </Badge>
                  <Badge variant="outline">
                    Over fee-cap jobs: {approvalControls?.controls?.jobsOverFeeCap || 0}
                  </Badge>
                </div>
                {(!approvalControls?.overBudgetRequests ||
                  approvalControls.overBudgetRequests.length === 0) && (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No over-budget requests in the chain right now.
                  </div>
                )}
                {approvalControls?.overBudgetRequests?.slice(0, 8).map((request) => (
                  <div key={request.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{request.jobName}</p>
                        <p className="text-xs text-muted-foreground">
                          {request.clientName || 'Client'} · {request.employeeName || 'Team member'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          +{Number(request.requestedAdditional || 0).toFixed(1)}h ·
                          {' '}Impact {formatCurrency(Number(request.estimatedCostImpact || 0))}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={request.status === 'pending' ? 'secondary' : 'outline'}>
                          {String(request.status).replace(/_/g, ' ')}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {request.createdAt ? new Date(request.createdAt).toLocaleDateString() : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Link to={resolveTrackingPath(request.jobId, request.trackingPath)}>
                        <Button size="sm" variant="ghost">
                          Open tracking
                        </Button>
                      </Link>
                      {request.status !== 'manager_approved' && (
                        <p className="text-xs text-muted-foreground">
                          Awaiting manager decision before partner stage.
                        </p>
                      )}
                    </div>
                    {isAdmin &&
                      request.status === 'manager_approved' && (
                        <div className="mt-2 flex items-center gap-2">
                          <Button size="sm" onClick={() => handleApproveOverBudget(request.id)}>
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRejectOverBudget(request.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Quick Access
                  </CardTitle>
                  <CardDescription>Navigate to key management areas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {canUseDepartmentTools && (
                    <Link to="/department-dashboard">
                      <Button className="w-full" variant="outline">
                        <Building2 className="h-4 w-4 mr-2" />
                        Department Analytics
                      </Button>
                    </Link>
                  )}
                  {canManageEmployees && (
                    <Link to="/employee-management">
                      <Button className="w-full" variant="outline">
                        <Users className="h-4 w-4 mr-2" />
                        Employee Overview
                      </Button>
                    </Link>
                  )}
                  {canViewFinanceTools && (
                    <Link to="/financial-summary">
                      <Button className="w-full" variant="outline">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Financial Reports
                      </Button>
                    </Link>
                  )}
                  {hasViewAccess("reports.workspace") && (
                    <Link to="/reports">
                      <Button className="w-full" variant="outline">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Open Reports Workspace
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    Notifications
                  </CardTitle>
                  <CardDescription>
                    {unreadCount} new {unreadCount === 1 ? "notification" : "notifications"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No recent notifications.
                    </p>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className="border border-border rounded-lg bg-background p-3"
                      >
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium break-words">{notification.title}</span>
                              {!notification.isRead && (
                                <Badge variant="secondary">Unread</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground break-words whitespace-normal">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markNotificationRead(notification.id)}
                              disabled={notification.isRead}
                            >
                              {notification.isRead ? "Read" : "Mark read"}
                            </Button>
                            {notification.link && (
                              <Link to={resolveNotificationLink(notification.link)}>
                                <Button size="sm" variant="link">
                                  View
                                </Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
                <div className="flex items-center justify-between px-6 pb-4">
                  <Button variant="ghost" size="sm" onClick={markAllNotificationsRead}>
                    Mark all read
                  </Button>
                  <Link to="/notifications">
                    <Button variant="link" size="sm">
                      View all
                    </Button>
                  </Link>
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    Performance Insights
                  </CardTitle>
                  <CardDescription>Company-wide performance summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-success mt-2" />
                    <div>
                      <p className="font-medium">Average performance</p>
                      <p className="text-muted-foreground text-xs">
                        {companyMetrics?.avgPerformance ? `${companyMetrics.avgPerformance.toFixed(1)}%` : 'No recent scores'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-info mt-2" />
                    <div>
                      <p className="font-medium">Projected vs collected</p>
                      <p className="text-muted-foreground text-xs">
                        Variance {formatCurrency(companyMetrics?.varianceMonth || 0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-warning mt-2" />
                    <div>
                      <p className="font-medium">Collections status</p>
                      <p className="text-muted-foreground text-xs">
                        Total collected {formatCurrency(companyMetrics?.totalCollected || 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          )}

          {/* Role Management Tab - Admin Only */}
          {canViewRoleTab && (
          <TabsContent value="roles" className="space-y-6">
            <UserRoleManagement />
          </TabsContent>
          )}

          {/* Management Tools Tab */}
          {canViewManagementTab && (
          <TabsContent value="management" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {canUseDepartmentTools && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Departments
                  </CardTitle>
                  <CardDescription>Manage organizational structure</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/department-dashboard">
                    <Button className="w-full">
                      <Building2 className="h-4 w-4 mr-2" />
                      Manage Departments
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              )}

              {canManageEmployees && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Employee Management
                  </CardTitle>
                  <CardDescription>Add, edit, and manage employees</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/employee-management">
                    <Button className="w-full">
                      <Users className="h-4 w-4 mr-2" />
                      Manage Employees
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              )}

              {canManageEvaluations && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Evaluation Cycles
                  </CardTitle>
                  <CardDescription>Create and manage review periods</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/evaluations/cycles">
                    <Button className="w-full">
                      <Calendar className="h-4 w-4 mr-2" />
                      Manage Evaluations
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              )}

              {canViewFinanceTools && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Financial Data
                  </CardTitle>
                  <CardDescription>View and analyze financial metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/financial-summary">
                    <Button className="w-full">
                      <DollarSign className="h-4 w-4 mr-2" />
                      Financial Summary
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              )}

              {canManageEmployees && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Positions & Rates
                  </CardTitle>
                  <CardDescription>Manage billing positions and hourly rates</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/positions-rates">
                    <Button className="w-full">
                      <DollarSign className="h-4 w-4 mr-2" />
                      Manage Positions
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              )}

              {canViewAuditLogs && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    System Settings
                  </CardTitle>
                  <CardDescription>Configure system preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/audit-logs">
                    <Button className="w-full">
                      <FileText className="h-4 w-4 mr-2" />
                      View Audit Logs
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              )}
            </div>
          </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default HRDashboard;


