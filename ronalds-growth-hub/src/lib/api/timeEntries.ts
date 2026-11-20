/**
 * Time Entries API - Timesheet Management
 * Includes timer feature, budget caps, and approval workflow
 */
import { api } from './client';
import type {
  TimeEntry,
  TimeEntryApprovalRequest,
  PaginatedResponse,
  TimeEntryStatus
} from './types';

interface CreateTimeEntryPayload {
  jobId?: number | null;
  proposalId?: number | null;
  taskId?: number;
  date?: string;
  dateWorked?: string;
  hours?: number;
  startedAt?: string;
  endedAt?: string;
  description?: string;
  billable?: boolean;
  nonBillableCategory?: string | null;
  nonBillableActivityId?: number | null;
}

export interface NonBillableActivity {
  id: number;
  code: string;
  name: string;
  categoryGroup: string;
  isProductive: boolean;
  requiresJob: boolean;
}

export type UtilizationPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface UtilizationSummary {
  profileId: number;
  period: UtilizationPeriod;
  label: string;
  startDate: string;
  endDate: string;
  standardDailyHours: number;
  billableTargetPercent: number;
  nonBillableTargetPercent: number;
  workingDays: number;
  holidayDays: number;
  approvedLeaveHours: number;
  expectedWorkingHours: number;
  expectedBillableHours: number;
  expectedNonBillableHours: number;
  actualBillableHours: number;
  actualNonBillableHours: number;
  actualProductiveNonBillableHours: number;
  actualOtherNonBillableHours: number;
  billableAchievementPercent: number;
  nonBillableAchievementPercent: number;
  billableVarianceHours: number;
  nonBillableVarianceHours: number;
  targetHours: number;
  utilizationPercent: number;
  utilizationVarianceHours: number;
  utilizationStatus: 'on_track' | 'at_risk' | 'off_track';
  benchmarkPercent: number;
  status: 'on_track' | 'at_risk' | 'off_track';
  statusBasis: 'billable' | 'non_billable';
}

