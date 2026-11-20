import { api } from './client';

export type PerformancePeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type PerformanceScope = 'self' | 'department' | 'partner' | 'firm';
export type PerformanceStatus = 'on_track' | 'at_risk' | 'off_track';

export interface IndividualPerformanceRow {
  profileId: number;
  name: string;
  employeeNumber: string | null;
  departmentId: number | null;
  departmentName: string | null;
  partnerProfileId: number | null;
  partnerName: string | null;
  staffLevel: string;
  staffRate: number;
  expectedBillableThreshold: number;
  expectedTotalTime: number;
  expectedBillableTime: number;
  expectedBillableTarget: number;
  actualBillableTime: number;
  nonBillableTime: number;
  total: number;
  achievedBillableAmount: number;
  billableAchievement: number;
  utilization: number;
  collections: number;
  status: PerformanceStatus;
}

export interface DepartmentPerformanceRow {
  departmentId: number;
  name: string;
  partnerProfileId: number | null;
  partnerName: string | null;
  expectedBillableTarget: number;
  actualBillableAmount: number;
  collections: number;
  utilizationRate: number;
  collectionsEfficiency: number;
  collectionsVsTarget: number;
  staffMeetingTargets: number;
  staffBelowTargets: number;
  staffAboveTargets: number;
  totalStaff: number;
  staffPctBelowTargets: number;
  staffPctAboveTargets: number;
}

export interface PerformanceTrendBucket {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  expectedTarget: number;
  billableAmount: number;
  collections: number;
  utilization: number;
  collectionsEfficiency: number;
}

export interface PerformanceTrend {
  granularity: 'daily' | 'monthly';
  buckets: PerformanceTrendBucket[];
}

export interface PerformanceReportResponse {
  period: PerformancePeriod;
  label: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  holidayDays: number;
  scope: PerformanceScope;
  scopeLabel: string;
  canViewDepartments: boolean;
  individuals: IndividualPerformanceRow[];
  departments: DepartmentPerformanceRow[];
  trend: PerformanceTrend;
  totals: {
    expectedBillableTarget: number;
    actualBillableAmount: number;
    collections: number;
    utilizationRate: number;
    staffMeetingTargets: number;
    staffBelowTargets: number;
    totalStaff: number;
    staffPctBelowTargets: number;
    staffPctAboveTargets: number;
  };
}

export type PerformanceTrendGranularity = 'weekly' | 'monthly' | 'yearly';

export interface DepartmentTrendPoint {
  departmentId: number;
  expectedTarget: number;
  billableAmount: number;
  collections: number;
  utilization: number;
  collectionsEfficiency: number;
}

export interface DepartmentTrendBucket {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  departments: DepartmentTrendPoint[];
}

export interface DepartmentTrendsResponse {
  granularity: PerformanceTrendGranularity;
  scope: PerformanceScope;
  scopeLabel: string;
  canViewDepartments: boolean;
  departments: Array<{ departmentId: number; name: string }>;
  buckets: DepartmentTrendBucket[];
}

export const performanceReportAPI = {
  get: async (params: {
    period: PerformancePeriod;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<PerformanceReportResponse> => {
    const search = new URLSearchParams();
    search.append('period', params.period);
    if (params.dateFrom) search.append('dateFrom', params.dateFrom);
    if (params.dateTo) search.append('dateTo', params.dateTo);
    return api.get(`/performance-report?${search.toString()}`);
  },

  getDepartmentTrends: async (
    granularity: PerformanceTrendGranularity,
    date?: string
  ): Promise<DepartmentTrendsResponse> => {
    const search = new URLSearchParams();
    search.append('granularity', granularity);
    if (date) search.append('date', date);
    return api.get(`/performance-report/department-trends?${search.toString()}`);
  },
};

export default performanceReportAPI;
