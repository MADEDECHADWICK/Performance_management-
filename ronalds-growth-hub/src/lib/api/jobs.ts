/**
 * Jobs API - Job Management
 */
import { api } from './client';
import type {
  Job,
  JobStaffAssignment,
  JobCosting,
  TaskStatus,
  JobInvoiceMilestoneTracking,
  JobInvoiceSummary,
  JobWorkflowTrackingResponse,
  PaginatedResponse,
  JobStatus,
  Priority,
  BillingType,
} from './types';

interface JobMilestonePayload {
  title: string;
  targetPercent: number;
  dueDate?: string;
  requirements?: string;
  assignedToProfileId?: number;
}

interface CreateJobPayload {
  jobName: string;
  description?: string;
  clientId: number;
  departmentId?: number;
  partnerProfileId?: number;
  managerProfileId?: number;
  startDate: string;
  dueDate?: string;
  priority?: Priority;
  billingType: BillingType;
  fixedFeeAmount?: number;
  budgetHours?: number;
  engagementLetterId?: number;
  milestones?: JobMilestonePayload[];
}

interface CreateJobFromOnboardingPayload {
  jobName?: string;
  description?: string;
  departmentId?: number;
  partnerProfileId?: number;
  managerProfileId: number;
  startDate: string;
  dueDate?: string;
  priority?: Priority;
  budgetHours?: number;
  milestones?: JobMilestonePayload[];
}

interface UpdateJobPayload extends Partial<CreateJobPayload> {
  status?: JobStatus;
  completionDate?: string;
}

interface JobFilters {
  page?: number;
  pageSize?: number;
  status?: JobStatus | JobStatus[];
  clientId?: number;
  partnerProfileId?: number;
  managerProfileId?: number;
  departmentId?: number;
  priority?: Priority;
}

export interface AssignStaffPayload {
  employeeProfileId: number;
  assignedRoleId: number;
  assignedHourlyRate: number;
  roleOnJob?: string;
  billableAllocatedHours?: number;
  nonBillableAllocatedHours?: number;
}

export interface UpdateStaffAssignmentPayload {
  assignedRoleId?: number;
  assignedHourlyRate?: number;
  roleOnJob?: string;
  billableAllocatedHours?: number;
  nonBillableAllocatedHours?: number;
}

export type JobWorkingLinkType =
  | 'milestone_requirement'
  | 'proposal'
  | 'cost_estimate'
  | 'work_plan'
  | 'budget'
  | 'other';

export type JobWorkingLinkStatus = 'pending' | 'approved' | 'rejected';

export interface JobWorkingDocumentLink {
  id: number;
  jobId: number;
  milestoneTaskId?: number | null;
  linkType: JobWorkingLinkType;
  label: string;
  url: string;
  addedByProfileId: number;
  reviewStatus: JobWorkingLinkStatus;
  approvedByProfileId?: number | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  addedBy?: { id: number; firstName: string; lastName: string } | null;
  approvedBy?: { id: number; firstName: string; lastName: string } | null;
  milestoneTask?: { id: number; title: string; status: string } | null;
}

interface JobCostingPayload {
  jobFee: number;
  allocations: Array<{
    employeeProfileId: number;
    roleId: number;
    allocatedHours: number;
    hourlyRate?: number;
    billable?: boolean;
    taskDescription?: string;
  }>;
  notes?: string;
  capEnforced?: boolean;
  allowOverage?: boolean;
  maxOveragePercent?: number;
  milestones?: JobMilestonePayload[];
}

interface ReviewJobCostingPayload {
  decision: 'approved' | 'rejected';
  reviewNotes?: string;
}