interface TimeEntryFilters {
  page?: number;
  pageSize?: number;
  employeeProfileId?: number;
  jobId?: number;
  proposalId?: number;
  taskId?: number;
  status?: TimeEntryStatus | TimeEntryStatus[];
  billableOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface JobAllocationSummary {
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
  billableApprovedExcessHours?: number;
  nonBillableApprovedExcessHours?: number;
  billableLoggedHours?: number;
  nonBillableLoggedHours?: number;
  billableAllowedHours?: number;
  nonBillableAllowedHours?: number;
  billableRemainingHours?: number;
  nonBillableRemainingHours?: number;
  allocationSource?: string;
}

export interface OverAllocationRequest {
  id: number;
  jobId: number;
  employeeProfileId: number;
  timeEntryId?: number | null;
  allocatedHours: number;
  loggedHours: number;
  requestedAdditional: number;
  totalAfterRequest: number;
  billableType: string;
  status: string;
  requestReason?: string | null;
  approvalNotes?: string | null;
  rejectionReason?: string | null;
  decidedByProfileId?: number | null;
  decidedAt?: string | null;
  createdAt: string;
  job?: { id: number; jobName: string; client?: { id: number; clientName: string } | null };
  employee?: { id: number; firstName: string; lastName: string };
  timeEntry?: {
    id: number;
    hours: number;
    billable: boolean;
    status: string;
    description?: string | null;
    dateWorked: string;
  } | null;
}

export const timeEntriesAPI = {
  /**
   * List time entries with pagination and filters
   */
  list: async (filters?: TimeEntryFilters): Promise<PaginatedResponse<TimeEntry>> => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.employeeProfileId) params.append('employeeProfileId', String(filters.employeeProfileId));
    if (filters?.jobId) params.append('jobId', String(filters.jobId));
    if (filters?.proposalId) params.append('proposalId', String(filters.proposalId));
    if (filters?.taskId) params.append('taskId', String(filters.taskId));
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        filters.status.forEach(s => params.append('status', s));
      } else {
        params.append('status', filters.status);
      }
    }
    if (typeof filters?.billableOnly === 'boolean') {
      params.append('billableOnly', String(filters.billableOnly));
    }
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    
    const query = params.toString();
    return api.get(`/time-entries${query ? `?${query}` : ''}`);
  },

  /**
   * Get my time entries
   */
  getMyEntries: async (filters?: Omit<TimeEntryFilters, 'employeeProfileId'>): Promise<PaginatedResponse<TimeEntry>> => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.jobId) params.append('jobId', String(filters.jobId));
    if (filters?.proposalId) params.append('proposalId', String(filters.proposalId));
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        filters.status.forEach(s => params.append('status', s));
      } else {
        params.append('status', filters.status);
      }
    }
    
    const query = params.toString();
    return api.get(`/time-entries/my${query ? `?${query}` : ''}`);
  },

  /**
   * Get time entry by ID
   */
  getById: async (id: number): Promise<TimeEntry> => {
    return api.get(`/time-entries/${id}`);
  },

  /**
   * Create a new time entry
   */
  create: async (data: CreateTimeEntryPayload): Promise<TimeEntry> => {
    const payload = {
      jobId: data.jobId,
      proposalId: data.proposalId,
      taskId: data.taskId,
      dateWorked: data.dateWorked ?? data.date,
      hours: data.hours,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      description: data.description,
      billable: data.billable,
      nonBillableCategory: data.nonBillableCategory,
      nonBillableActivityId: data.nonBillableActivityId,
    };
    return api.post('/time-entries', payload);
  },

  /**
   * List active non-billable activities that can be logged without a job
   */
  listNonBillableActivities: async (): Promise<NonBillableActivity[]> => {
    return api.get('/time-entries/non-billable-activities');
  },

  /**
   * Get billable/non-billable threshold summaries for a period
   */
  getUtilization: async (params?: {
    period?: UtilizationPeriod;
    periods?: UtilizationPeriod[];
    date?: string;
    profileId?: number;
  }): Promise<UtilizationSummary[] | UtilizationSummary> => {
    const search = new URLSearchParams();
    if (params?.period) search.append('period', params.period);
    if (params?.periods?.length) search.append('periods', params.periods.join(','));
    if (params?.date) search.append('date', params.date);
    if (params?.profileId) search.append('profileId', String(params.profileId));
    const query = search.toString();
    return api.get(`/time-entries/utilization${query ? `?${query}` : ''}`);
  },

  /**
   * Update a time entry (only if pending)
   */
  update: async (id: number, data: Partial<CreateTimeEntryPayload>): Promise<TimeEntry> => {
    return api.patch(`/time-entries/${id}`, data);
  },

  /**
   * Delete a time entry (only if pending)
   */
  delete: async (id: number): Promise<void> => {
    return api.delete(`/time-entries/${id}`);
  },

  /**
   * Submit time entry for approval
   */
  submit: async (id: number): Promise<TimeEntry> => {
    return api.patch(`/time-entries/${id}/submit`);
  },

  /**
   * Submit multiple time entries for approval
   */
  submitBulk: async (ids: number[]): Promise<{ submitted: number; errors: string[] }> => {
    return api.post('/time-entries/batch/submit', { timeEntryIds: ids });
  },

  // ==================
  // APPROVAL WORKFLOW
  // ==================

  /**
   * Get pending time entries for approval (manager/partner)
   */
  getPendingApprovals: async (filters?: {
    jobId?: number;
    employeeProfileId?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<TimeEntry[]> => {
    const params = new URLSearchParams();
    if (filters?.jobId) params.append('jobId', String(filters.jobId));
    if (filters?.employeeProfileId) params.append('employeeProfileId', String(filters.employeeProfileId));
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    params.append('status', 'submitted');
    
    const query = params.toString();
    const response = await api.get<TimeEntry[] | PaginatedResponse<TimeEntry>>(
      `/time-entries${query ? `?${query}` : ''}`
    );
    if (Array.isArray(response)) {
      return response;
    }
    return Array.isArray(response?.data) ? response.data : [];
  },

  /**
   * Approve a time entry
   */
  approve: async (id: number, approvalNotes = ''): Promise<TimeEntry> => {
    return api.patch(`/time-entries/${id}/approve`, { approvalNotes });
  },

  /**
   * Approve multiple time entries
   */
  approveBulk: async (ids: number[]): Promise<{ approved: number; errors: string[] }> => {
    return api.post('/time-entries/batch/approve', { timeEntryIds: ids });
  },

  /**
   * Reject a time entry
   */
  reject: async (id: number, rejectionReason: string): Promise<TimeEntry> => {
    return api.patch(`/time-entries/${id}/reject`, { rejectionReason });
  },

  // ==================
  // APPROVAL REQUESTS
  // ==================

  /**
   * Request additional hours for a job
   */
  createApprovalRequest: async (data: {
    jobId: number;
    additionalHours: number;
    justification: string;
    requestType?: string;
  }): Promise<TimeEntryApprovalRequest> => {
    return api.post('/time-entries/approval-requests', data);
  },

  /**
   * List approval requests (employee sees own, managers see all)
   */
  listApprovalRequests: async (filters?: {
    jobId?: number;
    employeeProfileId?: number;
    status?: string;
  }): Promise<TimeEntryApprovalRequest[]> => {
    const params = new URLSearchParams();
    if (filters?.jobId) params.append('jobId', String(filters.jobId));
    if (filters?.employeeProfileId) params.append('employeeProfileId', String(filters.employeeProfileId));
    if (filters?.status) params.append('status', filters.status);
    const query = params.toString();
    return api.get(`/time-entries/approval-requests${query ? `?${query}` : ''}`);
  },

  /**
   * Approve additional hours
   */
  approveApprovalRequest: async (requestId: number, approvalNotes?: string): Promise<TimeEntryApprovalRequest> => {
    return api.patch(`/time-entries/approval-requests/${requestId}/approve`, { approvalNotes });
  },

  /**
   * Reject additional hours
   */
  rejectApprovalRequest: async (requestId: number, approvalNotes?: string): Promise<TimeEntryApprovalRequest> => {
    return api.patch(`/time-entries/approval-requests/${requestId}/reject`, { approvalNotes });
  },

  listOverBudgetRequests: async (filters?: {
    jobId?: number;
    employeeProfileId?: number;
    status?: string;
  }): Promise<OverAllocationRequest[]> => {
    const params = new URLSearchParams();
    if (filters?.jobId) params.append('jobId', String(filters.jobId));
    if (filters?.employeeProfileId) {
      params.append('employeeProfileId', String(filters.employeeProfileId));
    }
    if (filters?.status) params.append('status', filters.status);
    const query = params.toString();
    return api.get(`/time-entries/over-budget-requests${query ? `?${query}` : ''}`);
  },

  /**
   * Approve over-budget request
   */
  approveOverBudgetRequest: async (requestId: number, approvalNotes?: string) => {
    return api.patch(`/time-entries/over-budget-requests/${requestId}/approve`, { approvalNotes });
  },

  /**
   * Reject over-budget request
   */
  rejectOverBudgetRequest: async (requestId: number, approvalNotes?: string) => {
    return api.patch(`/time-entries/over-budget-requests/${requestId}/reject`, { approvalNotes });
  },

  /**
   * Get weekly timesheet summary
   */
  getWeeklySummary: async (weekStart: string): Promise<{
    totalHours: number;
    billableHours: number;
    nonBillableHours: number;
    byJob: Array<{
      jobId: number;
      jobName: string;
      hours: number;
    }>;
    byDay: Record<string, number>;
  }> => {
    return api.get(`/time-entries/weekly-summary?weekStart=${weekStart}`);
  },

  /**
   * Get allocation + usage summary for a job
   */
  getJobAllocationSummary: async (jobId: number): Promise<JobAllocationSummary> => {
    return api.get(`/time-entries/job/${jobId}/allocation`);
  },
};

export default timeEntriesAPI;
