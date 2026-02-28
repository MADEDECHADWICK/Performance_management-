/**
 * Dashboards API - Role-based Dashboard Data
 * GMP, Partner, Manager, HR, and Employee dashboards
 */
import { api } from './client';
import type { 
  GMPDashboardData, 
  PartnerDashboardData,
  DashboardMetrics,
  Job,
  Profile
} from './types';

// GMP Dashboard Data
interface GMPOverview {
  firmOverview: {
    totalEmployees: number;
    activeJobs: number;
    totalPartners: number;
    totalDepartments: number;
    activeClients: number;
  };
  financials: {
    totalRevenue: number;
    totalProfit: number;
    projectedRevenue: number;
    collectedAmount: number;
    outstandingAmount: number;
  };
  jobStatus: {
    planned: number;
    ongoing: number;
    onHold: number;
    completed: number;
    overdue: number;
  };
}

// Partner Dashboard Data
interface PartnerOverview {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  pendingJobs: number;
  overdueJobs: number;
  totalRevenue: number;
  profit: number;
  utilizationRate: number;
  teamSize: number;
  jobs: Job[];
  teamMembers: Profile[];
}

// Manager Dashboard Data
interface ManagerOverview {
  myTeam: {
    totalMembers: number;
    activeOnJobs: number;
    utilizationRate: number;
  };
  jobPortfolio: {
    total: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  pendingApprovals: {
    timeEntries: number;
    overBudgetRequests: number;
    jobCostings: number;
  };
  teamPerformance: Array<{
    employeeId: number;
    employeeName: string;
    utilizationRate: number;
    billableHours: number;
    activeJobs: number;
  }>;
}

// HR Dashboard Data
interface HROverview {
  employees: {
    total: number;
    active: number;
    inactive: number;
    separated: number;
    newThisMonth: number;
  };
  onboarding: {
    pending: number;
    inProgress: number;
    completed: number;
    overdueChecklists: number;
  };
  evaluations: {
    activeCycles: number;
    pendingEvaluations: number;
    overdueEvaluations: number;
    completedThisCycle: number;
  };
  departments: Array<{
    id: number;
    name: string;
    headcount: number;
    openPositions: number;
  }>;
}

interface GmpDepartmentBreakdownRow {
  department_id?: number | string;
  departmentId?: number | string;
  department_name?: string;
  departmentName?: string;
  department_revenue?: number | string;
  departmentRevenue?: number | string;
  department_fees?: number | string;
  avg_department_performance?: number | string;
  active_jobs?: number | string;
  activeJobs?: number | string;
}

interface GmpPartnerRankingRow {
  partner_id?: number | string;
  partnerId?: number | string;
  name?: string;
  partnerName?: string;
  portfolio_revenue?: number | string;
  portfolioRevenue?: number | string;
  portfolio_profit?: number | string;
  portfolioProfit?: number | string;
  active_jobs?: number | string;
  activeJobs?: number | string;
  direct_reports?: number | string;
  teamSize?: number | string;
}

interface GmpOverviewPayload {
  departmentBreakdown?: GmpDepartmentBreakdownRow[];
  partnerRankings?: GmpPartnerRankingRow[];
}

interface ProjectionRow {
  monthYear?: string;
  projectedAmount?: number | string;
  actualCollected?: number | string;
  departmentId?: number | string;
  departmentName?: string;
}

interface PartnerClient {
  id: number;
  clientName?: string;
  [key: string]: unknown;
}

export const dashboardsAPI = {
  // ==================
  // GMP DASHBOARD
  // ==================

  /**
   * Get GMP (Group Managing Partner) dashboard data
   */
  getGmpDashboard: async (): Promise<GMPOverview> => {
    return api.get('/gmp-dashboard/overview');
  },

  /**
   * Get GMP department performance
   */
  getGmpDepartmentPerformance: async (): Promise<Array<{
    departmentId: number;
    departmentName: string;
    revenue: number;
    profit: number;
    utilization: number;
    activeJobs: number;
    completedJobs: number;
  }>> => {
    const data = await api.get<GmpOverviewPayload>('/gmp-dashboard/overview');
    const departments = Array.isArray(data?.departmentBreakdown) ? data.departmentBreakdown : [];
    return departments.map((department) => ({
      departmentId: Number(department.department_id ?? department.departmentId ?? 0),
      departmentName: String(department.department_name ?? department.departmentName ?? ''),
      revenue: Number(department.department_revenue ?? department.departmentRevenue ?? 0),
      profit: Number(department.department_revenue ?? 0) - Number(department.department_fees ?? 0),
      utilization: Number(department.avg_department_performance ?? 0),
      activeJobs: Number(department.active_jobs ?? department.activeJobs ?? 0),
      completedJobs: 0,
    }));
  },

  /**
   * Get GMP partner performance
   */
  getGmpPartnerPerformance: async (): Promise<Array<{
    partnerId: number;
    partnerName: string;
    revenue: number;
    profit: number;
    activeJobs: number;
    completedJobs: number;
    teamSize: number;
  }>> => {
    const data = await api.get<GmpOverviewPayload>('/gmp-dashboard/overview');
    const partners = Array.isArray(data?.partnerRankings) ? data.partnerRankings : [];
    return partners.map((partner) => ({
      partnerId: Number(partner.partner_id ?? partner.partnerId ?? 0),
      partnerName: String(partner.name ?? partner.partnerName ?? ''),
      revenue: Number(partner.portfolio_revenue ?? partner.portfolioRevenue ?? 0),
      profit: Number(partner.portfolio_profit ?? partner.portfolioProfit ?? 0),
      activeJobs: Number(partner.active_jobs ?? partner.activeJobs ?? 0),
      completedJobs: 0,
      teamSize: Number(partner.direct_reports ?? partner.teamSize ?? 0),
    }));
  },

  /**
   * Get GMP revenue projections
   */
  getGmpProjections: async (period?: { year: number; month?: number }): Promise<{
    projected: number;
    actual: number;
    variance: number;
    byDepartment: Array<{
      departmentId: number;
      departmentName: string;
      projected: number;
      actual: number;
    }>;
  }> => {
    const rows = await api.get<ProjectionRow[]>('/finance-dashboard/projections');
    const filtered = Array.isArray(rows)
      ? rows.filter((row) => {
          const date = new Date(row.monthYear);
          if (Number.isNaN(date.getTime())) return false;
          if (period?.year && date.getFullYear() !== period.year) return false;
          if (period?.month && date.getMonth() + 1 !== period.month) return false;
          return true;
        })
      : [];

    const projected = filtered.reduce((sum, row) => sum + Number(row.projectedAmount || 0), 0);
    const actual = filtered.reduce((sum, row) => sum + Number(row.actualCollected || 0), 0);
    const byDepartmentMap = new Map<number, { departmentId: number; departmentName: string; projected: number; actual: number }>();

    filtered.forEach((row) => {
      const departmentId = Number(row.departmentId || 0);
      if (!departmentId) return;
      const existing = byDepartmentMap.get(departmentId) || {
        departmentId,
        departmentName: String(row.departmentName || `Department #${departmentId}`),
        projected: 0,
        actual: 0,
      };
      existing.projected += Number(row.projectedAmount || 0);
      existing.actual += Number(row.actualCollected || 0);
      byDepartmentMap.set(departmentId, existing);
    });

    return {
      projected,
      actual,
      variance: actual - projected,
      byDepartment: Array.from(byDepartmentMap.values()),
    };
  },

  // ==================
  // PARTNER DASHBOARD
  // ==================

  /**
   * Get Partner dashboard data
   */
  getPartnerDashboard: async (): Promise<PartnerOverview> => {
    return api.get('/partners/dashboard');
  },

  /**
   * Get partner's jobs
   */
  getPartnerJobs: async (filters?: {
    status?: string;
    clientId?: number;
  }): Promise<Job[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.clientId) params.append('clientId', String(filters.clientId));
    
    const query = params.toString();
    return api.get(`/partners/jobs${query ? `?${query}` : ''}`);
  },

