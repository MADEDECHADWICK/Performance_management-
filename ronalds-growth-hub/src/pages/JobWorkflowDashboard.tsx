import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { documentsAPI, jobsAPI, timeEntriesAPI } from '@/lib/api';
import type {
  Job,
  JobStaffAssignment,
  JobInvoiceMilestoneTracking,
  JobInvoiceMilestoneTrackingItem,
} from '@/lib/api/types';
import { Briefcase, Calendar, RefreshCw, Users, Loader2, FileText, Upload } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
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
  verificationStatus?: string;
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

const millisecondsInDay = 24 * 60 * 60 * 1000;

const toStartOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const differenceInDays = (startDate: Date, endDate: Date) => {
  const start = toStartOfDay(startDate).getTime();
  const end = toStartOfDay(endDate).getTime();
  return Math.floor((end - start) / millisecondsInDay);
};

export default function JobWorkflowDashboard() {
  const { toast } = useToast();
  const { profile, isEmployee, isAdmin, isHR, isGMP, isPartner, isManager } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<JobStaffAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [costingForm, setCostingForm] = useState<CostingFormState | null>(null);
  const [costingLoading, setCostingLoading] = useState(false);
  const [costingSaving, setCostingSaving] = useState(false);
  const [allocationSummary, setAllocationSummary] = useState<AllocationSummary | null>(null);
  const [invoiceTracking, setInvoiceTracking] = useState<JobInvoiceMilestoneTracking | null>(null);
  const [jobDocuments, setJobDocuments] = useState<JobDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<Record<string, File | null>>({});
  const [uploadingDocumentType, setUploadingDocumentType] = useState<RequiredDocumentType | null>(null);
  const [milestoneUpdatingId, setMilestoneUpdatingId] = useState<number | null>(null);
  const isEmployeeExperience =
    isEmployee && !isAdmin && !isHR && !isGMP && !isPartner && !isManager;
  const isFixedFeeJob = selectedJob?.billingType === 'fixed_fee';
  const selectedJobIdParam = Number(searchParams.get('jobId'));
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const resolveDocumentUrl = (filePath?: string | null) => {
    if (!filePath) return '#';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    return `${baseUrl}${filePath}`;
  };

  const formatDocumentType = (value?: string) => {
    if (!value) return 'Document';
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getVerificationBadgeClass = (status?: string) => {
    if (status === 'verified') return 'bg-green-100 text-green-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
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
      setJobDocuments(parseDocumentsResponse(response));
    } catch (error) {
      console.error('Failed to load job documents:', error);
      setJobDocuments([]);
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

  const loadJobDetails = async (jobId: number) => {
    try {
      const [job, staffAssignments] = await Promise.all([
        jobsAPI.getById(jobId),
        jobsAPI.getStaff(jobId),
      ]);
      setSelectedJob(job);
      setStaff(staffAssignments);
      await Promise.all([loadAllocationSummary(jobId), loadJobDocuments(jobId)]);

      if (isEmployeeExperience) {
        setInvoiceTracking(null);
        setCostingForm(null);
      } else {
        const invoiceMilestones = await jobsAPI.getInvoiceMilestones(jobId);
        setInvoiceTracking(invoiceMilestones);
        await initializeCosting(job, staffAssignments);
      }
    } catch (error) {
      console.error('Failed to load job details:', error);
      setInvoiceTracking(null);
      setCostingForm(null);
      setJobDocuments([]);
      setAllocationSummary(null);
      toast({
        title: 'Error',
        description: 'Failed to load job details',
        variant: 'destructive',
      });
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

  const employeeAssignment = useMemo(() => {
    if (!profile?.id) return null;
    return staff.find((assignment) => assignment.employeeProfileId === profile.id) || null;
  }, [profile?.id, staff]);

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
    if (!allocationSummary || allocationSummary.allowedEmployeeHours <= 0) return 0;
    return Math.min(
      100,
      Math.round((allocationSummary.loggedEmployeeHours / allocationSummary.allowedEmployeeHours) * 100)
    );
  }, [allocationSummary]);

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

  const handleUploadRequiredDocument = async (documentType: RequiredDocumentType) => {
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
        description: `${REQUIRED_DOCUMENTS_BY_TYPE[documentType].label} uploaded via employee workflow.`,
      });
      await loadJobDocuments(selectedJob.id);
      setPendingUploads((prev) => ({ ...prev, [documentType]: null }));
      toast({
        title: 'Document uploaded',
        description: `${REQUIRED_DOCUMENTS_BY_TYPE[documentType].label} uploaded successfully.`,
      });
    } catch (error) {
      console.error('Required document upload failed:', error);
      toast({
        title: 'Upload failed',
        description: 'Unable to upload the selected document.',
        variant: 'destructive',
      });
    } finally {
      setUploadingDocumentType(null);
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

  const handleSaveCosting = async () => {
    if (!selectedJob || !costingForm) return;

    if (!costingForm.jobFee || Number(costingForm.jobFee) <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Job fee is required before saving costing.',
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

    try {
      setCostingSaving(true);
      await jobsAPI.upsertCosting(selectedJob.id, {
        jobFee: Number(costingForm.jobFee),
        allocations,
        notes: costingForm.notes || undefined,
        capEnforced: costingForm.capEnforced,
        allowOverage: costingForm.allowOverage,
        maxOveragePercent: Number(costingForm.maxOveragePercent),
      });
      await loadAllocationSummary(selectedJob.id);
      toast({
        title: 'Costing Saved',
        description: 'Job costing and allocations updated successfully.',
      });
    } catch (error) {
      console.error('Failed to save costing:', error);
      toast({
        title: 'Error',
        description: 'Failed to save job costing.',
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
  }, [selectedJob?.id]);

  useEffect(() => {
    if (!Number.isFinite(selectedJobIdParam) || selectedJobIdParam <= 0) return;
    if (selectedJob?.id === selectedJobIdParam) return;
    if (!jobs.some((job) => job.id === selectedJobIdParam)) return;

    loadJobDetails(selectedJobIdParam);
  }, [jobs, selectedJob?.id, selectedJobIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedJob) return;
    if (jobs.some((job) => job.id === selectedJob.id)) return;

    setSelectedJob(null);
    setStaff([]);
    setInvoiceTracking(null);
    setCostingForm(null);
    setAllocationSummary(null);
    setJobDocuments([]);
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
                  onClick={() => loadJobDetails(job.id)}
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
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    {job.dueDate ? new Date(job.dueDate).toLocaleDateString() : 'No due date'}
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
                      <p className="font-medium">
                        {selectedJob.partner
                          ? `${selectedJob.partner.firstName} ${selectedJob.partner.lastName}`
                          : 'Not assigned'}
                      </p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Manager</p>
                      <p className="font-medium">
                        {selectedJob.manager
                          ? `${selectedJob.manager.firstName} ${selectedJob.manager.lastName}`
                          : 'Not assigned'}
                      </p>
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

                  {isEmployeeExperience && (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle>Your Job Performance</CardTitle>
                          <CardDescription>
                            Track your utilization, assigned role, and remaining time budget.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Assigned Role</p>
                            <p className="font-medium">{employeeAssignment?.role?.name || 'Not set'}</p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Allocated (You)</p>
                            <p className="font-semibold">
                              {allocationSummary ? `${allocationSummary.allowedEmployeeHours.toFixed(1)}h` : '-'}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Logged (You)</p>
                            <p className="font-semibold">
                              {allocationSummary ? `${allocationSummary.loggedEmployeeHours.toFixed(1)}h` : '-'}
                            </p>
                          </div>
                          <div className="border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Utilization</p>
                            <p className="font-semibold">{employeeUtilizationPercent}%</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {allocationSummary
                                ? `${allocationSummary.remainingEmployeeHours.toFixed(1)}h remaining`
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
                              No payment milestones were configured during job creation.
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
                        {isEmployeeExperience
                          ? 'Upload required workflow documents and review your job files.'
                          : 'Work plan, budget, draft report, final report, and all job-linked uploads.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {isEmployeeExperience && requiredDocumentChecklist.length > 0 && (
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
                              <a
                                href={resolveDocumentUrl(doc.filePath)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button size="sm" variant="outline">
                                  View
                                </Button>
                              </a>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

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
                      <CardTitle>Job Costing & Allocations</CardTitle>
                      <CardDescription>
                        Managers allocate hours per staff member before time logging begins.
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
                                disabled={isFixedFeeJob}
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
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button onClick={handleSaveCosting} disabled={costingSaving}>
                              {costingSaving ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                'Save Costing'
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
      </div>
    </DashboardLayout>
  );
}
