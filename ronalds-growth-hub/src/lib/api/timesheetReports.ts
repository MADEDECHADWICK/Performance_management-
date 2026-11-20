import { api } from './client';

export type TimesheetReportScope = 'self' | 'team' | 'department' | 'partner' | 'firm';
export type TimesheetReportPeriod = 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type TimesheetReportGroup = 'staff' | 'job' | 'client';
export type TimesheetReportMode = 'summary' | 'detailed';

export interface TimesheetReportFilters {
  period?: TimesheetReportPeriod;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  scope?: TimesheetReportScope;
  status?: string;
  employeeProfileId?: number;
  departmentId?: number;
  partnerProfileId?: number;
  jobId?: number;
  jobKey?: string;
  clientId?: number;
  clientKey?: string;
  taskId?: number;
}

export interface ReportTotals {
  nonBillableHours: number;
  nonBillableAmount: number;
  billableHours: number;
  billableAmount: number;
  totalHours: number;
  totalAmount: number;
  totalCost: number;
}

export interface SummaryRow extends ReportTotals {
  employeeProfileId: number;
  employeeName: string;
  employeeNumber: string | null;
  departmentName: string | null;
  partnerName: string | null;
  jobKey: string;
  jobId: number | null;
  jobNo: string;
  jobName: string;
  jobFee: number;
  clientKey: string;
  clientId: number | null;
  clientName: string;
  taskId: number | null;
  taskName: string;
}

export interface DetailedEntry extends ReportTotals {
  id: number;
  jobKey: string;
  clientKey: string;
  dateWorked: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: string;
  description: string | null;
  employeeProfileId: number;
  employeeName: string;
  employeeNumber: string | null;
  departmentId: number | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  jobId: number | null;
  jobNo: string;
  jobName: string;
  jobFee: number;
  clientId: number | null;
  clientName: string;
  taskId: number | null;
  taskName: string;
  billable: boolean;
  nonBillableCategory: string | null;
  nonBillableActivity: string | null;
  hours: number;
  billableHours: number;
  nonBillableHours: number;
  billableAmount: number;
  nonBillableAmount: number;
  costAmount: number;
  profitLoss: number;
  approverName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
}

export interface RollupRow extends ReportTotals {
  key: string;
  name: string;
  meta: string | null;
}

export interface ReportResponse {
  group: TimesheetReportGroup;
  mode: TimesheetReportMode;
  filters: {
    period: TimesheetReportPeriod;
    dateFrom: string;
    dateTo: string;
    label: string;
    scope: TimesheetReportScope;
    statuses: string[];
    employeeProfileId: number | null;
    departmentId: number | null;
    partnerProfileId: number | null;
    jobId: number | null;
    clientId: number | null;
  };
  totals: ReportTotals;
  rollups: {
    staff: RollupRow[];
    departments: RollupRow[];
    partners: RollupRow[];
    jobs: RollupRow[];
    clients: RollupRow[];
    firm: ReportTotals;
  };
  rows?: SummaryRow[];
  entries?: DetailedEntry[];
}

export interface JobOverviewRow extends ReportTotals {
  jobKey: string;
  jobId: number | null;
  jobNo: string;
  jobName: string;
  fee: number;
  clientKey: string;
  clientName: string;
  departmentName: string | null;
  partnerName: string | null;
  staffCount: number;
  taskCount: number;
}

export interface ClientOverviewRow extends ReportTotals {
  clientKey: string;
  clientId: number | null;
  clientName: string;
  jobCount: number;
  staffCount: number;
}

export interface DrilldownStaffRow extends ReportTotals {
  employeeProfileId: number;
  employeeName: string;
  employeeNumber: string | null;
  departmentName: string | null;
  partnerName: string | null;
  entriesCount: number;
  cost: number;
  profitLoss: number;
}

export interface JobOverviewResponse {
  group: "job";
  mode: "summary";
  filters: ReportResponse["filters"];
  totals: ReportTotals;
  rollups: ReportResponse["rollups"];
  rows: JobOverviewRow[];
}

export interface ClientOverviewResponse {
  group: "client";
  mode: "summary";
  filters: ReportResponse["filters"];
  totals: ReportTotals;
  rollups: ReportResponse["rollups"];
  rows: ClientOverviewRow[];
}

export interface JobDrilldownResponse {
  filters: ReportResponse["filters"];
  job: {
    jobKey: string;
    jobId: number | null;
    jobNo: string;
    jobName: string;
    fee: number;
    clientKey: string;
    clientName: string;
    departmentName: string | null;
    partnerName: string | null;
    staffCount: number;
    entriesCount: number;
  } | null;
  totals: ReportTotals;
  staff: DrilldownStaffRow[];
  entries: DetailedEntry[];
}

export interface ClientDrilldownJobRow extends ReportTotals {
  jobKey: string;
  jobId: number | null;
  jobNo: string;
  jobName: string;
  fee: number;
  staffCount: number;
  entriesCount: number;
}

export interface ClientDrilldownResponse {
  filters: ReportResponse["filters"];
  client: {
    clientKey: string;
    clientId: number | null;
    clientName: string;
    jobCount: number;
    staffCount: number;
    entriesCount: number;
  } | null;
  totals: ReportTotals;
  jobs: ClientDrilldownJobRow[];
  staff: DrilldownStaffRow[];
  entries: DetailedEntry[];
}

export interface ReportOptions {
  allowedScopes: TimesheetReportScope[];
  defaultScope: TimesheetReportScope;
  staff: Array<{
    id: number;
    name: string;
    employeeId: string | null;
    departmentId: number | null;
    departmentName: string | null;
  }>;
  departments: Array<{ id: number; name: string }>;
  jobs: Array<{
    id: number;
    jobCode: string | null;
    jobName: string;
    clientId: number | null;
    clientName: string | null;
  }>;
  clients: Array<{ id: number; clientName: string }>;
}

const GROUP_PATH: Record<TimesheetReportGroup, string> = {
  staff: 'staff',
  job: 'jobs',
  client: 'clients',
};

const buildQuery = (filters: TimesheetReportFilters) => {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const timesheetReportsAPI = {
  getOptions: async (): Promise<ReportOptions> => api.get('/timesheet-reports/options'),

  getReport: async (
    group: TimesheetReportGroup,
    mode: TimesheetReportMode,
    filters: TimesheetReportFilters
  ): Promise<ReportResponse> =>
    api.get(`/timesheet-reports/${GROUP_PATH[group]}/${mode}${buildQuery(filters)}`),

  getJobOverview: async (filters: TimesheetReportFilters): Promise<JobOverviewResponse> =>
    api.get(`/timesheet-reports/jobs/overview${buildQuery(filters)}`),

  getClientOverview: async (filters: TimesheetReportFilters): Promise<ClientOverviewResponse> =>
    api.get(`/timesheet-reports/clients/overview${buildQuery(filters)}`),

  getJobDrilldown: async (
    jobKey: string,
    filters: TimesheetReportFilters
  ): Promise<JobDrilldownResponse> =>
    api.get(`/timesheet-reports/jobs/${encodeURIComponent(jobKey)}${buildQuery(filters)}`),

  getClientDrilldown: async (
    clientKey: string,
    filters: TimesheetReportFilters
  ): Promise<ClientDrilldownResponse> =>
    api.get(`/timesheet-reports/clients/${encodeURIComponent(clientKey)}${buildQuery(filters)}`),
};

export default timesheetReportsAPI;
