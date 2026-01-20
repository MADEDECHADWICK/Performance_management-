/**
 * Budget Allocation Service (Phase 5)
 * Handles budget calculations, allocations, and tracking
 */

import { prisma } from '../lib/prisma';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface BudgetAllocationInput {
  job_id: number;
  department_id: number;
  total_budget: number;
  personnel_budget: number;
  operational_budget: number;
  contingency_percentage: number;
  fiscal_year: number;
}

interface BudgetUtilizationInput {
  budget_allocation_id: number;
  amount_spent: number;
  category: string;
  description: string;
}

interface BudgetForecastInput {
  job_id: number;
  estimated_personnel_cost: number;
  estimated_operational_cost: number;
  confidence_level: number; // 0-100
}

export class BudgetService {
  /**
   * Create budget allocation
   */
  static async createBudgetAllocation(
    input: BudgetAllocationInput,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION (admin/manager only)
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can create budget allocations',
      };
    }

    // ✅ VALIDATE INPUTS
    if (input.personnel_budget + input.operational_budget > input.total_budget) {
      throw {
        statusCode: 400,
        message: 'Personnel + Operational budget cannot exceed total budget',
      };
    }

    if (input.contingency_percentage < 0 || input.contingency_percentage > 100) {
      throw {
        statusCode: 400,
        message: 'Contingency percentage must be between 0-100',
      };
    }

    // ✅ VERIFY JOB EXISTS
    const job = await prisma.job.findUnique({
      where: { id: input.job_id },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ CALCULATE CONTINGENCY AMOUNT
    const contingencyAmount =
      input.total_budget * (input.contingency_percentage / 100);
    const availableBudget =
      input.total_budget - contingencyAmount;

    // ✅ CREATE ALLOCATION
    const allocation = await prisma.budgetAllocation.create({
      data: {
        job_id: input.job_id,
        department_id: input.department_id,
        fiscal_year: input.fiscal_year,
        total_budget: input.total_budget,
        personnel_budget: input.personnel_budget,
        operational_budget: input.operational_budget,
        contingency_amount: contingencyAmount,
        contingency_percentage: input.contingency_percentage,
        available_budget: availableBudget,
        spent_amount: 0,
        status: 'active',
        created_at: new Date(),
      },
      include: {
        job: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    return allocation;
  }

  /**
   * Record budget expenditure
   */
  static async recordExpenditure(
    input: BudgetUtilizationInput,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers can record expenditures',
      };
    }

    // ✅ VERIFY ALLOCATION EXISTS
    const allocation = await prisma.budgetAllocation.findUnique({
      where: { id: input.budget_allocation_id },
    });

    if (!allocation) {
      throw {
        statusCode: 404,
        message: 'Budget allocation not found',
      };
    }

    // ✅ CHECK BUDGET AVAILABILITY
    const newSpentAmount = allocation.spent_amount + input.amount_spent;
    if (newSpentAmount > allocation.total_budget) {
      throw {
        statusCode: 400,
        message: `Insufficient budget. Remaining: ${allocation.total_budget - allocation.spent_amount}`,
      };
    }

    // ✅ CALCULATE NEW AVAILABLE BUDGET
    const contingencyAmount = allocation.contingency_amount;
    const newAvailableBudget = allocation.total_budget - contingencyAmount - newSpentAmount;

    // ✅ RECORD EXPENDITURE
    const utilization = await prisma.budgetUtilization.create({
      data: {
        budget_allocation_id: input.budget_allocation_id,
        amount_spent: input.amount_spent,
        category: input.category,
        description: input.description,
        recorded_by_profile_id: auth.profileId,
        recorded_at: new Date(),
      },
    });

    // ✅ UPDATE ALLOCATION
    const updated = await prisma.budgetAllocation.update({
      where: { id: input.budget_allocation_id },
      data: {
        spent_amount: newSpentAmount,
        available_budget: newAvailableBudget,
        status:
          newSpentAmount >= allocation.total_budget * 0.9 ? 'critical' : 'active',
      },
      include: {
        job: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    return {
      utilization,
      allocation: updated,
    };
  }

  /**
   * Get budget utilization report
   */
  static async getBudgetUtilizationReport(
    budgetAllocationId: number,
    auth: AuthContext
  ) {
    const allocation = await prisma.budgetAllocation.findUnique({
      where: { id: budgetAllocationId },
      include: {
        utilizations: {
          orderBy: { recorded_at: 'desc' },
        },
        job: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    if (!allocation) {
      throw {
        statusCode: 404,
        message: 'Budget allocation not found',
      };
    }

    // ✅ CALCULATE METRICS
    const utilizationPercentage = (
      (allocation.spent_amount / allocation.total_budget) *
      100
    ).toFixed(2);

    const personnelUtilization = allocation.utilizations
      .filter(u => u.category === 'personnel')
      .reduce((sum, u) => sum + u.amount_spent, 0);

    const operationalUtilization = allocation.utilizations
      .filter(u => u.category === 'operational')
      .reduce((sum, u) => sum + u.amount_spent, 0);

    const contingencyUsed = allocation.utilizations
      .filter(u => u.category === 'contingency')
      .reduce((sum, u) => sum + u.amount_spent, 0);

    // ✅ CATEGORIZE UTILIZATIONS
    const byCategory = allocation.utilizations.reduce((acc, u) => {
      if (!acc[u.category]) {
        acc[u.category] = { total: 0, transactions: [] };
      }
      acc[u.category].total += u.amount_spent;
      acc[u.category].transactions.push(u);
      return acc;
    }, {} as Record<string, any>);

    return {
      allocation: {
        id: allocation.id,
        job: allocation.job,
        department: allocation.department,
        fiscalYear: allocation.fiscal_year,
        totalBudget: allocation.total_budget,
        spentAmount: allocation.spent_amount,
        availableBudget: allocation.available_budget,
        utilizationPercentage,
        status: allocation.status,
      },
      breakdown: {
        personnel: {
          allocated: allocation.personnel_budget,
          spent: personnelUtilization,
          percentage: (
            (personnelUtilization / allocation.personnel_budget) *
            100
          ).toFixed(2),
        },
        operational: {
          allocated: allocation.operational_budget,
          spent: operationalUtilization,
          percentage: (
            (operationalUtilization / allocation.operational_budget) *
            100
          ).toFixed(2),
        },
        contingency: {
          allocated: allocation.contingency_amount,
          spent: contingencyUsed,
          percentage: (
            (contingencyUsed / allocation.contingency_amount) *
            100
          ).toFixed(2),
        },
      },
      byCategory,
      recentTransactions: allocation.utilizations.slice(0, 10),
    };
  }

  /**
   * Create budget forecast
   */
  static async createBudgetForecast(
    input: BudgetForecastInput,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager', 'analyst'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only admins/managers/analysts can create forecasts',
      };
    }

    // ✅ VERIFY JOB EXISTS
    const job = await prisma.job.findUnique({
      where: { id: input.job_id },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    const totalEstimatedCost =
      input.estimated_personnel_cost + input.estimated_operational_cost;

    const forecast = await prisma.budgetForecast.create({
      data: {
        job_id: input.job_id,
        estimated_personnel_cost: input.estimated_personnel_cost,
        estimated_operational_cost: input.estimated_operational_cost,
        total_estimated_cost: totalEstimatedCost,
        confidence_level: input.confidence_level,
        created_by_profile_id: auth.profileId,
        created_at: new Date(),
      },
      include: {
        job: { select: { id: true, name: true } },
      },
    });

    return forecast;
  }

  /**
   * Get budget forecast vs actual
   */
  static async getBudgetForecastVsActual(jobId: number, auth: AuthContext) {
    // ✅ VERIFY JOB EXISTS
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    const [forecasts, allocations] = await Promise.all([
      prisma.budgetForecast.findMany({
        where: { job_id: jobId },
        orderBy: { created_at: 'desc' },
      }),
      prisma.budgetAllocation.findMany({
        where: { job_id: jobId },
        include: { utilizations: true },
      }),
    ]);

    // ✅ CALCULATE ACTUAL COSTS
    const actualPersonnelCost = allocations.reduce((sum, a) => {
      const personnel = a.utilizations
        .filter(u => u.category === 'personnel')
        .reduce((s, u) => s + u.amount_spent, 0);
      return sum + personnel;
    }, 0);

    const actualOperationalCost = allocations.reduce((sum, a) => {
      const operational = a.utilizations
        .filter(u => u.category === 'operational')
        .reduce((s, u) => s + u.amount_spent, 0);
      return sum + operational;
    }, 0);

    const totalActualCost = actualPersonnelCost + actualOperationalCost;

    // ✅ GET LATEST FORECAST
    const latestForecast = forecasts[0];

    return {
      job: { id: job.id, name: job.name },
      forecast: latestForecast ? {
        personnel: latestForecast.estimated_personnel_cost,
        operational: latestForecast.estimated_operational_cost,
        total: latestForecast.total_estimated_cost,
        confidenceLevel: latestForecast.confidence_level,
      } : null,
      actual: {
        personnel: actualPersonnelCost,
        operational: actualOperationalCost,
        total: totalActualCost,
      },
      variance: latestForecast ? {
        personnel: actualPersonnelCost - latestForecast.estimated_personnel_cost,
        operational:
          actualOperationalCost - latestForecast.estimated_operational_cost,
        total: totalActualCost - latestForecast.total_estimated_cost,
        percentageVariance: (
          ((totalActualCost - latestForecast.total_estimated_cost) /
            latestForecast.total_estimated_cost) *
          100
        ).toFixed(2),
      } : null,
      historicalForecasts: forecasts.map(f => ({
        createdAt: f.created_at,
        personnel: f.estimated_personnel_cost,
        operational: f.estimated_operational_cost,
        total: f.total_estimated_cost,
        confidence: f.confidence_level,
      })),
    };
  }

  /**
   * Get department budget summary
   */
  static async getDepartmentBudgetSummary(
    departmentId: number,
    fiscalYear: number,
    auth: AuthContext
  ) {
    const allocations = await prisma.budgetAllocation.findMany({
      where: {
        department_id: departmentId,
        fiscal_year: fiscalYear,
      },
      include: {
        job: { select: { id: true, name: true } },
      },
    });

    // ✅ AGGREGATE METRICS
    const totalAllocated = allocations.reduce((sum, a) => sum + a.total_budget, 0);
    const totalSpent = allocations.reduce((sum, a) => sum + a.spent_amount, 0);
    const totalAvailable = allocations.reduce(
      (sum, a) => sum + a.available_budget,
      0
    );

    const criticalAllocations = allocations.filter(a => a.status === 'critical');

    return {
      department: { id: departmentId, fiscalYear },
      summary: {
        totalAllocated,
        totalSpent,
        totalAvailable,
        utilizationPercentage: ((totalSpent / totalAllocated) * 100).toFixed(2),
      },
      allocations: allocations.map(a => ({
        id: a.id,
        job: a.job,
        budget: a.total_budget,
        spent: a.spent_amount,
        available: a.available_budget,
        status: a.status,
      })),
      alerts: {
        criticalCount: criticalAllocations.length,
        critical: criticalAllocations.map(a => ({
          jobId: a.job_id,
          jobName: a.job.name,
          message: `Budget utilization at ${((a.spent_amount / a.total_budget) * 100).toFixed(2)}%`,
        })),
      },
    };
  }

  /**
   * Analyze budget efficiency
   */
  static async analyzeBudgetEfficiency(jobId: number, auth: AuthContext) {
    const allocation = await prisma.budgetAllocation.findFirst({
      where: { job_id: jobId },
      include: {
        job: { select: { id: true, name: true, expected_revenue: true } },
        utilizations: true,
      },
    });

    if (!allocation) {
      throw {
        statusCode: 404,
        message: 'No budget allocation found for this job',
      };
    }

    // ✅ CALCULATE EFFICIENCY METRICS
    const budgetEfficiency = (
      (allocation.job.expected_revenue / allocation.total_budget) *
      100
    ).toFixed(2);

    const costToRevenue = (
      (allocation.spent_amount / allocation.job.expected_revenue) *
      100
    ).toFixed(2);

    const profitMargin = (
      ((allocation.job.expected_revenue - allocation.spent_amount) /
        allocation.job.expected_revenue) *
      100
    ).toFixed(2);

    return {
      job: allocation.job,
      budget: {
        allocated: allocation.total_budget,
        spent: allocation.spent_amount,
        available: allocation.available_budget,
      },
      revenue: allocation.job.expected_revenue,
      efficiency: {
        budgetEfficiency: `${budgetEfficiency}%`,
        costToRevenue: `${costToRevenue}%`,
        profitMargin: `${profitMargin}%`,
      },
      recommendation:
        parseFloat(profitMargin) < 10
          ? 'Consider cost reduction strategies'
          : parseFloat(profitMargin) > 30
            ? 'Good profit margin'
            : 'Monitor closely',
    };
  }
}