import { useState, useEffect } from "react";
import { apiFetch, authAPI } from "@/integrations/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Award, TrendingUp, DollarSign, Target, Star, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";

interface UserProfile {
  id: string;
  positionTitle: string | null;
  departmentId: string | null;
  firstName: string;
  lastName: string;
}

interface PerformanceData {
  employee_id: string;
  employee_name: string;
  financial_score: number;
  non_financial_score: number;
  overall_score: number;
  bsc_learning_growth: number;
  bsc_customer_satisfaction: number;
  bsc_internal_processes: number;
  revenue_contribution: number;
  billable_hours: number;
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
    try {
      const user = await authAPI.me();
      if (!user) return;

      // Get user profile
      const profile = await apiFetch('GET', `/profiles/email/${encodeURIComponent(user.email)}`);
      setUserProfile(profile);

      // Check if user is admin or HR
      const roles = await apiFetch('GET', `/user-roles?userId=${user.id}`);
      const hasAdminRole = roles?.some((r: any) => r.role === "hr_manager" || r.role === "super_admin");
      setIsAdmin(hasAdminRole || false);

      // Load employee's performance data
      await loadEmployeePerformance(user.id, user.email);

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading performance data",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeePerformance = async (employeeId: string, userEmail: string) => {
    try {
      // Fetch BSC scores from employee_evaluations
      const evaluations = await apiFetch('GET', `/employee_evaluations?employee_id=${employeeId}&not_null=bsc_learning_growth_score`);

      // Calculate average BSC scores
      let avgLearningGrowth = 0;
      let avgCustomerSat = 0;
      let avgInternalProcesses = 0;

      if (evaluations && evaluations.length > 0) {
        avgLearningGrowth = Math.round(
          evaluations.reduce((sum: number, e: any) => sum + (e.bsc_learning_growth_score || 0), 0) / evaluations.length
        );
        avgCustomerSat = Math.round(
          evaluations.reduce((sum: number, e: any) => sum + (e.bsc_customer_satisfaction_score || 0), 0) / evaluations.length
        );
        avgInternalProcesses = Math.round(
          evaluations.reduce((sum: number, e: any) => sum + (e.bsc_internal_processes_score || 0), 0) / evaluations.length
        );
      }

      const nonFinancialScore = Math.round((avgLearningGrowth + avgCustomerSat + avgInternalProcesses) / 3);

      // Fetch financial data
      const allocations = await apiFetch('GET', `/employee_project_allocations?employee_id=${employeeId}`);

      let totalRevenue = 0;
      let totalBillableHours = 0;

      if (allocations && allocations.length > 0) {
        totalRevenue = allocations.reduce((sum: number, a: any) => sum + (a.allocation_amount || 0), 0);
        totalBillableHours = allocations.reduce((sum: number, a: any) => sum + (a.billable_hours || 0), 0);
      }

      // Calculate financial score (simplified: based on revenue and hours)
      const financialScore = Math.min(100, Math.round(((totalRevenue / 100000) * 50) + ((totalBillableHours / 2000) * 50)));

      // Calculate overall score (70% financial, 30% non-financial)
      const overallScore = Math.round((financialScore * 0.7) + (nonFinancialScore * 0.3));

      // Get employee name
      const profileData = await apiFetch('GET', `/profiles/email/${encodeURIComponent(userEmail)}`);

      setPerformanceData({
        employee_id: employeeId,
        employee_name: profileData ? `${profileData.firstName} ${profileData.lastName}` : "Unknown",
        financial_score: financialScore,
        non_financial_score: nonFinancialScore,
        overall_score: overallScore,
        bsc_learning_growth: avgLearningGrowth,
        bsc_customer_satisfaction: avgCustomerSat,
        bsc_internal_processes: avgInternalProcesses,
        revenue_contribution: totalRevenue,
        billable_hours: totalBillableHours,
      });

    } catch (error: any) {
      console.error("Error loading employee performance:", error);
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

  if (!performanceData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">No performance data available</p>
        </div>
      </DashboardLayout>
    );
  }

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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{getTitle()}</h1>
          <p className="text-muted-foreground">{getSubtitle()}</p>
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
              <div className="text-6xl font-bold text-primary">{performanceData.overall_score}</div>
              <div className="flex-1">
                <Progress value={performanceData.overall_score} className="h-4" />
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
              <CardDescription>Weighted Score: {performanceData.financial_score}/100</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={performanceData.financial_score} className="h-3 mb-4" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue Contribution:</span>
                  <span className="font-medium">${performanceData.revenue_contribution.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billable Hours:</span>
                  <span className="font-medium">{performanceData.billable_hours.toFixed(1)}</span>
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
              <CardDescription>Weighted Score: {performanceData.non_financial_score}/100</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={performanceData.non_financial_score} className="h-3 mb-4" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Learning & Growth:</span>
                  <span className="font-medium">{performanceData.bsc_learning_growth}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer Satisfaction:</span>
                  <span className="font-medium">{performanceData.bsc_customer_satisfaction}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Internal Processes:</span>
                  <span className="font-medium">{performanceData.bsc_internal_processes}%</span>
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
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Learning & Growth</h3>
                    <p className="text-sm text-muted-foreground">Employee development and innovation</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">{performanceData.bsc_learning_growth}%</div>
                  </div>
                </div>
                <Progress value={performanceData.bsc_learning_growth} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Customer Satisfaction</h3>
                    <p className="text-sm text-muted-foreground">Client feedback and service quality</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-secondary">{performanceData.bsc_customer_satisfaction}%</div>
                  </div>
                </div>
                <Progress value={performanceData.bsc_customer_satisfaction} className="h-2" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Internal Processes</h3>
                    <p className="text-sm text-muted-foreground">Operational efficiency and quality</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-accent">{performanceData.bsc_internal_processes}%</div>
                  </div>
                </div>
                <Progress value={performanceData.bsc_internal_processes} className="h-2" />
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
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Revenue Contribution</h3>
                    <p className="text-sm text-muted-foreground">Total revenue from completed projects</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-success">
                      ${performanceData.revenue_contribution.toLocaleString()}
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
                      {performanceData.billable_hours.toFixed(1)}
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
            <div className="space-y-3">
              {performanceData.financial_score >= 80 && (
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
              {performanceData.bsc_customer_satisfaction >= 85 && (
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
              {performanceData.bsc_learning_growth < 70 && (
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
              {performanceData.overall_score >= 85 && (
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
