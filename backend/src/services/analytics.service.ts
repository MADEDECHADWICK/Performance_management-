/**
 * Analytics Aggregation Service
 * 
 * Consolidates data across all domains for:
 * - Dashboard metrics
 * - KPI trends
 * - Performance comparisons
 * - Variance analysis
 * - Forecasting
 */

import { prisma } from '../prisma';
import cacheService from './cache.service';

class AnalyticsService {
  /**
   * Get KPI trends over time period
   */
  async getKPITrends(options: {
    period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    departmentId?: string;
    months?: number;
  }): Promise<any> {
    const months = options.months || (options.period === 'yearly' ? 12 : 6);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const where: any = {
      created_at: { gte: startDate },
    };

    if (options.departmentId) {
      where.employee = { department_id: options.departmentId };
    }

    const kpis = await prisma.kPI.findMany({
      where,
      include: { employee: true },
      orderBy: { created_at: 'asc' },
    });

    // Group by period
    const grouped = this.groupByPeriod(kpis, options.period);

    return {
      period: options.period,
      departmentId: options.departmentId,
      months,
      data: Object.entries(grouped).map(([period, data]: any) => ({
        period,
        average: (data.reduce((sum: number, item: any) => sum + (item.score || 0), 0) / data.length).toFixed(2),
        count: data.length,
        trend: this.calculateTrend(data),
      })),
    };
  }

  /**
   * Compare performance across employees
   */
  async getPerformanceComparison(options: {
    cycleId: string;
    departmentId?: string;
    limit?: number;
  }): Promise<any> {
    const where: any = {
      evaluation_cycle_id: options.cycleId,
    };

    if (options.departmentId) {
      where.evaluatedEmployee = { department_id: options.departmentId };
    }

    const evaluations = await prisma.evaluation.findMany({
      where,
      include: {
        evaluatedEmployee: true,
      },
      orderBy: { average_score: 'desc' },
      take: options.limit || 10,
    });

    const comparison = evaluations.map((e: any, idx) => ({
      rank: idx + 1,
      employeeId: e.evaluated_by,
      employeeName: e.evaluatedEmployee?.first_name + ' ' + e.evaluatedEmployee?.last_name,
      score: e.average_score,
      rating: this.determineRating(e.average_score),
      submission_count: 1, // Would be aggregated in real scenario
    }));

    const avgScore =
      evaluations.reduce((sum: number, e: any) => sum + (e.average_score || 0), 0) / evaluations.length;

    return {
      cycleId: options.cycleId,
      totalEvaluations: evaluations.length,
      averageScore: avgScore.toFixed(2),
      topPerformers: comparison.slice(0, 3),
      needsImprovement: comparison.slice(-3).reverse(),
      all: comparison,
    };
  }

  /**
   * Analyze budget variance across organization
   */
  async getBudgetVarianceAnalysis(options: {
    departmentId?: string;
    period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    threshold?: number;
  }): Promise<any> {
    const where: any = {};

    if (options.departmentId) {
      where.department_id = options.departmentId;
    }

    const budgets = await prisma.budget.findMany({
      where,
      include: { job: true },
    });

    const variance = budgets.map((b: any) => {
      const spent = b.spent_amount || 0;
      const budgeted = b.total_budget;
      const variance = spent - budgeted;
      const variancePercentage = ((variance / budgeted) * 100).toFixed(2);
      const status =
        Math.abs(Number(variancePercentage)) > (options.threshold || 10) ? 'alert' : 'normal';

      return {
        jobId: b.job_id,
        budgeted,
        spent,
        variance,
        variancePercentage: Number(variancePercentage),
        status,
      };
    });

    const totalVariance = variance.reduce((sum: number, v) => sum + v.variance, 0);
    const alertCount = variance.filter((v) => v.status === 'alert').length;

    return {
      period: options.period,
      departmentId: options.departmentId || 'all',
      totalBudgeted: budgets.reduce((sum: number, b: any) => sum + b.total_budget, 0),
      totalSpent: budgets.reduce((sum: number, b: any) => sum + b.spent_amount, 0),
      totalVariance: totalVariance.toFixed(2),
      averageVariancePercentage: (totalVariance / budgets.reduce((sum: number, b: any) => sum + b.total_budget, 0)).toFixed(2),
      alertCount,
      details: variance,
    };
  }

  /**
   * Get revenue forecast based on trends
   */
  async getRevenueForecast(options: {
    months: number;
    confidenceLevel: number;
    departmentId?: string;
  }): Promise<any> {
    const historyMonths = 6;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - historyMonths);

    const where: any = {
      created_at: { gte: startDate },
    };

    if (options.departmentId) {
      where.department_id = options.departmentId;
    }

    const revenues = await prisma.revenue.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    // Group by month and calculate average
    const monthlyRevenue = this.groupByMonth(revenues);
    const monthlyAmounts = Object.values(monthlyRevenue).map((m: any) =>
      m.reduce((sum: number, r: any) => sum + r.amount, 0)
    );

    // Simple linear forecast
    const avgMonthly = monthlyAmounts.reduce((a, b) => a + b, 0) / monthlyAmounts.length;
    const trend = this.calculateLinearTrend(monthlyAmounts);

