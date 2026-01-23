import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

type GMPContext = {
  profile: { id: number; positionTitle?: string | null; isPartner: boolean };
  roles: string[];
};

const resolveGmpContext = async (
  req: AuthRequest,
  res: any
): Promise<GMPContext | null> => {
  const userId = req.user?.userId ? Number(req.user.userId) : undefined;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  if (!user?.profile) {
    res.status(404).json({ error: 'User profile not found' });
    return null;
  }

  const roles = (req.user?.authRoles || []).map((role) => role.toLowerCase());
  const positionTitle = user.profile.positionTitle?.toLowerCase() || '';
  const hasGmpAccess =
    roles.includes('super_admin') ||
    roles.includes('gmp') ||
    positionTitle.includes('group managing partner') ||
    positionTitle.includes('group_managing_partner');

  if (!hasGmpAccess) {
    res.status(403).json({ error: 'Access denied. Group Managing Partner privileges required.' });
    return null;
  }

  return {
    profile: {
      id: user.profile.id,
      positionTitle: user.profile.positionTitle,
      isPartner: user.profile.isPartner,
    },
    roles,
  };
};

const sumPaymentsByJob = async (jobIds: number[]) => {
  if (jobIds.length === 0) return new Map<number, number>();
  const payments = await prisma.clientPayment.findMany({
    where: { jobId: { in: jobIds } },
    select: { jobId: true, paymentAmount: true },
  });

  const totals = new Map<number, number>();
  payments.forEach((payment) => {
    if (!payment.jobId) return;
    const current = totals.get(payment.jobId) || 0;
    totals.set(payment.jobId, current + Number(payment.paymentAmount));
  });
  return totals;
};

