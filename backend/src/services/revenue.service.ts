/**
 * Revenue Calculation Service (Phase 5)
 * Complex revenue calculations and tracking
 */

import { prisma } from '../lib/prisma';

interface AuthContext {
  userId: number;
  profileId: number;
  roleName?: string;
}

interface RevenueRecordInput {
  job_id: number;
  amount: number;
  revenue_type: string; // 'billable', 'non-billable', 'partial'
  date: Date;
  description: string;
}

interface RevenueProjectionInput {
  job_id: number;
  projected_revenue: number;
  confidence_level: number;
  notes?: string;
}

export class RevenueService {
  /**
   * Record revenue
   */
  static async recordRevenue(input: RevenueRecordInput, auth: AuthContext) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager', 'finance'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only authorized personnel can record revenue',
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

    // ✅ VALIDATE REVENUE TYPE
    const validTypes = ['billable', 'non-billable', 'partial'];
    if (!validTypes.includes(input.revenue_type)) {
      throw {
        statusCode: 400,
        message: `Revenue type must be one of: ${validTypes.join(', ')}`,
      };
    }

    // ✅ CREATE REVENUE RECORD
    const revenue = await prisma.revenueRecord.create({
      data: {
        job_id: input.job_id,
        amount: input.amount,
        revenue_type: input.revenue_type,
        date: input.date,
        description: input.description,
        recorded_by_profile_id: auth.profileId,
        created_at: new Date(),
      },
      include: {
        job: { select: { id: true, name: true } },
      },
    });

    // ✅ UPDATE JOB TOTAL REVENUE
    const totalRevenue = await prisma.revenueRecord.aggregate({
      where: { job_id: input.job_id },
      _sum: { amount: true },
    });

    await prisma.job.update({
      where: { id: input.job_id },
      data: {
        total_revenue: totalRevenue._sum.amount || 0,
      },
    });

