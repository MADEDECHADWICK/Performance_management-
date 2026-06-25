import { apiFetch } from "@/lib/api";

export type KpiStatus = "on_track" | "at_risk" | "off_track" | "no_data";
export type CascadeScope = "all" | "by_department" | "by_role_type";
export type RoleType = "employee" | "manager" | "partner";

export type KpiPeriod = {
  id: number;
  label: string;
  cadence: string;
  periodStart: string;
  periodEnd: string;
  status: string;
};

export type IndividualKpiScore = {
  kpiId: number;
  kpiName: string;
  metricKey: string;
  score: number | null;
  status: KpiStatus;
  targetValue: number;
  actualValue: number | null;
};

export type EmployeeKpiRow = {
  profileId: number;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  kpiScores: IndividualKpiScore[];
  overallScore: number | null;
};

export type DepartmentKpiType = {
  metricKey: string;
  kpiName: string;
  avgScore: number | null;
  status: KpiStatus;
  employeeCount: number;
  kpiWeight: number;
};

export type DepartmentScorecard = {
  departmentId: number;
  departmentName: string;
  partnerProfileId: number | null;
  overallScore: number | null;
  kpiTypes: DepartmentKpiType[];
  employees: EmployeeKpiRow[];
};

export type OrgDepartmentRow = {
  departmentId: number;
  departmentName: string;
  partnerProfileId: number | null;
  partnerName: string | null;
  overallScore: number | null;
  kpiScores: Array<{
    metricKey: string;
    score: number | null;
    status: KpiStatus;
    employeeCount: number;
  }>;
};

export type OrgKpiType = {
  metricKey: string;
  kpiName: string;
  orgWeight: number;
  orgScore: number | null;
  deptCount: number;
};

export type PartnerSummaryRow = {
  partnerProfileId: number | null;
  partnerName: string | null;
  overallScore: number | null;
  deptCount: number;
  kpiScores: Array<{ metricKey: string; score: number | null; status: KpiStatus }>;
};

export type OrgScorecard = {
  periodId: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  kpiTypes: OrgKpiType[];
  departments: OrgDepartmentRow[];
  partnerSummaries: PartnerSummaryRow[];
  orgOverallScore: number | null;
};

export type PartnerScorecard = {
  partnerProfileId: number;
  partnerName: string;
  periodId: number;
  overallScore: number | null;
  departments: DepartmentScorecard[];
};

export type Department = {
  id: number;
  name: string;
  partnerProfileId: number | null;
  partnerName: string | null;
};

export type Partner = {
  id: number;
  name: string;
  employeeId: string | null;
};

export type SyncResult = {
  success: boolean;
  synced: number;
  skipped: number;
  errors: number;
};

// ─── Firm KPI Template types ──────────────────────────────────────────────────

export type FirmKpiTemplate = {
  id: number;
  name: string;
  metricKey: string;
  sourceModule: string;
  targetValue: number;
  unit: string;
  cascadeScope: string;
  spawnedCount: number;
  isActive: boolean;
  createdAt: string;
};

export type CascadeStatusRow = {
  profileId: number;
  employeeName: string;
  departmentName: string | null;
  kpiId: number;
  score: number | null;
  status: string;
};

export type FirmKpiCascadeStatus = {
  templateId: number;
  templateName: string;
  metricKey: string;
  periodId: number;
  spawnedCount: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  noData: number;
  firmAvgScore: number | null;
  rows: CascadeStatusRow[];
};

export type CreateFirmKpiInput = {
  name: string;
  description?: string;
  metricKey?: string;
  sourceModule: string;
  measurementType?: string;
  targetValue: number;
  unit: string;
  weight?: number;
  frequency?: string;
  formulaType?: string;
  formulaNumeratorKey?: string;
  formulaDenominatorKey?: string;
  formulaValueKey?: string;
  scoringType?: string;
  greenThreshold?: number;
  amberThreshold?: number;
  redThreshold?: number;
  cascadeScope: CascadeScope;
  departmentIds?: number[];
  roleTypes?: RoleType[];
};

export type CreateFirmKpiResult = {
  templateKpiId: number;
  spawnedCount: number;
  skipped: number;
};

// ─── API Client ───────────────────────────────────────────────────────────────

export const kpiCascadeApi = {
  // Periods
  listPeriods: (): Promise<{ periods: KpiPeriod[] }> =>
    apiFetch("GET", "/kpi-cascade/periods"),

  // Org / dept / partner scorecards
  getOrgScorecard: (periodId: number): Promise<OrgScorecard> =>
    apiFetch("GET", `/kpi-cascade/org-scorecard?periodId=${periodId}`),

  getDepartmentScorecard: (departmentId: number, periodId: number): Promise<DepartmentScorecard> =>
    apiFetch("GET", `/kpi-cascade/department/${departmentId}?periodId=${periodId}`),

  getPartnerScorecard: (partnerId: number, periodId: number): Promise<PartnerScorecard> =>
    apiFetch("GET", `/kpi-cascade/partner-scorecard/${partnerId}?periodId=${periodId}`),

  // My departments (for partner / manager)
  listMyDepartments: (): Promise<{ departments: Department[] }> =>
    apiFetch("GET", "/kpi-cascade/my-departments"),

  // Sync
  syncPeriod: (periodId: number): Promise<SyncResult> =>
    apiFetch("POST", `/kpi-cascade/sync/${periodId}`),

  // Partner list (GMP/HR)
  listPartners: (): Promise<{ partners: Partner[] }> =>
    apiFetch("GET", "/kpi-cascade/partners"),

  // Departments list (GMP/HR - for scope selector)
  listDepartments: (): Promise<{ departments: Array<{ id: number; name: string; partnerName: string | null }> }> =>
    apiFetch("GET", "/kpi-cascade/departments"),

  // Firm KPI Templates
  listFirmKpiTemplates: (): Promise<{ templates: FirmKpiTemplate[] }> =>
    apiFetch("GET", "/kpi-cascade/firm-kpis"),

  createFirmKpi: (data: CreateFirmKpiInput): Promise<CreateFirmKpiResult> =>
    apiFetch("POST", "/kpi-cascade/firm-kpis", data),

  getFirmKpiStatus: (templateId: number, periodId: number): Promise<FirmKpiCascadeStatus> =>
    apiFetch("GET", `/kpi-cascade/firm-kpis/${templateId}/status?periodId=${periodId}`),

  deleteFirmKpi: (templateId: number): Promise<{ success: boolean }> =>
    apiFetch("DELETE", `/kpi-cascade/firm-kpis/${templateId}`),

  resyncFirmKpi: (templateId: number): Promise<{ success: boolean; created: number; alreadyExists: number }> =>
    apiFetch("POST", `/kpi-cascade/firm-kpis/${templateId}/resync`),

  syncAll: (): Promise<{ success: boolean; periodsProcessed: number; synced: number; skipped: number; errors: number }> =>
    apiFetch("POST", "/kpi-cascade/sync-all"),
};
