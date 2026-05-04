import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resolveRequestAccessRoles } from '../auth/accessRoles';
import { getDashboardModuleCoverageSummary } from '../services/performanceFramework.service';
import JobPerformanceFactsService from '../services/jobPerformanceFacts.service';
import { logger, toLogContext } from '../lib/logger';

const router = Router();

const hrRoles = new Set([
  'hr',
  'super_admin',
  'gmp',
]);

const getHrContext = async (req: AuthRequest) => {
  const userId = req.user?.userId;
  if (!userId) {
    return { error: { status: 401, message: 'Unauthorized' } };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      profile: true,
    },
  });

  if (!user) {
    return { error: { status: 404, message: 'User not found' } };
  }

  const roleNames = resolveRequestAccessRoles(req);
  const isHr = roleNames.some((role) => hrRoles.has(role));

  if (!isHr) {
    return { error: { status: 403, message: 'Access denied. HR role required.' } };
  }

  return { user };
};

const buildTrackingPath = (jobId: number) => `/jobs/${jobId}/tracking`;

// GET /hr-dashboard/company-metrics
router.get('/company-metrics', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getHrContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [
      totalEmployees,
      activeEvaluations,
      pendingEvaluations,
      avgPerformanceAgg,
      monthProjections,
      monthFacts,
      allFacts,
    ] = await Promise.all([
      prisma.profile.count({ where: { status: 'active' } }),
      prisma.evaluationCycle.count({ where: { status: 'active' } }),
      prisma.evaluationAssignment.count({ where: { status: 'pending' } }),
      prisma.performanceScore.aggregate({
        _avg: { totalScore: true },
        where: { calculatedAt: { gte: ninetyDaysAgo } },
      }),
      prisma.revenueProjection.aggregate({
        _sum: { projectedAmount: true, actualCollected: true },
        where: { monthYear: { gte: monthStart, lt: nextMonthStart } },
      }),
      JobPerformanceFactsService.listFacts(
        { dateFrom: monthStart, dateTo: nextMonthStart },
        { type: 'firm' }
      ),
      JobPerformanceFactsService.listFacts({}, { type: 'firm' }),
    ]);

    const totalBillableValue = allFacts.reduce((sum, fact) => sum + fact.billableValue, 0);
    const totalBilledRevenue = allFacts.reduce((sum, fact) => sum + fact.billedRevenue, 0);
    const totalCollected = allFacts.reduce((sum, fact) => sum + fact.collectedRevenue, 0);
    const totalOutstanding = allFacts.reduce((sum, fact) => sum + fact.outstandingRevenue, 0);
    const collectionBase = totalBilledRevenue > 0 ? totalBilledRevenue : totalBillableValue;
    const collectionRate = collectionBase > 0 ? (totalCollected / collectionBase) * 100 : 0;
    const projectedMonth = Number(monthProjections._sum.projectedAmount || 0);
    const collectedMonth = monthFacts.reduce((sum, fact) => sum + fact.collectedRevenue, 0);
    const varianceMonth = collectedMonth - projectedMonth;

    const firmProfit = monthFacts.reduce((sum, fact) => sum + fact.cashProfit, 0);
    const totalHours = monthFacts.reduce((sum, fact) => sum + fact.totalHours, 0);
    const billableHours = monthFacts.reduce((sum, fact) => sum + fact.billableHours, 0);
    const utilizationRate = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    const overdueJobs = await prisma.job.count({
      where: {
        dueDate: { lt: now },
        status: { in: ['planned', 'in_progress', 'on_hold'] },
      },
    });

    res.json({
      totalEmployees,
      activeEvaluations,
      pendingEvaluations,
      avgPerformance: Number(avgPerformanceAgg._avg.totalScore || 0),
      projectedMonth,
      collectedMonth,
      varianceMonth,
      totalCollected,
      totalOutstanding,
      totalFees: collectionBase,
      billableValue: totalBillableValue,
      billedRevenue: totalBilledRevenue,
      collectedRevenue: totalCollected,
      collectionRate,
      firmProfit,
      utilizationRate,
      overdueJobs,
      framework: getDashboardModuleCoverageSummary("hr"),
    });
  } catch (error: any) {
    logger.error('hr_dashboard_company_metrics_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load HR company metrics' });
  }
});

