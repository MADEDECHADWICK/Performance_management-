/**
 * Time Entries API - Timesheet Management
 * Includes timer feature, budget caps, and approval workflow
 */
import { api } from './client';
import type { 
  TimeEntry, 
  TimeOverBudgetRequest,
  PaginatedResponse,
  TimeEntryStatus,
  BillableType
} from './types';

interface CreateTimeEntryPayload {
  jobId: number;
  taskId?: number;
  date?: string;
  dateWorked?: string;
  hours: number;
  description?: string;
  billableType?: BillableType;
  billable?: boolean;
}

interface TimeEntryFilters {
  page?: number;
  pageSize?: number;
  employeeProfileId?: number;
  jobId?: number;
  taskId?: number;
  status?: TimeEntryStatus | TimeEntryStatus[];
  billableType?: BillableType;
  dateFrom?: string;
  dateTo?: string;
}

interface TimerSession {
  id: string;
  jobId: number;
  taskId?: number;
  startTime: string;
  description?: string;
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
    if (filters?.billableType) params.append('billableType', filters.billableType);
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
      description: data.description,
      billable: data.billable ?? (data.billableType ? data.billableType === 'billable' : undefined),
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
    return api.post('/time-entries/batch/submit', { time_entry_ids: ids });
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
    return api.get(`/time-entries${query ? `?${query}` : ''}`);
  },

  /**
   * Approve a time entry
   */
  approve: async (id: number): Promise<TimeEntry> => {
    return api.patch(`/time-entries/${id}/approve`);
  },

  /**
   * Approve multiple time entries
   */
  approveBulk: async (ids: number[]): Promise<{ approved: number; errors: string[] }> => {
    return api.post('/time-entries/batch/approve', { time_entry_ids: ids });
  },

  /**
   * Reject a time entry
   */
  reject: async (id: number, reason: string): Promise<TimeEntry> => {
    return api.patch(`/time-entries/${id}/reject`, { rejection_reason: reason });
  },

  // ==================
  // TIMER FEATURE
  // ==================

  /**
   * Start timer for a job
   */
  startTimer: async (jobId: number, taskId?: number, description?: string): Promise<TimerSession> => {
    return api.post('/time-entries/timer/start', { jobId, taskId, description });
  },

  /**
   * Pause timer
   */
  pauseTimer: async (sessionId: string): Promise<TimerSession> => {
    return api.post(`/time-entries/timer/${sessionId}/pause`);
  },

  /**
   * Resume timer
   */
  resumeTimer: async (sessionId: string): Promise<TimerSession> => {
    return api.post(`/time-entries/timer/${sessionId}/resume`);
  },

  /**
   * Stop timer and create time entry
   */
  stopTimer: async (sessionId: string): Promise<TimeEntry> => {
    return api.post(`/time-entries/timer/${sessionId}/stop`);
  },

  /**
   * Get active timer session
   */
  getActiveTimer: async (): Promise<TimerSession | null> => {
    return api.get('/time-entries/timer/active');
  },

  // ==================
  // OVER-BUDGET REQUESTS
  // ==================

  /**
   * Request additional time (when budget cap reached)
   */
  requestAdditionalTime: async (jobId: number, data: {
    requestedHours: number;
    reason: string;
    billableType: BillableType;
  }): Promise<TimeOverBudgetRequest> => {
    return api.post(`/time-entries/over-budget-request`, { jobId, ...data });
  },

  /**
   * Get my over-budget requests
   */
  getMyOverBudgetRequests: async (): Promise<TimeOverBudgetRequest[]> => {
    return api.get('/time-entries/over-budget-requests/my');
  },

  /**
   * Get pending over-budget requests (for manager/partner)
   */
  getPendingOverBudgetRequests: async (): Promise<TimeOverBudgetRequest[]> => {
    return api.get('/time-entries/over-budget-requests/pending');
  },

  /**
   * Approve over-budget request (manager)
   */
  approveOverBudgetRequest: async (requestId: number): Promise<TimeOverBudgetRequest> => {
    return api.post(`/time-entries/over-budget-requests/${requestId}/manager-approve`);
  },

  /**
   * Approve over-budget request (partner - final)
   */
  partnerApproveOverBudgetRequest: async (requestId: number): Promise<TimeOverBudgetRequest> => {
    return api.post(`/time-entries/over-budget-requests/${requestId}/partner-approve`);
  },

  /**
   * Reject over-budget request
   */
  rejectOverBudgetRequest: async (requestId: number, reason: string): Promise<TimeOverBudgetRequest> => {
    return api.post(`/time-entries/over-budget-requests/${requestId}/reject`, { reason });
  },

  // ==================
  // BUDGET & SUMMARIES
  // ==================

  /**
   * Get budget status for a job
   */
  getJobBudgetStatus: async (jobId: number): Promise<{
    allocatedHours: number;
    usedHours: number;
    remainingHours: number;
    billableHours: number;
    nonBillableHours: number;
    isOverBudget: boolean;
    percentUsed: number;
  }> => {
    return api.get(`/time-entries/job/${jobId}/budget-status`);
  },

  /**
   * Get my allocated jobs with budget status
   */
  getMyJobsWithBudget: async (): Promise<Array<{
    jobId: number;
    jobName: string;
    clientName: string;
    allocatedHours: number;
    usedHours: number;
    remainingHours: number;
    status: string;
  }>> => {
    return api.get('/time-entries/my-jobs-budget');
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
};

export default timeEntriesAPI;
