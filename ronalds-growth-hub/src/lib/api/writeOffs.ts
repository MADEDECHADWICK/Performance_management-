import { api } from './client';

export type WriteOffPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom';

export interface WriteOffRangeParams {
  period?: WriteOffPeriod;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface WriteOffBucket {
  key: string;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  loggedHours: number;
  billableHours: number;
  nonBillableHours: number;
  writeOffHours: number;
  writeOffValue: number;
  writeOffRatePercent: number;
  writeOffNonBillablePercent: number;
}

export interface TimeWriteOffActivity {
  key: string;
  name: string;
  valuation: 'none' | 'billing_rate' | 'cost_rate';
  hours: number;
  value: number;
}

export interface TimeWriteOffResult {
  period: WriteOffPeriod;
  label: string;
  startDate: string;
  endDate: string;
  firm: WriteOffBucket & { currency: string };
  byEmployee: WriteOffBucket[];
  byDepartment: WriteOffBucket[];
  byPartner: WriteOffBucket[];
  byActivity: TimeWriteOffActivity[];
}

export interface JobWriteOffTeamMember {
  employeeProfileId: number;
  employeeName: string;
  billableHours: number;
  billableValue: number;
}

export interface JobWriteOffRow {
  jobId: number;
  jobCode: string | null;
  jobName: string;
  clientName: string;
  status: string;
  billingType: string;
  currency: string;
  departmentId: number | null;
  departmentName: string;
  partnerProfileId: number | null;
  partnerName: string | null;
  agreedFee: number;
  feeBasis: number;
  deliveredValue: number;
  deliveredHours: number;
  nonBillableHours: number;
  nonBillableValue: number;
  totalServiceValue: number;
  overServiceWriteOffValue: number;
  writeOffValue: number;
  writeUpValue: number;
  writeOffPercent: number;
  plannedValue: number;
  plannedCost: number;
  invoicedRevenue: number;
  collectedRevenue: number;
  team: JobWriteOffTeamMember[];
}

export interface JobWriteOffGroup {
  key: string;
  name: string;
  partnerProfileId?: number | null;
  departmentId?: number | null;
  departmentName?: string | null;
  jobCount: number;
  jobsWithWriteOff: number;
  deliveredValue: number;
  nonBillableValue: number;
  totalServiceValue: number;
  feeBasis: number;
  overServiceWriteOffValue: number;
  writeOffValue: number;
  writeUpValue: number;
  writeOffRatePercent: number;
  plannedValue: number;
  invoicedRevenue: number;
  collectedRevenue: number;
}

export interface JobWriteOffResult {
  period: WriteOffPeriod;
  label: string;
  startDate: string;
  endDate: string;
  currency: string;
  firm: JobWriteOffGroup;
  byPartner: JobWriteOffGroup[];
  byDepartment: JobWriteOffGroup[];
  jobs: JobWriteOffRow[];
  topWriteOffs: JobWriteOffRow[];
}

export interface WriteOffSummary {
  time: TimeWriteOffResult;
  jobs: JobWriteOffResult;
}

const buildQuery = (params?: WriteOffRangeParams) => {
  const search = new URLSearchParams();
  if (params?.period) search.append('period', params.period);
  if (params?.date) search.append('date', params.date);
  if (params?.dateFrom) search.append('dateFrom', params.dateFrom);
  if (params?.dateTo) search.append('dateTo', params.dateTo);
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const writeOffsAPI = {
  getTime: async (params?: WriteOffRangeParams): Promise<TimeWriteOffResult> =>
    api.get(`/write-offs/time${buildQuery(params)}`),

  getJobs: async (params?: WriteOffRangeParams): Promise<JobWriteOffResult> =>
    api.get(`/write-offs/jobs${buildQuery(params)}`),

  getSummary: async (params?: WriteOffRangeParams): Promise<WriteOffSummary> =>
    api.get(`/write-offs/summary${buildQuery(params)}`),
};

export default writeOffsAPI;
