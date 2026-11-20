/**
 * Timesheets Page - Time Entry Management
 * Features:
 * - Timer feature for real-time tracking
 * - Job/Task selection with budget visibility
 * - Billable vs Non-billable tracking
 * - Budget cap enforcement (auto switches to non-billable when exceeded)
 * - Request additional time feature
 * - Approval workflow
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntriesAPI, jobsAPI } from '@/lib/api';
import type {
  NonBillableActivity,
  UtilizationPeriod,
  UtilizationSummary,
} from '@/lib/api/timeEntries';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, startOfWeek, endOfWeek, addDays, differenceInSeconds } from 'date-fns';
import {
  Clock,
  Play,
  Pause,
  Square,
  Plus,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Briefcase,
  Calendar,
  Timer,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Target,
  ClipboardList,
} from 'lucide-react';

interface Job {
  id: number;
  jobName: string;
  jobCode?: string;
  client?: { clientName: string };
  budgetHours: number;
  status: string;
  costingCompleted?: boolean;
  jobCosting?: { id: number } | null;
  tasks?: Task[];
}

interface Task {
  id: number;
  title: string;
  estimatedHours?: number;
  status: string;
}

interface TimeEntry {
  id: number;
  jobId: number;
  taskId?: number;
  date: string;
  hours: number;
  description: string;
  billable: boolean;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  job?: Job;
  proposal?: {
    id: number;
    proposalTitle: string;
    clientName?: string | null;
  } | null;
  task?: Task;
  startTime?: string;
  endTime?: string;
  sourceType?: 'manual' | 'leave_request';
  nonBillableCategory?: string | null;
  nonBillableActivityId?: number | null;
  nonBillableActivity?: {
    id: number;
    code: string;
    name: string;
    categoryGroup: string;
    isProductive: boolean;
  } | null;
  leaveRequestId?: number | null;
  leaveStatus?: string | null;
  isProjectedLeave?: boolean;
  leaveType?: { id: number; name: string } | null;
}

interface TimerState {
  isRunning: boolean;
  jobId: number | null;
  taskId: number | null;
  startTime: Date | null;
  description: string;
  elapsedSeconds: number;
}

interface JobBudgetInfo {
  jobId: number;
  allocatedHours: number;
  usedHours: number;
  remainingHours: number;
  isBillableAvailable: boolean;
  billableAllocatedHours: number;
  nonBillableAllocatedHours: number;
  billableUsedHours: number;
  nonBillableUsedHours: number;
  billableRemainingHours: number;
  nonBillableRemainingHours: number;
}

interface WeeklyEntryRow {
  key: string;
  date: string;
  jobId: string;
  hours: number;
  description: string;
  billable: boolean;
}

interface JobAllocationSummary {
  jobId: number;
  jobBudgetHours: number;
  requiresAllocation: boolean;
  employeeAllocatedHours: number;
  jobAllocatedHours: number;
  approvedExtraJobHours: number;
  approvedExtraEmployeeHours: number;
  loggedJobHours: number;
  loggedEmployeeHours: number;
  allowedJobHours: number;
  allowedEmployeeHours: number;
  remainingJobHours: number;
  remainingEmployeeHours: number;
  billableAllocatedHours?: number;
  nonBillableAllocatedHours?: number;
  billableLoggedHours?: number;
  nonBillableLoggedHours?: number;
  billableRemainingHours?: number;
  nonBillableRemainingHours?: number;
}

const utilizationPeriodOptions: Array<{ value: UtilizationPeriod; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const utilizationToneClass = (status?: UtilizationSummary['status']) => {
  if (status === 'on_track') return 'text-emerald-600';
  if (status === 'at_risk') return 'text-amber-600';
  return 'text-rose-600';
};

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_ICONS = {
  pending: Clock,
  submitted: Send,
  approved: CheckCircle,
  rejected: XCircle,
};

export default function TimesheetsNew() {
  const { profile, isManager, isPartner } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  // State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('my-entries');
  const [showEntryDialog, setShowEntryDialog] = useState(false);
  const [showRequestTimeDialog, setShowRequestTimeDialog] = useState(false);
  const [showRejectEntryDialog, setShowRejectEntryDialog] = useState(false);
  const [rejectEntryId, setRejectEntryId] = useState<number | null>(null);
  const [rejectEntryReason, setRejectEntryReason] = useState('');
  const [showApproveRequestDialog, setShowApproveRequestDialog] = useState(false);
  const [approveRequestId, setApproveRequestId] = useState<number | null>(null);
  const [approveRequestReason, setApproveRequestReason] = useState('');
  const [showRejectRequestDialog, setShowRejectRequestDialog] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectRequestReason, setRejectRequestReason] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<number[]>([]);
  
  // Timer state
  const [timer, setTimer] = useState<TimerState>({
    isRunning: false,
    jobId: null,
    taskId: null,
    startTime: null,
    description: '',
    elapsedSeconds: 0,
  });
  const quickTimerCardRef = useRef<HTMLDivElement | null>(null);
  const quickTimerNotesInputRef = useRef<HTMLTextAreaElement | null>(null);
  const handledApprovedRequestIdsRef = useRef<Set<number>>(new Set());
  
  // Form state
  const [entryForm, setEntryForm] = useState({
    jobId: '',
    taskId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '',
    endTime: '',
    hours: 0,
    description: '',
    billable: true,
    nonBillableCategory: 'internal',
  });

  const [showNonBillableDialog, setShowNonBillableDialog] = useState(false);
  const [nonBillableForm, setNonBillableForm] = useState({
    activityId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '',
    endTime: '',
    hours: 0,
    description: '',
  });
  const [utilizationPeriod, setUtilizationPeriod] = useState<UtilizationPeriod>('weekly');

  const [showWeeklyDialog, setShowWeeklyDialog] = useState(false);
  const [weeklyRows, setWeeklyRows] = useState<WeeklyEntryRow[]>([]);

  const [additionalTimeRequest, setAdditionalTimeRequest] = useState({
    jobId: '',
    additionalHours: 0,
    justification: '',
    billable: false,
  });

  // Calculate week range
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });

  // Queries
  const { data: myJobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['my-assigned-jobs'],
    queryFn: () => jobsAPI.list({ status: ['in_progress', 'planned'] }),
  });

  const { data: timeEntriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['my-time-entries', format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    queryFn: () => timeEntriesAPI.list({
      dateFrom: format(weekStart, 'yyyy-MM-dd'),
      dateTo: format(weekEnd, 'yyyy-MM-dd'),
    }),
  });

  const { data: pendingApprovalsData } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => timeEntriesAPI.getPendingApprovals(),
    enabled: isManager || isPartner,
  });

  const { data: approvalRequestsData } = useQuery({
    queryKey: ['approval-requests', isManager, isPartner],
    queryFn: () =>
      timeEntriesAPI.listApprovalRequests(
        isManager || isPartner ? { status: 'pending' } : undefined
      ),
  });

  const { data: overAllocationData } = useQuery({
    queryKey: ['over-allocation-requests', isManager, isPartner],
    queryFn: () => timeEntriesAPI.listOverBudgetRequests({ status: 'pending' }),
    enabled: isManager || isPartner,
  });

  const { data: activitiesData } = useQuery({
    queryKey: ['non-billable-activities'],
    queryFn: () => timeEntriesAPI.listNonBillableActivities(),
  });
  const nonBillableActivities = (activitiesData || []) as NonBillableActivity[];

  const { data: utilizationData } = useQuery({
    queryKey: [
      'time-utilization',
      utilizationPeriod,
      format(selectedDate, 'yyyy-MM-dd'),
    ],
    queryFn: () =>
      timeEntriesAPI.getUtilization({
        period: utilizationPeriod,
        date: format(selectedDate, 'yyyy-MM-dd'),
      }),
  });
  const utilization = (
    Array.isArray(utilizationData) ? utilizationData[0] : utilizationData
  ) as UtilizationSummary | undefined;

  const toNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const normalizeTimeEntry = (entry: any): TimeEntry & { dateWorked?: string } => {
    const normalizedDate = String(entry?.date ?? entry?.dateWorked ?? '');
    return {
      ...entry,
      date: normalizedDate,
      dateWorked: normalizedDate,
      hours: toNumber(entry?.hours),
      billable: Boolean(entry?.billable),
    };
  };

  const isProjectedLeaveEntry = (entry: TimeEntry) =>
    Boolean(entry.isProjectedLeave || entry.sourceType === 'leave_request');

  const formatEntryTypeLabel = (entry: TimeEntry) => {
    if (isProjectedLeaveEntry(entry)) return 'Leave';
    if (entry.nonBillableCategory === 'public_holiday') return 'Public Holiday';
    return entry.billable ? 'Billable' : 'Non-Billable';
  };

  const formatDateSafe = (value?: string, pattern = 'MMM d') => {
    if (!value) return '-';
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? '-' : format(parsed, pattern);
  };

  // Get jobs with budget info
  const myJobs = (myJobsData?.data || []).map((job: any) => ({
    ...job,
    budgetHours: toNumber(job?.budgetHours),
  })) as Job[];
  const timeEntries = ((timeEntriesData?.data || []) as any[]).map(normalizeTimeEntry);
  const selectableEntries = timeEntries.filter((entry) => entry.status === 'pending' && !isProjectedLeaveEntry(entry));
  const requestedTab = String(searchParams.get('tab') || '').trim().toLowerCase();
  const requestedJobId = Number(searchParams.get('jobId'));
  const requestedApprovalRequestId = Number(searchParams.get('approvalRequestId'));
  const requestedApprovedRequestId = Number(searchParams.get('approvedRequestId'));

  useEffect(() => {
    if (!requestedTab) return;
    const allowedTabs = new Set(['my-entries', 'by-job', 'approvals']);
    if (!allowedTabs.has(requestedTab)) return;
    if (requestedTab === 'approvals' && !(isManager || isPartner)) return;
    setActiveTab(requestedTab);
  }, [isManager, isPartner, requestedTab]);

  const canLogTimeOnJob = useCallback((job?: Job | null) => {
    if (!job) return false;
    return Boolean(job.costingCompleted || job.jobCosting);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(requestedJobId) || requestedJobId <= 0) return;
    const hasRequestedJob = myJobs.some((job: Job) => job.id === requestedJobId);
    if (!hasRequestedJob) return;

    setEntryForm((prev) => {
      const nextJobId = String(requestedJobId);
      if (prev.jobId === nextJobId) return prev;
      return { ...prev, jobId: nextJobId };
    });
  }, [myJobs, requestedJobId]);

  const { data: allocationSummariesData } = useQuery({
    queryKey: ['job-allocation-summaries', myJobs.map((job: Job) => job.id)],
    queryFn: async () => {
      const summaries = await Promise.all(
        myJobs.map((job: Job) => timeEntriesAPI.getJobAllocationSummary(job.id))
      );
      return summaries.reduce((acc, summary) => {
        acc[summary.jobId] = summary;
        return acc;
      }, {} as Record<number, JobAllocationSummary>);
    },
    enabled: myJobs.length > 0,
  });
  const pendingApprovalsPayload: any = pendingApprovalsData;
  const approvalRequestsPayload: any = approvalRequestsData;
  const pendingApprovals = (
    Array.isArray(pendingApprovalsPayload)
      ? pendingApprovalsPayload
      : pendingApprovalsPayload?.data || []
  ).map(normalizeTimeEntry);
  const approvalRequests = Array.isArray(approvalRequestsPayload)
    ? approvalRequestsPayload
    : approvalRequestsPayload?.data || [];
  const overAllocationRequests = Array.isArray(overAllocationData)
    ? overAllocationData
    : (overAllocationData as any)?.data || [];
  const approvalsBadgeCount =
    pendingApprovals.length + approvalRequests.length + overAllocationRequests.length;
  const filteredPendingApprovals = useMemo(() => {
    if (
      requestedTab !== 'approvals' ||
      !Number.isFinite(requestedJobId) ||
      requestedJobId <= 0
    ) {
      return pendingApprovals;
    }
    return pendingApprovals.filter(
      (entry: any) => Number(entry.jobId ?? entry.job?.id ?? 0) === requestedJobId
    );
  }, [pendingApprovals, requestedJobId, requestedTab]);
  const filteredApprovalRequests = useMemo(() => {
    if (
      requestedTab !== 'approvals' ||
      !Number.isFinite(requestedJobId) ||
      requestedJobId <= 0
    ) {
      return approvalRequests;
    }
    return approvalRequests.filter(
      (request: any) => Number(request.jobId ?? request.job?.id ?? 0) === requestedJobId
    );
  }, [approvalRequests, requestedJobId, requestedTab]);
  const allocationSummaries = useMemo(
    () => (allocationSummariesData ?? {}) as Record<number, JobAllocationSummary>,
    [allocationSummariesData]
  );

  useEffect(() => {
    if (!Number.isFinite(requestedApprovedRequestId) || requestedApprovedRequestId <= 0) return;
    const approvedRequest = approvalRequests.find(
      (request: any) => Number(request.id) === requestedApprovedRequestId
    );
    if (!approvedRequest) return;
    if (String(approvedRequest.status || '').toLowerCase() !== 'approved') return;

    const approvedJobId = Number(approvedRequest.jobId ?? approvedRequest.job?.id ?? 0);
    if (Number.isFinite(approvedJobId) && approvedJobId > 0) {
      setEntryForm((prev) => {
        const nextJobId = String(approvedJobId);
        if (prev.jobId === nextJobId) return prev;
        return { ...prev, jobId: nextJobId };
      });
    }
    setActiveTab('by-job');

    if (!handledApprovedRequestIdsRef.current.has(requestedApprovedRequestId)) {
      handledApprovedRequestIdsRef.current.add(requestedApprovedRequestId);
      toast({
        title: 'Additional time approved',
        description: 'Your request was approved. You can continue logging time on this job.',
      });
    }
  }, [approvalRequests, requestedApprovedRequestId, toast]);

  useEffect(() => {
    if (activeTab !== 'approvals') return;
    if (!Number.isFinite(requestedApprovalRequestId) || requestedApprovalRequestId <= 0) return;
    const row = document.getElementById(`approval-request-${requestedApprovalRequestId}`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeTab, filteredApprovalRequests.length, requestedApprovalRequestId]);

  // Calculate budget info for each job
  const getJobBudgetInfo = useCallback((jobId: number): JobBudgetInfo => {
    const job = myJobs.find(j => j.id === jobId);
    if (!job) {
      return {
        jobId,
        allocatedHours: 0,
        usedHours: 0,
        remainingHours: 0,
        isBillableAvailable: false,
        billableAllocatedHours: 0,
        nonBillableAllocatedHours: 0,
        billableUsedHours: 0,
        nonBillableUsedHours: 0,
        billableRemainingHours: 0,
        nonBillableRemainingHours: 0,
      };
    }

    const allocation = allocationSummaries[jobId];
    if (allocation) {
      const billableAllocatedHours = Number(allocation.billableAllocatedHours || 0);
      const nonBillableAllocatedHours = Number(allocation.nonBillableAllocatedHours || 0);
      const billableUsedHours = Number(allocation.billableLoggedHours || 0);
      const nonBillableUsedHours = Number(allocation.nonBillableLoggedHours || 0);
      const billableRemainingHours = Math.max(0, billableAllocatedHours - billableUsedHours);
      const nonBillableRemainingHours = Math.max(
        0,
        nonBillableAllocatedHours - nonBillableUsedHours
      );
      const baseAllocatedHours = billableAllocatedHours + nonBillableAllocatedHours;

      return {
        jobId,
        allocatedHours: baseAllocatedHours,
        usedHours: billableUsedHours + nonBillableUsedHours,
        remainingHours: billableRemainingHours + nonBillableRemainingHours,
        isBillableAvailable: billableRemainingHours > 0,
        billableAllocatedHours,
        nonBillableAllocatedHours,
        billableUsedHours,
        nonBillableUsedHours,
        billableRemainingHours,
        nonBillableRemainingHours,
      };
    }

    const jobEntries = timeEntries.filter(e => e.jobId === jobId);
    const usedHours = jobEntries
      .filter(e => ['pending', 'submitted', 'approved'].includes(e.status))
      .reduce((sum, e) => sum + (e.hours || 0), 0);
    const billableUsedHours = jobEntries
      .filter(
        (entry) =>
          entry.billable && ['pending', 'submitted', 'approved'].includes(entry.status)
      )
      .reduce((sum, entry) => sum + (entry.hours || 0), 0);

    const allocatedHours = Number(job.budgetHours) || 0;
    const remainingHours = Math.max(0, allocatedHours - usedHours);

    return {
      jobId,
      allocatedHours,
      usedHours,
      remainingHours,
      isBillableAvailable: remainingHours > 0,
      billableAllocatedHours: allocatedHours,
      nonBillableAllocatedHours: 0,
      billableUsedHours,
      nonBillableUsedHours: Math.max(0, usedHours - billableUsedHours),
      billableRemainingHours: remainingHours,
      nonBillableRemainingHours: 0,
    };
  }, [allocationSummaries, myJobs, timeEntries]);

  const getRemainingJobHours = (jobId: number) => {
    const summary = allocationSummaries[jobId];
    if (summary) {
      return summary.remainingJobHours;
    }
    const job = myJobs.find(j => j.id === jobId);
    if (!job) return null;
    const jobEntries = timeEntries.filter(e => e.jobId === jobId);
    const usedHours = jobEntries
      .filter(e => ['pending', 'submitted', 'approved'].includes(e.status))
      .reduce((sum, e) => sum + (e.hours || 0), 0);
    const allocatedHours = Number(job.budgetHours) || 0;
    return Math.max(0, allocatedHours - usedHours);
  };

  const getRequestLimits = (jobId: number | null) => {
    if (!jobId) {
      return {
        remainingJobHours: null,
        remainingEmployeeHours: null,
        maxRequestableHours: null,
      };
    }
    const summary = allocationSummaries[jobId];
    const remainingJobHours = summary?.remainingJobHours ?? getRemainingJobHours(jobId) ?? null;
    const remainingEmployeeHours = summary?.remainingEmployeeHours ?? null;
    const maxRequestableHours =
      remainingJobHours !== null && remainingEmployeeHours !== null
        ? Math.min(remainingJobHours, remainingEmployeeHours)
        : remainingEmployeeHours ?? remainingJobHours ?? null;
    return {
      remainingJobHours,
      remainingEmployeeHours,
      maxRequestableHours,
    };
  };

  // Mutations
  const createEntryMutation = useMutation({
    mutationFn: (data: any) => timeEntriesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      setShowEntryDialog(false);
      resetEntryForm();
      toast({ title: 'Time entry created', description: 'Your time entry has been saved.' });
    },
    onError: (error: any) => {
      const message = error?.message || 'Unable to save time entry.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      if (message.toLowerCase().includes('allocation') || message.toLowerCase().includes('exceed')) {
        if (entryForm.jobId) {
          setAdditionalTimeRequest((prev) => ({ ...prev, jobId: entryForm.jobId }));
          setShowRequestTimeDialog(true);
        }
      }
    },
  });

  const createNonBillableMutation = useMutation({
    mutationFn: (data: any) => timeEntriesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      queryClient.invalidateQueries({ queryKey: ['time-utilization'] });
      setShowNonBillableDialog(false);
      setNonBillableForm({
        activityId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '',
        endTime: '',
        hours: 0,
        description: '',
      });
      toast({
        title: 'Non-billable entry created',
        description: 'Your non-billable activity has been submitted for approval.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error?.message || 'Unable to save non-billable entry.',
        variant: 'destructive',
      });
    },
  });

  const createWeeklyEntriesMutation = useMutation({
    mutationFn: async (rows: WeeklyEntryRow[]) => {
      const created: any[] = [];
      const errors: Array<{ date: string; message: string }> = [];

      for (const row of rows) {
        try {
          const entry = await timeEntriesAPI.create({
            jobId: Number(row.jobId),
            dateWorked: row.date,
            hours: Number(row.hours),
            description: row.description?.trim() || undefined,
            billable: row.billable,
          });
          created.push(entry);
        } catch (error: any) {
          errors.push({
            date: row.date,
            message: error?.message || 'Unable to save entry',
          });
        }
      }

      return { created, errors };
    },
    onSuccess: ({ created, errors }) => {
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      queryClient.invalidateQueries({ queryKey: ['time-utilization'] });
      if (errors.length > 0) {
        toast({
          title: 'Weekly timesheet partially saved',
          description: `${created.length} saved, ${errors.length} failed. ${errors[0].date}: ${errors[0].message}`,
          variant: 'destructive',
        });
        return;
      }
      setShowWeeklyDialog(false);
      toast({
        title: 'Weekly timesheet saved',
        description: `${created.length} ${created.length === 1 ? 'entry' : 'entries'} created.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error?.message || 'Unable to save the weekly timesheet.',
        variant: 'destructive',
      });
    },
  });

  const submitEntriesMutation = useMutation({
    mutationFn: (ids: number[]) => timeEntriesAPI.submitBulk(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      setSelectedEntries([]);
      toast({ 
        title: 'Entries submitted', 
        description: `${result.submitted} entries submitted for approval.` 
      });
    },
  });

  const approveEntriesMutation = useMutation({
    mutationFn: (ids: number[]) => timeEntriesAPI.approveBulk(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      toast({ 
        title: 'Entries approved', 
        description: `${result.approved} entries approved.` 
      });
    },
  });

  const rejectEntryMutation = useMutation({
    mutationFn: (payload: { entryId: number; reason: string }) =>
      timeEntriesAPI.reject(payload.entryId, payload.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      toast({ title: 'Entry rejected', description: 'Time entry rejected.' });
    },
  });

  const approveRequestMutation = useMutation({
    mutationFn: (payload: { requestId: number; note: string }) =>
      timeEntriesAPI.approveApprovalRequest(payload.requestId, payload.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      setShowApproveRequestDialog(false);
      setApproveRequestId(null);
      setApproveRequestReason('');
      toast({ title: 'Request approved', description: 'Additional hours approved.' });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (payload: { requestId: number; note?: string }) =>
      timeEntriesAPI.rejectApprovalRequest(payload.requestId, payload.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      toast({ title: 'Request rejected', description: 'Additional hours rejected.' });
    },
  });

  const approveOverAllocationMutation = useMutation({
    mutationFn: (payload: { requestId: number; note?: string }) =>
      timeEntriesAPI.approveOverBudgetRequest(payload.requestId, payload.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['over-allocation-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      toast({ title: 'Over-allocation approved', description: 'The excess hours were approved.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Unable to approve over-allocation',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const rejectOverAllocationMutation = useMutation({
    mutationFn: (payload: { requestId: number; note: string }) =>
      timeEntriesAPI.rejectOverBudgetRequest(payload.requestId, payload.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['over-allocation-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['my-time-entries'] });
      toast({ title: 'Over-allocation rejected', description: 'The excess hours were voided.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Unable to reject over-allocation',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleApproveOverAllocation = (requestId: number) => {
    const note = window.prompt('Manager note for approval (optional):') || '';
    approveOverAllocationMutation.mutate({ requestId, note });
  };

  const handleRejectOverAllocation = (requestId: number) => {
    const note = window.prompt('Reason for rejecting the excess hours:') || '';
    if (!note.trim()) {
      toast({
        title: 'Reason required',
        description: 'Add a note explaining why the excess is rejected.',
        variant: 'destructive',
      });
      return;
    }
    rejectOverAllocationMutation.mutate({ requestId, note: note.trim() });
  };

  const requestApprovalMutation = useMutation({
    mutationFn: (payload: { jobId: number; additionalHours: number; justification: string; requestType?: string }) =>
      timeEntriesAPI.createApprovalRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      setShowRequestTimeDialog(false);
      setAdditionalTimeRequest({
        jobId: '',
        additionalHours: 0,
        justification: '',
        billable: false,
      });
      toast({ title: 'Request sent', description: 'Additional hours request submitted for approval.' });
    },
    onError: (error: any) => {
      const message = error?.message || 'Unable to save time entry.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      if (message.toLowerCase().includes('allocation')) {
        if (entryForm.jobId) {
          setAdditionalTimeRequest((prev) => ({
            ...prev,
            jobId: entryForm.jobId,
          }));
          setShowRequestTimeDialog(true);
        }
      }
    },
  });

  // Timer functions
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timer.isRunning && timer.startTime) {
      interval = setInterval(() => {
        const elapsed = Math.max(0, differenceInSeconds(new Date(), timer.startTime!));
        setTimer(prev => ({ ...prev, elapsedSeconds: elapsed }));
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [timer.isRunning, timer.startTime]);

  const startTimer = (jobId: number, taskId?: number) => {
    const description = timer.description.trim();
    if (!description) {
      toast({
        title: 'Notes required',
        description: 'Add notes before starting the timer.',
        variant: 'destructive',
      });
      quickTimerNotesInputRef.current?.focus();
      return;
    }

    const job = myJobs.find((item: Job) => item.id === jobId);
    if (!canLogTimeOnJob(job)) {
      toast({
        title: 'Job setup incomplete',
        description: 'This job is assigned to you but not ready for timesheets. Ask your manager/HR to complete job costing.',
        variant: 'destructive',
      });
      return;
    }

    setTimer({
      isRunning: true,
      jobId,
      taskId: taskId || null,
      startTime: new Date(),
      description,
      elapsedSeconds: 0,
    });
    toast({ title: 'Timer started', description: 'Tracking your time...' });
  };

  const stopTimer = () => {
    if (!timer.jobId || !timer.startTime) return;
    const now = new Date();
    const elapsedSeconds = Math.max(0, differenceInSeconds(now, timer.startTime));
    if (elapsedSeconds < 60) {
      toast({
        title: 'Timer too short',
        description: 'Run the timer for at least 1 minute before saving.',
        variant: 'destructive',
      });
      return;
    }

    const description = timer.description.trim();
    if (!description) {
      toast({
        title: 'Notes required',
        description: 'Add notes before stopping and saving the timer.',
        variant: 'destructive',
      });
      quickTimerNotesInputRef.current?.focus();
      return;
    }

    createEntryMutation.mutate({
      jobId: timer.jobId,
      taskId: timer.taskId || undefined,
      dateWorked: format(timer.startTime, 'yyyy-MM-dd'),
      startedAt: timer.startTime.toISOString(),
      endedAt: now.toISOString(),
      description,
      billable: entryForm.billable,
    });
    
    setTimer({
      isRunning: false,
      jobId: null,
      taskId: null,
      startTime: null,
      description: '',
      elapsedSeconds: 0,
    });
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRequestType = (type?: string) => {
    if (!type) return 'Additional hours';
    return type.replace(/_/g, ' ');
  };

  const resetEntryForm = () => {
    setEntryForm({
      jobId: '',
      taskId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '',
      endTime: '',
      hours: 0,
      description: '',
      billable: true,
      nonBillableCategory: 'internal',
    });
  };

  const calculateHoursFromTime = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }

    const totalMinutes = endMinutes - startMinutes;

    let lunchOverlapMinutes = 0;
    const dayCount = Math.ceil(endMinutes / (24 * 60));
    for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
      const lunchStart = dayOffset * 24 * 60 + 13 * 60;
      const lunchEnd = dayOffset * 24 * 60 + 14 * 60;
      const overlapStart = Math.max(startMinutes, lunchStart);
      const overlapEnd = Math.min(endMinutes, lunchEnd);
      if (overlapEnd > overlapStart) {
        lunchOverlapMinutes += overlapEnd - overlapStart;
      }
    }

    const effectiveMinutes = Math.max(0, totalMinutes - lunchOverlapMinutes);
    return Math.round((effectiveMinutes / 60) * 100) / 100;
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const newForm = { ...entryForm, [field]: value };
    if (newForm.startTime && newForm.endTime) {
      newForm.hours = calculateHoursFromTime(newForm.startTime, newForm.endTime);
    }
    setEntryForm(newForm);
  };

  const handleJobChange = (jobId: string) => {
    setEntryForm(prev => ({
      ...prev,
      jobId,
      taskId: '',
    }));
    window.setTimeout(() => {
      quickTimerNotesInputRef.current?.focus();
    }, 0);
  };

  const startTimerFromJobCard = (jobId: number) => {
    handleJobChange(String(jobId));
    quickTimerCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (timer.description.trim()) {
      startTimer(jobId);
      return;
    }

    toast({
      title: 'Add notes to start',
      description: 'Job selected. Add notes in Quick Timer, then click Start Timer.',
    });
  };

  const handleCreateEntry = () => {
    if (!entryForm.jobId || !entryForm.hours) {
      toast({ title: 'Error', description: 'Please select a job and enter hours.', variant: 'destructive' });
      return;
    }

    const selectedJob = myJobs.find((job: Job) => job.id === Number(entryForm.jobId));
    if (!canLogTimeOnJob(selectedJob)) {
      toast({
        title: 'Job setup incomplete',
        description: 'This job is assigned to you but not ready for timesheets. Ask your manager/HR to complete job costing.',
        variant: 'destructive',
      });
      return;
    }
    
    const billable = entryForm.billable;
    const hasTimeRange = Boolean(entryForm.startTime && entryForm.endTime);
    const startedAt = hasTimeRange ? `${entryForm.date}T${entryForm.startTime}:00` : undefined;
    const endedAt = hasTimeRange ? `${entryForm.date}T${entryForm.endTime}:00` : undefined;

    const payload: Record<string, any> = {
      jobId: Number(entryForm.jobId),
      taskId: entryForm.taskId ? Number(entryForm.taskId) : undefined,
      dateWorked: entryForm.date,
      description: entryForm.description,
      billable,
    };

    if (hasTimeRange) {
      payload.startedAt = startedAt;
      payload.endedAt = endedAt;
    } else {
      payload.hours = entryForm.hours;
    }

    createEntryMutation.mutate(payload);
  };

  const handleCreateNonBillable = () => {
    if (!nonBillableForm.activityId) {
      toast({
        title: 'Error',
        description: 'Select a non-billable activity.',
        variant: 'destructive',
      });
      return;
    }

    const hasTimeRange = Boolean(nonBillableForm.startTime && nonBillableForm.endTime);
    if (!hasTimeRange && (!nonBillableForm.hours || nonBillableForm.hours <= 0)) {
      toast({
        title: 'Error',
        description: 'Enter hours or a start and end time.',
        variant: 'destructive',
      });
      return;
    }

    const payload: Record<string, any> = {
      nonBillableActivityId: Number(nonBillableForm.activityId),
      dateWorked: nonBillableForm.date,
      description: nonBillableForm.description.trim() || undefined,
      billable: false,
    };

    if (hasTimeRange) {
      payload.startedAt = `${nonBillableForm.date}T${nonBillableForm.startTime}:00`;
      payload.endedAt = `${nonBillableForm.date}T${nonBillableForm.endTime}:00`;
    } else {
      payload.hours = nonBillableForm.hours;
    }

    createNonBillableMutation.mutate(payload);
  };

  const handleNonBillableTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const next = { ...nonBillableForm, [field]: value };
    if (next.startTime && next.endTime) {
      next.hours = calculateHoursFromTime(next.startTime, next.endTime);
    }
    setNonBillableForm(next);
  };

  const openWeeklyDialog = () => {
    const today = new Date();
    const rows: WeeklyEntryRow[] = [0, 1, 2, 3, 4].map((offset) => {
      const date = addDays(weekStart, offset);
      return {
        key: `week-${today.getTime()}-${offset}`,
        date: format(date, 'yyyy-MM-dd'),
        jobId: '',
        hours: 0,
        description: '',
        billable: true,
      };
    });
    setWeeklyRows(rows);
    setShowWeeklyDialog(true);
  };

  const updateWeeklyRow = (key: string, patch: Partial<WeeklyEntryRow>) => {
    setWeeklyRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const addWeeklyRow = () => {
    setWeeklyRows((prev) => [
      ...prev,
      {
        key: `week-${Date.now()}-${prev.length}`,
        date: format(weekStart, 'yyyy-MM-dd'),
        jobId: '',
        hours: 0,
        description: '',
        billable: true,
      },
    ]);
  };

  const removeWeeklyRow = (key: string) => {
    setWeeklyRows((prev) => prev.filter((row) => row.key !== key));
  };

  const handleSaveWeekly = () => {
    const rows = weeklyRows.filter(
      (row) => row.jobId && Number(row.hours) > 0
    );
    if (rows.length === 0) {
      toast({
        title: 'Nothing to save',
        description: 'Add at least one job entry with hours.',
        variant: 'destructive',
      });
      return;
    }

    for (const row of rows) {
      const job = myJobs.find((item: Job) => item.id === Number(row.jobId));
      if (!canLogTimeOnJob(job)) {
        toast({
          title: 'Job setup incomplete',
          description: `The selected job for ${row.date} is not ready for timesheets.`,
          variant: 'destructive',
        });
        return;
      }
    }

    createWeeklyEntriesMutation.mutate(rows);
  };

  const handleRequestAdditionalTime = () => {
    if (!additionalTimeRequest.jobId) {
      toast({ title: 'Error', description: 'Select a job before requesting hours.', variant: 'destructive' });
      return;
    }
    if (!additionalTimeRequest.additionalHours || additionalTimeRequest.additionalHours <= 0) {
      toast({ title: 'Error', description: 'Enter the hours you need.', variant: 'destructive' });
      return;
    }
    if (!additionalTimeRequest.justification.trim()) {
      toast({ title: 'Error', description: 'Provide a justification for the request.', variant: 'destructive' });
      return;
    }

    requestApprovalMutation.mutate({
      jobId: Number(additionalTimeRequest.jobId),
      additionalHours: Number(additionalTimeRequest.additionalHours),
      justification: additionalTimeRequest.justification.trim(),
      requestType: additionalTimeRequest.billable ? 'additional_hours' : 'over_budget',
    });
  };

  // Calculate weekly summary
  const weeklySummary = {
    totalHours: timeEntries.reduce((sum, e) => sum + (e.hours || 0), 0),
    billableHours: timeEntries
      .filter(e => e.billable)
      .reduce((sum, e) => sum + (e.hours || 0), 0),
    nonBillableHours: timeEntries
      .filter(e => !e.billable)
      .reduce((sum, e) => sum + (e.hours || 0), 0),
    pendingCount: timeEntries.filter(e => e.status === 'pending').length,
    submittedCount: timeEntries.filter(e => e.status === 'submitted').length,
    approvedCount: timeEntries.filter(e => e.status === 'approved').length,
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Clock className="h-8 w-8 text-primary" />
              Timesheets
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your time on assigned jobs
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openWeeklyDialog}>
              <Calendar className="h-4 w-4 mr-2" />
              Weekly Timesheet
            </Button>
            <Button variant="outline" onClick={() => setShowNonBillableDialog(true)}>
              <ClipboardList className="h-4 w-4 mr-2" />
              Log Non-Billable
            </Button>
            <Button onClick={() => setShowEntryDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Log Time
            </Button>
          </div>
        </div>

        {/* Timer Card */}
        <Card ref={quickTimerCardRef} className={timer.isRunning ? 'border-green-500 bg-green-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Quick Timer
            </CardTitle>
            <CardDescription>
              Start a timer to automatically track time on a job
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timer.isRunning ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-mono font-bold text-green-600">
                    {formatTime(timer.elapsedSeconds)}
                  </div>
                  <div>
                    <p className="font-medium">
                      {myJobs.find(j => j.id === timer.jobId)?.jobName || 'Job'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {myJobs.find(j => j.id === timer.jobId)?.client?.clientName}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="What are you working on?"
                    value={timer.description}
                    onChange={(e) => setTimer(prev => ({ ...prev, description: e.target.value }))}
                    className="w-64 min-h-[80px]"
                  />
                  <Button variant="destructive" onClick={stopTimer}>
                    <Square className="h-4 w-4 mr-2" />
                    Stop & Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Select
                  value={entryForm.jobId}
                  onValueChange={handleJobChange}
                >
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder="Select a job to track" />
                  </SelectTrigger>
                  <SelectContent>
                    {myJobs.map(job => (
                      <SelectItem key={job.id} value={String(job.id)}>
                        {job.jobCode} - {job.jobName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  ref={quickTimerNotesInputRef}
                  placeholder="Add notes before starting timer (required). You can add multiple points on separate lines."
                  value={timer.description}
                  onChange={(e) => setTimer(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full md:w-80 min-h-[80px]"
                />
                <Button
                  onClick={() => entryForm.jobId && startTimer(Number(entryForm.jobId))}
                  disabled={!entryForm.jobId || !timer.description.trim()}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Timer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Summary Bar */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Week Summary</CardTitle>
              {weeklySummary.totalHours > 0 && (
                <span className={`text-sm font-semibold ${
                  (weeklySummary.billableHours / weeklySummary.totalHours) * 100 >= 70
                    ? 'text-emerald-600'
                    : (weeklySummary.billableHours / weeklySummary.totalHours) * 100 >= 50
                      ? 'text-amber-600'
                      : 'text-rose-600'
                }`}>
                  {((weeklySummary.billableHours / weeklySummary.totalHours) * 100).toFixed(0)}% utilization
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total hours</p>
                <p className="text-xl font-bold">{weeklySummary.totalHours.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Billable</p>
                <p className="text-xl font-bold text-emerald-600">{weeklySummary.billableHours.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Non-billable</p>
                <p className="text-xl font-bold text-amber-600">{weeklySummary.nonBillableHours.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-slate-500">{weeklySummary.pendingCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="text-xl font-bold text-blue-600">{weeklySummary.approvedCount}</p>
              </div>
            </div>
            {weeklySummary.totalHours > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${(weeklySummary.billableHours / weeklySummary.totalHours) * 100}%` }}
                  />
                  <div
                    className="h-full bg-amber-400 transition-all"
                    style={{ width: `${(weeklySummary.nonBillableHours / weeklySummary.totalHours) * 100}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />Billable</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />Non-billable</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billable / Non-billable threshold progress */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Utilization & Thresholds
                </CardTitle>
                <CardDescription>
                  {utilization
                    ? `${utilization.label} • ${utilization.billableTargetPercent}% of ${utilization.standardDailyHours}h/day = ${utilization.targetHours.toFixed(1)}h target`
                    : 'Billable hours vs the threshold target'}
                </CardDescription>
              </div>
              <Select
                value={utilizationPeriod}
                onValueChange={(value) => setUtilizationPeriod(value as UtilizationPeriod)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {utilizationPeriodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {utilization ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Billable utilization</span>
                      <span className="text-muted-foreground">
                        {utilization.actualBillableHours.toFixed(1)}h /{' '}
                        {utilization.targetHours.toFixed(1)}h
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, Math.max(0, utilization.utilizationPercent))}
                    />
                    <p className={`text-xs ${utilizationToneClass(utilization.utilizationStatus)}`}>
                      {utilization.utilizationPercent.toFixed(0)}% of billable target •{' '}
                      {utilization.utilizationVarianceHours >= 0 ? '+' : ''}
                      {utilization.utilizationVarianceHours.toFixed(1)}h variance
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Productive non-billable</span>
                      <span className="text-muted-foreground">
                        {utilization.actualProductiveNonBillableHours.toFixed(1)}h /{' '}
                        {utilization.expectedNonBillableHours.toFixed(1)}h
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        Math.max(0, utilization.nonBillableAchievementPercent)
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      {utilization.nonBillableAchievementPercent.toFixed(0)}% of allowance •{' '}
                      {utilization.nonBillableVarianceHours >= 0 ? '+' : ''}
                      {utilization.nonBillableVarianceHours.toFixed(1)}h variance
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Working days: {utilization.workingDays}</span>
                  <span>Approved leave: {utilization.approvedLeaveHours.toFixed(1)}h</span>
                  <span>Other non-billable: {utilization.actualOtherNonBillableHours.toFixed(1)}h</span>
                  <span className={utilizationToneClass(utilization.utilizationStatus)}>
                    Status: {utilization.utilizationStatus.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No threshold data available for this period yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Week Navigation */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, -7))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous Week
              </Button>
              <div className="text-lg font-medium">
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, 7))}
              >
                Next Week
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my-entries">My Time Entries</TabsTrigger>
            <TabsTrigger value="by-job">By Job</TabsTrigger>
            {(isManager || isPartner) && (
              <TabsTrigger value="approvals">
                Pending Approvals
                {approvalsBadgeCount > 0 && (
                  <span className="ml-2 flex items-center gap-1">
                    {pendingApprovals.length > 0 && (
                      <Badge variant="destructive">Entries {pendingApprovals.length}</Badge>
                    )}
                    {approvalRequests.length > 0 && (
                      <Badge variant="secondary">Requests {approvalRequests.length}</Badge>
                    )}
                    {overAllocationRequests.length > 0 && (
                      <Badge variant="outline">
                        Over-allocation {overAllocationRequests.length}
                      </Badge>
                    )}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* My Time Entries Tab */}
          <TabsContent value="my-entries" className="space-y-4">
            {/* Action Bar */}
            {selectedEntries.length > 0 && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-3 flex items-center justify-between">
                  <span>{selectedEntries.length} entries selected</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => submitEntriesMutation.mutate(selectedEntries)}
                      disabled={submitEntriesMutation.isPending}
                    >
                      {submitEntriesMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Submit for Approval
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedEntries([])}
                    >
                      Clear Selection
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Time Entries Table */}
            <Card>
              <CardContent className="pt-6">
                {entriesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : timeEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No time entries for this week</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setShowEntryDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Log Your First Entry
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              selectableEntries.length > 0 &&
                              selectedEntries.length === selectableEntries.length
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedEntries(selectableEntries.map(e => e.id));
                              } else {
                                setSelectedEntries([]);
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timeEntries.map((entry) => {
                        const StatusIcon = STATUS_ICONS[entry.status as keyof typeof STATUS_ICONS] || Clock;
                        return (
                          <TableRow key={entry.id}>
                            <TableCell>
                              {entry.status === 'pending' && !isProjectedLeaveEntry(entry) && (
                                <Checkbox
                                  checked={selectedEntries.includes(entry.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedEntries([...selectedEntries, entry.id]);
                                    } else {
                                      setSelectedEntries(selectedEntries.filter(id => id !== entry.id));
                                    }
                                  }}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {formatDateSafe(entry.date || (entry as any).dateWorked, 'EEE, MMM d')}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {isProjectedLeaveEntry(entry)
                                    ? entry.leaveType?.name || 'Leave'
                                    : entry.nonBillableCategory === 'public_holiday'
                                      ? 'Public Holiday'
                                      : entry.nonBillableActivity?.name ||
                                        entry.job?.jobName ||
                                        entry.proposal?.proposalTitle ||
                                        'Unassigned'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {isProjectedLeaveEntry(entry)
                                    ? 'Auto-projected from approved/pending leave'
                                    : entry.nonBillableCategory === 'public_holiday'
                                      ? 'Public holiday'
                                      : entry.nonBillableActivity
                                        ? 'Standalone non-billable'
                                        : entry.job?.client?.clientName ||
                                          (entry.proposal ? 'Proposal' : null)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {entry.description || (isProjectedLeaveEntry(entry) ? 'Leave entry' : '-')}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {entry.hours?.toFixed(1)}h
                            </TableCell>
                            <TableCell>
                              <Badge variant={entry.billable ? 'default' : 'secondary'}>
                                {formatEntryTypeLabel(entry)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS]}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {entry.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {!isManager && !isPartner && (
              <Card>
                <CardHeader>
                  <CardTitle>Additional Hours Requests</CardTitle>
                  <CardDescription>
                    Track approvals for extra time on your jobs.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {approvalRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No requests yet</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Submitted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {approvalRequests.map((request: any) => (
                          <TableRow key={request.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{request.job?.jobName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {request.job?.client?.clientName}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {Number(request.additionalHoursRequested ?? request.additionalHours ?? 0).toFixed(1)}h
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {formatRequestType(request.requestType)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={STATUS_COLORS[request.status as keyof typeof STATUS_COLORS] || 'bg-gray-100 text-gray-800'}>
                                {request.status || 'pending'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {formatDateSafe(request.requestedAt, 'MMM d')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* By Job Tab */}
          <TabsContent value="by-job" className="space-y-4">
            {myJobs.map(job => {
              const budgetInfo = getJobBudgetInfo(job.id);
              const jobEntries = timeEntries.filter(e => e.jobId === job.id);
              const jobTotalHours = jobEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
              
              return (
                <Card key={job.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Briefcase className="h-5 w-5" />
                          {job.jobName}
                        </CardTitle>
                        <CardDescription>
                          {job.jobCode} • {job.client?.clientName}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Budget Progress</p>
                        <p className="font-medium">
                          {budgetInfo.usedHours.toFixed(1)} / {budgetInfo.allocatedHours}h
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Progress
                      value={
                        budgetInfo.allocatedHours > 0
                          ? (budgetInfo.usedHours / budgetInfo.allocatedHours) * 100
                          : 0
                      }
                      className="mb-4"
                    />
                    <div className="grid grid-cols-3 gap-4 text-sm md:grid-cols-5">
                      <div>
                        <p className="text-muted-foreground">This Week</p>
                        <p className="font-medium">{jobTotalHours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Billable budget</p>
                        <p className="font-medium">
                          {budgetInfo.billableUsedHours.toFixed(1)} /{' '}
                          {budgetInfo.billableAllocatedHours.toFixed(1)}h
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Non-billable budget</p>
                        <p className="font-medium">
                          {budgetInfo.nonBillableUsedHours.toFixed(1)} /{' '}
                          {budgetInfo.nonBillableAllocatedHours.toFixed(1)}h
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Remaining</p>
                        <p
                          className={`font-medium ${
                            budgetInfo.billableRemainingHours <= 0
                              ? 'text-amber-600'
                              : 'text-green-600'
                          }`}
                        >
                          {budgetInfo.billableRemainingHours.toFixed(1)}h billable /{' '}
                          {budgetInfo.nonBillableRemainingHours.toFixed(1)}h non-billable
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <Badge>{job.status}</Badge>
                      </div>
                      <div className="text-right">
                        {budgetInfo.remainingHours <= 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAdditionalTimeRequest({
                                jobId: String(job.id),
                                additionalHours: 0,
                                justification: '',
                                billable: false,
                              });
                              setShowRequestTimeDialog(true);
                            }}
                          >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Request More Time
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => startTimerFromJobCard(job.id)}
                            disabled={timer.isRunning}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Start Timer
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Approvals Tab */}
          {(isManager || isPartner) && (
            <TabsContent value="approvals" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Time Entries</CardTitle>
                  <CardDescription>
                    Review and approve time entries from your team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredPendingApprovals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pending approvals</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Date</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Remaining (Job)</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPendingApprovals.map((entry: any) => (
                        <TableRow key={entry.id}>
                            <TableCell>
                              {entry.employee?.firstName} {entry.employee?.lastName}
                            </TableCell>
                            <TableCell>
                              {formatDateSafe(entry.date || (entry as any).dateWorked, 'MMM d')}
                            </TableCell>
                            <TableCell>
                              {entry.nonBillableActivity?.name ||
                                entry.job?.jobName ||
                                entry.proposal?.proposalTitle ||
                                '-'}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {entry.description}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {entry.hours?.toFixed(1)}h
                            </TableCell>
                            <TableCell>
                              <Badge variant={entry.billable ? 'default' : 'secondary'}>
                                {formatEntryTypeLabel(entry)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const remaining = getRemainingJobHours(entry.jobId);
                                if (remaining === null) return '-';
                                return (
                                  <span className={remaining <= 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                                    {remaining.toFixed(1)}h
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => approveEntriesMutation.mutate([entry.id])}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => {
                                    setRejectEntryId(entry.id);
                                    setRejectEntryReason('');
                                    setShowRejectEntryDialog(true);
                                  }}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Additional Hours Requests</CardTitle>
                  <CardDescription>
                    Approve extra time beyond allocated hours
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredApprovalRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No additional hours requests</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Remaining (Job)</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Justification</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApprovalRequests.map((request: any) => (
                          <TableRow
                            key={request.id}
                            id={`approval-request-${request.id}`}
                            className={
                              Number.isFinite(requestedApprovalRequestId) &&
                              requestedApprovalRequestId > 0 &&
                              Number(request.id) === requestedApprovalRequestId
                                ? 'bg-blue-50 ring-1 ring-blue-200'
                                : ''
                            }
                          >
                            <TableCell>
                              {request.employee?.firstName} {request.employee?.lastName}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{request.job?.jobName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {request.job?.client?.clientName}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {Number(request.additionalHoursRequested ?? request.additionalHours ?? 0).toFixed(1)}h
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const remaining = getRemainingJobHours(request.jobId);
                                if (remaining === null) return '-';
                                return (
                                  <span className={remaining <= 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                                    {remaining.toFixed(1)}h
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {formatRequestType(request.requestType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {request.justification || '-'}
                            </TableCell>
                            <TableCell>
                              {formatDateSafe(request.requestedAt, 'MMM d')}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setApproveRequestId(request.id);
                                    setApproveRequestReason('');
                                    setShowApproveRequestDialog(true);
                                  }}
                                  disabled={approveRequestMutation.isPending}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => {
                                    setRejectRequestId(request.id);
                                    setRejectRequestReason('');
                                    setShowRejectRequestDialog(true);
                                  }}
                                  disabled={rejectRequestMutation.isPending}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Over-allocation Requests</CardTitle>
                  <CardDescription>
                    Approve or reject excess hours per timesheet entry. Rejected excess is void.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {overAllocationRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pending over-allocation requests</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Job</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Excess</TableHead>
                          <TableHead className="text-right">Entry hours</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overAllocationRequests.map((request: any) => (
                          <TableRow key={request.id}>
                            <TableCell>
                              {request.employee?.firstName} {request.employee?.lastName}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{request.job?.jobName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {request.job?.client?.clientName}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={request.billableType === 'billable' ? 'default' : 'secondary'}>
                                {request.billableType === 'billable' ? 'Billable' : 'Non-billable'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium text-amber-600">
                              {Number(request.requestedAdditional || 0).toFixed(2)}h
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(request.timeEntry?.hours || 0).toFixed(2)}h
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                              {request.requestReason || request.timeEntry?.description || '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleApproveOverAllocation(request.id)}
                                  disabled={approveOverAllocationMutation.isPending}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => handleRejectOverAllocation(request.id)}
                                  disabled={rejectOverAllocationMutation.isPending}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Log Non-Billable Activity Dialog */}
        <Dialog open={showNonBillableDialog} onOpenChange={setShowNonBillableDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Non-Billable Activity</DialogTitle>
              <DialogDescription>
                Record productive non-billable time without a job. Leave and public holidays
                are handled by the leave module.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div>
                <Label>Activity *</Label>
                <Select
                  value={nonBillableForm.activityId}
                  onValueChange={(value) =>
                    setNonBillableForm((prev) => ({ ...prev, activityId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a non-billable activity" />
                  </SelectTrigger>
                  <SelectContent>
                    {nonBillableActivities.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No activities configured
                      </div>
                    ) : (
                      nonBillableActivities.map((activity) => (
                        <SelectItem key={activity.id} value={String(activity.id)}>
                          {activity.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={nonBillableForm.date}
                  onChange={(e) =>
                    setNonBillableForm((prev) => ({ ...prev, date: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={nonBillableForm.startTime}
                    onChange={(e) => handleNonBillableTimeChange('startTime', e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={nonBillableForm.endTime}
                    onChange={(e) => handleNonBillableTimeChange('endTime', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Hours *</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  value={nonBillableForm.hours}
                  onChange={(e) =>
                    setNonBillableForm((prev) => ({
                      ...prev,
                      hours: Number(e.target.value),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-calculated when start and end time are provided.
                </p>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={nonBillableForm.description}
                  onChange={(e) =>
                    setNonBillableForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="What non-billable work did you do?"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNonBillableDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateNonBillable}
                disabled={createNonBillableMutation.isPending}
              >
                {createNonBillableMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ClipboardList className="h-4 w-4 mr-2" />
                )}
                Save Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Weekly Timesheet Dialog */}
        <Dialog open={showWeeklyDialog} onOpenChange={setShowWeeklyDialog}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>Weekly Timesheet</DialogTitle>
              <DialogDescription>
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')} · add an
                entry for any day and mark it billable or non-billable.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="max-h-[55vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">Date</TableHead>
                      <TableHead className="min-w-[220px]">Job</TableHead>
                      <TableHead className="w-[100px]">Hours</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[90px]">Billable</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>
                          <Input
                            type="date"
                            value={row.date}
                            onChange={(e) =>
                              updateWeeklyRow(row.key, { date: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <select
                            className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                            value={row.jobId}
                            onChange={(e) =>
                              updateWeeklyRow(row.key, { jobId: e.target.value })
                            }
                          >
                            <option value="">Select a job</option>
                            {myJobs.map((job) => (
                              <option key={job.id} value={job.id}>
                                {job.jobCode} - {job.jobName}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.25"
                            min="0"
                            value={row.hours}
                            onChange={(e) =>
                              updateWeeklyRow(row.key, {
                                hours: Number(e.target.value),
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.description}
                            onChange={(e) =>
                              updateWeeklyRow(row.key, {
                                description: e.target.value,
                              })
                            }
                            placeholder="What did you work on?"
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={row.billable}
                            onCheckedChange={(checked) =>
                              updateWeeklyRow(row.key, { billable: checked })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeWeeklyRow(row.key)}
                            disabled={weeklyRows.length <= 1}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" size="sm" onClick={addWeeklyRow}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add entry
                </Button>
                <p className="text-xs text-muted-foreground">
                  Non-billable job time is recorded as a write-off.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowWeeklyDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveWeekly}
                disabled={createWeeklyEntriesMutation.isPending}
              >
                {createWeeklyEntriesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Calendar className="h-4 w-4 mr-2" />
                )}
                Save Week
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Log Time Dialog */}
        <Dialog open={showEntryDialog} onOpenChange={setShowEntryDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Time Entry</DialogTitle>
              <DialogDescription>
                Record time spent on a job or task
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Job *</Label>
                <Select value={entryForm.jobId} onValueChange={handleJobChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a job" />
                  </SelectTrigger>
                  <SelectContent>
                    {myJobs.map(job => {
                      const budgetInfo = getJobBudgetInfo(job.id);
                      return (
                        <SelectItem key={job.id} value={String(job.id)}>
                          <div className="flex items-center justify-between w-full">
                            <span>{job.jobCode} - {job.jobName}</span>
                            {budgetInfo.remainingHours <= 0 && (
                              <AlertCircle className="h-4 w-4 text-red-500 ml-2" />
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {entryForm.jobId && (
                  <div className="mt-2 text-sm">
                    {(() => {
                      const selectedJob = myJobs.find(job => job.id === Number(entryForm.jobId));
                      if (!canLogTimeOnJob(selectedJob)) {
                        return (
                          <div className="text-red-600">
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="h-4 w-4" />
                              Job costing is not complete. Time entry is currently blocked.
                            </span>
                          </div>
                        );
                      }

                      const budgetInfo = getJobBudgetInfo(Number(entryForm.jobId));
                      const remaining =
                        entryForm.billable
                          ? budgetInfo.billableRemainingHours
                          : budgetInfo.nonBillableRemainingHours;
                      const willExceed = entryForm.hours > remaining;
                      return (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                            <span>
                              Billable: {budgetInfo.billableUsedHours.toFixed(1)}h /{' '}
                              {budgetInfo.billableAllocatedHours.toFixed(1)}h
                            </span>
                            <span>
                              Non-billable: {budgetInfo.nonBillableUsedHours.toFixed(1)}h /{' '}
                              {budgetInfo.nonBillableAllocatedHours.toFixed(1)}h
                            </span>
                          </div>
                          <div className={willExceed ? 'text-amber-600' : 'text-muted-foreground'}>
                            {willExceed ? (
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="h-4 w-4" />
                                Excess hours will be sent to your manager for approval
                              </span>
                            ) : (
                              <span>
                                {remaining.toFixed(1)}h {entryForm.billable ? 'billable' : 'non-billable'} remaining
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={entryForm.date}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={entryForm.startTime}
                    onChange={(e) => handleTimeChange('startTime', e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={entryForm.endTime}
                    onChange={(e) => handleTimeChange('endTime', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Hours *</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  value={entryForm.hours}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, hours: Number(e.target.value) }))}
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={entryForm.description}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What did you work on?"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Billable</Label>
                <Switch
                  checked={entryForm.billable}
                  onCheckedChange={(checked) =>
                    setEntryForm(prev => ({ ...prev, billable: checked }))
                  }
                />
              </div>
              {!entryForm.billable && (
                <p className="text-xs text-muted-foreground">
                  Non-billable time on a job is recorded as a write-off.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEntryDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateEntry} disabled={createEntryMutation.isPending}>
                {createEntryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Save Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Request Additional Time Dialog */}
        <Dialog open={showRequestTimeDialog} onOpenChange={setShowRequestTimeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Additional Time</DialogTitle>
              <DialogDescription>
                Submit a request for additional hours on this job
              </DialogDescription>
            </DialogHeader>
            {(() => {
              const jobId = Number(additionalTimeRequest.jobId || entryForm.jobId) || null;
              const limits = getRequestLimits(jobId);
              return (
                <Card className="border-dashed">
                  <CardContent className="pt-4 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Remaining (Job)</span>
                      <span className={limits.remainingJobHours !== null && limits.remainingJobHours <= 0 ? 'text-red-600 font-medium' : 'font-medium'}>
                        {limits.remainingJobHours !== null ? `${limits.remainingJobHours.toFixed(1)}h` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Remaining (You)</span>
                      <span className={limits.remainingEmployeeHours !== null && limits.remainingEmployeeHours <= 0 ? 'text-red-600 font-medium' : 'font-medium'}>
                        {limits.remainingEmployeeHours !== null ? `${limits.remainingEmployeeHours.toFixed(1)}h` : '—'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
            <div className="space-y-4">
              <div>
                <Label>Hours Requested *</Label>
                <Input
                  type="number"
                  min="1"
                  value={additionalTimeRequest.additionalHours}
                  onChange={(e) => setAdditionalTimeRequest(prev => ({
                    ...prev,
                    additionalHours: Number(e.target.value)
                  }))}
                />
                {(() => {
                  const jobId = Number(additionalTimeRequest.jobId || entryForm.jobId) || null;
                  const { maxRequestableHours } = getRequestLimits(jobId);
                  if (maxRequestableHours === null) {
                    return (
                      <p className="text-xs text-muted-foreground mt-2">
                        Select a job to see remaining hours.
                      </p>
                    );
                  }
                  const exceeds = additionalTimeRequest.additionalHours > maxRequestableHours;
                  if (maxRequestableHours <= 0) {
                    return (
                      <p className="text-xs text-red-600 mt-2">
                        No remaining hours available. This request will be reviewed as non-billable.
                      </p>
                    );
                  }
                  return (
                    <div className="flex items-center justify-between mt-2">
                      <p className={`text-xs ${exceeds ? 'text-red-600' : 'text-muted-foreground'}`}>
                        Max suggested: {maxRequestableHours.toFixed(1)}h
                        {exceeds ? ' (exceeds remaining)' : ''}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAdditionalTimeRequest((prev) => ({
                          ...prev,
                          additionalHours: Number(maxRequestableHours.toFixed(1)),
                        }))}
                      >
                        Use remaining
                      </Button>
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label>Reason *</Label>
                <Textarea
                  value={additionalTimeRequest.justification}
                  onChange={(e) => setAdditionalTimeRequest(prev => ({
                    ...prev,
                    justification: e.target.value
                  }))}
                  placeholder="Why do you need additional time?"
                  rows={4}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Request as Billable</Label>
                <Switch
                  checked={additionalTimeRequest.billable}
                  onCheckedChange={(checked) => setAdditionalTimeRequest(prev => ({
                    ...prev,
                    billable: checked
                  }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRequestTimeDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRequestAdditionalTime}
                disabled={(() => {
                  const jobId = Number(additionalTimeRequest.jobId || entryForm.jobId) || null;
                  const { maxRequestableHours } = getRequestLimits(jobId);
                  if (requestApprovalMutation.isPending) return true;
                  if (!jobId) return true;
                  if (additionalTimeRequest.additionalHours <= 0) return true;
                  if (maxRequestableHours !== null && additionalTimeRequest.additionalHours > maxRequestableHours) {
                    return true;
                  }
                  return false;
                })()}
              >
                {requestApprovalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Time Entry Dialog */}
        <Dialog open={showRejectEntryDialog} onOpenChange={setShowRejectEntryDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Time Entry</DialogTitle>
              <DialogDescription>
                Provide a brief reason for rejecting this time entry.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Reason *</Label>
                <Textarea
                  value={rejectEntryReason}
                  onChange={(e) => setRejectEntryReason(e.target.value)}
                  placeholder="Add a short reason for the rejection."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRejectEntryDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!rejectEntryId) return;
                  rejectEntryMutation.mutate({
                    entryId: rejectEntryId,
                    reason: rejectEntryReason || 'Rejected by manager',
                  });
                  setShowRejectEntryDialog(false);
                }}
                disabled={rejectEntryMutation.isPending}
              >
                {rejectEntryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Reject Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Approve Additional Hours Request Dialog */}
        <Dialog open={showApproveRequestDialog} onOpenChange={setShowApproveRequestDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Additional Hours</DialogTitle>
              <DialogDescription>
                Provide a brief reason for approving this requested time.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Approval reason *</Label>
                <Textarea
                  value={approveRequestReason}
                  onChange={(e) => setApproveRequestReason(e.target.value)}
                  placeholder="Why are you approving this request?"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowApproveRequestDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!approveRequestId) return;
                  const note = approveRequestReason.trim();
                  if (!note) return;
                  approveRequestMutation.mutate({ requestId: approveRequestId, note });
                }}
                disabled={approveRequestMutation.isPending || !approveRequestReason.trim()}
              >
                {approveRequestMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Approve Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Additional Hours Request Dialog */}
        <Dialog open={showRejectRequestDialog} onOpenChange={setShowRejectRequestDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Additional Hours</DialogTitle>
              <DialogDescription>
                Provide a brief reason for rejecting this requested time.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rejection reason *</Label>
                <Textarea
                  value={rejectRequestReason}
                  onChange={(e) => setRejectRequestReason(e.target.value)}
                  placeholder="Why are you rejecting this request?"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRejectRequestDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!rejectRequestId) return;
                  const note = rejectRequestReason.trim();
                  if (!note) return;
                  rejectRequestMutation.mutate({
                    requestId: rejectRequestId,
                    note,
                  });
                  setShowRejectRequestDialog(false);
                }}
                disabled={rejectRequestMutation.isPending || !rejectRequestReason.trim()}
              >
                {rejectRequestMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Reject Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

