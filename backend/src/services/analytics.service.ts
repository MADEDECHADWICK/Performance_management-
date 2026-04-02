/**
 * Legacy analytics compatibility service.
 *
 * This version is aligned to the current Prisma schema and keeps the
 * historical method signatures used by older modules.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import cacheService from "./cache.service";

type TrendPeriod = "weekly" | "monthly" | "quarterly" | "yearly";

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const periodKey = (date: Date, period: TrendPeriod): string => {
  const d = new Date(date);
  if (period === "weekly") {
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    return `${weekStart.getFullYear()}-W${Math.ceil(weekStart.getDate() / 7)}`;
  }
  if (period === "quarterly") {
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${quarter}`;
  }
  if (period === "yearly") {
    return `${d.getFullYear()}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

class AnalyticsService {
  async getPerformanceComparison(options: {
    cycleId: string;
    departmentId?: string;
    limit?: number;
  }): Promise<any> {
    const cycleId = Number(options.cycleId);
    if (!Number.isFinite(cycleId)) {
      return {
        cycleId: options.cycleId,
        totalEmployees: 0,
        summary: [],
      };
    }

    const departmentId = options.departmentId ? Number(options.departmentId) : undefined;
    const where: Prisma.EvaluationAssignmentWhereInput = {
      definition: { cycleId },
      ...(Number.isFinite(departmentId)
        ? { evaluatee: { departmentId: departmentId as number } }
        : {}),
    };

    const rows = await prisma.evaluationAssignment.findMany({
      where,
      include: {
        evaluatee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            departmentId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const grouped = new Map<
      number,
      { employeeName: string; scores: number[]; evaluationCount: number }
    >();

    rows.forEach((row) => {
      const score = toNumber(row.score);
      const existing = grouped.get(row.evaluateeProfileId) || {
        employeeName: `${row.evaluatee.firstName} ${row.evaluatee.lastName}`.trim(),
        scores: [],
        evaluationCount: 0,
      };
      existing.scores.push(score);
      existing.evaluationCount += 1;
      grouped.set(row.evaluateeProfileId, existing);
    });

    const summary = Array.from(grouped.entries())
      .map(([employeeId, value]) => {
        const avgScore = value.scores.length
          ? value.scores.reduce((sum, current) => sum + current, 0) / value.scores.length
          : 0;
        return {
          employeeId,
          employeeName: value.employeeName,
          evaluationCount: value.evaluationCount,
          averageScore: Number(avgScore.toFixed(2)),
          rating: this.determineRating(avgScore),
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, options.limit || 10);

    return {
      cycleId,
      departmentId: options.departmentId || "All",
      totalEmployees: summary.length,
      summary,
      statistics: {
        averageScore:
          summary.length > 0
            ? Number(
                (
                  summary.reduce((sum, item) => sum + item.averageScore, 0) / summary.length
                ).toFixed(2)
              )
            : 0,
        highestScore: summary.length ? Math.max(...summary.map((item) => item.averageScore)) : 0,
        lowestScore: summary.length ? Math.min(...summary.map((item) => item.averageScore)) : 0,
      },
    };
  }

  async getBudgetVarianceAnalysis(options: {
    departmentId?: string;
    months?: number;
  }): Promise<any> {
    const months = options.months || 6;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const departmentId = options.departmentId ? Number(options.departmentId) : undefined;

    const jobs = await prisma.job.findMany({
      where: {
        createdAt: { gte: startDate },
        ...(Number.isFinite(departmentId) ? { departmentId: departmentId as number } : {}),
      },
      include: {
        jobCosting: { select: { jobFee: true } },
        payments: { select: { paymentAmount: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const details = jobs.map((job) => {
      const budget = toNumber(job.jobCosting?.jobFee) || toNumber(job.fixedFeeAmount);
      const actual = job.payments.reduce(
        (sum, payment) => sum + toNumber(payment.paymentAmount),
        0
      );
      const variance = actual - budget;
      const variancePercent = budget > 0 ? (variance / budget) * 100 : 0;
      return {
        jobId: job.id,
        jobName: job.jobName,
        budget: Number(budget.toFixed(2)),
        actual: Number(actual.toFixed(2)),
        variance: Number(variance.toFixed(2)),
        variancePercent: Number(variancePercent.toFixed(2)),
      };
    });

    const totalBudget = details.reduce((sum, item) => sum + item.budget, 0);
    const totalActual = details.reduce((sum, item) => sum + item.actual, 0);
    const totalVariance = totalActual - totalBudget;

    return {
      departmentId: options.departmentId || "All",
      months,
      summary: {
        totalBudget: Number(totalBudget.toFixed(2)),
        totalActual: Number(totalActual.toFixed(2)),
        totalVariance: Number(totalVariance.toFixed(2)),
        totalVariancePercent:
          totalBudget > 0 ? Number(((totalVariance / totalBudget) * 100).toFixed(2)) : 0,
      },
      jobs: details,
    };
  }

  async getRevenueForecast(options: {
    months?: number;
    departmentId?: string;
  }): Promise<any> {
    const months = options.months || 6;
    const departmentId = options.departmentId ? Number(options.departmentId) : undefined;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const payments = await prisma.clientPayment.findMany({
      where: {
        paymentDate: { gte: startDate },
        ...(Number.isFinite(departmentId)
          ? { job: { is: { departmentId: departmentId as number } } }
          : {}),
      },
      select: {
        paymentDate: true,
        paymentAmount: true,
      },
      orderBy: { paymentDate: "asc" },
    });

    const monthly = new Map<string, number>();
    payments.forEach((payment) => {
      const key = periodKey(payment.paymentDate, "monthly");
      monthly.set(key, (monthly.get(key) || 0) + toNumber(payment.paymentAmount));
    });

    const history = Array.from(monthly.entries()).map(([month, amount]) => ({
      month,
      amount: Number(amount.toFixed(2)),
    }));

    const trendValue = this.calculateLinearTrend(history.map((item) => item.amount));
    const lastValue = history.length ? history[history.length - 1].amount : 0;

    const forecast = Array.from({ length: 3 }).map((_, index) => {
      const value = Math.max(0, lastValue + trendValue * (index + 1));
      return {
        monthOffset: index + 1,
        projectedRevenue: Number(value.toFixed(2)),
      };
    });

    return {
      months,
      departmentId: options.departmentId || "All",
      trend: Number(trendValue.toFixed(2)),
      history,
      forecast,
    };
  }

  async getDashboardMetrics(userId: string): Promise<any> {
    const numericUserId = Number(userId);
    const profile = Number.isFinite(numericUserId)
      ? await prisma.profile.findUnique({
          where: { userId: numericUserId },
          select: { id: true, departmentId: true },
        })
      : null;

    const cacheKey = `dashboard:metrics:${userId}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;

    const [activeJobs, pendingTimeEntries, openEvaluations, paymentTotals] =
      await Promise.all([
        prisma.job.count({ where: { status: { in: ["planned", "in_progress", "on_hold"] } } }),
        prisma.timeEntry.count({ where: { status: { in: ["pending", "submitted"] } } }),
        prisma.evaluationAssignment.count({
          where: { status: { in: ["pending", "in_progress"] } },
        }),
        prisma.clientPayment.aggregate({ _sum: { paymentAmount: true } }),
      ]);

    const metrics = {
      profileId: profile?.id || null,
      departmentId: profile?.departmentId || null,
      activeJobs,
      pendingTimeEntries,
      openEvaluations,
      totalRevenue: Number(toNumber(paymentTotals._sum.paymentAmount).toFixed(2)),
    };

    cacheService.set(cacheKey, metrics, 60_000);
    return metrics;
  }

  async getDepartmentComparison(): Promise<any> {
    const departments = await prisma.department.findMany({
      select: {
        id: true,
        name: true,
        profiles: { select: { id: true } },
        jobs: {
          select: {
            id: true,
            payments: { select: { paymentAmount: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const rows = departments.map((department) => {
      const revenue = department.jobs.reduce(
        (jobSum, job) =>
          jobSum +
          job.payments.reduce(
            (paymentSum, payment) => paymentSum + toNumber(payment.paymentAmount),
            0
          ),
        0
      );

      return {
        departmentId: department.id,
        departmentName: department.name,
        employeeCount: department.profiles.length,
        jobCount: department.jobs.length,
        revenue: Number(revenue.toFixed(2)),
      };
    });

    return {
      totalDepartments: rows.length,
      departments: rows,
    };
  }

  private calculateTrend(values: number[]): "up" | "down" | "stable" {
    if (values.length < 2) return "stable";
    const first = values[0];
    const last = values[values.length - 1];
    if (last > first + 0.1) return "up";
    if (last < first - 0.1) return "down";
    return "stable";
  }

  private calculateLinearTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((sum, value) => sum + value, 0) / n;

    let numerator = 0;
    let denominator = 0;
    values.forEach((value, index) => {
      const x = index - xMean;
      const y = value - yMean;
      numerator += x * y;
      denominator += x * x;
    });

    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  private determineRating(score: number): string {
    if (score >= 4.5) return "Excellent";
    if (score >= 3.5) return "Good";
    if (score >= 2.5) return "Satisfactory";
    if (score >= 1.5) return "Needs Improvement";
    return "Unsatisfactory";
  }
}

export default new AnalyticsService();