export const jobsAPI = {
  /**
   * List all jobs with pagination and filters
   */
  list: async (filters?: JobFilters): Promise<PaginatedResponse<Job>> => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        params.append('status', filters.status.join(','));
      } else {
        params.append('status', filters.status);
      }
    }
    if (filters?.clientId) params.append('clientId', String(filters.clientId));
    if (filters?.partnerProfileId) params.append('partnerProfileId', String(filters.partnerProfileId));
    if (filters?.managerProfileId) params.append('managerProfileId', String(filters.managerProfileId));
    if (filters?.departmentId) params.append('departmentId', String(filters.departmentId));
    if (filters?.priority) params.append('priority', filters.priority);

    const query = params.toString();
    return api.get(`/jobs${query ? `?${query}` : ''}`);
  },

  /**
   * Get job by ID with details
   */
  getById: async (id: number): Promise<Job> => {
    return api.get(`/jobs/${id}`);
  },

  /**
   * Create a new job
   */
  create: async (data: CreateJobPayload): Promise<Job> => {
    return api.post('/jobs', data);
  },

  /**
   * Create a job from an approved onboarding record (HR queue)
   */
  createFromOnboarding: async (
    clientOnboardingId: number,
    data: CreateJobFromOnboardingPayload
  ): Promise<Job> => {
    return api.post(`/jobs/from-onboarding/${clientOnboardingId}`, data);
  },

  /**
   * Update an existing job
   */
  update: async (id: number, data: UpdateJobPayload): Promise<Job> => {
    return api.patch(`/jobs/${id}`, data);
  },

  /**
   * Update job status
   */
  updateStatus: async (id: number, status: JobStatus, reason?: string): Promise<Job> => {
    return api.patch(`/jobs/${id}/status`, { status, reason });
  },

  /**
   * Get milestone-based invoice tracking for a job
   */
  getInvoiceMilestones: async (jobId: number): Promise<JobInvoiceMilestoneTracking> => {
    return api.get(`/jobs/${jobId}/invoice-milestones`);
  },

  /**
   * Get unified workflow tracking payload for a job
   */
  getTracking: async (jobId: number): Promise<JobWorkflowTrackingResponse> => {
    return api.get(`/jobs/${jobId}/tracking`);
  },

  /**
   * Get invoice records generated for a job
   */
  getInvoices: async (jobId: number): Promise<JobInvoiceSummary[]> => {
    return api.get(`/jobs/${jobId}/invoices`);
  },

  /**
   * Create or return a draft invoice from a completed billing milestone
   */
  createInvoiceDraft: async (
    jobId: number,
    milestoneTaskId: number
  ): Promise<JobInvoiceSummary> => {
    return api.post(`/jobs/${jobId}/invoices/from-milestone/${milestoneTaskId}`);
  },

  /**
   * Issue a draft invoice and generate its document
   */
  issueInvoice: async (jobId: number, invoiceId: number): Promise<JobInvoiceSummary> => {
    return api.patch(`/jobs/${jobId}/invoices/${invoiceId}/issue`, {});
  },

  /**
   * Update a milestone's condition status
   */
  updateInvoiceMilestoneStatus: async (
    jobId: number,
    milestoneTaskId: number,
    status: TaskStatus
  ): Promise<{
    milestoneTask: {
      id: number;
      jobId: number;
      title: string;
      description?: string | null;
      status: TaskStatus;
      dueDate?: string | null;
      updatedAt: string;
    };
    tracking: JobInvoiceMilestoneTracking;
  }> => {
    return api.patch(`/jobs/${jobId}/invoice-milestones/${milestoneTaskId}/status`, { status });
  },

  // ==================
  // STAFF ASSIGNMENT
  // ==================

  /**
   * Get job staff assignments
   */
  getStaff: async (jobId: number): Promise<JobStaffAssignment[]> => {
    return api.get(`/jobs/${jobId}/staff`);
  },

  /**
   * Assign staff to job
   */
  assignStaff: async (jobId: number, data: AssignStaffPayload): Promise<JobStaffAssignment> => {
    return api.post(`/jobs/${jobId}/staff`, data);
  },

  updateStaff: async (
    jobId: number,
    assignmentId: number,
    data: UpdateStaffAssignmentPayload
  ): Promise<JobStaffAssignment> => {
    return api.patch(`/jobs/${jobId}/staff/${assignmentId}`, data);
  },

  removeStaff: async (jobId: number, assignmentId: number): Promise<{ removed: boolean }> => {
    return api.delete(`/jobs/${jobId}/staff/${assignmentId}`);
  },

  getWorkingLinks: async (jobId: number): Promise<JobWorkingDocumentLink[]> => {
    return api.get(`/jobs/${jobId}/working-links`);
  },

  addWorkingLink: async (
    jobId: number,
    data: {
      linkType: JobWorkingLinkType;
      label: string;
      url: string;
      milestoneTaskId?: number;
      notes?: string;
    }
  ): Promise<JobWorkingDocumentLink> => {
    return api.post(`/jobs/${jobId}/working-links`, data);
  },

  updateWorkingLink: async (
    jobId: number,
    linkId: number,
    data: Partial<{
      linkType: JobWorkingLinkType;
      label: string;
      url: string;
      notes: string;
    }>
  ): Promise<JobWorkingDocumentLink> => {
    return api.patch(`/jobs/${jobId}/working-links/${linkId}`, data);
  },

  removeWorkingLink: async (
    jobId: number,
    linkId: number
  ): Promise<{ deleted: boolean }> => {
    return api.delete(`/jobs/${jobId}/working-links/${linkId}`);
  },

  reviewWorkingLink: async (
    jobId: number,
    linkId: number,
    data: { status: 'approved' | 'rejected'; notes?: string }
  ): Promise<JobWorkingDocumentLink> => {
    return api.patch(`/jobs/${jobId}/working-links/${linkId}/review`, data);
  },

  // ==================
  // JOB COSTING
  // ==================

  /**
   * Get job costing
   */
  getCosting: async (jobId: number): Promise<JobCosting> => {
    return api.get(`/jobs/${jobId}/costing`);
  },

  /**
   * Create or update job costing
   */
  upsertCosting: async (jobId: number, data: JobCostingPayload): Promise<JobCosting> => {
    return api.post(`/jobs/${jobId}/costing`, data);
  },

  reviewCosting: async (jobId: number, data: ReviewJobCostingPayload): Promise<JobCosting> => {
    return api.patch(`/jobs/${jobId}/costing/review`, data);
  },

  // ==================
  // PROFITABILITY
  // ==================

  /**
   * Get job profitability metrics
   */
  getProfitability: async (jobId: number): Promise<{
    jobId: number;
    jobName: string;
    totalRevenue: number;
    totalCost: number;
    totalProfitLoss: number;
    marginPercent: number;
    billingType: BillingType;
    status: JobStatus;
  }> => {
    return api.get(`/jobs/${jobId}/profitability`);
  },
};

export default jobsAPI;
