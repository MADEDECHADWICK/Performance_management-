import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const financeRoles = new Set([
  'finance',
  'admin',
  'super_admin',
  'hr',
  'hr_manager',
  'gmp',
  'group_managing_partner',
]);

const getFinanceContext = async (req: AuthRequest) => {
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
  const isFinance =
    roleNames.some((role) => financeRoles.has(role)) ||
    positionTitle.includes('finance');

  if (!isFinance) {
    return { error: { status: 403, message: 'Access denied. Finance role required.' } };
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

// GET /finance-dashboard/overview
router.get('/overview', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [monthPayments, totalPayments, monthProjections] = await Promise.all([
      prisma.clientPayment.aggregate({
        _sum: { paymentAmount: true },
        where: { paymentDate: { gte: monthStart, lt: nextMonthStart } },
      }),
      prisma.clientPayment.aggregate({
        _sum: { paymentAmount: true },
      }),
      prisma.revenueProjection.aggregate({
        _sum: { projectedAmount: true, actualCollected: true },
        where: { monthYear: { gte: monthStart, lt: nextMonthStart } },
      }),
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

    res.json({
      month: monthStart.toISOString(),
      projectedMonth,
      collectedMonth,
      varianceMonth,
      totalCollected,
      totalOutstanding,
      totalFees,
      collectionRate,
    });
  } catch (error: any) {
    console.error('Finance overview error:', error);
    res.status(500).json({ error: 'Failed to load finance overview' });
  }
});

// GET /finance-dashboard/collections
router.get('/collections', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const limit = Number(req.query.limit) || 20;
    const payments = await prisma.clientPayment.findMany({
      include: {
        client: { select: { id: true, clientName: true } },
        job: { select: { id: true, jobCode: true, jobName: true } },
      },
      orderBy: { paymentDate: 'desc' },
      take: limit,
    });

    res.json(
      payments.map((payment) => ({
        id: payment.id,
        clientId: payment.clientId,
        clientName: payment.client.clientName,
        jobId: payment.jobId,
        jobCode: payment.job?.jobCode || null,
        jobName: payment.job?.jobName || null,
        paymentAmount: Number(payment.paymentAmount),
        currency: payment.currency,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        referenceNumber: payment.referenceNumber,
        notes: payment.notes,
      }))
    );
  } catch (error: any) {
    console.error('Finance collections error:', error);
    res.status(500).json({ error: 'Failed to load collections' });
  }
});

// POST /finance-dashboard/collections
router.post('/collections', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const {
      clientId,
      jobId,
      paymentAmount,
      currency,
      paymentDate,
      paymentMethod,
      referenceNumber,
      notes,
      invoiceNumber,
    } = req.body;

    if (!clientId || !paymentAmount || !paymentDate) {
      return res.status(400).json({ error: 'clientId, paymentAmount, and paymentDate are required' });
    }

    const payment = await prisma.clientPayment.create({
      data: {
        clientId: Number(clientId),
        jobId: jobId ? Number(jobId) : null,
        paymentAmount,
        currency: currency || 'KES',
        paymentDate: new Date(paymentDate),
        paymentMethod: paymentMethod || null,
        referenceNumber: referenceNumber || null,
        notes: notes || null,
        invoiceNumber: invoiceNumber || null,
        recordedByProfileId: context.user.profile?.id ?? null,
      },
    });

    res.status(201).json(payment);
  } catch (error: any) {
    console.error('Finance collections create error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// GET /finance-dashboard/projections
router.get('/projections', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const projections = await prisma.revenueProjection.findMany({
      include: {
        client: { select: { id: true, clientName: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { monthYear: 'desc' },
      take: 24,
    });

    res.json(
      projections.map((projection) => ({
        id: projection.id,
        monthYear: projection.monthYear,
        projectedAmount: Number(projection.projectedAmount),
        actualCollected: Number(projection.actualCollected),
        variance: Number(projection.variance),
        variancePercent: Number(projection.variancePercent),
        status: projection.status,
        clientId: projection.clientId,
        clientName: projection.client?.clientName ?? null,
        departmentId: projection.departmentId,
        departmentName: projection.department?.name ?? null,
      }))
    );
  } catch (error: any) {
    console.error('Finance projections error:', error);
    res.status(500).json({ error: 'Failed to load projections' });
  }
});

// POST /finance-dashboard/projections
router.post('/projections', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const { clientId, departmentId, monthYear, projectedAmount, currency } = req.body;
    if (!monthYear || !projectedAmount) {
      return res.status(400).json({ error: 'monthYear and projectedAmount are required' });
    }

    const projection = await prisma.revenueProjection.upsert({
      where: {
        clientId_departmentId_monthYear: {
          clientId: clientId ? Number(clientId) : null,
          departmentId: departmentId ? Number(departmentId) : null,
          monthYear: new Date(monthYear),
        },
      },
      update: {
        projectedAmount,
        currency: currency || 'KES',
      },
      create: {
        clientId: clientId ? Number(clientId) : null,
        departmentId: departmentId ? Number(departmentId) : null,
        monthYear: new Date(monthYear),
        projectedAmount,
        currency: currency || 'KES',
        createdByProfileId: context.user.profile?.id ?? null,
      },
    });

    res.status(201).json(projection);
  } catch (error: any) {
    console.error('Finance projections create error:', error);
    res.status(500).json({ error: 'Failed to save projection' });
  }
});

// GET /finance-dashboard/client-balances
router.get('/client-balances', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const clients = await prisma.client.findMany({
      include: {
        jobs: {
          include: {
            jobCosting: true,
            payments: true,
          },
        },
      },
    });

    const balances = clients.map((client) => {
      let totalFee = 0;
      let totalCollected = 0;

      client.jobs.forEach((job) => {
        totalFee += resolveJobFee(job);
        totalCollected += job.payments.reduce(
          (sum, payment) => sum + Number(payment.paymentAmount || 0),
          0
        );
      });

      return {
        clientId: client.id,
        clientName: client.clientName,
        totalFee,
        totalCollected,
        balance: Math.max(0, totalFee - totalCollected),
        jobsCount: client.jobs.length,
      };
    });

    res.json(balances);
  } catch (error: any) {
    console.error('Finance client balances error:', error);
    res.status(500).json({ error: 'Failed to load client balances' });
  }
});

