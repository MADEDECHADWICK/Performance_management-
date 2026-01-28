import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const hrRoles = new Set([
  'hr',
  'hr_manager',
  'admin',
  'super_admin',
  'gmp',
  'group_managing_partner',
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
    });
  } catch (error: any) {
    console.error('HR company metrics error:', error);
    res.status(500).json({ error: 'Failed to load HR company metrics' });
  }
});

export default router;
