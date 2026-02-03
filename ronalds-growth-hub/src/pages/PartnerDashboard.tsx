import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI, apiFetch, surveysAPI, timeEntriesAPI } from '@/lib/api';
import type { TimeEntryApprovalRequest } from '@/lib/api/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
} from 'lucide-react';

interface PortfolioMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  totalFee: number;
  totalRevenueCollected: number;
  totalCost: number;
  totalProfit: number;
  averageEfficiency: number;
  averageMargin: number;
  totalTeamSize: number;
}

interface JobSummary {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  title: string;
  status: string;
  estimatedHours: number;
  actualHours: number;
  billableHours: number;
  feeAmount: number;
  amountCollected: number;
  costAmount: number;
  profit: number;
  efficiencyRatio: number;
  marginPercentage: number;
}

interface DashboardSummary {
  portfolio: PortfolioMetrics;
  clientFeedback?: {
    totalSurveys: number;
    completedSurveys: number;
    responseRate: number;
    avgOverallSatisfaction: number;
  };
  topJobs: JobSummary[];
  pendingTimeEntriesCount: number;
}

interface AllocationTotals {
  collectedAmount: number;
  allocatedAmount: number;
  totalProfit: number;
  totalLoss: number;
}

interface AllocationRow {
  id: number;
  jobId: number;
  jobName: string;
  jobCode: string | null;
  clientName: string;
  employeeName: string;
  allocatedAmount: number;
  allocationPercentage: number;
  allocationMonth: string;
  employeeProfit: number;
  employeeLoss: number;
  calculatedAt?: string;
}

interface JobBalanceRow {
  jobId: number;
  jobName: string;
  jobCode: string | null;
  clientName: string;
  collectedAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  totalProfit: number;
  totalLoss: number;
}

interface AllocationAuditPayload {
  totals: AllocationTotals;
  allocations: AllocationRow[];
  jobBalances: JobBalanceRow[];
}

interface PersonalPerformance {
  overallScore: number;
  revenue: number;
  netProfit: number;
  utilizationRate: number;
  lossAlert?: boolean;
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  actionRequired?: boolean;
  isRead?: boolean;
  link?: string | null;
  createdAt?: string;
}

interface PartnerApprovalRequest extends TimeEntryApprovalRequest {
  job?: {
    id?: number;
    jobName?: string;
    client?: { id?: number; clientName?: string };
  };
  employee?: {
    id?: number;
    firstName?: string;
    lastName?: string;
  };
}

