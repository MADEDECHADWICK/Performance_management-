import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getDashboardModuleCoverageSummary } from '../services/performanceFramework.service';

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

  const roleNames = user.roles.map((r) => r.role.name.toLowerCase());
  const positionTitle = user.profile?.positionTitle?.toLowerCase() || '';
  const isHr =
    roleNames.some((role) => hrRoles.has(role)) ||
    positionTitle.includes('hr') ||
    positionTitle.includes('human resource') ||
    positionTitle.includes('group managing partner');

  if (!isHr) {
    return { error: { status: 403, message: 'Access denied. HR role required.' } };
  }

  return { user };
};

const resolveJobFee = (job: {
  billingType: string;
  fixedFeeAmount: any;
  jobCosting?: { jobFee: any } | null;
}) => {
  const costingFee = Number(job.jobCosting?.jobFee || 0);
  if (costingFee > 0) return costingFee;
  if (job.billingType === 'fixed_fee') return Number(job.fixedFeeAmount || 0);
  return 0;
};

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
      monthPayments,
      monthProjections,
      totalPayments,
    ] = await Promise.all([
      prisma.profile.count({ where: { status: 'active' } }),
      prisma.evaluationCycle.count({ where: { status: 'active' } }),
      prisma.evaluationAssignment.count({ where: { status: 'pending' } }),
      prisma.performanceScore.aggregate({
        _avg: { totalScore: true },
        where: { calculatedAt: { gte: ninetyDaysAgo } },
      }),
      prisma.clientPayment.aggregate({
        _sum: { paymentAmount: true },
        where: { paymentDate: { gte: monthStart, lt: nextMonthStart } },
      }),
      prisma.revenueProjection.aggregate({
        _sum: { projectedAmount: true, actualCollected: true },
        where: { monthYear: { gte: monthStart, lt: nextMonthStart } },
      }),
      prisma.clientPayment.aggregate({ _sum: { paymentAmount: true } }),
    ]);

    const jobs = await prisma.job.findMany({
      include: {
        jobCosting: true,
        payments: true,
      },
    });

    let totalFees = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    jobs.forEach((job) => {
      const fee = resolveJobFee(job);
      const collected = job.payments.reduce(
        (sum, payment) => sum + Number(payment.paymentAmount || 0),
        0
      );
      const balance = Math.max(0, fee - collected);
      totalFees += fee;
      totalCollected += collected;
      totalOutstanding += balance;
    });

    const collectionRate = totalFees > 0 ? (totalCollected / totalFees) * 100 : 0;
    const projectedMonth = Number(monthProjections._sum.projectedAmount || 0);
    const collectedMonth = Number(monthPayments._sum.paymentAmount || 0);
    const varianceMonth = collectedMonth - projectedMonth;

    const allocations = await prisma.revenueAllocation.aggregate({
      _sum: { allocatedAmount: true, employeeProfit: true, employeeLoss: true },
      where: { allocationMonth: { gte: monthStart, lt: nextMonthStart } },
    });

    const firmProfit =
      Number(allocations._sum.employeeProfit || 0) -
      Number(allocations._sum.employeeLoss || 0);

    const totalHoursAgg = await prisma.timeEntry.aggregate({
      _sum: { hours: true },
      where: { status: 'approved', dateWorked: { gte: monthStart, lt: nextMonthStart } },
    });

    const billableHoursAgg = await prisma.timeEntry.aggregate({
      _sum: { hours: true },
      where: { status: 'approved', billable: true, dateWorked: { gte: monthStart, lt: nextMonthStart } },
    });

    const totalHours = Number(totalHoursAgg._sum.hours || 0);
    const billableHours = Number(billableHoursAgg._sum.hours || 0);
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
      totalCollected: Number(totalPayments._sum.paymentAmount || 0),
      totalOutstanding,
      totalFees,
      collectionRate,
      firmProfit,
      utilizationRate,
      overdueJobs,
      framework: getDashboardModuleCoverageSummary("hr"),
    });
  } catch (error: any) {
    console.error('HR company metrics error:', error);
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
        timeEntries: {
          where: { status: 'approved' },
          select: { hours: true, costAmount: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const jobIds = jobs.map((job) => job.id);

    const [standardRequests, overBudgetRequests] = await Promise.all([
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

    const controls = jobs.reduce(
      (acc, job) => {
        const plannedCost = Number(job.jobCosting?.totalEstimatedCost || 0);
        const plannedHours = Number(
          job.jobCosting?.totalEstimatedHours ??
            job.jobCosting?.budgetCap?.totalAllocatedHours ??
            job.budgetHours ??
            0
        );
        const actualCost = job.timeEntries.reduce((sum, entry) => sum + Number(entry.costAmount || 0), 0);
        const actualHours = job.timeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
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
      const plannedCost = Number(job.jobCosting?.totalEstimatedCost || 0);
      const plannedHours = Number(
        job.jobCosting?.totalEstimatedHours ??
          job.jobCosting?.budgetCap?.totalAllocatedHours ??
          job.budgetHours ??
          0
      );
      const actualCost = job.timeEntries.reduce((sum, entry) => sum + Number(entry.costAmount || 0), 0);
      const actualHours = job.timeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
      const feeCap = Number(
        job.jobCosting?.jobFee || (job.billingType === 'fixed_fee' ? job.fixedFeeAmount : 0) || 0
      );
      return {
        jobId: job.id,
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
    console.error('HR approval controls error:', error);
    return res.status(500).json({ error: 'Failed to load HR approval controls' });
  }
});

export default router;
