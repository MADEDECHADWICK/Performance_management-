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
  jobId: number;
  taskId?: number;
  date?: string;
  dateWorked?: string;
  hours?: number;
  startedAt?: string;
  endedAt?: string;
  description?: string;
  billable?: boolean;
}

interface TimeEntryFilters {
  page?: number;
  pageSize?: number;
  employeeProfileId?: number;
  jobId?: number;
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
      taskId: data.taskId,
      dateWorked: data.dateWorked ?? data.date,
      hours: data.hours,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      description: data.description,
      billable: data.billable,
    };
    return api.post('/time-entries', payload);
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
    return api.post('/time-entries/batch/submit', { timeEntryIds: ids, time_entry_ids: ids });
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
  approve: async (id: number): Promise<TimeEntry> => {
    return api.patch(`/time-entries/${id}/approve`, { approval_notes: '' });
  },

  /**
   * Approve multiple time entries
   */
  approveBulk: async (ids: number[]): Promise<{ approved: number; errors: string[] }> => {
    return api.post('/time-entries/batch/approve', { timeEntryIds: ids, time_entry_ids: ids });
  },

  /**
   * Reject a time entry
   */
  reject: async (id: number, reason: string): Promise<TimeEntry> => {
    return api.patch(`/time-entries/${id}/reject`, { reason, rejection_reason: reason });
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