// GET /hr-dashboard/approval-controls
// HR/Admin oversight: planned-vs-actual controls + approval-chain visibility
router.get('/approval-controls', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getHrContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const jobs = await prisma.job.findMany({
      include: {
        client: { select: { clientName: true } },
        manager: { select: { firstName: true, lastName: true } },
        partner: { select: { firstName: true, lastName: true } },
        jobCosting: {
          select: {
            jobFee: true,
            totalEstimatedCost: true,
            totalEstimatedHours: true,
            budgetCap: { select: { totalAllocatedHours: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const jobIds = jobs.map((job) => job.id);

    const [facts, standardRequests, overBudgetRequests] = await Promise.all([
      JobPerformanceFactsService.listFacts({ jobIds }, { type: 'firm' }),
      prisma.timeEntryApprovalRequest.findMany({
        where: { jobId: { in: jobIds } },
        include: {
          job: { select: { id: true, jobName: true, jobCode: true, client: { select: { clientName: true } } } },
          employee: { select: { firstName: true, lastName: true } },
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
      prisma.timeOverBudgetRequest.findMany({
        where: { jobId: { in: jobIds } },
        include: {
          job: { select: { id: true, jobName: true, jobCode: true, client: { select: { clientName: true } } } },
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
    ]);
    const factsByJob = new Map(facts.map((fact) => [fact.jobId, fact]));

    const controls = jobs.reduce(
      (acc, job) => {
        const plannedCost = Number(job.jobCosting?.totalEstimatedCost || 0);
        const plannedHours = Number(
          job.jobCosting?.totalEstimatedHours ??
            job.jobCosting?.budgetCap?.totalAllocatedHours ??
            job.budgetHours ??
            0
        );
        const fact = factsByJob.get(job.id);
        const actualCost = fact?.actualCost ?? 0;
        const actualHours = fact?.totalHours ?? 0;
        const feeCap = Number(
          job.jobCosting?.jobFee || (job.billingType === 'fixed_fee' ? job.fixedFeeAmount : 0) || 0
        );

        acc.totalJobs += 1;
        acc.totalPlannedCost += plannedCost;
        acc.totalActualCost += actualCost;
        acc.totalPlannedHours += plannedHours;
        acc.totalActualHours += actualHours;
        if (plannedCost > 0 && actualCost > plannedCost) acc.jobsOverPlannedCost += 1;
        if (plannedHours > 0 && actualHours > plannedHours) acc.jobsOverPlannedHours += 1;
        if (feeCap > 0 && actualCost > feeCap) acc.jobsOverFeeCap += 1;
        return acc;
      },
      {
        totalJobs: 0,
        totalPlannedCost: 0,
        totalActualCost: 0,
        totalPlannedHours: 0,
        totalActualHours: 0,
        jobsOverPlannedCost: 0,
        jobsOverPlannedHours: 0,
        jobsOverFeeCap: 0,
      }
    );

    const standardSummary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    standardRequests.forEach((request) => {
      if (request.status === 'pending') standardSummary.pending += 1;
      if (request.status === 'approved') standardSummary.approved += 1;
      if (request.status === 'rejected') standardSummary.rejected += 1;
      if (request.status === 'cancelled') standardSummary.cancelled += 1;
    });

    const overBudgetSummary = {
      pending: 0,
      awaitingPartner: 0,
      managerRejected: 0,
      partnerApproved: 0,
      partnerRejected: 0,
      autoRejected: 0,
    };
    overBudgetRequests.forEach((request) => {
      if (request.status === 'pending') overBudgetSummary.pending += 1;
      if (request.status === 'manager_approved') overBudgetSummary.awaitingPartner += 1;
      if (request.status === 'manager_rejected') overBudgetSummary.managerRejected += 1;
      if (request.status === 'partner_approved') overBudgetSummary.partnerApproved += 1;
      if (request.status === 'partner_rejected') overBudgetSummary.partnerRejected += 1;
      if (request.status === 'auto_rejected') overBudgetSummary.autoRejected += 1;
    });

    const recentJobs = jobs.slice(0, 20).map((job) => {
      const fact = factsByJob.get(job.id);
      const plannedCost = Number(job.jobCosting?.totalEstimatedCost || 0);
      const plannedHours = Number(
        job.jobCosting?.totalEstimatedHours ??
          job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.budgetHours ??
          0
      );
      const actualCost = fact?.actualCost ?? 0;
      const actualHours = fact?.totalHours ?? 0;
      const feeCap = Number(
        job.jobCosting?.jobFee || (job.billingType === 'fixed_fee' ? job.fixedFeeAmount : 0) || 0
      );
      return {
        jobId: job.id,
        trackingPath: buildTrackingPath(job.id),
        jobName: job.jobName,
        jobCode: job.jobCode,
        clientName: job.client?.clientName ?? null,
        managerName: job.manager ? `${job.manager.firstName} ${job.manager.lastName}`.trim() : null,
        partnerName: job.partner ? `${job.partner.firstName} ${job.partner.lastName}`.trim() : null,
        plannedCost,
        actualCost,
        costVariance: actualCost - plannedCost,
        plannedHours,
        actualHours,
        hoursVariance: actualHours - plannedHours,
        feeCap,
        feeBuffer: feeCap > 0 ? feeCap - actualCost : 0,
      };
    });

    return res.json({
      controls: {
        ...controls,
        totalCostVariance: controls.totalActualCost - controls.totalPlannedCost,
        totalHoursVariance: controls.totalActualHours - controls.totalPlannedHours,
      },
      approvals: {
        standard: standardSummary,
        overBudget: overBudgetSummary,
      },
      recentJobs,
      standardRequests: standardRequests.map((request) => ({
        id: request.id,
        jobId: request.jobId,
        trackingPath: buildTrackingPath(request.jobId),
        jobName: request.job.jobName,
        jobCode: request.job.jobCode,
        clientName: request.job.client?.clientName ?? null,
        employeeName: `${request.employee.firstName} ${request.employee.lastName}`.trim(),
        status: request.status,
        requestType: request.requestType,
        additionalHoursRequested: Number(request.additionalHoursRequested || 0),
        requestedAt: request.requestedAt,
        approvedAt: request.approvedAt,
        approverName: request.approver
          ? `${request.approver.firstName} ${request.approver.lastName}`.trim()
          : null,
      })),
      overBudgetRequests: overBudgetRequests.map((request) => ({
        id: request.id,
        jobId: request.jobId,
        trackingPath: buildTrackingPath(request.jobId),
        jobName: request.job.jobName,
        jobCode: request.job.jobCode,
        clientName: request.job.client?.clientName ?? null,
        employeeName: `${request.employee.firstName} ${request.employee.lastName}`.trim(),
        status: request.status,
        requestedAdditional: Number(request.requestedAdditional || 0),
        allocatedHours: Number(request.allocatedHours || 0),
        loggedHours: Number(request.loggedHours || 0),
        totalAfterRequest: Number(request.totalAfterRequest || 0),
        estimatedCostImpact: Number(request.estimatedCostImpact || 0),
        requiresPartnerApproval: Boolean(request.requiresPartnerApproval),
        approvalNotes: request.approvalNotes,
        rejectionReason: request.rejectionReason,
        createdAt: request.createdAt,
      })),
    });
  } catch (error: any) {
    logger.error('hr_dashboard_approval_controls_error', toLogContext(error));
    return res.status(500).json({ error: 'Failed to load HR approval controls' });
  }
});

// GET /hr-dashboard/time-revenue
// Firm-wide non-billable breakdown, revenue pipeline stages, department utilization, loss-alert jobs
router.get('/time-revenue', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getHrContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [nonBillableRaw, allFacts, departments, monthlyHoursRaw] = await Promise.all([
      prisma.timeEntry.groupBy({
        by: ['nonBillableCategory'],
        _sum: { hours: true },
        where: {
          billable: false,
          status: 'approved',
          nonBillableCategory: { not: null },
          dateWorked: { gte: yearStart },
        },
      }),
      JobPerformanceFactsService.listFacts({}, { type: 'firm' }),
      prisma.department.findMany({ select: { id: true, name: true, departmentCode: true } }),
      prisma.$queryRaw<Array<{ month: Date; billable: boolean; hours: number }>>`
        SELECT date_trunc('month', date_worked) AS month,
               billable,
               COALESCE(SUM(hours), 0)::float AS hours
        FROM time_entries
        WHERE status = 'approved'
          AND date_worked >= ${sixMonthsAgo}
        GROUP BY 1, 2
        ORDER BY 1
      `,
    ]);

    const nonBillableByCategory: Record<string, number> = {
      leave: 0, public_holiday: 0, internal: 0, training: 0, over_budget: 0, other: 0,
    };
    nonBillableRaw.forEach((row) => {
      nonBillableByCategory[row.nonBillableCategory ?? 'other'] = Number(row._sum.hours || 0);
    });

    const firmPipeline = allFacts.reduce(
      (acc, fact) => {
        acc.totalHours += fact.totalHours;
        acc.billableHours += fact.billableHours;
        acc.nonBillableHours += fact.nonBillableHours;
        acc.billableValue += fact.billableValue;
        acc.billedRevenue += fact.billedRevenue;
        acc.collectedRevenue += fact.collectedRevenue;
        acc.outstanding += fact.outstandingRevenue;
        acc.actualCost += fact.actualCost;
        acc.laborCost += fact.laborCost;
        acc.cashProfit += fact.cashProfit;
        return acc;
      },
      {
        totalHours: 0, billableHours: 0, nonBillableHours: 0,
        billableValue: 0, billedRevenue: 0, collectedRevenue: 0,
        outstanding: 0, actualCost: 0, laborCost: 0, cashProfit: 0,
        utilizationRate: 0,
      }
    );
    firmPipeline.utilizationRate =
      firmPipeline.totalHours > 0 ? (firmPipeline.billableHours / firmPipeline.totalHours) * 100 : 0;

    const deptFactMap = new Map<number, {
      billableHours: number; nonBillableHours: number; totalHours: number;
      billableValue: number; collectedRevenue: number; cashProfit: number; actualCost: number;
    }>();
    allFacts.forEach((fact) => {
      if (!fact.departmentId) return;
      const existing = deptFactMap.get(fact.departmentId) ?? {
        billableHours: 0, nonBillableHours: 0, totalHours: 0,
        billableValue: 0, collectedRevenue: 0, cashProfit: 0, actualCost: 0,
      };
      existing.billableHours += fact.billableHours;
      existing.nonBillableHours += fact.nonBillableHours;
      existing.totalHours += fact.totalHours;
      existing.billableValue += fact.billableValue;
      existing.collectedRevenue += fact.collectedRevenue;
      existing.cashProfit += fact.cashProfit;
      existing.actualCost += fact.actualCost;
      deptFactMap.set(fact.departmentId, existing);
    });

    type DeptUtilRow = {
      departmentId: number; departmentName: string; departmentCode: string | null;
      billableHours: number; nonBillableHours: number; totalHours: number;
      utilizationRate: number; revenue: number; profit: number; cost: number; marginPercent: number;
    };
    const departmentUtilization: DeptUtilRow[] = departments
      .map((dept): DeptUtilRow | null => {
        const totals = deptFactMap.get(dept.id);
        if (!totals) return null;
        return {
          departmentId: dept.id,
          departmentName: dept.name,
          departmentCode: dept.departmentCode,
          billableHours: totals.billableHours,
          nonBillableHours: totals.nonBillableHours,
          totalHours: totals.totalHours,
          utilizationRate: totals.totalHours > 0 ? (totals.billableHours / totals.totalHours) * 100 : 0,
          revenue: totals.collectedRevenue,
          profit: totals.cashProfit,
          cost: totals.actualCost,
          marginPercent: totals.collectedRevenue > 0 ? (totals.cashProfit / totals.collectedRevenue) * 100 : 0,
        };
      })
      .filter((d): d is DeptUtilRow => d !== null)
      .sort((a, b) => b.revenue - a.revenue);

    // Loss-alert jobs (cashProfit < 0, active or recently completed)
    const lossAlertFacts = allFacts
      .filter((fact) => fact.cashProfit < 0)
      .map((fact) => ({
        jobId: fact.jobId,
        trackingPath: buildTrackingPath(fact.jobId),
        jobName: fact.jobName,
        jobCode: fact.jobCode,
        clientName: fact.clientName ?? null,
        cashProfit: fact.cashProfit,
        billableValue: fact.billableValue,
        actualCost: fact.actualCost,
        marginPercent: fact.marginPercent,
      }))
      .sort((a, b) => a.cashProfit - b.cashProfit)
      .slice(0, 20);

    const monthlyTotals = new Map<string, { billable: number; nonBillable: number }>();
    monthlyHoursRaw.forEach((row) => {
      const key = new Date(row.month).toISOString().slice(0, 7);
      const current = monthlyTotals.get(key) ?? { billable: 0, nonBillable: 0 };
      if (row.billable) current.billable += Number(row.hours);
      else current.nonBillable += Number(row.hours);
      monthlyTotals.set(key, current);
    });

    const monthlyTrend = Array.from(monthlyTotals.entries())
      .map(([month, totals]) => ({
        month,
        billableHours: totals.billable,
        nonBillableHours: totals.nonBillable,
        utilizationRate: (totals.billable + totals.nonBillable) > 0
          ? (totals.billable / (totals.billable + totals.nonBillable)) * 100
          : 0,
      }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));

    return res.json({
      nonBillableByCategory,
      firmPipeline,
      departmentUtilization,
      lossAlertJobs: lossAlertFacts,
      monthlyTrend,
    });
  } catch (error: any) {
    logger.error('hr_dashboard_time_revenue_error', toLogContext(error));
    return res.status(500).json({ error: 'Failed to load time & revenue data' });
  }
});

export default router;
