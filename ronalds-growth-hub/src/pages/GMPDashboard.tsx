import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Crown, Building2, Users, DollarSign, TrendingUp, AlertTriangle,
  BarChart3, FileText, Target, Briefcase, User, CheckCircle2,
  TrendingDown, Award, Calendar, Clock, ChevronRight, Eye,
  Settings, Filter, Download, RefreshCw
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, authAPI } from "@/integrations/apiClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const GMPDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [personalData, setPersonalData] = useState<PersonalData | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("executive");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    verifyGMPAccessAndLoadData();
  }, []);

  const verifyGMPAccessAndLoadData = async () => {
    try {
      setIsLoading(true);
      
      // Verify user access and redirect if needed
      const user = await authAPI.me();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Load all dashboard data
      await Promise.all([
        loadDashboardData(),
        loadPersonalData(),
        loadAlertsData()
      ]);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error loading GMP dashboard:", error);
      
      // If access denied, redirect to appropriate dashboard
      if (error?.status === 403) {
        toast({
          title: "Access Denied",
          description: "Group Managing Partner privileges required. Redirecting...",
          variant: "destructive"
        });
        
        // Redirect to appropriate dashboard based on role
        setTimeout(() => {
          navigate("/dashboard");
        }, 2000);
        return;
      }
      
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive"
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
      throw error;
    }
  };

  const loadPersonalData = async () => {
    try {
      const data = await apiFetch("GET", "/gmp-dashboard/personal");
      setPersonalData(data);
    } catch (error) {
      console.error("Error loading personal data:", error);
      throw error;
    }
  };

  const loadAlertsData = async () => {
    try {
      const data = await apiFetch("GET", "/gmp-dashboard/alerts");
      setAlertsData(data);
    } catch (error) {
      console.error("Error loading alerts:", error);
      throw error;
    }
  };

  const loadPartnerDetails = async (partnerId: number) => {
    try {
      const data = await apiFetch("GET", `/gmp-dashboard/partner/${partnerId}`);
      setSelectedPartner(data);
    } catch (error) {
      console.error("Error loading partner details:", error);
      toast({
        title: "Error",
        description: "Failed to load partner details",
        variant: "destructive"
      });
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
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${(value || 0).toFixed(1)}%`;
  };

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="h-8 w-8 text-yellow-500" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Executive Dashboard</h1>
              <p className="text-muted-foreground">
                Group Managing Partner Strategic Overview
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="executive" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Executive Summary
            </TabsTrigger>
            <TabsTrigger value="partners" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Partner Oversight
            </TabsTrigger>
            <TabsTrigger value="managers" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Manager Performance
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              My Portfolio
            </TabsTrigger>
          </TabsList>

          {/* Executive Summary Tab */}
          <TabsContent value="executive" className="space-y-6">
            {dashboardData && (
              <>
                {/* Firm Performance Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                      <DollarSign className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(dashboardData.firmMetrics.total_revenue)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Across {dashboardData.firmMetrics.active_jobs} active jobs
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Partners</CardTitle>
                      <Users className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {dashboardData.firmMetrics.total_partners}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Managing {dashboardData.firmMetrics.total_managers} managers
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
                      <Building2 className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {dashboardData.firmMetrics.active_clients}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Across {dashboardData.firmMetrics.total_departments} departments
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Team Size</CardTitle>
                      <Users className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {dashboardData.firmMetrics.total_employees}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {dashboardData.firmMetrics.evaluations_this_month} evaluations this month
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Department Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Department Performance Overview
                    </CardTitle>
                    <CardDescription>
                      Revenue and team metrics by department
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Employees</TableHead>
                          <TableHead className="text-right">Partners</TableHead>
                          <TableHead className="text-right">Avg Performance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboardData.departmentBreakdown
                          .sort((a, b) => b.department_revenue - a.department_revenue)
                          .map((dept) => (
                          <TableRow key={dept.department_id}>
                            <TableCell className="font-medium">
                              {dept.department_name}
                              <span className="text-xs text-muted-foreground ml-2">
                                ({dept.department_code})
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(dept.department_revenue)}
                            </TableCell>
                            <TableCell className="text-right">
                              {dept.employee_count}
                            </TableCell>
                            <TableCell className="text-right">
                              {dept.partner_count}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={
                                dept.avg_department_performance > 80 ? "default" :
                                dept.avg_department_performance > 60 ? "secondary" : "destructive"
                              }>
                                {dept.avg_department_performance 
                                  ? `${dept.avg_department_performance.toFixed(1)}%`
                                  : 'N/A'
                                }
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Alerts Section */}
                {alertsData && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          Jobs at Risk
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {alertsData.jobsAtRisk.length > 0 ? (
                          <div className="space-y-2">
                            {alertsData.jobsAtRisk.slice(0, 3).map((job) => (
                              <div key={job.id} className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm font-medium">{job.jobNumber}</p>
                                  <p className="text-xs text-muted-foreground">{job.clientName}</p>
                                </div>
                                <Badge variant={job.severity === 'high' ? 'destructive' : 'secondary'}>
                                  {job.severity}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No jobs at risk</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4 text-orange-500" />
                          Pending Evaluations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {alertsData.pendingEvaluations.length > 0 ? (
                          <div className="space-y-2">
                            {alertsData.pendingEvaluations.slice(0, 3).map((evaluation) => (
                              <div key={evaluation.id} className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm font-medium">{evaluation.employeeName}</p>
                                  <p className="text-xs text-muted-foreground">{evaluation.employeePosition}</p>
                                </div>
                                <Badge variant="outline">
                                  {evaluation.daysPending}d
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">All evaluations up to date</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-blue-500" />
                          Low Utilization
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {alertsData.lowUtilizationPartners.length > 0 ? (
                          <div className="space-y-2">
                            {alertsData.lowUtilizationPartners.slice(0, 3).map((partner) => (
                              <div key={partner.id} className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm font-medium">{partner.name}</p>
                                  <p className="text-xs text-muted-foreground">{partner.position}</p>
                                </div>
                                <Badge variant="outline">
                                  {partner.monthlyHours}h
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">All partners well utilized</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Partner Oversight Tab */}
          <TabsContent value="partners" className="space-y-6">
            {dashboardData && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Partner Performance Rankings
                    </CardTitle>
                    <CardDescription>
                      Portfolio performance and team leadership metrics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Partner</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Portfolio Revenue</TableHead>
                          <TableHead className="text-right">Active Jobs</TableHead>
                          <TableHead className="text-right">Team Size</TableHead>
                          <TableHead className="text-right">Clients</TableHead>
                          <TableHead className="text-right">Team Score</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboardData.partnerRankings
                          .sort((a, b) => b.portfolio_revenue - a.portfolio_revenue)
                          .map((partner) => (
                          <TableRow key={partner.partner_id}>
                            <TableCell className="font-medium">
                              {partner.name}
                              <br />
                              <span className="text-xs text-muted-foreground">
                                {partner.position}
                              </span>
                            </TableCell>
                            <TableCell>{partner.department}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(partner.portfolio_revenue)}
                            </TableCell>
                            <TableCell className="text-right">
                              {partner.active_jobs}
                            </TableCell>
                            <TableCell className="text-right">
                              {partner.direct_reports}
                            </TableCell>
                            <TableCell className="text-right">
                              {partner.client_count}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={
                                partner.avg_team_score > 80 ? "default" :
                                partner.avg_team_score > 60 ? "secondary" : "destructive"
                              }>
                                {partner.avg_team_score 
                                  ? `${partner.avg_team_score.toFixed(1)}%`
                                  : 'N/A'
                                }
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => loadPartnerDetails(partner.partner_id)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Manager Performance Tab */}
          <TabsContent value="managers" className="space-y-6">
            {dashboardData && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Manager Performance Overview
                    </CardTitle>
                    <CardDescription>
                      Team leadership and utilization metrics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Manager</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Reports To</TableHead>
                          <TableHead className="text-right">Team Size</TableHead>
                          <TableHead className="text-right">Total Hours</TableHead>
                          <TableHead className="text-right">Jobs Managed</TableHead>
                          <TableHead className="text-right">Avg Performance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboardData.managerRankings
                          .sort((a, b) => b.team_total_hours - a.team_total_hours)
                          .map((manager) => (
                          <TableRow key={manager.manager_id}>
                            <TableCell className="font-medium">
                              {manager.name}
                              <br />
                              <span className="text-xs text-muted-foreground">
                                {manager.position}
                              </span>
                            </TableCell>
                            <TableCell>{manager.department}</TableCell>
                            <TableCell>
                              {manager.reports_to || 'Direct to GMP'}
                            </TableCell>
                            <TableCell className="text-right">
                              {manager.team_size}
                            </TableCell>
                            <TableCell className="text-right">
                              {manager.team_total_hours.toFixed(0)}h
                            </TableCell>
                            <TableCell className="text-right">
                              {manager.jobs_managed}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={
                                manager.avg_performance > 80 ? "default" :
                                manager.avg_performance > 60 ? "secondary" : "destructive"
                              }>
                                {manager.avg_performance 
                                  ? `${manager.avg_performance.toFixed(1)}%`
                                  : 'N/A'
                                }
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* My Portfolio Tab */}
          <TabsContent value="portfolio" className="space-y-6">
            {personalData && (
              <>
                {/* Personal Performance Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">My Revenue</CardTitle>
                      <DollarSign className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(personalData.personalMetrics.totalRevenue)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        From {personalData.personalMetrics.activeJobs} active jobs
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Direct Reports</CardTitle>
                      <Users className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {personalData.personalMetrics.directReports}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Team members reporting to you
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
                      <Target className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {personalData.personalMetrics.overallScore 
                          ? `${personalData.personalMetrics.overallScore.toFixed(1)}%`
                          : 'N/A'
                        }
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Latest performance evaluation
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Fees Generated</CardTitle>
                      <Award className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(personalData.personalMetrics.totalFees)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Total fees from my portfolio
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* My Jobs */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      My Active Jobs
                    </CardTitle>
                    <CardDescription>
                      Jobs where you are the partner or manager
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job Number</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Fees</TableHead>
                          <TableHead className="text-right">Team Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {personalData.jobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="font-medium">
                              {job.jobNumber}
                            </TableCell>
                            <TableCell>{job.clientName}</TableCell>
                            <TableCell>
                              <Badge variant={job.role === 'Partner' ? 'default' : 'secondary'}>
                                {job.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(job.amountCollected)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(job.fees)}
                            </TableCell>
                            <TableCell className="text-right">
                              {job.teamSize}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Direct Reports */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      My Direct Reports
                    </CardTitle>
                    <CardDescription>
                      Team members reporting directly to you
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Latest Performance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {personalData.directReports.map((report) => (
                          <TableRow key={report.id}>
                            <TableCell className="font-medium">
                              {report.name}
                            </TableCell>
                            <TableCell>{report.position}</TableCell>
                            <TableCell>{report.department}</TableCell>
                            <TableCell className="text-right">
                              {report.latestPerformance ? (
                                <Badge variant={
                                  report.latestPerformance > 80 ? "default" :
                                  report.latestPerformance > 60 ? "secondary" : "destructive"
                                }>
                                  {report.latestPerformance.toFixed(1)}%
                                </Badge>
                              ) : (
                                <Badge variant="outline">No evaluation</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Partner Detail Modal */}
        <Dialog open={!!selectedPartner} onOpenChange={() => setSelectedPartner(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Partner Details: {selectedPartner?.partner?.name}
              </DialogTitle>
              <DialogDescription>
                Comprehensive view of partner portfolio and team performance
              </DialogDescription>
            </DialogHeader>
            
            {selectedPartner && (
              <div className="space-y-6">
                {/* Partner Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Department</p>
                    <p className="text-sm text-muted-foreground">{selectedPartner.partner.department}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Position</p>
                    <p className="text-sm text-muted-foreground">{selectedPartner.partner.position}</p>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-bold">
                        {formatCurrency(selectedPartner.financials.totalRevenue)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Active Jobs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-bold">
                        {selectedPartner.financials.activeJobsCount}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Avg Job Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-bold">
                        {formatCurrency(selectedPartner.financials.averageJobValue)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Jobs Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Active Jobs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job Number</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Team Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPartner.jobs.map((job: any) => (
                          <TableRow key={job.id}>
                            <TableCell>{job.jobNumber}</TableCell>
                            <TableCell>{job.clientName}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(job.amountCollected)}
                            </TableCell>
                            <TableCell className="text-right">{job.teamSize}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Team Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team Member</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead className="text-right">Recent Hours</TableHead>
                          <TableHead className="text-right">Performance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPartner.team.map((member: any) => (
                          <TableRow key={member.memberId}>
                            <TableCell>{member.name}</TableCell>
                            <TableCell>{member.position}</TableCell>
                            <TableCell className="text-right">{member.recentHours}h</TableCell>
                            <TableCell className="text-right">
                              {member.performanceScore ? (
                                <Badge variant={
                                  member.performanceScore > 80 ? "default" :
                                  member.performanceScore > 60 ? "secondary" : "destructive"
                                }>
                                  {member.performanceScore.toFixed(1)}%
                                </Badge>
                              ) : (
                                <Badge variant="outline">No score</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default GMPDashboard;