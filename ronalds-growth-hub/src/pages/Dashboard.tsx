import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Users, DollarSign, Target, Star, FileText, Loader2, Briefcase, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiFetch, authAPI } from "@/integrations/apiClient";
import { useToast } from "@/hooks/use-toast";

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
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [isPartner, setIsPartner] = useState(false);
  const [partnerData, setPartnerData] = useState<any>(null);

  useEffect(() => {
    checkUserRoleAndLoadData();
  }, []);

  const checkUserRoleAndLoadData = async () => {
    try {
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Store user in sessionStorage for component access
      sessionStorage.setItem('currentUser', JSON.stringify(user));

      const roles = await apiFetch("GET", `/user-roles?userId=${user.id}`);
      const userRoles = roles?.map((r: any) => r.role) || [];
      
      // Get user profile to check for GMP position
      const profileResponse = await apiFetch(
        'GET',
        `/profiles/email/${encodeURIComponent(user.email)}`
      );
      const userProfile = profileResponse?.data ?? profileResponse;
      
      // Check if user is Group Managing Partner
      const isGMP = userProfile?.positionTitle?.toLowerCase().includes('group_managing_partner') || 
                    userProfile?.positionTitle?.toLowerCase().includes('group managing partner') ||
                    userProfile?.positionTitle === 'group_managing_partner' ||
                    userRoles.includes('group_managing_partner');
      
      // Redirect GMP to executive dashboard
      if (isGMP) {
        navigate("/gmp-dashboard", { replace: true });
        return;
      }
      
      // Redirect HR/Admin to dedicated HR dashboard
      if (userRoles.includes("hr_manager") || userRoles.includes("super_admin")) {
        navigate("/hr-dashboard", { replace: true });
        return;
      }

      // Check if user is a partner (not GMP) - redirect to partner dashboard
      const isPartner = userProfile?.positionTitle?.toLowerCase() === 'partner' || 
                        userProfile?.isPartner === true ||
                        userRoles.includes('partner');
      
      if (isPartner) {
        navigate("/partner-dashboard", { replace: true });
        return;
      }

      // Check if user is a manager - redirect to manager dashboard
      const isManager = userProfile?.positionTitle?.toLowerCase().includes('manager') ||
                        userProfile?.positionTitle?.toLowerCase() === 'manager' ||
                        userRoles.includes('manager');
      
      if (isManager) {
        navigate("/manager-dashboard", { replace: true });
        return;
      }

      // Default: Load employee dashboard data
      await loadPersonalPerformance(user.id);
      await loadRecentActivity(user.id);
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

  const loadPersonalPerformance = async (userId: string) => {
    try {
      const allocations = await apiFetch("GET", `/employee_project_allocations?employee_id=${userId}`);
      const totalRevenue = allocations?.reduce((sum: number, a: any) => sum + (a.allocation_amount || 0), 0) || 0;
      const totalBillableHours = allocations?.reduce((sum: number, a: any) => sum + (a.billable_hours || 0), 0) || 0;

      // Get client ratings
      const clientEvals = await apiFetch("GET", `/client_evaluations?employee_id=${userId}`);
      const avgClientRating = clientEvals && clientEvals.length > 0
        ? clientEvals.reduce((sum: number, e: any) => sum + (e.overall_rating || 0), 0) / clientEvals.length
        : 0;

      // Get KPI scores by BSC category
      const kpiAssignments = await apiFetch("GET", `/employee_kpi_assignments?employee_id=${userId}`);

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
        revenueContribution: totalRevenue,
        billableHours: totalBillableHours,
        utilizationRate: Math.round(utilizationRate),
        clientRating: Math.round(avgClientRating * 10) / 10,
        clientReviewCount: clientEvals?.length || 0,
        financialScore: Math.round(financialScore),
        customerScore: Math.round(customerScore),
        internalProcessScore: Math.round(internalProcessScore),
        learningGrowthScore: Math.round(learningGrowthScore)
      });
    } catch (error) {
      console.error("Error loading performance:", error);
    }
  };

  const loadRecentActivity = async (userId: string) => {
    try {
      const activities: any[] = [];

      // Check completed evaluations
      const completedEvals = await apiFetch("GET", `/evaluation_assignments?evaluator_id=${userId}&status=completed&limit=1`);

      if (completedEvals && completedEvals.length > 0) {
        activities.push({
          type: "success",
          title: "Evaluation completed",
          description: `${completedEvals[0].evaluation_type} evaluation submitted`,
          date: completedEvals[0].submitted_at
        });
      }

      // Check pending evaluations
      const pendingEvals = await apiFetch("GET", `/evaluation_assignments?evaluator_id=${userId}&status=pending&count=true`);
      const pendingCount = Array.isArray(pendingEvals) ? pendingEvals.length : pendingEvals?.count || 0;

      if (pendingCount && pendingCount > 0) {
        activities.push({
          type: "warning",
          title: "Pending evaluations",
          description: `${pendingCount} evaluation(s) awaiting completion`,
          date: new Date().toISOString()
        });
      }

      // Check KPI assignments
      const kpiUpdates = await apiFetch("GET", `/employee_kpi_assignments?employee_id=${userId}&limit=1`);

      if (kpiUpdates && kpiUpdates.length > 0) {
        activities.push({
          type: "info",
          title: "KPI updated",
          description: "Performance metrics were recently updated",
          date: kpiUpdates[0].updated_at
        });
      }

      setRecentActivities(activities.slice(0, 3));
    } catch (error) {
      console.error("Error loading activities:", error);
    }
  };

  const loadPartnerPerformance = async (user: any) => {
    try {
      setIsPartner(true);
      
      const profileId = user.profile_id ?? user.profileId;
      if (!profileId) {
        throw new Error('No profile ID found for partner');
      }

      // Get partner portfolio metrics
      const portfolioRes = await apiFetch("GET", "/partner/portfolio");
      
      // Get top jobs
      const jobsRes = await apiFetch("GET", "/partner/jobs");
      
      // Get pending approvals
      const pendingRes = await apiFetch("GET", "/partner/jobs?pending=true");

      setPartnerData({
        portfolio: portfolioRes,
        topJobs: jobsRes?.slice(0, 5) || [],
        pendingApprovalsCount: pendingRes?.length || 0
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
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {isPartner ? 'Partner Dashboard' : 'Welcome back!'}
          </h2>
          <p className="text-muted-foreground">
            {isPartner 
              ? `Here's an overview of your portfolio and projects.`
              : "Here's an overview of your personal performance metrics and activities."
            }
          </p>
        </div>

        {/* Partner Dashboard View */}
        {isPartner && partnerData ? (
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
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    KES {((partnerData.portfolio?.totalRevenue || 0) / 1000000).toFixed(1)}M
                  </div>
                  <p className="text-xs text-muted-foreground">Collected</p>
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
              <Star className="h-4 w-4 text-accent" />
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
              <CardTitle className="text-sm font-medium">Revenue Contribution</CardTitle>
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
              <CardTitle className="text-sm font-medium">Billable Hours</CardTitle>
              <TrendingUp className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {performance?.billableHours || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {performance?.utilizationRate || 0}% utilization rate
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Client Rating</CardTitle>
              <Users className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {performance?.clientRating || 0}/5.0
              </div>
              <p className="text-xs text-muted-foreground">
                Based on {performance?.clientReviewCount || 0} reviews
              </p>
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
              <Link to="/my-evaluations" className="block mt-4">
                <Button className="w-full" variant="outline">
                  View All Activity
                </Button>
              </Link>
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
