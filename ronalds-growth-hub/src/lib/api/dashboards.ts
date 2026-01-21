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

export const dashboardsAPI = {
  // ==================
  // GMP DASHBOARD
  // ==================

  /**
   * Get GMP (Group Managing Partner) dashboard data
   */
  getGmpDashboard: async (): Promise<GMPOverview> => {
    return api.get('/gmp-dashboard');
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
    return api.get('/gmp-dashboard/department-performance');
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
    return api.get('/gmp-dashboard/partner-performance');
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
    const params = new URLSearchParams();
    if (period?.year) params.append('year', String(period.year));
    if (period?.month) params.append('month', String(period.month));
    
    const query = params.toString();
    return api.get(`/gmp-dashboard/projections${query ? `?${query}` : ''}`);
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
  getPartnerClients: async (): Promise<any[]> => {
    return api.get('/partners/clients');
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
    timeEntries: any[];
    overBudgetRequests: any[];
    jobCostings: any[];
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
    cases: any[];
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
    notifications: any[];
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
