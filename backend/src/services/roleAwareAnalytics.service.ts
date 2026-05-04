import prisma from '../prisma';
import JobPerformanceFactsService, {
  JobPerformanceFact,
} from './jobPerformanceFacts.service';

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
  billableValue: number;
  billedRevenue: number;
  collectedRevenue: number;
  totalProfit: number;
  workInProgressProfit: number;
  billedProfit: number;
  cashProfit: number;
  averageProfitMargin: number;
  jobBreakdown: {
    jobId: number;
    jobTitle: string;
    revenue: number;
    profit: number;
    profitMargin: number;
    billableValue: number;
    billedRevenue: number;
    collectedRevenue: number;
    actualCost: number;
    billableHours: number;
    nonBillableHours: number;
  }[];
}

export interface CompanyFinancialMetrics {
  totalRevenue: number;
  billableValue: number;
  billedRevenue: number;
  collectedRevenue: number;
  actualCost: number;
  totalProfit: number;
  workInProgressProfit: number;
  billedProfit: number;
  cashProfit: number;
  averageProfitMargin: number;
  totalEmployees: number;
  revenueByDepartment: {
    department: string;
    revenue: number;
    profit: number;
    billableValue: number;
    billedRevenue: number;
    collectedRevenue: number;
    actualCost: number;
  }[];
  revenueByPartner: {
    partnerName: string;
    revenue: number;
    profit: number;
    billableValue: number;
    billedRevenue: number;
    collectedRevenue: number;
    actualCost: number;
  }[];
}

const sumFacts = (facts: JobPerformanceFact[]) =>
  facts.reduce(
    (acc, fact) => {
      acc.totalHours += fact.totalHours;
      acc.billableHours += fact.billableHours;
      acc.nonBillableHours += fact.nonBillableHours;
      acc.billableValue += fact.billableValue;
      acc.billedRevenue += fact.billedRevenue;
      acc.collectedRevenue += fact.collectedRevenue;
      acc.actualCost += fact.actualCost;
      acc.workInProgressProfit += fact.workInProgressProfit;
      acc.billedProfit += fact.billedProfit;
      acc.cashProfit += fact.cashProfit;
      return acc;
    },
    {
      totalHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      billableValue: 0,
      billedRevenue: 0,
      collectedRevenue: 0,
      actualCost: 0,
      workInProgressProfit: 0,
      billedProfit: 0,
      cashProfit: 0,
    }
  );