// GET /gmp-dashboard/overview
router.get('/overview', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await resolveGmpContext(req, res);
    if (!context) return;

    const [totalEmployees, totalPartners, totalDepartments] = await Promise.all([
      prisma.profile.count({ where: { status: 'active' } }),
      prisma.profile.count({ where: { isPartner: true, status: 'active' } }),
      prisma.department.count(),
    ]);

    const activeJobs = await prisma.job.count({
      where: { status: { in: ['planned', 'in_progress', 'on_hold'] } },
    });

    const paymentsAgg = await prisma.clientPayment.aggregate({
      _sum: { paymentAmount: true },
    });

    const projectionsAgg = await prisma.revenueProjection.aggregate({
      _sum: { projectedAmount: true, actualCollected: true },
      where: { status: { in: ['projected', 'revised', 'actualized'] } },
    });

    const jobStatusCounts = await prisma.job.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const jobStatus = jobStatusCounts.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return res.json({
      firmMetrics: {
        totalEmployees,
        activeJobs,
        totalPartners,
        totalDepartments,
      },
      financials: {
        totalRevenue: Number(paymentsAgg._sum.paymentAmount || 0),
        totalProfit: 0,
        projectedRevenue: Number(projectionsAgg._sum.projectedAmount || 0),
        collectedAmount: Number(projectionsAgg._sum.actualCollected || paymentsAgg._sum.paymentAmount || 0),
      },
      jobStatus,
      departmentBreakdown: [],
      partnerRankings: [],
      managerRankings: [],
    });
  } catch (error) {
    console.error('[GMP Dashboard] Error fetching GMP dashboard data:', error);
    return res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// GET /gmp-dashboard/partner/:partnerId
router.get('/partner/:partnerId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await resolveGmpContext(req, res);
    if (!context) return;

    const partnerId = Number(req.params.partnerId);
    if (!partnerId) return res.status(400).json({ error: 'Invalid partnerId' });

    const partnerDetail = await prisma.profile.findUnique({
      where: { id: partnerId },
      include: {
        department: true,
        jobsAsPartner: {
          include: {
            client: true,
            staffing: {
              include: {
                employee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    positionTitle: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!partnerDetail) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const partnerJobs = partnerDetail.jobsAsPartner || [];
    const jobIds = partnerJobs.map((job) => job.id);
    const paymentsByJob = await sumPaymentsByJob(jobIds);

    const totalRevenue = Array.from(paymentsByJob.values()).reduce((sum, value) => sum + value, 0);
    const totalFees = partnerJobs.reduce((sum, job) => sum + Number(job.fixedFeeAmount || 0), 0);

    const teamMembers = await prisma.profile.findMany({
      where: { managerId: partnerId },
      include: {
        department: true,
        performanceScores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
    });

    const teamUtilization = teamMembers.map((member) => {
      const latestScore = member.performanceScores[0];
      return {
        memberId: member.id,
        name: `${member.firstName} ${member.lastName}`,
        position: member.positionTitle,
        performanceScore: latestScore?.totalScore ?? null,
      };
    });

    return res.json({
      partner: {
        id: partnerDetail.id,
        name: `${partnerDetail.firstName} ${partnerDetail.lastName}`,
        position: partnerDetail.positionTitle,
        department: partnerDetail.department?.name,
      },
      financials: {
        totalRevenue,
        totalFees,
        activeJobsCount: partnerJobs.length,
        averageJobValue: partnerJobs.length > 0 ? totalRevenue / partnerJobs.length : 0,
      },
      jobs: partnerJobs.map((job) => ({
        id: job.id,
        jobNumber: job.jobCode,
        clientName: job.client?.clientName,
        status: job.status,
        amountCollected: paymentsByJob.get(job.id) || 0,
        fees: Number(job.fixedFeeAmount || 0),
        teamSize: job.staffing.length,
        startDate: job.startDate,
        deadlineDate: job.dueDate,
      })),
      team: teamUtilization,
    });
  } catch (error) {
    console.error('Error fetching partner details:', error);
    return res.status(500).json({ error: 'Failed to load partner details' });
  }
});

// GET /gmp-dashboard/personal
router.get('/personal', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await resolveGmpContext(req, res);
    if (!context) return;

    const profileId = context.profile.id;

    const personalJobs = await prisma.job.findMany({
      where: {
        OR: [{ partnerProfileId: profileId }, { managerProfileId: profileId }],
      },
      include: {
        client: true,
        staffing: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                positionTitle: true,
              },
            },
          },
        },
      },
    });

    const jobIds = personalJobs.map((job) => job.id);
    const paymentsByJob = await sumPaymentsByJob(jobIds);
    const personalRevenue = Array.from(paymentsByJob.values()).reduce((sum, value) => sum + value, 0);
    const personalFees = personalJobs.reduce((sum, job) => sum + Number(job.fixedFeeAmount || 0), 0);

    const directReports = await prisma.profile.findMany({
      where: { managerId: profileId },
      include: {
        department: true,
        performanceScores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
    });

    const personalPerformance = await prisma.performanceScore.findFirst({
      where: { employeeProfileId: profileId },
      orderBy: { calculatedAt: 'desc' },
    });

    return res.json({
      personalMetrics: {
        activeJobs: personalJobs.length,
        totalRevenue: personalRevenue,
        totalFees: personalFees,
        directReports: directReports.length,
        overallScore: personalPerformance?.totalScore ?? null,
      },
      jobs: personalJobs.map((job) => ({
        id: job.id,
        jobNumber: job.jobCode,
        clientName: job.client?.clientName,
        status: job.status,
        amountCollected: paymentsByJob.get(job.id) || 0,
        fees: Number(job.fixedFeeAmount || 0),
        teamSize: job.staffing.length,
        role: job.partnerProfileId === profileId ? 'Partner' : 'Manager',
      })),
      directReports: directReports.map((report) => ({
        id: report.id,
        name: `${report.firstName} ${report.lastName}`,
        position: report.positionTitle,
        department: report.department?.name,
        latestPerformance: report.performanceScores[0]?.totalScore ?? null,
      })),
    });
  } catch (error) {
    console.error('Error fetching GMP personal data:', error);
    return res.status(500).json({ error: 'Failed to load personal portfolio' });
  }
});

// GET /gmp-dashboard/alerts
router.get('/alerts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await resolveGmpContext(req, res);
    if (!context) return;

    const jobsAtRisk = await prisma.job.findMany({
      where: {
        OR: [{ dueDate: { lt: new Date() } }, { status: 'on_hold' }],
      },
      include: {
        client: true,
        partner: true,
        manager: true,
      },
      take: 10,
    });

    const pendingEvaluations = await prisma.evaluationAssignment.findMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        evaluatee: {
          select: {
            firstName: true,
            lastName: true,
            positionTitle: true,
            manager: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      take: 10,
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const partners = await prisma.profile.findMany({
      where: { isPartner: true, status: 'active' },
      include: {
        timeEntries: {
          where: { dateWorked: { gte: monthStart } },
          select: { hours: true },
        },
      },
      take: 10,
    });

    const lowUtilizationPartners = partners
      .map((partner) => {
        const totalHours = partner.timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
        return {
          id: partner.id,
          name: `${partner.firstName} ${partner.lastName}`,
          position: partner.positionTitle,
          monthlyHours: totalHours,
        };
      })
      .filter((partner) => partner.monthlyHours < 100);

    return res.json({
      jobsAtRisk: jobsAtRisk.map((job) => ({
        id: job.id,
        jobNumber: job.jobCode,
        clientName: job.client?.clientName,
        status: job.status,
        deadlineDate: job.dueDate,
        partnerName: job.partner ? `${job.partner.firstName} ${job.partner.lastName}` : null,
        severity: job.dueDate && job.dueDate < new Date() ? 'high' : 'medium',
      })),
      pendingEvaluations: pendingEvaluations.map((evaluation) => ({
        id: evaluation.id,
        employeeName: `${evaluation.evaluatee.firstName} ${evaluation.evaluatee.lastName}`,
        employeePosition: evaluation.evaluatee.positionTitle,
        managerName: evaluation.evaluatee.manager
          ? `${evaluation.evaluatee.manager.firstName} ${evaluation.evaluatee.manager.lastName}`
          : null,
        daysPending: Math.floor((Date.now() - evaluation.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      })),
      lowUtilizationPartners,
    });
  } catch (error) {
    console.error('Error fetching GMP alerts:', error);
    return res.status(500).json({ error: 'Failed to load alerts' });
  }
});

export default router;
