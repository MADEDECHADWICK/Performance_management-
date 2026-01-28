import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch, authAPI } from "@/integrations/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2, TrendingUp, Users, Target, Award, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsData {
  userRole: string;
  isAdmin: boolean;
  isPartner: boolean;
  isManager?: boolean;
  isHr?: boolean;
  isFinance?: boolean;
  isMarketing?: boolean;
  isGmp?: boolean;
  isEmployee: boolean;
  roles?: string[];
  userProfile: any;
  nonFinancial: any;
  financial: any;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const NonFinancialAnalytics = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [roleMetrics, setRoleMetrics] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState("performance");

  useEffect(() => {
    loadAnalytics();
  }, []);

  useEffect(() => {
    if (analyticsData) {
      loadRoleMetrics(analyticsData);
    }
  }, [analyticsData]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Use the new role-aware analytics endpoint
      const data = await apiFetch("GET", "/analytics/dashboard");
      console.log("Analytics data received:", data);  // DEBUG
      setAnalyticsData(data);
    } catch (error: unknown) {
      const err = error as Record<string, string>;
      console.error("Error loading analytics:", error);
      toast({
        title: "Error",
        description: err.error || "Failed to load analytics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const unwrapResponse = (payload: any) => {
    if (!payload) return payload;
    return payload.data ?? payload.payload ?? payload;
  };

  const loadRoleMetrics = async (data: AnalyticsData) => {
    const metrics: Record<string, any> = {};
    try {
      if (data.isHr || data.isAdmin) {
        metrics.hr = await apiFetch("GET", "/hr-dashboard/company-metrics").catch(() => null);
      }

      if (data.isGmp) {
        metrics.gmp = await apiFetch("GET", "/gmp-dashboard/overview").catch(() => null);
      }

      if (data.isManager) {
        metrics.manager = await apiFetch("GET", "/manager-dashboard/overview").catch(() => null);
      }

      if (data.isPartner) {
        metrics.partner = await apiFetch("GET", "/partners/dashboard-summary").catch(() => null);
      }

      if (data.isFinance) {
        metrics.finance = await apiFetch("GET", "/finance-dashboard/overview").catch(() => null);
      }

      if (data.isMarketing) {
        const [pipeline, surveys] = await Promise.all([
          apiFetch("GET", "/proposals/metrics").catch(() => null),
          apiFetch("GET", "/surveys/analytics").catch(() => null),
        ]);
        metrics.marketing = {
          pipeline: unwrapResponse(pipeline),
          surveys: unwrapResponse(surveys),
        };
      }
    } finally {
      setRoleMetrics(metrics);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!analyticsData) {
    return (
      <DashboardLayout>
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              No Analytics Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Analytics data is not yet available. Please complete performance evaluations to see metrics.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const roleLabel = analyticsData.isAdmin || analyticsData.isHr
    ? "Company-Wide"
    : analyticsData.isGmp
    ? "Executive"
    : analyticsData.isPartner
    ? "Partner Portfolio"
    : analyticsData.isManager
    ? "Team"
    : analyticsData.isFinance
    ? "Finance"
    : analyticsData.isMarketing
    ? "Marketing"
    : "Personal";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {roleLabel} Non-Financial Performance
          </h2>
          <p className="text-muted-foreground">
            Your Balanced Scorecard metrics {analyticsData.isAdmin && "(Company-wide aggregates)"}
            {analyticsData.isPartner && "(Portfolio team metrics)"}
            {analyticsData.isEmployee && "(Personal metrics)"}
          </p>
        </div>

        {analyticsData.nonFinancial && (
          <>
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Learning & Growth</CardTitle>
                  <TrendingUp className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {analyticsData.nonFinancial.avgLearningGrowth?.toFixed(1) || analyticsData.nonFinancial.learningGrowth?.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analyticsData.isAdmin ? "Company average" : "Your score"}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Customer Satisfaction</CardTitle>
                  <Award className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {analyticsData.nonFinancial.avgCustomerSatisfaction?.toFixed(1) || analyticsData.nonFinancial.customerSatisfaction?.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analyticsData.isAdmin ? "Company average" : "Your score"}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Internal Processes</CardTitle>
                  <Target className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {analyticsData.nonFinancial.avgInternalProcesses?.toFixed(1) || analyticsData.nonFinancial.internalProcesses?.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analyticsData.isAdmin ? "Company average" : "Your score"}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
                  <Star className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {analyticsData.nonFinancial.avgOverallScore?.toFixed(1) || analyticsData.nonFinancial.overallScore?.toFixed(1) || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {analyticsData.isAdmin ? "Company average" : "Your overall"}
                  </p>
                </CardContent>
              </Card>

              {(analyticsData.isAdmin || analyticsData.isHr) && analyticsData.nonFinancial.totalEmployees && (
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                    <Users className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {analyticsData.nonFinancial.totalEmployees}
                    </div>
                    <p className="text-xs text-muted-foreground">Active employees</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Admin-only section: Department breakdown */}
            {(analyticsData.isAdmin || analyticsData.isHr) && analyticsData.nonFinancial.departmentAverages && analyticsData.nonFinancial.departmentAverages.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Department Performance Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left py-2 px-2">Department</th>
                          <th className="text-right py-2 px-2">Avg Score</th>
                          <th className="text-right py-2 px-2">Employees</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.nonFinancial.departmentAverages.map((dept: any) => (
                          <tr key={dept.department} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-2">{dept.department}</td>
                            <td className="text-right py-2 px-2 font-medium">{dept.avgScore.toFixed(1)}%</td>
                            <td className="text-right py-2 px-2 text-muted-foreground">{dept.employeeCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Role-specific analytics sections */}
        {(analyticsData.isHr || analyticsData.isAdmin) && roleMetrics.hr && (
          <Card>
            <CardHeader>
              <CardTitle>HR / Company Analytics</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Total Employees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{roleMetrics.hr.totalEmployees ?? 0}</CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Evaluations</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{roleMetrics.hr.activeEvaluations ?? 0}</CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pending Reviews</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{roleMetrics.hr.pendingEvaluations ?? 0}</CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Avg Performance</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {Number(roleMetrics.hr.avgPerformance || 0).toFixed(1)}%
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Collections (Month)</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.hr.collectedMonth || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Utilization Rate</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {Number(roleMetrics.hr.utilizationRate || 0).toFixed(1)}%
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}

        {analyticsData.isGmp && roleMetrics.gmp && (
          <Card>
            <CardHeader>
              <CardTitle>Executive Analytics</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Total Employees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.gmp.firmMetrics?.totalEmployees ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Jobs</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.gmp.firmMetrics?.activeJobs ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Collected Revenue</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.gmp.financials?.totalRevenue || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Projected Revenue</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.gmp.financials?.projectedRevenue || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Departments</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.gmp.firmMetrics?.totalDepartments ?? 0}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}

        {analyticsData.isPartner && roleMetrics.partner && (
          <Card>
            <CardHeader>
              <CardTitle>Partner Portfolio Analytics</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Jobs</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.partner.portfolio?.activeJobs ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Completed Jobs</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.partner.portfolio?.completedJobs ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Revenue Collected</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.partner.portfolio?.totalRevenueCollected || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Total Profit</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.partner.portfolio?.totalProfit || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Team Size</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.partner.portfolio?.totalTeamSize ?? 0}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}

        {analyticsData.isManager && roleMetrics.manager && (
          <Card>
            <CardHeader>
              <CardTitle>Manager Analytics</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Team Size</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.manager.teamSize ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Jobs</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.manager.activeJobs ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pending Reviews</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.manager.pendingReviews ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Revenue</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.manager.monthlyRevenue || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Utilization</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {Number(roleMetrics.manager.utilizationRate || 0)}%
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}

        {analyticsData.isFinance && roleMetrics.finance && (
          <Card>
            <CardHeader>
              <CardTitle>Finance Analytics</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Projected (Month)</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.finance.projectedMonth || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Collected (Month)</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.finance.collectedMonth || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Outstanding</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.finance.totalOutstanding || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Total Collected</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.finance.totalCollected || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Collection Rate</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {Number(roleMetrics.finance.collectionRate || 0).toFixed(1)}%
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}

        {analyticsData.isMarketing && roleMetrics.marketing && (
          <Card>
            <CardHeader>
              <CardTitle>Marketing Analytics</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pipeline Value</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  KES {Number(roleMetrics.marketing.pipeline?.pipelineValue || 0).toLocaleString()}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Conversion Rate</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {Number(roleMetrics.marketing.pipeline?.conversionRate || 0).toFixed(1)}%
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Hot Leads</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.marketing.pipeline?.hotLeads ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Survey Responses</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {roleMetrics.marketing.surveys?.totalResponses ?? 0}
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Avg Rating</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {Number(roleMetrics.marketing.surveys?.averageRating || 0).toFixed(1)}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

import { Star } from "lucide-react";
export default NonFinancialAnalytics;