  /**
   * Get partner's team
   */
  getPartnerTeam: async (): Promise<Profile[]> => {
    return api.get('/partners/team');
  },

  /**
   * Get partner's clients
   */
  getPartnerClients: async (): Promise<PartnerClient[]> => {
    return api.get<PartnerClient[]>('/partners/clients');
  },

  /**
   * Get partner's revenue summary
   */
  getPartnerRevenue: async (period?: { startDate: string; endDate: string }): Promise<{
    totalRevenue: number;
    totalProfit: number;
    billableAmount: number;
    collectedAmount: number;
    byClient: Array<{
      clientId: number;
      clientName: string;
      revenue: number;
    }>;
  }> => {
    const params = new URLSearchParams();
    if (period?.startDate) params.append('startDate', period.startDate);
    if (period?.endDate) params.append('endDate', period.endDate);
    
    const query = params.toString();
    return api.get(`/partners/revenue${query ? `?${query}` : ''}`);
  },

  // ==================
  // MANAGER DASHBOARD
  // ==================

  /**
   * Get Manager dashboard data
   */
  getManagerDashboard: async (): Promise<ManagerOverview> => {
    return api.get('/manager-dashboard');
  },

  /**
   * Get manager's job portfolio
   */
  getManagerJobs: async (): Promise<Job[]> => {
    return api.get('/manager-dashboard/jobs');
  },

