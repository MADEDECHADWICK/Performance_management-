/**
 * KPIs API - Key Performance Indicators + assignments tracking
 */
import { api } from "./client";
import type { EmployeeKpiAssignment, Kpi } from "./types";

export interface CreateKpiPayload {
  name: string;
  description?: string;
  category?: string;
  kpiType?: string;
  measurementUnit?: string;
  targetValue?: number;
  targetFrequency?: string;
  targetType?: string;
  targetText?: string;
  weight?: number;
  isActive?: boolean;
  assignmentScope?: "individual" | "department";
  ownerProfileId?: number;
  departmentId?: number;
  roleId?: number;
  reviewOwnerProfileId?: number;
  reviewFrequency?: string;
  approvalRequired?: boolean;
  evidenceRequired?: boolean;
  commentaryRequired?: boolean;
  initiatives?: Array<
    | string
    | {
        title: string;
        description?: string;
        weight?: number;
        targetValue?: number;
        unit?: string;
        keyResults?: Array<{
          title: string;
          targetValue?: number;
          unit?: string;
          weight?: number;
        }>;
      }
  >;
}

export interface KpiFilters {
  isActive?: boolean;
}

export interface AssignmentFilters {
  employeeProfileId?: number;
  kpiId?: number;
  status?: "active" | "paused" | "closed" | string;
  includeTracking?: boolean;
}

interface AssignKpiPayload {
  employeeProfileId: number;
  kpiId: number;
  targetValue?: number;
  periodStart?: string;
  periodEnd?: string;
  status?: "active" | "paused" | "closed" | string;
}

const buildQuery = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
};

export const kpisAPI = {
  // KPI catalog
  list: async (filters?: KpiFilters): Promise<Kpi[]> =>
    api.get(`/kpis${buildQuery({ isActive: filters?.isActive })}`),

  getById: async (id: number): Promise<Kpi> => api.get(`/kpis/${id}`),

  create: async (data: CreateKpiPayload): Promise<Kpi> => api.post("/kpis", data),

  update: async (id: number, data: Partial<CreateKpiPayload>): Promise<Kpi> =>
    api.patch(`/kpis/${id}`, data),

  delete: async (id: number): Promise<void> => api.delete(`/kpis/${id}`),

  activate: async (id: number): Promise<Kpi> => api.patch(`/kpis/${id}`, { isActive: true }),

  deactivate: async (id: number): Promise<Kpi> =>
    api.patch(`/kpis/${id}`, { isActive: false }),

  getCategories: async (): Promise<string[]> => {
    const rows = await api.get<Kpi[]>("/kpis");
    return Array.from(
      new Set(
        (rows || [])
          .map((kpi) => String(kpi?.category || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  },

  // KPI assignments + tracking
  getAssignments: async (filters?: AssignmentFilters): Promise<EmployeeKpiAssignment[]> =>
    api.get(
      `/employee-kpi-assignments${buildQuery({
        employeeProfileId: filters?.employeeProfileId,
        kpiId: filters?.kpiId,
        status: filters?.status,
        includeTracking: filters?.includeTracking,
      })}`
    ),

  getMyAssignments: async (filters?: Omit<AssignmentFilters, "employeeProfileId">) =>
    api.get<EmployeeKpiAssignment[]>(
      `/employee-kpi-assignments/my${buildQuery({
        kpiId: filters?.kpiId,
        status: filters?.status,
        includeTracking: filters?.includeTracking ?? true,
      })}`
    ),

  assignToEmployee: async (data: AssignKpiPayload): Promise<EmployeeKpiAssignment> =>
    api.post("/employee-kpi-assignments", data),

  assignToDepartment: async (
    departmentId: number,
    kpiIds: number[]
  ): Promise<{ assigned: number }> =>
    api.post("/employee-kpi-assignments/bulk-department", { departmentId, kpiIds }),

  updateAssignment: async (
    assignmentId: number,
    data: Partial<{
      targetValue: number;
      weight: number;
      periodStart: string;
      periodEnd: string;
      status: string;
    }>
  ): Promise<EmployeeKpiAssignment> =>
    api.patch(`/employee-kpi-assignments/${assignmentId}`, data),

  recordProgress: async (
    assignmentId: number,
    value: number,
    notes?: string
  ): Promise<EmployeeKpiAssignment> =>
    api.post(`/employee-kpi-assignments/${assignmentId}/progress`, { value, notes }),

  closeAssignment: async (assignmentId: number): Promise<EmployeeKpiAssignment> =>
    api.post(`/employee-kpi-assignments/${assignmentId}/close`),
};

export default kpisAPI;
