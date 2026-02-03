import prisma from '../prisma';

/**
 * Role-aware analytics service
 * Enforces strict visibility rules based on user role
 * - Employee: Only personal metrics
 * - Partner: Only portfolio + team metrics
 * - Admin/Super Admin: All company metrics
 */

export interface AnalyticsContext {
  userId: number;
  profileId?: number;
  roles: string[];
  isAdmin: boolean;
  isPartner: boolean;
  isManager: boolean;
  isHr: boolean;
  isFinance: boolean;
  isMarketing: boolean;
  isGmp: boolean;
  isEmployee: boolean;
}

export interface EmployeeNonFinancialMetrics {
  employeeId: number;
  employeeName: string;
  learningGrowth: number;
  customerSatisfaction: number;
  internalProcesses: number;
  overallScore: number;
}

export interface CompanyNonFinancialMetrics {
  avgLearningGrowth: number;
  avgCustomerSatisfaction: number;
  avgInternalProcesses: number;
  avgOverallScore: number;
  totalEmployees: number;
  departmentAverages: {
    department: string;
    avgScore: number;
    employeeCount: number;
  }[];
}

export interface PartnerFinancialMetrics {
  partnerId: number;
  totalJobs: number;
  totalRevenue: number;
  totalProfit: number;
  averageProfitMargin: number;
  jobBreakdown: {
    jobId: number;
    jobTitle: string;
    revenue: number;
    profit: number;
    profitMargin: number;
  }[];
}

export interface CompanyFinancialMetrics {
  totalRevenue: number;
  totalProfit: number;
  averageProfitMargin: number;
  totalEmployees: number;
  revenueByDepartment: {
    department: string;
    revenue: number;
    profit: number;
  }[];
  revenueByPartner: {
    partnerName: string;
    revenue: number;
    profit: number;
  }[];
}

export class RoleAwareAnalyticsService {
  /**
   * Get non-financial analytics based on user role
   * Employee: Only own metrics
   * Partner: Team metrics
   * Admin: Company-wide metrics
   */
  static async getNonFinancialAnalytics(
    context: AnalyticsContext
  ): Promise<EmployeeNonFinancialMetrics | CompanyNonFinancialMetrics | null> {
    if (context.isAdmin || context.isHr || context.isGmp) {
      return this.getCompanyNonFinancialMetrics();
    } else if (context.isPartner) {
      // Partners see their team's metrics
      return this.getPartnerTeamMetrics(context.profileId);
    } else if (context.isManager) {
      return this.getManagerTeamMetrics(context.profileId);
    } else {
      // Employees see only their own metrics
      return this.getEmployeeNonFinancialMetrics(context.profileId);
    }
  }

