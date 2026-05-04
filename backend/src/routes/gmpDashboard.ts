import { Router } from 'express';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resolveRequestAccessRoles } from '../auth/accessRoles';
import { getDashboardModuleCoverageSummary } from '../services/performanceFramework.service';
import JobPerformanceFactsService from '../services/jobPerformanceFacts.service';
import { logger, toLogContext } from '../lib/logger';

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

  const roles = resolveRequestAccessRoles(req);
  const hasGmpAccess = roles.includes('super_admin') || roles.includes('gmp');

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

const resolveJobFee = (job: { fixedFeeAmount?: any; jobCosting?: { jobFee?: any } | null }) =>
  Number(job.jobCosting?.jobFee || job.fixedFeeAmount || 0);

const ACTIVE_JOB_STATUSES = new Set(['planned', 'in_progress', 'on_hold']);
const buildTrackingPath = (jobId: number) => `/jobs/${jobId}/tracking`;

const fullName = (firstName?: string | null, lastName?: string | null) =>
  `${firstName || ''} ${lastName || ''}`.trim();

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const createFactTotals = () => ({
  totalHours: 0,
  billableHours: 0,
  nonBillableHours: 0,
  billableValue: 0,
  billedRevenue: 0,
  collectedRevenue: 0,
  actualCost: 0,
  cashProfit: 0,
});

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
        jobCode: true,
        jobName: true,
        dueDate: true,
        startDate: true,
        completionDate: true,
        readyForCollectionAt: true,
        createdAt: true,
        fixedFeeAmount: true,
        jobCosting: { select: { jobFee: true } },
        clientId: true,
        client: { select: { id: true, clientName: true } },
        departmentId: true,
        partnerProfileId: true,
        managerProfileId: true,
        status: true,
      },
    });

    const projectionsAgg = await prisma.revenueProjection.aggregate({
      _sum: { projectedAmount: true, actualCollected: true },
      where: { status: { in: ['projected', 'revised', 'actualized'] } },
    });

    const firmFacts = await JobPerformanceFactsService.listFacts({}, { type: 'firm' });
    const factByJob = new Map(firmFacts.map((fact) => [fact.jobId, fact]));
    const firmTotals = firmFacts.reduce((acc, fact) => {
      acc.totalHours += fact.totalHours;
      acc.billableHours += fact.billableHours;
      acc.nonBillableHours += fact.nonBillableHours;
      acc.billableValue += fact.billableValue;
      acc.billedRevenue += fact.billedRevenue;
      acc.collectedRevenue += fact.collectedRevenue;
      acc.actualCost += fact.actualCost;
      acc.cashProfit += fact.cashProfit;
      return acc;
    }, createFactTotals());
    const feeBase = firmTotals.billedRevenue > 0 ? firmTotals.billedRevenue : firmTotals.billableValue;

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

    const pendingEvaluationsOver30Days = await prisma.evaluationAssignment.count({
      where: {
        status: { in: ['pending', 'in_progress'] },
        createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    const currentMonthFacts = await JobPerformanceFactsService.listFacts(
      { dateFrom: evaluationsMonthStart },
      { type: 'firm' }
    );
    const totalHours = currentMonthFacts.reduce((sum, fact) => sum + fact.totalHours, 0);
    const billableHours = currentMonthFacts.reduce((sum, fact) => sum + fact.billableHours, 0);
    const utilizationRate = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    const latestPerformanceScores = await prisma.performanceScore.findMany({
      distinct: ['employeeProfileId'],
      orderBy: [{ employeeProfileId: 'asc' }, { calculatedAt: 'desc' }],
      select: { employeeProfileId: true, totalScore: true },
    });

    const latestScoreByProfileId = new Map<number, number>();
    latestPerformanceScores.forEach((score) => {
      latestScoreByProfileId.set(score.employeeProfileId, Number(score.totalScore || 0));
    });

    const departments = await prisma.department.findMany({
      include: {
        profiles: {
          where: { status: 'active' },
          select: { id: true, isPartner: true, positionTitle: true },
        },
        jobs: {
          select: {
            id: true,
            status: true,
            fixedFeeAmount: true,
            jobCosting: { select: { jobFee: true } },
          },
        },
      },
    });

    const departmentFactTotals = new Map<number, ReturnType<typeof createFactTotals>>();
    firmFacts.forEach((fact) => {
      if (!fact.departmentId) return;
      const totals = departmentFactTotals.get(fact.departmentId) || createFactTotals();
      totals.totalHours += fact.totalHours;
      totals.billableHours += fact.billableHours;
      totals.nonBillableHours += fact.nonBillableHours;
      totals.billableValue += fact.billableValue;
      totals.billedRevenue += fact.billedRevenue;
      totals.collectedRevenue += fact.collectedRevenue;
      totals.actualCost += fact.actualCost;
      totals.cashProfit += fact.cashProfit;
      departmentFactTotals.set(fact.departmentId, totals);
    });

    const departmentBreakdown = departments.map((dept) => {
      const totals = departmentFactTotals.get(dept.id) || createFactTotals();
      const revenue = totals.collectedRevenue;
      const fees = totals.billedRevenue > 0 ? totals.billedRevenue : totals.billableValue;
      const activeJobsCount = dept.jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
      const collectionRate = fees > 0 ? (revenue / fees) * 100 : 0;
      const employeeCount = dept.profiles.length;
      const partnerCount = dept.profiles.filter((profile) => profile.isPartner).length;
      const managerCount = dept.profiles.filter((profile) => {
        const title = profile.positionTitle?.toLowerCase() || '';
        return title.includes('manager') && !profile.isPartner;
      }).length;
      const performanceValues = dept.profiles
        .map((profile) => latestScoreByProfileId.get(profile.id))
        .filter((score): score is number => typeof score === 'number');
      const avgDepartmentPerformance =
        performanceValues.length > 0 ? average(performanceValues) : null;

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        departmentCode: dept.departmentCode,
        employeeCount,
        partnerCount,
        managerCount,
        departmentRevenue: revenue,
        departmentFees: fees,
        departmentProfit: totals.cashProfit,
        billableValue: totals.billableValue,
        billedRevenue: totals.billedRevenue,
        collectedRevenue: totals.collectedRevenue,
        actualCost: totals.actualCost,
        collectionRate,
        activeJobs: activeJobsCount,
        jobsCount: dept.jobs.length,
        avgDepartmentPerformance,
      };
    });

    const partners = await prisma.profile.findMany({
      where: { isPartner: true, status: 'active' },
      include: {
        department: true,
        directReports: { select: { id: true } },
        jobsAsPartner: {
          select: {
            id: true,
            status: true,
            fixedFeeAmount: true,
            jobCosting: { select: { jobFee: true } },
            clientId: true,
          },
        },
      },
    });

    const partnerFactTotals = new Map<number, ReturnType<typeof createFactTotals>>();
    firmFacts.forEach((fact) => {
      if (!fact.partnerProfileId) return;
      const totals = partnerFactTotals.get(fact.partnerProfileId) || createFactTotals();
      totals.totalHours += fact.totalHours;
      totals.billableHours += fact.billableHours;
      totals.nonBillableHours += fact.nonBillableHours;
      totals.billableValue += fact.billableValue;
      totals.billedRevenue += fact.billedRevenue;
      totals.collectedRevenue += fact.collectedRevenue;
      totals.actualCost += fact.actualCost;
      totals.cashProfit += fact.cashProfit;
      partnerFactTotals.set(fact.partnerProfileId, totals);
    });

    const partnerRankings = partners.map((partner) => {
      const jobsAsPartner = partner.jobsAsPartner || [];
      const totals = partnerFactTotals.get(partner.id) || createFactTotals();
      const revenue = totals.collectedRevenue;
      const fees = totals.billedRevenue > 0 ? totals.billedRevenue : totals.billableValue;
      const activeJobCount = jobsAsPartner.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
      const clientCount = new Set(jobsAsPartner.map((job) => job.clientId).filter(Boolean)).size;
      const directReportIds = partner.directReports.map((profile) => profile.id);
      const directReportScores = directReportIds
        .map((profileId) => latestScoreByProfileId.get(profileId))
        .filter((score): score is number => typeof score === 'number');
      const avgTeamScore = directReportScores.length > 0 ? average(directReportScores) : 0;
      const collectionRate = fees > 0 ? (revenue / fees) * 100 : 0;

      return {
        partner_id: partner.id,
        name: `${partner.firstName} ${partner.lastName}`,
        department: partner.department?.name || '',
        position: partner.positionTitle || 'Partner',
        portfolio_revenue: revenue,
        portfolio_fees: fees,
        portfolio_profit: totals.cashProfit,
        billable_value: totals.billableValue,
        billed_revenue: totals.billedRevenue,
        collected_revenue: totals.collectedRevenue,
        actual_cost: totals.actualCost,
        collection_rate: collectionRate,
        utilization_rate: totals.totalHours > 0 ? (totals.billableHours / totals.totalHours) * 100 : 0,
        active_jobs: activeJobCount,
        direct_reports: directReportIds.length,
        client_count: clientCount,
        avg_team_score: avgTeamScore,
      };
    });

    const managers = await prisma.profile.findMany({
      where: {
        status: 'active',
        OR: [
          { positionTitle: { contains: 'manager', mode: 'insensitive' } },
          { jobsAsManager: { some: {} } },
        ],
      },
      include: {
        department: true,
        manager: { select: { firstName: true, lastName: true } },
        directReports: { select: { id: true } },
        jobsAsManager: {
          select: {
            id: true,
            status: true,
            fixedFeeAmount: true,
            jobCosting: { select: { jobFee: true } },
          },
        },
      },
    });

    const managerFactTotals = new Map<number, ReturnType<typeof createFactTotals>>();
    firmFacts.forEach((fact) => {
      if (!fact.managerProfileId) return;
      const totals = managerFactTotals.get(fact.managerProfileId) || createFactTotals();
      totals.totalHours += fact.totalHours;
      totals.billableHours += fact.billableHours;
      totals.nonBillableHours += fact.nonBillableHours;
      totals.billableValue += fact.billableValue;
      totals.billedRevenue += fact.billedRevenue;
      totals.collectedRevenue += fact.collectedRevenue;
      totals.actualCost += fact.actualCost;
      totals.cashProfit += fact.cashProfit;
      managerFactTotals.set(fact.managerProfileId, totals);
    });

    const managerEvaluationCounts =
      managers.length > 0
        ? await prisma.evaluationAssignment.groupBy({
            by: ['evaluatorProfileId'],
            _count: { _all: true },
            where: {
              evaluatorProfileId: { in: managers.map((manager) => manager.id) },
              createdAt: { gte: evaluationsMonthStart },
            },
          })
        : [];

    const managerEvaluationCountMap = new Map<number, number>();
    managerEvaluationCounts.forEach((row) => {
      managerEvaluationCountMap.set(row.evaluatorProfileId, row._count._all);
    });

    const managerRankings = managers
      .map((manager) => {
        const managedJobs = manager.jobsAsManager || [];
        const totals = managerFactTotals.get(manager.id) || createFactTotals();
        const portfolioRevenue = totals.collectedRevenue;
        const portfolioFees = totals.billedRevenue > 0 ? totals.billedRevenue : totals.billableValue;
        const portfolioProfit = totals.cashProfit;
        const jobsManaged = managedJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
        const teamTotalHours = totals.totalHours;
        const teamBillableHours = totals.billableHours;
        const utilizationRateForManager =
          teamTotalHours > 0 ? (teamBillableHours / teamTotalHours) * 100 : 0;
        const directReportScores = manager.directReports
          .map((profile) => latestScoreByProfileId.get(profile.id))
          .filter((score): score is number => typeof score === 'number');

        return {
          managerId: manager.id,
          name: fullName(manager.firstName, manager.lastName),
          department: manager.department?.name || '',
          position: manager.positionTitle || 'Manager',
          reportsTo: manager.manager ? fullName(manager.manager.firstName, manager.manager.lastName) : '',
          teamSize: manager.directReports.length,
          teamTotalHours: teamTotalHours,
          evaluationCount: managerEvaluationCountMap.get(manager.id) || 0,
          avgPerformance: directReportScores.length > 0 ? average(directReportScores) : 0,
          jobsManaged: jobsManaged,
          portfolioRevenue: portfolioRevenue,
          portfolioFees: portfolioFees,
          portfolioProfit: portfolioProfit,
          billableValue: totals.billableValue,
          billedRevenue: totals.billedRevenue,
          collectedRevenue: totals.collectedRevenue,
          actualCost: totals.actualCost,
          collectionRate: portfolioFees > 0 ? (portfolioRevenue / portfolioFees) * 100 : 0,
          utilizationRate: utilizationRateForManager,
        };
      })
      .sort((a, b) => b.portfolioRevenue - a.portfolioRevenue);

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

    const clientProjectionAgg = await prisma.revenueProjection.groupBy({
      by: ['clientId'],
      _sum: { projectedAmount: true, actualCollected: true },
      where: {
        clientId: { not: null },
        status: { in: ['projected', 'revised', 'actualized'] },
      },
    });

    const clientProjectionMap = new Map<number, { projectedAmount: number; actualCollected: number }>();
    clientProjectionAgg.forEach((row) => {
      if (!row.clientId) return;
      clientProjectionMap.set(row.clientId, {
        projectedAmount: Number(row._sum.projectedAmount || 0),
        actualCollected: Number(row._sum.actualCollected || 0),
      });
    });

    const clientRollups = new Map<
      number,
      {
        client_id: number;
        client_name: string;
        total_collected: number;
        total_fees: number;
        outstanding_amount: number;
        active_jobs: number;
      }
    >();

    jobs.forEach((job) => {
      if (!job.clientId) return;
      const existing = clientRollups.get(job.clientId) || {
        client_id: job.clientId,
        client_name: job.client?.clientName || `Client #${job.clientId}`,
        total_collected: 0,
        total_fees: 0,
        outstanding_amount: 0,
        active_jobs: 0,
      };

      const fact = factByJob.get(job.id);
      const feeAmount = fact
        ? fact.billedRevenue > 0
          ? fact.billedRevenue
          : fact.billableValue
        : resolveJobFee(job);
      const collectedAmount = fact?.collectedRevenue ?? 0;
      const outstandingAmount = Math.max(0, feeAmount - collectedAmount);

      existing.total_fees += feeAmount;
      existing.total_collected += collectedAmount;
      existing.outstanding_amount += outstandingAmount;
      if (ACTIVE_JOB_STATUSES.has(job.status)) {
        existing.active_jobs += 1;
      }

      clientRollups.set(job.clientId, existing);
    });

    const topClients = Array.from(clientRollups.values())
      .map((client) => {
        const projection = clientProjectionMap.get(client.client_id);
        const projectedAmount = projection?.projectedAmount || 0;
        return {
          ...client,
          collection_rate: client.total_fees > 0 ? (client.total_collected / client.total_fees) * 100 : 0,
          projected_amount: projectedAmount,
          projection_collected: projection?.actualCollected || 0,
          variance: client.total_collected - projectedAmount,
        };
      })
      .sort((a, b) => b.total_collected - a.total_collected)
      .slice(0, 10);

    const atRiskJobs = jobs.filter((job) => {
      const isOverdue =
        !!job.dueDate &&
        job.dueDate < new Date() &&
        !['completed', 'cancelled'].includes(job.status);
      return isOverdue || job.status === 'on_hold';
    });

    const atRiskExposure = atRiskJobs.reduce((sum, job) => {
      const fact = factByJob.get(job.id);
      const feeAmount = fact
        ? fact.billedRevenue > 0
          ? fact.billedRevenue
          : fact.billableValue
        : resolveJobFee(job);
      const collectedAmount = fact?.collectedRevenue ?? 0;
      const outstandingAmount = Math.max(0, feeAmount - collectedAmount);
      return sum + (outstandingAmount > 0 ? outstandingAmount : feeAmount);
    }, 0);

    const overdueJobsCount = atRiskJobs.filter((job) => {
      return !!job.dueDate && job.dueDate < new Date() && !['completed', 'cancelled'].includes(job.status);
    }).length;

    return res.json({
      firmMetrics: {
        total_employees: totalEmployees,
        total_partners: totalPartners,
        total_managers: totalManagers,
        total_revenue: firmTotals.collectedRevenue,
        total_fees: feeBase,
        billable_value: firmTotals.billableValue,
        billed_revenue: firmTotals.billedRevenue,
        collected_revenue: firmTotals.collectedRevenue,
        actual_cost: firmTotals.actualCost,
        active_jobs: activeJobs,
        active_clients: activeClients,
        total_departments: totalDepartments,
        evaluations_this_month: evaluationsThisMonth,
        utilization_rate: utilizationRate,
        total_hours: firmTotals.totalHours,
        billable_hours: firmTotals.billableHours,
        non_billable_hours: firmTotals.nonBillableHours,
      },
      financials: {
        totalRevenue: firmTotals.collectedRevenue,
        totalProfit: firmTotals.cashProfit,
        totalCost: firmTotals.actualCost,
        billableValue: firmTotals.billableValue,
        billedRevenue: firmTotals.billedRevenue,
        collectedRevenue: firmTotals.collectedRevenue,
        cashProfit: firmTotals.cashProfit,
        projectedRevenue: Number(projectionsAgg._sum.projectedAmount || 0),
        collectedAmount: Number(projectionsAgg._sum.actualCollected || firmTotals.collectedRevenue || 0),
        collectionRate:
          feeBase > 0 ? (firmTotals.collectedRevenue / feeBase) * 100 : 0,
        outstanding: firmTotals.billedRevenue - firmTotals.collectedRevenue,
        totalHours: firmTotals.totalHours,
        billableHours: firmTotals.billableHours,
        nonBillableHours: firmTotals.nonBillableHours,
      },
      jobStatus,
      departmentBreakdown,
      partnerRankings,
      managerRankings,
      topClients,
      riskSummary: {
        atRiskJobs: atRiskJobs.length,
        atRiskExposure,
        overdueJobs: overdueJobsCount,
        onHoldJobs: atRiskJobs.filter((job) => job.status === 'on_hold').length,
      },
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
        pendingEvaluationsOver30Days,
        atRiskJobs: atRiskJobs.length,
        atRiskExposure,
      },
      framework: getDashboardModuleCoverageSummary("gmp"),
    });
  } catch (error) {
    logger.error('gmp_dashboard_overview_error', toLogContext(error));
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
            jobCosting: { select: { jobFee: true } },
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
    const totalFees = partnerJobs.reduce((sum, job) => sum + resolveJobFee(job), 0);

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
        trackingPath: buildTrackingPath(job.id),
        jobNumber: job.jobCode,
        clientName: job.client?.clientName,
        status: job.status,
        amountCollected: paymentsByJob.get(job.id) || 0,
        fees: resolveJobFee(job),
        teamSize: job.staffing.length,
        startDate: job.startDate,
        deadlineDate: job.dueDate,
      })),
      team: teamUtilization,
    });
  } catch (error) {
    logger.error('gmp_dashboard_partner_error', toLogContext(error));
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
        jobCosting: { select: { jobFee: true } },
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
    const personalFees = personalJobs.reduce((sum, job) => sum + resolveJobFee(job), 0);
    const activePersonalJobs = personalJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));

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
        activeJobs: activePersonalJobs.length,
        totalJobs: personalJobs.length,
        totalRevenue: personalRevenue,
        totalFees: personalFees,
        directReports: directReports.length,
        overallScore: personalPerformance?.totalScore ?? null,
      },
      jobs: personalJobs.map((job) => ({
        id: job.id,
        trackingPath: buildTrackingPath(job.id),
        jobNumber: job.jobCode,
        clientName: job.client?.clientName,
        status: job.status,
        amountCollected: paymentsByJob.get(job.id) || 0,
        fees: resolveJobFee(job),
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
    logger.error('gmp_dashboard_personal_error', toLogContext(error));
    return res.status(500).json({ error: 'Failed to load personal portfolio' });
  }
});