  /**
   * Get manager's team workload
   */
  getTeamWorkload: async (): Promise<Array<{
    employeeId: number;
    employeeName: string;
    allocatedHours: number;
    loggedHours: number;
    activeJobs: number;
    capacity: number;
  }>> => {
    return api.get('/manager-dashboard/team-workload');
  },

  /**
   * Get pending approvals for manager
   */
  getManagerPendingApprovals: async (): Promise<{
    timeEntries: unknown[];
    overBudgetRequests: unknown[];
    jobCostings: unknown[];
  }> => {
    return api.get('/manager-dashboard/pending-approvals');
  },

  // ==================
  // HR DASHBOARD
  // ==================

  /**
   * Get HR dashboard data
   */
  getHrDashboard: async (): Promise<HROverview> => {
    return api.get('/employees/hr-dashboard');
  },

  /**
   * Get onboarding overview
   */
  getOnboardingOverview: async (): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cases: unknown[];
  }> => {
    return api.get('/onboarding/overview');
  },

  /**
   * Get evaluation overview
   */
  getEvaluationOverview: async (): Promise<{
    activeCycles: number;
    pendingCount: number;
    completedCount: number;
    overdueCount: number;
  }> => {
    return api.get('/evaluations/overview');
  },

  // ==================
  // EMPLOYEE DASHBOARD
  // ==================

  /**
   * Get Employee dashboard data
   */
  getEmployeeDashboard: async (): Promise<{
    profile: Profile;
    myJobs: Job[];
    timeEntrySummary: {
      thisWeek: number;
      thisMonth: number;
      pending: number;
      submitted: number;
    };
    kpiSummary: {
      financial: number;
      nonFinancial: number;
      overall: number;
    };
    pendingEvaluations: number;
    notifications: unknown[];
  }> => {
    return api.get('/profiles/dashboard');
  },

  /**
   * Get my jobs with allocation
   */
  getMyJobs: async (): Promise<Array<Job & { 
    allocatedHours: number;
    usedHours: number;
    remainingHours: number;
  }>> => {
    return api.get('/jobs/my');
  },

  /**
   * Get my performance score
   */
  getMyPerformanceScore: async (): Promise<{
    financialScore: number;
    nonFinancialScore: number;
    overallScore: number;
    revenue: number;
    billableHours: number;
    utilizationRate: number;
    profit: number;
    loss: number;
  }> => {
    return api.get('/profiles/my-performance');
  },

  // ==================
  // ANALYTICS
  // ==================

  /**
   * Get financial analytics
   */
  getFinancialAnalytics: async (period?: {
    startDate: string;
    endDate: string;
  }): Promise<{
    revenue: number;
    profit: number;
    costs: number;
    margin: number;
    trend: Array<{ date: string; revenue: number; profit: number }>;
  }> => {
    const params = new URLSearchParams();
    if (period?.startDate) params.append('startDate', period.startDate);
    if (period?.endDate) params.append('endDate', period.endDate);
    
    const query = params.toString();
    return api.get(`/analytics/financial${query ? `?${query}` : ''}`);
  },

  /**
   * Get utilization analytics
   */
  getUtilizationAnalytics: async (): Promise<{
    firmWide: number;
    byDepartment: Array<{ departmentId: number; name: string; rate: number }>;
    byRole: Array<{ roleId: number; name: string; rate: number }>;
  }> => {
    return api.get('/analytics/utilization');
  },

  /**
   * Get non-financial performance analytics
   */
  getNonFinancialAnalytics: async (): Promise<{
    averageScore: number;
    byPillar: {
      customer: number;
      process: number;
      learning: number;
    };
    topPerformers: Array<{
      employeeId: number;
      name: string;
      score: number;
    }>;
  }> => {
    return api.get('/non-financial-performance');
  },
};

export default dashboardsAPI;
