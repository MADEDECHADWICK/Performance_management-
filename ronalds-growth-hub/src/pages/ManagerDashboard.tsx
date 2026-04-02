import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import JobOperationsOverview from '@/components/jobs/JobOperationsOverview';
import PageLoader from '@/components/ui/page-loader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AnalyticsChartShell,
  AnalyticsLegendContent,
  AnalyticsTooltipContent,
  analyticsAxisProps,
  analyticsColorAt,
  analyticsDonutProps,
  analyticsGridProps,
} from '@/components/ui/analytics-chart';
import { apiFetch, timeEntriesAPI } from '@/lib/api';
import {
  BarChart as RechartsBarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
  trackingPath?: string | null;
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
  plannedCost: number;
  plannedHours: number;
  actualCost: number;
  costVariance: number;
  hoursVariance: number;
  costVariancePct: number;
  hoursVariancePct: number;
  feeCap: number;
  remainingFeeBuffer: number;
  isOverPlannedCost: boolean;
  isOverPlannedHours: boolean;
  isOverFeeCap: boolean;
  pendingApprovalTotal: number;
  approvalChain: {
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
    overBudgetPending: number;
    awaitingPartner: number;
    partnerApproved: number;
    partnerRejected: number;
    latestStatus: string | null;
    latestRequestedAt: string | null;
    latestApprovedAt: string | null;
    latestApproverName: string | null;
    latestRequestType: string | null;
  };
}

interface JobControlsSummary {
  totalJobs: number;
  totalPlannedCost: number;
  totalActualCost: number;
  totalPlannedHours: number;
  totalActualHours: number;
  totalPendingApprovals: number;
  jobsOverPlannedCost: number;
  jobsOverPlannedHours: number;
  jobsOverFeeCap: number;
  jobsAwaitingPartner: number;
  totalCostVariance: number;
  totalHoursVariance: number;
  totalCostVariancePct: number;
  totalHoursVariancePct: number;
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
  trackingPath?: string | null;
  status: string;
  additionalHoursRequested: number;
  requestedAt?: string;
  requiresPartnerApproval?: boolean;
  managerApproved?: boolean;
  pendingPartnerApproval?: boolean;
  job?: { id: number; jobName: string; client?: { clientName?: string } };
  employee?: { firstName: string; lastName: string };
}