interface PartnerSurveyRow {
  id: number;
  jobId?: number;
  jobName?: string;
  clientName?: string;
  overallSatisfaction?: number | null;
  completedAt?: string | null;
}

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [personalPerformance, setPersonalPerformance] = useState<PersonalPerformance | null>(null);
  const [allocationAudit, setAllocationAudit] = useState<AllocationAuditPayload | null>(null);
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [pendingAlertsCount, setPendingAlertsCount] = useState(0);
  const [approvalRequests, setApprovalRequests] = useState<PartnerApprovalRequest[]>([]);
  const [recentApprovals, setRecentApprovals] = useState<PartnerApprovalRequest[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [partnerSurveys, setPartnerSurveys] = useState<PartnerSurveyRow[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState('jobs');

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['jobs', 'allocations', 'approvals', 'details'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user from auth to get profile_id
      const user = await authAPI.me();
      if (!user) {
        navigate('/auth');
        return;
      }

      const isPartner = user.is_partner ?? user.isPartner;
      if (!isPartner) {
        navigate('/dashboard');
        return;
      }

      const response = await apiFetch('GET', '/partners/dashboard-summary');
      const data = response?.data ?? response;
      setSummary(data);

      await loadAlerts();
      await loadPersonalPerformance();
      await loadAllocationAudit();
      await loadApprovalRequests();
      await loadPartnerSurveys(data?.topJobs?.map((job: JobSummary) => job.jobId) ?? []);
    } catch (err: any) {
      if (err?.status === 401) {
        navigate('/auth');
        return;
      }
      if (err?.status === 404) {
        setSummary(null);
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Dashboard error:', err);
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
    } catch (err) {
      console.error('Failed to load partner alerts', err);
    }
  };

  const loadPersonalPerformance = async () => {
    try {
      const performanceResponse = await apiFetch('GET', '/performance-scores/me');
      const performancePayload = (performanceResponse as any)?.data ?? performanceResponse;

      if (performancePayload?.financial && performancePayload?.overall) {
        const financial = performancePayload.financial;
        const utilizationPercent = Math.round((financial.utilizationRate || 0) * 100);
        const lossAlert = Boolean(performancePayload?.scoreBreakdown?.lossAlert);

        setPersonalPerformance({
          overallScore: Math.round((performancePayload.overall.totalScore || 0) * 10) / 10,
          revenue: Number(financial.revenue || 0),
          netProfit: Number(financial.netProfit || 0),
          utilizationRate: utilizationPercent,
          lossAlert,
        });
      }
    } catch (err) {
      console.error('Error loading personal performance:', err);
    }
  };

  const loadAllocationAudit = async () => {
    try {
      const response = await apiFetch('GET', '/partners/allocations');
      const payload = response?.data ?? response ?? {};
      if (payload?.totals) {
        setAllocationAudit(payload);
      }
    } catch (err) {
      console.error('Error loading allocation audit:', err);
    }
  };

  const loadApprovalRequests = async () => {
    try {
      setApprovalsLoading(true);
      const [pending, recent] = await Promise.all([
        timeEntriesAPI.listApprovalRequests({ status: 'pending' }),
        timeEntriesAPI.listApprovalRequests({ status: 'approved' }),
      ]);
      setApprovalRequests(Array.isArray(pending) ? pending : []);
      setRecentApprovals(Array.isArray(recent) ? recent.slice(0, 5) : []);
    } catch (err) {
      console.error('Error loading approval requests:', err);
    } finally {
      setApprovalsLoading(false);
    }
  };

  const loadPartnerSurveys = async (jobIds: number[]) => {
    try {
      setSurveyLoading(true);
      const response = await surveysAPI.list({ completed: true, pageSize: 50 });
      const payload = (response as any)?.data ?? response;
      const surveys = Array.isArray(payload?.surveys) ? payload.surveys : payload?.items ?? [];
      const filtered = Array.isArray(surveys)
        ? surveys.filter((survey: any) => jobIds.includes(Number(survey.jobId)))
        : [];
      setPartnerSurveys(
        filtered.slice(0, 6).map((survey: any) => ({
          id: survey.id,
          jobId: survey.jobId,
          jobName: survey.job?.jobName,
          clientName: survey.client?.clientName,
          overallSatisfaction: survey.overallSatisfaction,
          completedAt: survey.completedAt,
        }))
      );
    } catch (err) {
      console.error('Error loading partner surveys:', err);
    } finally {
      setSurveyLoading(false);
    }
  };

  const handleApproveRequest = async (requestId: number) => {
    const approvalNotes = window.prompt('Approval notes (optional):') || undefined;
    await timeEntriesAPI.approveApprovalRequest(requestId, approvalNotes);
    await loadApprovalRequests();
  };

  const handleRejectRequest = async (requestId: number) => {
    const approvalNotes = window.prompt('Rejection reason (optional):') || undefined;
    await timeEntriesAPI.rejectApprovalRequest(requestId, approvalNotes);
    await loadApprovalRequests();
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);

  const formatMonth = (value?: string) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
  };

  const formatDate = (value?: string | null) => {
    if (!value) return 'â€”';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'â€”';
    return parsed.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Card className="w-full max-w-md border-destructive">
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <AlertCircle className="h-8 w-8 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-semibold mb-2">Error Loading Dashboard</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <Button
                    onClick={loadDashboardData}
                    className="mt-4"
                    size="sm"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const portfolio = summary?.portfolio;
  const topJobs = summary?.topJobs ?? [];
  const filteredTopJobs = topJobs.filter((job) => {
    if (statusFilter && job.status !== statusFilter) return false;
    if (jobSearch.trim()) {
      const query = jobSearch.toLowerCase();
      const haystack = [job.title, job.jobName, job.jobCode, job.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const lossJobsCount = topJobs.filter((job) => job.profit < 0).length;
  const atRiskJobsCount = topJobs.filter((job) => job.marginPercentage < 10).length;
  const totalLossExposure = allocationAudit?.totals?.totalLoss ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-8 p-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Partner Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your portfolio of jobs and track performance metrics
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={lossJobsCount > 0 ? "destructive" : "secondary"}>
              Loss jobs: {lossJobsCount}
            </Badge>
            <Badge variant={atRiskJobsCount > 0 ? "outline" : "secondary"}>
              At-risk jobs: {atRiskJobsCount}
            </Badge>
          </div>
        </div>

        {!summary && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No portfolio analytics yet</CardTitle>
              <CardDescription>
                Portfolio metrics will appear once jobs and collections are recorded.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Key Metrics Grid */}
        {personalPerformance && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
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
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{portfolio?.totalJobs || 0}</div>
              <p className="text-xs text-muted-foreground">
                {portfolio?.activeJobs || 0} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Fee</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(portfolio?.totalFee || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(portfolio?.totalRevenueCollected || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(portfolio?.totalCost || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(portfolio?.totalProfit || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Margin</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(portfolio?.averageMargin || 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Size</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {portfolio?.totalTeamSize || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {approvalRequests.length || pendingAlertsCount || summary?.pendingTimeEntriesCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">Awaiting action</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Loss Exposure</CardTitle>
                <CardDescription>
                  Aggregate loss across collected jobs.
                </CardDescription>
              </div>
              {totalLossExposure > 0 && <Badge variant="destructive">Action required</Badge>}
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(totalLossExposure)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Review allocations and job scopes.
                </p>
              </div>
              <Button variant="outline" onClick={() => setActiveTab('allocations')}>
                View allocation audit
              </Button>
            </CardContent>
          </Card>

          {summary?.clientFeedback && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Client Feedback Snapshot</CardTitle>
                  <CardDescription>Survey sentiment tied to your portfolio.</CardDescription>
                </div>
                <Badge variant="secondary">
                  {summary.clientFeedback.responseRate.toFixed(0)}% response
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Completed surveys</p>
                  <p className="text-2xl font-bold">
                    {summary.clientFeedback.completedSurveys}/{summary.clientFeedback.totalSurveys}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg satisfaction</p>
                  <p className="text-2xl font-bold">
                    {summary.clientFeedback.avgOverallSatisfaction.toFixed(1)} / 5
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Survey status</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.clientFeedback.totalSurveys === 0
                      ? 'No surveys routed yet.'
                      : 'Survey ratings feed into client health.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {summary?.clientFeedback && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Client Feedback Snapshot</CardTitle>
                <CardDescription>Survey sentiment tied to your portfolio.</CardDescription>
              </div>
              <Badge variant="secondary">
                {summary.clientFeedback.responseRate.toFixed(0)}% response
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Completed surveys</p>
                <p className="text-2xl font-bold">
                  {summary.clientFeedback.completedSurveys}/{summary.clientFeedback.totalSurveys}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg satisfaction</p>
                <p className="text-2xl font-bold">
                  {summary.clientFeedback.avgOverallSatisfaction.toFixed(1)} / 5
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Survey status</p>
                <p className="text-sm text-muted-foreground">
                  {summary.clientFeedback.totalSurveys === 0
                    ? 'No surveys routed yet.'
                    : 'Survey ratings feed into client health.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for different views */}
        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', value);
            return next;
          });
        }} className="space-y-4">
          <TabsList>
            <TabsTrigger value="jobs">Top Jobs</TabsTrigger>
            <TabsTrigger value="allocations">Allocations</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="details">Portfolio Details</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-4">
            {alerts.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Pending Alerts</CardTitle>
                    <CardDescription>Role-specific actions that need attention.</CardDescription>
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
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Client Feedback</CardTitle>
                  <CardDescription>
                    Latest completed surveys for your jobs.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => navigate('/client-surveys')} size="sm">
                  View all surveys
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {surveyLoading && (
                  <div className="text-sm text-muted-foreground">Loading surveys…</div>
                )}
                {!surveyLoading && partnerSurveys.length === 0 && (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No completed surveys for your portfolio yet.
                  </div>
                )}
                {partnerSurveys.map((survey) => (
                  <div key={survey.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <p className="font-medium">{survey.jobName || 'Job'}</p>
                      <p className="text-xs text-muted-foreground">
                        {survey.clientName || 'Client'} · {formatDate(survey.completedAt)}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {survey.overallSatisfaction ?? 0} / 5
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Performing Jobs</CardTitle>
                <CardDescription>
                  Financial performance and metrics for your top jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary?.topJobs && summary.topJobs.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-[200px_1fr]">
                      <div className="space-y-2">
                        <Label htmlFor="partnerJobStatus">Status</Label>
                        <select
                          id="partnerJobStatus"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={statusFilter}
                          onChange={(event) => setStatusFilter(event.target.value)}
                        >
                          <option value="">All statuses</option>
                          <option value="planned">Planned</option>
                          <option value="in_progress">In progress</option>
                          <option value="on_hold">On hold</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="partnerJobSearch">Search</Label>
                        <Input
                          id="partnerJobSearch"
                          placeholder="Search job or status"
                          value={jobSearch}
                          onChange={(event) => setJobSearch(event.target.value)}
                        />
                      </div>
                    </div>
                    {filteredTopJobs.length === 0 && (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No jobs match the current filters.
                      </div>
                    )}
                    {filteredTopJobs.map((job) => (
                      <div
                        key={job.jobId}
                        className="flex items-center justify-between border-b pb-4 last:border-0"
                      >
                        <div className="space-y-1 flex-1">
                          <p className="font-semibold">{job.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {job.jobCode || `Job #${job.jobId}`}
                          </p>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Efficiency</p>
                            <p className="font-medium">
                              {job.efficiencyRatio.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Margin</p>
                            <p className="font-medium">
                              {job.marginPercentage.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Fee</p>
                            <p className="font-medium">
                              {formatCurrency(job.feeAmount || 0)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Collected</p>
                            <p className="font-medium">
                              {formatCurrency(job.amountCollected)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Cost</p>
                            <p className="font-medium">
                              {formatCurrency(job.costAmount || 0)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground text-xs">Profit/Loss</p>
                            <p className={`font-medium ${job.profit < 0 ? 'text-destructive' : ''}`}>
                              {formatCurrency(job.profit)}
                            </p>
                          </div>
                          <Badge
                            variant={
                              job.status === 'completed' ? 'default' : 'secondary'
                            }
                          >
                            {job.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">No jobs yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Portfolio Summary</CardTitle>
                <CardDescription>
                  Detailed breakdown of your portfolio performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Completed Jobs</p>
                    <p className="text-2xl font-bold">
                      {portfolio?.completedJobs || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Jobs</p>
                    <p className="text-2xl font-bold">
                      {portfolio?.activeJobs || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Fee</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(portfolio?.totalFee || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Collected</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(portfolio?.totalRevenueCollected || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Cost</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(portfolio?.totalCost || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Profit</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(portfolio?.totalProfit || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Efficiency</p>
                    <p className="text-2xl font-bold">
                      {(portfolio?.averageEfficiency || 0).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Margin</p>
                    <p className="text-2xl font-bold">
                      {(portfolio?.averageMargin || 0).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Loss Jobs</p>
                    <p className="text-2xl font-bold">{lossJobsCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">At-Risk Jobs</p>
                    <p className="text-2xl font-bold">{atRiskJobsCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Approval Queue</CardTitle>
                  <CardDescription>
                    Additional hours requests awaiting partner approval.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={loadApprovalRequests} size="sm">
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {approvalsLoading && (
                  <div className="text-sm text-muted-foreground">Loading approvals…</div>
                )}
                {!approvalsLoading && approvalRequests.length === 0 && (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No pending approval requests.
                  </div>
                )}
                {approvalRequests.map((request) => (
                  <div key={request.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold">{request.job?.jobName ?? 'Job'}</p>
                        <p className="text-xs text-muted-foreground">
                          {request.employee
                            ? `${request.employee.firstName} ${request.employee.lastName}`
                            : 'Team member'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Requested {request.additionalHoursRequested} hrs · Logged {request.currentLoggedHours} hrs
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
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
                    <p className="text-sm text-muted-foreground mt-2">
                      Justification: {request.justification || '—'}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Approvals</CardTitle>
                <CardDescription>Audit trail of partner decisions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentApprovals.length === 0 && (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No approvals recorded yet.
                  </div>
                )}
                {recentApprovals.map((request) => (
                  <div key={request.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{request.job?.jobName ?? 'Job'}</p>
                        <p className="text-xs text-muted-foreground">
                          {request.employee
                            ? `${request.employee.firstName} ${request.employee.lastName}`
                            : 'Team member'} · {formatDate(request.approvedAt)}
                        </p>
                      </div>
                      <Badge variant="secondary">{request.status}</Badge>
                    </div>
                    {request.approvalNotes && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Notes: {request.approvalNotes}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="allocations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Allocation Audit</CardTitle>
                <CardDescription>
                  Cash collections distributed to your team, with profit/loss impact.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!allocationAudit && (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Allocation metrics will appear once collections are recorded.
                  </div>
                )}

                {allocationAudit && (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Collected</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {formatCurrency(allocationAudit.totals.collectedAmount)}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Allocated</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {formatCurrency(allocationAudit.totals.allocatedAmount)}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Profit Share</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {formatCurrency(allocationAudit.totals.totalProfit)}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Loss Share</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-destructive">
                            {formatCurrency(allocationAudit.totals.totalLoss)}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="rounded-md border">
                      <div className="border-b px-4 py-3">
                        <p className="font-semibold">Job balances</p>
                        <p className="text-xs text-muted-foreground">
                          Collected vs allocated cash by job.
                        </p>
                      </div>
                      <div className="divide-y">
                        {allocationAudit.jobBalances.length === 0 && (
                          <div className="px-4 py-6 text-sm text-muted-foreground">
                            No collections recorded for these jobs yet.
                          </div>
                        )}
                        {allocationAudit.jobBalances.map((job) => (
                          <div key={job.jobId} className="px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <p className="font-medium">{job.jobName}</p>
                              <p className="text-xs text-muted-foreground">
                                {job.jobCode || `Job #${job.jobId}`} · {job.clientName || 'Client'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Collected</p>
                                <p className="font-semibold">{formatCurrency(job.collectedAmount)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Allocated</p>
                                <p className="font-semibold">{formatCurrency(job.allocatedAmount)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Unallocated</p>
                                <p className="font-semibold">
                                  {formatCurrency(job.unallocatedAmount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Net</p>
                                <p className={`font-semibold ${job.totalLoss > 0 ? 'text-destructive' : ''}`}>
                                  {formatCurrency(job.totalProfit - job.totalLoss)}
                                </p>
                              </div>
                              {job.totalLoss > 0 && (
                                <Badge variant="destructive">Loss detected</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border">
                      <div className="border-b px-4 py-3">
                        <p className="font-semibold">Recent allocations</p>
                        <p className="text-xs text-muted-foreground">
                          Who received what, and when.
                        </p>
                      </div>
                      <div className="divide-y">
                        {allocationAudit.allocations.length === 0 && (
                          <div className="px-4 py-6 text-sm text-muted-foreground">
                            No allocations recorded yet.
                          </div>
                        )}
                        {allocationAudit.allocations.map((allocation) => (
                          <div key={allocation.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <p className="font-medium">{allocation.employeeName}</p>
                              <p className="text-xs text-muted-foreground">
                                {allocation.jobName} · {allocation.clientName}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Month</p>
                                <p className="font-semibold">{formatMonth(allocation.allocationMonth)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Allocated</p>
                                <p className="font-semibold">{formatCurrency(allocation.allocatedAmount)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Profit/Loss</p>
                                <p className={`font-semibold ${allocation.employeeLoss > 0 ? 'text-destructive' : ''}`}>
                                  {formatCurrency(allocation.employeeProfit - allocation.employeeLoss)}
                                </p>
                              </div>
                              {allocation.employeeLoss > 0 && (
                                <Badge variant="destructive">Loss</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PartnerDashboard;