const marginPercent = (profit: number, revenue: number) =>
  revenue > 0 ? (profit / revenue) * 100 : 0;

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
        evaluation.nonFinancialWeighted || evaluation.evaluationScore || 0
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
          financialsVisible: false,
          jobBreakdown: [],
        };
      }

      const facts = await JobPerformanceFactsService.listFacts(
        { employeeProfileId: profileId },
        { type: 'employee', profileId }
      );
      const totals = sumFacts(facts);
      const jobBreakdown = facts.map((fact) => {
        const employeeFact = fact.employees.find((employee) => employee.employeeProfileId === profileId);
        const totalHours = employeeFact?.totalHours ?? 0;
        const billableHours = employeeFact?.billableHours ?? 0;
        const nonBillableHours = employeeFact?.nonBillableHours ?? 0;
        const contributionScore = totalHours > 0 ? Number(((billableHours / totalHours) * 100).toFixed(2)) : 0;

        return {
          jobId: fact.jobId,
          jobTitle: fact.jobName || 'Job',
          status: fact.status,
          lastWorkedAt: null,
          totalHours,
          billableHours,
          nonBillableHours,
          utilizationPercent: contributionScore,
          contributionScore,
          budgetHours: fact.budgetHours,
          budgetUsedPercent: fact.budgetUsedPercent,
          remainingBudgetHours: Math.max(0, fact.budgetHours - fact.totalHours),
          revenue: 0,
          cost: 0,
          profitLoss: 0,
          allocatedRevenue: 0,
          profit: 0,
          loss: 0,
          financialsVisible: false,
        };
      });

      return {
        totalHours: totals.totalHours,
        billableHours: totals.billableHours,
        nonBillableHours: totals.nonBillableHours,
        utilizationPercent: totals.totalHours > 0 ? (totals.billableHours / totals.totalHours) * 100 : 0,
        allocatedRevenueTotal: 0,
        profitTotal: 0,
        lossTotal: 0,
        financialsVisible: false,
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
        financialsVisible: false,
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
          billableValue: 0,
          billedRevenue: 0,
          collectedRevenue: 0,
          totalProfit: 0,
          workInProgressProfit: 0,
          billedProfit: 0,
          cashProfit: 0,
          averageProfitMargin: 0,
          jobBreakdown: [],
        };
      }

      const facts = await JobPerformanceFactsService.listFacts({}, { type: 'partner', profileId: partnerId });
      if (facts.length === 0) {
        return {
          partnerId,
          totalJobs: 0,
          totalRevenue: 0,
          billableValue: 0,
          billedRevenue: 0,
          collectedRevenue: 0,
          totalProfit: 0,
          workInProgressProfit: 0,
          billedProfit: 0,
          cashProfit: 0,
          averageProfitMargin: 0,
          jobBreakdown: [],
        };
      }

      const totals = sumFacts(facts);
      const jobBreakdown = facts.map((fact) => {
        return {
          jobId: fact.jobId,
          jobTitle: fact.jobName || 'Unknown',
          revenue: fact.collectedRevenue,
          profit: fact.cashProfit,
          profitMargin: fact.marginPercent,
          billableValue: fact.billableValue,
          billedRevenue: fact.billedRevenue,
          collectedRevenue: fact.collectedRevenue,
          actualCost: fact.actualCost,
          billableHours: fact.billableHours,
          nonBillableHours: fact.nonBillableHours,
        };
      });

      return {
        partnerId,
        totalJobs: facts.length,
        totalRevenue: totals.collectedRevenue,
        billableValue: totals.billableValue,
        billedRevenue: totals.billedRevenue,
        collectedRevenue: totals.collectedRevenue,
        totalProfit: totals.cashProfit,
        workInProgressProfit: totals.workInProgressProfit,
        billedProfit: totals.billedProfit,
        cashProfit: totals.cashProfit,
        averageProfitMargin: marginPercent(totals.cashProfit, totals.collectedRevenue),
        jobBreakdown,
      };
    } catch (error) {
      console.error('Error fetching partner financial metrics:', error);
      return {
        partnerId: partnerId || 0,
        totalJobs: 0,
        totalRevenue: 0,
        billableValue: 0,
        billedRevenue: 0,
        collectedRevenue: 0,
        totalProfit: 0,
        workInProgressProfit: 0,
        billedProfit: 0,
        cashProfit: 0,
        averageProfitMargin: 0,
        jobBreakdown: [],
      };
    }
  }

  static async getManagerFinancialMetrics(managerProfileId?: number): Promise<any> {
    try {
      if (!managerProfileId) {
        return {
          totalHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          revenue: 0,
          billableValue: 0,
          billedRevenue: 0,
          collectedRevenue: 0,
          cost: 0,
          profit: 0,
          workInProgressProfit: 0,
          billedProfit: 0,
          cashProfit: 0,
          marginPercent: 0,
        };
      }

      const facts = await JobPerformanceFactsService.listFacts({}, { type: 'manager', profileId: managerProfileId });
      const totals = sumFacts(facts);

      return {
        totalHours: totals.totalHours,
        billableHours: totals.billableHours,
        nonBillableHours: totals.nonBillableHours,
        revenue: totals.collectedRevenue,
        billableValue: totals.billableValue,
        billedRevenue: totals.billedRevenue,
        collectedRevenue: totals.collectedRevenue,
        cost: totals.actualCost,
        profit: totals.cashProfit,
        workInProgressProfit: totals.workInProgressProfit,
        billedProfit: totals.billedProfit,
        cashProfit: totals.cashProfit,
        marginPercent: marginPercent(totals.cashProfit, totals.collectedRevenue),
      };
    } catch (error) {
      console.error('Error fetching manager financial metrics:', error);
      return {
        totalHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        revenue: 0,
        billableValue: 0,
        billedRevenue: 0,
        collectedRevenue: 0,
        cost: 0,
        profit: 0,
        workInProgressProfit: 0,
        billedProfit: 0,
        cashProfit: 0,
        marginPercent: 0,
      };
    }
  }

  /**
   * Get company-wide financial metrics
   * Admin only restriction: Aggregates all revenue, profit, and job data
   */
  static async getCompanyFinancialMetrics(): Promise<CompanyFinancialMetrics> {
    try {
      const [facts, totalEmployees, departments, partners] = await Promise.all([
        JobPerformanceFactsService.listFacts({}, { type: 'firm' }),
        prisma.profile.count({ where: { status: 'active' } }),
        prisma.department.findMany({ select: { id: true, name: true } }),
        prisma.profile.findMany({
          where: { isPartner: true },
          select: { id: true, firstName: true, lastName: true },
        }),
      ]);

      const totals = sumFacts(facts);
      const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
      const partnerNames = new Map(
        partners.map((partner) => [
          partner.id,
          `${partner.firstName || ''} ${partner.lastName || ''}`.trim() || 'Unassigned',
        ])
      );
      const revenueByDepartment = new Map<
        string,
        {
          revenue: number;
          profit: number;
          billableValue: number;
          billedRevenue: number;
          collectedRevenue: number;
          actualCost: number;
        }
      >();
      const revenueByPartner = new Map<
        string,
        {
          revenue: number;
          profit: number;
          billableValue: number;
          billedRevenue: number;
          collectedRevenue: number;
          actualCost: number;
        }
      >();

      facts.forEach((fact) => {
        const departmentName = fact.departmentId
          ? departmentNames.get(fact.departmentId) || 'Unassigned'
          : 'Unassigned';
        const department = revenueByDepartment.get(departmentName) || {
          revenue: 0,
          profit: 0,
          billableValue: 0,
          billedRevenue: 0,
          collectedRevenue: 0,
          actualCost: 0,
        };
        department.revenue += fact.collectedRevenue;
        department.profit += fact.cashProfit;
        department.billableValue += fact.billableValue;
        department.billedRevenue += fact.billedRevenue;
        department.collectedRevenue += fact.collectedRevenue;
        department.actualCost += fact.actualCost;
        revenueByDepartment.set(departmentName, department);

        const partnerName = fact.partnerProfileId
          ? partnerNames.get(fact.partnerProfileId) || 'Unassigned'
          : 'Unassigned';
        const partner = revenueByPartner.get(partnerName) || {
          revenue: 0,
          profit: 0,
          billableValue: 0,
          billedRevenue: 0,
          collectedRevenue: 0,
          actualCost: 0,
        };
        partner.revenue += fact.collectedRevenue;
        partner.profit += fact.cashProfit;
        partner.billableValue += fact.billableValue;
        partner.billedRevenue += fact.billedRevenue;
        partner.collectedRevenue += fact.collectedRevenue;
        partner.actualCost += fact.actualCost;
        revenueByPartner.set(partnerName, partner);
      });

      return {
        totalRevenue: totals.collectedRevenue,
        billableValue: totals.billableValue,
        billedRevenue: totals.billedRevenue,
        collectedRevenue: totals.collectedRevenue,
        actualCost: totals.actualCost,
        totalProfit: totals.cashProfit,
        workInProgressProfit: totals.workInProgressProfit,
        billedProfit: totals.billedProfit,
        cashProfit: totals.cashProfit,
        averageProfitMargin: marginPercent(totals.cashProfit, totals.collectedRevenue),
        totalEmployees,
        revenueByDepartment: Array.from(revenueByDepartment.entries()).map(([department, data]) => ({
          department,
          revenue: data.revenue,
          profit: data.profit,
          billableValue: data.billableValue,
          billedRevenue: data.billedRevenue,
          collectedRevenue: data.collectedRevenue,
          actualCost: data.actualCost,
        })),
        revenueByPartner: Array.from(revenueByPartner.entries()).map(([partnerName, data]) => ({
          partnerName,
          revenue: data.revenue,
          profit: data.profit,
          billableValue: data.billableValue,
          billedRevenue: data.billedRevenue,
          collectedRevenue: data.collectedRevenue,
          actualCost: data.actualCost,
        })),
      };
    } catch (error) {
      console.error('Error fetching company financial metrics:', error);
      return {
        totalRevenue: 0,
        billableValue: 0,
        billedRevenue: 0,
        collectedRevenue: 0,
        actualCost: 0,
        totalProfit: 0,
        workInProgressProfit: 0,
        billedProfit: 0,
        cashProfit: 0,
        averageProfitMargin: 0,
        totalEmployees: 0,
        revenueByDepartment: [],
        revenueByPartner: [],
      };
    }
  }
}

export default RoleAwareAnalyticsService;
