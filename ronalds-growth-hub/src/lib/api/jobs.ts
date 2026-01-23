/**
 * Jobs API - Job Management
 */
import { api } from './client';
import type {
  Job,
  JobStaffAssignment,
  JobCosting,
  PaginatedResponse,
  JobStatus,
  Priority,
  BillingType,
} from './types';

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

interface AssignStaffPayload {
  employeeProfileId: number;
  assignedRoleId: number;
  assignedHourlyRate: number;
  roleOnJob?: string;
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
