import DashboardLayout from "@/components/DashboardLayout";
import UserRoleManagement from "@/components/UserRoleManagement";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  RefreshCw
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiFetch,  authAPI } from "@/lib/api";
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
  okrScore: number;
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

const HRDashboard = () => {
  const { isAdmin } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [companyMetrics, setCompanyMetrics] = useState<CompanyMetrics | null>(null);
  const [subordinates, setSubordinates] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<NotificationCard[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [missingChecklistCount, setMissingChecklistCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecomputeLoading, setIsRecomputeLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadAllData();
  }, []);

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
      const user = await authAPI.me();
      if (!user) return;

      await Promise.all([
        loadPendingTasks(user.id),
        loadNotifications(),
        loadPersonalPerformance(user.id),
        loadCompanyMetrics(),
        loadSubordinates(user.id),
        loadMissingChecklists()
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

  const loadPendingTasks = async (userId: string) => {
    const notifs = await apiFetch('GET', `/notifications?user_id=${userId}&is_read=false`);
    setPendingTasks((notifs || []).length || 0);
  };

  const loadNotifications = async () => {
    try {
      const response = await apiFetch("GET", "/notifications?page=1&pageSize=5");
      const payload = response?.data ?? response ?? {};
      const items = Array.isArray(payload.items) ? payload.items : payload.items?.items ?? [];
      setNotifications(Array.isArray(items) ? items : []);

      const unreadResponse = await apiFetch("GET", "/notifications/unread-count");
      const unreadPayload = unreadResponse?.data ?? unreadResponse ?? {};
      const unread = unreadPayload.unreadCount ?? unreadPayload.unread ?? 0;
      setUnreadCount(unread);
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  };

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

  const loadPersonalPerformance = async (userId: string) => {
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
          okrScore: Math.round(nonFinancial.okrScore || 0),
          projectEvaluationScore: Math.round(nonFinancial.projectEvaluationScore || 0),
          lossAlert,
        });
        return;
      }

      // Get employee allocations for revenue contribution
      const allocations = await apiFetch('GET', `/employee_project_allocations?employee_id=${userId}`);

      const totalRevenue = allocations?.reduce((sum, a) => sum + (a.allocation_amount || 0), 0) || 0;
      const totalBillableHours = allocations?.reduce((sum, a) => sum + (a.billable_hours || 0), 0) || 0;

      // Get client ratings
      const clientEvals = await apiFetch('GET', `/client_evaluations?employee_id=${userId}`);

      const avgClientRating = clientEvals && clientEvals.length > 0
        ? clientEvals.reduce((sum, e) => sum + (e.overall_rating || 0), 0) / clientEvals.length
        : 0;

      // Get KPI scores by BSC category
      const kpiAssignments = await apiFetch('GET', `/employee_kpi_assignments?employee_id=${userId}&include_kpis=true`);

      const financialKPIs = kpiAssignments?.filter(k => k.kpis?.bsc_category === "financial") || [];
      const customerKPIs = kpiAssignments?.filter(k => k.kpis?.bsc_category === "customer") || [];
      const internalKPIs = kpiAssignments?.filter(k => k.kpis?.bsc_category === "internal_processes") || [];
      const learningKPIs = kpiAssignments?.filter(k => k.kpis?.bsc_category === "learning_growth") || [];

      const calculateScore = (kpis: any[]) => {
        if (kpis.length === 0) return 0;
        const total = kpis.reduce((sum, k) => {
          const achieved = k.achieved_value || 0;
          const target = k.target_value || 1;
          return sum + (achieved / target) * 100;
        }, 0);
        return Math.min(100, total / kpis.length);
      };

      const financialScore = calculateScore(financialKPIs);
      const customerScore = calculateScore(customerKPIs);
      const internalProcessScore = calculateScore(internalKPIs);
      const learningGrowthScore = calculateScore(learningKPIs);

      const overallScore = (
        financialScore * 0.40 +
        customerScore * 0.30 +
        internalProcessScore * 0.20 +
        learningGrowthScore * 0.10
      );

      const utilizationRate = Math.min(100, (totalBillableHours / 160) * 100);

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
        okrScore: 0,
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
      const user = await authAPI.me();
      if (user?.id) {
        await loadPersonalPerformance(user.id);
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

  const loadSubordinates = async (userId: string) => {
    try {
      const subs = await apiFetch('GET', `/subordinates?user_id=${userId}`);
      setSubordinates(subs || []);
    } catch (error) {
      console.error("Error loading subordinates:", error);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
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

        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="personal">
              <User className="h-4 w-4 mr-2" />
              My Performance
            </TabsTrigger>
            <TabsTrigger value="company">
              <Building2 className="h-4 w-4 mr-2" />
              Company Overview
            </TabsTrigger>
            <TabsTrigger value="roles">
              <Shield className="h-4 w-4 mr-2" />
              Role Management
            </TabsTrigger>
            <TabsTrigger value="management">
              <BarChart3 className="h-4 w-4 mr-2" />
              Management Tools
            </TabsTrigger>
          </TabsList>

          {/* My Performance Tab - Personal Data Only */}
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
                        <span className="font-medium">OKR Progress</span>
                        <span className="text-primary font-semibold">
                          {performance?.okrScore || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-primary to-success h-2 rounded-full"
                          style={{ width: `${performance?.okrScore || 0}%` }}
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
                  <Link to="/scorecard" className="block mt-4">
                    <Button className="w-full" variant="outline">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      View Full Scorecard
                    </Button>
                  </Link>
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

          {/* Company Overview Tab - Analytics for HR/Admin */}
          <TabsContent value="company" className="space-y-6">
            {isAdmin && (
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
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
                </CardContent>
              </Card>
            </div>

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
                  <Link to="/department-dashboard">
                    <Button className="w-full" variant="outline">
                      <Building2 className="h-4 w-4 mr-2" />
                      Department Analytics
                    </Button>
                  </Link>
                  <Link to="/employee-management">
                    <Button className="w-full" variant="outline">
                      <Users className="h-4 w-4 mr-2" />
                      Employee Overview
                    </Button>
                  </Link>
                  <Link to="/financial-summary">
                    <Button className="w-full" variant="outline">
                      <DollarSign className="h-4 w-4 mr-2" />
                      Financial Reports
                    </Button>
                  </Link>
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
                        className="border border-border rounded-lg p-3 bg-background flex justify-between gap-3"
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{notification.title}</span>
                            {!notification.isRead && (
                              <Badge variant="secondary">Unread</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-col justify-between">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => markNotificationRead(notification.id)}
                            disabled={notification.isRead}
                          >
                            {notification.isRead ? "Read" : "Mark read"}
                          </Button>
                          {notification.link && (
                            <Link to={notification.link}>
                              <Button size="sm" variant="link">
                                View
                              </Button>
                            </Link>
                          )}
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

          {/* Role Management Tab - Admin Only */}
          <TabsContent value="roles" className="space-y-6">
            <UserRoleManagement />
          </TabsContent>

          {/* Management Tools Tab */}
          <TabsContent value="management" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Evaluation Cycles
                  </CardTitle>
                  <CardDescription>Create and manage review periods</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/evaluation-management">
                    <Button className="w-full">
                      <Calendar className="h-4 w-4 mr-2" />
                      Manage Evaluations
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    KPI Management
                  </CardTitle>
                  <CardDescription>Define and assign performance metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/kpi-management">
                    <Button className="w-full">
                      <Target className="h-4 w-4 mr-2" />
                      Manage KPIs
                    </Button>
                  </Link>
                </CardContent>
              </Card>

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
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default HRDashboard;
