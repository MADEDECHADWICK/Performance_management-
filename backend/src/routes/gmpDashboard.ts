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

    const totalManagers = await prisma.profile.count({
      where: {
        status: 'active',
        positionTitle: { contains: 'manager', mode: 'insensitive' },
      },
    });

    const activeJobs = await prisma.job.count({
      where: { status: { in: ['planned', 'in_progress', 'on_hold'] } },
    });

    const activeClients = await prisma.client.count({ where: { status: 'active' } });

    const jobs = await prisma.job.findMany({
      select: {
        id: true,
        fixedFeeAmount: true,
        clientId: true,
        departmentId: true,
        partnerProfileId: true,
        managerProfileId: true,
        status: true,
        payments: { select: { paymentAmount: true } },
      },
    });

    const paymentsAgg = await prisma.clientPayment.aggregate({
      _sum: { paymentAmount: true },
    });

    const projectionsAgg = await prisma.revenueProjection.aggregate({
      _sum: { projectedAmount: true, actualCollected: true },
      where: { status: { in: ['projected', 'revised', 'actualized'] } },
    });

    const [{ exists: hasCompanySummary }] = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`SELECT to_regclass('company_financial_summary') IS NOT NULL AS exists`;

    const companyTotals = hasCompanySummary
      ? ((await prisma.$queryRaw<any[]>`
          SELECT * FROM company_financial_summary
        `) || [])[0] || {}
      : (() => {
          return {
            company_total_profit: 0,
            company_total_cost: 0,
            company_collection_rate: 0,
          };
        })();

    if (!hasCompanySummary) {
      const [costAgg, profitAgg] = await Promise.all([
        prisma.timeEntry.aggregate({ _sum: { costAmount: true } }),
        prisma.timeEntry.aggregate({ _sum: { profitLoss: true } }),
      ]);
      const totalRevenue = Number(paymentsAgg._sum.paymentAmount || 0);
      const projectedRevenue = Number(projectionsAgg._sum.projectedAmount || 0);

      companyTotals.company_total_cost = Number(costAgg._sum.costAmount || 0);
      companyTotals.company_total_profit = Number(profitAgg._sum.profitLoss || 0);
      companyTotals.company_collection_rate =
        projectedRevenue > 0 ? (totalRevenue / projectedRevenue) * 100 : 0;
    }

    const jobStatusCounts = await prisma.job.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const jobStatus = jobStatusCounts.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    const evaluationsMonthStart = new Date();
    evaluationsMonthStart.setDate(1);
    evaluationsMonthStart.setHours(0, 0, 0, 0);

    const evaluationsThisMonth = await prisma.evaluationAssignment.count({
      where: { createdAt: { gte: evaluationsMonthStart } },
    });

    const hoursTotal = await prisma.timeEntry.aggregate({
      _sum: { hours: true },
      where: { dateWorked: { gte: evaluationsMonthStart } },
    });
    const hoursBillable = await prisma.timeEntry.aggregate({
      _sum: { hours: true },
      where: { dateWorked: { gte: evaluationsMonthStart }, billable: true },
    });
    const totalHours = Number(hoursTotal._sum.hours || 0);
    const billableHours = Number(hoursBillable._sum.hours || 0);
    const utilizationRate = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    const departments = await prisma.department.findMany({
      include: {
        profiles: { select: { id: true, isPartner: true, positionTitle: true } },
        jobs: {
          select: {
            id: true,
            fixedFeeAmount: true,
            payments: { select: { paymentAmount: true } },
          },
        },
      },
    });

    const departmentBreakdown = departments.map((dept) => {
      const revenue = dept.jobs.reduce((sum, job) => {
        const jobPayments = job.payments.reduce((acc, payment) => acc + Number(payment.paymentAmount || 0), 0);
        return sum + jobPayments;
      }, 0);
      const fees = dept.jobs.reduce((sum, job) => sum + Number(job.fixedFeeAmount || 0), 0);
      const employeeCount = dept.profiles.length;
      const partnerCount = dept.profiles.filter((profile) => profile.isPartner).length;
      const managerCount = dept.profiles.filter((profile) => {
        const title = profile.positionTitle?.toLowerCase() || '';
        return title.includes('manager') && !profile.isPartner;
      }).length;

      return {
        department_id: dept.id,
        department_name: dept.name,
        department_code: dept.departmentCode,
        employee_count: employeeCount,
        partner_count: partnerCount,
        manager_count: managerCount,
        department_revenue: revenue,
        department_fees: fees,
        jobs_count: dept.jobs.length,
        avg_department_performance: null,
      };
    });

    const partners = await prisma.profile.findMany({
      where: { isPartner: true, status: 'active' },
      include: {
        department: true,
        jobsAsPartner: {
          select: {
            id: true,
            status: true,
            fixedFeeAmount: true,
            clientId: true,
            payments: { select: { paymentAmount: true } },
          },
        },
      },
    });

    const partnerRankings = partners.map((partner) => {
      const jobsAsPartner = partner.jobsAsPartner || [];
      const revenue = jobsAsPartner.reduce((sum, job) => {
        const paid = job.payments.reduce((acc, payment) => acc + Number(payment.paymentAmount || 0), 0);
        return sum + paid;
      }, 0);
      const fees = jobsAsPartner.reduce((sum, job) => sum + Number(job.fixedFeeAmount || 0), 0);
      const activeJobCount = jobsAsPartner.filter((job) => ['planned', 'in_progress', 'on_hold'].includes(job.status)).length;
      const clientCount = new Set(jobsAsPartner.map((job) => job.clientId).filter(Boolean)).size;

      return {
        partner_id: partner.id,
        name: `${partner.firstName} ${partner.lastName}`,
        department: partner.department?.name || '',
        position: partner.positionTitle || 'Partner',
        portfolio_revenue: revenue,
        portfolio_fees: fees,
        portfolio_profit: 0,
        active_jobs: activeJobCount,
        direct_reports: 0,
        client_count: clientCount,
        avg_team_score: 0,
      };
    });

    const partnerJobIds = partnerRankings.flatMap((partner) => {
      const target = partners.find((p) => p.id === partner.partner_id);
      return target?.jobsAsPartner?.map((job) => job.id) || [];
    });

    const jobProfitability = await prisma.timeEntry.groupBy({
      by: ['jobId'],
      _sum: { profitLoss: true },
      where: { jobId: { in: partnerJobIds } },
    });

    const profitByJob = new Map<number, number>();
    jobProfitability.forEach((item) => {
      if (!item.jobId) return;
      profitByJob.set(item.jobId, Number(item._sum.profitLoss || 0));
    });

    partnerRankings.forEach((partner) => {
      const target = partners.find((p) => p.id === partner.partner_id);
      const jobsAsPartner = target?.jobsAsPartner || [];
      const profit = jobsAsPartner.reduce((sum, job) => {
        return sum + (profitByJob.get(job.id) || 0);
      }, 0);
      partner.portfolio_profit = profit;
    });

    const revenueTrend = await prisma.$queryRaw<
      Array<{ month: Date; collected: number }>
    >`
      SELECT date_trunc('month', payment_date) as month,
             COALESCE(SUM(payment_amount), 0) as collected
      FROM client_payments
      WHERE payment_date >= date_trunc('month', CURRENT_DATE) - interval '5 months'
      GROUP BY month
      ORDER BY month
    `;

    const projectionTrend = await prisma.revenueProjection.groupBy({
      by: ['monthYear'],
      _sum: { projectedAmount: true, actualCollected: true },
      where: {
        monthYear: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1),
        },
      },
      orderBy: { monthYear: 'asc' },
    });

    const engagementsApprovedNotStarted = await prisma.clientOnboarding.count({
      where: {
        status: { in: ['approved', 'client_created'] },
        jobId: null,
      },
    });

    const pendingOverBudget = await prisma.timeOverBudgetRequest.count({
      where: { status: 'pending' },
    });

    return res.json({
      firmMetrics: {
        total_employees: totalEmployees,
        total_partners: totalPartners,
        total_managers: totalManagers,
        total_revenue: Number(paymentsAgg._sum.paymentAmount || 0),
        total_fees: jobs.reduce((sum, job) => sum + Number(job.fixedFeeAmount || 0), 0),
        active_jobs: activeJobs,
        active_clients: activeClients,
        total_departments: totalDepartments,
        evaluations_this_month: evaluationsThisMonth,
        utilization_rate: utilizationRate,
      },
      financials: {
        totalRevenue: Number(paymentsAgg._sum.paymentAmount || 0),
        totalProfit: Number(companyTotals.company_total_profit || 0),
        totalCost: Number(companyTotals.company_total_cost || 0),
        projectedRevenue: Number(projectionsAgg._sum.projectedAmount || 0),
        collectedAmount: Number(projectionsAgg._sum.actualCollected || paymentsAgg._sum.paymentAmount || 0),
        collectionRate: Number(companyTotals.company_collection_rate || 0),
      },
      jobStatus,
      departmentBreakdown,
      partnerRankings,
      managerRankings: [],
      revenueTrend: (revenueTrend || []).map((row) => ({
        month: row.month,
        collected: Number(row.collected || 0),
      })),
      projectionTrend: (projectionTrend || []).map((row) => ({
        month: row.monthYear,
        projected: Number(row._sum.projectedAmount || 0),
        collected: Number(row._sum.actualCollected || 0),
      })),
      alertsSummary: {
        engagementsApprovedNotStarted,
        pendingOverBudget,
      },
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
