/**
 * KPIs API - Key Performance Indicators Management
 * Supports financial/non-financial KPIs with targets and frequencies
 */
import { api } from './client';
import type { 
  Kpi, 
  EmployeeKpiAssignment,
  PaginatedResponse 
} from './types';

interface CreateKpiPayload {
  name: string;
  description?: string;
  category: string;
  isFinancial: boolean;
  departmentId?: number;
  roleId?: number;
  targetValue?: number;
  targetCurrency?: string;
  frequency?: 'monthly' | 'quarterly' | 'annually' | 'other';
  weight?: number;
}

interface KpiFilters {
  page?: number;
  pageSize?: number;
  category?: string;
  isFinancial?: boolean;
  departmentId?: number;
  roleId?: number;
  isActive?: boolean;
}

interface AssignKpiPayload {
  employeeProfileId: number;
  kpiId: number;
  targetValue?: number;
  periodStart?: string;
  periodEnd?: string;
}

export const kpisAPI = {
  /**
   * List all KPIs with pagination and filters
   */
  list: async (filters?: KpiFilters): Promise<PaginatedResponse<Kpi>> => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.category) params.append('category', filters.category);
    if (filters?.isFinancial !== undefined) params.append('isFinancial', String(filters.isFinancial));
    if (filters?.departmentId) params.append('departmentId', String(filters.departmentId));
    if (filters?.roleId) params.append('roleId', String(filters.roleId));
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
    
    const query = params.toString();
    return api.get(`/kpis${query ? `?${query}` : ''}`);
  },

  /**
   * Get KPI by ID
   */
  getById: async (id: number): Promise<Kpi> => {
    return api.get(`/kpis/${id}`);
  },

  /**
   * Create a new KPI
   */
  create: async (data: CreateKpiPayload): Promise<Kpi> => {
    return api.post('/kpis', data);
  },

  /**
   * Update KPI
   */
  update: async (id: number, data: Partial<CreateKpiPayload & { isActive: boolean }>): Promise<Kpi> => {
    return api.put(`/kpis/${id}`, data);
  },

  /**
   * Delete KPI (only if no assignments)
   */
  delete: async (id: number): Promise<void> => {
    return api.delete(`/kpis/${id}`);
  },

  /**
   * Activate KPI
   */
  activate: async (id: number): Promise<Kpi> => {
    return api.post(`/kpis/${id}/activate`);
  },

  /**
   * Deactivate KPI
   */
  deactivate: async (id: number): Promise<Kpi> => {
    return api.post(`/kpis/${id}/deactivate`);
  },

  // ==================
  // KPI CATEGORIES
  // ==================

  /**
   * Get KPI categories
   */
  getCategories: async (): Promise<string[]> => {
    return api.get('/kpis/categories');
  },

  /**
   * Get financial KPIs
   */
  getFinancial: async (): Promise<Kpi[]> => {
    return api.get('/kpis?isFinancial=true');
  },

  /**
   * Get non-financial KPIs
   */
  getNonFinancial: async (): Promise<Kpi[]> => {
    return api.get('/kpis?isFinancial=false');
  },

  // ==================
  // EMPLOYEE KPI ASSIGNMENTS
  // ==================

  /**
   * List employee KPI assignments
   */
  getAssignments: async (filters?: {
    employeeProfileId?: number;
    kpiId?: number;
    status?: string;
  }): Promise<EmployeeKpiAssignment[]> => {
    const params = new URLSearchParams();
    if (filters?.employeeProfileId) params.append('employeeProfileId', String(filters.employeeProfileId));
    if (filters?.kpiId) params.append('kpiId', String(filters.kpiId));
    if (filters?.status) params.append('status', filters.status);
    
    const query = params.toString();
    return api.get(`/employee-kpi-assignments${query ? `?${query}` : ''}`);
  },

  /**
   * Get my KPI assignments
   */
  getMyAssignments: async (): Promise<EmployeeKpiAssignment[]> => {
    return api.get('/employee-kpi-assignments/my');
  },

  /**
   * Assign KPI to employee
   */
  assignToEmployee: async (data: AssignKpiPayload): Promise<EmployeeKpiAssignment> => {
    return api.post('/employee-kpi-assignments', data);
  },

  /**
   * Bulk assign KPIs to department
   */
  assignToDepartment: async (departmentId: number, kpiIds: number[]): Promise<{ assigned: number }> => {
    return api.post('/employee-kpi-assignments/bulk-department', { departmentId, kpiIds });
  },

  /**
   * Update employee KPI assignment
   */
  updateAssignment: async (assignmentId: number, data: Partial<{
    targetValue: number;
    currentValue: number;
    status: string;
  }>): Promise<EmployeeKpiAssignment> => {
    return api.put(`/employee-kpi-assignments/${assignmentId}`, data);
  },

  /**
   * Record KPI achievement/progress
   */
  recordProgress: async (assignmentId: number, value: number, notes?: string): Promise<EmployeeKpiAssignment> => {
    return api.post(`/employee-kpi-assignments/${assignmentId}/progress`, { value, notes });
  },

  /**
   * Close KPI assignment
   */
  closeAssignment: async (assignmentId: number): Promise<EmployeeKpiAssignment> => {
    return api.post(`/employee-kpi-assignments/${assignmentId}/close`);
  },

  // ==================
  // KPI SCORES & SUMMARIES
  // ==================

  /**
   * Get employee KPI score summary
   */
  getEmployeeScoreSummary: async (employeeId: number, period?: {
    startDate: string;
    endDate: string;
  }): Promise<{
    totalKpis: number;
    financialScore: number;
    nonFinancialScore: number;
    overallScore: number;
    byCategory: Record<string, { score: number; count: number }>;
  }> => {
    const params = new URLSearchParams();
    if (period?.startDate) params.append('startDate', period.startDate);
    if (period?.endDate) params.append('endDate', period.endDate);
    
    const query = params.toString();
    return api.get(`/employees/${employeeId}/kpi-summary${query ? `?${query}` : ''}`);
  },

  /**
   * Get department KPI summary
   */
  getDepartmentKpiSummary: async (departmentId: number): Promise<{
    averageScore: number;
    totalAssignments: number;
    completedAssignments: number;
    topPerformers: Array<{
      employeeId: number;
      employeeName: string;
      score: number;
    }>;
  }> => {
    return api.get(`/departments/${departmentId}/kpi-summary`);
  },

  // ==================
  // BSC (Balanced Scorecard) PILLARS
  // ==================

  /**
   * Get KPIs by BSC pillar
   */
  getByPillar: async (pillar: 'financial' | 'customer' | 'process' | 'learning'): Promise<Kpi[]> => {
    return api.get(`/kpis/pillar/${pillar}`);
  },

  /**
   * Get employee BSC summary
   */
  getEmployeeBscSummary: async (employeeId: number): Promise<{
    financial: { score: number; weight: number };
    customer: { score: number; weight: number };
    process: { score: number; weight: number };
    learning: { score: number; weight: number };
    overall: number;
  }> => {
    return api.get(`/employees/${employeeId}/bsc-summary`);
  },
};

export default kpisAPI;