interface OverBudgetApprovalRequest {
  id: number;
  jobId: number;
  trackingPath?: string | null;
  jobName: string;
  status: string;
  requestedAdditional: number;
  loggedHours: number;
  allocatedHours: number;
  totalAfterRequest: number;
  estimatedCostImpact: number;
  approvalNotes?: string | null;
  rejectionReason?: string | null;
  employeeName?: string;
  createdAt?: string;
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
  totalTeamMembers?: number;
  avgUtilization?: number;
  overloadedEmployees?: number;
  underutilizedEmployees?: number;
  criticalDeadlines?: number;
  capacityVariance?: number;
  burnoutRisk?: number;
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
    controls?: JobControlsSummary;
  } | null>(null);
  const [allocationSummaries, setAllocationSummaries] = useState<Record<number, AllocationSummary>>({});
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [pendingAlertsCount, setPendingAlertsCount] = useState(0);
  const [pendingTimeEntries, setPendingTimeEntries] = useState<PendingTimeEntry[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [overBudgetRequests, setOverBudgetRequests] = useState<OverBudgetApprovalRequest[]>([]);
  const [approvalAudit, setApprovalAudit] = useState<ApprovalAuditLog[]>([]);
  const [workloadMetrics, setWorkloadMetrics] = useState<WorkloadMetrics | null>(null);
  const [financialData, setFinancialData] = useState<any>(null);
  const [evaluationData, setEvaluationData] = useState<any>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState('');

  const toNumber = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const safeWorkloadMetrics = {
    total_team_members: toNumber(
      workloadMetrics?.totalTeamMembers ?? workloadMetrics?.total_team_members
    ),
    avg_utilization: toNumber(
      workloadMetrics?.avgUtilization ?? workloadMetrics?.avg_utilization
    ),
    overloaded_employees: toNumber(
      workloadMetrics?.overloadedEmployees ?? workloadMetrics?.overloaded_employees
    ),
    underutilized_employees: toNumber(
      workloadMetrics?.underutilizedEmployees ?? workloadMetrics?.underutilized_employees
    ),
    critical_deadlines: toNumber(
      workloadMetrics?.criticalDeadlines ?? workloadMetrics?.critical_deadlines
    ),
    burnout_risk: toNumber(
      workloadMetrics?.burnoutRisk ?? workloadMetrics?.burnout_risk
    ),
  };
  const [pendingOnly, setPendingOnly] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load overview data first
      const overviewResponse = await apiFetch('GET', '/manager-dashboard/overview');
      setOverview(overviewResponse);
      const workloadResponse = await apiFetch('GET', '/team-management/workload-metrics');
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
      const payload: any = response ?? {};
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.items)
            ? payload.items
            : [];
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
      const [pendingEntries, requests, chainResponse] = await Promise.all([
        timeEntriesAPI.getPendingApprovals(),
        timeEntriesAPI.listApprovalRequests({ status: 'pending' }),
        apiFetch('GET', '/manager-dashboard/approval-chain'),
      ]);
      const chainPayload = chainResponse?.data ?? chainResponse ?? {};
      const overBudget = Array.isArray(chainPayload.overBudgetRequests)
        ? chainPayload.overBudgetRequests
        : [];
      const managerStageRequests = Array.isArray(requests)
        ? requests.filter((request: ApprovalRequest) => {
            if (!request.requiresPartnerApproval) return true;
            return !request.pendingPartnerApproval && !request.managerApproved;
          })
        : [];
      setPendingTimeEntries(Array.isArray(pendingEntries) ? pendingEntries.slice(0, 5) : []);
      setApprovalRequests(managerStageRequests.slice(0, 5));
      setOverBudgetRequests(overBudget.slice(0, 5));
    } catch (error) {
      console.error('Error loading approvals:', error);
      setOverBudgetRequests([]);
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
    const notes = window.prompt('Approval reason (required):');
    if (!notes || !notes.trim()) return;
    await timeEntriesAPI.approveApprovalRequest(id, notes.trim());
    await loadApprovals();
    await loadApprovalAudit();
  };

  const handleRejectRequest = async (id: number) => {
    const notes = window.prompt('Rejection reason (required):');
    if (!notes || !notes.trim()) return;
    await timeEntriesAPI.rejectApprovalRequest(id, notes.trim());
    await loadApprovals();
    await loadApprovalAudit();
  };

  const handleApproveOverBudgetRequest = async (id: number) => {
    const notes = window.prompt('Manager approval notes (optional):') || undefined;
    await timeEntriesAPI.approveOverBudgetRequest(id, notes);
    await loadApprovals();
    await loadApprovalAudit();
    if (activeTab === 'jobs') {
      await loadTabData('jobs');
    }
  };

  const handleRejectOverBudgetRequest = async (id: number) => {
    const notes = window.prompt('Manager rejection reason (optional):') || undefined;
    await timeEntriesAPI.rejectOverBudgetRequest(id, notes);
    await loadApprovals();
    await loadApprovalAudit();
    if (activeTab === 'jobs') {
      await loadTabData('jobs');
    }
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
  overBudgetRequests.forEach((req) => {
    approvalCountsByJob[req.jobId] = (approvalCountsByJob[req.jobId] || 0) + 1;
  });

  (jobData?.portfolio || []).forEach((job) => {
    const jobPending = Number(job.pendingApprovalTotal || 0);
    if (jobPending > 0) {
      approvalCountsByJob[job.jobId] = Math.max(approvalCountsByJob[job.jobId] || 0, jobPending);
    }
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

  const resolveTrackingPath = (jobId: number, trackingPath?: string | null) =>
    trackingPath || `/jobs/${jobId}/tracking`;

  const resolveAlertLink = (alert: NotificationItem) => {
    const rawLink = alert.link?.trim();
    if (!rawLink) return null;
    const context = `${alert.title} ${alert.message}`.toLowerCase();

    if (rawLink.startsWith('http://') || rawLink.startsWith('https://')) {
      return rawLink;
    }

    if (rawLink.startsWith('/workload-management')) {
      const isApprovalAlert =
        context.includes('additional hours') ||
        context.includes('over-budget') ||
        context.includes('approval');
      if (isApprovalAlert) {
        const query = rawLink.includes('?') ? rawLink.split('?')[1] : '';
        const params = new URLSearchParams(query || '');
        const mapped = new URLSearchParams();
        mapped.set('tab', 'approvals');
        const jobId = Number(params.get('jobId'));
        if (Number.isFinite(jobId) && jobId > 0) {
          mapped.set('jobId', String(jobId));
        }
        const approvalRequestId = Number(
          params.get('approvalRequestId') || params.get('requestId')
        );
        if (Number.isFinite(approvalRequestId) && approvalRequestId > 0) {
          mapped.set('approvalRequestId', String(approvalRequestId));
        }
        return `/timesheets?${mapped.toString()}`;
      }
    }

    const jobMatch = rawLink.match(/^\/jobs\/(\d+)(?:\/.*)?$/);
    if (jobMatch) {
      return `/jobs/${Number(jobMatch[1])}/tracking`;
    }

      if (rawLink === '/onboarding') {
        return '/profile?tab=onboarding';
      }

    if (rawLink.startsWith('/hr-queue')) {
      return rawLink.replace('/hr-queue', '/client-onboarding-queue');
    }

    if (rawLink === '/profile') {
      if (context.includes('onboarding') || context.includes('checklist')) {
        return '/profile?tab=onboarding';
      }
    }

      return rawLink;
  };

  const openAlert = (alert: NotificationItem) => {
    const target = resolveAlertLink(alert);
    if (!target) return;
    if (target.startsWith('http://') || target.startsWith('https://')) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(target);
  };

  const financialPayload = financialData?.data ?? financialData ?? {};
  const financialSummary = financialPayload?.summary ?? financialPayload ?? {};
  const financialControls =
    financialPayload?.controls ??
    financialPayload?.jobControls ??
    jobData?.controls ??
    {};

  const monthlyRevenue = toNumber(
    financialSummary.monthlyRevenue ??
      financialSummary.revenueMonth ??
      overview?.monthlyRevenue
  );
  const monthlyProfit = toNumber(
    financialSummary.monthlyProfit ??
      financialSummary.profitMonth ??
      overview?.monthlyProfit
  );
  const monthlyCost = Math.max(
    0,
    toNumber(
      financialSummary.monthlyCost ??
        financialSummary.costMonth ??
        (teamData?.financials?.totalCost ?? monthlyRevenue - monthlyProfit)
    )
  );

  const utilizationRate = Math.min(
    100,
    Math.max(
      0,
      toNumber(
        overview?.utilizationRate ??
          financialSummary.utilizationRate ??
          safeWorkloadMetrics.avg_utilization
      )
    )
  );

  const financialMixData = [
    { name: 'Profit', value: Math.max(0, monthlyProfit) },
    { name: 'Cost', value: Math.max(0, monthlyCost) },
  ];

  const utilizationMixData = [
    { name: 'Utilized', value: utilizationRate },
    { name: 'Available', value: Math.max(0, 100 - utilizationRate) },
  ];

  const approvalMixData = [
    { name: 'Pending approvals', value: toNumber(pendingAlertsCount) },
    { name: 'Pending reviews', value: toNumber(overview?.pendingReviews) },
    { name: 'Over-budget queue', value: toNumber(overBudgetRequests.length) },
  ];

  const riskBreakdownData = [
    { label: 'Over cost', value: toNumber(financialControls.jobsOverPlannedCost) },
    { label: 'Over hours', value: toNumber(financialControls.jobsOverPlannedHours) },
    { label: 'Fee cap', value: toNumber(financialControls.jobsOverFeeCap) },
    { label: 'Awaiting partner', value: toNumber(financialControls.jobsAwaitingPartner) },
  ];

  const chartPalette = ['#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#6366f1'];
  const hasFinancialMixData = financialMixData.some((item) => item.value > 0);
  const hasApprovalMixData = approvalMixData.some((item) => item.value > 0);
  const hasRiskData = riskBreakdownData.some((item) => item.value > 0);

  const recentActivity = [
    ...alerts.map((alert) => ({
      id: `alert-${alert.id}`,
      title: alert.title || 'Notification',
      detail: alert.message || 'Action required',
      createdAt: alert.createdAt,
      tone: 'bg-blue-500',
      open: () => openAlert(alert),
    })),
    ...approvalAudit.map((log) => ({
      id: `audit-${log.id}`,
      title: String(log.action || 'approval update').replace(/_/g, ' '),
      detail: log.metadata?.jobId
        ? `Job #${log.metadata.jobId}`
        : 'Workflow approval update',
      createdAt: log.createdAt,
      tone: String(log.action || '').includes('rejected') ? 'bg-orange-500' : 'bg-green-500',
      open: log.metadata?.jobId
        ? () => navigate(resolveTrackingPath(Number(log.metadata.jobId)))
        : undefined,
    })),
  ]
    .sort((a, b) => {
      const aTs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTs - aTs;
    })
    .slice(0, 6);

  const managerJobMetrics = [
    {
      label: 'Managed jobs',
      value: String(overview?.activeJobs || 0),
      hint: `${toNumber(financialControls.jobsAwaitingPartner)} awaiting partner review`,
      icon: Briefcase,
      tone: 'primary' as const,
      graphValue: overview?.activeJobs || 0,
      graphBaseline: toNumber(financialControls.jobsAwaitingPartner),
    },
    {
      label: 'Monthly revenue',
      value: formatCurrency(monthlyRevenue),
      hint: `Monthly profit ${formatCurrency(monthlyProfit)}`,
      icon: DollarSign,
      tone: 'positive' as const,
      graphValue: monthlyRevenue,
      graphBaseline: monthlyProfit,
    },
    {
      label: 'Team utilization',
      value: `${utilizationRate.toFixed(0)}%`,
      hint: `${overview?.teamSize || 0} direct reports in view`,
      icon: Users,
      tone: 'warning' as const,
      graphValue: utilizationRate,
      graphBaseline: 75,
    },
    {
      label: 'Approval pressure',
      value: String(pendingAlertsCount + overBudgetRequests.length),
      hint: `${toNumber(overview?.pendingReviews)} pending reviews`,
      icon: AlertCircle,
      tone: 'danger' as const,
      graphValue: pendingAlertsCount + overBudgetRequests.length,
      graphBaseline: 0,
      inverse: true,
    },
  ];

  if (loading && !overview) {
    return (
      <DashboardLayout>
        <PageLoader message="Loading..." />
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

        <JobOperationsOverview
          title="Manager job command"
          description="Keep the team, revenue, execution pressure, and approval load in one cleaner operational view before diving into the detailed tabs."
          metrics={managerJobMetrics}
          showLocator={false}
        />

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
                  KES {toNumber(personalPerformance.revenue).toFixed(0)}
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
                  KES {toNumber(personalPerformance.netProfit).toFixed(0)}
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
                <CardTitle className="text-sm font-medium">Learning & Feedback</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {personalPerformance.overallScore}%
                </div>
                <p className="text-xs text-muted-foreground">Current personal performance score</p>
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
                <p className="text-xl font-semibold">{safeWorkloadMetrics.total_team_members}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg utilization</p>
                <p className="text-xl font-semibold">
                  {Math.round(safeWorkloadMetrics.avg_utilization)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overloaded</p>
                <p className="text-xl font-semibold text-destructive">
                  {safeWorkloadMetrics.overloaded_employees}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Underutilized</p>
                <p className="text-xl font-semibold">
                  {safeWorkloadMetrics.underutilized_employees}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Critical deadlines</p>
                <p className="text-xl font-semibold">{safeWorkloadMetrics.critical_deadlines}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Burnout risk</p>
                <p className="text-xl font-semibold">
                  {Math.round(safeWorkloadMetrics.burnout_risk)}%
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
                        {resolveAlertLink(alert) && (
                          <Button
                            className="mt-2"
                            size="sm"
                            variant="outline"
                            onClick={() => openAlert(alert)}
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
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => navigate('/team-performance')}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Review Team Performance
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => navigate('/timesheets')}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Timesheets
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => navigate('/evaluations')}
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Complete Pending Evaluations
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => navigate('/jobs')}
                  >
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
                    <Badge variant="secondary">
                      {overBudgetRequests.length} over-budget
                    </Badge>
                    <Badge variant="outline">
                      {pendingTimeEntries.length + approvalRequests.length + overBudgetRequests.length} total in chain
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => navigate('/timesheets')}>
                      Review queue
                    </Button>
                  </div>
                  {pendingTimeEntries.length === 0 &&
                    approvalRequests.length === 0 &&
                    overBudgetRequests.length === 0 && (
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
                            - {entry.job?.jobName || 'Job'} - {Number(entry.hours || 0).toFixed(1)}h
                          </div>
                          <div className="flex items-center gap-2">
                            {entry.job?.id ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(resolveTrackingPath(entry.job!.id))}
                              >
                                Open tracking
                              </Button>
                            ) : null}
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
                            - {request.job?.jobName || 'Job'} - {request.additionalHoursRequested}h
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                navigate(resolveTrackingPath(request.jobId, request.trackingPath))
                              }
                            >
                              Open tracking
                            </Button>
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
                  {overBudgetRequests.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Over-budget approval chain</p>
                      {overBudgetRequests.map((request) => (
                        <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div>
                            <span className="font-medium">{request.employeeName || 'Team member'}</span>{' '}
                            - {request.jobName || 'Job'} - +{Number(request.requestedAdditional || 0).toFixed(1)}h
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                navigate(resolveTrackingPath(request.jobId, request.trackingPath))
                              }
                            >
                              Open tracking
                            </Button>
                            <Badge variant={request.status === 'pending' ? 'secondary' : 'outline'}>
                              {String(request.status).replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Impact: {formatCurrency(Number(request.estimatedCostImpact || 0))}
                            </span>
                            {request.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveOverBudgetRequest(request.id)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRejectOverBudgetRequest(request.id)}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
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
                  <CardDescription>Live updates from notifications and approval audit logs.</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No recent activity returned by notifications/audit endpoints.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recentActivity.map((item) => (
                        <div key={item.id} className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${item.tone}`}></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.detail}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently'}
                            </p>
                          </div>
                          {item.open && (
                            <Button size="sm" variant="ghost" onClick={item.open}>
                              Open
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
                  {jobData.controls && (
                    <div className="grid gap-3 md:grid-cols-4 pb-4">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Cost Variance</p>
                        <p
                          className={`text-sm font-semibold ${
                            jobData.controls.totalCostVariance > 0 ? 'text-destructive' : 'text-foreground'
                          }`}
                        >
                          {formatCurrency(jobData.controls.totalCostVariance)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {jobData.controls.totalCostVariancePct.toFixed(1)}%
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Hours Variance</p>
                        <p
                          className={`text-sm font-semibold ${
                            jobData.controls.totalHoursVariance > 0 ? 'text-destructive' : 'text-foreground'
                          }`}
                        >
                          {jobData.controls.totalHoursVariance.toFixed(1)}h
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {jobData.controls.totalHoursVariancePct.toFixed(1)}%
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Overrun Jobs</p>
                        <p className="text-sm font-semibold">
                          {jobData.controls.jobsOverPlannedCost} cost / {jobData.controls.jobsOverPlannedHours} hours
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Fee cap breaches: {jobData.controls.jobsOverFeeCap}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Approval Chain</p>
                        <p className="text-sm font-semibold">
                          Pending: {jobData.controls.totalPendingApprovals}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Awaiting partner: {jobData.controls.jobsAwaitingPartner}
                        </p>
                      </div>
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Remaining (Job)</TableHead>
                        <TableHead>Cost Control</TableHead>
                        <TableHead>Approval Chain</TableHead>
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
                              <Link
                                to={resolveTrackingPath(job.jobId, job.trackingPath)}
                                className="font-medium text-primary hover:underline"
                              >
                                {job.title}
                              </Link>
                              <div className="text-sm text-muted-foreground">{job.jobNumber}</div>
                              <div className="text-xs text-muted-foreground">
                                {resolveTrackingPath(job.jobId, job.trackingPath)}
                              </div>
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
                            <div className="flex flex-col gap-1 text-xs">
                              <span
                                className={`font-medium ${
                                  job.isOverPlannedCost || job.isOverPlannedHours ? 'text-destructive' : 'text-foreground'
                                }`}
                              >
                                {formatCurrency(job.actualCost)} / {formatCurrency(job.plannedCost)}
                              </span>
                              <span className={job.costVariance > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                                Var: {formatCurrency(job.costVariance)}
                              </span>
                              <span className="text-muted-foreground">
                                Fee buffer: {formatCurrency(job.remainingFeeBuffer)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-xs">
                              {approvalCountsByJob[job.jobId] ? (
                                <Badge variant="outline">
                                  {approvalCountsByJob[job.jobId]} pending
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">None pending</span>
                              )}
                              {(job.approvalChain?.awaitingPartner || 0) > 0 && (
                                <Badge variant="secondary">
                                  Awaiting partner: {job.approvalChain.awaitingPartner}
                                </Badge>
                              )}
                              {job.approvalChain?.latestStatus && (
                                <span className="text-muted-foreground capitalize">
                                  Latest: {String(job.approvalChain.latestStatus).replace(/_/g, ' ')}
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(monthlyRevenue)}</div>
                  <p className="text-xs text-muted-foreground">Revenue this month</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(monthlyCost)}</div>
                  <p className="text-xs text-muted-foreground">Direct delivery cost</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Profit</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(monthlyProfit)}</div>
                  <p className="text-xs text-muted-foreground">Revenue minus cost</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Utilization Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{utilizationRate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">Team billable utilization</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-primary" />
                    Financial Mix
                  </CardTitle>
                  <CardDescription>Profit vs cost composition.</CardDescription>
                </CardHeader>
                <CardContent className="h-[250px]">
                  {hasFinancialMixData ? (
                    <AnalyticsChartShell>
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={financialMixData}
                            dataKey="value"
                            nameKey="name"
                            {...analyticsDonutProps}
                          >
                            {financialMixData.map((entry, index) => (
                              <Cell key={`financial-mix-${entry.name}`} fill={analyticsColorAt(index)} />
                            ))}
                          </Pie>
                          <Legend content={<AnalyticsLegendContent />} />
                          <RechartsTooltip
                            content={
                              <AnalyticsTooltipContent
                                valueFormatter={(value) => formatCurrency(Number(value || 0))}
                              />
                            }
                          />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </AnalyticsChartShell>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No financial mix data yet.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-primary" />
                    Utilization Mix
                  </CardTitle>
                  <CardDescription>Used capacity vs available capacity.</CardDescription>
                </CardHeader>
                <CardContent className="h-[250px]">
                  <AnalyticsChartShell>
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={utilizationMixData}
                          dataKey="value"
                          nameKey="name"
                          {...analyticsDonutProps}
                        >
                          <Cell fill="#22c55e" />
                          <Cell fill="#cbd5e1" />
                        </Pie>
                        <Legend content={<AnalyticsLegendContent />} />
                        <RechartsTooltip
                          content={
                            <AnalyticsTooltipContent
                              valueFormatter={(value) => `${Number(value || 0).toFixed(1)}%`}
                            />
                          }
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </AnalyticsChartShell>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-primary" />
                    Approval Pressure
                  </CardTitle>
                  <CardDescription>Current queue pressure by type.</CardDescription>
                </CardHeader>
                <CardContent className="h-[250px]">
                  {hasApprovalMixData ? (
                    <AnalyticsChartShell>
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={approvalMixData}
                            dataKey="value"
                            nameKey="name"
                            {...analyticsDonutProps}
                          >
                            {approvalMixData.map((entry, index) => (
                              <Cell key={`approval-mix-${entry.name}`} fill={analyticsColorAt(index + 1)} />
                            ))}
                          </Pie>
                          <Legend content={<AnalyticsLegendContent />} />
                          <RechartsTooltip
                            content={
                              <AnalyticsTooltipContent
                                valueFormatter={(value) => Number(value || 0).toFixed(0)}
                              />
                            }
                          />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </AnalyticsChartShell>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No approval pressure data yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Risk Breakdown
                </CardTitle>
                <CardDescription>Jobs at risk by control category.</CardDescription>
              </CardHeader>
                <CardContent className="h-[280px]">
                  {hasRiskData ? (
                    <AnalyticsChartShell>
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart data={riskBreakdownData}>
                          <CartesianGrid {...analyticsGridProps} />
                          <XAxis dataKey="label" {...analyticsAxisProps} />
                          <YAxis allowDecimals={false} {...analyticsAxisProps} />
                          <RechartsTooltip
                            content={
                              <AnalyticsTooltipContent
                                valueFormatter={(value) => Number(value || 0).toFixed(0)}
                              />
                            }
                          />
                          <Bar dataKey="value" radius={[10, 10, 4, 4]}>
                            {riskBreakdownData.map((entry, index) => (
                              <Cell key={`risk-${entry.label}`} fill={analyticsColorAt(index + 2)} />
                            ))}
                          </Bar>
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </AnalyticsChartShell>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No risk data available yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ManagerDashboard;
