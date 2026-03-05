import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MiniStatGraph from "@/components/ui/mini-stat-graph";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Users, DollarSign, Target, Star, FileText, Loader2, Briefcase, AlertCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface PerformanceData {
  overallScore: number;
  grade: string;
  revenueContribution: number;
  allocatedRevenue: number;
  billableHours: number;
  utilizationRate: number;
  clientRating: number;
  clientReviewCount: number;
  financialScore: number;
  nonFinancialScore: number;
  efficiencyScore: number;
  customerScore: number;
  internalProcessScore: number;
  learningGrowthScore: number;
  okrScore: number;
  projectEvaluationScore: number;
  roleFormula: string;
  jobScope: string;
  overallWeights: {
    financial: number;
    nonFinancial: number;
    efficiency?: number;
  };
  financialSignals: {
    revenueScore: number;
    profitScore: number;
    bdScore: number;
  };
  lossAlert?: boolean;
  insights: string[];
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    user,
    profile,
    isLoading: authLoading,
    isAdmin,
    isHR,
    isGMP,
    isPartner,
    isManager,
    isMarketing,
    isFinance,
  } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPartnerView, setIsPartnerView] = useState(false);
  const [partnerData, setPartnerData] = useState<any>(null);
  const roleLabel = String(performance?.roleFormula || "employee")
    .replace(/_/g, " ")
    .toLowerCase();
  const scopeLabel = String(performance?.jobScope || "assigned")
    .replace(/_/g, " ")
    .toLowerCase();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }

    const load = async () => {
      setIsLoading(true);
      try {
        sessionStorage.setItem('currentUser', JSON.stringify(user));

        if (isGMP) {
          navigate("/gmp-dashboard", { replace: true });
          return;
        }
        if (isHR || isAdmin) {
          navigate("/hr-dashboard", { replace: true });
          return;
        }
        if (isPartner) {
          navigate("/partner-dashboard", { replace: true });
          return;
        }
        if (isManager) {
          navigate("/manager-dashboard", { replace: true });
          return;
        }

        if (isMarketing) {
          navigate("/marketing-dashboard", { replace: true });
          return;
        }

        if (isFinance) {
          navigate("/finance-dashboard", { replace: true });
          return;
        }

        const userProfileId = Number(
          user.profileId ?? (user as any).profile_id ?? user.profile?.id ?? 0
        );
        await loadPersonalPerformance(userProfileId);
        await loadRecentActivity(userProfileId);
        await loadEmployeeNotifications();
      } catch (error) {
        console.error("Error loading dashboard:", error);
        toast({
          title: "Error",
          description: "Failed to load dashboard data",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    authLoading,
    user,
    profile,
    isGMP,
    isHR,
    isAdmin,
    isPartner,
    isManager,
    isMarketing,
    isFinance,
    navigate,
    toast,
  ]);

  const loadEmployeeNotifications = async () => {
    try {
      const response = await apiFetch("GET", "/notifications?status=unread&page=1&pageSize=5");
      const notifications = response?.data ?? response?.items ?? response ?? [];
      const unread = Array.isArray(notifications) ? notifications : [];
      setUnreadNotifications(unread);

      const unreadCountResponse = await apiFetch("GET", "/notifications/unread-count");
      const countPayload = unreadCountResponse?.data ?? unreadCountResponse ?? {};
      setUnreadCount(countPayload.unreadCount ?? unread.length);

      const lastSeenId = Number(sessionStorage.getItem("lastNotifiedId") || 0);
      const newest = unread[0];
      if (newest && newest.id && newest.id !== lastSeenId) {
        toast({
          title: newest.title || "New notification",
          description: newest.message || "You have a new update.",
        });
        sessionStorage.setItem("lastNotifiedId", String(newest.id));
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  };

  const loadPersonalPerformance = async (userProfileId: number) => {
    try {
      // Prefer new performance score endpoint (financials tied to collections)
      const performanceResponse = await apiFetch("GET", "/performance-scores/me");
      const performancePayload = (performanceResponse as any)?.data ?? performanceResponse;
      const analyticsResponse = await apiFetch("GET", "/analytics/financial").catch(() => null);
      const analyticsPayload = (analyticsResponse as any)?.data ?? analyticsResponse ?? {};

      if (performancePayload?.financial && performancePayload?.overall) {
        const financial = performancePayload.financial;
        const nonFinancial = performancePayload.nonFinancial || {};
        const formula = performancePayload.formula || {};
        const scoreBreakdown = performancePayload.scoreBreakdown || {};
        const utilizationPercent = Math.round((financial.utilizationRate || 0) * 100);
        const customerRating =
          typeof nonFinancial.customerSatisfactionScore === "number"
            ? Math.round((nonFinancial.customerSatisfactionScore / 20) * 10) / 10
            : 0;
        const lossAlert = Boolean(performancePayload?.scoreBreakdown?.lossAlert);
        const allocatedRevenueTotal = Number(
          scoreBreakdown?.allocationRevenue ??
          analyticsPayload?.allocatedRevenueTotal ??
          financial.revenue ??
          0
        );
        const nonFinancialWeight = Number(formula?.overallWeights?.nonFinancial ?? 0.3);
        const operationalEfficiencyBlend = Number(
          formula?.nonFinancialOperationalBlend?.operationalEfficiency ?? 0.3
        );
        const overallWeights = {
          financial: Number(formula?.overallWeights?.financial ?? 0.7),
          nonFinancial: nonFinancialWeight,
          efficiency: Number(
            formula?.overallWeights?.efficiency ??
              nonFinancialWeight * operationalEfficiencyBlend
          ),
        };
        const roleFormula = String(
          formula?.role ||
          scoreBreakdown?.role ||
          profile?.positionTitle ||
          "employee"
        );
        const jobScope = String(formula?.jobScope || scoreBreakdown?.jobScope || "assigned");
        const financialSignals = {
          revenueScore: Number(formula?.financial?.scores?.revenue || financial?.revenueScore || 0),
          profitScore: Number(formula?.financial?.scores?.profit || financial?.profitScore || 0),
          bdScore: Number(formula?.financial?.scores?.bd || financial?.bdScore || 0),
        };
        const insights: string[] = [];
        if (Number(financial.financialWeighted || 0) <= 0) {
          insights.push("No financial contribution captured in this period (cash allocation/profit/BD signals are zero).");
        }
        if (Number(financial.billableHours || 0) <= 0) {
          insights.push("No approved billable time entries captured in this period.");
        }
        if (Number(nonFinancial.customerSatisfactionScore || 0) <= 0) {
          insights.push("No client satisfaction ratings captured yet.");
        }
        if (Number(nonFinancial.learningGrowthScore || 0) <= 0 && Number(nonFinancial.okrScore || 0) <= 0) {
          insights.push("Learning & growth inputs are missing (OKRs/evaluations/feedback).");
        }
        if (insights.length === 0) {
          insights.push("Score is healthy. Keep maintaining your financial, delivery, and feedback inputs.");
        }

        setPerformance({
          overallScore: Math.round((performancePayload.overall.totalScore || 0) * 10) / 10,
          grade: String(performancePayload.overall.grade || "N/A"),
          revenueContribution: financial.revenue || 0,
          allocatedRevenue: allocatedRevenueTotal,
          billableHours: financial.billableHours || 0,
          utilizationRate: utilizationPercent,
          clientRating: customerRating,
          clientReviewCount: 0,
          financialScore: Math.round(financial.financialWeighted || 0),
          nonFinancialScore: Math.round(nonFinancial.overallNonFinancialScore || 0),
          efficiencyScore: Math.round(performancePayload?.efficiency?.efficiencyWeighted || 0),
          customerScore: Math.round(nonFinancial.customerSatisfactionScore || 0),
          internalProcessScore: Math.round(nonFinancial.internalProcessesScore || 0),
          learningGrowthScore: Math.round(nonFinancial.learningGrowthScore || 0),
          okrScore: Math.round(nonFinancial.okrScore || 0),
          projectEvaluationScore: Math.round(nonFinancial.projectEvaluationScore || 0),
          roleFormula,
          jobScope,
          overallWeights,
          financialSignals,
          lossAlert: lossAlert || Number(analyticsPayload?.lossTotal || 0) > 0,
          insights,
        });
        return;
      }

      const allocations = await apiFetch("GET", `/employee-project-allocations?employee_ids=${userProfileId}`);
      const assignmentRows = Array.isArray(allocations) ? allocations : [];
      const totalRevenue = assignmentRows.reduce((sum: number, a: any) => sum + Number(a?.allocatedRevenue || a?.allocationAmount || 0), 0);
      const totalBillableHours = assignmentRows.reduce((sum: number, a: any) => sum + Number(a?.plannedHours || a?.billableHours || 0), 0);

      // Get client ratings
      const clientEvals = await apiFetch("GET", `/client-evaluations?employee_ids=${userProfileId}`);
      const avgClientRating = clientEvals && clientEvals.length > 0
        ? clientEvals.reduce((sum: number, e: any) => sum + Number(e?.overallRating || e?.overall_rating || 0), 0) / clientEvals.length
        : 0;

      // Get KPI scores by BSC category (Cascade V2)
      const kpiCards = await apiFetch("GET", `/kpi/employees/${userProfileId}/kpis`);
      const scopedAssignments = Array.isArray(kpiCards) ? kpiCards : [];

      const financialKPIs = scopedAssignments.filter((k: any) => String(k?.bsc_tag || "").toLowerCase() === "financial");
      const customerKPIs = scopedAssignments.filter((k: any) => String(k?.bsc_tag || "").toLowerCase() === "customer");
      const internalKPIs = scopedAssignments.filter((k: any) => String(k?.bsc_tag || "").toLowerCase() === "internal_process");
      const learningKPIs = scopedAssignments.filter((k: any) => String(k?.bsc_tag || "").toLowerCase() === "learning_growth");

      const calculateScore = (kpis: any[]) => {
        if (kpis.length === 0) return 0;
        const total = kpis.reduce((sum, k) => sum + Number(k?.percent_complete ?? 0), 0);
        return Math.min(100, total / kpis.length);
      };

      const financialScore = calculateScore(financialKPIs);
      const customerScore = calculateScore(customerKPIs);
      const internalProcessScore = calculateScore(internalKPIs);
      const learningGrowthScore = calculateScore(learningKPIs);

      // Overall score weighted by BSC categories
      const overallScore = (
        financialScore * 0.40 +
        customerScore * 0.30 +
        internalProcessScore * 0.20 +
        learningGrowthScore * 0.10
      );

      // Calculate utilization (assuming 160 billable hours per month target)
      const utilizationRate = Math.min(100, (totalBillableHours / 160) * 100);

      setPerformance({
        overallScore: Math.round(overallScore * 10) / 10,
        grade: overallScore >= 90 ? "A" : overallScore >= 80 ? "B" : overallScore >= 70 ? "C" : overallScore >= 60 ? "D" : "E",
        revenueContribution: totalRevenue,
        allocatedRevenue: totalRevenue,
        billableHours: totalBillableHours,
        utilizationRate: Math.round(utilizationRate),
        clientRating: Math.round(avgClientRating * 10) / 10,
        clientReviewCount: Array.isArray(clientEvals) ? clientEvals.length : 0,
        financialScore: Math.round(financialScore),
        nonFinancialScore: Math.round((customerScore + internalProcessScore + learningGrowthScore) / 3),
        efficiencyScore: Math.round(utilizationRate),
        customerScore: Math.round(customerScore),
        internalProcessScore: Math.round(internalProcessScore),
        learningGrowthScore: Math.round(learningGrowthScore),
        okrScore: 0,
        projectEvaluationScore: 0,
        roleFormula: String(profile?.positionTitle || "employee"),
        jobScope: "assigned",
        overallWeights: {
          financial: 0.7,
          nonFinancial: 0.3,
          efficiency: 0.09,
        },
        financialSignals: {
          revenueScore: Math.round(financialScore),
          profitScore: 0,
          bdScore: 0,
        },
        insights: [
          "This view is using fallback metrics because score-engine data was unavailable.",
        ],
      });
    } catch (error) {
      console.error("Error loading performance:", error);
    }
  };

  const loadRecentActivity = async (userProfileId: number) => {
    try {
      const activities: any[] = [];

      // Check completed evaluations
      const completedEvals = await apiFetch(
        "GET",
        `/evaluation-assignments?evaluatorProfileId=${userProfileId}&status=completed&limit=1&include=definition`
      );

      if (Array.isArray(completedEvals) && completedEvals.length > 0) {
        activities.push({
          type: "success",
          title: "Evaluation completed",
          description: `${completedEvals[0]?.definition?.name || completedEvals[0]?.evaluatorType || "Assigned"} evaluation submitted`,
          date: completedEvals[0]?.submittedAt || completedEvals[0]?.updatedAt
        });
      }

      // Check pending evaluations
      const pendingEvals = await apiFetch(
        "GET",
        `/evaluation-assignments?evaluatorProfileId=${userProfileId}&status=pending&limit=100`
      );
      const pendingCount = Array.isArray(pendingEvals) ? pendingEvals.length : 0;

      if (pendingCount && pendingCount > 0) {
        activities.push({
          type: "warning",
          title: "Pending evaluations",
          description: `${pendingCount} evaluation(s) awaiting completion`,
          date: new Date().toISOString()
        });
      }

      // Check KPI card updates (Cascade V2)
      const kpiUpdates = await apiFetch("GET", `/kpi/employees/${userProfileId}/kpis`);
      const scopedUpdates = Array.isArray(kpiUpdates) ? kpiUpdates : [];

      if (scopedUpdates.length > 0) {
        activities.push({
          type: "info",
          title: "KPI updated",
          description: "Performance metrics were recently updated",
          date: scopedUpdates[0]?.last_updated_at || scopedUpdates[0]?.updated_at
        });
      }

      setRecentActivities(activities.slice(0, 3));
    } catch (error) {
      console.error("Error loading activities:", error);
    }
  };

  const loadPartnerPerformance = async (user: any) => {
    try {
      setIsPartnerView(true);
      
      const profileId = user.profile_id ?? user.profileId ?? user?.profile?.id;
      if (!profileId) {
        throw new Error('No profile ID found for partner');
      }

      // Get partner portfolio metrics
      const portfolioRes = await apiFetch("GET", "/partners/dashboard-summary");
      
      // Get top jobs
      const jobsRes = portfolioRes?.topJobs || [];
      
      // Get pending approvals
      const pendingRes = Number(portfolioRes?.pendingTimeEntriesCount || 0);

      setPartnerData({
        portfolio: portfolioRes?.portfolio || {},
        topJobs: jobsRes?.slice(0, 5) || [],
        pendingApprovalsCount: pendingRes
      });
    } catch (error) {
      console.error("Error loading partner data:", error);
      toast({
        title: "Warning",
        description: "Some partner data failed to load",
        variant: "destructive"
      });
      setPartnerData({
        portfolio: {},
        topJobs: [],
        pendingApprovalsCount: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {isPartnerView ? 'Partner Dashboard' : 'Welcome back!'}
          </h2>
          <p className="text-muted-foreground">
            {isPartnerView 
              ? `Here's an overview of your portfolio and projects.`
              : "Here's an overview of your personal performance metrics and activities."
            }
          </p>
        </div>


        {/* Partner Dashboard View */}
        {isPartnerView && partnerData ? (
          <div className="space-y-6">
            {/* Partner Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
                  <Briefcase className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{partnerData.portfolio?.totalJobs || 0}</div>
                  <p className="text-xs text-muted-foreground">Active portfolio</p>
                  <MiniStatGraph
                    value={partnerData.portfolio?.totalJobs || 0}
                    baseline={partnerData.portfolio?.activeJobs || 0}
                  />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    KES {((partnerData.portfolio?.totalRevenueCollected || 0) / 1000000).toFixed(1)}M
                  </div>
                  <p className="text-xs text-muted-foreground">Collected</p>
                  <MiniStatGraph value={partnerData.portfolio?.totalRevenueCollected || 0} />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
                  <TrendingUp className="h-4 w-4 text-info" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    KES {((partnerData.portfolio?.totalProfit || 0) / 1000000).toFixed(1)}M
                  </div>
                  <p className="text-xs text-muted-foreground">Net profit</p>
                  <MiniStatGraph value={partnerData.portfolio?.totalProfit || 0} />
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                  <AlertCircle className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{partnerData.pendingApprovalsCount || 0}</div>
                  <p className="text-xs text-muted-foreground">Time entries</p>
                  <MiniStatGraph
                    value={partnerData.pendingApprovalsCount || 0}
                    baseline={0}
                    inverse
                  />
                </CardContent>
              </Card>
            </div>

            {/* Partner Top Jobs */}
            <Card>
              <CardHeader>
                <CardTitle>Top Jobs</CardTitle>
                <CardDescription>Your most active engagements</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {partnerData.topJobs?.length > 0 ? (
                    partnerData.topJobs.map((job: any) => (
                      <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted transition-colors cursor-pointer" onClick={() => window.location.href = `/partner-jobs/${job.id}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{job.job_code || 'Job'}</p>
                            {job.clientName && (
                              <Badge variant="outline" className="text-xs">
                                {job.clientName}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{job.title}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">KES {((job.amount_collected || 0) / 1000).toFixed(0)}K</p>
                          <Badge variant="outline">{job.status || 'active'}</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No jobs assigned yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Employee Dashboard View */
          <>
        {/* Personal Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
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
              <p className="text-xs text-muted-foreground">
                Grade {performance?.grade || "N/A"} | {roleLabel}
              </p>
              <MiniStatGraph
                value={performance?.overallScore || 0}
                baseline={performance?.financialScore || 0}
              />
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash Revenue</CardTitle>
              <div className="flex items-center gap-2">
                {performance?.lossAlert && (
                  <Badge variant="destructive">Loss alert</Badge>
                )}
                <DollarSign className="h-4 w-4 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold text-foreground leading-tight break-words"
                title={`KES ${(performance?.allocatedRevenue || 0).toLocaleString()}`}
              >
                KES {(performance?.allocatedRevenue || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Revenue score {performance?.financialSignals?.revenueScore || 0}%
              </p>
              <MiniStatGraph
                value={performance?.allocatedRevenue || 0}
                baseline={performance?.revenueContribution || 0}
              />
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Financial Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {performance?.financialScore || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Revenue {performance?.financialSignals?.revenueScore || 0}% | Profit {performance?.financialSignals?.profitScore || 0}% | BD {performance?.financialSignals?.bdScore || 0}%
              </p>
              <MiniStatGraph
                value={performance?.financialScore || 0}
                baseline={performance?.nonFinancialScore || 0}
              />
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Non-Financial & Efficiency</CardTitle>
              <Users className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {performance?.nonFinancialScore || 0} / {performance?.efficiencyScore || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Client rating {performance?.clientRating || 0}/5 | Utilization {performance?.utilizationRate || 0}%
              </p>
              <MiniStatGraph
                value={performance?.nonFinancialScore || 0}
                baseline={performance?.efficiencyScore || 0}
              />
            </CardContent>
          </Card>
        </div>

        {/* Performance Scorecard & Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                My Performance Scorecard
              </CardTitle>
              <CardDescription>
                Role: {roleLabel} | Scope: {scopeLabel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">
                      Financial ({Math.round((performance?.overallWeights?.financial || 0.7) * 100)}%)
                    </span>
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
                    <span className="font-medium">
                      Non-Financial ({Math.round((performance?.overallWeights?.nonFinancial || 0.3) * 100)}%)
                    </span>
                    <span className="text-success font-semibold">
                      {performance?.nonFinancialScore || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-success to-secondary h-2 rounded-full" 
                      style={{ width: `${performance?.nonFinancialScore || 0}%` }} 
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">
                      Operational Efficiency Signal ({Math.round((performance?.overallWeights?.efficiency || 0.09) * 100)}% effective)
                    </span>
                    <span className="text-info font-semibold">
                      {performance?.efficiencyScore || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-info to-primary h-2 rounded-full" 
                      style={{ width: `${performance?.efficiencyScore || 0}%` }} 
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-md border p-3 space-y-1 text-sm">
                <p className="font-medium">Component detail</p>
                <p className="text-muted-foreground">
                  Customer: {performance?.customerScore || 0}% | Internal: {performance?.internalProcessScore || 0}% | Learning: {performance?.learningGrowthScore || 0}%
                </p>
                <p className="text-muted-foreground">
                  OKR: {performance?.okrScore || 0}% | Project eval: {performance?.projectEvaluationScore || 0}% | Billable hours: {performance?.billableHours || 0}
                </p>
              </div>
              <div className="mt-4 rounded-md border p-3 space-y-2">
                <p className="text-sm font-medium">What is affecting your score now</p>
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                  {(performance?.insights || []).map((insight, idx) => (
                    <li key={idx}>{insight}</li>
                  ))}
                </ul>
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
                <FileText className="h-5 w-5 text-primary" />
                Recent Activity
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    <Bell className="h-3 w-3 mr-1" />
                    {unreadCount}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Your latest updates and actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivities.length > 0 ? (
                  recentActivities.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 text-sm">
                      <div 
                        className={`w-2 h-2 rounded-full mt-2 ${
                          activity.type === "success" ? "bg-success" :
                          activity.type === "warning" ? "bg-warning" :
                          "bg-info"
                        }`} 
                      />
                      <div>
                        <p className="font-medium">{activity.title}</p>
                        <p className="text-muted-foreground text-xs">{activity.description}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                )}
              </div>
              <Link to="/notifications" className="block mt-4">
                <Button className="w-full" variant="outline">
                  View All Activity
                </Button>
              </Link>
              {unreadNotifications.length > 0 && (
                <div className="mt-4 space-y-2">
                  {unreadNotifications.slice(0, 3).map((notif: any) => (
                    <div key={notif.id} className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
                      <div className="font-medium">{notif.title}</div>
                      <div className="text-muted-foreground">{notif.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