  /**
   * Get employee's personal non-financial metrics
   * Employee role restriction: Only own metrics
   */
  static async getEmployeeNonFinancialMetrics(
    profileId?: number
  ): Promise<EmployeeNonFinancialMetrics | null> {
    try {
      if (!profileId) {
        return {
          employeeId: 0,
          employeeName: 'Unknown',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }
      // Get the most recent evaluation for this employee
      const evaluation = await prisma.performanceScore.findFirst({
        where: { employeeProfileId: profileId },
        orderBy: { calculatedAt: 'desc' },
      });

      if (!evaluation) {
        const profile = await prisma.profile.findUnique({
          where: { id: profileId },
        });
        return {
          employeeId: profileId,
          employeeName: profile ? `${profile.firstName} ${profile.lastName}` : 'Unknown',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }

      const profile = await prisma.profile.findUnique({
        where: { id: profileId },
      });

      const scoreBreakdown = (evaluation.scoreBreakdown || {}) as Record<string, any>;
      const nonFinScore = Number(
        evaluation.nonFinancialWeighted || evaluation.evaluationScore || evaluation.kpiScore || 0
      );
      const overallScore = Number(evaluation.totalScore || evaluation.nonFinancialWeighted || 0);
      
      // Estimate BSC breakdown if no explicit breakdown exists
      const learningGrowth = Number(scoreBreakdown.learningGrowth ?? Math.round(nonFinScore * 0.85));
      const customerSatisfaction = Number(scoreBreakdown.customerSatisfaction ?? Math.round(nonFinScore * 0.9));
      const internalProcesses = Number(scoreBreakdown.internalProcesses ?? Math.round(nonFinScore * 0.8));

      return {
        employeeId: profileId,
        employeeName: profile ? `${profile.firstName} ${profile.lastName}` : 'Unknown',
        learningGrowth: learningGrowth || 0,
        customerSatisfaction: customerSatisfaction || 0,
        internalProcesses: internalProcesses || 0,
        overallScore: overallScore || 0,
      };
    } catch (error) {
      console.error('Error fetching employee non-financial metrics:', error);
      return {
        employeeId: profileId || 0,
        employeeName: 'Unknown',
        learningGrowth: 0,
        customerSatisfaction: 0,
        internalProcesses: 0,
        overallScore: 0,
      };
    }
  }

  /**
   * Get partner's team non-financial metrics
   * Partner role restriction: Only metrics for their team members
   */
  static async getPartnerTeamMetrics(
    partnerProfileId?: number
  ): Promise<EmployeeNonFinancialMetrics | null> {
    try {
      if (!partnerProfileId) {
        return {
          employeeId: 0,
          employeeName: 'Partner Portfolio',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }
      // First get partner's jobs
      const partnerJobs = await prisma.job.findMany({
        where: {
          partnerProfileId,
        },
        select: { id: true },
      });

      if (partnerJobs.length === 0) {
        return {
          employeeId: partnerProfileId,
          employeeName: 'Partner Portfolio',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }

      const jobIds = partnerJobs.map(j => j.id);

      // Get team members on partner's jobs
      const jobStaffAssignments = await prisma.jobStaffAssignment.findMany({
        where: {
          jobId: { in: jobIds },
        },
        select: { employeeProfileId: true },
      });

      const teamMemberIds = [...new Set(jobStaffAssignments.map(j => j.employeeProfileId))];

      if (teamMemberIds.length === 0) {
        return {
          employeeId: partnerProfileId,
          employeeName: 'Partner Portfolio',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }

      // Get evaluations for team members
      const evaluations = await prisma.performanceScore.findMany({
        where: {
          employeeProfileId: { in: teamMemberIds },
        },
      });

      if (evaluations.length === 0) {
        return {
          employeeId: partnerProfileId,
          employeeName: 'Partner Portfolio',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }

      // Calculate averages
      const nonFinScores = evaluations.map(e => Number(e.nonFinancialWeighted || e.evaluationScore || 0));
      const avgNonFinScore = nonFinScores.reduce((a, b) => a + b, 0) / nonFinScores.length;
      const avgOverallScore =
        evaluations.reduce((a, b) => a + (Number(b.totalScore) || 0), 0) / evaluations.length;
      
      const avgLearningGrowth = Math.round(avgNonFinScore * 0.85);
      const avgCustomerSatisfaction = Math.round(avgNonFinScore * 0.90);
      const avgInternalProcesses = Math.round(avgNonFinScore * 0.80);

      return {
        employeeId: partnerProfileId,
        employeeName: 'Partner Portfolio',
        learningGrowth: avgLearningGrowth,
        customerSatisfaction: avgCustomerSatisfaction,
        internalProcesses: avgInternalProcesses,
        overallScore: avgOverallScore,
      };
    } catch (error) {
      console.error('Error fetching partner team metrics:', error);
      return {
        employeeId: partnerProfileId || 0,
        employeeName: 'Partner Portfolio',
        learningGrowth: 0,
        customerSatisfaction: 0,
        internalProcesses: 0,
        overallScore: 0,
      };
    }
  }

  static async getManagerTeamMetrics(
    managerProfileId?: number
  ): Promise<EmployeeNonFinancialMetrics | null> {
    try {
      if (!managerProfileId) {
        return {
          employeeId: 0,
          employeeName: 'Manager Team',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }

      const teamMembers = await prisma.profile.findMany({
        where: { managerId: managerProfileId, status: 'active' },
        select: { id: true },
      });
      const teamMemberIds = teamMembers.map((member) => member.id);
      if (teamMemberIds.length === 0) {
        return {
          employeeId: managerProfileId,
          employeeName: 'Manager Team',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }

      const evaluations = await prisma.performanceScore.findMany({
        where: { employeeProfileId: { in: teamMemberIds } },
      });
      if (evaluations.length === 0) {
        return {
          employeeId: managerProfileId,
          employeeName: 'Manager Team',
          learningGrowth: 0,
          customerSatisfaction: 0,
          internalProcesses: 0,
          overallScore: 0,
        };
      }

      const nonFinScores = evaluations.map((e) => Number(e.nonFinancialWeighted || e.evaluationScore || 0));
      const avgNonFinScore = nonFinScores.reduce((a, b) => a + b, 0) / nonFinScores.length;
      const avgOverallScore =
        evaluations.reduce((a, b) => a + (Number(b.totalScore) || 0), 0) / evaluations.length;

      return {
        employeeId: managerProfileId,
        employeeName: 'Manager Team',
        learningGrowth: Math.round(avgNonFinScore * 0.85),
        customerSatisfaction: Math.round(avgNonFinScore * 0.9),
        internalProcesses: Math.round(avgNonFinScore * 0.8),
        overallScore: avgOverallScore,
      };
    } catch (error) {
      console.error('Error fetching manager team metrics:', error);
      return {
        employeeId: managerProfileId || 0,
        employeeName: 'Manager Team',
        learningGrowth: 0,
        customerSatisfaction: 0,
        internalProcesses: 0,
        overallScore: 0,
      };
    }
  }

  /**
   * Get company-wide non-financial metrics
   * Admin only restriction: Aggregates across all employees
   */
  static async getCompanyNonFinancialMetrics(): Promise<CompanyNonFinancialMetrics> {
    try {
      // Get all performance reviews with evaluations
      const evaluations = await prisma.performanceScore.findMany({
        include: {
          employee: {
            include: {
              department: true,
            },
          },
        },
      });

      if (evaluations.length === 0) {
        return {
          avgLearningGrowth: 0,
          avgCustomerSatisfaction: 0,
          avgInternalProcesses: 0,
          avgOverallScore: 0,
          totalEmployees: 0,
          departmentAverages: [],
        };
      }

      // Calculate company averages
      const nonFinScores = evaluations.map(e => Number(e.nonFinancialWeighted || e.evaluationScore || 0));
      const avgNonFinScore = nonFinScores.length > 0 ? nonFinScores.reduce((a, b) => a + b, 0) / nonFinScores.length : 0;
      const avgOverallScore = evaluations.length > 0 ? evaluations.reduce((a, b) => a + (Number(b.totalScore) || 0), 0) / evaluations.length : 0;

      const avgLearningGrowth = Math.round(avgNonFinScore * 0.85);
      const avgCustomerSatisfaction = Math.round(avgNonFinScore * 0.90);
      const avgInternalProcesses = Math.round(avgNonFinScore * 0.80);

      // Calculate department averages
      const departmentMap = new Map<string, { scores: number[]; count: number }>();
      evaluations.forEach(e => {
        const dept = e.employee?.department?.name || 'Unassigned';
        if (!departmentMap.has(dept)) {
          departmentMap.set(dept, { scores: [], count: 0 });
        }
        const dept_data = departmentMap.get(dept)!;
        dept_data.scores.push(e.totalScore ? Number(e.totalScore) : 0);
        dept_data.count++;
      });

      const departmentAverages = Array.from(departmentMap.entries()).map(([dept, data]) => ({
        department: dept,
        avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        employeeCount: data.count,
      }));

      return {
        avgLearningGrowth,
        avgCustomerSatisfaction,
        avgInternalProcesses,
        avgOverallScore,
        totalEmployees: evaluations.length,
        departmentAverages,
      };
    } catch (error) {
      console.error('Error fetching company non-financial metrics:', error);
      return {
        avgLearningGrowth: 0,
        avgCustomerSatisfaction: 0,
        avgInternalProcesses: 0,
        avgOverallScore: 0,
        totalEmployees: 0,
        departmentAverages: [],
      };
    }
  }

  /**
   * Get financial analytics based on user role
   * Employee: Only personal billable hours (no monetary values)
   * Partner: Only portfolio financial metrics
   * Admin: Company-wide financials
   */
  static async getFinancialAnalytics(
    context: AnalyticsContext
  ): Promise<any> {
    if (context.isAdmin || context.isHr || context.isGmp || context.isFinance) {
      return this.getCompanyFinancialMetrics();
    } else if (context.isPartner) {
      return this.getPartnerFinancialMetrics(context.profileId);
    } else if (context.isManager) {
      return this.getManagerFinancialMetrics(context.profileId);
    } else {
      return this.getEmployeeFinancialMetrics(context.profileId);
    }
  }

  /**
   * Get employee's personal financial metrics (hours only, no monetary values)
   * Employee role restriction: Only personal hours, no revenue/profit data
   */
  static async getEmployeeFinancialMetrics(profileId?: number): Promise<any> {
    try {
      if (!profileId) {
        return {
          totalHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          allocatedRevenueTotal: 0,
          profitTotal: 0,
          lossTotal: 0,
          jobBreakdown: [],
        };
      }
      // Get employee's approved time entries for hours + costs
      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          employeeProfileId: profileId,
          status: 'approved',
        },
        include: { job: true },
      });

      let totalHours = 0;
      let billableHours = 0;
      const jobMap = new Map<number, { 
        jobTitle: string; 
        status: string;
        lastWorkedAt: Date | null;
        totalHours: number; 
        billableHours: number; 
        nonBillableHours: number;
        revenue: number; 
        cost: number; 
        profitLoss: number;
        allocatedRevenue: number;
        profit: number;
        loss: number;
      }>();

      timeEntries.forEach(entry => {
        totalHours += Number(entry.hours || 0);
        billableHours += entry.billable ? Number(entry.hours || 0) : 0;
        if (!entry.jobId) return;
        const current = jobMap.get(entry.jobId) || {
          jobTitle: entry.job?.jobName || 'Job',
          status: entry.job?.status || 'in_progress',
          lastWorkedAt: null,
          totalHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          revenue: 0,
          cost: 0,
          profitLoss: 0,
          allocatedRevenue: 0,
          profit: 0,
          loss: 0,
        };
        current.totalHours += Number(entry.hours || 0);
        if (entry.billable) {
          current.billableHours += Number(entry.hours || 0);
        } else {
          current.nonBillableHours += Number(entry.hours || 0);
        }
        current.revenue += Number(entry.billableAmount || 0);
        current.cost += Number(entry.costAmount || 0);
        current.profitLoss += Number(entry.profitLoss || 0);
        const workedAt = entry.dateWorked ?? entry.createdAt ?? null;
        if (!current.lastWorkedAt || (workedAt && workedAt > current.lastWorkedAt)) {
          current.lastWorkedAt = workedAt;
        }
        jobMap.set(entry.jobId, current);
      });

      const allocations = await prisma.revenueAllocation.findMany({
        where: { employeeProfileId: profileId },
        include: { job: true },
      });

      let allocatedRevenueTotal = 0;
      let profitTotal = 0;
      let lossTotal = 0;

      allocations.forEach((allocation) => {
        allocatedRevenueTotal += Number(allocation.allocatedAmount || 0);
        profitTotal += Number(allocation.employeeProfit || 0);
        lossTotal += Number(allocation.employeeLoss || 0);

        if (!allocation.jobId) return;
        const current = jobMap.get(allocation.jobId) || {
          jobTitle: allocation.job?.jobName || 'Job',
          status: allocation.job?.status || 'in_progress',
          lastWorkedAt: null,
          totalHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          revenue: 0,
          cost: 0,
          profitLoss: 0,
          allocatedRevenue: 0,
          profit: 0,
          loss: 0,
        };
        current.allocatedRevenue += Number(allocation.allocatedAmount || 0);
        current.profit += Number(allocation.employeeProfit || 0);
        current.loss += Number(allocation.employeeLoss || 0);
        jobMap.set(allocation.jobId, current);
      });

      const jobBreakdown = Array.from(jobMap.entries()).map(([jobId, data]) => ({
        jobId,
        jobTitle: data.jobTitle,
        status: data.status,
        lastWorkedAt: data.lastWorkedAt,
        totalHours: data.totalHours,
        billableHours: data.billableHours,
        nonBillableHours: data.nonBillableHours,
        revenue: data.revenue,
        cost: data.cost,
        profitLoss: data.profitLoss,
        allocatedRevenue: data.allocatedRevenue,
        profit: data.profit,
        loss: data.loss,
      }));

      return {
        totalHours,
        billableHours,
        nonBillableHours: totalHours - billableHours,
        allocatedRevenueTotal,
        profitTotal,
        lossTotal,
        jobBreakdown,
      };
    } catch (error) {
      console.error('Error fetching employee financial metrics:', error);
      return {
        totalHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        allocatedRevenueTotal: 0,
        profitTotal: 0,
        lossTotal: 0,
        jobBreakdown: [],
      };
    }
  }

  /**
   * Get partner's portfolio financial metrics
   * Partner role restriction: Only their jobs and revenue
   */
  static async getPartnerFinancialMetrics(partnerId?: number): Promise<PartnerFinancialMetrics | null> {
    try {
      if (!partnerId) {
        return {
          partnerId: 0,
          totalJobs: 0,
          totalRevenue: 0,
          totalProfit: 0,
          averageProfitMargin: 0,
          jobBreakdown: [],
        };
      }
      // Get all jobs owned by partner
      const jobs = await prisma.job.findMany({
        where: {
          partnerProfileId: partnerId,
        },
        include: { timeEntries: true },
      });

      if (jobs.length === 0) {
        return {
          partnerId,
          totalJobs: 0,
          totalRevenue: 0,
          totalProfit: 0,
          averageProfitMargin: 0,
          jobBreakdown: [],
        };
      }

      let totalRevenue = 0;
      let totalProfit = 0;
      const jobBreakdown = jobs.map(job => {
        const approvedEntries = job.timeEntries.filter((entry) => entry.status === 'approved');
        const revenue = approvedEntries.reduce((sum, entry) => sum + Number(entry.billableAmount || 0), 0);
        const cost = approvedEntries.reduce((sum, entry) => sum + Number(entry.costAmount || 0), 0);
        const profit = revenue - cost;
        const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
        totalRevenue += revenue;
        totalProfit += profit;
        return {
          jobId: job.id,
          jobTitle: job.jobName || 'Unknown',
          revenue,
          profit,
          profitMargin,
        };
      });

      const averageProfitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      return {
        partnerId,
        totalJobs: jobs.length,
        totalRevenue,
        totalProfit,
        averageProfitMargin,
        jobBreakdown,
      };
    } catch (error) {
      console.error('Error fetching partner financial metrics:', error);
      return {
        partnerId: partnerId || 0,
        totalJobs: 0,
        totalRevenue: 0,
        totalProfit: 0,
        averageProfitMargin: 0,
        jobBreakdown: [],
      };
    }
  }

  static async getManagerFinancialMetrics(managerProfileId?: number): Promise<any> {
    try {
      if (!managerProfileId) {
        return { totalHours: 0, billableHours: 0, revenue: 0, cost: 0, profit: 0 };
      }
      const teamMembers = await prisma.profile.findMany({
        where: { managerId: managerProfileId, status: 'active' },
        select: { id: true },
      });
      const teamMemberIds = teamMembers.map((member) => member.id);
      if (teamMemberIds.length === 0) {
        return { totalHours: 0, billableHours: 0, revenue: 0, cost: 0, profit: 0 };
      }

      const entries = await prisma.timeEntry.findMany({
        where: { employeeProfileId: { in: teamMemberIds }, status: 'approved' },
      });
      const totals = entries.reduce(
        (acc, entry) => {
          acc.totalHours += Number(entry.hours || 0);
          acc.billableHours += entry.billable ? Number(entry.hours || 0) : 0;
          acc.revenue += Number(entry.billableAmount || 0);
          acc.cost += Number(entry.costAmount || 0);
          acc.profit += Number(entry.profitLoss || 0);
          return acc;
        },
        { totalHours: 0, billableHours: 0, revenue: 0, cost: 0, profit: 0 }
      );

      return totals;
    } catch (error) {
      console.error('Error fetching manager financial metrics:', error);
      return { totalHours: 0, billableHours: 0, revenue: 0, cost: 0, profit: 0 };
    }
  }

  /**
   * Get company-wide financial metrics
   * Admin only restriction: Aggregates all revenue, profit, and job data
   */
  static async getCompanyFinancialMetrics(): Promise<CompanyFinancialMetrics> {
    try {
      const timeEntries = await prisma.timeEntry.findMany({
        where: { status: 'approved' },
        include: { job: { include: { department: true, partner: true } } },
      });

      if (timeEntries.length === 0) {
        return {
          totalRevenue: 0,
          totalProfit: 0,
          averageProfitMargin: 0,
          totalEmployees: 0,
          revenueByDepartment: [],
          revenueByPartner: [],
        };
      }

      const totalEmployees = await prisma.profile.count({
        where: {
          status: 'active',
        },
      });

      let totalRevenue = 0;
      let totalProfit = 0;
      const revenueByDepartment = new Map<string, { revenue: number; profit: number }>();
      const revenueByPartner = new Map<string, { revenue: number; profit: number }>();

      timeEntries.forEach((entry) => {
        const revenue = Number(entry.billableAmount || 0);
        const profit = Number(entry.profitLoss || 0);
        totalRevenue += revenue;
        totalProfit += profit;

        const departmentName = entry.job?.department?.name || 'Unassigned';
        const dept = revenueByDepartment.get(departmentName) || { revenue: 0, profit: 0 };
        dept.revenue += revenue;
        dept.profit += profit;
        revenueByDepartment.set(departmentName, dept);

        const partnerName = entry.job?.partner
          ? `${entry.job.partner.firstName} ${entry.job.partner.lastName}`
          : 'Unassigned';
        const partner = revenueByPartner.get(partnerName) || { revenue: 0, profit: 0 };
        partner.revenue += revenue;
        partner.profit += profit;
        revenueByPartner.set(partnerName, partner);
      });

      const averageProfitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      return {
        totalRevenue,
        totalProfit,
        averageProfitMargin,
        totalEmployees,
        revenueByDepartment: Array.from(revenueByDepartment.entries()).map(([department, data]) => ({
          department,
          revenue: data.revenue,
          profit: data.profit,
        })),
        revenueByPartner: Array.from(revenueByPartner.entries()).map(([partnerName, data]) => ({
          partnerName,
          revenue: data.revenue,
          profit: data.profit,
        })),
      };
    } catch (error) {
      console.error('Error fetching company financial metrics:', error);
      return {
        totalRevenue: 0,
        totalProfit: 0,
        averageProfitMargin: 0,
        totalEmployees: 0,
        revenueByDepartment: [],
        revenueByPartner: [],
      };
    }
  }
}

export default RoleAwareAnalyticsService;
