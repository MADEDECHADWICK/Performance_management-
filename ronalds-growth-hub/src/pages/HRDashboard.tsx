import DashboardLayout from "@/components/DashboardLayout";
import UserRoleManagement from "@/components/UserRoleManagement";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  User, Star, TrendingUp, Target, FileText, Bell, Lock,
  Building2, Users, Calendar, BarChart3, DollarSign, 
  ChartCandlestick, TrendingDown, Award, AlertCircle, Shield
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import apiFetch, { authAPI } from "@/integrations/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

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
}

interface CompanyMetrics {
  totalEmployees: number;
  employeeGrowth: number;
  activeEvaluations: number;
  pendingEvaluations: number;
  avgPerformance: number;
  performanceChange: number;
  totalRevenue: number;
}

const HRDashboard = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [companyMetrics, setCompanyMetrics] = useState<CompanyMetrics | null>(null);
  const [subordinates, setSubordinates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const user = await authAPI.me();
      if (!user) return;

      await Promise.all([
        loadProfile(user.id),
        loadPendingTasks(user.id),
        loadPersonalPerformance(user.id),
        loadCompanyMetrics(),
        loadSubordinates(user.id)
      ]);
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

  const loadProfile = async (userId: string) => {
    const data = await apiFetch('GET', `/profiles?user_id=${userId}`);
    setProfile(data);
  };

  const loadPendingTasks = async (userId: string) => {
    const notifs = await apiFetch('GET', `/notifications?user_id=${userId}&is_read=false`);
    setPendingTasks((notifs || []).length || 0);
  };

  const loadPersonalPerformance = async (userId: string) => {
    try {
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
        learningGrowthScore: Math.round(learningGrowthScore)
      });
    } catch (error) {
      console.error("Error loading performance:", error);
    }
  };

  const loadCompanyMetrics = async () => {
    try {
      // Get total employees count
      const profiles = await apiFetch('GET', '/profiles?status=active');
      const totalEmployees = profiles?.length || 0;

      // Get active evaluations
      const evalCycles = await apiFetch('GET', '/evaluation_cycles?status=active');
      const activeEvaluations = evalCycles?.length || 0;

      // Get pending evaluation assignments
      const pendingAssignments = await apiFetch('GET', '/evaluation_assignments?status=pending');
      const pendingEvaluations = pendingAssignments?.length || 0;

      // Get average performance from all employee allocations
      const allAllocations = await apiFetch('GET', '/employee_project_allocations');
      const totalRevenue = allAllocations?.reduce((sum: any, a: any) => sum + (a.allocation_amount || 0), 0) || 0;

      setCompanyMetrics({
        totalEmployees: totalEmployees || 0,
        employeeGrowth: 8, // TODO: Calculate from historical data
        activeEvaluations: activeEvaluations || 0,
        pendingEvaluations: pendingEvaluations || 0,
        avgPerformance: 87.2, // TODO: Calculate from actual performance data
        performanceChange: 3.2, // TODO: Calculate from historical data
        totalRevenue: totalRevenue
      });
    } catch (error) {
      console.error("Error loading company metrics:", error);
    }
  };

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
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {profile?.position || "HR"} Dashboard
          </h2>
          <p className="text-muted-foreground">
            View your personal performance and manage company-wide operations
          </p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">My Overall Score</CardTitle>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {companyMetrics?.totalEmployees || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    +{companyMetrics?.employeeGrowth || 0} from last month
                  </p>
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
                  <CardTitle className="text-sm font-medium">Avg Performance</CardTitle>
                  <TrendingUp className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    {companyMetrics?.avgPerformance || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    +{companyMetrics?.performanceChange || 0}% from last quarter
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-secondary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">
                    KES {((companyMetrics?.totalRevenue || 0) / 1000000).toFixed(0)}M
                  </div>
                  <p className="text-xs text-muted-foreground">Current fiscal year</p>
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
                    <Award className="h-5 w-5 text-primary" />
                    Performance Insights
                  </CardTitle>
                  <CardDescription>Company-wide performance summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-success mt-2" />
                    <div>
                      <p className="font-medium">Top performing department</p>
                      <p className="text-muted-foreground text-xs">Tax Advisory at 92% overall score</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-info mt-2" />
                    <div>
                      <p className="font-medium">Evaluation completion</p>
                      <p className="text-muted-foreground text-xs">75% of Q1 evaluations completed</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-warning mt-2" />
                    <div>
                      <p className="font-medium">Action required</p>
                      <p className="text-muted-foreground text-xs">12 pending manager reviews</p>
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
