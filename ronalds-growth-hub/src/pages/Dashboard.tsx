import DashboardLayout from "@/components/DashboardLayout";
import PageLoader from '@/components/ui/page-loader';
import JobOperationsOverview from "@/components/jobs/JobOperationsOverview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, DollarSign, Target, Star, FileText, Loader2, Briefcase, AlertCircle, FileSpreadsheet } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface PerformanceData {
  overallScore: number;
  grade: string | null;
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
    hasViewAccess,
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

  const employeeJobMetrics = useMemo(
    () => [
      {
        label: "Revenue contribution",
        value: `KES ${(performance?.allocatedRevenue || 0).toLocaleString("en-KE")}`,
        hint: `From ${scopeLabel} jobs • score ${performance?.financialSignals?.revenueScore || 0}%`,
        icon: DollarSign,
        tone: "primary" as const,
        graphValue: performance?.allocatedRevenue || 0,
        graphBaseline: performance?.revenueContribution || 0,
      },
      {
        label: "Billable hours",
        value: String(performance?.billableHours || 0),
        hint: `${performance?.utilizationRate || 0}% utilization`,
        icon: Briefcase,
        tone: "positive" as const,
        graphValue: performance?.billableHours || 0,
        graphBaseline: performance?.utilizationRate || 0,
      },
      {
        label: "Performance score",
        value: String(performance?.overallScore || 0),
        hint: performance?.grade ? `Current grade ${performance.grade}` : `Role ${roleLabel}`,
        icon: Star,
        tone: "warning" as const,
        graphValue: performance?.overallScore || 0,
        graphBaseline: performance?.financialScore || 0,
      },
      {
        label: "Client signal",
        value: `${performance?.clientRating || 0}/5`,
        hint: `${performance?.clientReviewCount || 0} client reviews`,
        icon: Target,
        tone: (performance?.clientRating || 0) > 0 ? ("positive" as const) : ("danger" as const),
        graphValue: performance?.clientRating || 0,
        graphBaseline: 4,
        inverse: (performance?.clientRating || 0) <= 0,
      },
    ],
    [performance, roleLabel, scopeLabel]
  );

  const partnerJobMetrics = useMemo(
    () => [
      {
        label: "Portfolio jobs",
        value: String(partnerData?.portfolio?.totalJobs || 0),
        hint: `${partnerData?.portfolio?.activeJobs || 0} active engagements`,
        icon: Briefcase,
        tone: "primary" as const,
        graphValue: partnerData?.portfolio?.totalJobs || 0,
        graphBaseline: partnerData?.portfolio?.activeJobs || 0,
      },
      {
        label: "Collected revenue",
        value: `KES ${(partnerData?.portfolio?.totalRevenueCollected || 0).toLocaleString("en-KE")}`,
        hint: "Cash already realized across the portfolio",
        icon: DollarSign,
        tone: "positive" as const,
        graphValue: partnerData?.portfolio?.totalRevenueCollected || 0,
      },
      {
        label: "Portfolio profit",
        value: `KES ${(partnerData?.portfolio?.totalProfit || 0).toLocaleString("en-KE")}`,
        hint: "Net portfolio contribution",
        icon: TrendingUp,
        tone: "warning" as const,
        graphValue: partnerData?.portfolio?.totalProfit || 0,
        graphBaseline: 0,
      },
      {
        label: "Pending approvals",
        value: String(partnerData?.pendingApprovalsCount || 0),
        hint: "Time-entry approvals waiting for partner action",
        icon: AlertCircle,
        tone: "danger" as const,
        graphValue: partnerData?.pendingApprovalsCount || 0,
        graphBaseline: 0,
        inverse: true,
      },
    ],
    [partnerData]
  );

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
        if (!userProfileId) {
          throw new Error("Current user profile ID is missing.");
        }
        await loadPersonalPerformance(userProfileId);
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
        if (Number(nonFinancial.learningGrowthScore || 0) <= 0) {
          insights.push("Learning and development inputs are missing (evaluations/feedback).");
        }
        if (insights.length === 0) {
          insights.push("Score is healthy. Keep maintaining your financial, delivery, and feedback inputs.");
        }

        setPerformance({
          overallScore: Math.round((performancePayload.overall.totalScore || 0) * 10) / 10,
          grade: performancePayload.overall.grade ?? null,
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

      const allocations = await apiFetch("GET", `/employee-project-allocations?employeeIds=${userProfileId}`);
      const assignmentRows = Array.isArray(allocations) ? allocations : [];
      const totalRevenue = assignmentRows.reduce((sum: number, a: any) => sum + Number(a?.allocatedRevenue || a?.allocationAmount || 0), 0);
      const totalBillableHours = assignmentRows.reduce((sum: number, a: any) => sum + Number(a?.plannedHours || a?.billableHours || 0), 0);

      const clientEvals: any[] = [];
      const avgClientRating = 0;

      // Calculate utilization (assuming 160 billable hours per month target)
      const utilizationRate = Math.min(100, (totalBillableHours / 160) * 100);
      const financialScore = Math.min(100, (totalRevenue / 1000000) * 100);
      const customerScore = Math.min(100, (avgClientRating / 5) * 100);
      const internalProcessScore = Math.min(100, utilizationRate);
      const learningGrowthScore = 0;

      // Overall score weighted by BSC categories
      const overallScore = (
        financialScore * 0.40 +
        customerScore * 0.30 +
        internalProcessScore * 0.20 +
        learningGrowthScore * 0.10
      );

      const hasFallbackSignals =
        assignmentRows.length > 0 ||
        (Array.isArray(clientEvals) && clientEvals.length > 0);
      const fallbackInsights: string[] = [];

      if (!hasFallbackSignals) {
        fallbackInsights.push("No approved performance inputs have been recorded for this profile yet.");
      }
      if (totalRevenue <= 0) {
        fallbackInsights.push("No allocated revenue has been posted to this profile yet.");
      }
      if (totalBillableHours <= 0) {
        fallbackInsights.push("No billable hours have been linked to this profile yet.");
      }
      if (avgClientRating <= 0) {
        fallbackInsights.push("No client feedback has been linked to this profile yet.");
      }
      if (fallbackInsights.length === 0) {
        fallbackInsights.push("Performance inputs are syncing across allocations, feedback, and evaluation activity for this profile.");
      }

      setPerformance({
        overallScore: Math.round(overallScore * 10) / 10,
        grade: hasFallbackSignals
          ? overallScore >= 90
            ? "A"
            : overallScore >= 80
              ? "B"
              : overallScore >= 70
                ? "C"
                : overallScore >= 60
                  ? "D"
                  : "E"
          : null,
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
        insights: fallbackInsights,
      });
    } catch (error) {
      console.error("Error loading performance:", error);
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
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
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
          {hasViewAccess("reports.workspace") && (
            <Link to="/reports">
              <Button variant="outline">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Open Reports
              </Button>
            </Link>
          )}
        </div>


        {/* Partner Dashboard View */}
        {isPartnerView && partnerData ? (
          <div className="space-y-6">
            <JobOperationsOverview
              title="Portfolio command center"
              description="Track partner-sensitive jobs, revenue, and approvals from one calmer surface before you dive into the detailed cards."
              metrics={partnerJobMetrics}
              showLocator={false}
            />
          </div>
        ) : (
          /* Employee Dashboard View */
          <>
        <JobOperationsOverview
          title="My job operations"
          description="A cleaner read on the work, money signals, and delivery pressure connected to your assignments."
          metrics={employeeJobMetrics}
          compact
          showLocator={false}
          pulseTitle="Workflow pulse"
          pulseDescription="A compact snapshot of assigned jobs, staffing progress, and delivery pressure."
        />


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
                  Billable hours: {performance?.billableHours || 0}
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
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link to="/notifications" className="block">
                  <Button className="w-full" variant="outline">
                    View All Activity
                  </Button>
                </Link>
                {hasViewAccess("reports.workspace") && (
                  <Link to="/reports" className="block">
                    <Button className="w-full" variant="outline">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Open Reports
                    </Button>
                  </Link>
                )}
              </div>
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
