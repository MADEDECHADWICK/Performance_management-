import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, timeEntriesAPI } from '@/lib/api';
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
  PieChart,
  Award
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
  costingStatus: string;
  costingFee: number;
  costingEstimatedCost: number;
  costingEstimatedHours: number;
  clientName: string;
  departmentName: string | null;
  startDate: string | null;
  dueDate: string | null;
  completionPercentage: number;
}

interface AllocationSummary {
  jobId: number;
  remainingJobHours: number;
  allowedJobHours: number;
  loggedJobHours: number;
}

interface OverviewMetrics {
  teamSize: number;
  activeJobs: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  utilizationRate: number;
  pendingReviews: number;
}

interface PersonalPerformance {
  overallScore: number;
  revenue: number;
  netProfit: number;
  utilizationRate: number;
  okrScore: number;
  projectEvaluationScore: number;
  lossAlert?: boolean;
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  link?: string | null;
  createdAt?: string;
}

interface PendingTimeEntry {
  id: number;
  hours: number;
  dateWorked?: string;
  job?: { id: number; jobName: string };
  employee?: { firstName: string; lastName: string };
}

interface ApprovalRequest {
  id: number;
  jobId: number;
  status: string;
  additionalHoursRequested: number;
  requestedAt?: string;
  job?: { id: number; jobName: string; client?: { clientName?: string } };
  employee?: { firstName: string; lastName: string };
}

interface ApprovalAuditLog {
  id: number;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  metadata?: any;
  createdAt?: string;
}

