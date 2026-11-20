import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import JobOperationsOverview from '@/components/jobs/JobOperationsOverview';
import DocumentPreviewDialog from '@/components/DocumentPreviewDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { documentsAPI, employeesAPI, jobsAPI, timeEntriesAPI } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/api/documents';
import { ApiError } from '@/lib/api/client';
import { scopeJobsForViewer } from '@/lib/jobs/scope';
import type {
  Job,
  JobStaffAssignment,
  JobInvoiceMilestoneTracking,
  JobInvoiceMilestoneTrackingItem,
  JobWorkflowTrackingResponse,
} from '@/lib/api/types';
import type { JobWorkingDocumentLink } from '@/lib/api/jobs';
import {
  ArrowLeft,
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
  Link2,
  CheckCircle2,
  XCircle,
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
  on_hold: ['in_progress', 'completed', 'cancelled'],
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
  entityType?: string;
  entityId?: number;
  accessLevel?: string;
  mimeType?: string;
  verificationStatus?: string;
  rejectionReason?: string;
  description?: string;
  createdAt?: string;
  uploader?: {
    id: number;
    firstName: string;
    lastName: string;
  };
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
  planned: [],
  in_progress: [],
  on_hold: [],
  completed: ['draft_report', 'final_report'],
};

const MILESTONE_DOCUMENT_TYPE_OPTIONS = [
  'deliverable',
  'work_paper',
  'draft_report',
  'final_report',
  'audit_report',
  'management_letter',
  'supporting_document',
  'other',
] as const satisfies ReadonlyArray<(typeof DOCUMENT_TYPES.job)[number]>;

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
  const { profile, isEmployee, isAdmin, isHR, isGMP, isPartner, isManager, isFinance } = useAuth();
  const navigate = useNavigate();
  const { jobId: routeJobId } = useParams<{ jobId?: string }>();
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<JobStaffAssignment[]>([]);
  const [availableStaff, setAvailableStaff] = useState<any[]>([]);
  const [assignmentDraft, setAssignmentDraft] = useState({
    employeeProfileId: '',
    assignedHourlyRate: '',
    billableAllocatedHours: '',
    nonBillableAllocatedHours: '',
  });
  const [assignmentBudgetDrafts, setAssignmentBudgetDrafts] = useState<
    Record<number, { billable: string; nonBillable: string }>
  >({});
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [workingLinks, setWorkingLinks] = useState<JobWorkingDocumentLink[]>([]);
  const [linkDraft, setLinkDraft] = useState({
    linkType: 'milestone_requirement',
    label: '',
    url: '',
    milestoneTaskId: '',
    notes: '',
  });
  const [linkBusy, setLinkBusy] = useState(false);
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
  const [milestoneDocuments, setMilestoneDocuments] = useState<Record<number, JobDocument[]>>({});
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<JobDocument | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Record<string, File | null>>({});
  const [pendingMilestoneUploads, setPendingMilestoneUploads] = useState<Record<number, File | null>>(
    {}
  );
  const [pendingMilestoneDocumentTypes, setPendingMilestoneDocumentTypes] = useState<
    Record<number, string>
  >({});
  const [uploadingDocumentType, setUploadingDocumentType] = useState<RequiredDocumentType | null>(null);
  const [uploadingMilestoneTaskId, setUploadingMilestoneTaskId] = useState<number | null>(null);
  const [milestoneUpdatingId, setMilestoneUpdatingId] = useState<number | null>(null);
  const [invoiceDraftingMilestoneId, setInvoiceDraftingMilestoneId] = useState<number | null>(null);
  const [issuingInvoiceId, setIssuingInvoiceId] = useState<number | null>(null);
  const [partnerReviewNotes, setPartnerReviewNotes] = useState('');
  const [partnerReviewSaving, setPartnerReviewSaving] = useState<'approved' | 'rejected' | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const isEmployeeExperience =
    isEmployee && !isAdmin && !isHR && !isGMP && !isPartner && !isManager;
  const isFixedFeeJob = selectedJob?.billingType === 'fixed_fee';
  const isTrackingDetailView = Boolean(routeJobId);
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

  const fetchMilestoneDocuments = async (milestoneTaskId: number) => {
    const response = await documentsAPI.list({
      entityType: 'JobInvoiceMilestone',
      entityId: milestoneTaskId,
      pageSize: 100,
    });
    return sortDocumentsNewestFirst(parseDocumentsResponse(response));
  };

  const loadMilestoneDocuments = async (milestones: JobInvoiceMilestoneTrackingItem[]) => {
    if (!milestones.length) {
      setMilestoneDocuments({});
      return {};
    }

    const results = await Promise.allSettled(
      milestones.map(async (milestone) => ({
        taskId: milestone.taskId,
        documents: await fetchMilestoneDocuments(milestone.taskId),
      }))
    );

    const grouped: Record<number, JobDocument[]> = {};
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      grouped[result.value.taskId] = result.value.documents;
    }
    setMilestoneDocuments(grouped);
    return grouped;
  };

  const loadJobs = async () => {
    try {
      setIsLoading(true);
      const response = await jobsAPI.list({ pageSize: 100 });
      const allJobs = response.data || [];
      const scopedJobs = scopeJobsForViewer(allJobs, {
        profileId: profile?.id,
        isAdmin,
        isHR,
        isGMP,
        isFinance,
        isManager,
        isPartner,
        isEmployee,
      });
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
    setMilestoneDocuments({});
    setPendingMilestoneUploads({});
    setPendingMilestoneDocumentTypes({});
    setAllocationSummary(null);
    setJobTracking(null);
  };

  const loadJobDetails = async (jobId: number) => {
    try {
      setTrackingLoading(true);
      const job = await jobsAPI.getById(jobId);
      const [staffAssignments, tracking, invoiceMilestones, links] = await Promise.all([
        jobsAPI.getStaff(jobId),
        jobsAPI.getTracking(jobId),
        jobsAPI.getInvoiceMilestones(jobId),
        jobsAPI.getWorkingLinks(jobId),
      ]);
      setSelectedJob(job);
      setStaff(staffAssignments);
      setWorkingLinks(links);
      setAssignmentBudgetDrafts(
        Object.fromEntries(
          staffAssignments.map((assignment) => [
            assignment.id,
            {
              billable: String(assignment.billableAllocatedHours || 0),
              nonBillable: String(assignment.nonBillableAllocatedHours || 0),
            },
          ])
        )
      );
      setJobTracking(tracking);
      setPendingMilestoneUploads({});
      setPendingMilestoneDocumentTypes({});
      setInvoiceTracking(invoiceMilestones);
      setMilestoneDrafts(mapTrackingMilestonesToDrafts(invoiceMilestones));
      await Promise.all([
        loadAllocationSummary(jobId),
        loadJobDocuments(jobId),
        loadMilestoneDocuments(invoiceMilestones.milestones || []),
      ]);

      if (isEmployeeExperience) {
        setCostingForm(null);
      } else {
        await initializeCosting(job, staffAssignments);
      }
    } catch (error) {
      console.error('Failed to load job details:', error);
      resetJobDetailState();

      if (error instanceof ApiError && error.status === 404) {
        navigate('/job-workflow-dashboard', { replace: true });
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
      await loadJobDetails(selectedJob.id);
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

  const handleCreateInvoiceDraft = async (milestoneTaskId: number) => {
    if (!selectedJob) return;

    try {
      setInvoiceDraftingMilestoneId(milestoneTaskId);
      await jobsAPI.createInvoiceDraft(selectedJob.id, milestoneTaskId);
      toast({
        title: 'Invoice draft ready',
        description: 'A draft invoice has been generated for this billing milestone.',
      });
      await loadJobDetails(selectedJob.id);
    } catch (error: any) {
      toast({
        title: 'Invoice draft failed',
        description: error?.message || 'Unable to prepare the invoice draft for this milestone.',
        variant: 'destructive',
      });
    } finally {
      setInvoiceDraftingMilestoneId(null);
    }
  };

  const handleIssueInvoice = async (invoiceId: number) => {
    if (!selectedJob) return;

    try {
      setIssuingInvoiceId(invoiceId);
      await jobsAPI.issueInvoice(selectedJob.id, invoiceId);
      toast({
        title: 'Invoice issued',
        description: 'The invoice has been issued and the document has been generated.',
      });
      await loadJobDetails(selectedJob.id);
    } catch (error: any) {
      toast({
        title: 'Issue failed',
        description: error?.message || 'Unable to issue this invoice.',
        variant: 'destructive',
      });
    } finally {
      setIssuingInvoiceId(null);
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

  const missingPartnerReviewLinks = useMemo(
    () =>
      (['work_plan', 'budget'] as const).filter(
        (type) =>
          !workingLinks.some(
            (link) => link.linkType === type && link.reviewStatus !== 'rejected'
          )
      ),
    [workingLinks]
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

  const handleMilestoneDocumentFileChange = (milestoneTaskId: number, file: File | null) => {
    setPendingMilestoneUploads((prev) => ({ ...prev, [milestoneTaskId]: file }));
  };

  const handleMilestoneDocumentTypeChange = (milestoneTaskId: number, documentType: string) => {
    setPendingMilestoneDocumentTypes((prev) => ({ ...prev, [milestoneTaskId]: documentType }));
  };

  const uploadMilestoneDocument = async (milestone: JobInvoiceMilestoneTrackingItem) => {
    if (!selectedJob) return;

    const file = pendingMilestoneUploads[milestone.taskId];
    const documentType = pendingMilestoneDocumentTypes[milestone.taskId] || 'supporting_document';
    if (!file) {
      toast({
        title: 'File required',
        description: `Choose a file to upload for milestone "${milestone.title}".`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploadingMilestoneTaskId(milestone.taskId);
      await documentsAPI.uploadFile(file, {
        documentType,
        entityType: 'JobInvoiceMilestone',
        entityId: milestone.taskId,
        accessLevel: 'manager',
        description: `${formatDocumentType(documentType)} uploaded for milestone "${milestone.title}" on "${selectedJob.jobName}".`,
      });
      const refreshedMilestoneDocuments = await fetchMilestoneDocuments(milestone.taskId);
      setMilestoneDocuments((prev) => ({
        ...prev,
        [milestone.taskId]: refreshedMilestoneDocuments,
      }));
      setPendingMilestoneUploads((prev) => ({ ...prev, [milestone.taskId]: null }));
      toast({
        title: 'Milestone document uploaded',
        description: `${formatDocumentType(documentType)} has been attached to "${milestone.title}".`,
      });
    } catch (error) {
      console.error('Milestone document upload failed:', error);
      toast({
        title: 'Upload failed',
        description:
          error instanceof Error && error.message
            ? error.message
            : 'Unable to upload the selected milestone document.',
        variant: 'destructive',
      });
    } finally {
      setUploadingMilestoneTaskId(null);
    }
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

    if (missingPartnerReviewLinks.length > 0) {
      toast({
        title: 'Working links required',
        description:
          'Add Google Drive links for the work plan and budget/cost estimate before submitting costing for partner review.',
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

  const handleAssignStaff = async () => {
    if (!selectedJob || !assignmentDraft.employeeProfileId) return;
    const employee = availableStaff.find(
      (item) => String(item.id) === assignmentDraft.employeeProfileId
    );
    const roleId = Number(employee?.role?.id || 0);
    if (!roleId) {
      toast({
        title: 'Role required',
        description: 'Set a billing role on the employee before assigning them.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setAssignmentBusy(true);
      await jobsAPI.assignStaff(selectedJob.id, {
        employeeProfileId: Number(assignmentDraft.employeeProfileId),
        assignedRoleId: roleId,
        assignedHourlyRate: Number(
          assignmentDraft.assignedHourlyRate || employee?.role?.billingRate || 0
        ),
        billableAllocatedHours: Number(assignmentDraft.billableAllocatedHours || 0),
        nonBillableAllocatedHours: Number(
          assignmentDraft.nonBillableAllocatedHours || 0
        ),
      });
      setAssignmentDraft({
        employeeProfileId: '',
        assignedHourlyRate: '',
        billableAllocatedHours: '',
        nonBillableAllocatedHours: '',
      });
      await loadJobDetails(selectedJob.id);
      toast({ title: 'Staff assigned', description: 'Budgets saved for this assignment.' });
    } catch (error: any) {
      toast({
        title: 'Unable to assign staff',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAssignmentBusy(false);
    }
  };

  const handleSaveAssignmentBudget = async (assignment: JobStaffAssignment) => {
    if (!selectedJob) return;
    const draft = assignmentBudgetDrafts[assignment.id];
    if (!draft) return;
    try {
      setAssignmentBusy(true);
      await jobsAPI.updateStaff(selectedJob.id, assignment.id, {
        billableAllocatedHours: Number(draft.billable || 0),
        nonBillableAllocatedHours: Number(draft.nonBillable || 0),
      });
      await loadJobDetails(selectedJob.id);
      toast({ title: 'Budgets updated', description: 'Assignment hour budgets were saved.' });
    } catch (error: any) {
      toast({
        title: 'Unable to update budgets',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAssignmentBusy(false);
    }
  };

  const handleRemoveAssignment = async (assignment: JobStaffAssignment) => {
    if (!selectedJob) return;
    try {
      setAssignmentBusy(true);
      await jobsAPI.removeStaff(selectedJob.id, assignment.id);
      await loadJobDetails(selectedJob.id);
      toast({ title: 'Assignment removed', description: 'Staff removed from this job.' });
    } catch (error: any) {
      toast({
        title: 'Unable to remove assignment',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAssignmentBusy(false);
    }
  };

  const handleAddWorkingLink = async () => {
    if (!selectedJob) return;
    if (!linkDraft.label.trim() || !linkDraft.url.trim()) {
      toast({
        title: 'Link required',
        description: 'Add a label and a Google Drive/Docs URL.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setLinkBusy(true);
      await jobsAPI.addWorkingLink(selectedJob.id, {
        linkType: linkDraft.linkType as any,
        label: linkDraft.label.trim(),
        url: linkDraft.url.trim(),
        milestoneTaskId: linkDraft.milestoneTaskId
          ? Number(linkDraft.milestoneTaskId)
          : undefined,
        notes: linkDraft.notes || undefined,
      });
      setLinkDraft({
        linkType: 'milestone_requirement',
        label: '',
        url: '',
        milestoneTaskId: '',
        notes: '',
      });
      setWorkingLinks(await jobsAPI.getWorkingLinks(selectedJob.id));
      toast({ title: 'Link added', description: 'The working document link is awaiting review.' });
    } catch (error: any) {
      toast({
        title: 'Unable to add link',
        description: error?.message || 'Only Google Drive/Docs links are accepted.',
        variant: 'destructive',
      });
    } finally {
      setLinkBusy(false);
    }
  };

  const handleReviewWorkingLink = async (
    link: JobWorkingDocumentLink,
    status: 'approved' | 'rejected'
  ) => {
    if (!selectedJob) return;
    const notes =
      window.prompt(
        status === 'approved' ? 'Review note (optional):' : 'Reason for rejection:'
      ) || '';
    if (status === 'rejected' && !notes.trim()) {
      toast({
        title: 'Reason required',
        description: 'Add a reason before rejecting the link.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setLinkBusy(true);
      await jobsAPI.reviewWorkingLink(selectedJob.id, link.id, { status, notes });
      setWorkingLinks(await jobsAPI.getWorkingLinks(selectedJob.id));
      toast({
        title: status === 'approved' ? 'Link approved' : 'Link rejected',
        description: 'The working document review was recorded.',
      });
    } catch (error: any) {
      toast({
        title: 'Unable to review link',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLinkBusy(false);
    }
  };

  useEffect(() => {
    employeesAPI
      .list({ page: 1, pageSize: 100, status: 'active' })
      .then((response) => setAvailableStaff(response.data || []))
      .catch(() => setAvailableStaff([]));
  }, []);

  useEffect(() => {
    loadJobs();
  }, [
    profile?.id,
    isAdmin,
    isHR,
    isGMP,
    isFinance,
    isManager,
    isPartner,
    isEmployee,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPendingUploads({});
    setUploadingDocumentType(null);
    setPartnerReviewNotes('');
  }, [selectedJob?.id]);

  useEffect(() => {
    setDetailTab('overview');
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
  const boardRollup = useMemo(() => {
    const totals = jobs.reduce(
      (acc, job) => {
        const ops = job.operationsMetrics;
        acc.expectedFee += Number(job.fixedFeeAmount || 0);
        acc.billableHours += Number(ops?.billableHours || 0);
        acc.approvedBilledAmount += Number(ops?.approvedBilledAmount || 0);
        acc.collectedAmount += Number(ops?.collectedAmount || 0);
        acc.outstandingAmount += Number(ops?.outstandingAmount || 0);
        acc.costToDate += Number(ops?.costToDate || 0);
        acc.profitToDate += Number(ops?.profitToDate || 0);
        acc.nextInvoiceAmount += Number(ops?.nextInvoiceAmount || 0);
        acc.overdueInvoiceCount += Number(ops?.overdueInvoiceCount || 0);
        if (job.teamAssigned) acc.staffedCount += 1;
        if (job.costingCompleted) acc.costedCount += 1;
        if (job.status === 'planned') acc.planned += 1;
        if (job.status === 'in_progress') acc.inProgress += 1;
        if (job.status === 'on_hold') acc.onHold += 1;
        if (job.status === 'completed') acc.completed += 1;
        if (job.status === 'cancelled') acc.cancelled += 1;
        return acc;
      },
      {
        expectedFee: 0,
        billableHours: 0,
        approvedBilledAmount: 0,
        collectedAmount: 0,
        outstandingAmount: 0,
        costToDate: 0,
        profitToDate: 0,
        nextInvoiceAmount: 0,
        overdueInvoiceCount: 0,
        staffedCount: 0,
        costedCount: 0,
        planned: 0,
        inProgress: 0,
        onHold: 0,
        completed: 0,
        cancelled: 0,
      }
    );

    const jobsInFlow = totals.planned + totals.inProgress + totals.onHold;
    const weightedProgress =
      jobs.length === 0
        ? 0
        : Math.round(
            ((totals.completed * 100) +
              (totals.inProgress * 68) +
              (totals.onHold * 45) +
              (totals.planned * 20)) /
              jobs.length
          );

    return {
      ...totals,
      jobsInFlow,
      weightedProgress,
      marginPercent:
        totals.approvedBilledAmount > 0
          ? (totals.profitToDate / totals.approvedBilledAmount) * 100
          : 0,
    };
  }, [jobs]);

  const workflowJobMetrics = [
    {
      label: 'Jobs in flow',
      value: String(boardRollup.jobsInFlow),
      hint: `${boardRollup.staffedCount} staffed, ${boardRollup.costedCount} costed`,
      icon: Briefcase,
      tone: 'primary' as const,
      graphValue: boardRollup.jobsInFlow,
      graphBaseline: jobs.length,
    },
    {
      label: 'Expected fee',
      value: formatCurrency(boardRollup.expectedFee),
      hint: `${formatCurrency(boardRollup.approvedBilledAmount)} approved billed`,
      icon: Flag,
      tone: 'warning' as const,
      graphValue: boardRollup.expectedFee,
      graphBaseline: boardRollup.approvedBilledAmount,
    },
    {
      label: 'Collected',
      value: formatCurrency(boardRollup.collectedAmount),
      hint: `${formatCurrency(boardRollup.outstandingAmount)} outstanding`,
      icon: RefreshCw,
      tone: 'positive' as const,
      graphValue: boardRollup.collectedAmount,
      graphBaseline: boardRollup.outstandingAmount,
    },
    {
      label: 'Cost to date',
      value: formatCurrency(boardRollup.costToDate),
      hint: `${boardRollup.billableHours.toFixed(1)} billable hours logged`,
      icon: Users,
      tone: 'warning' as const,
      graphValue: boardRollup.costToDate,
      graphBaseline: boardRollup.billableHours,
    },
    {
      label: 'Profit / loss',
      value: formatCurrency(boardRollup.profitToDate),
      hint: `Margin ${formatPercent(boardRollup.marginPercent)}`,
      icon: boardRollup.profitToDate >= 0 ? Briefcase : RefreshCw,
      tone: boardRollup.profitToDate >= 0 ? 'positive' as const : 'danger' as const,
      graphValue: Math.abs(boardRollup.profitToDate),
      graphBaseline: boardRollup.collectedAmount,
      inverse: boardRollup.profitToDate < 0,
    },
  ];
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
  const milestoneOwnerNameByProfileId = useMemo(
    () =>
      new Map(
        milestoneOwnerOptions.map((option) => [
          option.id,
          `${option.name}${option.roleName ? ` (${option.roleName})` : ''}`,
        ])
      ),
    [milestoneOwnerOptions]
  );
  const isAssignedStaffMember = Boolean(
    profile?.id && staff.some((assignment) => assignment.employeeProfileId === profile.id)
  );
  const isWorkflowReviewer = Boolean(
    profile?.id &&
      (isAdmin ||
        isHR ||
        isGMP ||
        isFinance ||
        selectedJob?.managerProfileId === profile.id ||
        selectedJob?.partnerProfileId === profile.id)
  );
  const canUpdateMilestoneCondition = Boolean(
    profile?.id &&
      (isAdmin ||
        isHR ||
        isGMP ||
        selectedJob?.managerProfileId === profile.id ||
        selectedJob?.partnerProfileId === profile.id)
  );
  const canManageMilestoneInvoices = Boolean(
    profile?.id && (canUpdateMilestoneCondition || isFinance)
  );
  const canUploadMilestoneDocument = (milestone: JobInvoiceMilestoneTrackingItem) => {
    if (!profile?.id) return false;
    if (isWorkflowReviewer) return true;
    if (milestone.assignedToProfileId && milestone.assignedToProfileId === profile.id) return true;
    return !milestone.assignedToProfileId && isAssignedStaffMember;
  };
  const totalDocuments = jobDocuments.length;
  const verifiedDocumentsCount = jobDocuments.filter(
    (document) => document.verificationStatus === 'verified'
  ).length;
  const totalMilestonesCount = invoiceTracking?.milestones.length ?? milestoneDrafts.length;
  const completedMilestonesCount =
    invoiceTracking?.milestones.filter((milestone) => milestone.conditionCompleted).length ?? 0;
  const currentHoursWorked = Number(trackingSnapshot?.timesheets?.totalHoursWorked || 0);
  const currentOutstandingAmount = Number(trackingSnapshot?.collections?.outstandingAmount || 0);
  const currentApprovedSpend = Number(trackingSnapshot?.requisitions?.approvedSpend || 0);
  const currentCostToDate = Number(trackingSnapshot?.financials?.costToDate || totalEstimatedCost || 0);
  const jobStageCards = [
    {
      key: 'marketing',
      title: 'Marketing',
      value: workflowSnapshot?.marketing?.onboardingStatus || 'No onboarding status',
      detail: `Letter ${workflowSnapshot?.marketing?.engagementLetterStatus || 'pending'}`,
      badge: workflowSnapshot?.marketing?.engagementLetterDocumentUploaded
        ? 'Document uploaded'
        : 'Document missing',
      badgeClass: workflowSnapshot?.marketing?.engagementLetterDocumentUploaded
        ? 'bg-primary/10 text-primary border-primary/20'
        : 'bg-muted text-muted-foreground border-border',
    },
    {
      key: 'hr',
      title: 'HR',
      value: workflowSnapshot?.hr?.jobCreated ? 'Job live' : 'Setup pending',
      detail: [
        workflowSnapshot?.hr?.managerAssigned ? 'Manager assigned' : 'Manager pending',
        workflowSnapshot?.hr?.partnerAssigned ? 'Partner assigned' : 'Partner pending',
      ].join(' / '),
      badge: workflowSnapshot?.hr?.departmentAssigned ? 'Department set' : 'Department pending',
      badgeClass: workflowSnapshot?.hr?.departmentAssigned
        ? 'bg-secondary/10 text-secondary border-secondary/20'
        : 'bg-muted text-muted-foreground border-border',
    },
    {
      key: 'manager',
      title: 'Manager',
      value: `${trackingSnapshot?.staffing?.headcount ?? workflowSnapshot?.manager?.staffCount ?? 0} team member(s)`,
      detail: `Costing ${workflowSnapshot?.manager?.costingStatus || 'not started'}`,
      badge: workflowSnapshot?.manager?.teamAssigned ? 'Team assigned' : 'Needs staffing',
      badgeClass: workflowSnapshot?.manager?.teamAssigned
        ? 'bg-secondary/10 text-secondary border-secondary/20'
        : 'bg-muted text-muted-foreground border-border',
    },
    {
      key: 'execution',
      title: 'Execution',
      value: formatStatusLabel(selectedWorkflowStatus),
      detail: `${trackingSnapshot?.tasks?.incomplete ?? 0} incomplete task(s)`,
      badge: executionSnapshot?.isOverdue
        ? `Overdue by ${executionSnapshot.overdueDays}d`
        : 'On track',
      badgeClass: executionSnapshot?.isOverdue
        ? 'bg-destructive/10 text-destructive border-destructive/20'
        : 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
  ];

  const boardJobs = useMemo(() => {
    const getPriorityWeight = (job: Job) => {
      if (job.status === 'in_progress') return 0;
      if (job.status === 'planned') return 1;
      if (job.status === 'on_hold') return 2;
      if (job.status === 'completed') return 4;
      return 3;
    };

    const getProgressPercent = (job: Job) => {
      if (job.status === 'completed') return 100;
      if (job.status === 'in_progress') return 70;
      if (job.status === 'on_hold') return 45;
      if (job.status === 'planned') return 20;
      return 10;
    };

    return [...jobs]
      .sort((left, right) => {
        const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (getPriorityWeight(left) !== getPriorityWeight(right)) {
          return getPriorityWeight(left) - getPriorityWeight(right);
        }
        return leftDue - rightDue;
      })
      .slice(0, 6)
      .map((job) => ({
        ...job,
        progressPercent: getProgressPercent(job),
        outstandingAmount: Number(job.operationsMetrics?.outstandingAmount || 0),
        collectedAmount: Number(job.operationsMetrics?.collectedAmount || 0),
        nextInvoiceAmount: Number(job.operationsMetrics?.nextInvoiceAmount || 0),
        marginPercent: Number(job.operationsMetrics?.marginPercent || 0),
        billableHours: Number(job.operationsMetrics?.billableHours || 0),
      }));
  }, [jobs]);

  const boardActionItems = useMemo(() => {
    const items: Array<{ title: string; description: string; tone: string }> = [];

    const unstaffedJobs = jobs.filter((job) => !job.teamAssigned).length;
    if (unstaffedJobs > 0) {
      items.push({
        title: 'Jobs awaiting staffing',
        description: `${unstaffedJobs} job(s) still need team assignment before execution can move cleanly.`,
        tone: 'warning',
      });
    }

    const uncostedJobs = jobs.filter((job) => !job.costingCompleted).length;
    if (uncostedJobs > 0) {
      items.push({
        title: 'Costing packages still open',
        description: `${uncostedJobs} job(s) still need manager costing or partner review.`,
        tone: 'primary',
      });
    }

    if (boardRollup.nextInvoiceAmount > 0) {
      items.push({
        title: 'Invoice-ready work is waiting',
        description: `${formatCurrency(boardRollup.nextInvoiceAmount)} is ready for finance to convert into invoices.`,
        tone: 'positive',
      });
    }

    if (boardRollup.overdueInvoiceCount > 0) {
      items.push({
        title: 'Collections need attention',
        description: `${boardRollup.overdueInvoiceCount} overdue invoice(s) are dragging outstanding balances upward.`,
        tone: 'danger',
      });
    }

    if (items.length === 0) {
      items.push({
        title: 'Operational queue is clear',
        description: 'No immediate staffing, costing, or collection exceptions are blocking the current portfolio.',
        tone: 'positive',
      });
    }

    return items.slice(0, 4);
  }, [boardRollup.nextInvoiceAmount, boardRollup.overdueInvoiceCount, jobs, boardRollup]);

  const boardWorkloadByOwner = useMemo(() => {
    const ownerMap = new Map<
      string,
      { label: string; live: number; total: number; outstanding: number }
    >();

    jobs.forEach((job) => {
      const managerName = job.manager
        ? `${job.manager.firstName || ''} ${job.manager.lastName || ''}`.trim()
        : '';
      const partnerName = job.partner
        ? `${job.partner.firstName || ''} ${job.partner.lastName || ''}`.trim()
        : '';
      const label = managerName || partnerName || 'Unassigned owner';
      const existing = ownerMap.get(label) || { label, live: 0, total: 0, outstanding: 0 };
      existing.total += 1;
      if (job.status === 'in_progress') existing.live += 1;
      existing.outstanding += Number(job.operationsMetrics?.outstandingAmount || 0);
      ownerMap.set(label, existing);
    });

    return [...ownerMap.values()]
      .sort((left, right) => right.live - left.live || right.total - left.total)
      .slice(0, 5);
  }, [jobs]);

  const boardActionToneClasses: Record<string, string> = {
    primary: 'border-primary/15 bg-primary/5 text-primary',
    positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    danger: 'border-destructive/20 bg-destructive/10 text-destructive',
  };

  const handleBackFromTracking = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/job-workflow-dashboard');
  };

  if (isTrackingDetailView) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <Button variant="ghost" size="icon" onClick={handleBackFromTracking}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <Briefcase className="h-8 w-8 text-primary" />
                  <h1 className="text-3xl font-bold">{selectedJob?.jobName || 'Job tracking'}</h1>
                  {selectedJob ? (
                    <Badge className={statusColors[selectedJob.status] || statusColors.planned}>
                      {formatStatusLabel(selectedJob.status)}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {selectedJob?.client?.clientName || 'Client not set'}
                  {selectedJob?.jobCode ? ` / ${selectedJob.jobCode}` : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => selectedJob && loadJobDetails(selectedJob.id)}
                disabled={trackingLoading || !selectedJob}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {trackingLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>

          {trackingLoading && !selectedJob ? (
            <Card>
              <CardContent className="flex min-h-[220px] items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading job tracking...
                </div>
              </CardContent>
            </Card>
          ) : null}

          {selectedJob ? (
            <>
              <Tabs value={detailTab} onValueChange={setDetailTab} className="space-y-6">
                <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-2xl border border-border/70 bg-white/85 p-1.5 shadow-sm">
                  <TabsTrigger value="overview" className="rounded-xl px-4 py-2">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="workflow" className="rounded-xl px-4 py-2">
                    Workflow
                  </TabsTrigger>
                  <TabsTrigger value="delivery" className="rounded-xl px-4 py-2">
                    Delivery
                  </TabsTrigger>
                  {!isEmployeeExperience ? (
                    <TabsTrigger value="billing" className="rounded-xl px-4 py-2">
                      Billing
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger value="documents" className="rounded-xl px-4 py-2">
                    Documents ({totalDocuments})
                  </TabsTrigger>
                  {!isEmployeeExperience ? (
                    <TabsTrigger value="costing" className="rounded-xl px-4 py-2">
                      Costing & Review
                    </TabsTrigger>
                  ) : null}
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Ownership & Billing</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Partner In Charge</p>
                          <p className="font-medium">{partnerDisplayName}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Manager In Charge</p>
                          <p className="font-medium">{managerDisplayName}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-bold">
                              {trackingSnapshot?.staffing?.headcount ?? staff.length}
                            </p>
                            <p className="text-sm text-muted-foreground">Team Members</p>
                          </div>
                          <div className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-bold">
                              {selectedJob.billingType === 'fixed_fee'
                                ? formatCurrency(Number(selectedJob.fixedFeeAmount || 0))
                                : `${Number(selectedJob.budgetHours || 0).toFixed(1)}h`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {selectedJob.billingType === 'fixed_fee' ? 'Approved Fee' : 'Budget Hours'}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Timeline & Commercials</CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg bg-muted p-4">
                          <p className="text-sm text-muted-foreground">Start Date</p>
                          <p className="mt-1 font-medium">
                            {jobTimeline?.startDate ? jobTimeline.startDate.toLocaleDateString() : 'Not set'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted p-4">
                          <p className="text-sm text-muted-foreground">Due Date</p>
                          <p className="mt-1 font-medium">
                            {jobTimeline?.dueDate ? jobTimeline.dueDate.toLocaleDateString() : 'Not set'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted p-4">
                          <p className="text-sm text-muted-foreground">Timeline Progress</p>
                          <p className="mt-1 font-semibold">
                            {jobTimeline?.progressPercent !== null && jobTimeline?.progressPercent !== undefined
                              ? `${jobTimeline.progressPercent}%`
                              : 'N/A'}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted p-4">
                          <p className="text-sm text-muted-foreground">Due Status</p>
                          <p
                            className={`mt-1 font-semibold ${
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
                        <div className="rounded-lg bg-muted p-4">
                          <p className="text-sm text-muted-foreground">Hours Worked</p>
                          <p className="mt-1 font-semibold">{currentHoursWorked.toFixed(1)}h</p>
                        </div>
                        <div className="rounded-lg bg-muted p-4">
                          <p className="text-sm text-muted-foreground">Cost to Date</p>
                          <p className="mt-1 font-semibold">{formatCurrency(currentCostToDate)}</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Job Statistics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-bold">{totalDocuments}</p>
                            <p className="text-sm text-muted-foreground">Documents</p>
                          </div>
                          <div className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-bold">{verifiedDocumentsCount}</p>
                            <p className="text-sm text-muted-foreground">Verified Docs</p>
                          </div>
                          <div className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-bold">
                              {trackingSnapshot?.requisitions?.totalRequests || 0}
                            </p>
                            <p className="text-sm text-muted-foreground">Requisitions</p>
                          </div>
                          <div className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-bold">{totalMilestonesCount}</p>
                            <p className="text-sm text-muted-foreground">Milestones</p>
                          </div>
                          <div className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-bold">{completedMilestonesCount}</p>
                            <p className="text-sm text-muted-foreground">Completed Milestones</p>
                          </div>
                          <div className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-bold">{trackingSnapshot?.tasks?.incomplete ?? 0}</p>
                            <p className="text-sm text-muted-foreground">Incomplete Tasks</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Stage Summary</CardTitle>
                        <CardDescription>
                          Follow the handoff from marketing through execution without stacking every workflow block.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {jobStageCards.map((stage) => (
                          <div
                            key={stage.key}
                            className="rounded-xl border border-border/70 bg-white/70 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm text-muted-foreground">{stage.title}</p>
                                <p className="mt-1 font-medium capitalize">{stage.value}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{stage.detail}</p>
                              </div>
                              <Badge variant="outline" className={stage.badgeClass}>
                                {stage.badge}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="workflow" className="space-y-6">
                  {jobTracking ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Workflow Visibility</CardTitle>
                        <CardDescription>
                          Primary tracking source: /jobs/:jobId/tracking
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="space-y-2 rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Marketing</p>
                            <p className="font-medium capitalize">
                              {workflowSnapshot?.marketing?.onboardingStatus || 'No onboarding status'}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              Engagement letter {workflowSnapshot?.marketing?.engagementLetterStatus || 'pending'}
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
                          <div className="space-y-2 rounded-lg border p-3">
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
                          <div className="space-y-2 rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Manager</p>
                            <p className="font-medium">
                              Team: {trackingSnapshot?.staffing?.headcount ?? workflowSnapshot?.manager?.staffCount ?? 0}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Costing <span className="capitalize">{workflowSnapshot?.manager?.costingStatus || 'not started'}</span>
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
                          <div className="space-y-2 rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Execution</p>
                            <Badge className={statusColors[selectedWorkflowStatus] || statusColors.planned}>
                              {formatStatusLabel(selectedWorkflowStatus)}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              Tasks incomplete: {trackingSnapshot?.tasks?.incomplete ?? 0}
                            </p>
                            {executionSnapshot?.isOverdue ? (
                              <p className="text-xs font-medium text-red-600">
                                Overdue by {executionSnapshot.overdueDays} day(s)
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {!isEmployeeExperience && jobTracking ? (
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
                                className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-start md:justify-between"
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
                                    <p className="text-xs text-muted-foreground">Ready for transition.</p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => moveJobToStatus(nextStatus)}
                                  disabled={Boolean(statusUpdating) || hasBlockers}
                                >
                                  {statusUpdating === nextStatus ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                  ) : null}

                  {jobTracking ? (
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
                            <div key={transition.id} className="flex flex-col gap-1 rounded-lg border p-3">
                              <p className="text-sm font-medium">
                                {transition.fromStatus
                                  ? `${formatStatusLabel(String(transition.fromStatus))} → ${formatStatusLabel(String(transition.toStatus || ''))}`
                                  : `Set to ${formatStatusLabel(String(transition.toStatus || ''))}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {transition.createdAt
                                  ? new Date(transition.createdAt).toLocaleString()
                                  : 'Unknown timestamp'}
                              </p>
                              {transition.reason ? (
                                <p className="text-xs text-muted-foreground">Reason: {transition.reason}</p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  ) : null}

                  {isEmployeeExperience ? (
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
                            <div
                              key={action.key}
                              className="flex items-start justify-between gap-4 rounded-lg border p-3"
                            >
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
                  ) : null}
                </TabsContent>

                <TabsContent value="delivery" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Delivery Pulse</CardTitle>
                      <CardDescription>
                        Keep execution, timeline, and effort visible without forcing every module into one long page.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Hours Worked</p>
                        <p className="text-lg font-semibold">{currentHoursWorked.toFixed(1)}h</p>
                        <p className="text-xs text-muted-foreground">
                          Approved {Number(trackingSnapshot?.timesheets?.approvedHoursWorked || 0).toFixed(1)}h
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Billable Split</p>
                        <p className="text-lg font-semibold">
                          {Number(trackingSnapshot?.timesheets?.totalBillableHours || 0).toFixed(1)}h
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Non-billable {Number(trackingSnapshot?.timesheets?.totalNonBillableHours || 0).toFixed(1)}h
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Profitability</p>
                        <p className="text-lg font-semibold">
                          {formatCurrency(Number(trackingSnapshot?.financials?.profitToDate || 0))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Margin {formatPercent(Number(trackingSnapshot?.financials?.marginPercent || 0))}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Due Status</p>
                        <p
                          className={`text-lg font-semibold ${
                            executionSnapshot?.isOverdue ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {executionSnapshot?.isOverdue
                            ? `Overdue ${executionSnapshot.overdueDays}d`
                            : jobTimeline?.remainingDays !== null &&
                                jobTimeline?.remainingDays !== undefined
                              ? `${Math.max(0, jobTimeline.remainingDays)}d left`
                              : 'On track'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {trackingSnapshot?.tasks?.incomplete ?? 0} incomplete task(s)
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {isEmployeeExperience ? (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle>Your Job Performance</CardTitle>
                          <CardDescription>
                            Track your utilization, assigned role, and remaining time budget.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Assigned Role</p>
                            <p className="font-medium">
                              {employeeTracking?.assignedRole || employeeAssignment?.role?.name || 'Not set'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Allocated (You)</p>
                            <p className="font-semibold">
                              {employeeTracking || allocationSummary ? `${employeeAllocatedHours.toFixed(1)}h` : '-'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Logged (You)</p>
                            <p className="font-semibold">
                              {employeeTracking || allocationSummary ? `${employeeLoggedHours.toFixed(1)}h` : '-'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Billable / Non-billable</p>
                            <p className="font-semibold">
                              {employeeTracking
                                ? `${Number(employeeTracking.billableHours || 0).toFixed(1)}h / ${Number(
                                    employeeTracking.nonBillableHours || 0
                                  ).toFixed(1)}h`
                                : '-'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Utilization</p>
                            <p className="font-semibold">{employeeUtilizationPercent}%</p>
                            <p className="mt-1 text-xs text-muted-foreground">
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
                        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Start Date</p>
                            <p className="font-medium">
                              {jobTimeline?.startDate ? jobTimeline.startDate.toLocaleDateString() : 'Not set'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Due Date</p>
                            <p className="font-medium">
                              {jobTimeline?.dueDate ? jobTimeline.dueDate.toLocaleDateString() : 'Not set'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Timeline Progress</p>
                            <p className="font-semibold">
                              {jobTimeline?.progressPercent !== null && jobTimeline?.progressPercent !== undefined
                                ? `${jobTimeline.progressPercent}%`
                                : 'N/A'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
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
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <>
                      {trackingSnapshot ? (
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
                                  className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-6"
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
                                    <p className="font-semibold">
                                      {formatPercent(Number(employee.utilizationPercent || 0))}
                                    </p>
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
                      ) : null}

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Staff Assignments & Hour Budgets
                          </CardTitle>
                          <CardDescription>
                            Billable and non-billable budgets are tracked separately for each assignment.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {canEditCosting && (
                            <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-5 md:items-end">
                              <div className="md:col-span-2">
                                <Label className="text-xs">Assign staff</Label>
                                <Select
                                  value={assignmentDraft.employeeProfileId}
                                  onValueChange={(value) => {
                                    const employee = availableStaff.find(
                                      (item) => String(item.id) === value
                                    );
                                    setAssignmentDraft((prev) => ({
                                      ...prev,
                                      employeeProfileId: value,
                                      assignedHourlyRate: employee?.role?.billingRate
                                        ? String(employee.role.billingRate)
                                        : prev.assignedHourlyRate,
                                    }));
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select staff" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableStaff
                                      .filter(
                                        (employee) =>
                                          !staff.some(
                                            (assignment) =>
                                              assignment.employeeProfileId === employee.id
                                          )
                                      )
                                      .map((employee) => (
                                        <SelectItem key={employee.id} value={String(employee.id)}>
                                          {employee.firstName} {employee.lastName}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Billable hours</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  value={assignmentDraft.billableAllocatedHours}
                                  onChange={(event) =>
                                    setAssignmentDraft((prev) => ({
                                      ...prev,
                                      billableAllocatedHours: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Non-billable hours</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  value={assignmentDraft.nonBillableAllocatedHours}
                                  onChange={(event) =>
                                    setAssignmentDraft((prev) => ({
                                      ...prev,
                                      nonBillableAllocatedHours: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <Button
                                onClick={handleAssignStaff}
                                disabled={assignmentBusy || !assignmentDraft.employeeProfileId}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Assign
                              </Button>
                            </div>
                          )}

                          {staff.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No staff assigned.</p>
                          ) : (
                            staff.map((assignment) => {
                              const draft = assignmentBudgetDrafts[assignment.id] || {
                                billable: String(assignment.billableAllocatedHours || 0),
                                nonBillable: String(assignment.nonBillableAllocatedHours || 0),
                              };
                              return (
                                <div key={assignment.id} className="rounded-lg border p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="font-medium">
                                        {assignment.employee
                                          ? `${assignment.employee.firstName} ${assignment.employee.lastName}`
                                          : 'Employee'}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {assignment.role?.name || 'Role not set'} • KES{' '}
                                        {Number(assignment.assignedHourlyRate || 0).toLocaleString()}
                                        /hr
                                      </p>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Billable {Number(assignment.billableAllocatedHours || 0).toFixed(1)}h
                                      {' / '}
                                      Non-billable{' '}
                                      {Number(assignment.nonBillableAllocatedHours || 0).toFixed(1)}h
                                    </div>
                                  </div>
                                  {canEditCosting && (
                                    <div className="mt-2 grid gap-2 md:grid-cols-4 md:items-end">
                                      <div>
                                        <Label className="text-xs">Billable budget</Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.25"
                                          value={draft.billable}
                                          onChange={(event) =>
                                            setAssignmentBudgetDrafts((prev) => ({
                                              ...prev,
                                              [assignment.id]: {
                                                ...draft,
                                                billable: event.target.value,
                                              },
                                            }))
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Non-billable budget</Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.25"
                                          value={draft.nonBillable}
                                          onChange={(event) =>
                                            setAssignmentBudgetDrafts((prev) => ({
                                              ...prev,
                                              [assignment.id]: {
                                                ...draft,
                                                nonBillable: event.target.value,
                                              },
                                            }))
                                          }
                                        />
                                      </div>
                                      <Button
                                        variant="outline"
                                        onClick={() => handleSaveAssignmentBudget(assignment)}
                                        disabled={assignmentBusy}
                                      >
                                        Save budgets
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        className="text-red-600"
                                        onClick={() => handleRemoveAssignment(assignment)}
                                        disabled={assignmentBusy}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Remove
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5" />
                            Working Document Links
                          </CardTitle>
                          <CardDescription>
                            Google Drive/Docs links only. Milestone links need manager approval;
                            work plan, budget, and cost estimates need partner approval.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-6 md:items-end">
                            <div>
                              <Label className="text-xs">Type</Label>
                              <Select
                                value={linkDraft.linkType}
                                onValueChange={(value) =>
                                  setLinkDraft((prev) => ({ ...prev, linkType: value }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="milestone_requirement">Milestone requirement</SelectItem>
                                  <SelectItem value="work_plan">Work plan</SelectItem>
                                  <SelectItem value="budget">Budget</SelectItem>
                                  <SelectItem value="cost_estimate">Cost estimate</SelectItem>
                                  <SelectItem value="proposal">Proposal</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Label</Label>
                              <Input
                                value={linkDraft.label}
                                onChange={(event) =>
                                  setLinkDraft((prev) => ({ ...prev, label: event.target.value }))
                                }
                                placeholder="e.g. Audit work plan"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <Label className="text-xs">Google Drive/Docs URL</Label>
                              <Input
                                value={linkDraft.url}
                                onChange={(event) =>
                                  setLinkDraft((prev) => ({ ...prev, url: event.target.value }))
                                }
                                placeholder="https://docs.google.com/..."
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Milestone</Label>
                              <Select
                                value={linkDraft.milestoneTaskId || 'none'}
                                onValueChange={(value) =>
                                  setLinkDraft((prev) => ({
                                    ...prev,
                                    milestoneTaskId: value === 'none' ? '' : value,
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Optional" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Not milestone-specific</SelectItem>
                                  {(invoiceTracking?.milestones || []).map((milestone) => (
                                    <SelectItem key={milestone.taskId} value={String(milestone.taskId)}>
                                      {milestone.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button onClick={handleAddWorkingLink} disabled={linkBusy}>
                              <Plus className="mr-2 h-4 w-4" />
                              Add link
                            </Button>
                          </div>

                          {workingLinks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No working document links added.
                            </p>
                          ) : (
                            workingLinks.map((link) => (
                              <div
                                key={link.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                              >
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{link.label}</span>
                                    <Badge variant="outline">{link.linkType.replace(/_/g, ' ')}</Badge>
                                    <Badge
                                      variant={
                                        link.reviewStatus === 'approved'
                                          ? 'default'
                                          : link.reviewStatus === 'rejected'
                                            ? 'destructive'
                                            : 'secondary'
                                      }
                                    >
                                      {link.reviewStatus}
                                    </Badge>
                                  </div>
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary underline"
                                  >
                                    Open Google link
                                  </a>
                                  {link.milestoneTask ? (
                                    <p className="text-xs text-muted-foreground">
                                      Milestone: {link.milestoneTask.title}
                                    </p>
                                  ) : null}
                                  {link.addedBy ? (
                                    <p className="text-xs text-muted-foreground">
                                      Added by {link.addedBy.firstName} {link.addedBy.lastName}
                                    </p>
                                  ) : null}
                                </div>
                                {link.reviewStatus === 'pending' && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReviewWorkingLink(link, 'approved')}
                                      disabled={linkBusy}
                                    >
                                      <CheckCircle2 className="mr-1 h-4 w-4" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600"
                                      onClick={() => handleReviewWorkingLink(link, 'rejected')}
                                      disabled={linkBusy}
                                    >
                                      <XCircle className="mr-1 h-4 w-4" />
                                      Reject
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Allocation & Write-off Reconciliation</CardTitle>
                          <CardDescription>
                            Billable and non-billable budgets against effective approved time.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {!trackingSnapshot?.allocation ? (
                            <p className="text-sm text-muted-foreground">
                              Allocation metrics are not available yet.
                            </p>
                          ) : (
                            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
                              <div>
                                <p className="text-xs text-muted-foreground">Billable budget</p>
                                <p className="font-semibold">
                                  {trackingSnapshot.allocation.billableActualHours.toFixed(1)}h /{' '}
                                  {trackingSnapshot.allocation.billableAllocatedHours.toFixed(1)}h
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Non-billable budget</p>
                                <p className="font-semibold">
                                  {trackingSnapshot.allocation.nonBillableActualHours.toFixed(1)}h /{' '}
                                  {trackingSnapshot.allocation.nonBillableAllocatedHours.toFixed(1)}h
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Approved billable excess</p>
                                <p className="font-semibold text-emerald-700">
                                  {trackingSnapshot.allocation.approvedBillableExcessHours.toFixed(1)}h
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Approved non-billable excess</p>
                                <p className="font-semibold text-amber-700">
                                  {trackingSnapshot.allocation.approvedNonBillableExcessHours.toFixed(1)}h
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Rejected excess (void)</p>
                                <p className="font-semibold text-red-600">
                                  {trackingSnapshot.allocation.rejectedExcessHours.toFixed(1)}h
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Total write-off</p>
                                <p className="font-semibold">
                                  {trackingSnapshot.allocation.totalWriteOffHours.toFixed(1)}h
                                </p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>


                    </>
                  )}
                </TabsContent>

                {!isEmployeeExperience ? (
                  <TabsContent value="billing" className="space-y-6">
                    {jobTracking ? (
                      <Card className="border-dashed">
                        <CardHeader className="pb-3">
                          <CardTitle>Requisition Spend</CardTitle>
                          <CardDescription>
                            Approved job-linked requisitions now feed the job cost position and reporting.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-lg border p-3">
                              <p className="text-xs text-muted-foreground">Approved Spend</p>
                              <p className="text-lg font-semibold">
                                {formatCurrency(Number(trackingSnapshot?.requisitions?.approvedSpend || 0))}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {trackingSnapshot?.requisitions?.approvedCount || 0} approved request(s)
                              </p>
                            </div>
                            <div className="rounded-lg border p-3">
                              <p className="text-xs text-muted-foreground">Committed Spend</p>
                              <p className="text-lg font-semibold">
                                {formatCurrency(Number(trackingSnapshot?.requisitions?.committedSpend || 0))}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {trackingSnapshot?.requisitions?.pendingCount || 0} pending request(s)
                              </p>
                            </div>
                            <div className="rounded-lg border p-3">
                              <p className="text-xs text-muted-foreground">Labor Cost</p>
                              <p className="text-lg font-semibold">
                                {formatCurrency(Number(trackingSnapshot?.financials?.laborCostToDate || 0))}
                              </p>
                              <p className="text-xs text-muted-foreground">Time-entry delivery cost to date</p>
                            </div>
                            <div className="rounded-lg border p-3">
                              <p className="text-xs text-muted-foreground">Total Job Cost</p>
                              <p className="text-lg font-semibold">
                                {formatCurrency(Number(trackingSnapshot?.financials?.costToDate || 0))}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Recoverable requisitions{' '}
                                {formatCurrency(
                                  Number(trackingSnapshot?.financials?.recoverableRequisitionCost || 0)
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Recent job requisitions</p>
                              <Badge variant="outline">
                                {trackingSnapshot?.requisitions?.totalRequests || 0} total
                              </Badge>
                            </div>
                            {trackingSnapshot?.requisitions?.recent?.length ? (
                              <div className="space-y-2">
                                {trackingSnapshot.requisitions.recent.slice(0, 5).map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
                                  >
                                    <div>
                                      <p className="text-sm font-medium">{item.title}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {item.requisitionNumber}
                                        {item.requisitionTypeName ? ` / ${item.requisitionTypeName}` : ''}
                                        {item.requesterName ? ` / ${item.requesterName}` : ''}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-semibold">
                                        {formatCurrency(Number(item.amount || 0))}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {formatStatusLabel(item.status)}
                                        {item.isClientRecoverable ? ' / Recoverable' : ''}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No job-linked requisitions have been raised yet.
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}

                    <Card>
                      <CardHeader>
                        <CardTitle>Generated Invoices</CardTitle>
                        <CardDescription>
                          Milestone-linked invoices, issue status, and payment applications on this job.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Invoices</p>
                            <p className="text-lg font-semibold">
                              {trackingSnapshot?.invoices?.total || 0}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Draft</p>
                            <p className="text-lg font-semibold">
                              {trackingSnapshot?.invoices?.draftCount || 0}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Issued</p>
                            <p className="text-lg font-semibold">
                              {(trackingSnapshot?.invoices?.issuedCount || 0) +
                                (trackingSnapshot?.invoices?.partiallyPaidCount || 0)}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Overdue</p>
                            <p className="text-lg font-semibold text-red-600">
                              {trackingSnapshot?.invoices?.overdueCount || 0}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Next Due</p>
                            <p className="text-lg font-semibold">
                              {trackingSnapshot?.invoices?.nextDueDate
                                ? new Date(trackingSnapshot.invoices.nextDueDate).toLocaleDateString()
                                : 'No due date'}
                            </p>
                          </div>
                        </div>

                        {trackingSnapshot?.invoices?.items?.length ? (
                          <div className="space-y-3">
                            {trackingSnapshot.invoices.items.map((invoice) => (
                              <div
                                key={invoice.id}
                                className="rounded-lg border p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-medium">{invoice.invoiceNumber}</p>
                                    <p className="text-sm text-muted-foreground">{invoice.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {invoice.milestoneTitle
                                        ? `Milestone: ${invoice.milestoneTitle}`
                                        : 'General job invoice'}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={getConditionStatusBadgeClass(
                                      invoice.status === 'paid'
                                        ? 'completed'
                                        : invoice.status === 'overdue'
                                          ? 'blocked'
                                          : invoice.status === 'draft'
                                            ? 'pending'
                                            : 'in_progress'
                                    )}>
                                      {formatStatusLabel(invoice.status)}
                                    </Badge>
                                    {invoice.document?.filePath ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(invoice.document?.filePath, '_blank', 'noopener,noreferrer')}
                                      >
                                        Preview
                                      </Button>
                                    ) : null}
                                    {invoice.status === 'draft' ? (
                                      <Button
                                        size="sm"
                                        onClick={() => handleIssueInvoice(invoice.id)}
                                        disabled={issuingInvoiceId === invoice.id}
                                      >
                                        {issuingInvoiceId === invoice.id ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Issuing...
                                          </>
                                        ) : (
                                          'Issue invoice'
                                        )}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Total</p>
                                    <p className="font-semibold">{formatCurrency(invoice.totalAmount)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Paid</p>
                                    <p className="font-semibold">{formatCurrency(invoice.amountPaid)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Outstanding</p>
                                    <p className="font-semibold">{formatCurrency(invoice.amountOutstanding)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Due</p>
                                    <p className="font-semibold">
                                      {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'On receipt'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No invoice records have been generated for this job yet.
                          </p>
                        )}
                      </CardContent>
                    </Card>

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
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                              <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Total Fee</p>
                                <p className="font-semibold">
                                  KES {Number(invoiceTracking.feeAmount || 0).toLocaleString()}
                                </p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Collected</p>
                                <p className="font-semibold">
                                  KES {Number(invoiceTracking.collectedAmount || 0).toLocaleString()}
                                </p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Outstanding</p>
                                <p className="font-semibold">
                                  KES {Number(invoiceTracking.outstandingAmount || 0).toLocaleString()}
                                </p>
                              </div>
                              <div className="rounded-lg border p-3">
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
                                  const milestoneReviewDocuments =
                                    milestoneDocuments[milestone.taskId] || [];
                                  const milestoneOwnerLabel = milestone.assignedToProfileId
                                    ? milestoneOwnerNameByProfileId.get(milestone.assignedToProfileId) ||
                                      `Profile ${milestone.assignedToProfileId}`
                                    : 'Unassigned';
                                  const selectedMilestoneDocumentType =
                                    pendingMilestoneDocumentTypes[milestone.taskId] ||
                                    'supporting_document';
                                  const selectedMilestoneFile =
                                    pendingMilestoneUploads[milestone.taskId] || null;
                                  const allowMilestoneUpload = canUploadMilestoneDocument(milestone);
                                  return (
                                    <div key={milestone.taskId} className="space-y-3 rounded-lg border p-3">
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
                                          <Badge
                                            className={getConditionStatusBadgeClass(
                                              milestone.conditionStatus
                                            )}
                                          >
                                            {formatConditionStatus(milestone.conditionStatus)}
                                          </Badge>
                                          <Badge className={invoiceBadge.className}>
                                            {invoiceBadge.label}
                                          </Badge>
                                        </div>
                                      </div>

                                      {milestone.requirements ? (
                                        <p className="text-sm text-muted-foreground">
                                          Requirement: {milestone.requirements}
                                        </p>
                                      ) : null}

                                      <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div>
                                            <p className="text-sm font-medium">Milestone Documents</p>
                                            <p className="text-xs text-muted-foreground">
                                              Owner: {milestoneOwnerLabel}. Upload milestone-specific
                                              evidence here for manager, partner, and future review.
                                            </p>
                                          </div>
                                          <Badge variant="outline">
                                            {milestoneReviewDocuments.length} file
                                            {milestoneReviewDocuments.length === 1 ? '' : 's'}
                                          </Badge>
                                        </div>

                                        {allowMilestoneUpload ? (
                                          <div className="grid gap-2 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
                                            <Select
                                              value={selectedMilestoneDocumentType}
                                              onValueChange={(value) =>
                                                handleMilestoneDocumentTypeChange(milestone.taskId, value)
                                              }
                                            >
                                              <SelectTrigger>
                                                <SelectValue placeholder="Document type" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {MILESTONE_DOCUMENT_TYPE_OPTIONS.map((option) => (
                                                  <SelectItem key={option} value={option}>
                                                    {formatDocumentType(option)}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            <Input
                                              type="file"
                                              onChange={(event) =>
                                                handleMilestoneDocumentFileChange(
                                                  milestone.taskId,
                                                  event.target.files?.[0] || null
                                                )
                                              }
                                            />
                                            <Button
                                              type="button"
                                              variant="outline"
                                              onClick={() => uploadMilestoneDocument(milestone)}
                                              disabled={
                                                uploadingMilestoneTaskId === milestone.taskId ||
                                                !selectedMilestoneFile
                                              }
                                            >
                                              {uploadingMilestoneTaskId === milestone.taskId ? (
                                                <>
                                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                  Uploading...
                                                </>
                                              ) : (
                                                <>
                                                  <Upload className="mr-2 h-4 w-4" />
                                                  Upload
                                                </>
                                              )}
                                            </Button>
                                          </div>
                                        ) : (
                                          <p className="text-xs text-muted-foreground">
                                            Only the milestone owner or workflow reviewers can upload
                                            files here.
                                          </p>
                                        )}

                                        {selectedMilestoneFile ? (
                                          <p className="text-xs text-muted-foreground">
                                            Selected file: {selectedMilestoneFile.name}
                                          </p>
                                        ) : null}

                                        {milestoneReviewDocuments.length === 0 ? (
                                          <p className="text-sm text-muted-foreground">
                                            No documents have been attached to this milestone yet.
                                          </p>
                                        ) : (
                                          <div className="space-y-2">
                                            {milestoneReviewDocuments.map((document) => (
                                              <div
                                                key={document.id}
                                                className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3"
                                              >
                                                <div className="min-w-0 space-y-1">
                                                  <p className="truncate font-medium">
                                                    {document.fileName}
                                                  </p>
                                                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                    <span>{formatDocumentType(document.documentType)}</span>
                                                    <span>
                                                      {document.createdAt
                                                        ? new Date(document.createdAt).toLocaleString()
                                                        : 'Uploaded recently'}
                                                    </span>
                                                    {document.uploader ? (
                                                      <span>
                                                        By {document.uploader.firstName}{' '}
                                                        {document.uploader.lastName}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                  {document.description ? (
                                                    <p className="text-xs text-muted-foreground">
                                                      {document.description}
                                                    </p>
                                                  ) : null}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <Badge
                                                    className={getVerificationBadgeClass(
                                                      document.verificationStatus
                                                    )}
                                                  >
                                                    {document.verificationStatus || 'pending'}
                                                  </Badge>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setPreviewDocument(document)}
                                                  >
                                                    Preview
                                                  </Button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
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

                                      <div className="flex flex-wrap justify-end gap-2">
                                        {!milestone.conditionCompleted && canUpdateMilestoneCondition ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleMarkMilestoneComplete(milestone.taskId)}
                                            disabled={milestoneUpdatingId === milestone.taskId}
                                          >
                                            {milestoneUpdatingId === milestone.taskId ? (
                                              <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Updating...
                                              </>
                                            ) : (
                                              'Mark Condition Done'
                                            )}
                                          </Button>
                                        ) : null}
                                        {milestone.conditionCompleted &&
                                        !milestone.linkedInvoice &&
                                        canManageMilestoneInvoices ? (
                                          <Button
                                            size="sm"
                                            onClick={() => handleCreateInvoiceDraft(milestone.taskId)}
                                            disabled={invoiceDraftingMilestoneId === milestone.taskId}
                                          >
                                            {invoiceDraftingMilestoneId === milestone.taskId ? (
                                              <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Drafting...
                                              </>
                                            ) : (
                                              'Create Draft Invoice'
                                            )}
                                          </Button>
                                        ) : null}
                                        {milestone.linkedInvoice?.status === 'draft' &&
                                        canManageMilestoneInvoices ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleIssueInvoice(milestone.linkedInvoice!.id)}
                                            disabled={issuingInvoiceId === milestone.linkedInvoice.id}
                                          >
                                            {issuingInvoiceId === milestone.linkedInvoice.id ? (
                                              <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Issuing...
                                              </>
                                            ) : (
                                              'Issue Draft'
                                            )}
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                ) : null}

                <TabsContent value="documents" className="space-y-6">
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
                      {canEditCosting && latestCostingReviewReason && costingStatus === 'rejected' ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                          <p className="font-medium text-red-800">Partner review point</p>
                          <p className="mt-1 text-red-700">{latestCostingReviewReason}</p>
                          {workflowSnapshot?.manager?.latestReviewAt ? (
                            <p className="mt-2 text-xs text-red-700/80">
                              Returned on {new Date(workflowSnapshot.manager.latestReviewAt).toLocaleString()}
                              {latestCostingReviewLabel ? ` by ${latestCostingReviewLabel}` : ''}.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {canEditCosting && requiredDocumentChecklist.length > 0 ? (
                        <div className="mb-4 space-y-3 rounded-lg border p-3">
                          <p className="text-sm font-medium">Required Documents</p>
                          {requiredDocumentChecklist.map((requirement) => {
                            const uploadKey = requirement.type;
                            const selectedFile = pendingUploads[uploadKey];
                            return (
                              <div
                                key={requirement.type}
                                className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
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
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                                    disabled={!selectedFile || uploadingDocumentType === requirement.type}
                                  >
                                    {uploadingDocumentType === requirement.type ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Uploading...
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="mr-2 h-4 w-4" />
                                        {requirement.uploaded ? 'Replace' : 'Upload'}
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

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
                            className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{doc.fileName}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDocumentType(doc.documentType)}
                                {doc.createdAt ? ` | ${new Date(doc.createdAt).toLocaleDateString()}` : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge className={getVerificationBadgeClass(doc.verificationStatus)}>
                                {doc.verificationStatus || 'pending'}
                              </Badge>
                              <Button size="sm" variant="outline" onClick={() => setPreviewDocument(doc)}>
                                Preview
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {invoiceTracking?.milestones.length ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Milestone Review Documents</CardTitle>
                        <CardDescription>
                          Files uploaded against specific milestones for manager, partner, and future
                          job review.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {invoiceTracking.milestones.map((milestone) => {
                          const documents = milestoneDocuments[milestone.taskId] || [];
                          const ownerLabel = milestone.assignedToProfileId
                            ? milestoneOwnerNameByProfileId.get(milestone.assignedToProfileId) ||
                              `Profile ${milestone.assignedToProfileId}`
                            : 'Unassigned';
                          return (
                            <div key={`milestone-documents-${milestone.taskId}`} className="space-y-3 rounded-lg border p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium">
                                    {milestone.targetPercent}% - {milestone.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Owner: {ownerLabel}
                                    {milestone.dueDate
                                      ? ` | Due ${new Date(milestone.dueDate).toLocaleDateString()}`
                                      : ''}
                                  </p>
                                </div>
                                <Badge variant="outline">
                                  {documents.length} file{documents.length === 1 ? '' : 's'}
                                </Badge>
                              </div>

                              {documents.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No milestone-specific documents uploaded yet.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {documents.map((document) => (
                                    <div
                                      key={`milestone-document-${document.id}`}
                                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate font-medium">{document.fileName}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {formatDocumentType(document.documentType)}
                                          {document.createdAt
                                            ? ` | ${new Date(document.createdAt).toLocaleDateString()}`
                                            : ''}
                                        </p>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <Badge className={getVerificationBadgeClass(document.verificationStatus)}>
                                          {document.verificationStatus || 'pending'}
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setPreviewDocument(document)}
                                        >
                                          Preview
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>

                {!isEmployeeExperience ? (
                  <TabsContent value="costing" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Partner Review Package</CardTitle>
                        <CardDescription>
                          The assigned partner reviews the costing, work plan, and budget before the team can start work.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2 rounded-lg border p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Current costing status</p>
                              <Badge className={getCostingStatusBadgeClass(costingStatus)}>
                                {formatStatusLabel(costingStatus || 'draft')}
                              </Badge>
                            </div>
                            {workflowSnapshot?.manager?.submittedAt ? (
                              <p className="text-xs text-muted-foreground">
                                Submitted {new Date(workflowSnapshot.manager.submittedAt).toLocaleString()}
                              </p>
                            ) : null}
                          </div>
                          {costingStatus === 'approved' && workflowSnapshot?.manager?.approvedAt ? (
                            <p className="text-sm text-green-700">
                              Approved on {new Date(workflowSnapshot.manager.approvedAt).toLocaleString()}.
                            </p>
                          ) : null}
                          {latestCostingReviewReason && costingStatus === 'rejected' ? (
                            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                              <p className="font-medium">Latest partner review point</p>
                              <p className="mt-1">{latestCostingReviewReason}</p>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-3">
                          <p className="text-sm font-medium">Required documents for partner review</p>
                          {partnerReviewDocumentChecklist.map((requirement) => (
                            <div
                              key={`partner-review-${requirement.type}`}
                              className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">{requirement.label}</p>
                                {requirement.latestDocument ? (
                                  <p className="truncate text-xs text-muted-foreground">
                                    Latest upload: {requirement.latestDocument.fileName}
                                  </p>
                                ) : (
                                  <p className="text-xs text-red-600">Missing</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  className={
                                    requirement.latestDocument
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
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
                                disabled={Boolean(partnerReviewSaving) || costingStatus !== 'submitted'}
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
                                  missingPartnerReviewLinks.length > 0
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
                            {!canEditCosting ? (
                              <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                                <p className="font-medium text-foreground">Manager-owned step</p>
                                <p className="mt-2">
                                  {managerDisplayName} must complete costing, upload the work plan and budget, and submit the package before employees can start working on this job.
                                </p>
                              </div>
                            ) : null}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                                {isFixedFeeJob ? (
                                  <p className="text-xs text-muted-foreground">
                                    Job fee is locked to the approved engagement letter.
                                  </p>
                                ) : null}
                              </div>
                              <div className="space-y-2">
                                <Label>Allocation Summary</Label>
                                <div className="space-y-2 rounded-lg border p-3 text-sm">
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
                                  className="grid grid-cols-1 items-start gap-3 rounded-lg border p-3 md:grid-cols-[1fr_120px_120px_120px]"
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
                                <div key={milestone.id} className="space-y-3 rounded-lg border p-4">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium">Milestone {index + 1}</p>
                                    {milestoneDrafts.length > 1 ? (
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
                                    ) : null}
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                              <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Total Hours</p>
                                <p className="text-lg font-semibold">{totalAllocatedHours.toFixed(2)}h</p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Estimated Cost</p>
                                <p className="text-lg font-semibold">
                                  KES {totalEstimatedCost.toLocaleString()}
                                </p>
                              </div>
                              <div className="rounded-lg border p-3">
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
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                  </>
                                ) : costingStatus === 'rejected' ? (
                                  'Resubmit for Partner Review'
                                ) : (
                                  'Save & Submit for Partner Review'
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                ) : null}
              </Tabs>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Created: {selectedJob.createdAt ? new Date(selectedJob.createdAt).toLocaleDateString() : '-'}
                    </div>
                    <div>Outstanding collections: {formatCurrency(currentOutstandingAmount)}</div>
                    <div>Approved requisition spend: {formatCurrency(currentApprovedSpend)}</div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : !trackingLoading ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                This job could not be loaded.
              </CardContent>
            </Card>
          ) : null}

          <DocumentPreviewDialog
            open={Boolean(previewDocument)}
            onOpenChange={(open) => {
              if (!open) setPreviewDocument(null);
            }}
            title={previewDocument?.fileName || 'Job Document'}
            documentId={previewDocument?.id}
            filePath={previewDocument?.filePath}
            fileName={previewDocument?.fileName}
            mimeType={previewDocument?.mimeType}
            description={
              previewDocument?.description || 'Preview the job document and download it if needed.'
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Job Operations</h1>
            <p className="max-w-3xl text-muted-foreground">
              {isEmployeeExperience
                ? 'Track your assigned jobs, milestone delivery, and payment visibility from one focused operations board.'
                : 'Monitor the full job flow from onboarding and staffing through costing, collections, and delivery.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={loadJobs} disabled={isLoading} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              {isLoading ? 'Loading...' : 'Refresh'}
            </Button>
            {!isEmployeeExperience ? (
              <Button variant="outline" onClick={() => navigate('/admin-job-creation')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Job
              </Button>
            ) : null}
          </div>
        </div>

        <JobOperationsOverview
          title="Workflow command board"
          description="Use the board to spot jobs that need action, then open a job card to inspect milestone, finance, and delivery detail."
          metrics={workflowJobMetrics}
          jobs={jobs}
          showBoardLink={false}
        />

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
          <Card className="border-border/60 bg-white/90">
            <CardHeader>
              <CardTitle>Project summary</CardTitle>
              <CardDescription>Prioritized jobs with delivery, due dates, and commercial pressure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {boardJobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-12 text-center text-sm text-muted-foreground">
                  No jobs are in scope yet.
                </div>
              ) : (
                boardJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => openTrackingJob(job.id)}
                    className="grid w-full gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-primary/20 hover:bg-white hover:shadow-sm xl:grid-cols-[2.1fr_0.9fr_0.9fr_0.8fr_1.1fr]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{job.jobName}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {job.client?.clientName || 'Client pending'} / {job.jobCode || `JOB-${job.id}`}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      <p className="uppercase tracking-[0.16em] text-slate-400">Due</p>
                      <p className="mt-1 font-medium text-slate-700">
                        {job.dueDate ? new Date(job.dueDate).toLocaleDateString() : 'No due date'}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      <p className="uppercase tracking-[0.16em] text-slate-400">Status</p>
                      <Badge className={`mt-1 ${statusColors[job.status] || statusColors.planned}`}>
                        {formatStatusLabel(job.status)}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500">
                      <p className="uppercase tracking-[0.16em] text-slate-400">Outstanding</p>
                      <p className="mt-1 font-medium text-slate-700">{formatCurrency(job.outstandingAmount)}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Progress</span>
                        <span>{job.progressPercent}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-primary via-secondary to-brand-orange"
                          style={{ width: `${job.progressPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{job.billableHours.toFixed(1)}h billable</span>
                        <span>{formatPercent(job.marginPercent)}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-white/90">
            <CardHeader>
              <CardTitle>Overall progress</CardTitle>
              <CardDescription>Portfolio-level health from job status, staffing, and collections.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <div
                  className="grid h-44 w-44 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(hsl(var(--secondary)) 0 ${boardRollup.weightedProgress}%, rgba(148,163,184,0.18) ${boardRollup.weightedProgress}% 100%)`,
                  }}
                >
                  <div className="grid h-32 w-32 place-items-center rounded-full bg-white shadow-inner">
                    <div>
                      <p className="text-3xl font-semibold text-slate-900">{boardRollup.weightedProgress}%</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Portfolio health</p>
                    </div>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-3 text-left">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Completed</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{boardRollup.completed}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Executing</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{boardRollup.inProgress}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Planned</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{boardRollup.planned}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">On hold</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{boardRollup.onHold}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.4fr]">
          <Card className="border-border/60 bg-white/90">
            <CardHeader>
              <CardTitle>Today action queue</CardTitle>
              <CardDescription>Operational issues that need attention before they become blockers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {boardActionItems.map((item) => (
                <div
                  key={item.title}
                  className={`rounded-2xl border px-4 py-4 ${boardActionToneClasses[item.tone] || boardActionToneClasses.primary}`}
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm opacity-90">{item.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-white/90">
            <CardHeader>
              <CardTitle>Projects workload</CardTitle>
              <CardDescription>How active job load is currently distributed across managers and partners.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {boardWorkloadByOwner.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                  No owner workload is available yet.
                </div>
              ) : (
                boardWorkloadByOwner.map((owner) => {
                  const width = jobs.length > 0 ? Math.max(12, Math.round((owner.total / jobs.length) * 100)) : 0;
                  return (
                    <div key={owner.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{owner.label}</p>
                          <p className="text-sm text-slate-500">
                            {owner.live} live / {owner.total} total jobs
                          </p>
                        </div>
                        <div className="text-sm font-medium text-slate-700">
                          Outstanding {formatCurrency(owner.outstanding)}
                        </div>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-primary via-secondary to-brand-orange"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
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

        <JobOperationsOverview
          title="Workflow command board"
          description="Follow the path from setup and staffing through costing, execution, and collection from a cleaner job-operations board."
          metrics={workflowJobMetrics}
          jobs={jobs}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Jobs ({jobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[32rem] overflow-y-auto pr-2">
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

	                        <Card className="border-dashed">
	                          <CardHeader className="pb-3">
	                            <CardTitle>Requisition Spend</CardTitle>
	                            <CardDescription>
	                              Approved job-linked requisitions now feed the job cost position and reporting.
	                            </CardDescription>
	                          </CardHeader>
	                          <CardContent className="space-y-4">
	                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
	                              <div className="border rounded-lg p-3">
	                                <p className="text-xs text-muted-foreground">Approved Spend</p>
	                                <p className="text-lg font-semibold">
	                                  {formatCurrency(Number(trackingSnapshot?.requisitions?.approvedSpend || 0))}
	                                </p>
	                                <p className="text-xs text-muted-foreground">
	                                  {trackingSnapshot?.requisitions?.approvedCount || 0} approved request(s)
	                                </p>
	                              </div>
	                              <div className="border rounded-lg p-3">
	                                <p className="text-xs text-muted-foreground">Committed Spend</p>
	                                <p className="text-lg font-semibold">
	                                  {formatCurrency(Number(trackingSnapshot?.requisitions?.committedSpend || 0))}
	                                </p>
	                                <p className="text-xs text-muted-foreground">
	                                  {trackingSnapshot?.requisitions?.pendingCount || 0} pending request(s)
	                                </p>
	                              </div>
	                              <div className="border rounded-lg p-3">
	                                <p className="text-xs text-muted-foreground">Labor Cost</p>
	                                <p className="text-lg font-semibold">
	                                  {formatCurrency(Number(trackingSnapshot?.financials?.laborCostToDate || 0))}
	                                </p>
	                                <p className="text-xs text-muted-foreground">Time-entry delivery cost to date</p>
	                              </div>
	                              <div className="border rounded-lg p-3">
	                                <p className="text-xs text-muted-foreground">Total Job Cost</p>
	                                <p className="text-lg font-semibold">
	                                  {formatCurrency(Number(trackingSnapshot?.financials?.costToDate || 0))}
	                                </p>
	                                <p className="text-xs text-muted-foreground">
	                                  Recoverable requisitions {formatCurrency(Number(trackingSnapshot?.financials?.recoverableRequisitionCost || 0))}
	                                </p>
	                              </div>
	                            </div>
	                            <div className="space-y-3">
	                              <div className="flex items-center justify-between">
	                                <p className="text-sm font-medium">Recent job requisitions</p>
	                                <Badge variant="outline">
	                                  {trackingSnapshot?.requisitions?.totalRequests || 0} total
	                                </Badge>
	                              </div>
	                              {trackingSnapshot?.requisitions?.recent?.length ? (
	                                <div className="space-y-2">
	                                  {trackingSnapshot.requisitions.recent.slice(0, 5).map((item) => (
	                                    <div
	                                      key={item.id}
	                                      className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
	                                    >
	                                      <div>
	                                        <p className="text-sm font-medium">{item.title}</p>
	                                        <p className="text-xs text-muted-foreground">
	                                          {item.requisitionNumber}
	                                          {item.requisitionTypeName ? ` · ${item.requisitionTypeName}` : ''}
	                                          {item.requesterName ? ` · ${item.requesterName}` : ''}
	                                        </p>
	                                      </div>
	                                      <div className="text-right">
	                                        <p className="text-sm font-semibold">
	                                          {formatCurrency(Number(item.amount || 0))}
	                                        </p>
	                                        <p className="text-xs text-muted-foreground">
	                                          {formatStatusLabel(item.status)}
	                                          {item.isClientRecoverable ? ' · Recoverable' : ''}
	                                        </p>
	                                      </div>
	                                    </div>
	                                  ))}
	                                </div>
	                              ) : (
	                                <p className="text-sm text-muted-foreground">
	                                  No job-linked requisitions have been raised yet.
	                                </p>
	                              )}
	                            </div>
	                          </CardContent>
	                        </Card>
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
                                  missingPartnerReviewLinks.length > 0
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
          documentId={previewDocument?.id}
          filePath={previewDocument?.filePath}
          fileName={previewDocument?.fileName}
          mimeType={previewDocument?.mimeType}
          description={previewDocument?.description || 'Preview the job document and download it if needed.'}
        />
      </div>
    </DashboardLayout>
  );
}