    const forecast = [];
    for (let i = 1; i <= options.months; i++) {
      const projectedRevenue = avgMonthly + trend * i;
      const confidenceInterval = (projectedRevenue * (100 - options.confidenceLevel)) / 100;

      forecast.push({
        month: i,
        projected: Math.max(0, projectedRevenue.toFixed(2)),
        lower: Math.max(0, (projectedRevenue - confidenceInterval).toFixed(2)),
        upper: (projectedRevenue + confidenceInterval).toFixed(2),
        confidence: options.confidenceLevel,
      });
    }

    return {
      departmentId: options.departmentId || 'all',
      months: options.months,
      historicalAverage: avgMonthly.toFixed(2),
      trend: trend > 0 ? 'increasing' : 'decreasing',
      forecast,
    };
  }

  /**
   * Get dashboard summary metrics
   */
  async getDashboardMetrics(userId: string): Promise<any> {
    const cacheKey = `dashboard:${userId}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;

    const user = await prisma.profile.findUnique({
      where: { id: userId },
      include: { department: true },
    });

    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }

    // Fetch budget metrics
    const budgets = await prisma.budget.findMany({
      where: user.role_id ? { department_id: user.department_id } : {},
    });
    const budgetUtilization = budgets.length
      ? (budgets.reduce((sum: number, b: any) => sum + b.spent_amount, 0) /
          budgets.reduce((sum: number, b: any) => sum + b.total_budget, 0)) *
        100
      : 0;

    // Fetch revenue metrics
    const revenues = await prisma.revenue.findMany({
      where: user.role_id ? { department_id: user.department_id } : {},
      where: {
        created_at: {
          gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
        },
      },
    });
    const monthlyRevenue = revenues.reduce((sum: number, r: any) => sum + r.amount, 0);

    // Fetch evaluation metrics
    const evaluations = await prisma.evaluation.findMany({
      where: {
        OR: [
          { evaluated_by: userId },
          { evaluator_id: userId },
        ],
      },
    });
    const pendingEvaluations = evaluations.filter((e: any) => e.status === 'pending').length;

    // Fetch staffing metrics
    const assignments = await prisma.jobStaffAssignment.findMany({
      where: {
        employee_id: userId,
      },
    });
    const totalUtilization = assignments.reduce((sum: number, a: any) => sum + a.allocation_percentage, 0);

    const metrics = {
      userId,
      userRole: user.role_id,
      department: user.department?.name,
      budgetUtilization: budgetUtilization.toFixed(2),
      monthlyRevenue: monthlyRevenue.toFixed(2),
      pendingEvaluations,
      staffingUtilization: Math.min(100, totalUtilization).toFixed(2),
      timestamp: new Date(),
    };

    cacheService.set(cacheKey, metrics, 5 * 60 * 1000); // 5 minute cache
    return metrics;
  }

  /**
   * Get department comparison across KPIs
   */
  async getDepartmentComparison(): Promise<any> {
    const departments = await prisma.department.findMany({
      include: {
        employees: true,
      },
    });

    return Promise.all(
      departments.map(async (dept: any) => {
        const kpis = await prisma.kPI.findMany({
          where: {
            employee: { department_id: dept.id },
          },
        });

        const avgScore = kpis.length ? kpis.reduce((sum: number, k: any) => sum + (k.score || 0), 0) / kpis.length : 0;

        return {
          departmentId: dept.id,
          departmentName: dept.name,
          employeeCount: dept.employees.length,
          averageKPIScore: avgScore.toFixed(2),
          kpiCount: kpis.length,
        };
      })
    );
  }

  /**
   * Helper: Group data by period
   */
  private groupByPeriod(data: any[], period: string): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    data.forEach((item) => {
      let key = '';
      const date = new Date(item.created_at);

      switch (period) {
        case 'weekly':
          const week = Math.ceil(date.getDate() / 7);
          key = `Week ${week} ${date.getFullYear()}`;
          break;
        case 'monthly':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'quarterly':
          const quarter = Math.ceil((date.getMonth() + 1) / 3);
          key = `Q${quarter} ${date.getFullYear()}`;
          break;
        case 'yearly':
          key = date.getFullYear().toString();
          break;
      }

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    return grouped;
  }

  /**
   * Helper: Calculate trend direction
   */
  private calculateTrend(data: any[]): string {
    if (data.length < 2) return 'stable';

    const first = data.slice(0, Math.ceil(data.length / 2)).reduce((sum: number, d: any) => sum + (d.score || 0), 0) / Math.ceil(data.length / 2);
    const last = data.slice(-Math.ceil(data.length / 2)).reduce((sum: number, d: any) => sum + (d.score || 0), 0) / Math.ceil(data.length / 2);

    const change = ((last - first) / first) * 100;
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? '📈 increasing' : '📉 decreasing';
  }

  /**
   * Helper: Group by month
   */
  private groupByMonth(data: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    data.forEach((item) => {
      const date = new Date(item.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    return grouped;
  }

  /**
   * Helper: Calculate linear trend
   */
  private calculateLinearTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b);
    const sumY = values.reduce((a, b) => a + b);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * Helper: Determine rating from score
   */
  private determineRating(score: number): string {
    if (score >= 4.5) return 'Excellent';
    if (score >= 3.5) return 'Good';
    if (score >= 2.5) return 'Satisfactory';
    if (score >= 1.5) return 'Needs Improvement';
    return 'Unsatisfactory';
  }
}

export default new AnalyticsService();
