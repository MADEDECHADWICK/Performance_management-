import { useEffect, useState } from 'react';
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
import { Briefcase, Calendar, RefreshCw, Users, Loader2, FileText } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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

export default function JobWorkflowDashboard() {
  const { toast } = useToast();
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
  const [milestoneUpdatingId, setMilestoneUpdatingId] = useState<number | null>(null);
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
      setJobs(response.data || []);
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
      const [job, staffAssignments, invoiceMilestones] = await Promise.all([
        jobsAPI.getById(jobId),
        jobsAPI.getStaff(jobId),
        jobsAPI.getInvoiceMilestones(jobId),
      ]);
      setSelectedJob(job);
      setStaff(staffAssignments);
      setInvoiceTracking(invoiceMilestones);
      await initializeCosting(job, staffAssignments);
      await loadAllocationSummary(jobId);
      await loadJobDocuments(jobId);
    } catch (error) {
      console.error('Failed to load job details:', error);
      setInvoiceTracking(null);
      setJobDocuments([]);
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
        remainingEmployeeHours: summary.remainingEmployeeHours,
      });
    } catch (error) {
      console.error('Failed to load allocation summary:', error);
      setAllocationSummary(null);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!Number.isFinite(selectedJobIdParam) || selectedJobIdParam <= 0) return;
    if (selectedJob?.id === selectedJobIdParam) return;
    if (!jobs.some((job) => job.id === selectedJobIdParam)) return;

    loadJobDetails(selectedJobIdParam);
  }, [jobs, selectedJob?.id, selectedJobIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <p className="text-muted-foreground">Monitor job progress and assignments</p>
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
                {selectedJob ? 'Review job summary and staff assignments.' : 'Select a job to view details.'}
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Job Documents
                      </CardTitle>
                      <CardDescription>
                        Work plan, budget, draft report, final report, and all job-linked uploads.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
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
                                  ? ` â€¢ ${new Date(doc.createdAt).toLocaleDateString()}`
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
                                      : 'â€”'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Logged</span>
                                  <span className="font-medium">
                                    {allocationSummary
                                      ? `${allocationSummary.loggedJobHours.toFixed(1)}h`
                                      : 'â€”'}
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
                                      : 'â€”'}
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