// GET /gmp-dashboard/alerts
router.get('/alerts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const context = await resolveGmpContext(req, res);
    if (!context) return;

    const now = new Date();
    const jobsAtRisk = await prisma.job.findMany({
      where: {
        OR: [
          { status: 'on_hold' },
          { dueDate: { lt: now }, status: { notIn: ['completed', 'cancelled'] } },
        ],
      },
      include: {
        client: true,
        partner: true,
        manager: true,
        jobCosting: { select: { jobFee: true } },
        payments: { select: { paymentAmount: true, paymentDate: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 25,
    });

    const pendingEvaluations = await prisma.evaluationAssignment.findMany({
      where: {
        status: { in: ['pending', 'in_progress'] },
        createdAt: {
          lt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
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
      orderBy: { createdAt: 'asc' },
      take: 25,
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const partners = await prisma.profile.findMany({
      where: { isPartner: true, status: 'active' },
      include: {
        timeEntries: {
          where: { dateWorked: { gte: monthStart } },
          select: { hours: true, billable: true },
        },
        jobsAsPartner: { select: { status: true } },
      },
    });

    const lowUtilizationPartners = partners
      .map((partner) => {
        const totalHours = partner.timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
        const billableHours = partner.timeEntries.reduce(
          (sum, entry) => sum + (entry.billable ? Number(entry.hours) : 0),
          0
        );
        const utilizationRate = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;
        const activeJobs = partner.jobsAsPartner.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
        return {
          id: partner.id,
          name: `${partner.firstName} ${partner.lastName}`,
          position: partner.positionTitle,
          monthlyHours: totalHours,
          billableHours,
          utilizationRate,
          activeJobs,
        };
      })
      .filter((partner) => partner.monthlyHours < 100 || partner.utilizationRate < 55)
      .sort((a, b) => a.utilizationRate - b.utilizationRate || a.monthlyHours - b.monthlyHours)
      .slice(0, 10);

    return res.json({
      jobsAtRisk: jobsAtRisk.map((job) => ({
        id: job.id,
        trackingPath: buildTrackingPath(job.id),
        jobNumber: job.jobCode,
        jobName: job.jobName,
        clientName: job.client?.clientName,
        status: job.status,
        deadlineDate: job.dueDate,
        daysOverdue:
          job.dueDate && job.dueDate < now
            ? Math.floor((now.getTime() - job.dueDate.getTime()) / (24 * 60 * 60 * 1000))
            : 0,
        partnerName: job.partner ? `${job.partner.firstName} ${job.partner.lastName}` : null,
        managerName: job.manager ? `${job.manager.firstName} ${job.manager.lastName}` : null,
        feeAmount: resolveJobFee(job),
        amountCollected: job.payments.reduce((sum, payment) => sum + Number(payment.paymentAmount || 0), 0),
        outstandingAmount: Math.max(
          0,
          resolveJobFee(job) -
            job.payments.reduce((sum, payment) => sum + Number(payment.paymentAmount || 0), 0)
        ),
        severity:
          job.dueDate && job.dueDate < now
            ? Math.floor((now.getTime() - job.dueDate.getTime()) / (24 * 60 * 60 * 1000)) > 14
              ? 'high'
              : 'medium'
            : 'medium',
      })),
      pendingEvaluations: pendingEvaluations.map((evaluation) => ({
        id: evaluation.id,
        employeeName: `${evaluation.evaluatee.firstName} ${evaluation.evaluatee.lastName}`,
        employeePosition: evaluation.evaluatee.positionTitle,
        managerName: evaluation.evaluatee.manager
          ? `${evaluation.evaluatee.manager.firstName} ${evaluation.evaluatee.manager.lastName}`
          : null,
        status: evaluation.status,
        daysPending: Math.floor((Date.now() - evaluation.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      })),
      lowUtilizationPartners,
    });
  } catch (error) {
    logger.error('gmp_dashboard_alerts_error', toLogContext(error));
    return res.status(500).json({ error: 'Failed to load alerts' });
  }
});

export default router;
