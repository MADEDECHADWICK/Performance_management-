import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import DocumentPreviewDialog from '@/components/DocumentPreviewDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { documentsAPI, jobsAPI, timeEntriesAPI } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type {
  Job,
  JobStaffAssignment,
  JobInvoiceMilestoneTracking,
  JobInvoiceMilestoneTrackingItem,
  JobWorkflowTrackingResponse,
} from '@/lib/api/types';
import {
  Briefcase,
  Calendar,
  RefreshCw,
  Users,
  Loader2,
  FileText,
  Upload,
  ArrowRight,
  Flag,
  Plus,
  Trash2,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const WORKFLOW_STATUS_TRANSITIONS: Record<string, Array<Job['status']>> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

interface AllocationInput {
  employeeProfileId: number;
  roleId: number;
  employeeName: string;
  roleName: string;
  allocatedHours: string;
  hourlyRate: string;
  billable: boolean;
  taskDescription: string;
}

interface CostingFormState {
  jobFee: string;
  notes: string;
  capEnforced: boolean;
  allowOverage: boolean;
  maxOveragePercent: string;
  allocations: AllocationInput[];
}

interface MilestoneDraft {
  id: string;
  title: string;
  targetPercent: string;
  dueDate: string;
  requirements: string;
  assignedToProfileId: string;
}

interface AllocationSummary {
  jobId: number;
  remainingJobHours: number;
  allowedJobHours: number;
  loggedJobHours: number;
  employeeAllocatedHours: number;
  allowedEmployeeHours: number;
  loggedEmployeeHours: number;
  remainingEmployeeHours: number;
}

interface JobDocument {
  id: number;
  fileName: string;
  filePath: string;
  documentType: string;
  mimeType?: string;
  verificationStatus?: string;
  rejectionReason?: string;
  description?: string;
  createdAt?: string;
}

type RequiredDocumentType = 'work_plan' | 'budget' | 'draft_report' | 'final_report';

interface RequiredDocumentDefinition {
  type: RequiredDocumentType;
  label: string;
  matchingTokens: string[];
}

interface RequiredActionItem {
  key: string;
  title: string;
  description: string;
  path?: string;
  ctaLabel?: string;
}

const REQUIRED_DOCUMENTS_BY_TYPE: Record<RequiredDocumentType, RequiredDocumentDefinition> = {
  work_plan: {
    type: 'work_plan',
    label: 'Work Plan',
    matchingTokens: ['workplan', 'workpaper'],
  },
  budget: {
    type: 'budget',
    label: 'Budget',
    matchingTokens: ['budget'],
  },
  draft_report: {
    type: 'draft_report',
    label: 'Draft Report',
    matchingTokens: ['draftreport'],
  },
  final_report: {
    type: 'final_report',
    label: 'Final Report',
    matchingTokens: ['finalreport', 'auditreport', 'managementletter', 'deliverable'],
  },
};

const REQUIRED_DOCUMENT_TYPES_BY_JOB_STATUS: Partial<Record<Job['status'], RequiredDocumentType[]>> = {
  planned: ['work_plan', 'budget'],
  in_progress: ['work_plan', 'budget'],
  on_hold: ['work_plan', 'budget'],
  completed: ['work_plan', 'budget', 'draft_report', 'final_report'],
};

const normalizeDocumentType = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const documentMatchesRequirement = (documentType: string, requirement: RequiredDocumentDefinition) => {
  const normalized = normalizeDocumentType(documentType);
  return requirement.matchingTokens.some((token) => normalized.includes(token));
};

const sortDocumentsNewestFirst = (documents: JobDocument[]) =>
  [...documents].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return Number(right.id || 0) - Number(left.id || 0);
  });

const millisecondsInDay = 24 * 60 * 60 * 1000;

const toStartOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const differenceInDays = (startDate: Date, endDate: Date) => {
  const start = toStartOfDay(startDate).getTime();
  const end = toStartOfDay(endDate).getTime();
  return Math.floor((end - start) / millisecondsInDay);
};

const buildDefaultMilestoneDrafts = (): MilestoneDraft[] => [
  {
    id: `m-${Date.now()}-25`,
    title: 'Planning and kickoff completed',
    targetPercent: '25',
    dueDate: '',
    requirements: 'Approved work plan and kickoff sign-off uploaded.',
    assignedToProfileId: '',
  },
  {
    id: `m-${Date.now()}-50`,
    title: 'Fieldwork midpoint completed',
    targetPercent: '50',
    dueDate: '',
    requirements: 'Interim deliverables and midpoint review approved.',
    assignedToProfileId: '',
  },
  {
    id: `m-${Date.now()}-75`,
    title: 'Draft report submitted',
    targetPercent: '75',
    dueDate: '',
    requirements: 'Draft report uploaded and manager or partner comments addressed.',
    assignedToProfileId: '',
  },
  {
    id: `m-${Date.now()}-100`,
    title: 'Final report and closure completed',
    targetPercent: '100',
    dueDate: '',
    requirements: 'Final report uploaded and client closure sign-off recorded.',
    assignedToProfileId: '',
  },
];

const mapTrackingMilestonesToDrafts = (
  tracking: JobInvoiceMilestoneTracking | null
): MilestoneDraft[] => {
  if (!tracking || tracking.milestones.length === 0) {
    return buildDefaultMilestoneDrafts();
  }

  return [...tracking.milestones]
    .sort((a, b) => a.targetPercent - b.targetPercent)
    .map((milestone, index) => ({
      id: `milestone-${milestone.taskId}-${index}`,
      title: milestone.title,
      targetPercent: String(milestone.targetPercent),
      dueDate: milestone.dueDate ? String(milestone.dueDate).slice(0, 10) : '',
      requirements: milestone.requirements || '',
      assignedToProfileId: milestone.assignedToProfileId
        ? String(milestone.assignedToProfileId)
        : '',
    }));
};