// GET /finance-dashboard/job-profitability
router.get('/job-profitability', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const jobs = await prisma.job.findMany({
      include: {
        client: { select: { clientName: true } },
        jobCosting: true,
        timeEntries: {
          where: { status: 'approved' },
          select: { billableAmount: true, costAmount: true },
        },
        payments: { select: { paymentAmount: true } },
      },
      orderBy: { jobName: 'asc' },
    });

    const profitability = jobs.map((job) => {
      const revenueFromTime = job.timeEntries.reduce(
        (sum, entry) => sum + Number(entry.billableAmount || 0),
        0
      );
      const cost = job.timeEntries.reduce(
        (sum, entry) => sum + Number(entry.costAmount || 0),
        0
      );
      const revenue = job.billingType === 'fixed_fee' && Number(job.fixedFeeAmount || 0) > 0
        ? Number(job.fixedFeeAmount || 0)
        : revenueFromTime;
      const collected = job.payments.reduce(
        (sum, payment) => sum + Number(payment.paymentAmount || 0),
        0
      );

      return {
        jobId: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        clientName: job.client?.clientName ?? 'Unassigned',
        revenue,
        cost,
        profit: revenue - cost,
        margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
        collected,
      };
    });

    res.json(profitability);
  } catch (error: any) {
    console.error('Finance job profitability error:', error);
    res.status(500).json({ error: 'Failed to load job profitability' });
  }
});

// GET /finance-dashboard/revenue-allocations
router.get('/revenue-allocations', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const allocations = await prisma.revenueAllocation.findMany({
      include: {
        job: { select: { jobCode: true, jobName: true } },
        employee: { select: { firstName: true, lastName: true } },
        clientPayment: {
          include: { client: { select: { clientName: true } } },
        },
      },
      orderBy: { calculatedAt: 'desc' },
      take: 50,
    });

    res.json(
      allocations.map((allocation) => ({
        id: allocation.id,
        jobId: allocation.jobId,
        jobCode: allocation.job.jobCode,
        jobName: allocation.job.jobName,
        clientName: allocation.clientPayment.client.clientName,
        employeeName: `${allocation.employee.firstName} ${allocation.employee.lastName}`.trim(),
        allocatedAmount: Number(allocation.allocatedAmount),
        allocationPercentage: Number(allocation.allocationPercentage),
        allocationMonth: allocation.allocationMonth,
        employeeProfit: Number(allocation.employeeProfit),
        employeeLoss: Number(allocation.employeeLoss),
      }))
    );
  } catch (error: any) {
    console.error('Finance revenue allocations error:', error);
    res.status(500).json({ error: 'Failed to load revenue allocations' });
  }
});

export default router;