interface WorkloadMetrics {
  total_team_members: number;
  avg_utilization: number;
  overloaded_employees: number;
  underutilized_employees: number;
  critical_deadlines: number;
  capacity_variance: number;
  burnout_risk: number;
}

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data state
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [personalPerformance, setPersonalPerformance] = useState<PersonalPerformance | null>(null);
  const [teamData, setTeamData] = useState<{
    teamMembers: TeamMember[];
    financials: TeamFinancials;
    performance: TeamPerformance[];
  } | null>(null);
  const [jobData, setJobData] = useState<{
    portfolio: Job[];
    teamJobs: any[];
  } | null>(null);
  const [allocationSummaries, setAllocationSummaries] = useState<Record<number, AllocationSummary>>({});
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [pendingAlertsCount, setPendingAlertsCount] = useState(0);
  const [pendingTimeEntries, setPendingTimeEntries] = useState<PendingTimeEntry[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [approvalAudit, setApprovalAudit] = useState<ApprovalAuditLog[]>([]);
  const [workloadMetrics, setWorkloadMetrics] = useState<WorkloadMetrics | null>(null);
  const [financialData, setFinancialData] = useState<any>(null);
  const [evaluationData, setEvaluationData] = useState<any>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load overview data first
      const overviewResponse = await apiFetch('GET', '/manager-dashboard/overview');
      setOverview(overviewResponse);
      const workloadResponse = await apiFetch('GET', '/manager/workload-metrics');
      setWorkloadMetrics(workloadResponse);
      await loadAlerts();
      await loadPersonalPerformance();
      await loadApprovals();
      await loadApprovalAudit();

      // Load other data based on active tab
      if (activeTab === 'team') {
        const teamResponse = await apiFetch('GET', '/manager-dashboard/team');
        setTeamData(teamResponse);
      }
      
    } catch (error: any) {
      if (error?.status === 401) {
        navigate('/auth');
        return;
      }
      if (error?.status === 404) {
        setOverview(null);
        setTeamData(null);
        setJobData(null);
        setFinancialData(null);
        setEvaluationData(null);
        return;
      }
      console.error('Error loading dashboard data:', error);
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
          if (!jobData) {
            const response = await apiFetch('GET', '/manager-dashboard/jobs');
            setJobData(response);
            await loadAllocationSummaries(response?.portfolio || []);
          } else if (jobData?.portfolio?.length && Object.keys(allocationSummaries).length === 0) {
            await loadAllocationSummaries(jobData.portfolio);
          }
          break;
        case 'jobs':
          if (!jobData) {
            const response = await apiFetch('GET', '/manager-dashboard/jobs');
            setJobData(response);
            await loadAllocationSummaries(response?.portfolio || []);
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
      if (error?.status === 401) {
        navigate('/auth');
        return;
      }
      if (error?.status === 404) {
        if (tab === 'team') {
          setTeamData(null);
        }
        if (tab === 'jobs') {
          setJobData(null);
        }
        if (tab === 'financials') {
          setFinancialData(null);
        }
        if (tab === 'evaluations') {
          setEvaluationData(null);
        }
        return;
      }
      console.error(`Error loading ${tab} data:`, error);
    } finally {
      setLoading(false);
    }
  };

  const loadAlerts = async () => {
    try {
      const response = await apiFetch('GET', '/notifications?status=unread&type=action&pageSize=20');
      const payload = response?.data ?? response ?? {};
      const list = Array.isArray(payload.items) ? payload.items : payload.items?.items ?? [];
      setAlerts(list.slice(0, 4));
      setPendingAlertsCount(list.length);
    } catch (error) {
      console.error('Failed to load manager alerts', error);
    }
  };

  const loadPersonalPerformance = async () => {
    try {
      const performanceResponse = await apiFetch('GET', '/performance-scores/me');
      const performancePayload = (performanceResponse as any)?.data ?? performanceResponse;

      if (performancePayload?.financial && performancePayload?.overall) {
        const financial = performancePayload.financial;
        const nonFinancial = performancePayload.nonFinancial || {};
        const utilizationPercent = Math.round((financial.utilizationRate || 0) * 100);
        const lossAlert = Boolean(performancePayload?.scoreBreakdown?.lossAlert);

        setPersonalPerformance({
          overallScore: Math.round((performancePayload.overall.totalScore || 0) * 10) / 10,
          revenue: Number(financial.revenue || 0),
          netProfit: Number(financial.netProfit || 0),
          utilizationRate: utilizationPercent,
          okrScore: Math.round(nonFinancial.okrScore || 0),
          projectEvaluationScore: Math.round(nonFinancial.projectEvaluationScore || 0),
          lossAlert,
        });
      }
    } catch (error) {
      console.error('Error loading personal performance:', error);
    }
  };

  const loadApprovals = async () => {
    try {
      const [pendingEntries, requests] = await Promise.all([
        timeEntriesAPI.getPendingApprovals(),
        timeEntriesAPI.listApprovalRequests({ status: 'pending' }),
      ]);
      setPendingTimeEntries(Array.isArray(pendingEntries) ? pendingEntries.slice(0, 5) : []);
      setApprovalRequests(Array.isArray(requests) ? requests.slice(0, 5) : []);
    } catch (error) {
      console.error('Error loading approvals:', error);
    }
  };

  const handleApproveTimeEntry = async (id: number) => {
    await timeEntriesAPI.approve(id);
    await loadApprovals();
    await loadApprovalAudit();
  };

  const handleRejectTimeEntry = async (id: number) => {
    const reason = window.prompt('Rejection reason (optional):') || 'Rejected';
    await timeEntriesAPI.reject(id, reason);
    await loadApprovals();
    await loadApprovalAudit();
  };

  const handleApproveRequest = async (id: number) => {
    const notes = window.prompt('Approval notes (optional):') || undefined;
    await timeEntriesAPI.approveApprovalRequest(id, notes);
    await loadApprovals();
    await loadApprovalAudit();
  };

  const handleRejectRequest = async (id: number) => {
    const notes = window.prompt('Rejection reason (optional):') || undefined;
    await timeEntriesAPI.rejectApprovalRequest(id, notes);
    await loadApprovals();
    await loadApprovalAudit();
  };

  const loadApprovalAudit = async () => {
    try {
      const logs = await apiFetch('GET', '/audit-logs?limit=50');
      const list = Array.isArray(logs) ? logs : [];
      const filtered = list.filter((log) => {
        const action = String(log.action || '');
        return (
          action.startsWith('time_entry_approved') ||
          action.startsWith('time_entry_rejected') ||
          action.startsWith('approval_request_approved') ||
          action.startsWith('approval_request_rejected') ||
          action.startsWith('job_costing_updated')
        );
      });
      setApprovalAudit(filtered.slice(0, 6));
    } catch (error) {
      console.error('Error loading approval audit logs:', error);
    }
  };

  const loadAllocationSummaries = async (jobs: Job[]) => {
    if (!jobs.length) return;
    try {
      const summaries = await Promise.all(
        jobs.map((job) => timeEntriesAPI.getJobAllocationSummary(job.jobId))
      );
      const mapped = summaries.reduce((acc, summary) => {
        acc[summary.jobId] = {
          jobId: summary.jobId,
          remainingJobHours: summary.remainingJobHours,
          allowedJobHours: summary.allowedJobHours,
          loggedJobHours: summary.loggedJobHours,
        };
        return acc;
      }, {} as Record<number, AllocationSummary>);
      setAllocationSummaries(mapped);
    } catch (error) {
      console.error('Error loading allocation summaries:', error);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    loadTabData(tab);
  };

  const filteredJobs = (jobData?.portfolio || []).filter((job) => {
    if (jobStatusFilter && job.status !== jobStatusFilter) return false;
    if (jobSearch.trim()) {
      const query = jobSearch.toLowerCase();
      const haystack = [job.title, job.jobNumber, job.clientName, job.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (pendingOnly && !approvalCountsByJob[job.jobId]) return false;
    return true;
  });

  const approvalCountsByJob = pendingTimeEntries.reduce((acc, entry) => {
    const jobId = entry.job?.id;
    if (jobId) acc[jobId] = (acc[jobId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  approvalRequests.forEach((req) => {
    const jobId = req.jobId;
    approvalCountsByJob[jobId] = (approvalCountsByJob[jobId] || 0) + 1;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getAllocationMetrics = () => {
    if (!jobData?.portfolio?.length) {
      return {
        totalJobs: 0,
        overAllocatedJobs: 0,
        totalRemainingHours: 0,
      };
    }

    const metrics = jobData.portfolio.reduce(
      (acc, job) => {
        const summary = allocationSummaries[job.jobId];
        const fallbackRemaining = Math.max(
          0,
          Number(job.budgetHours) - Number(job.actualHours)
        );
        const remaining = summary ? Number(summary.remainingJobHours) : fallbackRemaining;
        acc.totalJobs += 1;
        acc.totalRemainingHours += remaining;
        if (remaining <= 0) acc.overAllocatedJobs += 1;
        return acc;
      },
      { totalJobs: 0, overAllocatedJobs: 0, totalRemainingHours: 0 }
    );

    return metrics;
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

  const getCostingBadge = (job: Job) => {
    if (!job.costingStatus || job.costingStatus === 'missing') {
      return <Badge variant="outline">Not costed</Badge>;
    }

    if (job.costingFee > 0 && job.costingEstimatedCost > job.costingFee) {
      return <Badge variant="destructive">Over fee</Badge>;
    }

    const label = job.costingStatus.replace(/_/g, ' ');
    return <Badge variant="secondary">{label}</Badge>;
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

        {personalPerformance && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Overall Score</CardTitle>
                <div className="flex items-center gap-2">
                  {personalPerformance.lossAlert && (
                    <Badge variant="destructive">Loss alert</Badge>
                  )}
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{personalPerformance.overallScore}</div>
                <p className="text-xs text-muted-foreground">Financial + non-financial</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  KES {personalPerformance.revenue.toFixed(0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Net Profit</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  KES {personalPerformance.netProfit.toFixed(0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Utilization</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {personalPerformance.utilizationRate}%
                </div>
                <p className="text-xs text-muted-foreground">Billable vs allocated</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">OKR Progress</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {personalPerformance.okrScore}%
                </div>
                <p className="text-xs text-muted-foreground">Objectives on track</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Project Eval Score</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {personalPerformance.projectEvaluationScore}%
                </div>
                <p className="text-xs text-muted-foreground">Job-based reviews</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Overview Cards */}
        {!overview && (
          <Card className="border-dashed mb-6">
            <CardHeader>
              <CardTitle>No manager analytics yet</CardTitle>
              <CardDescription>
                Team and job metrics will appear once activity is recorded.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
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

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingAlertsCount}</div>
                <p className="text-xs text-muted-foreground">Action required</p>
              </CardContent>
            </Card>
          </div>
        )}

        {workloadMetrics && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Workload Health</CardTitle>
                <CardDescription>Team capacity and utilization summary.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/workload-management')}>
                View workload
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div>
                <p className="text-sm text-muted-foreground">Team members</p>
                <p className="text-xl font-semibold">{workloadMetrics.total_team_members}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg utilization</p>
                <p className="text-xl font-semibold">
                  {Math.round(workloadMetrics.avg_utilization)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overloaded</p>
                <p className="text-xl font-semibold text-destructive">
                  {workloadMetrics.overloaded_employees}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Underutilized</p>
                <p className="text-xl font-semibold">
                  {workloadMetrics.underutilized_employees}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Critical deadlines</p>
                <p className="text-xl font-semibold">{workloadMetrics.critical_deadlines}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Burnout risk</p>
                <p className="text-xl font-semibold">
                  {Math.round(workloadMetrics.burnout_risk)}%
                </p>
              </div>
            </CardContent>
          </Card>
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
              {alerts.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Pending Alerts</CardTitle>
                      <CardDescription>Approvals and actions waiting on you.</CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => navigate('/notifications')}>
                      View all
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="rounded-md border p-3">
                        <p className="font-medium">{alert.title}</p>
                        <p className="text-sm text-muted-foreground">{alert.message}</p>
                        {alert.link && (
                          <Button
                            className="mt-2"
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(alert.link!)}
                          >
                            Review
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
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
                  <CardTitle>Approval Queue</CardTitle>
                  <CardDescription>Pending submissions and extra-time requests.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Badge variant="secondary">
                      {pendingTimeEntries.length} time entries
                    </Badge>
                    <Badge variant="secondary">
                      {approvalRequests.length} hour requests
                    </Badge>
                    <Badge variant="outline">
                      {pendingTimeEntries.length + approvalRequests.length} total pending
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => navigate('/timesheets')}>
                      Review queue
                    </Button>
                  </div>
                  {pendingTimeEntries.length === 0 && approvalRequests.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No pending approvals right now.
                    </div>
                  )}
                  {pendingTimeEntries.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Time entries awaiting approval</p>
                      {pendingTimeEntries.map((entry) => (
                        <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div>
                            <span className="font-medium">
                              {entry.employee?.firstName} {entry.employee?.lastName}
                            </span>{' '}
                            · {entry.job?.jobName || 'Job'} · {Number(entry.hours || 0).toFixed(1)}h
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Submitted</Badge>
                            <Button size="sm" onClick={() => handleApproveTimeEntry(entry.id)}>
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectTimeEntry(entry.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {approvalRequests.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Additional hours requests</p>
                      {approvalRequests.map((request) => (
                        <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div>
                            <span className="font-medium">
                              {request.employee?.firstName} {request.employee?.lastName}
                            </span>{' '}
                            · {request.job?.jobName || 'Job'} · {request.additionalHoursRequested}h
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">Pending</Badge>
                            <Button size="sm" onClick={() => handleApproveRequest(request.id)}>
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectRequest(request.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Approval Audit Trail</CardTitle>
                  <CardDescription>Recent approvals, rejections, and costing changes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {approvalAudit.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No approval actions recorded yet.
                    </div>
                  )}
                  {approvalAudit.map((log) => (
                    <div key={log.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">{log.action.replace(/_/g, ' ')}</p>
                      {log.metadata?.jobId && (
                        <p className="text-xs text-muted-foreground">
                          Job #{log.metadata.jobId}
                        </p>
                      )}
                      {log.metadata?.approvalNotes && (
                        <p className="text-xs text-muted-foreground">
                          Notes: {log.metadata.approvalNotes}
                        </p>
                      )}
                      {log.metadata?.approvedByProfileId && (
                        <p className="text-xs text-muted-foreground">
                          Approved by profile #{log.metadata.approvedByProfileId}
                        </p>
                      )}
                      {log.metadata?.totalEstimatedCost !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Estimated cost: KES {Number(log.metadata.totalEstimatedCost || 0).toFixed(0)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Recently'}
                      </p>
                    </div>
                  ))}
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
            {!teamData && (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle>No team data yet</CardTitle>
                  <CardDescription>
                    Assign team members to start tracking team performance.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
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

                {/* Allocation Health */}
                <Card>
                  <CardHeader>
                    <CardTitle>Allocation Health</CardTitle>
                    <CardDescription>Allocation usage across team jobs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const metrics = getAllocationMetrics();
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Team Jobs Tracked</p>
                            <p className="text-xl font-semibold">{metrics.totalJobs}</p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Over-allocated Jobs</p>
                            <p className={`text-xl font-semibold ${metrics.overAllocatedJobs > 0 ? 'text-red-600' : ''}`}>
                              {metrics.overAllocatedJobs}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Remaining Hours (Total)</p>
                            <p className="text-xl font-semibold">
                              {metrics.totalRemainingHours.toFixed(1)}h
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

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
            {!jobData && (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle>No managed jobs yet</CardTitle>
                  <CardDescription>
                    Jobs assigned to your team will appear here.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
            {jobData && (
              <Card>
                <CardHeader>
                  <CardTitle>Job Portfolio</CardTitle>
                  <CardDescription>Jobs you manage and their current status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-[200px_1fr] mb-4">
                    <div className="space-y-2">
                      <Label htmlFor="managerJobStatus">Status</Label>
                      <select
                        id="managerJobStatus"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={jobStatusFilter}
                        onChange={(event) => setJobStatusFilter(event.target.value)}
                      >
                        <option value="">All statuses</option>
                        <option value="planned">Planned</option>
                        <option value="in_progress">In progress</option>
                        <option value="on_hold">On hold</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="managerJobSearch">Search</Label>
                      <Input
                        id="managerJobSearch"
                        placeholder="Job, client, or status"
                        value={jobSearch}
                        onChange={(event) => setJobSearch(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pb-4">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={pendingOnly}
                        onChange={(event) => setPendingOnly(event.target.checked)}
                      />
                      Pending approvals only
                    </label>
                    {Object.keys(approvalCountsByJob).length > 0 && (
                      <Badge variant="outline">
                        Jobs with pending approvals: {Object.keys(approvalCountsByJob).length}
                      </Badge>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Remaining (Job)</TableHead>
                        <TableHead>Approvals</TableHead>
                        <TableHead>Costing</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            No jobs match the current filters.
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredJobs.map((job) => (
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
                          <TableCell>
                            {(() => {
                              const allocationSummary = allocationSummaries[job.jobId];
                              const fallbackRemaining = Math.max(
                                0,
                                Number(job.budgetHours) - Number(job.actualHours)
                              );
                              const remaining = allocationSummary
                                ? Number(allocationSummary.remainingJobHours)
                                : fallbackRemaining;
                              return (
                                <div className="flex flex-col gap-1">
                                  <span className={remaining <= 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                                    {remaining.toFixed(1)}h
                                  </span>
                                  {remaining <= 0 && <Badge variant="destructive">Over-allocated</Badge>}
                                  {remaining > 0 && remaining < 5 && <Badge variant="secondary">Low buffer</Badge>}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {approvalCountsByJob[job.jobId] ? (
                              <Badge variant="outline">
                                {approvalCountsByJob[job.jobId]} pending
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {getCostingBadge(job)}
                              {job.costingFee > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Fee: {formatCurrency(job.costingFee)}
                                </span>
                              )}
                            </div>
                          </TableCell>
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