export default function JobWorkflowDashboard() {
  const { toast } = useToast();
  const { profile, isEmployee, isAdmin, isHR, isGMP, isPartner, isManager } = useAuth();
  const navigate = useNavigate();
  const { jobId: routeJobId } = useParams<{ jobId?: string }>();
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<JobStaffAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Job['status'] | null>(null);
  const [jobTracking, setJobTracking] = useState<JobWorkflowTrackingResponse | null>(null);
  const [costingForm, setCostingForm] = useState<CostingFormState | null>(null);
  const [costingLoading, setCostingLoading] = useState(false);
  const [costingSaving, setCostingSaving] = useState(false);
  const [allocationSummary, setAllocationSummary] = useState<AllocationSummary | null>(null);
  const [invoiceTracking, setInvoiceTracking] = useState<JobInvoiceMilestoneTracking | null>(null);
  const [milestoneDrafts, setMilestoneDrafts] = useState<MilestoneDraft[]>(() =>
    buildDefaultMilestoneDrafts()
  );
  const [jobDocuments, setJobDocuments] = useState<JobDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<JobDocument | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Record<string, File | null>>({});
  const [uploadingDocumentType, setUploadingDocumentType] = useState<RequiredDocumentType | null>(null);
  const [milestoneUpdatingId, setMilestoneUpdatingId] = useState<number | null>(null);
  const [partnerReviewNotes, setPartnerReviewNotes] = useState('');
  const [partnerReviewSaving, setPartnerReviewSaving] = useState<'approved' | 'rejected' | null>(null);
  const isEmployeeExperience =
    isEmployee && !isAdmin && !isHR && !isGMP && !isPartner && !isManager;
  const isFixedFeeJob = selectedJob?.billingType === 'fixed_fee';
  const selectedJobIdParam = Number(routeJobId || searchParams.get('jobId'));

  const formatDocumentType = (value?: string) => {
    if (!value) return 'Document';
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getVerificationBadgeClass = (status?: string) => {
    if (status === 'verified') return 'bg-green-100 text-green-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  const getCostingStatusBadgeClass = (status?: string | null) => {
    if (status === 'approved') return 'bg-green-100 text-green-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    if (status === 'submitted') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  const parseDocumentsResponse = (payload: any): JobDocument[] => {
    if (Array.isArray(payload?.documents)) return payload.documents as JobDocument[];
    if (Array.isArray(payload?.data)) return payload.data as JobDocument[];
    if (Array.isArray(payload?.items)) return payload.items as JobDocument[];
    return [];
  };

  const loadJobDocuments = async (jobId: number) => {
    try {
      setDocumentsLoading(true);
      const response = await documentsAPI.getJobDocuments(jobId);
      const documents = parseDocumentsResponse(response);
      setJobDocuments(documents);
      return documents;
    } catch (error) {
      console.error('Failed to load job documents:', error);
      setJobDocuments([]);
      return [] as JobDocument[];
    } finally {
      setDocumentsLoading(false);
    }
  };

  const loadJobs = async () => {
    try {
      setIsLoading(true);
      const response = await jobsAPI.list({ pageSize: 100 });
      const allJobs = response.data || [];
      const scopedJobs =
        isEmployeeExperience && profile?.id
          ? allJobs.filter((job) =>
              (job.staffing || []).some((assignment) => assignment.employeeProfileId === profile.id)
            )
          : allJobs;
      setJobs(scopedJobs);
    } catch (error) {
      console.error('Failed to load jobs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load jobs',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetJobDetailState = () => {
    setSelectedJob(null);
    setStaff([]);
    setInvoiceTracking(null);
    setMilestoneDrafts(buildDefaultMilestoneDrafts());
    setCostingForm(null);
    setJobDocuments([]);
    setAllocationSummary(null);
    setJobTracking(null);
  };

  const loadJobDetails = async (jobId: number) => {
    try {
      setTrackingLoading(true);
      const job = await jobsAPI.getById(jobId);
      const [staffAssignments, tracking] = await Promise.all([
        jobsAPI.getStaff(jobId),
        jobsAPI.getTracking(jobId),
      ]);
      setSelectedJob(job);
      setStaff(staffAssignments);
      setJobTracking(tracking);
      await Promise.all([loadAllocationSummary(jobId), loadJobDocuments(jobId)]);

      if (isEmployeeExperience) {
        setInvoiceTracking(null);
        setMilestoneDrafts(buildDefaultMilestoneDrafts());
        setCostingForm(null);
      } else {
        const invoiceMilestones = await jobsAPI.getInvoiceMilestones(jobId);
        setInvoiceTracking(invoiceMilestones);
        setMilestoneDrafts(mapTrackingMilestonesToDrafts(invoiceMilestones));
        await initializeCosting(job, staffAssignments);
      }
    } catch (error) {
      console.error('Failed to load job details:', error);
      resetJobDetailState();

      if (error instanceof ApiError && error.status === 404) {
        navigate('/jobs', { replace: true });
        toast({
          title: 'Job not found',
          description: `Job #${jobId} no longer exists or this link is outdated.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load job details',
          variant: 'destructive',
        });
      }
    } finally {
      setTrackingLoading(false);
    }
  };

  const formatConditionStatus = (status: string) => status.replace(/_/g, ' ');

  const getConditionStatusBadgeClass = (status: string) => {
    if (status === 'completed') return 'bg-green-100 text-green-800';
    if (status === 'in_progress') return 'bg-blue-100 text-blue-800';
    if (status === 'blocked') return 'bg-red-100 text-red-800';
    if (status === 'cancelled') return 'bg-gray-200 text-gray-700';
    return 'bg-gray-100 text-gray-800';
  };

  const getInvoiceStatusBadge = (milestone: JobInvoiceMilestoneTrackingItem) => {
    if (milestone.milestonePaid) {
      return { label: 'Paid', className: 'bg-green-100 text-green-800' };
    }
    if (milestone.readyForInvoice) {
      return { label: 'Ready for Invoice', className: 'bg-amber-100 text-amber-900' };
    }
    if (milestone.conditionCompleted) {
      return { label: 'Awaiting Prior Payment', className: 'bg-blue-100 text-blue-800' };
    }
    return { label: 'Condition Pending', className: 'bg-gray-100 text-gray-800' };
  };

  const handleMarkMilestoneComplete = async (milestoneTaskId: number) => {
    if (!selectedJob) return;

    try {
      setMilestoneUpdatingId(milestoneTaskId);
      const response = await jobsAPI.updateInvoiceMilestoneStatus(
        selectedJob.id,
        milestoneTaskId,
        'completed'
      );
      setInvoiceTracking(response.tracking);
      toast({
        title: 'Milestone Updated',
        description:
          'Milestone condition marked as complete. Invoice readiness has been recalculated.',
      });
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description:
          error?.message || 'Unable to update milestone status for this job.',
        variant: 'destructive',
      });
    } finally {
      setMilestoneUpdatingId(null);
    }
  };

  const loadAllocationSummary = async (jobId: number) => {
    try {
      const summary = await timeEntriesAPI.getJobAllocationSummary(jobId);
      setAllocationSummary({
        jobId: summary.jobId,
        remainingJobHours: summary.remainingJobHours,
        allowedJobHours: summary.allowedJobHours,
        loggedJobHours: summary.loggedJobHours,
        employeeAllocatedHours: summary.employeeAllocatedHours,
        allowedEmployeeHours: summary.allowedEmployeeHours,
        loggedEmployeeHours: summary.loggedEmployeeHours,
        remainingEmployeeHours: summary.remainingEmployeeHours,
      });
    } catch (error) {
      console.error('Failed to load allocation summary:', error);
      setAllocationSummary(null);
    }
  };

  const trackingEmployeeByProfileId = useMemo(() => {
    const map = new Map<number, JobWorkflowTrackingResponse['tracking']['staffing']['employees'][number]>();
    const employees = jobTracking?.tracking?.staffing?.employees || [];
    employees.forEach((employee) => map.set(Number(employee.profileId || 0), employee));
    return map;
  }, [jobTracking]);

  const moveJobToStatus = async (nextStatus: Job['status']) => {
    if (!selectedJob) return;
    try {
      setStatusUpdating(nextStatus);
      await jobsAPI.updateStatus(selectedJob.id, nextStatus);
      await Promise.all([loadJobs(), loadJobDetails(selectedJob.id)]);
      toast({
        title: 'Workflow updated',
        description: `Job moved to ${String(nextStatus).replace(/_/g, ' ')}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Status update failed',
        description: error?.message || 'Unable to update job workflow status.',
        variant: 'destructive',
      });
    } finally {
      setStatusUpdating(null);
    }
  };

  const employeeAssignment = useMemo(() => {
    if (!profile?.id) return null;
    return staff.find((assignment) => assignment.employeeProfileId === profile.id) || null;
  }, [profile?.id, staff]);

  const employeeTracking = useMemo(() => {
    if (!profile?.id) return null;
    return trackingEmployeeByProfileId.get(Number(profile.id)) || null;
  }, [profile?.id, trackingEmployeeByProfileId]);

  const trackingSnapshot = jobTracking?.tracking || null;
  const workflowSnapshot = jobTracking?.workflow || null;
  const executionSnapshot = workflowSnapshot?.execution || null;
  const selectedWorkflowStatus = (
    selectedJob?.status ||
    jobTracking?.job?.status ||
    'planned'
  ) as Job['status'];
  const availableStatusTransitions =
    WORKFLOW_STATUS_TRANSITIONS[selectedWorkflowStatus] || [];

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);

  const formatPercent = (value: number) => `${Number(value || 0).toFixed(1)}%`;

  const formatStatusLabel = (status: string) => status.replace(/_/g, ' ');

  const resolveTransitionBlockers = (targetStatus: Job['status']) => {
    if (!executionSnapshot) return [];
    if (targetStatus === 'in_progress') {
      return executionSnapshot.blockersForInProgress || [];
    }
    if (targetStatus === 'completed') {
      return executionSnapshot.blockersForCompletion || [];
    }
    return [];
  };

  const openTrackingJob = (jobId: number) => {
    navigate(`/jobs/${jobId}/tracking`);
    void loadJobDetails(jobId);
  };

  const requiredDocumentDefinitions = useMemo(() => {
    if (!selectedJob?.status) return [];
    const requiredTypes = REQUIRED_DOCUMENT_TYPES_BY_JOB_STATUS[selectedJob.status] || [];
    return requiredTypes.map((type) => REQUIRED_DOCUMENTS_BY_TYPE[type]);
  }, [selectedJob?.status]);

  const requiredDocumentChecklist = useMemo(
    () =>
      requiredDocumentDefinitions.map((requirement) => {
        const matchingDocuments = jobDocuments.filter((doc) =>
          documentMatchesRequirement(doc.documentType, requirement)
        );
        return {
          ...requirement,
          uploaded: matchingDocuments.length > 0,
          matchingDocuments,
        };
      }),
    [jobDocuments, requiredDocumentDefinitions]
  );

  const missingRequiredDocuments = useMemo(
    () => requiredDocumentChecklist.filter((item) => !item.uploaded),
    [requiredDocumentChecklist]
  );

  const partnerReviewDocumentChecklist = useMemo(
    () =>
      ['work_plan', 'budget'].map((type) => {
        const requirement = REQUIRED_DOCUMENTS_BY_TYPE[type as RequiredDocumentType];
        const matchingDocuments = sortDocumentsNewestFirst(
          jobDocuments.filter((doc) => documentMatchesRequirement(doc.documentType, requirement))
        );
        return {
          ...requirement,
          uploaded: matchingDocuments.length > 0,
          matchingDocuments,
          latestDocument: matchingDocuments[0] || null,
        };
      }),
    [jobDocuments]
  );

  const missingPartnerReviewDocuments = useMemo(
    () => partnerReviewDocumentChecklist.filter((item) => !item.latestDocument),
    [partnerReviewDocumentChecklist]
  );

  const jobTimeline = useMemo(() => {
    if (!selectedJob) return null;

    const now = new Date();
    const startDate = selectedJob.startDate ? new Date(selectedJob.startDate) : null;
    const dueDate = selectedJob.dueDate ? new Date(selectedJob.dueDate) : null;

    const isCompleted = selectedJob.status === 'completed';
    const isOverdue = !!dueDate && !isCompleted && toStartOfDay(now) > toStartOfDay(dueDate);
    const overdueDays = isOverdue && dueDate ? Math.max(0, differenceInDays(dueDate, now)) : 0;
    const remainingDays =
      dueDate && !isCompleted ? differenceInDays(now, dueDate) : null;

    let totalDays: number | null = null;
    let elapsedDays: number | null = null;
    let progressPercent: number | null = null;

    if (startDate && dueDate) {
      totalDays = Math.max(1, differenceInDays(startDate, dueDate) + 1);
      const elapsed = Math.max(0, differenceInDays(startDate, now) + 1);
      elapsedDays = Math.min(totalDays, elapsed);
      progressPercent = Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));
    }

    return {
      isOverdue,
      overdueDays,
      startDate,
      dueDate,
      totalDays,
      elapsedDays,
      remainingDays,
      progressPercent,
    };
  }, [selectedJob]);

  const employeeUtilizationPercent = useMemo(() => {
    if (employeeTracking) {
      return Math.round(Number(employeeTracking.utilizationPercent || 0));
    }
    if (!allocationSummary || allocationSummary.allowedEmployeeHours <= 0) return 0;
    return Math.min(
      100,
      Math.round((allocationSummary.loggedEmployeeHours / allocationSummary.allowedEmployeeHours) * 100)
    );
  }, [allocationSummary, employeeTracking]);

  const requiredActions = useMemo<RequiredActionItem[]>(() => {
    if (!selectedJob) return [];

    const actions: RequiredActionItem[] = [];

    if (
      allocationSummary &&
      selectedJob.status !== 'completed' &&
      allocationSummary.loggedEmployeeHours <= 0
    ) {
      actions.push({
        key: 'timesheet-start',
        title: 'Log your first timesheet entry',
        description: 'Start tracking hours on this job to keep delivery and utilization current.',
        path: `/timesheets?jobId=${selectedJob.id}`,
        ctaLabel: 'Open Timesheets',
      });
    }

    if (
      allocationSummary &&
      selectedJob.status !== 'completed' &&
      allocationSummary.remainingEmployeeHours <= 2
    ) {
      actions.push({
        key: 'hours-low',
        title: 'Review remaining hours',
        description: `You have ${allocationSummary.remainingEmployeeHours.toFixed(1)}h remaining on this job allocation.`,
        path: `/timesheets?jobId=${selectedJob.id}`,
        ctaLabel: 'Review Hours',
      });
    }

    if (missingRequiredDocuments.length > 0) {
      const missingLabels = missingRequiredDocuments.map((item) => item.label).join(', ');
      actions.push({
        key: 'documents-required',
        title: 'Upload required job documents',
        description: `${missingLabels} still need to be uploaded for this workflow stage.`,
      });
    }

    if (jobTimeline?.isOverdue) {
      actions.push({
        key: 'timeline-overdue',
        title: 'Job timeline is overdue',
        description: `This job is overdue by ${jobTimeline.overdueDays} day(s). Update progress and flag blockers.`,
      });
    } else if (jobTimeline?.remainingDays !== null && jobTimeline?.remainingDays !== undefined) {
      if (jobTimeline.remainingDays <= 3 && selectedJob.status !== 'completed') {
        actions.push({
          key: 'timeline-due-soon',
          title: 'Due date approaching',
          description: `Only ${Math.max(0, jobTimeline.remainingDays)} day(s) left before the due date.`,
        });
      }
    }

    return actions;
  }, [allocationSummary, jobTimeline, missingRequiredDocuments, selectedJob]);

  const handleRequiredDocumentFileChange = (documentType: RequiredDocumentType, file: File | null) => {
    setPendingUploads((prev) => ({ ...prev, [documentType]: file }));
  };

  const uploadRequiredDocument = async (
    documentType: RequiredDocumentType,
    options?: { suppressSuccessToast?: boolean }
  ) => {
    if (!selectedJob) return;
    const file = pendingUploads[documentType];
    if (!file) {
      toast({
        title: 'File required',
        description: `Choose a ${REQUIRED_DOCUMENTS_BY_TYPE[documentType].label} file before uploading.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploadingDocumentType(documentType);
      await documentsAPI.uploadFile(file, {
        documentType,
        entityType: 'Job',
        entityId: selectedJob.id,
        accessLevel: 'manager',
        isRequired: true,
        description: `${REQUIRED_DOCUMENTS_BY_TYPE[documentType].label} uploaded via job workflow.`,
      });
      await loadJobDocuments(selectedJob.id);
      setPendingUploads((prev) => ({ ...prev, [documentType]: null }));
      if (!options?.suppressSuccessToast) {
        toast({
          title: 'Document uploaded',
          description: `${REQUIRED_DOCUMENTS_BY_TYPE[documentType].label} uploaded successfully.`,
        });
      }
      return true;
    } catch (error) {
      console.error('Required document upload failed:', error);
      toast({
        title: 'Upload failed',
        description:
          error instanceof Error && error.message
            ? error.message
            : 'Unable to upload the selected document.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setUploadingDocumentType(null);
    }
  };

  const handleUploadRequiredDocument = async (documentType: RequiredDocumentType) => {
    await uploadRequiredDocument(documentType);
  };

  const handleReviewCosting = async (decision: 'approved' | 'rejected') => {
    if (!selectedJob) return;

    const trimmedNotes = partnerReviewNotes.trim();
    if (decision === 'rejected' && !trimmedNotes) {
      toast({
        title: 'Review point required',
        description: 'Add concrete review points before returning this costing package to the manager.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setPartnerReviewSaving(decision);
      await jobsAPI.reviewCosting(selectedJob.id, {
        decision,
        reviewNotes: trimmedNotes || undefined,
      });
      await Promise.all([loadJobs(), loadJobDetails(selectedJob.id)]);
      setPartnerReviewNotes('');
      toast({
        title: decision === 'approved' ? 'Costing Approved' : 'Returned to Manager',
        description:
          decision === 'approved'
            ? 'The costing package has been approved for execution readiness.'
            : 'The costing package was returned to the manager with review points.',
      });
    } catch (error) {
      console.error('Failed to review costing:', error);
      toast({
        title: 'Review failed',
        description:
          error instanceof Error && error.message
            ? error.message
            : 'Unable to review the costing package.',
        variant: 'destructive',
      });
    } finally {
      setPartnerReviewSaving(null);
    }
  };

  const buildAllocationsFromStaff = (staffAssignments: JobStaffAssignment[]): AllocationInput[] => {
    return staffAssignments.map((assignment) => ({
      employeeProfileId: assignment.employeeProfileId,
      roleId: assignment.assignedRoleId,
      employeeName: assignment.employee
        ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
        : `Employee ${assignment.employeeProfileId}`,
      roleName: assignment.role?.name || 'Role',
      allocatedHours: '',
      hourlyRate: String(assignment.assignedHourlyRate || 0),
      billable: true,
      taskDescription: '',
    }));
  };

  const initializeCosting = async (job: Job, staffAssignments: JobStaffAssignment[]) => {
    setCostingLoading(true);
    try {
      const costing: any = await jobsAPI.getCosting(job.id);
      const staffMap = new Map(
        staffAssignments.map((assignment) => [
          `${assignment.employeeProfileId}-${assignment.assignedRoleId}`,
          {
            employeeName: assignment.employee
              ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
              : `Employee ${assignment.employeeProfileId}`,
            roleName: assignment.role?.name || 'Role',
            hourlyRate: assignment.assignedHourlyRate || 0,
          },
        ])
      );

      const allocations: AllocationInput[] = (costing?.allocations || []).map((allocation: any) => {
        const key = `${allocation.employeeProfileId}-${allocation.roleId}`;
        const staffInfo = staffMap.get(key);
        return {
          employeeProfileId: allocation.employeeProfileId,
          roleId: allocation.roleId,
          employeeName: staffInfo?.employeeName || `Employee ${allocation.employeeProfileId}`,
          roleName: staffInfo?.roleName || 'Role',
          allocatedHours: String(allocation.allocatedHours ?? 0),
          hourlyRate: String(allocation.hourlyRate ?? staffInfo?.hourlyRate ?? 0),
          billable: allocation.billable ?? true,
          taskDescription: allocation.taskDescription || '',
        };
      });

      const jobFeeValue =
        job.billingType === 'fixed_fee'
          ? String(job.fixedFeeAmount || '')
          : String(costing?.jobFee ?? job.fixedFeeAmount ?? '');

      setCostingForm({
        jobFee: jobFeeValue,
        notes: costing?.notes || '',
        capEnforced: costing?.budgetCap?.capEnforced ?? true,
        allowOverage: costing?.budgetCap?.allowOverage ?? false,
        maxOveragePercent: String(costing?.budgetCap?.maxOveragePercent ?? 0.2),
        allocations: allocations.length > 0 ? allocations : buildAllocationsFromStaff(staffAssignments),
      });
    } catch (error: any) {
      if (error?.status === 404) {
        setCostingForm({
          jobFee:
            job.billingType === 'fixed_fee'
              ? String(job.fixedFeeAmount || '')
              : '',
          notes: '',
          capEnforced: true,
          allowOverage: false,
          maxOveragePercent: '0.2',
          allocations: buildAllocationsFromStaff(staffAssignments),
        });
      } else {
        toast({
          title: 'Costing Load Error',
          description: 'Unable to load job costing details.',
          variant: 'destructive',
        });
      }
    } finally {
      setCostingLoading(false);
    }
  };

  const updateAllocation = (
    employeeProfileId: number,
    roleId: number,
    field: keyof AllocationInput,
    value: string | boolean
  ) => {
    if (!costingForm) return;
    setCostingForm((prev) => {
      if (!prev) return prev;
      const allocations = prev.allocations.map((allocation) => {
        if (allocation.employeeProfileId === employeeProfileId && allocation.roleId === roleId) {
          return { ...allocation, [field]: value };
        }
        return allocation;
      });
      return { ...prev, allocations };
    });
  };

  const updateMilestoneDraft = (
    milestoneId: string,
    field: keyof Omit<MilestoneDraft, 'id'>,
    value: string
  ) => {
    setMilestoneDrafts((prev) =>
      prev.map((milestone) =>
        milestone.id === milestoneId ? { ...milestone, [field]: value } : milestone
      )
    );
  };

  const addMilestoneDraft = () => {
    setMilestoneDrafts((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}-${prev.length + 1}`,
        title: '',
        targetPercent: '',
        dueDate: '',
        requirements: '',
        assignedToProfileId: staff[0] ? String(staff[0].employeeProfileId) : '',
      },
    ]);
  };

  const removeMilestoneDraft = (milestoneId: string) => {
    setMilestoneDrafts((prev) => prev.filter((milestone) => milestone.id !== milestoneId));
  };

  const validateMilestoneDrafts = () => {
    if (milestoneDrafts.length === 0) {
      return 'Add at least one milestone before saving costing.';
    }

    const seenPercents = new Set<number>();
    let hasFinalHundred = false;
    const staffIds = new Set(staff.map((assignment) => assignment.employeeProfileId));

    for (let index = 0; index < milestoneDrafts.length; index += 1) {
      const milestone = milestoneDrafts[index];
      const title = milestone.title.trim();
      const targetPercent = Number(milestone.targetPercent);

      if (!title) {
        return `Milestone #${index + 1} needs a title.`;
      }

      if (!Number.isFinite(targetPercent) || targetPercent <= 0 || targetPercent > 100) {
        return `Milestone "${title}" needs a target percentage between 1 and 100.`;
      }

      if (seenPercents.has(targetPercent)) {
        return `Duplicate milestone percentage detected: ${targetPercent}%.`;
      }
      seenPercents.add(targetPercent);

      if (targetPercent === 100) {
        hasFinalHundred = true;
      }

      if (milestone.assignedToProfileId) {
        const ownerId = Number(milestone.assignedToProfileId);
        if (!staffIds.has(ownerId)) {
          return `Milestone "${title}" owner must be selected from assigned staff.`;
        }
      }
    }

    if (!hasFinalHundred) {
      return 'Include a 100% milestone for final payment.';
    }

    return null;
  };

  const handleSaveCosting = async () => {
    if (!selectedJob || !costingForm) return;

    const canEditCosting = isAdmin || selectedJob.managerProfileId === profile?.id;
    if (!canEditCosting) {
      toast({
        title: 'Access Restricted',
        description: 'Only the assigned manager can complete costing and milestone setup for this job.',
        variant: 'destructive',
      });
      return;
    }

    if (!costingForm.jobFee || Number(costingForm.jobFee) <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Job fee is required before saving costing.',
        variant: 'destructive',
      });
      return;
    }

    let latestDocuments = jobDocuments;
    const pendingPartnerReviewUploads = missingPartnerReviewDocuments.filter(
      (item) => pendingUploads[item.type]
    );

    if (pendingPartnerReviewUploads.length > 0) {
      for (const requirement of pendingPartnerReviewUploads) {
        const uploaded = await uploadRequiredDocument(requirement.type, {
          suppressSuccessToast: true,
        });
        if (!uploaded) {
          return;
        }
      }
      latestDocuments = await loadJobDocuments(selectedJob.id);
    }

    const remainingPartnerReviewDocuments = ['work_plan', 'budget']
      .map((type) => REQUIRED_DOCUMENTS_BY_TYPE[type as RequiredDocumentType])
      .filter(
        (requirement) =>
          !latestDocuments.some((doc) => documentMatchesRequirement(doc.documentType, requirement))
      );

    if (remainingPartnerReviewDocuments.length > 0) {
      toast({
        title: 'Required Documents Missing',
        description: `Upload ${remainingPartnerReviewDocuments
          .map((item) => item.label)
          .join(' and ')} before submitting costing for partner review.`,
        variant: 'destructive',
      });
      return;
    }

    const allocations = costingForm.allocations
      .filter((allocation) => Number(allocation.allocatedHours) > 0)
      .map((allocation) => ({
        employeeProfileId: allocation.employeeProfileId,
        roleId: allocation.roleId,
        allocatedHours: Number(allocation.allocatedHours),
        hourlyRate: Number(allocation.hourlyRate),
        billable: allocation.billable,
        taskDescription: allocation.taskDescription || undefined,
      }));

    if (allocations.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Allocate at least one staff member before saving.',
        variant: 'destructive',
      });
      return;
    }

    const milestoneValidationError = validateMilestoneDrafts();
    if (milestoneValidationError) {
      toast({
        title: 'Validation Error',
        description: milestoneValidationError,
        variant: 'destructive',
      });
      return;
    }

    try {
      setCostingSaving(true);
      const milestonePayload = milestoneDrafts
        .map((milestone) => ({
          title: milestone.title.trim(),
          targetPercent: Number(milestone.targetPercent),
          dueDate: milestone.dueDate || undefined,
          requirements: milestone.requirements.trim() || undefined,
          assignedToProfileId: milestone.assignedToProfileId
            ? Number(milestone.assignedToProfileId)
            : undefined,
        }))
        .sort((a, b) => a.targetPercent - b.targetPercent);

      await jobsAPI.upsertCosting(selectedJob.id, {
        jobFee: Number(costingForm.jobFee),
        allocations,
        notes: costingForm.notes || undefined,
        capEnforced: costingForm.capEnforced,
        allowOverage: costingForm.allowOverage,
        maxOveragePercent: Number(costingForm.maxOveragePercent),
        milestones: milestonePayload,
      });
      await loadJobDetails(selectedJob.id);
      toast({
        title: 'Costing Saved',
        description: 'Job costing, allocations, and milestones updated successfully.',
      });
    } catch (error) {
      console.error('Failed to save costing:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error && error.message
            ? error.message
            : 'Failed to save job costing.',
        variant: 'destructive',
      });
    } finally {
      setCostingSaving(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [isEmployeeExperience, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPendingUploads({});
    setUploadingDocumentType(null);
    setPartnerReviewNotes('');
  }, [selectedJob?.id]);

  useEffect(() => {
    if (!Number.isFinite(selectedJobIdParam) || selectedJobIdParam <= 0) return;
    if (selectedJob?.id === selectedJobIdParam) return;

    loadJobDetails(selectedJobIdParam);
  }, [selectedJob?.id, selectedJobIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedJob) return;
    if (jobs.some((job) => job.id === selectedJob.id)) return;

    setSelectedJob(null);
    setStaff([]);
    setInvoiceTracking(null);
    setMilestoneDrafts(buildDefaultMilestoneDrafts());
    setCostingForm(null);
    setAllocationSummary(null);
    setJobDocuments([]);
    setJobTracking(null);
  }, [jobs, selectedJob]);

  const totalAllocatedHours = costingForm
    ? costingForm.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedHours || 0), 0)
    : 0;
  const totalEstimatedCost = costingForm
    ? costingForm.allocations.reduce(
        (sum, allocation) => sum + Number(allocation.allocatedHours || 0) * Number(allocation.hourlyRate || 0),
        0
      )
    : 0;
  const remainingBudget = costingForm ? Number(costingForm.jobFee || 0) - totalEstimatedCost : 0;
  const canEditCosting = Boolean(selectedJob && (isAdmin || selectedJob.managerProfileId === profile?.id));
  const canReviewCosting = Boolean(
    selectedJob && (isAdmin || selectedJob.partnerProfileId === profile?.id)
  );
  const managerDisplayName =
    jobTracking?.ownership?.manager
      ? `${jobTracking.ownership.manager.firstName || ''} ${jobTracking.ownership.manager.lastName || ''}`.trim()
      : selectedJob?.manager
        ? `${selectedJob.manager.firstName} ${selectedJob.manager.lastName}`
        : 'Not assigned';
  const partnerDisplayName =
    jobTracking?.ownership?.partner
      ? `${jobTracking.ownership.partner.firstName || ''} ${jobTracking.ownership.partner.lastName || ''}`.trim()
      : selectedJob?.partner
        ? `${selectedJob.partner.firstName} ${selectedJob.partner.lastName}`
        : 'Not assigned';
  const costingStatus = workflowSnapshot?.manager?.costingStatus || null;
  const latestCostingReviewReason = workflowSnapshot?.manager?.latestReviewReason || null;
  const latestCostingReviewBy = workflowSnapshot?.manager?.latestReviewBy || null;
  const latestCostingReviewLabel = latestCostingReviewBy
    ? `${latestCostingReviewBy.firstName || ''} ${latestCostingReviewBy.lastName || ''}`.trim()
    : '';
  const employeeAllocatedHours = employeeTracking
    ? Number(employeeTracking.allocatedHours || 0)
    : Number(allocationSummary?.allowedEmployeeHours || 0);
  const employeeLoggedHours = employeeTracking
    ? Number(employeeTracking.loggedHours || 0)
    : Number(allocationSummary?.loggedEmployeeHours || 0);
  const employeeRemainingHours = employeeTracking
    ? Number(employeeTracking.remainingAllocatedHours || 0)
    : Number(allocationSummary?.remainingEmployeeHours || 0);
  const milestoneOwnerOptions = useMemo(
    () =>
      staff.map((assignment) => ({
        id: assignment.employeeProfileId,
        name: assignment.employee
          ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
          : `Employee ${assignment.employeeProfileId}`,
        roleName: assignment.role?.name || assignment.roleOnJob || 'Assigned staff',
      })),
    [staff]
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Jobs</h1>
            <p className="text-muted-foreground">
              {isEmployeeExperience
                ? 'Track your assigned jobs, required actions, and delivery progress.'
                : 'Monitor job progress and assignments'}
            </p>
          </div>
          <Button onClick={loadJobs} disabled={isLoading} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            {isLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Jobs ({jobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => openTrackingJob(job.id)}
                  className={`w-full text-left border rounded-lg p-3 transition-colors ${
                    selectedJob?.id === job.id ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{job.jobName}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.client?.clientName || 'Client not set'}
                      </p>
                    </div>
                    <Badge className={statusColors[job.status] || statusColors.planned}>
                      {job.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      {job.dueDate ? new Date(job.dueDate).toLocaleDateString() : 'No due date'}
                    </div>
                    <span className="inline-flex items-center gap-1 text-primary">
                      Tracking
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground truncate">
                    {job.trackingPath || `/jobs/${job.id}/tracking`}
                  </div>
                </button>
              ))}
              {!isLoading && jobs.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">
                  No jobs found.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
              <CardDescription>
                {selectedJob
                  ? isEmployeeExperience
                    ? 'Review your assigned work, due dates, and required documents.'
                    : 'Review job summary and staff assignments.'
                  : 'Select a job to view details.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trackingLoading && (
                <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing tracking data from /jobs/:jobId/tracking...
                </div>
              )}
              {selectedJob ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedJob.jobName}</h2>
                    <p className="text-muted-foreground">
                      {selectedJob.client?.clientName || 'Client not set'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Partner</p>
                      <p className="font-medium">{partnerDisplayName}</p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Manager</p>
                      <p className="font-medium">{managerDisplayName}</p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Billing</p>
                      <p className="font-medium">
                        {selectedJob.billingType === 'fixed_fee'
                          ? `KES ${Number(selectedJob.fixedFeeAmount || 0).toLocaleString()}`
                          : `${Number(selectedJob.budgetHours || 0)} hrs`}
                      </p>
                    </div>
                  </div>

                  {jobTracking && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Workflow Visibility</CardTitle>
                        <CardDescription>
                          Primary tracking source: /jobs/:jobId/tracking
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                          <div className="border rounded-lg p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">Marketing</p>
                            <p className="font-medium capitalize">
                              {workflowSnapshot?.marketing?.onboardingStatus || 'No onboarding status'}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              Engagement letter:{' '}
                              {workflowSnapshot?.marketing?.engagementLetterStatus || 'pending'}
                            </p>
                            <Badge
                              variant={
                                workflowSnapshot?.marketing?.engagementLetterDocumentUploaded
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {workflowSnapshot?.marketing?.engagementLetterDocumentUploaded
                                ? 'Document uploaded'
                                : 'Document missing'}
                            </Badge>
                          </div>
                          <div className="border rounded-lg p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">HR</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={workflowSnapshot?.hr?.jobCreated ? 'default' : 'secondary'}>
                                Job created
                              </Badge>
                              <Badge variant={workflowSnapshot?.hr?.managerAssigned ? 'default' : 'secondary'}>
                                Manager assigned
                              </Badge>
                              <Badge variant={workflowSnapshot?.hr?.partnerAssigned ? 'default' : 'secondary'}>
                                Partner assigned
                              </Badge>
                              <Badge variant={workflowSnapshot?.hr?.departmentAssigned ? 'default' : 'secondary'}>
                                Department assigned
                              </Badge>
                            </div>
                          </div>
                          <div className="border rounded-lg p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">Manager</p>
                            <p className="font-medium">
                              Team: {trackingSnapshot?.staffing?.headcount ?? workflowSnapshot?.manager?.staffCount ?? 0}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Costing:{' '}
                              <span className="capitalize">
                                {workflowSnapshot?.manager?.costingStatus || 'not started'}
                              </span>
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={workflowSnapshot?.manager?.teamAssigned ? 'default' : 'secondary'}>
                                Team assigned
                              </Badge>
                              <Badge
                                variant={workflowSnapshot?.manager?.costingCompleted ? 'default' : 'secondary'}
                              >
                                Costing complete
                              </Badge>
                            </div>
                          </div>
                          <div className="border rounded-lg p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">Execution</p>
                            <Badge className={statusColors[selectedWorkflowStatus] || statusColors.planned}>
                              {formatStatusLabel(selectedWorkflowStatus)}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              Tasks incomplete: {trackingSnapshot?.tasks?.incomplete ?? 0}
                            </p>
                            {executionSnapshot?.isOverdue && (
                              <p className="text-xs font-medium text-red-600">
                                Overdue by {executionSnapshot.overdueDays} day(s)
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Hours Worked</p>
                            <p className="text-lg font-semibold">
                              {Number(trackingSnapshot?.timesheets?.totalHoursWorked || 0).toFixed(1)}h
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Approved {Number(trackingSnapshot?.timesheets?.approvedHoursWorked || 0).toFixed(1)}h
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Billable Split</p>
                            <p className="text-lg font-semibold">
                              {Number(trackingSnapshot?.timesheets?.totalBillableHours || 0).toFixed(1)}h
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Non-billable {Number(trackingSnapshot?.timesheets?.totalNonBillableHours || 0).toFixed(1)}h
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Profitability</p>
                            <p className="text-lg font-semibold">
                              {formatCurrency(Number(trackingSnapshot?.financials?.profitToDate || 0))}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Margin {formatPercent(Number(trackingSnapshot?.financials?.marginPercent || 0))}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Collections</p>
                            <p className="text-lg font-semibold">
                              {formatPercent(Number(trackingSnapshot?.collections?.collectionPercent || 0))}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Outstanding {formatCurrency(Number(trackingSnapshot?.collections?.outstandingAmount || 0))}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {!isEmployeeExperience && jobTracking && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Status Workflow Actions</CardTitle>
                        <CardDescription>
                          Status updates follow backend workflow guards and blocker checks.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {availableStatusTransitions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No status transitions available from {formatStatusLabel(selectedWorkflowStatus)}.
                          </p>
                        ) : (
                          availableStatusTransitions.map((nextStatus) => {
                            const blockers = resolveTransitionBlockers(nextStatus);
                            const hasBlockers = blockers.length > 0;
                            return (
                              <div
                                key={nextStatus}
                                className="border rounded-lg p-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    <span className="capitalize">{formatStatusLabel(selectedWorkflowStatus)}</span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                    <span className="capitalize">{formatStatusLabel(nextStatus)}</span>
                                  </div>
                                  {hasBlockers ? (
                                    <div className="space-y-1">
                                      {blockers.map((blocker, index) => (
                                        <p key={`${nextStatus}-blocker-${index}`} className="text-xs text-red-600">
                                          {blocker}
                                        </p>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      Ready for transition.
                                    </p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => moveJobToStatus(nextStatus)}
                                  disabled={Boolean(statusUpdating) || hasBlockers}
                                >
                                  {statusUpdating === nextStatus ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Updating...
                                    </>
                                  ) : (
                                    `Move to ${formatStatusLabel(nextStatus)}`
                                  )}
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {jobTracking && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Status Timeline</CardTitle>
                        <CardDescription>
                          Audit trail of lifecycle transitions on this job.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {jobTracking.statusTimeline.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No status transitions recorded yet.
                          </p>
                        ) : (
                          jobTracking.statusTimeline.map((transition) => (
                            <div
                              key={transition.id}
                              className="border rounded-lg p-3 flex flex-col gap-1"
                            >
                              <p className="text-sm font-medium">
                                {transition.fromStatus
                                  ? `${formatStatusLabel(String(transition.fromStatus))} -> ${formatStatusLabel(String(transition.toStatus || ''))}`
                                  : `Set to ${formatStatusLabel(String(transition.toStatus || ''))}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {transition.createdAt
                                  ? new Date(transition.createdAt).toLocaleString()
                                  : 'Unknown timestamp'}
                              </p>
                              {transition.reason && (
                                <p className="text-xs text-muted-foreground">Reason: {transition.reason}</p>
                              )}
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {isEmployeeExperience && (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle>Your Job Performance</CardTitle>
                          <CardDescription>
                            Track your utilization, assigned role, and remaining time budget.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Assigned Role</p>
                            <p className="font-medium">
                              {employeeTracking?.assignedRole || employeeAssignment?.role?.name || 'Not set'}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Allocated (You)</p>
                            <p className="font-semibold">
                              {employeeTracking || allocationSummary
                                ? `${employeeAllocatedHours.toFixed(1)}h`
                                : '-'}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Logged (You)</p>
                            <p className="font-semibold">
                              {employeeTracking || allocationSummary
                                ? `${employeeLoggedHours.toFixed(1)}h`
                                : '-'}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Billable / Non-billable</p>
                            <p className="font-semibold">
                              {employeeTracking
                                ? `${Number(employeeTracking.billableHours || 0).toFixed(1)}h / ${Number(
                                    employeeTracking.nonBillableHours || 0
                                  ).toFixed(1)}h`
                                : '-'}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Utilization</p>
                            <p className="font-semibold">{employeeUtilizationPercent}%</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {employeeTracking || allocationSummary
                                ? `${employeeRemainingHours.toFixed(1)}h remaining`
                                : 'No allocation summary'}
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Timeline Tracking</CardTitle>
                          <CardDescription>
                            Follow job timeline progress and stay ahead of delivery deadlines.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Start Date</p>
                              <p className="font-medium">
                                {jobTimeline?.startDate
                                  ? jobTimeline.startDate.toLocaleDateString()
                                  : 'Not set'}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Due Date</p>
                              <p className="font-medium">
                                {jobTimeline?.dueDate ? jobTimeline.dueDate.toLocaleDateString() : 'Not set'}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Timeline Progress</p>
                              <p className="font-semibold">
                                {jobTimeline?.progressPercent !== null && jobTimeline?.progressPercent !== undefined
                                  ? `${jobTimeline.progressPercent}%`
                                  : 'N/A'}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Status</p>
                              <p
                                className={`font-semibold ${
                                  jobTimeline?.isOverdue ? 'text-red-600' : 'text-green-700'
                                }`}
                              >
                                {jobTimeline?.isOverdue
                                  ? `Overdue by ${jobTimeline.overdueDays} day(s)`
                                  : jobTimeline?.remainingDays !== null &&
                                      jobTimeline?.remainingDays !== undefined
                                    ? `${Math.max(0, jobTimeline.remainingDays)} day(s) remaining`
                                    : 'On track'}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Required Actions</CardTitle>
                          <CardDescription>
                            Complete these actions to keep your assigned job moving.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {requiredActions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No urgent actions right now. Keep logging progress and documents.
                            </p>
                          ) : (
                            requiredActions.map((action) => (
                              <div key={action.key} className="border rounded-lg p-3 flex items-start justify-between gap-4">
                                <div>
                                  <p className="font-medium">{action.title}</p>
                                  <p className="text-sm text-muted-foreground">{action.description}</p>
                                </div>
                                {action.path && action.ctaLabel ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => navigate(action.path || '/job-workflow-dashboard')}
                                  >
                                    {action.ctaLabel}
                                  </Button>
                                ) : null}
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}

                  {!isEmployeeExperience && trackingSnapshot && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Team Delivery Tracking</CardTitle>
                        <CardDescription>
                          Per-employee hours, utilization, and profitability from tracking metrics.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {trackingSnapshot.staffing.employees.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No team members are assigned to this job yet.
                          </p>
                        ) : (
                          trackingSnapshot.staffing.employees.map((employee) => (
                            <div
                              key={employee.profileId}
                              className="border rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3"
                            >
                              <div>
                                <p className="font-medium">{employee.employeeName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {employee.assignedRole || employee.positionTitle || 'Team member'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Allocated</p>
                                <p className="font-semibold">{Number(employee.allocatedHours || 0).toFixed(1)}h</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Logged</p>
                                <p className="font-semibold">{Number(employee.loggedHours || 0).toFixed(1)}h</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Billable</p>
                                <p className="font-semibold">{Number(employee.billableHours || 0).toFixed(1)}h</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Utilization</p>
                                <p className="font-semibold">{formatPercent(Number(employee.utilizationPercent || 0))}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Profit/Loss</p>
                                <p className="font-semibold">
                                  {formatCurrency(
                                    Number(employee.billableAmount || 0) - Number(employee.costAmount || 0)
                                  )}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {!isEmployeeExperience && (
                    <Card>
                    <CardHeader>
                      <CardTitle>Invoice Milestone Tracker</CardTitle>
                      <CardDescription>
                        Billing checkpoints are unlocked when the matching milestone condition is completed.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!invoiceTracking ? (
                        <p className="text-sm text-muted-foreground">
                          No milestone billing data available.
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Total Fee</p>
                              <p className="font-semibold">
                                KES {Number(invoiceTracking.feeAmount || 0).toLocaleString()}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Collected</p>
                              <p className="font-semibold">
                                KES {Number(invoiceTracking.collectedAmount || 0).toLocaleString()}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Outstanding</p>
                              <p className="font-semibold">
                                KES {Number(invoiceTracking.outstandingAmount || 0).toLocaleString()}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Next Invoice</p>
                              <p className="font-semibold">
                                {invoiceTracking.nextReadyMilestone
                                  ? `${invoiceTracking.nextReadyMilestone.targetPercent}%`
                                  : 'No ready milestone'}
                              </p>
                            </div>
                          </div>

                          {invoiceTracking.milestones.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              The assigned manager has not configured payment milestones yet.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {invoiceTracking.milestones.map((milestone) => {
                                const invoiceBadge = getInvoiceStatusBadge(milestone);
                                return (
                                  <div
                                    key={milestone.taskId}
                                    className="border rounded-lg p-3 space-y-3"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="font-medium">
                                          {milestone.targetPercent}% - {milestone.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {milestone.dueDate
                                            ? `Due ${new Date(milestone.dueDate).toLocaleDateString()}`
                                            : 'No due date'}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <Badge className={getConditionStatusBadgeClass(milestone.conditionStatus)}>
                                          {formatConditionStatus(milestone.conditionStatus)}
                                        </Badge>
                                        <Badge className={invoiceBadge.className}>
                                          {invoiceBadge.label}
                                        </Badge>
                                      </div>
                                    </div>

                                    {milestone.requirements && (
                                      <p className="text-sm text-muted-foreground">
                                        Requirement: {milestone.requirements}
                                      </p>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                                      <div>
                                        <span className="text-muted-foreground">Milestone Amount:</span>{' '}
                                        KES {Number(milestone.milestoneAmount || 0).toLocaleString()}
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Cumulative Target:</span>{' '}
                                        KES {Number(milestone.expectedCumulativeAmount || 0).toLocaleString()}
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Remaining:</span>{' '}
                                        KES {Number(milestone.amountRemainingToMilestone || 0).toLocaleString()}
                                      </div>
                                    </div>

                                    {!milestone.conditionCompleted && (
                                      <div className="flex justify-end">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleMarkMilestoneComplete(milestone.taskId)}
                                          disabled={milestoneUpdatingId === milestone.taskId}
                                        >
                                          {milestoneUpdatingId === milestone.taskId ? (
                                            <>
                                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                              Updating...
                                            </>
                                          ) : (
                                            'Mark Condition Done'
                                          )}
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Job Documents
                      </CardTitle>
                      <CardDescription>
                        {canEditCosting
                          ? 'Upload the work plan and budget for partner review, then keep all job-linked documents in one place.'
                          : 'Work plan, budget, draft report, final report, and all job-linked uploads.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {canEditCosting && latestCostingReviewReason && costingStatus === 'rejected' && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                          <p className="font-medium text-red-800">Partner review point</p>
                          <p className="mt-1 text-red-700">{latestCostingReviewReason}</p>
                          {workflowSnapshot?.manager?.latestReviewAt && (
                            <p className="mt-2 text-xs text-red-700/80">
                              Returned on {new Date(workflowSnapshot.manager.latestReviewAt).toLocaleString()}
                              {latestCostingReviewLabel ? ` by ${latestCostingReviewLabel}` : ''}.
                            </p>
                          )}
                        </div>
                      )}

                      {canEditCosting && requiredDocumentChecklist.length > 0 && (
                        <div className="space-y-3 border rounded-lg p-3 mb-4">
                          <p className="text-sm font-medium">Required Documents</p>
                          {requiredDocumentChecklist.map((requirement) => {
                            const uploadKey = requirement.type;
                            const selectedFile = pendingUploads[uploadKey];
                            return (
                              <div
                                key={requirement.type}
                                className="border rounded-md p-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between"
                              >
                                <div>
                                  <p className="font-medium">{requirement.label}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {requirement.uploaded
                                      ? `Uploaded (${requirement.matchingDocuments.length} file${
                                          requirement.matchingDocuments.length === 1 ? '' : 's'
                                        })`
                                      : selectedFile
                                        ? `Selected: ${selectedFile.name} (will upload when you click Upload or save costing)`
                                      : 'Missing'}
                                  </p>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                  <Input
                                    type="file"
                                    onChange={(event) =>
                                      handleRequiredDocumentFileChange(
                                        requirement.type,
                                        event.target.files?.[0] || null
                                      )
                                    }
                                    className="sm:w-64"
                                  />
                                  <Button
                                    size="sm"
                                    variant={requirement.uploaded ? 'outline' : 'default'}
                                    onClick={() => handleUploadRequiredDocument(requirement.type)}
                                    disabled={
                                      !selectedFile || uploadingDocumentType === requirement.type
                                    }
                                  >
                                    {uploadingDocumentType === requirement.type ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Uploading...
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="h-4 w-4 mr-2" />
                                        {requirement.uploaded ? 'Replace' : 'Upload'}
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {documentsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading job documents...
                        </div>
                      ) : jobDocuments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No documents uploaded for this job yet.
                        </p>
                      ) : (
                        jobDocuments.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between border-b pb-2 last:border-0 gap-3"
                            >
                            <div className="min-w-0">
                              <p className="font-medium truncate">{doc.fileName}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDocumentType(doc.documentType)}
                                {doc.createdAt
                                  ? ` | ${new Date(doc.createdAt).toLocaleDateString()}`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={getVerificationBadgeClass(doc.verificationStatus)}>
                                {doc.verificationStatus || 'pending'}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPreviewDocument(doc)}
                              >
                                Preview
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {!isEmployeeExperience && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Partner Review Package</CardTitle>
                        <CardDescription>
                          The assigned partner reviews the costing, work plan, and budget before the team can start work.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-lg border p-4 space-y-2">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Current costing status</p>
                              <Badge className={getCostingStatusBadgeClass(costingStatus)}>
                                {formatStatusLabel(costingStatus || 'draft')}
                              </Badge>
                            </div>
                            {workflowSnapshot?.manager?.submittedAt && (
                              <p className="text-xs text-muted-foreground">
                                Submitted {new Date(workflowSnapshot.manager.submittedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                          {costingStatus === 'approved' && workflowSnapshot?.manager?.approvedAt && (
                            <p className="text-sm text-green-700">
                              Approved on {new Date(workflowSnapshot.manager.approvedAt).toLocaleString()}.
                            </p>
                          )}
                          {latestCostingReviewReason && costingStatus === 'rejected' && (
                            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                              <p className="font-medium">Latest partner review point</p>
                              <p className="mt-1">{latestCostingReviewReason}</p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <p className="text-sm font-medium">Required documents for partner review</p>
                          {partnerReviewDocumentChecklist.map((requirement) => (
                            <div
                              key={`partner-review-${requirement.type}`}
                              className="rounded-lg border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">{requirement.label}</p>
                                {requirement.latestDocument ? (
                                  <p className="text-xs text-muted-foreground truncate">
                                    Latest upload: {requirement.latestDocument.fileName}
                                  </p>
                                ) : (
                                  <p className="text-xs text-red-600">Missing</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  className={
                                    requirement.latestDocument ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }
                                >
                                  {requirement.latestDocument ? 'Uploaded' : 'Missing'}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    requirement.latestDocument && setPreviewDocument(requirement.latestDocument)
                                  }
                                  disabled={!requirement.latestDocument}
                                >
                                  Preview
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {canReviewCosting ? (
                          <div className="space-y-3 rounded-lg border border-dashed p-4">
                            <div>
                              <p className="font-medium">Partner decision</p>
                              <p className="text-sm text-muted-foreground">
                                Approve when the costing, work plan, and budget are acceptable. Otherwise return the package with clear review points.
                              </p>
                            </div>
                            <Textarea
                              rows={3}
                              value={partnerReviewNotes}
                              onChange={(event) => setPartnerReviewNotes(event.target.value)}
                              placeholder="Add review points if you are returning this to the manager."
                              disabled={Boolean(partnerReviewSaving) || costingStatus !== 'submitted'}
                            />
                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                              <Button
                                variant="outline"
                                onClick={() => handleReviewCosting('rejected')}
                                disabled={
                                  Boolean(partnerReviewSaving) ||
                                  costingStatus !== 'submitted'
                                }
                              >
                                {partnerReviewSaving === 'rejected' ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Returning...
                                  </>
                                ) : (
                                  'Return to Manager'
                                )}
                              </Button>
                              <Button
                                onClick={() => handleReviewCosting('approved')}
                                disabled={
                                  Boolean(partnerReviewSaving) ||
                                  costingStatus !== 'submitted' ||
                                  missingPartnerReviewDocuments.length > 0
                                }
                              >
                                {partnerReviewSaving === 'approved' ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Approving...
                                  </>
                                ) : (
                                  'Approve Costing Package'
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            {costingStatus === 'submitted'
                              ? `${partnerDisplayName} is reviewing this package before execution can begin.`
                              : 'The assigned partner reviews this package after the manager submits costing and the required documents.'}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {!isEmployeeExperience && (
                    <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Staff Assignments
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {staff.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No staff assigned.</p>
                      ) : (
                        staff.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="flex items-center justify-between border-b pb-2 last:border-0"
                          >
                            <div>
                              <p className="font-medium">
                                {assignment.employee
                                  ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
                                  : 'Employee'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {assignment.role?.name || 'Role not set'}
                              </p>
                            </div>
                            <div className="text-sm font-medium">
                              KES {Number(assignment.assignedHourlyRate || 0).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                    </Card>
                  )}

                  {!isEmployeeExperience && (
                    <Card>
                    <CardHeader>
                      <CardTitle>Project Evaluations</CardTitle>
                      <CardDescription>Submit job-based reviews for assigned staff.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Open the evaluation form for this job and record team performance.
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/project-evaluations?jobId=${selectedJob.id}`)}
                      >
                        Evaluate Job
                      </Button>
                    </CardContent>
                    </Card>
                  )}

                  {!isEmployeeExperience && (
                    <Card>
                    <CardHeader>
                      <CardTitle>Job Costing, Allocations & Milestones</CardTitle>
                      <CardDescription>
                        {canEditCosting
                          ? 'The assigned manager completes costing, milestones, and the partner-review package before time logging begins.'
                          : 'HR stops at staffing. The assigned manager completes costing and submits the work plan and budget for partner approval.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {costingLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading costing details...
                        </div>
                      ) : !costingForm ? (
                        <p className="text-sm text-muted-foreground">Select a job to begin costing.</p>
                      ) : staff.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Assign staff before entering job costing.
                        </p>
                      ) : (
                        <div className="space-y-5">
                          {!canEditCosting && (
                            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                              <p className="font-medium text-foreground">Manager-owned step</p>
                              <p className="mt-2">
                                {managerDisplayName} must complete costing, upload the work plan and budget, and submit the package before employees can start working on this job.
                              </p>
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="jobFee">Job Fee *</Label>
                              <Input
                                id="jobFee"
                                type="number"
                                min="0"
                                value={costingForm.jobFee}
                                onChange={(event) =>
                                  setCostingForm((prev) =>
                                    prev ? { ...prev, jobFee: event.target.value } : prev
                                  )
                                }
                                disabled={!canEditCosting || isFixedFeeJob}
                              />
                              {isFixedFeeJob && (
                                <p className="text-xs text-muted-foreground">
                                  Job fee is locked to the approved engagement letter.
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label>Allocation Summary</Label>
                              <div className="rounded-lg border p-3 text-sm space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Allowed (Job)</span>
                                  <span className="font-medium">
                                    {allocationSummary
                                      ? `${allocationSummary.allowedJobHours.toFixed(1)}h`
                                      : '-'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Logged</span>
                                  <span className="font-medium">
                                    {allocationSummary
                                      ? `${allocationSummary.loggedJobHours.toFixed(1)}h`
                                      : '-'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Remaining</span>
                                  <span
                                    className={
                                      allocationSummary && allocationSummary.remainingJobHours <= 0
                                        ? 'font-medium text-red-600'
                                        : 'font-medium text-green-600'
                                    }
                                  >
                                    {allocationSummary
                                      ? `${allocationSummary.remainingJobHours.toFixed(1)}h`
                                      : '-'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="maxOveragePercent">Max Overage %</Label>
                              <Input
                                id="maxOveragePercent"
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                value={costingForm.maxOveragePercent}
                                onChange={(event) =>
                                  setCostingForm((prev) =>
                                    prev ? { ...prev, maxOveragePercent: event.target.value } : prev
                                  )
                                }
                                disabled={!canEditCosting}
                              />
                            </div>
                            <div className="flex flex-col gap-3 pt-2">
                              <div className="flex items-center justify-between">
                                <Label>Enforce Cap</Label>
                                <Switch
                                  checked={costingForm.capEnforced}
                                  onCheckedChange={(checked) =>
                                    setCostingForm((prev) =>
                                      prev ? { ...prev, capEnforced: checked } : prev
                                    )
                                  }
                                  disabled={!canEditCosting}
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <Label>Allow Overage</Label>
                                <Switch
                                  checked={costingForm.allowOverage}
                                  onCheckedChange={(checked) =>
                                    setCostingForm((prev) =>
                                      prev ? { ...prev, allowOverage: checked } : prev
                                    )
                                  }
                                  disabled={!canEditCosting}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {costingForm.allocations.map((allocation) => (
                              <div
                                key={`${allocation.employeeProfileId}-${allocation.roleId}`}
                                className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_120px] gap-3 items-start border rounded-lg p-3"
                              >
                                <div>
                                  <p className="font-medium">{allocation.employeeName}</p>
                                  <p className="text-xs text-muted-foreground">{allocation.roleName}</p>
                                  <Textarea
                                    value={allocation.taskDescription}
                                    onChange={(event) =>
                                      updateAllocation(
                                        allocation.employeeProfileId,
                                        allocation.roleId,
                                        'taskDescription',
                                        event.target.value
                                      )
                                    }
                                    placeholder="Task focus"
                                    rows={2}
                                    className="mt-2"
                                    disabled={!canEditCosting}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Hours</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.25"
                                    value={allocation.allocatedHours}
                                    onChange={(event) =>
                                      updateAllocation(
                                        allocation.employeeProfileId,
                                        allocation.roleId,
                                        'allocatedHours',
                                        event.target.value
                                      )
                                    }
                                    disabled={!canEditCosting}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Rate</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={allocation.hourlyRate}
                                    onChange={(event) =>
                                      updateAllocation(
                                        allocation.employeeProfileId,
                                        allocation.roleId,
                                        'hourlyRate',
                                        event.target.value
                                      )
                                    }
                                    disabled={!canEditCosting}
                                  />
                                </div>
                                <div className="flex flex-col gap-2 pt-6">
                                  <Label>Billable</Label>
                                  <Switch
                                    checked={allocation.billable}
                                    onCheckedChange={(checked) =>
                                      updateAllocation(
                                        allocation.employeeProfileId,
                                        allocation.roleId,
                                        'billable',
                                        checked
                                      )
                                    }
                                    disabled={!canEditCosting}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Flag className="h-4 w-4 text-primary" />
                                  <p className="font-medium">Invoice Milestones</p>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Define billing checkpoints and assign a responsible team member for each milestone.
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addMilestoneDraft}
                                disabled={!canEditCosting}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Add Milestone
                              </Button>
                            </div>

                            {milestoneDrafts.map((milestone, index) => (
                              <div key={milestone.id} className="rounded-lg border p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium text-sm">Milestone {index + 1}</p>
                                  {milestoneDrafts.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => removeMilestoneDraft(milestone.id)}
                                      disabled={!canEditCosting}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Remove
                                    </Button>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div className="space-y-2 md:col-span-2">
                                    <Label>Milestone Title *</Label>
                                    <Input
                                      value={milestone.title}
                                      onChange={(event) =>
                                        updateMilestoneDraft(milestone.id, 'title', event.target.value)
                                      }
                                      placeholder="e.g. Draft report submitted"
                                      disabled={!canEditCosting}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Payment % *</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      max="100"
                                      value={milestone.targetPercent}
                                      onChange={(event) =>
                                        updateMilestoneDraft(
                                          milestone.id,
                                          'targetPercent',
                                          event.target.value
                                        )
                                      }
                                      placeholder="25"
                                      disabled={!canEditCosting}
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-2">
                                    <Label>Due Date (optional)</Label>
                                    <Input
                                      type="date"
                                      value={milestone.dueDate}
                                      onChange={(event) =>
                                        updateMilestoneDraft(milestone.id, 'dueDate', event.target.value)
                                      }
                                      disabled={!canEditCosting}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Milestone Owner</Label>
                                    <Select
                                      value={milestone.assignedToProfileId || 'unassigned'}
                                      onValueChange={(value) =>
                                        updateMilestoneDraft(
                                          milestone.id,
                                          'assignedToProfileId',
                                          value === 'unassigned' ? '' : value
                                        )
                                      }
                                      disabled={!canEditCosting}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select assigned staff" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {milestoneOwnerOptions.map((option) => (
                                          <SelectItem key={option.id} value={String(option.id)}>
                                            {option.name} - {option.roleName}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>Condition / Requirement</Label>
                                  <Textarea
                                    rows={2}
                                    value={milestone.requirements}
                                    onChange={(event) =>
                                      updateMilestoneDraft(
                                        milestone.id,
                                        'requirements',
                                        event.target.value
                                      )
                                    }
                                    placeholder="List what must be completed or uploaded before invoicing this milestone."
                                    disabled={!canEditCosting}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Total Hours</p>
                              <p className="text-lg font-semibold">{totalAllocatedHours.toFixed(2)}h</p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Estimated Cost</p>
                              <p className="text-lg font-semibold">
                                KES {totalEstimatedCost.toLocaleString()}
                              </p>
                            </div>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs text-muted-foreground">Remaining Fee</p>
                              <p className={`text-lg font-semibold ${remainingBudget < 0 ? 'text-red-600' : ''}`}>
                                KES {remainingBudget.toLocaleString()}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="costingNotes">Notes</Label>
                            <Textarea
                              id="costingNotes"
                              value={costingForm.notes}
                              onChange={(event) =>
                                setCostingForm((prev) =>
                                  prev ? { ...prev, notes: event.target.value } : prev
                                )
                              }
                              rows={3}
                              placeholder="Manager notes for this costing"
                              disabled={!canEditCosting}
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button onClick={handleSaveCosting} disabled={costingSaving || !canEditCosting}>
                              {costingSaving ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                costingStatus === 'rejected'
                                  ? 'Resubmit for Partner Review'
                                  : 'Save & Submit for Partner Review'
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-10">
                  Select a job from the list to view details.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <DocumentPreviewDialog
          open={Boolean(previewDocument)}
          onOpenChange={(open) => {
            if (!open) setPreviewDocument(null);
          }}
          title={previewDocument?.fileName || 'Job Document'}
          filePath={previewDocument?.filePath}
          fileName={previewDocument?.fileName}
          mimeType={previewDocument?.mimeType}
          description={previewDocument?.description || 'Preview the job document and download it if needed.'}
        />
      </div>
    </DashboardLayout>
  );
}