    return revenue;
  }

  /**
   * Get revenue summary for job
   */
  static async getRevenueSummary(jobId: number, auth: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        revenueRecords: true,
      },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    // ✅ CALCULATE METRICS
    const billableRevenue = job.revenueRecords
      .filter(r => r.revenue_type === 'billable')
      .reduce((sum, r) => sum + r.amount, 0);

    const nonBillableRevenue = job.revenueRecords
      .filter(r => r.revenue_type === 'non-billable')
      .reduce((sum, r) => sum + r.amount, 0);

    const partialRevenue = job.revenueRecords
      .filter(r => r.revenue_type === 'partial')
      .reduce((sum, r) => sum + r.amount, 0);

    const totalRevenue = billableRevenue + nonBillableRevenue + partialRevenue;

    // ✅ GET BUDGET INFO
    const allocation = await prisma.budgetAllocation.findFirst({
      where: { job_id: jobId },
    });

    const profitMargin = allocation
      ? ((totalRevenue - allocation.spent_amount) / totalRevenue) * 100
      : null;

    return {
      job: {
        id: job.id,
        name: job.name,
      },
      revenue: {
        billable: billableRevenue,
        nonBillable: nonBillableRevenue,
        partial: partialRevenue,
        total: totalRevenue,
      },
      budget: allocation ? {
        allocated: allocation.total_budget,
        spent: allocation.spent_amount,
        available: allocation.available_budget,
      } : null,
      profitMargin: profitMargin ? profitMargin.toFixed(2) : null,
      recordCount: job.revenueRecords.length,
      records: job.revenueRecords
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 10),
    };
  }

  /**
   * Get department revenue report
   */
  static async getDepartmentRevenueReport(
    departmentId: number,
    startDate: Date,
    endDate: Date,
    auth: AuthContext
  ) {
    // ✅ GET ALL JOBS FOR DEPARTMENT
    const jobs = await prisma.job.findMany({
      where: { department_id: departmentId },
      include: {
        revenueRecords: {
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    });

    // ✅ AGGREGATE REVENUE DATA
    const totalRevenue = jobs.reduce(
      (sum, job) =>
        sum +
        job.revenueRecords.reduce((s, r) => s + r.amount, 0),
      0
    );

    const revenueByType = jobs.reduce(
      (acc, job) => {
        job.revenueRecords.forEach(record => {
          if (!acc[record.revenue_type]) {
            acc[record.revenue_type] = 0;
          }
          acc[record.revenue_type] += record.amount;
        });
        return acc;
      },
      {} as Record<string, number>
    );

    // ✅ CALCULATE TRENDS
    const jobRevenue = jobs.map(job => ({
      jobId: job.id,
      jobName: job.name,
      revenue: job.revenueRecords.reduce((sum, r) => sum + r.amount, 0),
      recordCount: job.revenueRecords.length,
    }));

    const averageJobRevenue =
      jobRevenue.length > 0
        ? totalRevenue / jobRevenue.length
        : 0;

    return {
      period: { startDate, endDate },
      department: { id: departmentId },
      summary: {
        totalRevenue,
        averageJobRevenue: averageJobRevenue.toFixed(2),
        jobCount: jobs.length,
        totalRecords: jobs.reduce(
          (sum, job) => sum + job.revenueRecords.length,
          0
        ),
      },
      byType: revenueByType,
      byJob: jobRevenue.sort((a, b) => b.revenue - a.revenue),
      topJobs: jobRevenue.slice(0, 5),
    };
  }

  /**
   * Create revenue projection
   */
  static async createRevenueProjection(
    input: RevenueProjectionInput,
    auth: AuthContext
  ) {
    // ✅ VERIFY AUTHORIZATION
    if (!['admin', 'manager', 'analyst'].includes(auth.roleName || '')) {
      throw {
        statusCode: 403,
        message: 'Only authorized personnel can create projections',
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

    const projection = await prisma.revenueProjection.create({
      data: {
        job_id: input.job_id,
        projected_revenue: input.projected_revenue,
        confidence_level: input.confidence_level,
        notes: input.notes || null,
        created_by_profile_id: auth.profileId,
        created_at: new Date(),
      },
      include: {
        job: { select: { id: true, name: true } },
      },
    });

    return projection;
  }

  /**
   * Get revenue vs projection
   */
  static async getRevenueVsProjection(jobId: number, auth: AuthContext) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        revenueRecords: true,
        revenueProjections: { orderBy: { created_at: 'desc' } },
      },
    });

    if (!job) {
      throw {
        statusCode: 404,
        message: 'Job not found',
      };
    }

    const actualRevenue = job.revenueRecords.reduce((sum, r) => sum + r.amount, 0);
    const latestProjection = job.revenueProjections[0];

    return {
      job: { id: job.id, name: job.name },
      actual: actualRevenue,
      projected: latestProjection?.projected_revenue || 0,
      variance: latestProjection
        ? actualRevenue - latestProjection.projected_revenue
        : 0,
      variancePercentage: latestProjection
        ? (
            ((actualRevenue - latestProjection.projected_revenue) /
              latestProjection.projected_revenue) *
            100
          ).toFixed(2)
        : '0',
      confidenceLevel: latestProjection?.confidence_level || 0,
      status:
        latestProjection && actualRevenue >= latestProjection.projected_revenue
          ? 'exceeding'
          : 'on-track',
      historicalProjections: job.revenueProjections.map(p => ({
        createdAt: p.created_at,
        projected: p.projected_revenue,
        confidence: p.confidence_level,
      })),
    };
  }

  /**
   * Calculate monthly revenue trend
   */
  static async getMonthlyRevenueTrend(
    departmentId: number,
    months: number = 12,
    auth: AuthContext
  ) {
    // ✅ CALCULATE DATE RANGE
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const jobs = await prisma.job.findMany({
      where: { department_id: departmentId },
      include: {
        revenueRecords: {
          where: {
            date: { gte: startDate, lte: endDate },
          },
        },
      },
    });

    // ✅ GROUP BY MONTH
    const monthlyData: Record<string, number> = {};

    jobs.forEach(job => {
      job.revenueRecords.forEach(record => {
        const monthKey = record.date.toISOString().substring(0, 7); // YYYY-MM
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = 0;
        }
        monthlyData[monthKey] += record.amount;
      });
    });

    // ✅ CALCULATE TREND
    const sortedMonths = Object.keys(monthlyData).sort();
    const trend = sortedMonths.map((month, index) => ({
      month,
      revenue: monthlyData[month],
      previousMonth:
        index > 0 ? monthlyData[sortedMonths[index - 1]] : null,
      growth:
        index > 0
          ? (
              (
                (monthlyData[month] - monthlyData[sortedMonths[index - 1]]) /
                monthlyData[sortedMonths[index - 1]]
              ) *
              100
            ).toFixed(2)
          : null,
    }));

    return {
      period: { startDate, endDate, months },
      department: { id: departmentId },
      trend,
      totalRevenue: trend.reduce((sum, t) => sum + t.revenue, 0),
      averageMonthlyRevenue: (
        trend.reduce((sum, t) => sum + t.revenue, 0) / trend.length
      ).toFixed(2),
    };
  }
}