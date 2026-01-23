import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { 
  Users, 
  DollarSign, 
  Briefcase, 
  TrendingUp, 
  Clock, 
  Target,
  CheckCircle,
  AlertCircle,
  User,
  BarChart3,
  PieChart
} from 'lucide-react';

interface TeamMember {
  employeeId: number;
  firstName: string;
  lastName: string;
  jobPosition: string;
  departmentName: string;
  status: string;
  roleName: string | null;
  hireDate: string | null;
}

interface TeamFinancials {
  activeTeamMembers: number;
  totalTeamHours: number;
  billableHours: number;
  totalRevenue: number;
  totalCost: number;
}

interface TeamPerformance {
  employeeId: number;
  employeeName: string;
  jobPosition: string;
  avgFinancialScore: number;
  avgNonFinancialScore: number;
  avgOverallRating: number;
  totalHoursThisMonth: number;
  billableHoursThisMonth: number;
  utilizationRate: number;
  lastReviewDate: string | null;
}

interface Job {
  jobId: number;
  title: string;
  jobNumber: string | null;
  status: string;
  billingType: string;
  budgetHours: number;
  actualHours: number;
  revenue: number;
  cost: number;
  budgetUtilization: number;
  clientName: string;
  departmentName: string | null;
  startDate: string | null;
  dueDate: string | null;
  completionPercentage: number;
}

interface OverviewMetrics {
  teamSize: number;
  activeJobs: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  utilizationRate: number;
  pendingReviews: number;
}

const ManagerDashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data state
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [teamData, setTeamData] = useState<{
    teamMembers: TeamMember[];
    financials: TeamFinancials;
    performance: TeamPerformance[];
  } | null>(null);
  const [jobData, setJobData] = useState<{
    portfolio: Job[];
    teamJobs: any[];
  } | null>(null);
  const [financialData, setFinancialData] = useState<any>(null);
  const [evaluationData, setEvaluationData] = useState<any>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load overview data first
      const overviewResponse = await apiFetch('GET', '/manager-dashboard/overview');
      setOverview(overviewResponse);

      // Load other data based on active tab
      if (activeTab === 'team') {
        const teamResponse = await apiFetch('GET', '/manager-dashboard/team');
        setTeamData(teamResponse);
      }
      
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load dashboard data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async (tab: string) => {
    try {
      setLoading(true);
      
      switch (tab) {
        case 'team':
          if (!teamData) {
            const response = await apiFetch('GET', '/manager-dashboard/team');
            setTeamData(response);
          }
          break;
        case 'jobs':
          if (!jobData) {
            const response = await apiFetch('GET', '/manager-dashboard/jobs');
            setJobData(response);
          }
          break;
        case 'financials':
          if (!financialData) {
            const response = await apiFetch('GET', '/manager-dashboard/financials');
            setFinancialData(response);
          }
          break;
        case 'evaluations':
          if (!evaluationData) {
            const response = await apiFetch('GET', '/manager-dashboard/evaluations');
            setEvaluationData(response);
          }
          break;
      }
    } catch (error: any) {
      console.error(`Error loading ${tab} data:`, error);
      toast({
        title: 'Error',
        description: `Failed to load ${tab} data`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    loadTabData(tab);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { variant: 'default', label: 'Active' },
      completed: { variant: 'secondary', label: 'Completed' },
      on_hold: { variant: 'destructive', label: 'On Hold' },
      cancelled: { variant: 'outline', label: 'Cancelled' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active;
    return <Badge variant={config.variant as any}>{config.label}</Badge>;
  };

  if (loading && !overview) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Manager Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your team, track job performance, and oversee financial metrics
          </p>
        </div>

        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Size</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview.teamSize}</div>
                <p className="text-xs text-muted-foreground">Direct reports</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview.activeJobs}</div>
                <p className="text-xs text-muted-foreground">In progress</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(overview.monthlyRevenue)}</div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(overview.monthlyProfit)}</div>
                <p className="text-xs text-muted-foreground">Revenue - Cost</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Utilization</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview.utilizationRate}%</div>
                <p className="text-xs text-muted-foreground">Team average</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview.pendingReviews}</div>
                <p className="text-xs text-muted-foreground">Need attention</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="team">My Team</TabsTrigger>
            <TabsTrigger value="jobs">Job Portfolio</TabsTrigger>
            <TabsTrigger value="financials">Financials</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>Common tasks and workflows</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button className="w-full justify-start" variant="outline">
                    <User className="h-4 w-4 mr-2" />
                    Review Team Performance
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Timesheets
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Complete Pending Evaluations
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Briefcase className="h-4 w-4 mr-2" />
                    Assign Team to Jobs
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest team and job updates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm">John Smith completed evaluation for Project Alpha</p>
                        <p className="text-xs text-muted-foreground">2 hours ago</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm">New timesheet submitted by Sarah Johnson</p>
                        <p className="text-xs text-muted-foreground">4 hours ago</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm">Client Evaluation request for Beta Project</p>
                        <p className="text-xs text-muted-foreground">1 day ago</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            {teamData && (
              <>
                {/* Team Financial Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Active Members</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{teamData.financials.activeTeamMembers}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Total Hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{Number(teamData.financials.totalTeamHours).toFixed(1)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Team Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(teamData.financials.totalRevenue)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Team Profit</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(teamData.financials.totalRevenue - teamData.financials.totalCost)}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Team Members Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Members</CardTitle>
                    <CardDescription>Your direct reports and their current status</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Position</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamData.teamMembers.map((member) => (
                          <TableRow key={member.employeeId}>
                            <TableCell className="font-medium">
                              {member.firstName} {member.lastName}
                            </TableCell>
                            <TableCell>{member.jobPosition}</TableCell>
                            <TableCell>{member.departmentName || 'Unassigned'}</TableCell>
                            <TableCell>{member.roleName || 'No Role'}</TableCell>
                            <TableCell>{getStatusBadge(member.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Team Performance */}
                {teamData.performance.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Team Performance This Month</CardTitle>
                      <CardDescription>Hours worked and utilization rates</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Total Hours</TableHead>
                            <TableHead>Billable Hours</TableHead>
                            <TableHead>Utilization</TableHead>
                            <TableHead>Performance Score</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                        {teamData.performance.map((perf) => (
                            <TableRow key={perf.employeeId}>
                              <TableCell className="font-medium">{perf.employeeName}</TableCell>
                              <TableCell>{Number(perf.totalHoursThisMonth).toFixed(1)}</TableCell>
                              <TableCell>{Number(perf.billableHoursThisMonth).toFixed(1)}</TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Progress value={perf.utilizationRate} className="w-16" />
                                  <span className="text-sm">{perf.utilizationRate}%</span>
                                </div>
                              </TableCell>
                              <TableCell>{Number(perf.avgOverallRating).toFixed(1)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            {jobData && (
              <Card>
                <CardHeader>
                  <CardTitle>Job Portfolio</CardTitle>
                  <CardDescription>Jobs you manage and their current status</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobData.portfolio.map((job) => (
                        <TableRow key={job.jobId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{job.title}</div>
                              <div className="text-sm text-muted-foreground">{job.jobNumber}</div>
                            </div>
                          </TableCell>
                          <TableCell>{job.clientName}</TableCell>
                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                          <TableCell>{Number(job.budgetHours).toFixed(1)}h</TableCell>
                          <TableCell>{Number(job.actualHours).toFixed(1)}h</TableCell>
                          <TableCell>{formatCurrency(job.revenue)}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Progress value={job.budgetUtilization} className="w-16" />
                              <span className="text-sm">{job.budgetUtilization}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="financials" className="space-y-4">
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold">Financial Analytics</h3>
              <p className="text-muted-foreground">
                Detailed financial charts and analytics will be displayed here
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ManagerDashboard;
