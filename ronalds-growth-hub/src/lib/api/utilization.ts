import { api } from './client';

export type UtilizationPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export type UtilizationStatus = 'on_track' | 'at_risk' | 'off_track';

export interface UtilizationCascadeMember {
  profileId: number;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  billableHours: number;
  loggedHours: number;
  targetHours: number;
  approvedLeaveHours: number;
  utilizationPercent: number;
  benchmarkPercent: number;
  varianceHours: number;
  status: UtilizationStatus;
  includedInAverages: boolean;
}

export interface UtilizationCascadeDepartment {
  departmentId: number | null;
  name: string;
  partnerProfileId: number | null;
  partnerName: string | null;
  billableHours: number;
  targetHours: number;
  loggedHours: number;
  utilizationPercent: number;
  benchmarkPercent: number;
  memberCount: number;
  eligibleMemberCount: number;
  status: UtilizationStatus;
}

export interface UtilizationCascadePartner {
  partnerProfileId: number;
  name: string;
  billableHours: number;
  targetHours: number;
  loggedHours: number;
  utilizationPercent: number;
  benchmarkPercent: number;
  departmentCount: number;
  memberCount: number;
  status: UtilizationStatus;
}

export interface UtilizationCascadeResult {
  period: UtilizationPeriod;
  label: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  holidayDays: number;
  organization: {
    utilizationPercent: number;
    benchmarkPercent: number;
    billableHours: number;
    targetHours: number;
    loggedHours: number;
    partnerCount: number;
    departmentCount: number;
    memberCount: number;
    status: UtilizationStatus;
  };
  byPartner: UtilizationCascadePartner[];
  byDepartment: UtilizationCascadeDepartment[];
  byEmployee: UtilizationCascadeMember[];
}

export const utilizationAPI = {
  getCascade: async (params?: {
    period?: UtilizationPeriod;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<UtilizationCascadeResult> => {
    const search = new URLSearchParams();
    if (params?.period) search.append('period', params.period);
    if (params?.date) search.append('date', params.date);
    if (params?.dateFrom) search.append('dateFrom', params.dateFrom);
    if (params?.dateTo) search.append('dateTo', params.dateTo);
    const query = search.toString();
    return api.get(`/utilization${query ? `?${query}` : ''}`);
  },
};

export default utilizationAPI;
