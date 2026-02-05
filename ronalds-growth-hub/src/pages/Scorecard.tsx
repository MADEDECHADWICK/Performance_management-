import { useState, useEffect } from "react";
import { apiFetch, authAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Award, TrendingUp, DollarSign, Target, Star, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import {
  SECTION_TITLE,
  SECTION_SUBTITLE,
  PAGE_STACK,
  SECTION_STACK,
  SUMMARY_CARD_CONTENT,
  SUMMARY_CARD_HEADER,
  SUMMARY_CARD_TITLE,
} from "@/components/ui/cardStyles";

interface UserProfile {
  id: number;
  positionTitle: string | null;
  departmentId?: number | null;
  firstName: string;
  lastName: string;
  financialTarget?: number | null;
  utilizationTarget?: number | null;
}

interface PerformanceData {
  profile: UserProfile;
  period: { startDate: string; endDate: string };
  financial: {
    revenue: number;
    profit: number;
    loss: number;
    netProfit: number;
    billableHours: number;
    allocatedHours: number;
    utilizationRate: number;
    revenueScore: number;
    profitScore: number;
    utilizationScore: number;
    financialWeighted: number;
  };
  nonFinancial: {
    learningGrowthScore: number;
    okrScore?: number;
    customerSatisfactionScore: number;
    internalProcessesScore: number;
    feedbackScore?: number;
    projectEvaluationScore?: number;
    overallNonFinancialScore: number;
  };
  overall: {
    totalScore: number;
    grade: string;
  };
}

const Scorecard = () => {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [activeTab, setActiveTab] = useState("my-performance");
  const { toast } = useToast();

  useEffect(() => {
    loadPerformanceData();
  }, []);

  const loadPerformanceData = async () => {
    let user: any = null;
    try {
      user = await authAPI.me();
      if (!user) return;

      const roleList = Array.isArray(user?.roles) ? user.roles : [];
      const isAdminRole = roleList.some((role: string) =>
        ["hr_manager", "super_admin", "admin"].includes(role)
      );
      setIsAdmin(isAdminRole);

      const [performanceResponse, analyticsResponse] = await Promise.all([
        apiFetch('GET', '/performance-scores/me'),
        apiFetch('GET', '/analytics/financial').catch(() => null),
      ]);

      const payload = performanceResponse?.data ?? performanceResponse;
      const analyticsPayload = analyticsResponse?.data ?? analyticsResponse ?? {};

      if (payload?.financial && analyticsPayload?.allocatedRevenueTotal !== undefined) {
        const allocatedRevenueTotal = Number(analyticsPayload.allocatedRevenueTotal || 0);
        const profitTotal = Number(analyticsPayload.profitTotal || 0);
        const lossTotal = Number(analyticsPayload.lossTotal || 0);

        payload.financial = {
          ...payload.financial,
          revenue: allocatedRevenueTotal,
          profit: profitTotal,
          loss: lossTotal,
          netProfit: profitTotal - lossTotal,
        };
      }

      setPerformanceData(payload);
      setUserProfile(payload?.profile || user.profile || null);

    } catch (error: any) {
      if (error?.status === 404) {
        setPerformanceData(null);
        setUserProfile(user?.profile || null);
        return;
      }
      toast({
        variant: "destructive",
        title: "Error loading performance data",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const hasPerformanceData = Boolean(performanceData);
  const fallbackProfile: UserProfile = userProfile || {
    id: 0,
    positionTitle: null,
    firstName: "Employee",
    lastName: "",
  };
  const data: PerformanceData = performanceData || {
    profile: fallbackProfile,
    period: { startDate: "", endDate: "" },
    financial: {
      revenue: 0,
      profit: 0,
      loss: 0,
      netProfit: 0,
      billableHours: 0,
      allocatedHours: 0,
      utilizationRate: 0,
      revenueScore: 0,
      profitScore: 0,
      utilizationScore: 0,
      financialWeighted: 0,
    },
    nonFinancial: {
      learningGrowthScore: 0,
      okrScore: 0,
      customerSatisfactionScore: 0,
      internalProcessesScore: 0,
      feedbackScore: 0,
      projectEvaluationScore: 0,
      overallNonFinancialScore: 0,
    },
    overall: {
      totalScore: 0,
      grade: "N/A",
    },
  };

  const getTitle = () => {
    if (!isAdmin || activeTab === "my-performance") {
      return "My Performance Scorecard";
    }
    return "Performance Scorecard";
  };

  const getSubtitle = () => {
    if (!isAdmin || activeTab === "my-performance") {
      return "Detailed breakdown of your performance metrics";
    }
    if (userProfile?.positionTitle === "manager") {
      return "Team performance overview";
    }
    return "Company-wide performance metrics";
  };

  return (
    <DashboardLayout>
      <div className={PAGE_STACK}>
        <div>
          <h1 className={SECTION_TITLE}>{getTitle()}</h1>
          <p className={SECTION_SUBTITLE}>{getSubtitle()}</p>
        </div>

        {/* Tab switcher for admins/managers */}
        {isAdmin && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="my-performance">My Performance</TabsTrigger>
              <TabsTrigger value="company-overview">
                {userProfile?.positionTitle === "manager" ? "Team Overview" : "Company Overview"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {!hasPerformanceData && (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader>
              <CardTitle className="text-base">Limited performance data</CardTitle>
              <CardDescription>
                We couldn't compute your full score yet. Once evaluations and time logs are available,
                your scorecard will update automatically.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Summary row */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Overall Score</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{data.overall.totalScore}</div>
              <p className="text-xs text-muted-foreground">Grade: {data.overall.grade}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Financial Score</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{data.financial.financialWeighted}</div>
              <p className="text-xs text-muted-foreground">Weighted 70%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Non-Financial</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">{data.nonFinancial.overallNonFinancialScore}</div>
              <p className="text-xs text-muted-foreground">Weighted 30%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className={SUMMARY_CARD_HEADER}>
              <CardTitle className={SUMMARY_CARD_TITLE}>Utilization</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className={SUMMARY_CARD_CONTENT}>
              <div className="text-2xl font-bold">
                {(data.financial.utilizationRate * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {data.financial.billableHours.toFixed(1)} billable hours
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Overall Score */}
        <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Award className="h-6 w-6 text-primary" />
              Overall Performance Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="text-6xl font-bold text-primary">{data.overall.totalScore}</div>
              <div className="flex-1">
                <Progress value={data.overall.totalScore} className="h-4" />
                <p className="text-sm text-muted-foreground mt-2">
                  Based on 70% financial and 30% non-financial metrics
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category Scores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-success" />
                Financial Performance
              </CardTitle>
              <CardDescription>Weighted Score: {data.financial.financialWeighted}/100</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={data.financial.financialWeighted} className="h-3 mb-4" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue Contribution:</span>
                  <span className="font-medium">KES {data.financial.revenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billable Hours:</span>
                  <span className="font-medium">{data.financial.billableHours.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Utilization:</span>
                  <span className="font-medium">
                    {(data.financial.utilizationRate * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground mt-4">
                Contributes 70% to overall score
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-secondary" />
                Non-Financial Performance
              </CardTitle>
              <CardDescription>Weighted Score: {data.nonFinancial.overallNonFinancialScore}/100</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={data.nonFinancial.overallNonFinancialScore} className="h-3 mb-4" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Learning & Growth:</span>
                  <span className="font-medium">{data.nonFinancial.learningGrowthScore}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OKR Progress:</span>
                  <span className="font-medium">{data.nonFinancial.okrScore ?? 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project Evaluations:</span>
                  <span className="font-medium">{data.nonFinancial.projectEvaluationScore ?? 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer Satisfaction:</span>
                  <span className="font-medium">{data.nonFinancial.customerSatisfactionScore}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Internal Processes:</span>
                  <span className="font-medium">{data.nonFinancial.internalProcessesScore}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Continuous Feedback:</span>
                  <span className="font-medium">{data.nonFinancial.feedbackScore ?? 0}%</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground mt-4">
                Contributes 30% to overall score
              </div>
            </CardContent>
          </Card>
        </div>

        {/* BSC Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Balanced Scorecard Breakdown</CardTitle>
            <CardDescription>Your performance across BSC categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={SECTION_STACK}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Learning & Growth</h3>
                    <p className="text-sm text-muted-foreground">Employee development and innovation</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">{data.nonFinancial.learningGrowthScore}%</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      OKR Progress: {data.nonFinancial.okrScore ?? 0}%
                    </div>
                  </div>
                </div>
                <Progress value={data.nonFinancial.learningGrowthScore} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Customer Satisfaction</h3>
                    <p className="text-sm text-muted-foreground">Client feedback and service quality</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-secondary">{data.nonFinancial.customerSatisfactionScore}%</div>
                  </div>
                </div>
                <Progress value={data.nonFinancial.customerSatisfactionScore} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Internal Processes</h3>
                    <p className="text-sm text-muted-foreground">Operational efficiency and quality</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-accent">{data.nonFinancial.internalProcessesScore}%</div>
                  </div>
                </div>
                <Progress value={data.nonFinancial.internalProcessesScore} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Metrics Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Financial Metrics Breakdown</CardTitle>
            <CardDescription>Your financial contributions and performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={SECTION_STACK}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Revenue Contribution</h3>
                    <p className="text-sm text-muted-foreground">Total revenue from completed projects</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-success">
                      KES {data.financial.revenue.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Net Profit</h3>
                    <p className="text-sm text-muted-foreground">Allocated profit minus losses</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-foreground">
                      KES {data.financial.netProfit.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Billable Hours</h3>
                    <p className="text-sm text-muted-foreground">Total hours logged on client projects</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      {data.financial.billableHours.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Utilization Rate</h3>
                    <p className="text-sm text-muted-foreground">Billable vs allocated hours</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      {(data.financial.utilizationRate * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-accent" />
              Performance Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={SECTION_STACK}>
              {data.financial.financialWeighted >= 80 && (
                <div className="flex items-start gap-3 p-3 bg-success/10 rounded-lg">
                  <Target className="h-5 w-5 text-success mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Strong Financial Performance</p>
                    <p className="text-sm text-muted-foreground">
                      Your financial contributions are exceeding expectations
                    </p>
                  </div>
                </div>
              )}
              {data.nonFinancial.customerSatisfactionScore >= 85 && (
                <div className="flex items-start gap-3 p-3 bg-info/10 rounded-lg">
                  <Target className="h-5 w-5 text-info mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Excellent Client Satisfaction</p>
                    <p className="text-sm text-muted-foreground">
                      Client feedback consistently rates your work highly
                    </p>
                  </div>
                </div>
              )}
              {data.nonFinancial.learningGrowthScore < 70 && (
                <div className="flex items-start gap-3 p-3 bg-warning/10 rounded-lg">
                  <Target className="h-5 w-5 text-warning mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Development Opportunity</p>
                    <p className="text-sm text-muted-foreground">
                      Consider focusing on learning and growth initiatives
                    </p>
                  </div>
                </div>
              )}
              {data.overall.totalScore >= 85 && (
                <div className="flex items-start gap-3 p-3 bg-success/10 rounded-lg">
                  <Award className="h-5 w-5 text-success mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Outstanding Overall Performance</p>
                    <p className="text-sm text-muted-foreground">
                      You're performing exceptionally well across all metrics
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Scorecard;
